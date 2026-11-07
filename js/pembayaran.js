// Riwayat pembayaran order Custom Order — satu dokumen per uang masuk (koleksi `pembayaran`).
// Dipakai order.html / new-order.html saat DP, tambah bayar, lunas, atau koreksi; dibaca laporan-harian.html.
import { db } from './config.js'
import { doc, collection, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

// Tanggal lokal (WITA), bukan UTC
export const tglLokal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 'cash' → Tunai, 'qris' → QRIS, 'transfer_bca' → Transfer BCA
export function labelMetode(m) {
  if (!m) return 'Belum dipilih'
  const [base, no] = String(m).split('@')
  const l = base === 'cash' ? 'Tunai' : base === 'qris' ? 'QRIS'
    : base.startsWith('transfer_') ? 'Transfer ' + base.slice(9).replace(/_/g, ' ').toUpperCase() : base
  return no ? `${l} · ${no}` : l
}
// Nilai pilihan "transfer_bri@1234567890" → metode 'transfer_bri' + nomor rekening tujuan
export function pisahMetode(v) {
  const [metode, rekeningNo = ''] = String(v || '').split('@')
  return { metode, rekeningNo }
}
// Label rekening tujuan sebuah pembayaran: "Transfer BRI · 1234567890" (atau per bank untuk data tanpa nomor)
export const labelRekening = p => labelMetode(p.metode) + (p.rekeningNo ? ' · ' + p.rekeningNo : '')
export const grupMetode = m0 => { const m = String(m0 || '').split('@')[0]; return m === 'cash' ? 'tunai' : m === 'qris' ? 'qris' : m.startsWith('transfer_') ? 'transfer' : 'lain' }

// ── Aturan rekening & QRIS ─────────────────────────────────────────────
// Pembayaran customer: rekening/QRIS dipilih per LOKASI (cabang). Pengaturan divisi
// pada rekening hanya untuk "Rekening Pemilik Divisi" (tujuan bayar modal/kewajiban).
// Data lama (belum disimpan ulang dgn form baru) tetap memakai filter divisi lamanya.
const _divs = b => Array.isArray(b?.divisions) ? b.divisions : (b?.division ? [b.division] : [])
const _locs = x => Array.isArray(x?.lokasiIds) ? x.lokasiIds : []
const _lama = b => b?.terimaCustomer === undefined && b?.rekeningDivisi === undefined
export const bankTerimaCustomer = b => b?.terimaCustomer !== false
export const bankRekeningDivisi = b => b?.rekeningDivisi === true || (_lama(b) && _divs(b).length > 0)
export function banksCustomer(info, { lokasiId = '', division = '' } = {}) {
  return (info?.banks || []).filter(b => {
    if (b.isActive === false || !b.bankName || !bankTerimaCustomer(b)) return false
    const locs = _locs(b)
    if (locs.length && lokasiId && !locs.includes(lokasiId)) return false
    // Khusus order divisi tertentu (HQ dibagi per divisi); data lama memakai pembagian divisi lamanya
    const d = _lama(b) ? _divs(b) : (Array.isArray(b.divisiCustomer) ? b.divisiCustomer : [])
    if (d.length && division && !d.includes(division)) return false
    return true
  })
}
export function qrisCustomer(info, { lokasiId = '', division = '' } = {}) {
  const list = Array.isArray(info?.qris) ? info.qris
    : (info?.qrisImageUrl ? [{ imageUrl: info.qrisImageUrl, isActive: info.qrisActive !== false }] : [])
  return list.filter(q => {
    if (q.isActive === false) return false
    if (Array.isArray(q.lokasiIds)) return !q.lokasiIds.length || !lokasiId || q.lokasiIds.includes(lokasiId)
    return !q.division || !division || q.division === division // data lama
  })
}
// Rekening tujuan pembayaran modal/kewajiban ke pemilik divisi
export const banksPemilikDivisi = (info, div) =>
  (info?.banks || []).filter(b => b.isActive !== false && bankRekeningDivisi(b) && _divs(b).includes(div))
// Kunci QRIS untuk laporan per rekening: "qris@<nama>"
export const kunciQris = (q, i = 0) => String(q?.nama || `QRIS ${i + 1}`).replace(/@/g, '').trim()

// Pilihan metode dari Pengaturan: setiap rekening & QRIS aktif untuk lokasi itu, plus tunai.
// Nilai transfer membawa nomor rekening tujuan: "transfer_bri@1234567890"; QRIS: "qris@QRIS Cabang A".
export function opsiMetode(paymentInfo, terpilih = '', { lokasiId = '', division = '' } = {}) {
  const opts = []
  if (paymentInfo?.cashActive !== false) opts.push(['cash', '💵 Tunai'])
  const qr = qrisCustomer(paymentInfo, { lokasiId, division })
  if (qr.length === 1 && !qr[0].nama) opts.push(['qris', '📱 QRIS'])
  else qr.forEach((q, i) => opts.push(['qris@' + kunciQris(q, i), `📱 QRIS · ${kunciQris(q, i)}`]))
  banksCustomer(paymentInfo, { lokasiId, division }).forEach(b => {
    const val = 'transfer_' + b.bankName.toLowerCase().replace(/\s+/g, '_') + (b.accountNumber ? '@' + String(b.accountNumber).replace(/\s+/g, '') : '')
    opts.push([val, `🏦 Transfer ${b.bankName}${b.accountNumber ? ' · ' + b.accountNumber : ''}${b.accountHolder ? ' (' + b.accountHolder + ')' : ''}`])
  })
  if (!opts.some(o => o[0].startsWith('transfer_'))) opts.push(['transfer_bri', '🏦 Transfer BRI'], ['transfer_bni', '🏦 Transfer BNI'], ['transfer_bca', '🏦 Transfer BCA'], ['transfer_mandiri', '🏦 Transfer Mandiri'])
  // Metode lama tanpa nomor rekening ("transfer_bri") → pilih rekening pertama bank itu
  let pilih = terpilih
  if (pilih && !opts.some(o => o[0] === pilih)) pilih = opts.find(o => o[0].split('@')[0] === pilih)?.[0] || ''
  const uniq = [...new Map(opts).entries()]
  return '<option value="">— Pilih metode —</option>' + uniq.map(([v, l]) => `<option value="${v}" ${v === pilih ? 'selected' : ''}>${l}</option>`).join('')
}

// Lokasi uang diterima: lokasi staf yang mencatat; kalau staf belum punya lokasi, lokasi order
export function lokasiPembayaran(profile, order) {
  return {
    lokasiId: profile?.lokasiId || order?.lokasiId || '',
    lokasiNama: profile?.lokasiNama || (profile?.lokasiId ? '' : order?.lokasiNama) || '',
  }
}

// Dokumen pembayaran siap ditulis (batch.set(ref, data)). jumlah boleh minus untuk koreksi.
export function entriPembayaran(order, orderId, profile, { jumlah, metode: metodeRaw, jenis, catatan = '' }) {
  const ref = doc(collection(db, 'pembayaran'))
  const { metode, rekeningNo } = pisahMetode(metodeRaw)
  const now = Timestamp.now()
  return { ref, data: {
    orderId, orderNumber: order?.orderNumber || '', customerName: order?.customerName || '', division: order?.division || '',
    orderLokasiId: order?.lokasiId || '', orderOleh: order?.createdByName || '',
    jumlah: Math.round(Number(jumlah) || 0), metode: metode || '', rekeningNo, jenis: jenis || 'dp', catatan,
    tgl: tglLokal(), at: now,
    olehUid: profile?.id || '', olehNama: profile?.name || '',
    ...lokasiPembayaran(profile, order),
  } }
}
// Jenis pembayaran dari perubahan DP
export const jenisDari = (lama, baru, total) => baru < lama ? 'koreksi' : (lama <= 0 ? (baru >= total && total > 0 ? 'lunas' : 'dp') : (baru >= total ? 'pelunasan' : 'cicilan'))
