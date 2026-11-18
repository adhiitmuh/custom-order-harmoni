# Harmoni Custom Order

Web app custom order PT Citra Harmonis (Makassar). Ready stock ada di Olsera (terpisah).
Live: `https://adhiitmuh.github.io/custom-order-harmoni/` · Firebase project data `harmoni-custom-order`.
Aturan kerja lintas app (push ke main, rules via CI, tanpa WA otomatis, data Owner hanya Owner, Bahasa Indonesia "Bapak", HP/tablet/komputer): lihat `harmoni-indonesia/CLAUDE.md`.
Detail lama (rencana bot WA, Fonnte/WA Cloud API, strategi token Claude) sudah dihapus — ada di riwayat git bila perlu.

## Stack & login
- HTML + Vanilla JS (ES modules, tanpa bundler), Firestore, Storage, GitHub Pages. Worker Cloudflare `api/create-order.js` (`harmoni-order-api.adhiitmuh.workers.dev`).
- Staff login di **Portal** (`harmoni-indonesia`) → `js/auth.js` tukar ID token ke Worker `/custom-token` → custom token (uid Portal, klaim `staff`, `role`, `divisi`). Rules membaca **klaim token**, bukan dokumen `users`. Role baru berlaku setelah reload.
- `requireAuth(cb)` menunggu `firestoreReady` (maks 8 dtk) — tanpa ini query pertama "insufficient permissions".
- Rules: `isStaffAuth()` (klaim staff) untuk koleksi sensitif; `isAuth()` termasuk anonymous (customer `chat.html`, supplier `supplier-view.html`). `chat.html` standalone (config sendiri) dan **tidak membaca dokumen order** — status dari `public_order_info`.
- Deploy: push `api/**` → workflow Worker; push `firestore.rules`/`storage.rules` → workflow Rules. Jangan edit rules di Console.

## Aturan penting
- **WA hanya manual**: tombol membuka `api.whatsapp.com/send?...` (bukan `wa.me` — emoji rusak). Tidak ada Fonnte/kirim otomatis; jangan klaim "WA terkirim". Sisa kode Fonnte/bot di Worker tidak dikembangkan.
- **Kontak customer hanya Owner** (`canViewContact`). Modal/profit tidak pernah tampil di invoice/halaman customer; `price_list` diblokir untuk anonymous (customer pakai `price_list_public`).
- **Semua uang masuk wajib foto bukti** (termasuk tunai; DP di order baru kecuali marketplace). Setoran tunai di Tutup Kasir wajib bukti. Naik DP hanya lewat "+ Tambah Pembayaran", bukan edit order.
- **Teks dari customer/staf wajib di-escape** sebelum masuk `innerHTML` (`esc` di `js/utils.js` untuk halaman baru; halaman lama punya `esc`/`escH`/`escN` lokal); id ke handler lewat `data-` atribut, bukan string `onclick`.
- Koleksi publik (`public_order_info`, `supplier_tokens`, `consultations`) hanya `get` per token, tidak bisa `list`. Pesan customer di `chat_messages` wajib `senderRole:'customer'` & `senderId==token`.
- `depositPaid` diubah dengan `increment()` (aman bila dua orang mencatat bersamaan). Status order tidak maju selama `priceApprovalStatus` pending/rejected (rules + UI).
- Tanggal selalu WITA (`tglLokal()`), jangan `toISOString().split('T')[0]` (UTC).
- Upload foto selalu lewat `compressImage()` (`js/image.js`). Tempel/seret file: `js/tempel-file.js`.
- Sort di JS bila perlu, hindari query butuh composite index. Filter halaman disimpan di `sessionStorage` (`orders_filters`, dst).
- `knowledge.html` `flushInlineSave` membuang item tanpa Nama. Safari tidak memicu `change` pada kolom angka terformat → simpan saat mengetik.
- Navigasi pakai `<a href>` (bisa buka tab baru). Tampilan HP: `js/mobile-nav.js` (laci ☰).

## Role & visibilitas (`canSeeOrder` di js/auth.js — satu-satunya sumber aturan)
| Role | Order yang terlihat |
|---|---|
| owner, data | semua |
| production | divisi yang di-assign (`users.divisions[]`) |
| divisi (pemilik divisi) | divisi miliknya (`users.divisi`) |
| manager (Kepala Cabang) | lokasinya (`users.lokasiId`) |
| cs pusat + divisi | divisi itu di semua lokasi |
| cs pusat tanpa divisi | semua |
| cs cabang/titik | lokasinya saja (divisi diabaikan — jangan isi `divisions[]`) |
Approval harga: promo = manager/owner, admin = owner. Kelola user/supplier/pengaturan = owner. Akun dibuat/dihapus di Portal (bukan di sini).
PIN Kepala Cabang (approve edit/void): hash di `pin_kepala/{uid}` (rules tertutup), diatur Owner lewat Users → "🔑 Atur PIN" (Worker `/set-pin`), dicek Worker `/cek-pin`. PIN lama polos di `users.pin` masih diterima sampai diatur ulang.

## Divisi & order
- 11 divisi di `js/utils.js` (`DIVISION_META`) + dinamis di `divisions/{key}` {label, code, icon, produksiUnit, pemilik (nama orang), aktif, orderIndex}: bordir BRD, butik BTK, jersey JRS, jilbab JLB, sablon SBL, konveksi KNV, medali-pin MPL, papan-nama PPN, pin-fiber PFB, sewa-kostum SKT, tailor TLR.
- No. order `HRM-{CODE}-{YEAR}-{0001}`, counter per tahun `order_counters/{division}_{tahun WITA}` (2026 lanjut dari counter lama `order_counters/{division}`); web via transaction, Worker via commit ber-precondition (aman dobel). Rules: counter hanya naik +1.
- Order non-draft wajib ≥1 item dengan qty & harga > 0. Order dari Inbox/bot masuk `pending-approval` (tier admin) dan DP dicatat di catatan, bukan `depositPaid`. Owner bisa pindah divisi (alasan + riwayat, nomor tetap).
- Status (`STATUS_LABEL`): pending · pending-approval · in-progress · quality-check · done · delivered · cancelled. Produksi tertahan selama harga belum disetujui.
- Harga bertingkat di `price_list/{division}.items[]` {name, priceNormal/Promo/Admin/Modal, unit, note, variants[], nama lain}: Normal langsung OK, Promo/Admin perlu approval, di bawah Admin diblokir. Approval **per item** (setujui/tolak + alasan, "Sama dgn…" ganti ke item daftar harga). Item mirip daftar harga wajib dipilih atau diberi alasan beda. Izin isi harga per orang + batas tanggal (`settings/izin_harga`, Worker `/price-list-save`): pengisi mengubah Modal langsung; harga jual item yang sudah dicek jadi usulan (`price_list_usulan`) yang disetujui Owner atau Pemilik Divisi divisi itu.
- `hargaModal` order otomatis dari daftar harga (termasuk varian) — wajib untuk laporan/laba.
- Marketplace (Shopee/Tokopedia/TikTok): no. pesanan wajib & anti dobel, lunas otomatis, tidak masuk tagihan, omzet dipisah.
- Papan nama: `orderItems[].namaCustom` / daftar nama (`js/namaPapan.js`, "NAMA x2"), wajib cocok qty, OCR dari foto (`js/ocrNama.js`, Tesseract di perangkat) → Papan Nama Sheet.
- Jersey/Tailor: penjahit per order (`js/penjahit.js`; `tailorPayments` hanya Owner), upah per pcs `upah_jahit`, pengajuan & bukti transfer di Upah Penjahit.
- Konveksi: biaya kain, upah & bahan pendukung aktual dari Sistem Produksi YH (Worker) masuk modal & laba.

## Koleksi utama (selain di atas)
- `orders` — orderNumber, division, customerName, customerContact (Owner), orderDate, dueDate, status, progressPercentage, totalPrice, depositPaid, hargaModal, orderItems[], designFiles[], chatToken, sumberOrder, lokasiId/Nama/Tipe, produksiUnit, priceApproval*, paymentProofs, tagih/tagihRiwayat, supplierAssignments[], tailors[], unreadCustomerChat, internalChatLastAt, lastReadInternalChat{uid:ts}. Sub: `internal_chat`, `progress_updates`.
- `pembayaran` — satu dokumen per uang masuk {orderId, jumlah, metode ('cash'|'qris'|'transfer_xxx'), rekeningNo, jenis (dp|cicilan|pelunasan|lunas|koreksi), bukti, lokasi, oleh, at}; hanya Owner bisa ubah/hapus. DP turun → pilih pembayaran asal: koreksi menyalin metode/rekening/lokasi/pegang + `koreksiDari`, `koreksiTgl`, `salahInput` (true = salah ketik, tanpa uang keluar; asal hari sebelumnya tidak mengubah laci hari ini). Kwitansi & Uang di Tangan menettokan koreksi ke pembayaran asal. Helper `js/pembayaran.js`.
- Tunai: `pembayaran.pegang` = 'laci' (masuk laci, dihitung Tutup Kasir) | 'staf' (dipegang pencatat, di luar toko). `setor_tunai` {lokasiId, tgl, cara laci|rekening (bukti wajib, caraSetor setor_tunai|transfer)|owner (status menunggu → Owner konfirmasi), pembayaranIds[], pemegangUid/Nama, jumlah} — Kas Cabang tab 💵 Uang di Tangan; cara laci menambah "seharusnya di laci" Tutup Kasir hari itu. Setoran Tutup Kasir punya `cara` setor_tunai|transfer.
- `laporan_harian/{lokasi}_{tgl}` — uang masuk per lokasi + `tunaiLaci`/`tunaiStaf` hari itu (dokumen lama punya `setorTunai`/`sisaTunai`); "sudah dicek" Owner → terkunci. Setoran tunai lewat Tutup Kasir / Uang di Tangan.
- `tutup_kasir_cabang/{lokasi}_{tgl}` (Olsera + CO, setoran + bukti, status menunggu/diterima) & `kas_cabang` (kas keluar/masuk) — disetujui Owner / Kepala Cabang / pemilik cabang; batas di `settings/kas_cabang`.
- `customer_followup/{noWA}` (Order Ulang), `setoran_pemilik` (Kewajiban Antar Pemilik, Owner), `penjahit`, `pengajuan_upah`, `upah_jahit`.
- `lokasi/{id}` {nama, tipe pusat|cabang|titik, pj, divisiPemilik, komisiPersen (titik), aktif}.
- `suppliers` (kontak hanya Owner) + `supplier_tokens/{token}` — Lempar ke Supplier: CS ajukan per item → manager/owner approve → link token (tanpa harga/kontak/nama customer). `supplier-view.html` membaca data lewat Worker `/supplier-order?token=` (nomor HP di catatan disamarkan); sesi anonim tidak bisa `get` order.
- Chat: `chat_messages/{chatToken}/messages` (customer↔staff, type customer|staff|system|progress), `public_order_info/{chatToken}`, `feedback/{chatToken}`, `chat_threads` + `consultations` (Inbox), `notifications`, `user_mentions/{uid}`.
- `settings/*`: `payment_info` {banks[{bankName, accountNumber, accountHolder, isActive, divisions[], lokasiIds[]}], qris[], cashActive} (lookup: divisi+lokasi → divisi → lokasi → apa saja), `monthly_target`, `komisi`, `kapasitas`, `pemilik_divisi`, `divisi_wa` (WA divisi, staf saja), `izin_harga`, `kas_cabang`, `pengajuan_upah`.

## Halaman
Order: dashboard, orders (tab divisi), new-order, order (detail, approval, pembayaran, progress, chat internal, kabari WA manual, kwitansi), order-ulang, kalender, production-sheet (Papan Nama Sheet), crm, inbox, audit-chat.
Uang: tagihan (follow up belum lunas), laporan-harian, kas-cabang (Tutup Kasir), cocokkan-mutasi (`js/mutasi.js`, PDF/CSV rekening koran), laporan (keuangan, multi-divisi), laba (laba & komplain), analisa-penjualan (Owner: tren bulan vs tahun lalu, per divisi, item paling laku + bulan ramai, musim per divisi/item, per lokasi/CS/sumber, customer & langganan, deadline), kewajiban-pemilik, komisi (target & komisi CS), upah-penjahit, kwitansi, laporan-harga.
Master: knowledge (daftar harga & product knowledge), divisi, lokasi, supplier, users, settings.
Publik (tanpa login staf): chat.html (customer), supplier-view.html, katalog-kain.html (katalog kain YH tanpa stok, cari warna dari foto `?foto=1`, pilih warna → WA).

## Worker (`api/create-order.js`)
`/custom-token`, `/cek-pin`, `/set-pin` (Owner), `/supplier-order`, `/price-list-save`, `/create-order`, `/create-order-from-chat`, `/get-order`, `/update-status`, `/notify-cs` (increment `unreadCustomerChat`), `/send-chat-reply`, `/start-consultation`, `/knowledge`, `/qris-img`, `/backup`·`/backups`·`/trigger-backup`, `/trigger-deadline-check`, endpoint order Konveksi untuk YH. Secrets lewat `wrangler secret put` — jangan pernah ditempel di chat/commit.

## Model bisnis
- Divisi = usaha mandiri anggota keluarga (pemilik di `divisions.pemilik`); menentukan `priceModal`. Pusat/Cabang/Titik = titik terima order & pembayaran.
- Lokasi wajib bayar divisi sebesar `hargaModal`; margin lokasi = harga jual − modal. Lokasi milik divisi yang sama (`lokasi.divisiPemilik`) = kewajiban internal ("bayar ke diri sendiri"). Titik dapat komisi `komisiPersen`.
- Laporan Owner: omzet per lokasi & divisi, metode bayar, kewajiban per pemilik + rekening, internal vs eksternal, margin, laba per order.
