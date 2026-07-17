import { auth, authDb, db, dataAuth } from './config.js'
import { onAuthStateChanged, signOut, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { doc, getDoc, setDoc, collection, query, orderBy, onSnapshot, limit, getDocs, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { DIVISION_META, DIVISIONS, timeAgo } from './utils.js'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/custom-order-harmoni/sw.js').catch(() => {})
}

// Pastikan dataAuth (harmoni-custom-order) selalu punya sesi agar Firestore rules isAuth() lolos
// Juga expose promise supaya halaman bisa tunggu sebelum query Firestore
export const dataAuthReady = Promise.race([
  new Promise(resolve => {
    onAuthStateChanged(dataAuth, (u) => {
      if (u) { resolve(u); return }
      signInAnonymously(dataAuth).then(cred => resolve(cred.user)).catch(() => resolve(null))
    })
  }),
  new Promise(resolve => setTimeout(() => resolve(null), 5000))
])

// firestoreReady resolves after users/{anonUID} is written to Firestore.
// requireAuth() waits for this before firing the page callback so that
// isStaffAuth() Firestore rules pass on the very first query.
let _firestoreReadyResolve = () => {}
export const firestoreReady = new Promise(resolve => { _firestoreReadyResolve = resolve })
setTimeout(() => _firestoreReadyResolve(), 5000) // safety: never hang longer than 5s

dataAuthReady.then(async (anonUser) => {
  if (!anonUser) { _firestoreReadyResolve(); return }
  const cachedUid = sessionStorage.getItem('harmoni_uid')
  if (!cachedUid) { _firestoreReadyResolve(); return }
  const cached = sessionStorage.getItem(`profile_${cachedUid}`)
  if (!cached) { _firestoreReadyResolve(); return }
  try {
    const p = JSON.parse(cached)
    if (!p.role) { _firestoreReadyResolve(); return }
    await setDoc(doc(db, 'users', anonUser.uid),
      { role: p.role, name: p.name || '', email: p.email || '', branch: p.branch || '', divisi: p.divisi || '' },
      { merge: true })
  } catch {}
  _firestoreReadyResolve()
})

let _user = null
let _profile = null
let _notifInitialized = false
let _mentionCount = 0
let _divisions = null
let _divisionsPromise = null

function _staticDivisions() {
  return DIVISIONS.map((key, i) => ({ key, ...DIVISION_META[key], aktif: true, orderIndex: i }))
}

export function getActiveDivisions() {
  if (_divisions !== null) return Promise.resolve(_divisions)
  if (_divisionsPromise) return _divisionsPromise
  _divisionsPromise = dataAuthReady.then(async () => {
    try {
      const snap = await getDocs(collection(db, 'divisions'))
      if (snap.empty) return _staticDivisions()
      const divs = snap.docs
        .map(d => ({ key: d.id, ...d.data() }))
        .filter(d => d.aktif !== false)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
      return divs.length ? divs : _staticDivisions()
    } catch {
      return _staticDivisions()
    }
  }).then(divs => {
    _divisions = divs
    _divisionsPromise = null
    return divs
  })
  return _divisionsPromise
}

export function invalidateDivisionsCache() {
  _divisions = null
  _divisionsPromise = null
}

export const getUser = () => _user
export const getProfile = () => _profile
export const canViewContact = (role) => role === 'owner'

export function hasProductionAccess(profile, division) {
  if (!profile) return false
  if (profile.role !== 'production') return false
  const userDivs = profile.divisions || []
  return userDivs.length === 0 || !division || userDivs.includes(division)
}

export function isDivisiOwner(profile) {
  return profile?.role === 'divisi'
}

export function isDivisiOwnerOf(profile, division) {
  return profile?.role === 'divisi' && !!division && profile?.divisi === division
}

export function canAccessDivisi(profile, division) {
  if (!profile) return false
  if (profile.role === 'owner' || profile.role === 'manager') return true
  if (isDivisiOwnerOf(profile, division)) return true
  return hasProductionAccess(profile, division)
}

// Filter order per role — dipakai di dashboard, orders, kalender, crm, laporan, production-sheet
// - Owner/data: semua
// - Production: hanya divisi yang di-assign
// - Divisi role: hanya divisi yang dimiliki
// - CS pusat + divisi: hanya divisi itu (semua lokasi)
// - CS pusat tanpa divisi: semua order
// - CS cabang/titik: hanya order dari lokasinya
// - Manager: hanya order dari lokasinya (jika di-assign)
export function canSeeOrder(o, profile) {
  if (!profile || !o) return false
  if (profile.role === 'owner' || profile.role === 'data') return true
  if (profile.role === 'production') {
    return !profile.divisions?.length || profile.divisions.includes(o.division)
  }
  if (profile.role === 'divisi') {
    return !profile.divisi || o.division === profile.divisi
  }
  if (profile.role === 'cs') {
    const isPusat = !profile.lokasiTipe || profile.lokasiTipe === 'pusat'
    if (isPusat) {
      return !profile.divisions?.length || profile.divisions.includes(o.division)
    }
    return !profile.lokasiId || o.lokasiId === profile.lokasiId
  }
  if (profile.role === 'manager') {
    return !profile.lokasiId || o.lokasiId === profile.lokasiId
  }
  return true
}

function showAccessDenied(msg) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:#f9fafb;font-family:sans-serif;text-align:center;padding:24px;">
      <div style="font-size:44px;">🚫</div>
      <div style="font-size:18px;font-weight:700;color:#034543;">Akses Tidak Diizinkan</div>
      <div style="color:#6b7280;max-width:320px;">${msg}</div>
      <a href="https://adhiitmuh.github.io/harmoni-indonesia/" style="margin-top:8px;color:#034543;font-weight:600;text-decoration:none;">← Kembali ke Portal</a>
    </div>`
}

let _callbackFired = false

export function requireAuth(callback) {
  // ── Optimistic render: render sidebar immediately from sessionStorage ──
  // Fire the page callback only after firestoreReady so that users/{anonUID}
  // is written before any Firestore query runs (fixes "Missing or insufficient permissions").
  const cachedUid = sessionStorage.getItem('harmoni_uid')
  if (cachedUid) {
    const cached = sessionStorage.getItem(`profile_${cachedUid}`)
    if (cached) {
      try {
        _profile = JSON.parse(cached)
        renderSidebar(_profile)
        firestoreReady.then(() => {
          if (!_callbackFired) {
            _callbackFired = true
            callback(_profile)
          }
        })
      } catch { /* fall through */ }
    }
  }

  // ── Background auth verification ──
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      sessionStorage.removeItem('harmoni_uid')
      window.location.href = 'index.html'
      return
    }
    // If a different user is now logged in, clear stale cache
    if (cachedUid && cachedUid !== user.uid) sessionStorage.clear()
    sessionStorage.setItem('harmoni_uid', user.uid)
    _user = user

    try {
      const snap = await getDoc(doc(authDb, 'users', user.uid))
      const data = snap.exists() ? snap.data() : null

      if (!data || !data.aktif) {
        showAccessDenied('Akun belum diaktifkan. Hubungi admin.')
        return
      }

      let appRole, appDivisions = [], appDivisi = ''
      if (data.role === 'owner') {
        appRole = 'owner'
      } else {
        const appAccess = data.apps?.custom_order
        if (!appAccess?.akses) {
          showAccessDenied('Akun ini tidak memiliki akses ke Harmoni Custom Order.')
          return
        }
        appRole = appAccess.role || 'cs'
        // Divisi tim produksi diatur di Portal Utama (apps.custom_order.divisions)
        appDivisions = appAccess.divisions || []
        // Divisi pemilik (role=divisi) — satu divisi yang dimiliki
        appDivisi = appAccess.divisi || data.divisi || ''
      }

      const fresh = { id: snap.id, ...data, name: data.nama || user.email, role: appRole, divisions: appDivisions, divisi: appDivisi }

      // Fetch lokasiId + divisions fallback dari operational db (harmoni-custom-order)
      try {
        const opSnap = await getDoc(doc(db, 'users', snap.id))
        if (opSnap.exists()) {
          const op = opSnap.data()
          if (op.lokasiId) fresh.lokasiId = op.lokasiId
          if (op.lokasiNama) fresh.lokasiNama = op.lokasiNama
          if (op.lokasiTipe) fresh.lokasiTipe = op.lokasiTipe
          // Pakai divisions dari db sebagai fallback kalau portal tidak ada divisions (untuk CS)
          if (!fresh.divisions?.length && op.divisions?.length) fresh.divisions = op.divisions
        }
      } catch {}

      sessionStorage.setItem(`profile_${snap.id}`, JSON.stringify(fresh))

      // Sync role to harmoni-custom-order so Firestore Rules can check it.
      // Also write under the anon UID (from dataAuth) because Firestore rules
      // check request.auth.uid = anon UID, not the portal UID.
      const roleDoc = { role: appRole, branch: data.branch || '', name: data.nama || user.email, email: data.email || user.email || '', divisi: appDivisi || '' }
      // Write portal UID doc and anon UID doc — both must complete before callback
      // so Firestore rules (isStaffAuth checks users/{anonUID}) pass immediately
      await setDoc(doc(db, 'users', snap.id), roleDoc, { merge: true }).catch(() => {})
      const anonUser = await dataAuthReady
      if (anonUser && anonUser.uid !== snap.id) {
        await setDoc(doc(db, 'users', anonUser.uid), roleDoc, { merge: true }).catch(() => {})
      }

      _profile = fresh
      renderSidebar(fresh)
      // Pre-fetch divisions in background; re-render sidebar when done so dynamic divs appear
      getActiveDivisions().then(() => renderSidebar(fresh)).catch(() => {})

      if (!_notifInitialized) {
        _notifInitialized = true
        initNotifications(fresh)
      }

      // Only fire callback if optimistic render didn't already run it
      if (!_callbackFired) {
        _callbackFired = true
        callback(fresh)
      }
    } catch {
      if (!_callbackFired) {
        _callbackFired = true
        _profile = { id: user.uid, name: user.email, role: 'cs' }
        renderSidebar(_profile)
        callback(_profile)
      }
    }
  })
}

export function renderSidebar(profile) {
  const el = document.getElementById('sidebar')
  if (!el) return
  const page = location.pathname.split('/').pop()
  const params = new URLSearchParams(location.search)
  const activeDiv = params.get('div')

  // Divisi collapse state: expanded on knowledge.html, otherwise remember last state
  const onKnowledge = page === 'knowledge.html'
  const divisiOpen = onKnowledge
    ? true
    : localStorage.getItem('sidebar_divisi_open') !== 'false'

  const isDivisi = profile.role === 'divisi'
  const activeDivs = _divisions || _staticDivisions()

  // For divisi role: only show their own division in sidebar
  const sidebarDivs = isDivisi && profile.divisi
    ? activeDivs.filter(d => d.key === profile.divisi)
    : activeDivs

  const divLinks = sidebarDivs.map(d => `
    <a href="knowledge.html?div=${d.key}" class="sidebar-link ${onKnowledge && activeDiv === d.key ? 'active' : ''}">
      <span class="icon">${d.icon}</span>${d.label}
    </a>`).join('')

  const roleLabel = { owner:'OWNER', manager:'MANAGER', cs:'CS', production:'PRODUKSI', data:'DATA', divisi:'PEMILIK DIVISI' }[profile.role] || (profile.role||'').toUpperCase()

  el.innerHTML = `
    <div class="sidebar-nav">
    <div class="sidebar-logo">
      <img src="img/logo-beige.png" alt="harmoni" style="width:110px;display:block;margin-bottom:4px">
      <div class="brand-sub">ORDER SYSTEM</div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">MENU</div>
      <a href="dashboard.html" class="sidebar-link ${page==='dashboard.html'?'active':''}">
        <span class="icon">📊</span>Dashboard
      </a>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">PESANAN</div>
      ${isDivisi && profile.divisi ? `
      <a href="orders.html?div=${profile.divisi}" class="sidebar-link ${page==='orders.html'?'active':''}">
        <span class="icon">📋</span>Order Divisi Saya
      </a>` : `
      <a href="orders.html" class="sidebar-link ${page==='orders.html'?'active':''}">
        <span class="icon">📋</span>Semua Order
      </a>`}
      ${!isDivisi && profile.role !== 'production' && profile.role !== 'data' ? `
      <a href="new-order.html" class="sidebar-link ${page==='new-order.html'?'active':''}">
        <span class="icon">＋</span>Order Baru
      </a>` : ''}
      ${(profile.role==='manager'||profile.role==='owner') ? `
      <a href="orders.html?approval=promo" class="sidebar-link">
        <span class="icon">🔑</span>Approval Harga
      </a>` : ''}
    </div>

    <div class="sidebar-section">
      <button id="divisiToggle" onclick="sidebarToggleDivisi()" style="display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;cursor:pointer;padding:0 8px;margin-bottom:3px">
        <span class="sidebar-label" style="margin-bottom:0">DIVISI</span>
        <span id="divisiArrow" style="font-size:9px;color:var(--beige);opacity:.35;transition:transform .2s;transform:rotate(${divisiOpen?'90':'0'}deg)">▶</span>
      </button>
      <div id="divisiLinks" style="display:${divisiOpen?'':'none'}">
        ${divLinks}
      </div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">PRODUKSI</div>
      <a href="kalender.html" class="sidebar-link ${page==='kalender.html'?'active':''}">
        <span class="icon">📅</span>Kalender Produksi
      </a>
      ${!isDivisi || profile.divisi === 'bordir' || profile.divisi === 'papan-nama' ? `
      <a href="production-sheet.html" class="sidebar-link ${page==='production-sheet.html'?'active':''}">
        <span class="icon">🗂️</span>Papan Nama Sheet
      </a>` : ''}
    </div>

    ${!isDivisi && (profile.role === 'owner' || profile.role === 'manager' || profile.role === 'cs') ? `
    <div class="sidebar-section">
      <div class="sidebar-label">KOMUNIKASI</div>
      <a href="inbox.html" class="sidebar-link ${page==='inbox.html'?'active':''}">
        <span class="icon">💬</span>Chat Inbox
        <span id="inboxBadge" style="display:none;background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:999px;min-width:16px;text-align:center">0</span>
        <span id="mentionBadge" style="display:${_mentionCount > 0 ? '' : 'none'}" class="mention-badge">${_mentionCount > 9 ? '9+' : _mentionCount}</span>
      </a>
      ${profile.role === 'owner' ? `
      <a href="audit-chat.html" class="sidebar-link ${page==='audit-chat.html'?'active':''}">
        <span class="icon">🚩</span>Audit Chat
      </a>` : ''}
    </div>` : ''}

    ${profile.role === 'owner' || isDivisi ? `
    <div class="sidebar-section">
      <div class="sidebar-label">KEUANGAN</div>
      <a href="laporan.html" class="sidebar-link ${page==='laporan.html'?'active':''}">
        <span class="icon">📊</span>${isDivisi ? 'Laporan Kewajiban' : 'Laporan Keuangan'}
      </a>
      ${profile.role === 'owner' ? `
      <a href="crm.html" class="sidebar-link ${page==='crm.html'?'active':''}">
        <span class="icon">👥</span>CRM Pelanggan
      </a>` : ''}
    </div>` : ''}

    <div class="sidebar-section">
      <div class="sidebar-label">REFERENSI</div>
      <a href="knowledge.html" class="sidebar-link ${page==='knowledge.html'&&!activeDiv?'active':''}">
        <span class="icon">📖</span>Product Knowledge
      </a>
      ${profile.role === 'owner' ? `
      <a href="users.html" class="sidebar-link ${page==='users.html'?'active':''}">
        <span class="icon">⚙️</span>Kelola Pengguna
      </a>
      <a href="lokasi.html" class="sidebar-link ${page==='lokasi.html'?'active':''}">
        <span class="icon">🏪</span>Lokasi Harmoni
      </a>
      <a href="divisi.html" class="sidebar-link ${page==='divisi.html'?'active':''}">
        <span class="icon">🏷️</span>Kelola Divisi
      </a>
      <a href="supplier.html" class="sidebar-link ${page==='supplier.html'?'active':''}">
        <span class="icon">🏭</span>Kelola Vendor
      </a>
      <a href="settings.html" class="sidebar-link ${page==='settings.html'?'active':''}">
        <span class="icon">⚙️</span>Pengaturan & Backup
      </a>` : ''}
    </div>
    </div>

    <div class="sidebar-user">
      <div class="avatar">${(profile.name||'U')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="user-name">${profile.name}</div>
        <div class="user-role">${roleLabel}${profile.branch ? ' · ' + profile.branch : ''}</div>
      </div>
      <button id="notifBell" onclick="window.toggleNotifPanel()" title="Notifikasi" style="position:relative;background:none;border:none;cursor:pointer;color:#FFFBD5;font-size:15px;padding:4px;line-height:1;opacity:.6;flex-shrink:0">🔔<span id="notifBadge" style="display:none;position:absolute;top:-2px;right:-2px;background:#ef4444;color:#fff;border-radius:999px;font-size:9px;font-weight:700;padding:0 3px;min-width:13px;text-align:center;line-height:1.6">0</span></button>
      <button id="logoutBtn" title="Logout" style="background:none;border:none;cursor:pointer;opacity:.4;color:#FFFBD5;font-size:16px;padding:4px;line-height:1">⏻</button>
    </div>`

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    sessionStorage.clear()
    await Promise.all([signOut(auth), signOut(dataAuth).catch(() => {})])
    window.location.href = 'index.html'
  })
}

window.sidebarToggleDivisi = function() {
  const links = document.getElementById('divisiLinks')
  const arrow = document.getElementById('divisiArrow')
  if (!links) return
  const open = links.style.display === 'none'
  links.style.display = open ? '' : 'none'
  if (arrow) arrow.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)'
  localStorage.setItem('sidebar_divisi_open', open)
}

function injectNotifPanel() {
  if (document.getElementById('notifPanel')) return
  const panel = document.createElement('div')
  panel.id = 'notifPanel'
  panel.style.cssText = 'display:none;position:fixed;bottom:64px;left:10px;width:272px;background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:2000;overflow:hidden;border:1px solid rgba(3,69,67,.1)'
  panel.innerHTML = `
    <div style="padding:12px 14px 10px;border-bottom:1px solid rgba(3,69,67,.07);display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;font-weight:700;color:#034543">🔔 Notifikasi</span>
      <button onclick="window.markNotifsRead()" style="font-size:11px;color:rgba(3,69,67,.4);background:none;border:none;cursor:pointer;font-family:inherit">Semua dibaca</button>
    </div>
    <div id="notifList" style="overflow-y:auto;max-height:360px">
      <div style="padding:24px;text-align:center;font-size:13px;color:rgba(3,69,67,.35)">Belum ada notifikasi</div>
    </div>`
  document.body.appendChild(panel)
  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && !e.target.closest('#notifBell')) {
      panel.style.display = 'none'
    }
  }, true)
}

window.toggleNotifPanel = function() {
  const panel = document.getElementById('notifPanel')
  if (!panel) return
  const willOpen = panel.style.display === 'none'
  panel.style.display = willOpen ? '' : 'none'
  if (willOpen) window.markNotifsRead()
}

let _vendorUnreadCount = 0

window.markNotifsRead = function() {
  if (!_profile) return
  localStorage.setItem(`notifReadAt_${_profile.id}`, Date.now().toString())
  const badge = document.getElementById('notifBadge')
  if (badge) {
    if (_vendorUnreadCount > 0) {
      badge.textContent = _vendorUnreadCount > 9 ? '9+' : String(_vendorUnreadCount)
      badge.style.display = ''
    } else {
      badge.style.display = 'none'
    }
  }
  document.querySelectorAll('#notifList .notif-item:not([data-vendor])').forEach(el => {
    el.style.background = 'transparent'
  })
}

window.goToOrderFromNotif = function(orderId) {
  document.getElementById('notifPanel').style.display = 'none'
  window.location.href = `order.html?id=${orderId}`
}

function initNotifications(profile) {
  injectNotifPanel()
  const getLastRead = () => parseInt(localStorage.getItem(`notifReadAt_${profile.id}`) || '0')

  // Mention badge — subscribe to user_mentions/{uid}
  dataAuthReady.then(() => {
    onSnapshot(doc(db, 'user_mentions', profile.id), snap => {
      _mentionCount = snap.exists() ? (snap.data().unreadMentions || 0) : 0
      const badge = document.getElementById('mentionBadge')
      if (badge) {
        badge.textContent = _mentionCount > 9 ? '9+' : String(_mentionCount)
        badge.style.display = _mentionCount > 0 ? '' : 'none'
      }
    }, () => {})

    // Inbox thread badge — unread dari chat_threads + consultations
    if (profile.role === 'owner' || profile.role === 'manager' || profile.role === 'cs') {
      let _chatUnread = 0
      let _consultUnread = 0
      const _updateInboxBadge = () => {
        const total = _chatUnread + _consultUnread
        const badge = document.getElementById('inboxBadge')
        if (badge) {
          badge.textContent = total > 9 ? '9+' : String(total)
          badge.style.display = total > 0 ? '' : 'none'
        }
      }
      onSnapshot(query(collection(db, 'chat_threads'), where('unreadCount', '>', 0)), snap => {
        _chatUnread = snap.docs.length
        _updateInboxBadge()
      }, () => {})
      onSnapshot(query(collection(db, 'consultations'), where('unreadCount', '>', 0)), snap => {
        _consultUnread = snap.docs.length
        _updateInboxBadge()
      }, () => {})
    }
  })

  // Tunggu dataAuth (harmoni-custom-order anon login) selesai sebelum query Firestore
  dataAuthReady.then(() => {
    let _vendorOrders = []
    let _lastNotifItems = []
    let _lastReadAt = getLastRead()

    const updateBadge = () => {
      const lastReadAt = getLastRead()
      const mainUnread = _lastNotifItems.reduce((sum, n) => {
        if (n.type === 'mention') {
          const ts = n.createdAt?.seconds ? n.createdAt.seconds * 1000 : 0
          return sum + (ts > lastReadAt ? 1 : 0)
        }
        return sum + (n._unreadCount > 0 ? 1 : 0)
      }, 0)
      const total = mainUnread + _vendorUnreadCount
      const badge = document.getElementById('notifBadge')
      if (badge) {
        badge.textContent = total > 9 ? '9+' : String(total)
        badge.style.display = total > 0 ? '' : 'none'
      }
    }

    const renderPanel = () => {
      const list = document.getElementById('notifList')
      if (!list) return
      const lastReadAt = getLastRead()

      const vendorItems = _vendorOrders.map(o => ({
        _isVendor: true,
        orderId: o.id,
        orderNumber: o.orderNumber || '—',
        unreadCount: o.unreadSupplierChat || 0,
        updatedAt: o.updatedAt,
      }))

      const allItems = [...vendorItems, ..._lastNotifItems]
      if (!allItems.length) {
        list.innerHTML = '<div style="padding:24px;text-align:center;font-size:13px;color:rgba(3,69,67,.35)">Belum ada notifikasi</div>'
        return
      }

      list.innerHTML = allItems.slice(0, 20).map(n => {
        if (n._isVendor) {
          return `<div class="notif-item" data-vendor="1" onclick="window.goToOrderFromNotif('${n.orderId}')"
            style="padding:11px 14px;border-bottom:1px solid rgba(3,69,67,.05);cursor:pointer;background:rgba(217,119,6,.06)"
            onmouseover="this.style.background='rgba(3,69,67,.08)'"
            onmouseout="this.style.background='rgba(217,119,6,.06)'">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
              <span style="font-size:11px;font-weight:700;color:#034543">📦 ${n.orderNumber}
                <span style="background:#d97706;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;margin-left:4px">${n.unreadCount} baru</span>
              </span>
              <span style="font-size:10px;color:rgba(3,69,67,.35)">${timeAgo(n.updatedAt)}</span>
            </div>
            <div style="font-size:12px;color:rgba(3,69,67,.6);line-height:1.4">Pesan baru dari vendor — klik untuk buka order</div>
          </div>`
        }

        const ts = n.createdAt?.seconds ? n.createdAt.seconds * 1000 : 0
        const isMention = n.type === 'mention'
        const isUnread = isMention ? ts > lastReadAt : n._unreadCount > 0
        const isApproval = n.type === 'price_approval'
        const approvalBadge = isApproval
          ? (n.priceApprovalTier === 'admin'
              ? `<span style="font-size:10px;font-weight:700;background:#fee2e2;color:#991b1b;padding:1px 5px;border-radius:4px;margin-right:4px">🔒 Admin</span>`
              : `<span style="font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:4px;margin-right:4px">💰 Promo</span>`)
          : ''
        const label = isMention
          ? `<span style="font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:4px;margin-right:4px">@mention</span>${n.orderNumber || ''}`
          : `${approvalBadge}${n.orderNumber || '—'}`
        const countBadge = (!isMention && !isApproval && n._unreadCount > 0)
          ? `<span style="background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;margin-left:4px">${n._unreadCount} baru</span>`
          : ''

        return `<div class="notif-item" onclick="window.goToOrderFromNotif('${n.orderId || ''}')"
          style="padding:11px 14px;border-bottom:1px solid rgba(3,69,67,.05);cursor:pointer;background:${isUnread ? 'rgba(3,69,67,.04)' : 'transparent'}"
          onmouseover="this.style.background='rgba(3,69,67,.08)'"
          onmouseout="this.style.background='${isUnread ? 'rgba(3,69,67,.04)' : 'transparent'}'">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
            <span style="font-size:11px;font-weight:700;color:#034543">${isMention ? '💬' : isApproval ? '🔔' : '🔔'} ${label}${countBadge}</span>
            <span style="font-size:10px;color:rgba(3,69,67,.35)">${timeAgo(n.createdAt)}</span>
          </div>
          <div style="font-size:12px;color:rgba(3,69,67,.6);line-height:1.4"><span style="font-weight:600">${n.fromName}</span>: ${n.preview || ''}</div>
        </div>`
      }).join('')
    }

    // Vendor chat unread listener
    onSnapshot(query(collection(db, 'orders'), where('unreadSupplierChat', '>', 0)), snap => {
      let orders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (profile.role !== 'owner') {
        if (profile.divisions?.length) orders = orders.filter(o => profile.divisions.includes(o.division))
        else orders = orders.filter(o => !o.lokasiId || o.lokasiId === profile.lokasiId)
      }
      _vendorOrders = orders
      _vendorUnreadCount = orders.length
      updateBadge()
      renderPanel()
    }, () => {})

    // Internal notifications listener
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(30))
    onSnapshot(q, snap => {
      let notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      notifs = notifs.filter(n => {
        if (n.fromUid === profile.id) return false
        if (n.type === 'mention') return n.targetUid === profile.id
        if (n.type === 'price_approval') {
          if (profile.role === 'owner') return true
          if (profile.role === 'manager' && n.priceApprovalTier === 'promo') {
            if (profile.divisions?.length) return profile.divisions.includes(n.division)
            return !n.lokasiId || n.lokasiId === profile.lokasiId
          }
          return false
        }
        if (profile.role !== 'owner') {
          if (profile.role === 'divisi' && profile.divisi) return n.division === profile.divisi
          if (profile.divisions?.length) return profile.divisions.includes(n.division)
          return !n.lokasiId || n.lokasiId === profile.lokasiId
        }
        return true
      })

      const lastReadAt = getLastRead()
      const mentions = notifs.filter(n => n.type === 'mention')
      const chatNotifs = notifs.filter(n => n.type !== 'mention')

      const orderMap = {}
      chatNotifs.forEach(n => {
        const key = n.orderId || '_no_order'
        if (!orderMap[key]) orderMap[key] = []
        orderMap[key].push(n)
      })
      const grouped = Object.values(orderMap).map(msgs => {
        const latest = msgs[0]
        const unreadInOrder = msgs.filter(n => {
          const ts = n.createdAt?.seconds ? n.createdAt.seconds * 1000 : 0
          return ts > lastReadAt
        }).length
        return { ...latest, _unreadCount: unreadInOrder, _totalCount: msgs.length }
      }).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))

      _lastNotifItems = [...mentions, ...grouped]
      updateBadge()
      renderPanel()
    }, () => {})
  }) // dataAuthReady.then
}
