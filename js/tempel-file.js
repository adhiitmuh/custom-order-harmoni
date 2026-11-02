// Tempel (Ctrl/Cmd+V) & seret-lepas file ke semua kolom upload — tanpa perlu menyimpan file dulu.
// File dimasukkan ke <input type="file"> terdekat lalu memicu event "change", jadi alur upload
// tiap fitur (desain, bukti bayar, chat, progress) tetap sama seperti memilih lewat tombol.

const INPUT = 'input[type="file"]'

// Cocokkan file dengan atribut accept (image/*, .pdf, dst.)
function cocokAccept(file, accept) {
  if (!accept) return true
  return accept.split(',').map(a => a.trim().toLowerCase()).some(a => {
    if (!a) return false
    if (a.startsWith('.')) return file.name.toLowerCase().endsWith(a)
    if (a.endsWith('/*')) return (file.type || '').toLowerCase().startsWith(a.slice(0, -1))
    return (file.type || '').toLowerCase() === a
  })
}

// Kolom upload terdekat dari elemen: naik ke atas sampai ketemu wadah yang berisi input file
function inputTerdekat(el) {
  for (let n = el instanceof Element ? el : el?.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    if (n.matches?.(INPUT)) return n
    const ada = [...n.querySelectorAll(INPUT)].filter(i => !i.disabled)
    if (ada.length) return ada[0]
  }
  return null
}
const inputTunggal = () => {
  const semua = [...document.querySelectorAll(INPUT)].filter(i => !i.disabled)
  return semua.length === 1 ? semua[0] : null
}

let _toastT = null
function toast(msg) {
  let t = document.getElementById('tempelToast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'tempelToast'
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#034543;color:#fff;padding:9px 16px;border-radius:999px;font-size:13px;font-weight:600;z-index:10000;box-shadow:0 6px 20px rgba(0,0,0,.2);max-width:90vw;text-align:center'
    document.body.appendChild(t)
  }
  t.textContent = msg
  t.style.display = ''
  clearTimeout(_toastT)
  _toastT = setTimeout(() => { t.style.display = 'none' }, 2600)
}

// Masukkan file ke input lalu jalankan handler upload milik fitur itu
export function isiInputFile(input, files) {
  let list = [...files].filter(f => cocokAccept(f, input.accept))
  if (!list.length) { toast('Jenis file ini tidak bisa diupload di sini'); return false }
  if (!input.multiple) list = list.slice(0, 1)
  // data-tf-tambah: kolom yang baru diupload saat disimpan → tempelan berikutnya menambah, bukan mengganti
  if (input.multiple && input.dataset.tfTambah) list = [...input.files, ...list]
  const dt = new DataTransfer()
  list.forEach(f => dt.items.add(f))
  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  toast(`📎 ${list.length > 1 ? list.length + ' file' : list[0].name} ditambahkan`)
  return true
}

// Gambar hasil copy/screenshot sering bernama "image.png" — beri nama yang jelas
function rapikanNama(file) {
  if (file.name && file.name !== 'image.png' && file.name !== 'image.jpeg') return file
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
  return new File([file], `tempel_${Date.now()}.${ext}`, { type: file.type })
}

// ── Tempel (paste) ──
document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.files || [])].map(rapikanNama)
  if (!files.length) return            // teks biasa: biarkan apa adanya
  // Fokus di kolom teks/isian → pakai kolom upload terdekat darinya; selain itu pakai area yang terakhir diklik
  const ae = document.activeElement
  const fokusIsian = ae && ae !== document.body && ae.matches('input, textarea, select, [contenteditable]')
  const input = (fokusIsian && inputTerdekat(ae)) || inputTerdekat(_terakhir) || inputTerdekat(ae) || inputTunggal()
  if (!input) { toast('Klik dulu area upload yang dituju, lalu tempel lagi'); return }
  e.preventDefault()
  isiInputFile(input, files)
})

// Ingat area yang terakhir disentuh/diklik — dipakai saat tempel di luar kolom teks
let _terakhir = null
document.addEventListener('pointerdown', e => { _terakhir = e.target }, true)

// ── Seret & lepas (drag & drop) ──
let _sorot = null
function sorot(el) {
  if (_sorot === el) return
  if (_sorot) { _sorot.style.outline = _sorot.dataset.tfOutline || ''; _sorot.style.outlineOffset = '' }
  _sorot = el
  if (el) {
    el.dataset.tfOutline = el.style.outline
    el.style.outline = '2px dashed #059669'
    el.style.outlineOffset = '2px'
  }
}
// Wadah yang disorot: label/area di sekitar input (bukan seluruh halaman)
const wadah = input => input.closest('label') && input.closest('label').offsetWidth > 60
  ? input.closest('label')
  : input.closest('.card, [id$="Chat"], [id*="chat"], [id*="Chat"]') || input.parentElement

const adaFile = e => [...(e.dataTransfer?.types || [])].includes('Files')

document.addEventListener('dragover', e => {
  if (!adaFile(e)) return
  e.preventDefault()                    // cegah browser membuka file di tab
  const input = inputTerdekat(e.target) || inputTunggal()
  e.dataTransfer.dropEffect = input ? 'copy' : 'none'
  sorot(input ? wadah(input) : null)
})
document.addEventListener('dragleave', e => { if (!e.relatedTarget) sorot(null) })
document.addEventListener('drop', e => {
  if (!adaFile(e)) return
  e.preventDefault()
  sorot(null)
  const input = inputTerdekat(e.target) || inputTunggal()
  if (!input) { toast('Lepaskan file di area upload'); return }
  isiInputFile(input, e.dataTransfer.files)
})

// ── Tombol "📋 Tempel" untuk iPad/HP (tidak ada Ctrl+V di area non-teks) ──
async function tempelDariClipboard(input) {
  try {
    const items = await navigator.clipboard.read()
    const files = []
    for (const it of items) {
      const tipe = it.types.find(t => t.startsWith('image/') || t === 'application/pdf')
      if (tipe) files.push(rapikanNama(new File([await it.getType(tipe)], 'image.png', { type: tipe })))
    }
    if (!files.length) { toast('Tidak ada gambar di clipboard — salin gambarnya dulu'); return }
    isiInputFile(input, files)
  } catch {
    toast('Browser tidak mengizinkan membaca clipboard — tekan lama di kolom teks lalu Tempel, atau seret filenya')
  }
}
function pasangTombol(input) {
  if (input.dataset.tfTombol || !navigator.clipboard?.read) return
  // Chat punya kolom teks sendiri (tempel langsung di situ), jadi tombol hanya untuk area upload biasa
  const area = input.closest('label') || input.parentElement
  if (!area || area.closest('[id*="chat" i], [id*="Chat"]') || area.querySelector('textarea')) return
  input.dataset.tfTombol = '1'
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = '📋 Tempel'
  b.title = 'Tempel gambar yang sudah di-copy'
  b.style.cssText = 'margin-left:6px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;border:1.5px solid rgba(3,69,67,.2);background:#fff;color:#034543;cursor:pointer;font-family:inherit;vertical-align:middle'
  b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); tempelDariClipboard(input) })
  const label = input.closest('label')
  ;(label || input).insertAdjacentElement('afterend', b)
}
const pasangSemua = () => document.querySelectorAll(INPUT).forEach(pasangTombol)
new MutationObserver(pasangSemua).observe(document.documentElement, { childList: true, subtree: true })
pasangSemua()
