# CLAUDE.md — Harmoni Custom Order App

## Konteks Project

Web app manajemen custom order untuk **PT Citra Harmonis** (Makassar, Indonesia). Khusus custom order — ready stock dihandle Olsera POS terpisah.

**GitHub Repo:** `https://github.com/adhiitmuh/custom-order-harmoni`
**Live URL:** `https://adhiitmuh.github.io/custom-order-harmoni/`

---

## Stack Aktual

| Layer | Teknologi |
|---|---|
| Frontend | HTML + CSS + Vanilla JS (ES Modules, no bundler) |
| Backend | Firebase Firestore |
| Auth | Firebase Authentication (email/password) |
| Storage | Firebase Storage (file desain) |
| Hosting | GitHub Pages (static) |
| API Bot | Cloudflare Workers — file di `api/create-order.js` |

---

## Struktur File

```
custom-order-harmoni/
├── index.html          — Login (Firebase Auth)
├── dashboard.html      — Stats + omzet + order terbaru
├── orders.html         — List order + filter + search + tab divisi
├── new-order.html      — Form order baru + upload file ke Storage
├── order.html          — Detail order + progress update + approval harga + auto-notif WA
├── laporan.html        — Laporan keuangan per periode
├── crm.html            — CRM Pelanggan (derived dari orders)
├── kalender.html       — Kalender produksi (by dueDate)
├── knowledge.html      — Product knowledge per divisi + price list (inline edit)
├── users.html          — Kelola pengguna (owner only)
├── settings.html       — Pengaturan rekening bank, QRIS, target omzet
├── chat.html           — Chat publik pelanggan (token-based, standalone, no auth)
│                         Termasuk: tab Info Produk, tab Feedback ⭐, emoji picker, edit pesan
├── inbox.html          — Chat Inbox staff: kelola thread WA bot, balas customer, buat order dari chat
├── audit-chat.html     — Audit chat WA Bot
├── divisi.html         — Kelola divisi
├── supplier.html       — Kelola supplier/produksi luar (owner only): nama, divisi, kontak WA tersembunyi
├── supplier-view.html  — Token-based view untuk supplier: lihat pesanan (tanpa harga/kontak), update progress
├── production-sheet.html — Production sheet bordir & papan-nama: tabel excel-style, sisa hari, update status inline
├── lokasi.html         — Kelola lokasi (pusat/cabang/titik)
├── css/style.css
├── js/
│   ├── config.js       — Firebase init (auth, db, storage) — di-import semua halaman
│   ├── auth.js         — requireAuth() + renderSidebar() + role helpers + inboxBadge
│   ├── utils.js        — Konstanta + helper functions
│   └── mentions.js     — @mention autocomplete, parseMentions, writeMentionNotifs, loadStaff
├── api/
│   ├── create-order.js — Cloudflare Worker: API untuk WA Bot + /notify-customer
│   └── wrangler.toml   — Config deploy Cloudflare
├── firestore.rules     — Firestore Security Rules (RLS)
└── SETUP.md            — Panduan setup Firebase + deploy
```

---

## Firebase Config

Project ID: `harmoni-custom-order`
Config ada di `js/config.js` — hardcoded, ini aman untuk repo publik (anon key Firebase memang publik, keamanan diatur via Firestore Rules).

**Catatan:** `chat.html` standalone — hardcode config sendiri karena tidak pakai `js/config.js` (halaman ini diakses publik tanpa auth).

**Auth level di Firestore Rules:**
- `isAuth()` — siapapun yang login, **termasuk anonymous auth** (dipakai hanya untuk `orders` agar supplier-view.html tetap bisa baca order via anonymous auth)
- `isStaffAuth()` — hanya yang login dengan **email/password** (bukan anonymous); dipakai untuk semua koleksi sensitif
- Halaman publik yang pakai `signInAnonymously`: `chat.html` (customer), `supplier-view.html` (supplier)
- Koleksi yang masih `isAuth()` (bukan isStaffAuth): `orders`, `orders/progress_updates` — karena supplier-view.html perlu baca data order

---

## Data Model (Firestore)

### Collection `orders`

```
orderNumber             string    — "HRM-JRS-2025-0001" (auto dari counter)
division                string    — lihat DIVISIONS di utils.js
customerName            string
customerContact         string    — WA / email (hanya owner & CS yang lihat)
orderDate               string    — YYYY-MM-DD
dueDate                 string    — target selesai YYYY-MM-DD
status                  string    — lihat STATUS_LABEL di utils.js
progressPercentage      number    — 0-100
totalPrice              number
depositPaid             number
notes                   string
designFiles             string[]  — array URL Firebase Storage
chatToken               string    — token unik untuk customer chat (24 chars)
sumberOrder             string    — 'staff' | 'wa_bot' | 'walk_in' | 'shopee' | 'instagram'
agentSessionId          string    — ID sesi WA bot (kosong kalau dari staff)
lokasiId                string    — FK ke collection `lokasi`
lokasiNama              string    — denormalized nama lokasi
lokasiTipe              string    — 'pusat' | 'cabang' | 'titik'
produksiUnit            string    — unit produksi yang handle (dari PRODUKSI_UNIT di utils.js)
priceApprovalStatus     string    — 'approved' | 'pending'
priceApprovalTier       string    — null | 'promo' | 'admin'
priceApprovalReason     string
priceApprovalBy         string    — uid approver
priceApprovalAt         timestamp
unreadCustomerChat      number    — counter pesan customer belum dibaca staff (reset saat staff buka tab chat)
internalChatLastAt      timestamp — diupdate setiap ada pesan internal baru (untuk per-user unread detection)
lastReadInternalChat    map       — { [uid]: timestamp } — kapan tiap staff terakhir buka internal chat
lastCustomerNotifAt     timestamp — kapan terakhir notif WA dikirim ke customer (cooldown 4 jam untuk type 'chat')
createdBy               string    — uid user / 'wa_bot'
createdAt               timestamp
updatedAt               timestamp
```

### Subcollection `orders/{orderId}/internal_chat/{msgId}`
Chat internal tim per order (hanya staff, tidak terlihat customer).
```
content     string
senderId    string
senderName  string
senderRole  string
createdAt   timestamp
```

### Subcollection `orders/{orderId}/progress_updates/{id}`
```
percentage  number
notes       string
photos      string[]  — URL Firebase Storage
createdBy   string
createdAt   timestamp
```

### Collection `chat_threads/{threadId}`
Thread percakapan WA Bot → dikelola di inbox.html.
```
token           string    — WA number customer (atau session ID)
customerName    string
lokasiId        string    — lokasi yang handle thread ini
lokasiNama      string
status          string    — 'open' | 'closed' | 'escalated'
unreadCount     number
lastMessage     string
lastMessageAt   timestamp
hasFlag         boolean   — ada pesan mencurigakan
orderId         string    — FK ke orders (setelah order dibuat dari chat)
orderNumber     string
guestStaffIds   string[]  — UID staff dari lokasi lain yang diberi akses via @mention
```

### Subcollection `chat_threads/{threadId}/messages/{msgId}`
```
content       string
senderType    string    — 'customer' | 'admin' | 'ai'
senderId      string
senderName    string
createdAt     timestamp
flagged       boolean
flagReason    string
mentions      array     — [{id, name}] staff yang di-@mention
```

### Collection `notifications/{notifId}`
Notifikasi in-app untuk internal chat dan @mention.
```
type        string    — 'internal_chat' | 'mention'
orderId     string
orderNumber string
fromUid     string
fromName    string
fromRole    string
targetUid   string    — (untuk type 'mention') UID yang di-mention
preview     string    — 80 karakter pertama pesan
createdAt   timestamp
```

### Collection `user_mentions/{uid}`
Badge counter @mention per user.
```
unreadMentions  number
```

### Collection `order_counters/{division}`
```
counter  number  — di-increment via transaction setiap order baru
```

### Collection `users/{uid}`
```
name, email, role ('owner'|'manager'|'cs'|'production'), branch, createdAt
```

### Collection `product_knowledge/{division}`
```
division, description, items[{name, priceNormal, pricePromo, priceAdmin, unit, minQty, notes}], updatedAt
```

### Collection `price_list/{division}`
```
division
items[{
  name          string   — nama layanan / produk
  priceNormal   number
  pricePromo    number
  priceAdmin    number
  priceModal    number   — internal, hanya owner/data
  unit          string   — cth: pcs, set, lembar
  note          string
  variants      array    — opsional, untuk beda bahan/tipe dengan harga berbeda
    [{
      name        string   — nama varian (cth: Dryfit, Hyget, Paragon)
      priceNormal number
      pricePromo  number
      priceAdmin  number
      priceModal  number
    }]
}]
updatedAt     timestamp
```
Jika item punya `variants`, harga pada level item diabaikan — harga diambil dari varian yang dipilih.

**PENTING:** `flushInlineSave` di knowledge.html memfilter `.filter(item => item.name)` — item tanpa Nama dibuang sebelum disimpan. Selalu isi kolom Nama sebelum simpan harga.

### Collection `public_order_info/{chatToken}`
Dibuat saat order baru, key = chatToken. Untuk akses customer chat publik.

### Collection `chat_messages/{chatToken}/messages/{msgId}`
Chat realtime. Public read + create (siapapun dengan token bisa kirim pesan).
```
text        string
type        string    — 'customer' | 'staff' | 'system' | 'progress'
senderId    string    — uid staff / 'customer'
senderName  string
edited      boolean   — true jika pesan diedit customer
editedAt    timestamp
createdAt   timestamp
```

### Collection `feedback/{chatToken}`
Feedback customer per order. Key = chatToken (satu feedback per order, tidak bisa diubah setelah submit).
```
token       string
orderId     string
orderNumber string
rating      number    — 1-5
type        string    — 'pujian' | 'saran' | 'kritik'
message     string
createdAt   timestamp
```

### Collection `lokasi/{id}`
```
nama            string    — "Titik Harmoni Manggala"
tipe            string    — 'pusat' | 'cabang' | 'titik'
kota            string    — "Makassar"
pj              string    — penanggung jawab
divisiPemilik   string    — key divisi yang memiliki lokasi ini (kosong = pusat/owner)
                           Dipakai untuk deteksi kewajiban internal vs eksternal di laporan
komisiPersen    number    — % komisi mitra (hanya tipe 'titik', default 15)
aktif           boolean
createdAt       timestamp
updatedAt       timestamp
```

### Collection `divisions/{key}`
Data divisi dinamis (bisa ditambah/edit dari divisi.html). Key = division key (cth: `jersey`).
```
label           string    — "Jersey, Batik dan Lanyard Printing"
code            string    — "JRS"
icon            string    — emoji
description     string    — deskripsi singkat
produksiUnit    string    — nama unit produksi
pemilik         string    — nama pemilik divisi (cth: Adhitya, Achmadi, Amalia, Anisha, Disfi)
                           Dipakai untuk grouping kewajiban per orang di laporan
aktif           boolean
orderIndex      number    — urutan tampil di app
createdAt       timestamp
updatedAt       timestamp
```

### Collection `suppliers/{id}`
```
nama            string    — nama supplier / tempat produksi luar
kontak          string    — nomor WA (hanya owner yang bisa lihat)
alamat          string    — kota/alamat
catatan         string    — catatan internal (tidak terlihat supplier)
divisi          string[]  — divisi yang bisa dikerjakan supplier ini
aktif           boolean
createdAt, updatedAt
```

### Collection `supplier_tokens/{token}`
Dibuat saat owner/manager approve pengajuan lempar ke supplier.
```
orderId         string
orderCode       string    — kode yang ditampilkan ke supplier (bukan HRM- number asli)
supplierId      string
supplierNama    string
divisiLabel     string
itemIndexes     number[]  — index item di orderItems yang dikerjakan supplier ini
createdBy       string    — uid approver
createdAt       timestamp
```

`orders.supplierAssignments[]` — array per item:
```
itemIndex       number
supplierId      string
supplierNama    string
assignStatus    string    — 'pending_approval' | 'approved'
assignedBy      string    — uid CS yang mengajukan
assignedByName  string
assignedAt      timestamp
approvedBy      string
approvedByName  string
approvedAt      timestamp
supplierToken   string    — key di supplier_tokens (setelah approved)
```

### Collection `settings/{id}`
- `monthly_target`: `{ amount: number }` — target omzet bulanan
- `payment_info`: `{ banks: [{bankName, accountNumber, accountHolder, isActive, divisions: string[], lokasiIds: string[]}], qris: [{imageUrl, division, isActive}], cashActive: boolean }`
  - `divisions[]` — divisi yang pakai rekening ini (kosong = universal/semua divisi)
  - `lokasiIds[]` — lokasi yang pakai rekening ini (kosong = semua lokasi)
  - Backward compat: field lama `division: string` masih dibaca via helper `getBankDivisions(b)`

---

## Role & Akses

| Role | Buat Order | Lihat Kontak | Edit Order | Approval Harga | Kelola User |
|---|---|---|---|---|---|
| `owner` | ✅ | ✅ | ✅ | ✅ (semua tier) | ✅ |
| `manager` | ✅ | ✅ | ✅ | ✅ (promo tier) | — |
| `cs` | ✅ | — | ✅ | — | — |
| `production` | — | — | ✅ (progress) | — | — |

---

## Divisi (11 divisi, di-define di `js/utils.js`)

| Key | Label | Code |
|---|---|---|
| `bordir` | Bordir | BRD |
| `butik` | Butik | BTK |
| `jersey` | Jersey | JRS |
| `jilbab` | Jilbab | JLB |
| `sablon` | Kaos & Sablon | SBL |
| `konveksi` | Konveksi | KNV |
| `medali-pin` | Medali & Pin Logam | MPL |
| `papan-nama` | Papan Nama US & KL | PPN |
| `pin-fiber` | Pin Fiber | PFB |
| `sewa-kostum` | Sewa Kostum | SKT |
| `tailor` | Tailor | TLR |

Format order number: `HRM-{CODE}-{YEAR}-{0001}`

---

## Tiered Pricing System

Diatur per divisi di collection `price_list`:
- **Normal** — langsung approved, status order jadi `pending`
- **Promo** — perlu approval manager/owner, status jadi `pending-approval`
- **Admin** — perlu approval owner, status jadi `pending-approval`
- **Blocked** — di bawah minimum admin, tidak bisa disimpan

Tier ditentukan di `new-order.html` dengan fungsi `checkPriceTierLive()` saat input harga.

---

## Status Order (di `js/utils.js` → `STATUS_LABEL`)

```
pending           → Menunggu Konfirmasi
pending-approval  → Menunggu Approval Harga
in-progress       → Sedang Dikerjakan
quality-check     → Quality Check
done              → Selesai
delivered         → Sudah Dikirim
cancelled         → Dibatalkan
```

---

## Fitur yang Sudah Jalan

- ✅ Login Firebase Auth (email/password)
- ✅ CRUD orders di Firestore
- ✅ Upload file desain ke Firebase Storage
- ✅ Tiered pricing + approval workflow
- ✅ Customer chat publik (token-based, no login diperlukan)
- ✅ Kalender produksi (by dueDate)
- ✅ CRM Pelanggan (derived dari orders)
- ✅ Laporan keuangan per periode + per divisi
- ✅ Product knowledge per divisi
- ✅ Field `sumberOrder` (staff/wa_bot/walk_in/shopee/instagram)
- ✅ Firestore Security Rules (RLS)
- ✅ Cloudflare Worker API untuk WA Bot (`api/create-order.js`) — sudah deployed
- ✅ Chat Inbox staff (`inbox.html`) — kelola thread WA bot, balas via Worker, buat order dari chat
- ✅ Internal chat per order (tim internal, tidak terlihat customer)
- ✅ Per-user unread tracking internal chat — badge `🔒 N` per staff, tidak saling mempengaruhi (via `internalChatLastAt` + `lastReadInternalChat` map)
- ✅ Badge `💬 N` customer chat di card order — increment via Worker saat customer kirim pesan teks
- ✅ Badge 🔔 sidebar — hitung `chat_threads` + `consultations` unread
- ✅ @mention staff di chat internal & inbox (autocomplete, highlight, notifikasi)
- ✅ Cross-lokasi inbox — staff di-@mention dapat akses thread cabang lain (guest mode, tidak bisa buat order)
- ✅ Inline edit Harga/Pcs per item di tabel Rincian Item (auto-update subtotal & totalPrice)
- ✅ Sistem Varian di price list — tiap item bisa punya varian bahan/tipe masing-masing dengan harga berbeda
- ✅ **Tab filter divisi di orders.html** — pill button klik langsung (Semua / per divisi), sinkron dengan dropdown
- ✅ **Tab Feedback ⭐ di chat.html** — rating bintang 1–5, tipe (Pujian/Saran/Kritik), pesan teks, satu submit per order, data ke `feedback/{token}`
- ✅ **Emoji picker di chat.html** — tombol 😊, 80+ emoji, insert di posisi cursor
- ✅ **Edit pesan customer di chat.html** — tombol ✏ Edit, edit in-place, label "diedit", onSnapshot pause saat edit aktif
- ✅ **Auto-notif WA ke customer** — via `/notify-customer` Worker endpoint (sementara pakai Fonnte, target migrasi ke WA Cloud API Meta)
  - Status berubah → langsung notif (in-progress, quality-check, done, delivered)
  - Progress update → langsung notif
  - Staff reply chat design → notif dengan cooldown 4 jam (cek `lastCustomerNotifAt`)
  - Tombol 🔔 manual force-send (owner/cs)
  - Footer: `[Nama Lokasi] by Harmoni Indonesia` atau `Harmoni Indonesia · Makassar`
- ✅ **Invoice selalu tampilkan rekening bank** — semua bank aktif tampil di invoice meski metode bayar belum dipilih, difilter per divisi (bank universal + bank khusus divisi order)
- ✅ Progress update tampil di chat customer (`type: 'progress'` di `chat_messages`)
- ✅ **Rekening bank multi-divisi** — bank bisa di-assign ke beberapa divisi sekaligus via checkbox grid + Universal toggle (kosong = semua divisi). Field: `divisions: string[]`
- ✅ **Rekening bank per lokasi** — bank bisa di-filter per lokasi via `lokasiIds: string[]`. Lookup di order.html: priority division+lokasi → division → lokasi → any
- ✅ **Badge 💬 fix** — `sendFile` di chat.html sekarang memanggil `/notify-cs` Worker (sama seperti `sendMsg`), increment `unreadCustomerChat`
- ✅ **Laporan kewajiban ke divisi** — section owner-only di laporan.html: total `hargaModal` per divisi yang wajib dibayar lokasi ke divisi produsen, grouped per pemilik (nama orang), dengan rekening tujuan transfer, flag internal vs eksternal
- ✅ **Field `pemilik` di divisi** — divisi.html: nama orang yang memiliki divisi. Dipakai untuk grouping kewajiban di laporan
- ✅ **Field `divisiPemilik` di lokasi** — lokasi.html: divisi mana yang punya lokasi ini. Dipakai untuk deteksi kewajiban internal (pemilik lokasi = pemilik divisi → bayar ke diri sendiri)
- ✅ **Toggle sembunyikan non-aktif** — divisi.html: checkbox pojok kanan atas untuk hide divisi non-aktif
- ✅ **Kirim foto di internal chat** — tombol 📎 di chat internal order, upload ke Storage (`internal_chat/{orderId}/...`), tampil sebagai thumbnail inline, bisa disertai caption teks
- ✅ **Kirim foto di inbox chat** — tombol 📎 di inbox.html, upload ke Storage (`inbox/{threadId}/...`). Consultation: imageUrl disimpan ke Firestore & tampil di chat.html. WA bot thread: foto disimpan Firestore (visible di inbox), teks tetap lewat Worker ke WA customer
- ✅ **Omzet per divisi per lokasi** — laporan.html section Per Lokasi: setiap card lokasi kini menampilkan breakdown omzet per divisi dengan progress bar % dan jumlah order
- ✅ **Kelola Supplier** — supplier.html (owner only): CRUD supplier/produksi luar, kontak tersembunyi dari non-owner, filter per divisi
- ✅ **Production Sheet** — production-sheet.html: tabel excel-style order aktif per divisi (bordir & papan-nama), kolom sisa hari (urgent/warn/ok), update status inline, filter search/status/urgent
- ✅ **Lempar ke Supplier** — order.html: CS ajukan item ke supplier → pending_approval → manager/owner approve → generate supplierToken → tombol kirim link via WA otomatis
- ✅ **Supplier View** — supplier-view.html: token-based, supplier lihat pesanan (kode order, item qty, ukuran, spek, file desain, target selesai, sisa hari) tanpa harga/kontak/nama customer, bisa update progress
- ✅ **Staff list cache TTL** — mentions.js `_staffCache` di-refresh setiap 5 menit, jadi staf baru otomatis muncul di @mention tanpa perlu reload manual
- ✅ **Badge 🔒 internal chat di kalender** — chip order di kalender.html kini tampil badge `🔒 N` jika ada pesan internal chat belum dibaca (per-user, sama seperti orders.html)
- ✅ **Fallback lokasiNama → branch** — order.html display lokasi menggunakan `lokasiNama || branch` agar order lama yang pakai field `branch` tetap tampil nama lokasinya
- ✅ **Production Sheet papan-nama multi-divisi** — tab papan-nama narik dari dua sumber: order `division == 'papan-nama'` langsung + order `division == 'bordir'` yang ada item "papan" di orderItems; di-merge, dedup, sort by dueDate
- ✅ **Keamanan isStaffAuth()** — Firestore rules kini membedakan anonymous auth (customer/supplier) vs staff login (email/password). Koleksi sensitif (users, settings, price_list, lokasi, divisions, chat_threads, notifications, feedback, dll) hanya bisa diakses staff login
- ✅ **Harga modal tidak bocor ke customer** — price_list diblokir untuk anonymous auth; chat.html fetch price_list di-wrap try/catch (gagal gracefully) + priceModal di-strip client-side sebagai defence-in-depth. Customer hanya bisa lihat konten product_knowledge (teks markdown)

---

## API untuk WA Bot (Cloudflare Worker)

File: `api/create-order.js`
Deploy: `cd api && npx wrangler deploy`
Live: `https://harmoni-order-api.adhiitmuh.workers.dev`

### Endpoints

**POST /create-order**
```json
{
  "division": "jersey",
  "customerName": "Ahmad Fauzi",
  "kontak": "628123456789",
  "dueDate": "2025-07-01",
  "totalPrice": 1500000,
  "dp": 500000,
  "notes": "Jersey futsal 11 pcs, merah-hitam",
  "sumberOrder": "wa_bot",
  "agentSessionId": "wa_session_abc123"
}
Header: X-API-Key: {API_SECRET_KEY}
```

Response:
```json
{
  "success": true,
  "orderNumber": "HRM-JRS-2025-0042",
  "orderId": "uuid",
  "chatToken": "abc123...",
  "chatUrl": "https://adhiitmuh.github.io/custom-order-harmoni/chat.html?t=abc123"
}
```

**GET /get-order?order_number=HRM-JRS-2025-0042**

**PATCH /update-status** `{ "orderId": "uuid", "status": "in-progress" }`

**POST /notify-customer** — Kirim notif WA ke customer
```json
Header: X-Notify-Key: {NOTIFY_KEY}
{
  "orderId": "uuid",
  "customerContact": "628xxx",
  "customerName": "Ahmad",
  "orderNumber": "HRM-JRS-2025-0042",
  "chatToken": "abc123",
  "type": "status_change" | "progress" | "chat" | "manual",
  "statusLabel": "Sedang Dikerjakan",   // untuk type status_change
  "percentage": 60,                      // untuk type progress
  "lokasiNama": "Titik Harmoni Manggala" // opsional, untuk footer
}
```
- Cooldown 4 jam untuk `type: 'chat'` — dicek via `lastCustomerNotifAt` di Firestore
- Footer: `_[lokasiNama] by Harmoni Indonesia_` atau `_Harmoni Indonesia · Makassar_`
- Sementara pakai Fonnte API — **akan dimigrasi ke WA Cloud API (Meta)**

**POST /notify-cs** — Notif CS saat ada pesan masuk (dari chat publik)
Increment `unreadCustomerChat` di order dokumen.

**GET /knowledge?division=jersey** — Data product knowledge untuk WA Bot
```
Header: X-API-Key: {API_SECRET_KEY}
Response: { "success": true, "division": "jersey", "knowledge": "...(markdown)..." }
```

---

## WhatsApp Cloud API (Meta) — Rencana Migrasi dari Fonnte

**Keputusan:** Migrasi dari Fonnte ke **WA Cloud API resmi (Meta)** untuk WA Bot dan notif customer.

**Alasan:**
- Tidak bergantung third-party (Fonnte) — lebih stabil
- Pricing lebih predictable
- Bisa kirim template message (notif ke customer tanpa harus customer chat dulu)
- Fitur lebih lengkap (read receipts, media, interactive buttons)

### Pricing WA Cloud API (Indonesia, per conversation = 24 jam window)

| Kategori | Kapan | Harga/conv |
|---|---|---|
| **Utility** | Notif order: status, progress, invoice | ~$0.021 |
| **Service** | Customer balas dalam 24 jam | Gratis s/d 1.000/bln |
| **Marketing** | Promo, broadcast | ~$0.052 |

**Estimasi biaya notif customer:**
- 30 order/bulan × 3 notif/order = 90 conversation → ~$1.89/bln
- Hemat vs Fonnte (Fonnte per pesan, WA Cloud per conversation 24 jam)

### Setup WA Cloud API

1. Buat **Meta Business Account** di business.facebook.com
2. Buat **WhatsApp Business App** di developers.facebook.com
3. Tambah nomor WA dedicated (bukan nomor personal)
4. Generate `WA_CLOUD_API_TOKEN` (permanent token via System User)
5. Catat `WA_PHONE_NUMBER_ID` (ID nomor WA Business di Meta)
6. Update Worker — ganti `fonnteSend()` dengan `waSend()` ke `graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages`
7. Daftarkan **webhook** Meta → arahkan ke `/incoming-chat` di Worker

### Template Message (untuk notif ke customer — di luar 24 jam window)
Perlu daftarkan template di Meta Business Manager dulu (approval ~24 jam).

---

## Arsitektur Unified WA Bot (Custom Order + Ready Stock)

Bot berjalan langsung di Cloudflare Worker (`/incoming-chat`).
WA Cloud API webhook (atau Fonnte sementara) → Worker → proses background via `ctx.waitUntil()` → balas via WA Cloud API.

### Menu Dinamis — Nomor Generate Otomatis

Menu bot **tidak hardcoded** — nomor di-generate saat runtime berdasarkan:
1. Divisi aktif dari Firestore `divisions` (hanya yang `aktif: true`)
2. Kategori produk dari Olsera API (cache 1 jam)

Contoh output menu:
```
Halo! Selamat datang di Harmoni 👋

🎨 *CUSTOM ORDER*
1. Bordir
2. Jersey & Batik
3. Konveksi
4. Kaos & Sablon
5. Medali & Pin Logam
6. Papan Nama

🛍 *READY STOCK*
7. Kaos Polos
8. Topi
9. Celana Training

💬 10. Bicara dengan CS

Balas dengan angka pilihan ya 😊
```

Mapping angka → tujuan disimpan di session:
```json
{
  "menuMap": {
    "1": { "type": "custom_order", "division": "bordir" },
    "2": { "type": "custom_order", "division": "jersey" },
    "7": { "type": "ready_stock", "categoryId": "kaos-polos", "categoryName": "Kaos Polos" },
    "10": { "type": "cs" }
  }
}
```

Ketika customer balas angka → lookup `session.menuMap[angka]` → routing ke flow yang sesuai.

### Alur Bot

```
Customer WA
    │
    ▼
WA Cloud API Webhook → POST /incoming-chat (Cloudflare Worker)
    │
    ├─ Load session chat_sessions/{waNumber}
    │
    ├─ [Pesan pertama / idle 12 jam] → build & kirim GREETING MENU
    │       ├─ Fetch divisi aktif dari Firestore `divisions` (aktif: true)
    │       ├─ Fetch kategori Olsera API (cache 1 jam di settings/olsera_cache)
    │       ├─ Generate nomor urut + simpan menuMap di session
    │       └─ Kirim menu ke customer
    │
    ├─ [Balas angka → custom_order]
    │       ├─ Load product_knowledge/{division} ← Firestore
    │       ├─ Load price_list/{division} ← Firestore
    │       ├─ Claude Haiku (cached knowledge) — kumpulkan info order
    │       ├─ Customer konfirmasi → POST /create-order → Firestore
    │       └─ Notif owner via WA Cloud API
    │
    ├─ [Balas angka → ready_stock]
    │       ├─ Tanya nama produk spesifik
    │       ├─ Query stok semua cabang PARALEL (Promise.all via Olsera API)
    │       ├─ Tampilkan cabang yang ada stok (stok 0 disembunyikan)
    │       ├─ Customer pilih cabang
    │       └─ [Reservasi] → full payment dulu
    │               ├─ Bot kirim info rekening transfer
    │               ├─ Customer kirim bukti bayar
    │               ├─ Bot forward notif ke CS/owner
    │               └─ CS verifikasi → konfirmasi → update Olsera manual
    │
    ├─ [Balas angka → cs / pesan kompleks]
    │       └─ Eskalasi ke CS → buat consultations/{token} → notif CS
    │
    └─ [FAQ hardcoded] → balas langsung, 0 Claude token
```

### Session State: `chat_sessions/{waNumber}`

```json
{
  "mode": "menu | custom_order | ready_stock | cs_escalated",
  "division": "jersey | bordir | ... | null",
  "menuMap": {
    "1": { "type": "custom_order", "division": "bordir" },
    "7": { "type": "ready_stock", "categoryId": "kaos-polos" },
    "10": { "type": "cs" }
  },
  "history": ["...8 pesan terakhir..."],
  "lastActive": 1234567890,
  "customerName": "Ahmad",
  "orderDraft": { "qty": 11, "spek": "merah-hitam", "deadline": "2025-08-01" }
}
```

Session reset setelah idle 12 jam.

### Biaya per Mode

| Mode | Knowledge Source | Claude | WA Cloud API |
|---|---|---|---|
| Greeting / FAQ | Firestore divisions + Olsera cache | 0 token | 1 conv/24 jam |
| Custom Order | Firestore product_knowledge + price_list | Haiku (cached) | 1 conv/24 jam |
| Ready Stock | Olsera API real-time | Haiku (data inject) | 1 conv/24 jam |
| Eskalasi CS | — | 0 token | 1 conv/24 jam |

---

## Strategi Hemat Token (Claude API)

### 1. Prompt Caching — hemat 90% untuk konten statis

```javascript
{
  system: [
    { type: "text", text: BASE_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: knowledge_divisi, cache_control: { type: "ephemeral" } }
  ],
  messages: conversation_history
}
```

Cache TTL 5 menit. Cache read = $0.30/1M token (vs $3.00 normal) → hemat 90%.

### 2. Haiku untuk Routing — hemat 73%

```
Pesan masuk → Haiku: "FAQ / cek status / order baru?"
FAQ / cek status → Haiku selesai
Order baru       → escalate ke Sonnet
```

### 3. FAQ Hardcoded — 0 token

```javascript
const FAQ = {
  "jam buka":        "Kami buka Senin–Sabtu 08.00–17.00 WITA",
  "lokasi":          "Jl. [alamat] Makassar",
  "lama pengerjaan": "Tergantung divisi, estimasi 3–7 hari kerja",
}
```

### 4. Potong History — hemat 35%

```javascript
const MAX_HISTORY = 8
const messages = conversationHistory.slice(-MAX_HISTORY)
```

### 5. Knowledge Ringkas — target < 500 token per divisi

**Estimasi budget Claude:** ~Rp 200–250rb/bulan (10–30 order) dengan semua optimasi aktif.

---

## Fase Pengembangan Agent

### Phase 1 — Bot Custom Order

- [x] Cloudflare Worker API (`api/create-order.js`)
- [x] Field `sumberOrder` di app
- [x] Tag lokasi per order (lokasiId, lokasiNama, lokasiTipe, produksiUnit)
- [x] Halaman `lokasi.html` — CRUD kelola lokasi (owner only)
- [x] `laporan.html` — section per lokasi + komisi mitra
- [x] `orders.html` — filter per lokasi + badge + tab divisi
- [x] Bot flow lengkap di Worker (`/incoming-chat` dengan `ctx.waitUntil`)
- [x] `WORKER_URL` diisi di `inbox.html` dan `chat.html`
- [x] **Worker sudah deployed** ke `https://harmoni-order-api.adhiitmuh.workers.dev`
- [x] Endpoint `/notify-customer` — auto-notif WA ke customer (sementara Fonnte)
- [ ] **Migrasi Fonnte → WA Cloud API (Meta)** — setup Meta Business, update `fonnteSend()` → `waSend()`
- [ ] **Set `CLAUDE_API_KEY`** — `npx wrangler secret put CLAUDE_API_KEY`
- [ ] **Deploy Firestore rules** — `firebase deploy --only firestore:rules` (ada perubahan: `feedback` collection)
- [ ] Setup WA webhook → arahkan ke `/incoming-chat` (setelah WA Cloud API aktif)
- [ ] Fungsi `buildMenu(env)` di Worker — fetch divisi aktif (Firestore) + kategori Olsera (cache), generate nomor urut, simpan `menuMap` di session
- [ ] Handler angka masuk → lookup `session.menuMap[angka]` → routing ke custom_order / ready_stock / cs
- [ ] Handler flow `custom_order` — load knowledge dari Firestore, percakapan via Claude Haiku, POST /create-order
- [ ] Isi product knowledge + price list semua 11 divisi di Firestore

### Phase 2 — Integrasi Olsera Ready Stock

- [ ] Buat Cloudflare KV namespace `OLSERA_KV` — tambah ke `wrangler.toml`
- [ ] Isi daftar cabang di Firestore `settings/olsera_branches`
- [ ] Isi API key per cabang di KV — `npx wrangler kv:key put --binding=OLSERA_KV`
- [ ] Fungsi `fetchOlseraCategories(env)` → GET Olsera API → cache Firestore
- [ ] Fungsi `queryOlseraStock(keyword, env)` → `Promise.all()` semua cabang
- [ ] Handler menu 12 (ready stock) — tampil cabang berisi stok, customer pilih
- [ ] Flow reservasi — bot kirim info rekening, forward bukti ke CS
- [ ] **Cek dulu di Olsera API**: apakah ada field `available_stock` / `reserved`?

### Phase 3 — Notifikasi & Owner Query

- [x] Notif WA ke customer: status berubah, progress update, staff reply (cooldown 4 jam)
- [ ] Daily WA summary ke owner (cron Worker jam 08.00 WITA / 00:00 UTC — cron sudah ada di wrangler.toml, handler belum)
- [ ] Owner Query Agent — owner tanya via WA, agent jawab dari Firestore
- [ ] Deadline reminder H-2 otomatis ke customer

---

## Bug / Pending Fix

*(Tidak ada bug aktif saat ini)*

---

## Integrasi Olsera (Ready Stock)

Olsera = ready stock, app ini = custom order. Keduanya dihandle oleh 1 WA Bot yang sama.

### API Key per Cabang — simpan di Cloudflare KV

`wrangler.toml` perlu tambah:
```toml
[[kv_namespaces]]
binding = "OLSERA_KV"
id = "xxx"  # buat via: npx wrangler kv:namespace create OLSERA_KV
```

Daftar cabang + mapping KV key disimpan di Firestore `settings/olsera_branches`:
```json
[
  { "id": "pusat", "name": "Pusat Makassar", "kvKey": "OLSERA_PUSAT", "alamat": "Jl. ...", "jam": "08.00–17.00" },
  { "id": "pnk", "name": "Cabang Panakkukang", "kvKey": "OLSERA_PNK", "alamat": "Jl. ...", "jam": "08.00–17.00" }
]
```

### Data yang Diambil dari Olsera

| Data | Metode | Cache |
|---|---|---|
| Kategori produk | GET /categories | 1 jam di Firestore settings/olsera_cache |
| Stok per produk per cabang | GET /products?q=xxx | Real-time (selalu fetch) |
| Pending/reserved stock | Field available_stock (cek dulu di API response) | Real-time |

### Aturan Reservasi Ready Stock

- Tidak ada soft reservation — stok tidak di-hold tanpa pembayaran
- Full payment dulu → CS konfirmasi → stok dikonfirmasi
- Payment gateway (Midtrans/Xendit) bisa ditambah belakangan

---

## Env Vars Cloudflare Worker (Lengkap)

```bash
# Secrets (wrangler secret put):
npx wrangler secret put FIREBASE_PROJECT_ID           # harmoni-custom-order
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY  # JSON service account
npx wrangler secret put FONNTE_API_KEY                # dari fonnte.com (sementara, akan diganti WA Cloud API)
npx wrangler secret put OWNER_WA_NUMBER               # 628xxx
npx wrangler secret put API_SECRET_KEY                # random secret
npx wrangler secret put NOTIFY_KEY                    # key untuk /notify-customer + /notify-cs
npx wrangler secret put CLAUDE_API_KEY                # Anthropic API key (belum di-set)
npx wrangler secret put FIREBASE_AUTH_API_KEY         # opsional

# Setelah migrasi ke WA Cloud API (Meta):
npx wrangler secret put WA_CLOUD_API_TOKEN            # permanent token dari Meta System User
npx wrangler secret put WA_PHONE_NUMBER_ID            # ID nomor WA Business di Meta

# KV (setelah buat namespace):
npx wrangler kv:key put --binding=OLSERA_KV "OLSERA_PUSAT" "api_key"
npx wrangler kv:key put --binding=OLSERA_KV "OLSERA_CABANG_A" "api_key"
# dst per cabang
```

---

## Konteks Bisnis

- Owner: Adhitya (Makassar)
- Peak season jersey: Agustus (karnaval)
- Volume custom order: bervariasi per divisi — 10–30 estimasi awal, bisa lebih
- **Target WA:** Migrasi dari Fonnte ke **WA Cloud API resmi (Meta)** — lebih stabil, template message, pricing per conversation bukan per pesan
- Notif customer sudah jalan via Fonnte (sementara) — migrasi ke WA Cloud API sebelum bot aktif penuh
- Reservasi ready stock: full payment dulu (transfer manual, CS verifikasi) — payment gateway bisa ditambah belakangan
- Lokasi: Pusat + Cabang + Titik (mitra) — tiap lokasi pakai nama sendiri di footer notif WA: "[Nama Lokasi] by Harmoni Indonesia"

---

## Model Bisnis — Divisi & Lokasi

### Struktur Kepemilikan

Setiap **divisi** dijalankan oleh anggota keluarga (saudara) yang berbeda sebagai usaha mandiri:
- Divisi memiliki dan membiayai produksi sendiri (beli bahan baku, bayar tenaga kerja)
- Divisi menentukan `hargaModal` (cost produksi) di `price_list`
- Divisi **bukan** karyawan — mereka mitra usaha keluarga independen

**Pusat, Cabang, dan Titik** adalah **titik penerimaan order** — bukan unit produksi:
- Menerima order dari customer
- Collect pembayaran dari customer
- Meneruskan order ke divisi yang relevan untuk diproduksi
- Berkewajiban membayar divisi sejumlah `hargaModal` per order

### Model Keuangan — Transfer Pricing

```
Customer bayar ke Lokasi (Pusat/Cabang/Titik):   Rp 100.000  ← harga jual (Normal/Promo/Admin)
Lokasi wajib bayar ke Divisi:                     Rp  70.000  ← hargaModal (cost produksi divisi)
─────────────────────────────────────────────────────────────
Margin Lokasi:                                    Rp  30.000
```

- **Divisi** → revenue mereka = `hargaModal` × qty semua order divisi itu di periode tertentu
- **Lokasi** → profit mereka = Σ(harga customer) − Σ(hargaModal) semua order di lokasi itu

### Keamanan Data Customer

Tim produksi dan CS bisa chat dengan customer via link token (chat.html) untuk diskusi desain, **tanpa bisa melihat nomor WA/kontak customer** — hanya owner yang bisa lihat. Ini mencegah pengambilan customer secara langsung oleh staf atau divisi.

### Pemilik Divisi & Lokasi

| Field | Di mana | Isi | Fungsi |
|---|---|---|---|
| `divisions/{key}.pemilik` | Firestore, edit di divisi.html | Nama orang (Adhitya/Achmadi/dll) | Group kewajiban per orang di laporan |
| `lokasi/{id}.divisiPemilik` | Firestore, edit di lokasi.html | Key divisi (cth: `konveksi`) | Deteksi kewajiban internal vs eksternal |

**Kewajiban internal** = order dari lokasi milik divisi yang sama → flagged biru "bayar ke diri sendiri", tidak masuk total kewajiban eksternal.

### Implikasi untuk Laporan

Laporan keuangan yang dibutuhkan per periode:

| Laporan | Untuk Siapa | Status |
|---|---|---|
| Omzet per lokasi | Owner | ✅ Ada di laporan.html |
| Breakdown metode bayar per lokasi | Owner | ✅ Ada di laporan.html |
| Kewajiban ke divisi per pemilik | Owner | ✅ Ada di laporan.html — grouped by `pemilik`, dengan rekening tujuan |
| Kewajiban internal vs eksternal | Owner | ✅ Ada — flag berdasarkan `divisiPemilik` lokasi |
| Margin lokasi | Owner | ✅ Ada di laporan.html |
| Revenue per divisi | Owner | ✅ Sama dengan kewajiban eksternal yang diterima tiap divisi |

**Catatan:** `hargaModal` wajib diisi di setiap order agar laporan akurat. Field ada di `orders.hargaModal` dan referensinya di `price_list/{division}.items[].priceModal`.
