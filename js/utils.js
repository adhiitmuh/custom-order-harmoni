export const DIVISION_META = {
  bordir:       { label: 'Bordir',             code: 'BRD', icon: '🪡',  description: 'Bordir komputer & tangan untuk seragam, kaos, topi, jaket' },
  'papan-nama': { label: 'Papan Nama US & KL', code: 'PPN', icon: '🏷️', description: 'Papan nama custom untuk seragam US dan KL' },
  konveksi:     { label: 'Konveksi',            code: 'KNV', icon: '👕',  description: 'Produksi massal seragam, kaos, dan pakaian kerja' },
  tailor:       { label: 'Tailor',              code: 'TLR', icon: '✂️',  description: 'Jahit custom individual sesuai ukuran dan model' },
  jersey:       { label: 'Jersey',              code: 'JRS', icon: '⚽',  description: 'Jersey olahraga full custom: futsal, basket, voli, badminton' },
  sablon:       { label: 'Kaos & Sablon',       code: 'SBL', icon: '🖨️', description: 'Kaos custom dengan berbagai teknik sablon' },
  jilbab:       { label: 'Jilbab',              code: 'JLB', icon: '🧕',  description: 'Jilbab custom berbagai model dan bahan' },
  'baju-pesta': { label: 'Baju Pesta',          code: 'BPT', icon: '👗',  description: 'Baju pesta, gaun, dan pakaian formal custom' },
  'pin-logam':  { label: 'Pin Logam',           code: 'PLG', icon: '🔩',  description: 'Pin logam custom untuk seragam, komunitas, dan souvenir' },
  'pin-fiber':  { label: 'Pin Fiber',           code: 'PFB', icon: '📌',  description: 'Pin fiber / akrilik custom berbagai bentuk dan warna' },
}

export const DIVISIONS = ['bordir', 'papan-nama', 'konveksi', 'tailor', 'jersey', 'sablon', 'jilbab', 'baju-pesta', 'pin-logam', 'pin-fiber']

export const STATUS_LABEL = {
  'pending':       'Menunggu Konfirmasi',
  'in-progress':   'Sedang Dikerjakan',
  'quality-check': 'Quality Check',
  'done':          'Selesai',
  'delivered':     'Sudah Dikirim',
  'cancelled':     'Dibatalkan',
}

export const STATUS_CLASS = {
  'pending':       'status-pending',
  'in-progress':   'status-in-progress',
  'quality-check': 'status-quality-check',
  'done':          'status-done',
  'delivered':     'status-delivered',
  'cancelled':     'status-cancelled',
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
