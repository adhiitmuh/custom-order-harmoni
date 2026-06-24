export const DIVISION_META = {
  bordir:       { label: 'Bordir',             code: 'BRD', icon: '🪡',  description: 'Bordir komputer & tangan untuk seragam, kaos, topi, jaket' },
  butik:        { label: 'Butik',              code: 'BTK', icon: '👗',  description: 'Pakaian butik, gaun pesta, kebaya, dan busana formal custom' },
  jersey:       { label: 'Jersey',             code: 'JRS', icon: '⚽',  description: 'Jersey olahraga, printing jersey, batik, dan lanyard custom' },
  jilbab:       { label: 'Jilbab',             code: 'JLB', icon: '🧕',  description: 'Jilbab custom berbagai model dan bahan' },
  sablon:       { label: 'Kaos & Sablon',      code: 'SBL', icon: '🖨️', description: 'Kaos custom dengan berbagai teknik sablon' },
  konveksi:     { label: 'Konveksi',           code: 'KNV', icon: '👕',  description: 'Produksi massal seragam, kaos, dan pakaian kerja' },
  'medali-pin': { label: 'Medali & Pin Logam', code: 'MPL', icon: '🏅',  description: 'Medali dan pin logam custom untuk penghargaan, komunitas, dan souvenir' },
  'papan-nama': { label: 'Papan Nama US & KL', code: 'PPN', icon: '🏷️', description: 'Papan nama custom untuk seragam US dan KL' },
  'pin-fiber':  { label: 'Medali & Pin Fiber',  code: 'PFB', icon: '📌',  description: 'Pin fiber / akrilik dan medali custom berbagai bentuk dan warna' },
  'sewa-kostum':{ label: 'Sewa Kostum',        code: 'SKT', icon: '🎭',  description: 'Sewa kostum untuk acara, pesta, karnaval, dan pertunjukan' },
  tailor:       { label: 'Tailor',             code: 'TLR', icon: '✂️',  description: 'Jahit custom individual sesuai ukuran dan model' },
}

// Urutan sesuai abjad label
export const DIVISIONS = ['bordir','butik','jersey','jilbab','sablon','konveksi','pin-fiber','medali-pin','papan-nama','sewa-kostum','tailor']

export const STATUS_LABEL = {
  'draft':            'Draft — Belum Bayar',
  'pending':          'Menunggu Konfirmasi',
  'pending-approval': 'Menunggu Approval Harga',
  'in-progress':      'Sedang Dikerjakan',
  'quality-check':    'Quality Check',
  'done':             'Selesai',
  'delivered':        'Sudah Dikirim',
  'cancelled':        'Dibatalkan',
}

export const STATUS_CLASS = {
  'draft':            'status-draft',
  'pending':          'status-pending',
  'pending-approval': 'status-approval',
  'in-progress':      'status-in-progress',
  'quality-check':    'status-quality-check',
  'done':             'status-done',
  'delivered':        'status-delivered',
  'cancelled':        'status-cancelled',
}

export function fmtCurrency(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0)
}

export function fmtDate(s) {
  if (!s) return '-'
  const d = s.toDate ? s.toDate() : new Date(s)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function fmtDateInput(s) {
  if (!s) return ''
  const d = s.toDate ? s.toDate() : new Date(s)
  return d.toISOString().split('T')[0]
}

export function fmtDateShort(s) {
  if (!s) return '-'
  const d = s.toDate ? s.toDate() : new Date(s)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

export function daysDiff(s) {
  if (!s) return 0
  const target = s.toDate ? s.toDate() : new Date(s)
  const now = new Date()
  now.setHours(0,0,0,0); target.setHours(0,0,0,0)
  return Math.round((target - now) / 86400000)
}

export function paymentStatus(total, paid) {
  if (!total) return null
  if (paid >= total) return { label: 'Lunas', cls: 'pay-lunas' }
  if (paid > 0)      return { label: 'DP',    cls: 'pay-dp' }
  return { label: 'Belum Bayar', cls: 'pay-belum' }
}

export function timeAgo(s) {
  if (!s) return ''
  const d = s.toDate ? s.toDate() : new Date(s)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h/24)} hari lalu`
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function generateChatToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({length: 24}, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function hasContactInfo(text) {
  const t = text
  if (/\b0\d{8,12}\b/.test(t)) return true
  if (/\+62\d{7,12}/.test(t)) return true
  if (/\b62\d{8,12}\b/.test(t)) return true
  if (/\d[\s.-]{0,2}\d[\s.-]{0,2}\d[\s.-]{0,2}\d[\s.-]{0,2}\d[\s.-]{0,2}\d[\s.-]{0,2}\d[\s.-]{0,2}\d[\s.-]{0,2}\d[\s.-]{0,2}\d/.test(t)) return true
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(t)) return true
  if (/wa\.me|t\.me|line\.me|wa\.link|bit\.ly|tinyurl|fb\.me/.test(t.toLowerCase())) return true
  if (/@[a-zA-Z0-9_.]{3,}/.test(t)) return true
  return false
}

// Deteksi pola mencurigakan yang tidak secara eksplisit berisi kontak
// tapi mengindikasikan upaya redirect customer ke luar platform
export function detectSuspiciousMsg(text) {
  const t = text.toLowerCase()
  const patterns = [
    { re: /\b(wa|whatsapp)\s*(saya|aku|gue|gw|ku|sy)\b/, reason: 'Menyebut WA pribadi' },
    { re: /\b(ig|instagram|telegram|tiktok|line)\s*(saya|aku|gue|gw|ku|sy)\b/, reason: 'Menyebut medsos pribadi' },
    { re: /\bhubungi\s*(saya|aku|gue|gw|langsung)\b/, reason: 'Minta dihubungi langsung' },
    { re: /\b(kontak|contact)\s*(saya|aku|pribadi|langsung)\b/, reason: 'Menawarkan kontak pribadi' },
    { re: /\bdi\s*luar\s*(sini|sana|platform|aplikasi|app|sistem|chat)\b/, reason: 'Ajak komunikasi di luar platform' },
    { re: /\b(lanjut|pindah|chat|diskusi|ngobrol)\s*(di\s*)?(luar|via\s*(wa|whatsapp|instagram|telegram|ig))\b/, reason: 'Ajak chat di luar platform' },
    { re: /\b(harga\s*khusus|diskon\s*pribadi|deal\s*sendiri|harga\s*beda)\b/, reason: 'Menawarkan harga di luar sistem' },
    { re: /\b(jualan|toko|olshop)\s*(sendiri|ku|aku|saya|gue)\b/, reason: 'Promosi bisnis pribadi' },
    { re: /\bnomor\s*(hp|handphone|telepon|wa|saya|ku|gue)\b/, reason: 'Menyebut nomor pribadi' },
    { re: /\b(cari|add|follow|dm)\s*(saya|aku|gue|gw)\b/, reason: 'Minta di-follow / add akun pribadi' },
  ]
  for (const p of patterns) {
    if (p.re.test(t)) return { flagged: true, reason: p.reason }
  }
  return { flagged: false, reason: '' }
}

export const ROLE_LABEL = {
  owner:      'Owner',
  manager:    'Kepala Cabang',
  cs:         'CS',
  production: 'Tim Produksi',
}

export const PRODUKSI_UNIT = {
  jersey:       'Gaara Apparel',
  konveksi:     'Young Harmonis Konveksi',
  jilbab:       'Young Harmonis Konveksi',
  butik:        'Young Harmonis Konveksi',
  tailor:       'Young Harmonis Konveksi',
  bordir:       'Bordir Unit',
  'papan-nama': 'Bordir Unit',
  sablon:       'Sablon Unit',
  'medali-pin': 'Medali & Pin Unit',
  'pin-fiber':  'Medali & Pin Unit',
  'sewa-kostum':'Sewa Kostum Unit',
}

export const LOKASI_TIPE_LABEL = {
  pusat:  'Harmoni Indonesia (Pusat)',
  cabang: 'Harmoni Cabang',
  titik:  'Titik Harmoni',
}

export const LOKASI_TIPE_ICON = {
  pusat:  '🏢',
  cabang: '🏬',
  titik:  '📍',
}

// Check which price tier a given price falls into for a division
// Returns: 'normal' | 'promo' | 'admin' | 'blocked'
export function checkPriceTier(totalPrice, priceList) {
  if (!priceList || !priceList.items?.length) return 'normal'
  // Use the lowest priceNormal as reference for the division minimum
  const normals = priceList.items.map(i => i.priceNormal).filter(Boolean)
  const promos  = priceList.items.map(i => i.pricePromo).filter(Boolean)
  const admins  = priceList.items.map(i => i.priceAdmin).filter(Boolean)
  const minNormal = normals.length ? Math.min(...normals) : 0
  const minPromo  = promos.length  ? Math.min(...promos)  : 0
  const minAdmin  = admins.length  ? Math.min(...admins)  : 0
  if (!minNormal) return 'normal'
  if (totalPrice >= minNormal) return 'normal'
  if (minPromo && totalPrice >= minPromo) return 'promo'
  if (minAdmin && totalPrice >= minAdmin) return 'admin'
  if (minAdmin && totalPrice < minAdmin) return 'blocked'
  return 'promo'
}
