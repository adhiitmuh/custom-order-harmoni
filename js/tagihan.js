// Tagihan: nota custom order yang belum lunas → CS follow up ke pemesan / cek ulang pembayaran.
// Data follow up disimpan di order: tagih = {at, oleh, olehUid, hasil, janjiTgl, catatan} (terakhir)
// dan tagihRiwayat = [ ...semua follow up ].
import { tglLokal } from './pembayaran.js?v=20261108a'

export const ULANG_HARI = 3            // follow up ulang bila sudah 3 hari tanpa kabar
export const HASIL_TAGIH = {
  dihubungi:  { label: 'Sudah dihubungi, menunggu balasan', ikon: '📨' },
  janji:      { label: 'Customer janji bayar', ikon: '🤝' },
  sudahbayar: { label: 'Customer bilang sudah bayar — cek mutasi', ikon: '🔍' },
  tidakbisa:  { label: 'Tidak bisa dihubungi', ikon: '📵' },
  lainnya:    { label: 'Lainnya', ikon: '📝' },
}
const SELESAI = ['done', 'delivered']
const hariAntara = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)
const tglDari = ts => ts?.toDate ? tglLokal(ts.toDate()) : ts?.seconds ? tglLokal(new Date(ts.seconds * 1000)) : (typeof ts === 'string' ? ts.slice(0, 10) : '')

// Status tagihan satu order. null = tidak ada tagihan (lunas / batal / tanpa harga).
export function statusTagihan(o, hariIni = tglLokal()) {
  if (!o || o.status === 'cancelled') return null
  const total = Number(o.totalPrice) || 0, bayar = Number(o.depositPaid) || 0
  const sisa = total - bayar
  if (!total || sisa <= 0) return null
  const tglOrder = o.orderDate || tglDari(o.createdAt) || hariIni
  const umur = Math.max(0, hariAntara(tglOrder, hariIni))
  const lewat = o.dueDate && o.dueDate < hariIni ? hariAntara(o.dueDate, hariIni) : 0
  const sisaHari = o.dueDate ? hariAntara(hariIni, o.dueDate) : null
  let level, alasan
  if (SELESAI.includes(o.status)) { level = 1; alasan = o.status === 'delivered' ? 'Sudah dikirim tapi belum lunas' : 'Pesanan selesai tapi belum lunas' }
  else if (lewat > 0) { level = 2; alasan = `Lewat target ${lewat} hari, belum lunas` }
  else if (bayar <= 0 && umur >= 1) { level = 3; alasan = `Belum ada DP (${umur} hari sejak order)` }
  else if (sisaHari !== null && sisaHari <= 2) { level = 4; alasan = sisaHari === 0 ? 'Target hari ini, belum lunas' : `Target ${sisaHari} hari lagi, belum lunas` }
  else { level = 5; alasan = bayar > 0 ? 'Sudah DP, sisa belum dibayar' : 'Belum ada DP' }
  // Kapan perlu di-follow up: belum pernah, sudah ≥3 hari tanpa kabar, atau tanggal janji bayar sudah tiba
  const t = o.tagih || null
  const terakhir = t ? tglDari(t.at) : ''
  let perlu = level <= 4, ditunda = ''
  if (t) {
    if (t.hasil === 'janji' && t.janjiTgl) { perlu = t.janjiTgl <= hariIni; if (!perlu) ditunda = `Janji bayar ${t.janjiTgl}` }
    else if (t.hasil === 'sudahbayar') { perlu = true }   // harus dicek di mutasi & dicatat pembayarannya
    else if (perlu) { const lama = terakhir ? hariAntara(terakhir, hariIni) : ULANG_HARI; perlu = lama >= ULANG_HARI; if (!perlu) ditunda = `Follow up lagi ${ULANG_HARI - lama} hari lagi` }
  }
  return { total, bayar, sisa, level, alasan, perlu, ditunda, terakhir, tagih: t, lewat, umur }
}

// Pesan WA ke pemesan
export function pesanTagihan(o, { rekening = '', chatUrl = '' } = {}) {
  const rp = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID')
  const sisa = (Number(o.totalPrice) || 0) - (Number(o.depositPaid) || 0)
  return `Halo Kak *${o.customerName || ''}* 🙏\n\nKami dari *Harmoni* ingin konfirmasi pembayaran pesanan *${o.orderNumber || ''}*:\n• Total: ${rp(o.totalPrice)}\n• Sudah dibayar: ${rp(o.depositPaid)}\n• *Sisa: ${rp(sisa)}*\n\nApakah Kakak sudah melakukan pembayaran? Bila sudah, mohon kirimkan bukti transfernya ya Kak, supaya kami cek.${rekening ? `\n\nPembayaran bisa ke:\n${rekening}` : ''}${chatUrl ? `\n\nPantau pesanan: ${chatUrl}` : ''}\n\nTerima kasih 🙏\n_Harmoni · Makassar_`
}
export function linkWaCustomer(kontak, pesan) {
  const no = String(kontak || '').replace(/\D/g, '').replace(/^0/, '62')
  return no.startsWith('62') && no.length >= 9 ? `https://wa.me/${no}?text=${encodeURIComponent(pesan)}` : `https://wa.me/?text=${encodeURIComponent(pesan)}`
}

// Satu pesan untuk semua nota belum lunas milik satu customer (nomor WA sama)
export function pesanTagihanGabung(list, { rekening = '' } = {}) {
  const rp = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID')
  const sisa = o => (Number(o.totalPrice) || 0) - (Number(o.depositPaid) || 0)
  const total = list.reduce((t, o) => t + sisa(o), 0)
  const baris = list.map((o, i) => {
    const item = (o.orderItems || []).map(x => x.name).filter(Boolean).slice(0, 2).join(', ')
    return `${i + 1}. *${o.orderNumber || ''}*${item ? ' — ' + item : ''}\n   Total ${rp(o.totalPrice)} · dibayar ${rp(o.depositPaid)} · *sisa ${rp(sisa(o))}*`
  }).join('\n')
  return `Halo Kak *${list[0]?.customerName || ''}* 🙏\n\nKami dari *Harmoni* ingin konfirmasi pembayaran ${list.length} pesanan Kakak yang belum lunas:\n\n${baris}\n\n*TOTAL SISA: ${rp(total)}*\n\nBila sudah transfer, mohon kirimkan bukti transfernya ya Kak supaya kami cek.${rekening ? `\n\nPembayaran bisa ke:\n${rekening}` : ''}\n\nTerima kasih 🙏\n_Harmoni · Makassar_`
}
