// Cloudflare Worker — Harmoni WA Bot API + Deadline Reminder
// Deploy: cd api && npx wrangler deploy
//
// Env vars (set via: npx wrangler secret put <NAME>):
//   FIREBASE_PROJECT_ID          = harmoni-custom-order
//   FIREBASE_SERVICE_ACCOUNT_KEY = {JSON dari Firebase Console → Service Accounts}
//   FONNTE_API_KEY               = {API key dari fonnte.com}
//   OWNER_WA_NUMBER              = 628xxx
//   API_SECRET_KEY               = {random string, sama dengan yang dikonfigurasi di n8n}
//   NOTIFY_KEY                   = {key berbeda, di-embed di chat.html untuk /notify-cs}
//
// Nomor WA per divisi disimpan di Firestore: settings/division_contacts
//   { bordir: "628xxx", jersey: "628yyy", ... }
// Isi via Firebase Console → Firestore → settings → division_contacts

const VALID_DIVISIONS = [
  'bordir','butik','jersey','jilbab','sablon','konveksi',
  'medali-pin','papan-nama','pin-fiber','sewa-kostum','tailor'
]

const DIVISION_CODES = {
  bordir:'BRD', butik:'BTK', jersey:'JRS', jilbab:'JLB', sablon:'SBL',
  konveksi:'KNV', 'medali-pin':'MPL', 'papan-nama':'PPN', 'pin-fiber':'PFB',
  'sewa-kostum':'SKT', tailor:'TLR'
}

const DIVISION_LABELS = {
  bordir:'Bordir', butik:'Butik', jersey:'Jersey', jilbab:'Jilbab',
  sablon:'Kaos & Sablon', konveksi:'Konveksi', 'medali-pin':'Medali & Pin Logam',
  'papan-nama':'Papan Nama', 'pin-fiber':'Medali & Pin Fiber', 'sewa-kostum':'Sewa Kostum', tailor:'Tailor',
}

const PRODUKSI_UNIT = {
  jersey:'Gaara Apparel', konveksi:'Young Harmonis Konveksi', jilbab:'Young Harmonis Konveksi',
  butik:'Young Harmonis Konveksi', tailor:'Young Harmonis Konveksi', bordir:'Bordir Unit',
  'papan-nama':'Bordir Unit', sablon:'Sablon Unit', 'medali-pin':'Medali & Pin Unit',
  'pin-fiber':'Medali & Pin Unit', 'sewa-kostum':'Sewa Kostum Unit',
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
}

export default {
  // ── HTTP handler ────────────────────────────────────────────────────────────
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }

    const url = new URL(request.url)

    // /notify-cs: pakai NOTIFY_KEY, aman di-embed di halaman publik (chat.html)
    if (request.method === 'POST' && url.pathname === '/notify-cs') {
      return handleNotifyCS(request, env)
    }

    // /incoming-chat: webhook dari n8n/Fonnte, pakai NOTIFY_KEY
    if (request.method === 'POST' && url.pathname === '/incoming-chat') {
      return handleIncomingChat(request, env)
    }

    // /send-chat-reply: dari inbox.html, verifikasi Firebase ID token (tidak perlu API_SECRET_KEY)
    if (request.method === 'POST' && url.pathname === '/send-chat-reply') {
      return handleSendChatReply(request, env)
    }

    // /create-order-from-chat: buat order langsung dari chat inbox
    if (request.method === 'POST' && url.pathname === '/create-order-from-chat') {
      return handleCreateOrderFromChat(request, env)
    }

    // Endpoint lain: wajib API_SECRET_KEY
    const apiKey = request.headers.get('X-API-Key')
    if (apiKey !== env.API_SECRET_KEY) {
      return json({ error: 'Unauthorized' }, 401)
    }

    try {
      const token = await getFirebaseToken(env)

      if (request.method === 'POST' && url.pathname === '/create-order') {
        return handleCreateOrder(request, env, token)
      }
      if (request.method === 'GET' && url.pathname === '/get-order') {
        return handleGetOrder(url, env, token)
      }
      if (request.method === 'GET' && url.pathname === '/knowledge') {
        return handleGetKnowledge(url, env, token)
      }
      if (request.method === 'PATCH' && url.pathname === '/update-status') {
        return handleUpdateStatus(request, env, token)
      }
      // Manual trigger untuk test deadline check tanpa tunggu cron
      if (request.method === 'POST' && url.pathname === '/trigger-deadline-check') {
        await runDeadlineCheck(env, token)
        return json({ success: true, message: 'Deadline check selesai' }, 200)
      }
      return json({ error: 'Endpoint tidak ditemukan' }, 404)
    } catch (err) {
      console.error(err)
      return json({ error: err.message }, 500)
    }
  },

  // ── Cron handler — jalan otomatis setiap hari 08.00 WITA (00:00 UTC) ───────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      getFirebaseToken(env)
        .then(token => runDeadlineCheck(env, token))
        .catch(err => console.error('Deadline check error:', err))
    )
  },
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleCreateOrder(request, env, token) {
  const body = await request.json().catch(() => null)
  if (!body) return json({ error: 'Request body tidak valid (harus JSON)' }, 400)

  const { division, customerName, kontak, dueDate, totalPrice = 0, dp = 0, notes = '', sumberOrder = 'wa_bot', agentSessionId = '' } = body

  if (!division || !VALID_DIVISIONS.includes(division)) {
    return json({ error: `division tidak valid. Pilihan: ${VALID_DIVISIONS.join(', ')}` }, 400)
  }
  if (!customerName?.trim()) return json({ error: 'customerName wajib diisi' }, 400)
  if (!kontak?.trim())       return json({ error: 'kontak wajib diisi' }, 400)
  if (!dueDate)              return json({ error: 'dueDate wajib diisi (format YYYY-MM-DD)' }, 400)

  const projectId = env.FIREBASE_PROJECT_ID
  const orderId   = crypto.randomUUID()
  const chatToken = generateChatToken()
  const now       = new Date().toISOString()
  const today     = now.split('T')[0]

  const orderNumber = await generateOrderNumber(projectId, token, division)

  await firestoreSet(projectId, token, `orders/${orderId}`, {
    orderNumber:          { stringValue: orderNumber },
    division:             { stringValue: division },
    customerName:         { stringValue: customerName.trim() },
    customerContact:      { stringValue: kontak.trim() },
    orderDate:            { stringValue: today },
    dueDate:              { stringValue: dueDate },
    status:               { stringValue: 'pending' },
    progressPercentage:   { integerValue: '0' },
    totalPrice:           { doubleValue: Number(totalPrice) },
    depositPaid:          { doubleValue: Number(dp) },
    notes:                { stringValue: notes },
    designFiles:          { arrayValue: { values: [] } },
    chatToken:            { stringValue: chatToken },
    sumberOrder:          { stringValue: sumberOrder },
    agentSessionId:       { stringValue: agentSessionId },
    priceApprovalStatus:  { stringValue: 'approved' },
    priceApprovalTier:    { nullValue: null },
    priceApprovalReason:  { stringValue: '' },
    priceApprovalBy:      { nullValue: null },
    priceApprovalAt:      { nullValue: null },
    createdBy:            { stringValue: 'wa_bot' },
    createdAt:            { timestampValue: now },
    updatedAt:            { timestampValue: now },
  })

  await firestoreSet(projectId, token, `public_order_info/${chatToken}`, {
    orderId:      { stringValue: orderId },
    orderNumber:  { stringValue: orderNumber },
    division:     { stringValue: division },
    customerName: { stringValue: customerName.trim() },
    status:       { stringValue: 'pending' },
    chatToken:    { stringValue: chatToken },
    createdAt:    { timestampValue: now },
  })

  await sendFonnteNotif(env, orderNumber, customerName.trim(), division, totalPrice, dueDate, notes, sumberOrder)

  const chatUrl = `https://adhiitmuh.github.io/custom-order-harmoni/chat.html?t=${chatToken}`

  return json({
    success: true,
    orderNumber,
    orderId,
    chatToken,
    chatUrl,
    message: 'Order berhasil dibuat',
  }, 201)
}

async function handleGetOrder(url, env, token) {
  const orderNumber = url.searchParams.get('order_number')
  if (!orderNumber) return json({ error: 'Parameter order_number diperlukan' }, 400)

  const projectId = env.FIREBASE_PROJECT_ID
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'orders' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'orderNumber' },
              op: 'EQUAL',
              value: { stringValue: orderNumber },
            },
          },
          limit: 1,
        },
      }),
    }
  )

  const data = await res.json()
  if (!data[0]?.document) {
    return json({ error: `Order ${orderNumber} tidak ditemukan` }, 404)
  }

  const f = data[0].document.fields
  return json({
    success: true,
    order: {
      orderNumber:  val(f.orderNumber),
      customerName: val(f.customerName),
      division:     val(f.division),
      status:       val(f.status),
      totalPrice:   val(f.totalPrice),
      depositPaid:  val(f.depositPaid),
      dueDate:      val(f.dueDate),
      progressPercentage: val(f.progressPercentage),
      chatUrl: `https://adhiitmuh.github.io/custom-order-harmoni/chat.html?t=${val(f.chatToken)}`,
    },
  }, 200)
}

async function handleNotifyCS(request, env) {
  // Pakai X-Notify-Key terpisah (lebih aman untuk embed di halaman publik)
  const notifyKey = request.headers.get('X-Notify-Key')
  if (env.NOTIFY_KEY && notifyKey !== env.NOTIFY_KEY) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (!env.FONNTE_API_KEY || !env.OWNER_WA_NUMBER) {
    return json({ error: 'Fonnte belum dikonfigurasi' }, 503)
  }

  const body = await request.json().catch(() => null)
  if (!body) return json({ error: 'Invalid JSON' }, 400)

  const { orderNumber, customerName, division, previewText } = body
  const divLabel = DIVISION_LABELS[division] || division || ''

  const msg = [
    `💬 *Pesan baru dari customer!*`,
    ``,
    `Pesanan: *${orderNumber || '-'}*`,
    `Customer: ${customerName || '-'}`,
    divLabel ? `Divisi: ${divLabel}` : '',
    previewText ? `Pesan: _"${previewText}"_` : '',
    ``,
    `🔗 https://adhiitmuh.github.io/custom-order-harmoni/orders.html`,
  ].filter(Boolean).join('\n')

  await fonnteSend(env.FONNTE_API_KEY, env.OWNER_WA_NUMBER, msg).catch(() => {})

  return json({ success: true }, 200)
}

async function handleGetKnowledge(url, env, token) {
  const division = url.searchParams.get('division')
  if (!division || !VALID_DIVISIONS.includes(division)) {
    return json({ error: `division tidak valid. Pilihan: ${VALID_DIVISIONS.join(', ')}` }, 400)
  }

  const projectId = env.FIREBASE_PROJECT_ID
  const divLabel = DIVISION_LABELS[division] || division
  const fmt = (n) => n ? `Rp ${Number(n).toLocaleString('id-ID')}` : '-'

  // Fetch product knowledge sections + price list in parallel
  const [sectionsRes, priceRes] = await Promise.all([
    fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'product_knowledge' }],
            where: { fieldFilter: { field: { fieldPath: 'division' }, op: 'EQUAL', value: { stringValue: division } } },
            orderBy: [{ field: { fieldPath: 'orderIndex' }, direction: 'ASCENDING' }],
          }
        })
      }
    ),
    fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/price_list/${division}`,
      { headers: { Authorization: `Bearer ${token}` } }
    ),
  ])

  // Parse knowledge sections
  let knowledgeSections = ''
  if (sectionsRes.ok) {
    const docs = await sectionsRes.json()
    const sections = docs
      .filter(d => d.document)
      .map(d => {
        const f = d.document.fields || {}
        return { title: val(f.title) || '', content: val(f.content) || '', orderIndex: Number(val(f.orderIndex)) || 0 }
      })
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .filter(s => s.title && s.content)
    knowledgeSections = sections.map(s => `### ${s.title}\n${s.content}`).join('\n\n')
  }

  // Parse price list (priceModal & priceAdmin tidak dikirim ke agent — internal only)
  let priceLines = ''
  if (priceRes.ok) {
    const priceData = await priceRes.json()
    const items = priceData.fields?.items?.arrayValue?.values || []
    priceLines = items.map(i => {
      const fld = i.mapValue?.fields || {}
      const name = val(fld.name) || ''
      if (!name) return null
      const priceNormal = val(fld.priceNormal)
      const pricePromo  = val(fld.pricePromo)
      const unit        = val(fld.unit) || 'pcs'
      const note        = val(fld.note) || ''
      return `- ${name}: ${fmt(priceNormal)}/${unit}${pricePromo ? ` (promo: ${fmt(pricePromo)})` : ''}${note ? ` — ${note}` : ''}`
    }).filter(Boolean).join('\n')
  }

  if (!knowledgeSections && !priceLines) {
    return json({ error: `Knowledge untuk divisi '${division}' belum tersedia` }, 404)
  }

  const knowledge = [
    `# Knowledge Divisi: ${divLabel}`,
    knowledgeSections,
    priceLines ? `## Harga & Produk\n${priceLines}` : '',
  ].filter(Boolean).join('\n\n')

  return json({ success: true, division, label: divLabel, knowledge }, 200)
}

async function handleUpdateStatus(request, env, token) {
  const body = await request.json().catch(() => null)
  if (!body) return json({ error: 'Request body tidak valid' }, 400)

  const { orderId, status } = body
  const validStatuses = ['pending','in-progress','quality-check','done','delivered','cancelled']

  if (!orderId) return json({ error: 'orderId diperlukan' }, 400)
  if (!validStatuses.includes(status)) {
    return json({ error: `status tidak valid. Pilihan: ${validStatuses.join(', ')}` }, 400)
  }

  const projectId = env.FIREBASE_PROJECT_ID
  const now = new Date().toISOString()

  await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders/${orderId}?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          status:     { stringValue: status },
          updatedAt:  { timestampValue: now },
        },
      }),
    }
  )

  return json({ success: true, message: `Status order berhasil diubah ke: ${status}` }, 200)
}

// ── Chat Inbox ────────────────────────────────────────────────────────────────

// Webhook dari n8n/Fonnte saat customer kirim WA — buat/update thread
async function handleIncomingChat(request, env) {
  const notifyKey = request.headers.get('X-Notify-Key')
  if (notifyKey !== env.NOTIFY_KEY) return json({ error: 'Unauthorized' }, 401)

  const body = await request.json().catch(() => null)
  if (!body) return json({ error: 'Invalid body' }, 400)

  const { waNumber, customerName = 'Customer', message, senderType = 'customer' } = body
  if (!waNumber || !message) return json({ error: 'waNumber dan message wajib diisi' }, 400)

  const token = await getFirebaseToken(env)
  const projectId = env.FIREBASE_PROJECT_ID
  const now = new Date().toISOString()

  // Cari thread yang sudah ada berdasarkan waNumber (doc ID = waNumber)
  const waRef = `chat_wa_numbers/${encodeURIComponent(waNumber)}`
  const waDoc = await firestoreGet(projectId, token, waRef).catch(() => null)

  let threadId, threadToken

  if (waDoc?.fields) {
    threadId    = waDoc.fields.threadId?.stringValue
    threadToken = waDoc.fields.token?.stringValue
    // Update thread: lastMessage, unreadCount
    const threadDoc = await firestoreGet(projectId, token, `chat_threads/${threadId}`).catch(() => null)
    const unread = parseInt(threadDoc?.fields?.unreadCount?.integerValue || '0') + 1
    await firestoreSet(projectId, token, `chat_threads/${threadId}`, {
      ...((threadDoc?.fields) || {}),
      lastMessage:    { stringValue: message.substring(0, 100) },
      lastMessageAt:  { timestampValue: now },
      unreadCount:    { integerValue: String(unread) },
      updatedAt:      { timestampValue: now },
    })
  } else {
    // Thread baru — generate token CUST-XXXX
    const counterPath = `chat_counters/threads`
    const counterDoc  = await firestoreGet(projectId, token, counterPath).catch(() => null)
    const counter = parseInt(counterDoc?.fields?.counter?.integerValue || '0') + 1
    threadToken = `CUST-${String(counter).padStart(4, '0')}`
    threadId    = crypto.randomUUID()

    // Simpan counter baru
    await firestoreSet(projectId, token, counterPath, { counter: { integerValue: String(counter) } })

    // Buat thread doc
    await firestoreSet(projectId, token, `chat_threads/${threadId}`, {
      token:           { stringValue: threadToken },
      customerName:    { stringValue: customerName },
      status:          { stringValue: 'open' },
      orderId:         { nullValue: null },
      orderNumber:     { nullValue: null },
      assignedAdminId: { nullValue: null },
      lastMessage:     { stringValue: message.substring(0, 100) },
      lastMessageAt:   { timestampValue: now },
      hasFlag:         { booleanValue: false },
      unreadCount:     { integerValue: '1' },
      createdAt:       { timestampValue: now },
      updatedAt:       { timestampValue: now },
    })

    // Simpan mapping WA → thread (collection yang diblokir dari client)
    await firestoreSet(projectId, token, `chat_wa_numbers/${waNumber}`, {
      token:     { stringValue: threadToken },
      threadId:  { stringValue: threadId },
      createdAt: { timestampValue: now },
    })
  }

  // Simpan pesan
  const msgId = crypto.randomUUID()
  await firestoreSet(projectId, token, `chat_threads/${threadId}/messages/${msgId}`, {
    senderType:  { stringValue: senderType },
    senderName:  { nullValue: null },
    senderId:    { nullValue: null },
    content:     { stringValue: message },
    flagged:     { booleanValue: false },
    flagReason:  { nullValue: null },
    createdAt:   { timestampValue: now },
  })

  return json({ success: true, threadId, token: threadToken })
}

// Dari inbox.html — admin balas pesan customer
async function handleSendChatReply(request, env) {
  // Verifikasi Firebase ID token dari harmoni-indonesia (auth project)
  const authHeader = request.headers.get('Authorization')
  const idToken = authHeader?.replace('Bearer ', '').trim()
  if (!idToken) return json({ error: 'Authorization required' }, 401)

  const firebaseUser = await verifyFirebaseIdToken(idToken, env)
  if (!firebaseUser) return json({ error: 'Token tidak valid atau sudah expired' }, 401)

  const body = await request.json().catch(() => null)
  if (!body) return json({ error: 'Invalid body' }, 400)

  const { threadId, message, adminId, adminName } = body
  if (!threadId || !message?.trim()) return json({ error: 'threadId dan message wajib diisi' }, 400)

  const token = await getFirebaseToken(env)
  const projectId = env.FIREBASE_PROJECT_ID
  const now = new Date().toISOString()

  // Validasi thread ada
  const threadDoc = await firestoreGet(projectId, token, `chat_threads/${threadId}`).catch(() => null)
  if (!threadDoc?.fields) return json({ error: 'Thread tidak ditemukan' }, 404)

  const threadToken = threadDoc.fields.token?.stringValue

  // Deteksi red flag
  const flagReason = detectRedFlag(message)

  // Simpan pesan ke Firestore
  const msgId = crypto.randomUUID()
  await firestoreSet(projectId, token, `chat_threads/${threadId}/messages/${msgId}`, {
    senderType:  { stringValue: 'admin' },
    senderName:  { stringValue: adminName || 'Admin' },
    senderId:    { stringValue: adminId || '' },
    content:     { stringValue: message },
    flagged:     { booleanValue: !!flagReason },
    flagReason:  flagReason ? { stringValue: flagReason } : { nullValue: null },
    createdAt:   { timestampValue: now },
  })

  // Update thread metadata
  const updateFields = {
    ...threadDoc.fields,
    lastMessage:   { stringValue: `[Admin] ${message.substring(0, 80)}` },
    lastMessageAt: { timestampValue: now },
    updatedAt:     { timestampValue: now },
  }
  if (flagReason) updateFields.hasFlag = { booleanValue: true }
  await firestoreSet(projectId, token, `chat_threads/${threadId}`, updateFields)

  // Kirim via Fonnte jika WA number tersedia
  if (threadToken && env.FONNTE_API_KEY) {
    const waResult = await firestoreQuery(projectId, token, 'chat_wa_numbers',
      [{ field: 'token', op: 'EQUAL', value: threadToken }])
    if (waResult.length) {
      const waNumber = waResult[0].document.name.split('/').pop()
      await fonnteSend(env.FONNTE_API_KEY, waNumber, message).catch(err => console.error('Fonnte:', err))
    }
  }

  // Notifikasi owner jika ada red flag
  if (flagReason && env.FONNTE_API_KEY && env.OWNER_WA_NUMBER) {
    const alert = [
      `🚩 *PERINGATAN CHAT*`,
      ``,
      `Admin *${adminName || 'unknown'}* mengirim pesan mencurigakan:`,
      `"${message.substring(0, 200)}"`,
      ``,
      `Alasan: ${flagReason}`,
      `Thread: ${threadToken}`,
    ].join('\n')
    await fonnteSend(env.FONNTE_API_KEY, env.OWNER_WA_NUMBER, alert).catch(() => {})
  }

  return json({ success: true, flagged: !!flagReason, flagReason: flagReason || null })
}

// Buat order dari chat inbox — admin isi form, Worker resolve WA asli & buat order
async function handleCreateOrderFromChat(request, env) {
  const authHeader = request.headers.get('Authorization')
  const idToken = authHeader?.replace('Bearer ', '').trim()
  if (!idToken) return json({ error: 'Authorization required' }, 401)

  const firebaseUser = await verifyFirebaseIdToken(idToken, env)
  if (!firebaseUser) return json({ error: 'Token tidak valid' }, 401)

  const body = await request.json().catch(() => null)
  if (!body) return json({ error: 'Invalid body' }, 400)

  const { threadId, division, totalPrice = 0, dp = 0, dueDate, notes = '' } = body
  if (!threadId)                              return json({ error: 'threadId wajib' }, 400)
  if (!division || !VALID_DIVISIONS.includes(division)) return json({ error: 'division tidak valid' }, 400)
  if (!dueDate)                               return json({ error: 'dueDate wajib (YYYY-MM-DD)' }, 400)

  const token = await getFirebaseToken(env)
  const projectId = env.FIREBASE_PROJECT_ID
  const now = new Date().toISOString()
  const today = now.split('T')[0]

  // Ambil data thread
  const threadDoc = await firestoreGet(projectId, token, `chat_threads/${threadId}`).catch(() => null)
  if (!threadDoc?.fields) return json({ error: 'Thread tidak ditemukan' }, 404)

  const threadToken  = threadDoc.fields.token?.stringValue
  const customerName = threadDoc.fields.customerName?.stringValue || 'Customer'

  // Resolve nomor WA asli dari collection terproteksi
  let customerContact = ''
  const waResult = await firestoreQuery(projectId, token, 'chat_wa_numbers',
    [{ field: 'token', op: 'EQUAL', value: threadToken }])
  if (waResult.length) {
    customerContact = waResult[0].document.name.split('/').pop()
  }

  // Generate nomor order & ID-ID
  const orderNumber = await generateOrderNumber(projectId, token, division)
  const orderId     = crypto.randomUUID()
  const chatToken   = generateChatToken()

  // Buat order
  await firestoreSet(projectId, token, `orders/${orderId}`, {
    orderNumber:         { stringValue: orderNumber },
    division:            { stringValue: division },
    customerName:        { stringValue: customerName },
    customerContact:     { stringValue: customerContact },
    orderDate:           { stringValue: today },
    dueDate:             { stringValue: dueDate },
    originalDueDate:     { stringValue: dueDate },
    status:              { stringValue: 'pending' },
    progressPercentage:  { integerValue: '0' },
    totalPrice:          { doubleValue: Number(totalPrice) },
    depositPaid:         { doubleValue: Number(dp) },
    notes:               { stringValue: notes },
    designFiles:         { arrayValue: { values: [] } },
    chatToken:           { stringValue: chatToken },
    sumberOrder:         { stringValue: 'inbox' },
    agentSessionId:      { stringValue: threadId },
    produksiUnit:        { stringValue: PRODUKSI_UNIT[division] || '' },
    lokasiId:            { stringValue: '' },
    lokasiNama:          { stringValue: '' },
    lokasiTipe:          { stringValue: '' },
    priceApprovalStatus: { stringValue: 'approved' },
    priceApprovalTier:   { nullValue: null },
    priceApprovalReason: { stringValue: '' },
    priceApprovalBy:     { nullValue: null },
    priceApprovalAt:     { nullValue: null },
    chatInboxThreadId:   { stringValue: threadId },
    createdBy:           { stringValue: firebaseUser.localId || 'inbox' },
    createdAt:           { timestampValue: now },
    updatedAt:           { timestampValue: now },
  })

  // Buat public_order_info supaya customer bisa akses chat.html
  await firestoreSet(projectId, token, `public_order_info/${chatToken}`, {
    orderId:      { stringValue: orderId },
    orderNumber:  { stringValue: orderNumber },
    division:     { stringValue: division },
    customerName: { stringValue: customerName },
    status:       { stringValue: 'pending' },
    dueDate:      { stringValue: dueDate },
    totalPrice:   { doubleValue: Number(totalPrice) },
    depositPaid:  { doubleValue: Number(dp) },
    notes:        { stringValue: notes },
    createdAt:    { timestampValue: now },
  })

  // Hubungkan thread ke order
  await firestoreSet(projectId, token, `chat_threads/${threadId}`, {
    ...threadDoc.fields,
    orderId:     { stringValue: orderId },
    orderNumber: { stringValue: orderNumber },
    updatedAt:   { timestampValue: now },
  })

  const chatUrl = `https://adhiitmuh.github.io/custom-order-harmoni/chat.html?t=${chatToken}`

  // Notif WA ke customer
  if (customerContact && env.FONNTE_API_KEY) {
    const divLabel = DIVISION_LABELS[division] || division
    const priceFmt = new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(Number(totalPrice))
    const dpFmt    = Number(dp) > 0
      ? new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(Number(dp))
      : null
    const msg = [
      `✅ *Order Anda Sudah Dibuat!*`,
      ``,
      `No. Order: *${orderNumber}*`,
      `Divisi: ${divLabel}`,
      `Total: ${priceFmt}`,
      dpFmt ? `DP: ${dpFmt}` : '',
      `Target Selesai: ${dueDate}`,
      notes ? `Catatan: ${notes}` : '',
      ``,
      `Pantau status order Anda di:`,
      chatUrl,
    ].filter(Boolean).join('\n')
    await fonnteSend(env.FONNTE_API_KEY, customerContact, msg).catch(() => {})
  }

  // Notif owner
  await sendFonnteNotif(env, orderNumber, customerName, division, Number(totalPrice), dueDate, notes, 'inbox')

  return json({ success: true, orderId, orderNumber, chatToken, chatUrl })
}

function detectRedFlag(content) {
  const t = content
  if (/\b0\d{8,12}\b/.test(t)) return 'Nomor HP terdeteksi'
  if (/\+62\d{7,12}/.test(t)) return 'Nomor HP terdeteksi'
  if (/\b62\d{8,12}\b/.test(t)) return 'Nomor HP terdeteksi'
  if (/wa\s*(pribadi|ku|saya|aku)/i.test(t)) return 'Referensi WA pribadi'
  if (/langsung\s*(aja|saja|ke|hub|chat)/i.test(t)) return 'Ajakan bypass sistem'
  if (/gak\s*usah\s*lewat\s*(toko|sistem|app|aplikasi)/i.test(t)) return 'Ajakan bypass sistem'
  if (/transfer\s*(ke\s*)?(rekening|rek)\s*(saya|aku|ku|pribadi)/i.test(t)) return 'Arahan transfer pribadi'
  if (/chat\s*(di\s*)?(luar|pribadi|personal)/i.test(t)) return 'Ajakan chat di luar sistem'
  if (/inbox\s*(saya|aku|ku)/i.test(t)) return 'Ajakan ke inbox pribadi'
  if (/diskon\s*(khusus|tambahan|ekstra)\s*(?:buat|untuk|bagi)/i.test(t)) return 'Penawaran diskon di luar sistem'
  return null
}

async function verifyFirebaseIdToken(idToken, env) {
  // API key harmoni-indonesia (auth project) — nilai ini publik, aman di Worker
  const apiKey = env.FIREBASE_AUTH_API_KEY || 'AIzaSyA9V5Lw40pDeAWeQKijYCkdvnag8AlEe74'
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
  )
  if (!resp.ok) return null
  const data = await resp.json()
  return data.users?.[0] || null
}

async function firestoreGet(projectId, token, docPath) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return null
  return res.json()
}

async function firestoreQuery(projectId, token, collectionId, filters) {
  const where = filters.length === 1 ? {
    fieldFilter: { field: { fieldPath: filters[0].field }, op: filters[0].op, value: { stringValue: filters[0].value } }
  } : {
    compositeFilter: { op: 'AND', filters: filters.map(f => ({
      fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: { stringValue: f.value } }
    }))}
  }
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], where } }) }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.filter(r => r.document)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateOrderNumber(projectId, token, division) {
  const code = DIVISION_CODES[division] || 'ORD'
  const year = new Date().getFullYear()
  const docPath = `order_counters/${division}`
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`

  const readRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const current = readRes.ok
    ? Number((await readRes.json())?.fields?.counter?.integerValue || 0)
    : 0
  const next = current + 1

  await fetch(`${url}?updateMask.fieldPaths=counter`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { counter: { integerValue: String(next) } } }),
  })

  return `HRM-${code}-${year}-${String(next).padStart(4, '0')}`
}

async function firestoreSet(projectId, token, docPath, fields) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Firestore write failed (${docPath}): ${err}`)
  }
}

async function sendFonnteNotif(env, orderNumber, customerName, division, totalPrice, dueDate, notes, sumberOrder) {
  if (!env.FONNTE_API_KEY || !env.OWNER_WA_NUMBER) return

  const divLabel = DIVISION_LABELS[division] || division
  const totalFmt = new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(totalPrice || 0)

  const sumberLabel = {
    wa_bot: 'WA Bot', walk_in: 'Walk In', instagram: 'Instagram',
    shopee: 'Shopee', staff: 'Staff'
  }[sumberOrder] || sumberOrder

  const msg = [
    `📦 *Order Baru Masuk!*`,
    ``,
    `No: *${orderNumber}*`,
    `Pelanggan: ${customerName}`,
    `Divisi: ${divLabel}`,
    `Total: ${totalFmt}`,
    `Target: ${dueDate}`,
    `Via: ${sumberLabel}`,
    notes ? `\nCatatan: ${notes}` : '',
    ``,
    `🔗 https://adhiitmuh.github.io/custom-order-harmoni/orders.html`,
  ].filter(Boolean).join('\n')

  await fonnteSend(env.FONNTE_API_KEY, env.OWNER_WA_NUMBER, msg).catch(() => {})
}

// Extract value from Firestore field descriptor
function val(f) {
  if (!f) return null
  if (f.stringValue  !== undefined) return f.stringValue
  if (f.integerValue !== undefined) return Number(f.integerValue)
  if (f.doubleValue  !== undefined) return Number(f.doubleValue)
  if (f.timestampValue !== undefined) return f.timestampValue
  if (f.booleanValue !== undefined) return f.booleanValue
  return null
}

function generateChatToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Deadline Reminder ─────────────────────────────────────────────────────────

async function runDeadlineCheck(env, token) {
  if (!env.FONNTE_API_KEY) return

  const projectId = env.FIREBASE_PROJECT_ID

  // Tanggal H-1 dan H-2 relatif ke WITA (cron jam 00:00 UTC = 08:00 WITA)
  const todayUTC = new Date()
  todayUTC.setUTCHours(0, 0, 0, 0)
  const d1 = new Date(todayUTC); d1.setUTCDate(d1.getUTCDate() + 1)
  const d2 = new Date(todayUTC); d2.setUTCDate(d2.getUTCDate() + 2)
  const d1str = d1.toISOString().split('T')[0]  // H-1
  const d2str = d2.toISOString().split('T')[0]  // H-2

  // Fetch nomor WA per divisi dari Firestore settings/division_contacts
  const contactsRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/division_contacts`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const divisionContacts = {}
  if (contactsRes.ok) {
    const data = await contactsRes.json()
    const fields = data.fields || {}
    for (const [div, v] of Object.entries(fields)) {
      if (v.stringValue) divisionContacts[div] = v.stringValue
    }
  }

  // Query orders dengan dueDate antara H-1 dan H-2
  const queryRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'orders' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'dueDate' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: d1str } } },
                { fieldFilter: { field: { fieldPath: 'dueDate' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: d2str } } },
              ],
            },
          },
        },
      }),
    }
  )

  const queryData = await queryRes.json()
  const SKIP = new Set(['done', 'delivered', 'cancelled', 'pending-approval'])

  // Filter dan kelompokkan per divisi
  const byDivision = {}  // { division: { d1: [...], d2: [...] } }
  for (const item of queryData) {
    if (!item.document) continue
    const f = item.document.fields || {}
    const status = val(f.status) || ''
    if (SKIP.has(status)) continue

    const division  = val(f.division) || 'unknown'
    const dueDate   = val(f.dueDate) || ''
    const dayLabel  = dueDate === d1str ? 'H-1' : 'H-2'

    if (!byDivision[division]) byDivision[division] = { 'H-1': [], 'H-2': [] }
    byDivision[division][dayLabel].push({
      orderNumber:  val(f.orderNumber) || '-',
      customerName: val(f.customerName) || '-',
      notes:        val(f.notes) || '',
      dueDate,
    })
  }

  if (Object.keys(byDivision).length === 0) return  // tidak ada deadline hari ini

  const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
  const fmtDate = (s) => {
    const d = new Date(s + 'T00:00:00')
    return `${dayNames[d.getDay()]}, ${d.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][d.getMonth()]} ${d.getFullYear()}`
  }

  const sends = []

  // Kirim notif ke masing-masing divisi
  for (const [division, days] of Object.entries(byDivision)) {
    const divLabel  = DIVISION_LABELS[division] || division
    const waNumber  = divisionContacts[division]

    for (const [dayLabel, orders] of Object.entries(days)) {
      if (!orders.length) continue
      const deadline = orders[0].dueDate
      const lines = [
        `⏰ *Reminder Deadline — ${dayLabel}*`,
        `Deadline: *${fmtDate(deadline)}*`,
        ``,
        `📋 *Divisi ${divLabel} — ${orders.length} order*`,
        ``,
        ...orders.map((o, i) => [
          `${i + 1}. *${o.orderNumber}*`,
          `   👤 ${o.customerName}`,
          o.notes ? `   📝 ${o.notes.slice(0, 80)}${o.notes.length > 80 ? '…' : ''}` : '',
        ].filter(Boolean).join('\n')),
        ``,
        `Pastikan sudah selesai tepat waktu! 🙏`,
      ].join('\n')

      // Kirim ke nomor WA divisi (jika ada)
      if (waNumber) {
        sends.push(fonnteSend(env.FONNTE_API_KEY, waNumber, lines))
      }
      // Kirim ke owner juga
      if (env.OWNER_WA_NUMBER) {
        sends.push(fonnteSend(env.FONNTE_API_KEY, env.OWNER_WA_NUMBER, lines))
      }
    }
  }

  // Kirim summary ke owner (semua divisi, semua hari sekaligus)
  if (env.OWNER_WA_NUMBER) {
    const totalH1 = Object.values(byDivision).flatMap(d => d['H-1']).length
    const totalH2 = Object.values(byDivision).flatMap(d => d['H-2']).length
    const summaryLines = [
      `📊 *Summary Deadline Hari Ini*`,
      ``,
      ...Object.entries(byDivision).map(([div, days]) => {
        const label  = DIVISION_LABELS[div] || div
        const h1cnt  = days['H-1'].length
        const h2cnt  = days['H-2'].length
        return [
          h1cnt ? `• ${label}: ${h1cnt} order *deadline besok (H-1)*` : '',
          h2cnt ? `• ${label}: ${h2cnt} order *deadline lusa (H-2)*` : '',
        ].filter(Boolean).join('\n')
      }),
      ``,
      totalH1 ? `H-1 (besok): *${totalH1} order*` : '',
      totalH2 ? `H-2 (lusa): *${totalH2} order*` : '',
      ``,
      `🔗 https://adhiitmuh.github.io/custom-order-harmoni/orders.html`,
    ].filter(Boolean).join('\n')

    sends.push(fonnteSend(env.FONNTE_API_KEY, env.OWNER_WA_NUMBER, summaryLines))
  }

  await Promise.allSettled(sends)
}

async function fonnteSend(apiKey, target, message) {
  return fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, message }),
  })
}

// ── Google Service Account JWT → Firebase access token ────────────────────────

// Google Service Account JWT → Firebase access token
async function getFirebaseToken(env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY)
  const now = Math.floor(Date.now() / 1000)

  const b64url = (s) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  }))

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(`${header}.${payload}`)
  )

  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)))
  const jwt = `${header}.${payload}.${sigB64}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`Gagal dapat Firebase token: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

function pemToBuffer(pem) {
  const base64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const binary  = atob(base64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer
}
