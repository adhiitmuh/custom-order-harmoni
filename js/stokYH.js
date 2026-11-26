// Stok barang jadi YH Sistem Produksi (penjahit) untuk Custom Order.
// Nama item YH (mis. "Baju Korpri Pria") dihubungkan ke nama di daftar harga CO
// (mis. "BAJU KORPRI KERAH HITAM ( PRIA )") lewat settings/link_yh { map: { [namaYH]: namaCO } }.
// Ukuran YH = varian CO (S, M, L, …). Stok YH: config/stok { "NamaYH||UK": pcs } — hanya bertambah lewat QC di YH.
import { db } from './config.js'
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { kunciNama } from './hargaList.js?v=20261110a'

const PROJECT = 'yh-sistem-produksi', KEY = 'AIzaSyDxkuQMUb0735kE2RrpSUtbuKSxfc-Kyqo'
const DOCS = `projects/${PROJECT}/databases/(default)/documents`
const FS = `https://firestore.googleapis.com/v1/${DOCS}`

function dariFs(v) {
  if (!v) return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return +v.integerValue
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dariFs)
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dariFs(x)]))
  return null
}
const keFs = v => typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === 'boolean' ? { booleanValue: v } : v == null ? { nullValue: null }
  : Array.isArray(v) ? { arrayValue: { values: v.map(keFs) } }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, keFs(x)])) } }
  : { stringValue: String(v) }

async function bacaDocYH(path) {
  const r = await fetch(`${FS}/${path}?key=${KEY}`)
  if (r.status === 404) return {}
  if (!r.ok) throw new Error('Stok YH tidak bisa dibaca (' + r.status + ')')
  return Object.fromEntries(Object.entries((await r.json()).fields || {}).map(([k, v]) => [k, dariFs(v)]))
}

export const kunciStokYH = (namaYH, ukuran) => `${namaYH}||${String(ukuran || '').trim().toUpperCase()}`
export async function daftarItemYH() { return ((await bacaDocYH('config/settings')).items || []).map(i => i.nama).filter(Boolean) }
export async function stokYH() { return bacaDocYH('config/stok') }
export async function linkYH() { try { return (await getDoc(doc(db, 'settings', 'link_yh'))).data()?.map || {} } catch { return {} } }

// Data sekali muat per halaman (stok dimuat ulang setelah ambil)
let _cache = null
export async function dataYH(segar = false) {
  if (_cache && !segar) return _cache
  const [link, stok] = await Promise.all([linkYH(), stokYH().catch(() => null)])
  const keYH = {}; Object.entries(link).forEach(([yh, co]) => { if (co) keYH[kunciNama(co)] = yh })
  // Stok YH disimpan dengan ukuran apa adanya — cari tanpa beda huruf besar/kecil
  const stokNorm = {}; Object.entries(stok || {}).forEach(([k, n]) => { const [nm, uk] = k.split('||'); stokNorm[`${nm}||${String(uk || '').trim().toUpperCase()}`] = { kunciAsli: k, n: +n || 0 } })
  _cache = { keYH, stokNorm, gagal: stok === null }
  return _cache
}
// Item CO (nama + varian) → { namaYH, ukuran, kunciAsli, n } atau null bila belum dihubungkan
export function cariStokYH(d, nama, varian) {
  const namaYH = d?.keYH[kunciNama(nama)]
  if (!namaYH) return null
  const ukuran = String(varian || '').trim().toUpperCase()
  const s = d.stokNorm[kunciStokYH(namaYH, ukuran)]
  return { namaYH, ukuran, kunciAsli: s?.kunciAsli || kunciStokYH(namaYH, ukuran), n: s?.n || 0 }
}

// YH memakai login anonim untuk menulis data — ambil token sekali per sesi
async function tokenYH() {
  try { const t = JSON.parse(sessionStorage.getItem('yh_token') || 'null'); if (t && t.exp > Date.now() + 60000) return t.id } catch {}
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) })
  if (!r.ok) return null
  const j = await r.json(); try { sessionStorage.setItem('yh_token', JSON.stringify({ id: j.idToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 })) } catch {}
  return j.idToken
}

// Ambil dari stok jadi YH: kurangi config/stok + catat di Stok Keluar YH (sekali kirim, atomik)
export async function ambilStokYH({ kunciAsli, namaYH, ukuran, pcs, orderNumber, customer, oleh }) {
  const now = new Date().toISOString(), tgl = now.slice(0, 10)
  const idKeluar = 'co_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const writes = [
    { transform: { document: `${DOCS}/config/stok`, fieldTransforms: [{ fieldPath: '`' + kunciAsli.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`', increment: { integerValue: String(-pcs) } }] } },
    { update: { name: `${DOCS}/keluar/${idKeluar}`, fields: Object.fromEntries(Object.entries({
      tujuan: 'Custom Order' + (customer ? ' — ' + customer : ''), order: orderNumber || '', tanggal: tgl,
      ket: `Diambil dari Custom Order oleh ${oleh || '-'}`, fotos: [], items: [{ nama: namaYH, ukuran, pcs }], totalPcs: pcs,
      sumber: 'custom-order', createdByNama: oleh || '' }).map(([k, v]) => [k, keFs(v)]).concat([['createdAt', { timestampValue: now }]])) },
      currentDocument: { exists: false } },
  ]
  const tok = await tokenYH()
  const r = await fetch(`${FS}:commit?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify({ writes }) })
  if (!r.ok) throw new Error('Gagal mencatat di YH (' + r.status + ')')
  _cache = null
  return { idKeluar, tgl }
}
