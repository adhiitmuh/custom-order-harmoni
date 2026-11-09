// Daftar harga Custom Order — aturan siapa boleh mengisi kolom harga, simpan, & cek nama mirip.
// Penegak aturan yang sebenarnya ada di Worker (/price-list-save) + Firestore Rules
// (price_list hanya bisa ditulis langsung oleh Owner). Modul ini mencerminkan aturan yang sama
// supaya tampilan langsung mengunci kolom yang tidak boleh diisi.
import { db, auth } from './config.js'
import { doc, setDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

const WORKER_URL = 'https://harmoni-order-api.adhiitmuh.workers.dev'
export const HARGA_KOLOM = ['priceNormal', 'priceCabang', 'pricePromo', 'priceAdmin', 'priceModal']
export const LABEL_HARGA = { priceNormal: 'Normal', priceCabang: 'Cabang', pricePromo: 'Promo', priceAdmin: 'Admin', priceModal: 'Modal' }

// Divisi milik Pemilik Divisi (bisa beberapa; diatur Owner di Portal)
export const divisiMilik = p => p?.role !== 'divisi' ? [] : ((p.divisions || []).filter(Boolean).length ? p.divisions.filter(Boolean) : (p.divisi ? [p.divisi] : []))
const IZIN = {
  // Pemilik Divisi di divisinya sendiri: semua kolom, ganti nama, ✓ cek item baru & setujui usulan
  pemilik: { isiKosong: [], ubah: ['priceNormal', 'priceCabang', 'pricePromo', 'priceAdmin', 'priceModal'] },
  // Pengisi daftar harga (izin khusus dari Owner per divisi): Normal, Cabang, Promo & Modal. Admin tetap Owner.
  pengisi: { isiKosong: [], ubah: ['priceNormal', 'priceCabang', 'pricePromo', 'priceModal'] },
  cs:      { isiKosong: ['priceNormal', 'priceCabang'], ubah: [] },
  manager: { isiKosong: [], ubah: ['priceNormal', 'priceCabang', 'pricePromo'] },
  data:    { isiKosong: [], ubah: ['priceNormal', 'priceCabang', 'priceModal'] },
  divisi:  { isiKosong: [], ubah: ['priceNormal', 'priceCabang', 'priceModal'] },
}

// Boleh menambah item / mengubah daftar harga divisi ini?
// Izin khusus per orang per divisi (settings/izin_harga) — dimuat halaman ke profile.izinHarga
export const roleHarga = (profile, division) =>
  profile?.role === 'owner' ? 'owner'
  : profile?.role === 'divisi' && division && divisiMilik(profile).includes(division) ? 'pemilik'
  : division && (profile?.izinHarga || []).includes(division) ? 'pengisi' : profile?.role
// Boleh menyetujui (✓ cek item baru, usulan harga) di divisi ini? Owner, atau Pemilik Divisi di divisinya
export const bolehSetujuiHargaDivisi = (profile, division) => ['owner', 'pemilik'].includes(roleHarga(profile, division))
export function bolehKelolaHarga(profile, division) {
  const rh = roleHarga(profile, division)
  if (rh === 'pengisi' || rh === 'pemilik' || rh === 'owner') return true
  const r = profile?.role
  if (r === 'divisi') return false
  return !!IZIN[r]
}
// Boleh mengisi kolom harga `k` yang saat ini bernilai `lama` (0 = kosong / item baru)?
// `baru` = item/varian masih berstatus baru (belum dicek Owner) → CS masih boleh memperbaiki.
export function bolehIsiHarga(profile, k, lama = 0, baru = false, division = '') {
  const r = roleHarga(profile, division)
  if (r === 'owner') return true
  const iz = IZIN[r]; if (!iz) return false
  return iz.ubah.includes(k) || (iz.isiKosong.includes(k) && (!(Number(lama) > 0) || baru === true))
}
export const bolehHapusItem = profile => profile?.role === 'owner'
export const keteranganIzin = (profile, division = '') => roleHarga(profile, division) === 'pemilik' ? 'Pemilik Divisi: semua kolom harga divisi ini bisa diubah, termasuk ganti nama, ✓ cek item baru & menyetujui usulan harga.' : roleHarga(profile, division) === 'pengisi' ? 'Izin pengisi daftar harga divisi ini: bisa mengisi Normal, Cabang, Promo & Modal. Harga Admin diisi Owner.' : ({
  owner: 'Owner: semua kolom bisa diubah.',
  manager: 'Kepala Cabang: bisa mengisi Normal, Cabang & Promo. Admin & Modal diisi Owner.',
  cs: 'CS: bisa menambah item baru & mengisi harga Normal/Cabang yang masih kosong. Mengubah harga yang sudah ada → Kepala Cabang/Owner.',
  data: 'Data: bisa mengisi Normal, Cabang & Modal.',
  divisi: 'Pemilik Divisi: bisa mengisi Normal, Cabang & Modal divisi sendiri.',
}[profile?.role] || 'Hanya bisa melihat daftar harga.')

// ── Nama item: kunci & kemiripan (mencegah item dobel) ──
export const kunciNama = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const rapat = s => kunciNama(s).replace(/ /g, '')
function jarak(a, b) {
  if (a === b) return 0
  const m = a.length, n = b.length; if (!m || !n) return m || n
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}
// Skor 0..1 kemiripan dua nama item
export function skorMirip(a, b) {
  const x = rapat(a), y = rapat(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return 0.9
  const kataA = new Set(kunciNama(a).split(' ').filter(w => w.length > 1)), kataB = new Set(kunciNama(b).split(' ').filter(w => w.length > 1))
  const sama = [...kataA].filter(w => kataB.has(w)).length
  const jaccard = sama / (new Set([...kataA, ...kataB]).size || 1)
  const lev = 1 - jarak(x, y) / Math.max(x.length, y.length)
  return Math.max(jaccard, lev)
}
// Item di daftar yang namanya sama/mirip dengan `nama` (urut paling mirip)
export function cariMirip(nama, items, batas = 0.72, kecuali = -1) {
  return (items || []).map((it, i) => ({ it, i, skor: skorMirip(nama, it.name) }))
    .filter(x => x.i !== kecuali && x.skor >= batas).sort((a, b) => b.skor - a.skor)
}

// Rapikan satu item sebelum disimpan — kolom lain (minQty, baru, dibuatOleh, …) tetap dibawa
export function rapikanItem(item) {
  const { _tersimpan, ...asli } = item
  const out = { ...asli, name: String(item.name || '').trim().toUpperCase(), unit: String(item.unit || '').trim(), note: String(item.note || '').trim() }
  HARGA_KOLOM.forEach(k => { out[k] = Number(item[k]) || 0 })
  out.variants = (item.variants || []).filter(v => String(v.name || '').trim()).map(v => {
    const { _tersimpan: _t, ...va } = v
    const o = { ...va, name: String(v.name).trim().toUpperCase() }
    HARGA_KOLOM.forEach(k => { o[k] = Number(v[k]) || 0 })
    return o
  })
  return out
}

const _pub = ({ priceModal, pricePromo, priceAdmin, priceCabang, baru, dibuatOleh, dibuatAt, ...x }) => x
export const hargaPublik = items => (items || []).map(it => { const x = _pub(it); if (Array.isArray(x.variants)) x.variants = x.variants.map(_pub); return x })

// Simpan daftar harga satu divisi. Owner menulis langsung; role lain lewat Worker yang
// memeriksa kolom per role. Hasil: { items (versi tersimpan), ditolak: [pesan] }.
// mode 'tambah' = hanya menambah item yang belum ada (dipakai form order baru).
export async function simpanDaftarHarga(profile, division, items, mode = 'ganti') {
  const rapi = (items || []).map(rapikanItem).filter(it => it.name)
  if (profile?.role === 'owner' && mode !== 'tambah') {
    rapi.forEach(it => { delete it.namaLama; (it.variants || []).forEach(v => { delete v.namaLama }) })
    await setDoc(doc(db, 'price_list', division), { division, items: rapi, updatedAt: Timestamp.now() })
    await setDoc(doc(db, 'price_list_public', division), { division, items: hargaPublik(rapi), updatedAt: Timestamp.now() }).catch(() => {})
    return { items: rapi, ditolak: [] }
  }
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) throw new Error('Sesi login habis — muat ulang halaman')
  const res = await fetch(`${WORKER_URL}/price-list-save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ division, items: rapi, mode }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Gagal menyimpan (${res.status})`)
  return { items: data.items || rapi, ditolak: data.ditolak || [], usulan: data.usulan || 0 }
}

// ── Tingkat harga order (approval) ───────────────────────────────────────────
// Per pcs:  ≥ Normal (di cabang: ≥ Cabang kalau diisi) → normal (langsung)
//           ≥ Promo  → promo (Kepala Cabang)   ≥ Admin → admin (Owner)
//           di bawah Admin, atau di bawah Modal → blocked
// Diskon total (total order < jumlah item) ikut dihitung: harga per pcs × (total / jumlah item).
export const URUTAN_TIER = { normal: 0, promo: 1, admin: 2, blocked: 3 }
export const LABEL_TIER = { normal: 'Normal', promo: 'Promo (Kepala Cabang)', admin: 'Admin (Owner)', blocked: 'Di bawah batas' }
const cariKatalog = (items, name, varian) => {
  const cat = (items || []).find(p => kunciNama(p.name) === kunciNama(name))
  if (!cat) return null
  const v = varian && (cat.variants || []).find(x => kunciNama(x.name) === kunciNama(varian))
  return { cat, harga: v || cat, varianBaru: !!(varian && cat.variants?.length && !v) }
}
export function tierItem(hargaPcs, h, diCabang = false) {
  const n = Number(h.priceNormal) || 0, c = Number(h.priceCabang) || 0, pr = Number(h.pricePromo) || 0
  const a = Number(h.priceAdmin) || 0, m = Number(h.priceModal) || 0
  const dasar = (diCabang && c) ? c : n
  if (m && hargaPcs < m) return { tier: 'blocked', alasan: 'di bawah harga modal', dasar, dibawahModal: true }
  if (!dasar || hargaPcs >= dasar) return { tier: 'normal', dasar }
  // Di cabang: harga Normal pusat (di bawah Harga Cabang) = diskon cabang → Kepala Cabang
  if (diCabang && c && n && hargaPcs >= n) return { tier: 'promo', dasar, diskonCabang: true }
  if (pr && hargaPcs >= pr) return { tier: 'promo', dasar }
  if (a && hargaPcs >= a) return { tier: 'admin', dasar }
  if (!pr && !a) return { tier: 'admin', dasar }            // batas belum diatur → Owner yang putuskan
  if (!a) return { tier: 'admin', dasar }                   // ada promo, admin belum diisi → Owner
  return { tier: 'blocked', alasan: `di bawah harga Admin (Rp ${a.toLocaleString('id-ID')})`, dasar }
}
// items: [{name, varian, qty, pricePerUnit}] ; daftar: price_list items
export function nilaiTierOrder(items, daftar, { diCabang = false, totalPrice = null } = {}) {
  const jumlah = (items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.pricePerUnit ?? it.price) || 0), 0)
  const faktor = (totalPrice != null && jumlah > 0 && totalPrice < jumlah) ? totalPrice / jumlah : 1
  let tier = 'normal'
  const rincian = [], itemBaru = []
  for (const it of items || []) {
    if (!String(it.name || '').trim()) continue
    const k = cariKatalog(daftar, it.name, it.varian)
    if (!k || k.varianBaru) { itemBaru.push(it.varian && k ? `${it.name} – ${it.varian}` : it.name); rincian.push({ name: it.name, tier: 'baru' }); continue }
    const hargaAsli = Number(it.pricePerUnit ?? it.price) || 0
    if (!hargaAsli) continue // item tanpa harga (bonus/termasuk paket) tidak dinilai
    const efektif = Math.round(hargaAsli * faktor)
    const r = tierItem(efektif, k.harga, diCabang)
    rincian.push({ name: it.name, varian: it.varian || '', ...r, harga: efektif })
    if (URUTAN_TIER[r.tier] > URUTAN_TIER[tier]) tier = r.tier
  }
  const dibawahModal = rincian.some(r => r.dibawahModal)
  return { tier, rincian, itemBaru, dibawahModal, diskonPersen: Math.round((1 - faktor) * 100) }
}
// Siapa boleh menyetujui tier ini
export const bolehSetujui = (profile, tier, division = '') => profile?.role === 'owner' || (profile?.role === 'manager' && tier === 'promo')
  || (['promo', 'admin'].includes(tier) && !!division && divisiMilik(profile).includes(division))
