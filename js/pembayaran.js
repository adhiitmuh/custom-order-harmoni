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

// Pilihan metode dari Pengaturan: setiap rekening aktif (sesuai lokasi & divisi), QRIS, tunai.
// Nilai transfer membawa nomor rekening tujuan: "transfer_bri@1234567890".
export function opsiMetode(paymentInfo, terpilih = '', { lokasiId = '', division = '' } = {}) {
  const opts = []
  if (paymentInfo?.cashActive !== false) opts.push(['cash', '💵 Tunai'])
  if ((paymentInfo?.qris || []).some(q => q.isActive !== false) || paymentInfo?.qrisActive) opts.push(['qris', '📱 QRIS'])
  ;(paymentInfo?.banks || []).filter(b => {
    if (b.isActive === false || !b.bankName) return false
    const divs = Array.isArray(b.divisions) ? b.divisions : (b.division ? [b.division] : [])
    const locs = Array.isArray(b.lokasiIds) ? b.lokasiIds : []
    return (!divs.length || !division || divs.includes(division)) && (!locs.length || !lokasiId || locs.includes(lokasiId))
  }).forEach(b => {
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
