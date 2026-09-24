// Kompres ulang foto lama yang sudah terlanjur tersimpan besar di Firebase Storage.
//
// Jalankan di Google Cloud Shell (https://shell.cloud.google.com) — sudah login otomatis:
//   mkdir kompres && cd kompres
//   curl -sO https://raw.githubusercontent.com/adhiitmuh/custom-order-harmoni/main/tools/compress-storage.mjs
//   npm i sharp @google-cloud/storage
//   gcloud config set project harmoni-custom-order
//   node compress-storage.mjs            # simulasi: hanya menghitung, tidak mengubah apa pun
//   node compress-storage.mjs --apply    # benar-benar kompres & timpa file
//
// Aturan sama dengan js/image.js: sisi terpanjang maks 1920px, JPEG 85%.
// File ditimpa di PATH YANG SAMA dengan token download yang SAMA, jadi semua URL
// yang tersimpan di Firestore (designFiles, foto progress, chat, bukti bayar) tetap valid.

import { Storage } from '@google-cloud/storage'
import sharp from 'sharp'

const BUCKET = 'harmoni-custom-order.firebasestorage.app'
const MAX_SIDE = 1920
const QUALITY = 85
const SKIP_BELOW_BYTES = 400 * 1024
const CONCURRENCY = 4

const mb = n => (n / 1024 / 1024).toFixed(2) + ' MB'

export async function shrink(buf) {
  const img = sharp(buf, { failOn: 'none' })
  const meta = await img.metadata()
  const big = (meta.width || 0) > MAX_SIDE || (meta.height || 0) > MAX_SIDE
  if (!big && buf.length <= SKIP_BELOW_BYTES) return null
  const out = await img
    .rotate() // terapkan orientasi EXIF sebelum metadata dibuang
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }) // PNG transparan → putih, bukan hitam
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer()
  return out.length < buf.length ? out : null
}

export async function run(bucket, APPLY) {
  const [files] = await bucket.getFiles()
  const images = files.filter(f => {
    const t = f.metadata.contentType || ''
    return t.startsWith('image/') && t !== 'image/gif' && t !== 'image/svg+xml'
  })

  const totalAll = files.reduce((s, f) => s + Number(f.metadata.size || 0), 0)
  console.log(`Bucket: ${BUCKET}`)
  console.log(`Total file: ${files.length} (${mb(totalAll)}), gambar: ${images.length}`)
  console.log(APPLY ? 'MODE: APPLY — file akan ditimpa\n' : 'MODE: SIMULASI — tidak ada yang diubah (tambahkan --apply untuk menjalankan)\n')

  let before = 0, after = 0, done = 0, skipped = 0, failed = 0
  const queue = [...images]

  async function worker() {
    while (queue.length) {
      const f = queue.shift()
      const size = Number(f.metadata.size || 0)
      try {
        if (size <= SKIP_BELOW_BYTES) { skipped++; continue }
        const [buf] = await f.download()
        const out = await shrink(buf)
        if (!out) { skipped++; continue }
        before += buf.length; after += out.length; done++
        console.log(`${APPLY ? '✔' : '~'} ${f.name}  ${mb(buf.length)} → ${mb(out.length)}`)
        if (APPLY) {
          await f.save(out, {
            resumable: false,
            metadata: {
              contentType: 'image/jpeg',
              cacheControl: f.metadata.cacheControl,
              // Pertahankan token download Firebase → URL lama tetap jalan
              metadata: { ...(f.metadata.metadata || {}), compressedAt: new Date().toISOString() },
            },
          })
        }
      } catch (e) {
        failed++
        console.log(`✘ ${f.name}  gagal: ${e.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  console.log(`\nDikompres: ${done} file, dilewati: ${skipped}, gagal: ${failed}`)
  console.log(`Ukuran: ${mb(before)} → ${mb(after)}  (hemat ${mb(before - after)})`)
  console.log(`Perkiraan total bucket setelahnya: ${mb(totalAll - (before - after))}`)
  if (!APPLY && done) console.log('\nJalankan lagi dengan --apply untuk benar-benar mengompres.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(new Storage().bucket(BUCKET), process.argv.includes('--apply')).catch(e => { console.error(e); process.exit(1) })
}
