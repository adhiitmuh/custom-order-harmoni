// Kompres foto sebelum upload ke Firebase Storage.
// Sisi terpanjang maks 1920px + JPEG 85% — tulisan di bukti transfer & detail
// desain tetap terbaca jelas, ukuran turun dari 3–8 MB ke ~300–700 KB.
// Tanpa dependensi Firebase supaya bisa dipakai halaman standalone
// (chat.html, supplier-view.html).

const MAX_SIDE = 1920
const QUALITY = 0.85
const SKIP_BELOW_BYTES = 400 * 1024

export async function compressImage(file) {
  if (!file || !file.type?.startsWith('image/')) return file
  // GIF bisa animasi, SVG vektor — biarkan apa adanya
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file

  let img
  try {
    img = await loadImage(file)
  } catch {
    // Format yang tidak bisa di-decode browser (mis. HEIC di Chrome) → upload asli
    return file
  }

  let { width, height } = img
  const needsResize = width > MAX_SIDE || height > MAX_SIDE
  if (!needsResize && file.size <= SKIP_BELOW_BYTES) return file

  if (needsResize) {
    const scale = MAX_SIDE / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // PNG transparan → background putih (JPEG tidak punya alpha, default-nya hitam)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  // Hasil kompres malah lebih besar (jarang, mis. PNG kecil) → pakai asli
  if (!blob || blob.size >= file.size) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')) }
    img.src = url
  })
}
