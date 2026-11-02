// Pemberitahuan lewat WhatsApp ke nomor WA tiap divisi (diisi Owner di Kelola Divisi).
// Disimpan di settings/divisi_wa — hanya staf yang bisa membaca (bukan customer).
import { db } from './config.js'
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

const APP_URL = 'https://adhiitmuh.github.io/custom-order-harmoni/'
let _cache = null

export async function loadNoWaDivisi(force = false) {
  if (_cache && !force) return _cache
  try {
    const snap = await getDoc(doc(db, 'settings', 'divisi_wa'))
    _cache = snap.exists() ? (snap.data().nomor || {}) : {}
  } catch { _cache = {} }
  return _cache
}

// 08xx / +62xx / 62xx → 62xx (format wa.me)
export function normalNoWa(n) {
  let d = String(n || '').replace(/\D/g, '')
  if (d.startsWith('0')) d = '62' + d.slice(1)
  return d.length >= 9 ? d : ''
}

export async function simpanNoWaDivisi(divisi, nomor) {
  const nomorBersih = normalNoWa(nomor)
  await setDoc(doc(db, 'settings', 'divisi_wa'), { nomor: { [divisi]: nomorBersih } }, { merge: true })
  if (_cache) _cache[divisi] = nomorBersih
  return nomorBersih
}

export const linkOrder = orderId => `${APP_URL}order.html?id=${orderId}`

// Pop-up "Kabari divisi lewat WhatsApp?" — hanya pemberitahuan; pengirim yang menekan kirim di WA
export async function tawarkanWaDivisi(divisi, labelDivisi, pesan) {
  const nomor = (await loadNoWaDivisi())[divisi]
  document.getElementById('waDivisiPopup')?.remove()
  const el = document.createElement('div')
  el.id = 'waDivisiPopup'
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px'
  const kotak = document.createElement('div')
  kotak.style.cssText = 'background:#fff;border-radius:16px;padding:20px;max-width:380px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.2);font-family:inherit'
  const judul = document.createElement('div')
  judul.style.cssText = 'font-weight:800;font-size:15px;color:#034543;margin-bottom:6px'
  judul.textContent = `📲 Kabari divisi ${labelDivisi} lewat WhatsApp?`
  const isi = document.createElement('div')
  isi.style.cssText = 'font-size:12px;color:rgba(3,69,67,.65);white-space:pre-wrap;background:#f8fafc;border-radius:10px;padding:10px;margin-bottom:14px;max-height:160px;overflow:auto'
  isi.textContent = pesan
  const tombol = document.createElement('div')
  tombol.style.cssText = 'display:flex;gap:8px'
  const lewati = document.createElement('button')
  lewati.textContent = 'Lewati'
  lewati.style.cssText = 'flex:1;padding:10px;border-radius:10px;border:1.5px solid rgba(3,69,67,.2);background:#fff;color:#034543;font-weight:700;cursor:pointer;font-family:inherit'
  lewati.onclick = () => el.remove()
  tombol.appendChild(lewati)
  if (nomor) {
    const kirim = document.createElement('a')
    kirim.textContent = 'Kirim WA'
    kirim.href = `https://wa.me/${nomor}?text=${encodeURIComponent(pesan)}`
    kirim.target = '_blank'
    kirim.rel = 'noopener'
    kirim.style.cssText = 'flex:1;padding:10px;border-radius:10px;background:#25d366;color:#fff;font-weight:800;text-align:center;text-decoration:none'
    kirim.onclick = () => setTimeout(() => el.remove(), 300)
    tombol.appendChild(kirim)
  } else {
    const info = document.createElement('div')
    info.style.cssText = 'flex:2;font-size:11px;color:#b45309;align-self:center'
    info.textContent = `No. WA divisi ${labelDivisi} belum diisi (Owner: Kelola Divisi → Edit).`
    tombol.appendChild(info)
  }
  kotak.append(judul, isi, tombol)
  el.appendChild(kotak)
  el.addEventListener('click', e => { if (e.target === el) el.remove() })
  document.body.appendChild(el)
}
