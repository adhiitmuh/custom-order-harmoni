// Daftar nama papan nama: satu nama per baris, boleh ditambah jumlah per nama di belakangnya:
//   "ANNISA SALSABILA x2", "ANNISA (2)", "ANNISA = 2", "2x ANNISA"
// Aturan: kalau tidak ada satu pun baris yang memakai jumlah → qty dibagi rata per nama.
//         kalau ada → nama tanpa jumlah dihitung 1, dan totalnya harus sama dengan qty item.
const POLA = [
  /^(.*?)\s*[x×]\s*(\d{1,3})$/i,      // NAMA x2
  /^(.*?)\s*\(\s*(\d{1,3})\s*\)$/,     // NAMA (2)
  /^(.*?)\s*=\s*(\d{1,3})$/,           // NAMA = 2
]
export function bacaBaris(baris) {
  const t = String(baris || '').trim()
  for (const p of POLA) { const m = t.match(p); if (m && m[1].trim()) return { nama: m[1].trim(), jml: +m[2] } }
  const d = t.match(/^(\d{1,3})\s*[x×]\s+(.+)$/i)          // 2x NAMA
  if (d) return { nama: d[2].trim(), jml: +d[1] }
  return { nama: t, jml: null }
}

export function daftarNama(teks) {
  return String(teks || '').split(/\n+/).map(x => x.trim()).filter(Boolean).map(bacaBaris)
}

// Ringkasan untuk ditampilkan: { n, total, perRata, pesan, ok }
export function hitungNama(teks, qty) {
  const d = daftarNama(teks), q = Number(qty) || 0, n = d.length
  if (!n) return { n: 0, total: 0, pesan: '', ok: true, baris: d }
  const pakaiJumlah = d.some(x => x.jml)
  if (!pakaiJumlah) {
    const rata = q && q % n === 0 ? q / n : null
    return { n, total: q, perRata: rata, baris: d.map(x => ({ ...x, jml: rata })), ok: !q || !!rata,
      pesan: `${n} nama${q ? ' · qty ' + q + (rata ? ` = ${rata} per nama` : ' (tidak habis dibagi — tulis jumlah per nama, mis. "NAMA x2")') : ''}` }
  }
  const baris = d.map(x => ({ ...x, jml: x.jml || 1 })), total = baris.reduce((t, x) => t + x.jml, 0)
  return { n, total, baris, ok: !q || total === q,
    pesan: `${n} nama · total ${total} papan${q ? (total === q ? ` = qty ${q} ✓` : ` — qty item ${q}, selisih ${q - total > 0 ? 'kurang ' + (q - total) : 'lebih ' + (total - q)}`) : ''}` }
}

// Teks tampilan: "7 nama × 2 papan = 14" lalu daftar nama ("ANNISA ×2" kalau jumlahnya ditulis per nama)
export function labelNama(teks, qty) {
  const h = hitungNama(teks, qty)
  const rata = h.perRata != null && h.perRata > 1
  const pakaiJumlah = h.perRata === undefined
  const judul = h.n <= 1 && !rata && !(pakaiJumlah && h.total > 1) ? ''
    : rata ? `${h.n} nama × ${h.perRata} papan = ${h.total}: `
    : pakaiJumlah ? `${h.n} nama = ${h.total} papan: `
    : `${h.n} nama: `
  const daftar = h.baris.map(x => pakaiJumlah && x.jml > 1 ? `${x.nama} ×${x.jml}` : x.nama)
  return { h, judul, daftar }
}
