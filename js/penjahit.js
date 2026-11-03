// Penjahit per order (Jersey/Tailor): beberapa penjahit bisa berbagi satu order.
// order.tailors        = [{ id, nama, qty, upah, catatan }]  — diisi produksi/owner
// order.tailorPayments = { [id]: { jumlah, at, by } }         — HANYA Owner (dikunci di firestore.rules)
// Data lama (tailorName + tailorPaid) tetap dibaca sebagai satu penjahit.

export const DIVISI_PENJAHIT = ['jersey', 'tailor']

export function daftarPenjahit(o) {
  if (Array.isArray(o?.tailors) && o.tailors.length) return o.tailors
  if (o?.tailorName) return [{ id: 'lama', nama: o.tailorName, qty: null, upah: null, catatan: '' }]
  return []
}

export function pembayaranPenjahit(o, t) {
  const p = o?.tailorPayments?.[t.id]
  if (p) return p
  // Data lama: satu tanda "Upah Sudah Ditransfer" untuk seluruh order
  if (t.id === 'lama' && o?.tailorPaid) return { jumlah: null, at: o.tailorPaidAt || null, by: o.tailorPaidBy || '' }
  return null
}

// Ringkasan upah jahit satu order
export function statusUpahPenjahit(o) {
  const list = daftarPenjahit(o)
  if (!list.length) return { status: 'kosong', total: 0, dibayar: 0, sisa: 0, jumlah: 0, lunasCount: 0 }
  let total = 0, dibayar = 0, lunasCount = 0
  list.forEach(t => {
    const upah = Number(t.upah) || 0
    total += upah
    const p = pembayaranPenjahit(o, t)
    if (p) { lunasCount++; dibayar += Number(p.jumlah ?? upah) || 0 }
  })
  const status = lunasCount === list.length ? 'lunas' : lunasCount > 0 ? 'sebagian' : 'belum'
  return { status, total, dibayar, sisa: Math.max(0, total - dibayar), jumlah: list.length, lunasCount }
}

const rp = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID')

// Badge kecil untuk daftar order / laporan
export function badgeUpahPenjahit(o, { ringkas = false } = {}) {
  if (!DIVISI_PENJAHIT.includes(o?.division)) return ''
  const s = statusUpahPenjahit(o)
  const gaya = 'font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;white-space:nowrap;'
  if (s.status === 'kosong') return `<span style="${gaya}background:rgba(3,69,67,.06);color:rgba(3,69,67,.45)">🧵 penjahit belum diisi</span>`
  if (s.status === 'lunas') return `<span style="${gaya}background:#ecfdf5;color:#047857">🧵 upah ditransfer${ringkas ? '' : ' · ' + s.jumlah + ' penjahit'}</span>`
  const ket = s.status === 'sebagian' ? `${s.lunasCount}/${s.jumlah} ditransfer` : 'belum ditransfer'
  return `<span style="${gaya}background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">🧵 upah ${ket}${s.sisa && !ringkas ? ' · sisa ' + rp(s.sisa) : ''}</span>`
}
