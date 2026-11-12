// Baca daftar nama dari foto (OCR) — berjalan di perangkat (Tesseract.js), tanpa biaya & tanpa mengirim foto ke pihak lain.
// Hasil selalu dicek CS sebelum disimpan (OCR bisa salah huruf).
let _muat = null
function muatTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  if (_muat) return _muat
  _muat = new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
    s.onload = () => res(window.Tesseract)
    s.onerror = () => { _muat = null; rej(new Error('Gagal memuat pembaca foto — cek koneksi internet')) }
    document.head.appendChild(s)
  })
  return _muat
}

// Rapikan hasil OCR jadi satu nama per baris: buang nomor urut, simbol, baris kosong
export function rapikanNama(teks) {
  return String(teks || '').split(/\n+/)
    .map(l => l.replace(/^\s*\d+\s*[\.\)\-:]\s*/, '').replace(/[|_~`*•·"“”]+/g, ' ').replace(/\s{2,}/g, ' ').trim().toUpperCase())
    .filter(l => l.length >= 2 && /[A-Z]/.test(l))
}

export async function bacaNamaDariGambar(sumber, onProgress) {
  const T = await muatTesseract()
  const { data } = await T.recognize(sumber, 'ind+eng', {
    logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round((m.progress || 0) * 100)) },
  })
  return rapikanNama(data.text)
}

const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Pasang tombol "📷 Baca dari foto" di editor daftar nama.
// wadah: elemen tempat tombol; ta: textarea nama; info: elemen pesan; fotoOrder: daftar URL foto/desain order
export function pasangBacaFoto(wadah, ta, info, fotoOrder = [], setelah = () => {}) {
  const gambar = (fotoOrder || []).filter(u => !/\.pdf(\?|$)/i.test(u))
  const box = document.createElement('div')
  box.style.cssText = 'margin:6px 0;padding:8px;border:1px dashed rgba(124,58,237,.35);border-radius:8px;font-size:12px'
  box.innerHTML = `<div style="font-weight:700;color:#7c3aed;margin-bottom:6px">📷 Baca nama dari foto</div>
    ${gambar.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${gambar.map((u, i) => `<img src="${esc(u)}" data-i="${i}" title="Baca foto ini" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid rgba(3,69,67,.15);cursor:pointer">`).join('')}</div><div style="font-size:11px;color:rgba(3,69,67,.55);margin-bottom:6px">Ketuk foto order di atas, atau:</div>` : ''}
    <div style="font-size:11px;color:rgba(3,69,67,.55);margin-bottom:6px">Tarik (drag) foto ke sini, atau:</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <label class="btn btn-ghost btn-sm" style="cursor:pointer">🖼 Pilih foto<input type="file" accept="image/*" style="display:none"></label>
      <button type="button" class="btn btn-ghost btn-sm" data-tempel>📋 Tempel foto</button>
    </div>`
  wadah.appendChild(box)
  const jalankan = async sumber => {
    info.style.color = '#7c3aed'; info.textContent = '⏳ Membaca foto… (pertama kali agak lama)'
    try {
      const nama = await bacaNamaDariGambar(sumber, p => { info.textContent = `⏳ Membaca foto… ${p}%` })
      if (!nama.length) { info.style.color = '#b45309'; info.textContent = 'Tidak ada tulisan yang terbaca — coba foto yang lebih jelas / lurus'; return }
      const lama = ta.value.trim()
      ta.value = (lama ? lama + '\n' : '') + nama.join('\n')
      setelah()
      info.style.color = '#b45309'
      info.textContent = `✓ ${nama.length} baris terbaca — CEK LAGI: hapus judul/baris yang bukan nama & betulkan huruf yang salah sebelum Simpan.`
    } catch (e) {
      info.style.color = '#b91c1c'
      info.textContent = 'Foto tidak bisa dibaca langsung' + (typeof sumber === 'string' ? ' — buka fotonya, tekan lama → Salin, lalu tekan 📋 Tempel foto' : ': ' + (e.message || e))
    }
  }
  box.querySelectorAll('img[data-i]').forEach(img => { img.onclick = () => jalankan(gambar[+img.dataset.i]) })
  box.querySelector('input[type=file]').onchange = e => { const f = e.target.files?.[0]; if (f) jalankan(f); e.target.value = '' }
  box.querySelector('[data-tempel]').onclick = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const it of items) { const t = it.types.find(x => x.startsWith('image/')); if (t) return jalankan(await it.getType(t)) }
      info.style.color = '#b45309'; info.textContent = 'Tidak ada foto di clipboard — salin fotonya dulu (tekan lama → Salin)'
    } catch { info.style.color = '#b45309'; info.textContent = 'Tempel tidak diizinkan browser — pakai 🖼 Pilih foto' }
  }
  // Drag & drop: file foto (Foto/File/WhatsApp) atau gambar dari tab lain → langsung dibaca
  const target = wadah.closest('.card') || box
  const sorot = on => { box.style.background = on ? 'rgba(124,58,237,.08)' : ''; box.style.borderColor = on ? '#7c3aed' : 'rgba(124,58,237,.35)' }
  target.addEventListener('dragover', e => { e.preventDefault(); sorot(true) })
  target.addEventListener('dragleave', e => { if (!target.contains(e.relatedTarget)) sorot(false) })
  target.addEventListener('drop', e => {
    sorot(false)
    const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/'))
    const url = (e.dataTransfer?.getData('text/uri-list') || '').split('\n').find(u => /^https?:/.test(u.trim()))
    if (!f && !url) return
    e.preventDefault()
    jalankan(f || url.trim())
  })
  // ⌘V di textarea/editor dengan foto → langsung dibaca
  wadah.closest('.card')?.addEventListener('paste', e => {
    const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'))
    if (f) { e.preventDefault(); jalankan(f) }
  })
}
