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
  if (m === 'cash') return 'Tunai'
  if (m === 'qris') return 'QRIS'
  if (m.startsWith('transfer_')) return 'Transfer ' + m.slice(9).replace(/_/g, ' ').toUpperCase()
  return m
}
export const grupMetode = m => m === 'cash' ? 'tunai' : m === 'qris' ? 'qris' : m?.startsWith('transfer_') ? 'transfer' : 'lain'

// Pilihan metode dari Pengaturan (rekening aktif, QRIS, tunai) — sama dengan form edit pembayaran
export function opsiMetode(paymentInfo, terpilih = '') {
  const opts = []
  ;(paymentInfo?.banks || []).filter(b => b.isActive !== false && b.bankName).forEach(b => {
    const val = 'transfer_' + b.bankName.toLowerCase().replace(/\s+/g, '_')
    opts.push([val, `🏦 Transfer ${b.bankName}`])
  })
  if ((paymentInfo?.qris || []).some(q => q.isActive !== false)) opts.push(['qris', '📱 QRIS'])
  if (paymentInfo?.cashActive !== false) opts.push(['cash', '💵 Tunai'])
  if (!opts.length) opts.push(['cash', '💵 Tunai'], ['qris', '📱 QRIS'], ['transfer_bri', '🏦 Transfer BRI'], ['transfer_bni', '🏦 Transfer BNI'], ['transfer_bca', '🏦 Transfer BCA'], ['transfer_mandiri', '🏦 Transfer Mandiri'])
  if (terpilih && !opts.some(o => o[0] === terpilih)) opts.push([terpilih, labelMetode(terpilih)])
  const uniq = [...new Map(opts).entries()]
  return '<option value="">— Pilih metode —</option>' + uniq.map(([v, l]) => `<option value="${v}" ${v === terpilih ? 'selected' : ''}>${l}</option>`).join('')
}

// Lokasi uang diterima: lokasi staf yang mencatat; kalau staf belum punya lokasi, lokasi order
export function lokasiPembayaran(profile, order) {
  return {
    lokasiId: profile?.lokasiId || order?.lokasiId || '',
    lokasiNama: profile?.lokasiNama || (profile?.lokasiId ? '' : order?.lokasiNama) || '',
  }
}

// Dokumen pembayaran siap ditulis (batch.set(ref, data)). jumlah boleh minus untuk koreksi.
export function entriPembayaran(order, orderId, profile, { jumlah, metode, jenis, catatan = '' }) {
  const ref = doc(collection(db, 'pembayaran'))
  const now = Timestamp.now()
  return { ref, data: {
    orderId, orderNumber: order?.orderNumber || '', customerName: order?.customerName || '', division: order?.division || '',
    orderLokasiId: order?.lokasiId || '', orderOleh: order?.createdByName || '',
    jumlah: Math.round(Number(jumlah) || 0), metode: metode || '', jenis: jenis || 'dp', catatan,
    tgl: tglLokal(), at: now,
    olehUid: profile?.id || '', olehNama: profile?.name || '',
    ...lokasiPembayaran(profile, order),
  } }
}
// Jenis pembayaran dari perubahan DP
export const jenisDari = (lama, baru, total) => baru < lama ? 'koreksi' : (lama <= 0 ? (baru >= total && total > 0 ? 'lunas' : 'dp') : (baru >= total ? 'pelunasan' : 'cicilan'))
