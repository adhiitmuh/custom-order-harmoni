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
├── orders.html         — List order + filter + search
├── new-order.html      — Form order baru + upload file ke Storage
├── order.html          — Detail order + progress update + approval harga
├── laporan.html        — Laporan keuangan per periode
├── crm.html            — CRM Pelanggan (derived dari orders)
├── kalender.html       — Kalender produksi (by dueDate)
├── knowledge.html      — Product knowledge per divisi + price list
├── users.html          — Kelola pengguna (owner only)
├── chat.html           — Chat publik pelanggan (token-based, standalone, no auth)
├── css/style.css
├── js/
│   ├── config.js       — Firebase init (auth, db, storage) — di-import semua halaman
│   ├── auth.js         — requireAuth() + renderSidebar() + role helpers
│   └── utils.js        — Konstanta + helper functions
├── api/
│   ├── create-order.js — Cloudflare Worker: API untuk WA Bot
│   └── wrangler.toml   — Config deploy Cloudflare
├── firestore.rules     — Firestore Security Rules (RLS)
└── SETUP.md            — Panduan setup Firebase + deploy
```

---

## Firebase Config

Project ID: `harmoni-custom-order`
Config ada di `js/config.js` — hardcoded, ini aman untuk repo publik (anon key Firebase memang publik, keamanan diatur via Firestore Rules).

**Catatan:** `chat.html` standalone — hardcode config sendiri karena tidak pakai `js/config.js` (halaman ini diakses publik tanpa auth).

---

## Data Model (Firestore)

### Collection `orders`

```
orderNumber         string    — "HRM-JRS-2025-0001" (auto dari counter)
division            string    — lihat DIVISIONS di utils.js
customerName        string
customerContact     string    — WA / email (hanya owner & CS yang lihat)
orderDate           string    — YYYY-MM-DD
dueDate             string    — target selesai YYYY-MM-DD
status              string    — lihat STATUS_LABEL di utils.js
progressPercentage  number    — 0-100
totalPrice          number
depositPaid         number
notes               string
designFiles         string[]  — array URL Firebase Storage
chatToken           string    — token unik untuk customer chat (24 chars)
sumberOrder         string    — 'staff' | 'wa_bot' | 'walk_in' | 'shopee' | 'instagram'
agentSessionId      string    — ID sesi WA bot (kosong kalau dari staff)
lokasiId            string    — FK ke collection `lokasi`
lokasiNama          string    — denormalized nama lokasi
lokasiTipe          string    — 'pusat' | 'cabang' | 'titik'
produksiUnit        string    — unit produksi yang handle (dari PRODUKSI_UNIT di utils.js)
priceApprovalStatus string    — 'approved' | 'pending'
priceApprovalTier   string    — null | 'promo' | 'admin'
priceApprovalReason string
priceApprovalBy     string    — uid approver
priceApprovalAt     timestamp
createdBy           string    — uid user / 'wa_bot'
createdAt           timestamp
updatedAt           timestamp
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
division, items[{name, priceNormal, pricePromo, priceAdmin, unit}]
```

### Collection `public_order_info/{chatToken}`
Dibuat saat order baru, key = chatToken. Untuk akses customer chat publik.

### Collection `chat_messages/{chatToken}/messages/{msgId}`
Chat realtime. Public read + create (siapapun dengan token bisa kirim pesan).

### Collection `lokasi/{id}`
```
nama            string    — "Titik Harmoni Manggala"
tipe            string    — 'pusat' | 'cabang' | 'titik'
kota            string    — "Makassar"
pj              string    — penanggung jawab
komisiPersen    number    — % komisi mitra (hanya tipe 'titik', default 15)
aktif           boolean
createdAt       timestamp
updatedAt       timestamp
```

### Collection `settings/{id}`
- `monthly_target`: `{ amount: number }` — target omzet bulanan

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
- ✅ Cloudflare Worker API untuk WA Bot (`api/create-order.js`)

---

## API untuk WA Bot (Cloudflare Worker)

File: `api/create-order.js`
Deploy: `cd api && npx wrangler deploy`

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

### Env vars yang dibutuhkan di Cloudflare (wrangler secret put):
```
FIREBASE_PROJECT_ID       = harmoni-custom-order
FIREBASE_SERVICE_ACCOUNT_KEY = {JSON service account dari Firebase Console}
FONNTE_API_KEY            = {API key dari fonnte.com}
OWNER_WA_NUMBER           = 628xxx (nomor WA owner, format 62xxx)
API_SECRET_KEY            = {random secret, sama dengan yang di n8n}
```

---

## Arsitektur Unified WA Bot (Custom Order + Ready Stock)

Bot berjalan langsung di Cloudflare Worker (`/incoming-chat`) — tidak pakai n8n.
Fonnte webhook → Worker → proses background via `ctx.waitUntil()` → balas via Fonnte API.

```
Customer WA
    │
    ▼
Fonnte Webhook → POST /incoming-chat (Cloudflare Worker)
    │
    ├─ Load session chat_sessions/{waNumber}
    │
    ├─ [Pesan pertama / idle 12 jam] → kirim GREETING MENU
    │       🎨 CUSTOM ORDER (1–11, per divisi)
    │       🛍 READY STOCK  (12)
    │       💬 BICARA CS    (13)
    │
    ├─ [Pilih 1–11: Custom Order]
    │       ├─ Load product_knowledge/{division} ← Firestore
    │       ├─ Load price_list/{division} ← Firestore
    │       ├─ Claude Haiku (cached knowledge) — kumpulkan info order
    │       ├─ Customer konfirmasi → POST /create-order → Firestore
    │       └─ Notif owner via Fonnte
    │
    ├─ [Pilih 12: Ready Stock]
    │       ├─ Fetch kategori dari Olsera API (cache 1 jam di Firestore settings/olsera_cache)
    │       ├─ Customer pilih kategori → tanya produk spesifik
    │       ├─ Query stok semua cabang PARALEL (Promise.all)
    │       │       Branch Pusat  (Olsera API Key 1)
    │       │       Branch Cabang (Olsera API Key 2..N)
    │       ├─ Tampilkan cabang yang ada stok + jumlah (stok 0 disembunyikan)
    │       ├─ Customer pilih cabang
    │       └─ [Reservasi] → instruksikan full payment dulu
    │               ├─ Bot kirim info rekening transfer
    │               ├─ Customer kirim bukti bayar
    │               ├─ Bot forward notif ke CS/owner
    │               └─ CS verifikasi → konfirmasi ke customer → update Olsera manual
    │
    ├─ [Pilih 13 / kompleks / tidak tahu]
    │       └─ Eskalasi ke CS → buat consultations/{token} → notif CS
    │
    └─ [FAQ hardcoded] → balas langsung, 0 Claude token
```

### Session State: `chat_sessions/{waNumber}`

```json
{
  "mode": "menu | custom_order | ready_stock | cs_escalated",
  "division": "jersey | bordir | ... | null",
  "history": ["...8 pesan terakhir..."],
  "lastActive": 1234567890,
  "customerName": "Ahmad",
  "orderDraft": { "qty": 11, "spek": "merah-hitam", "deadline": "2025-08-01" }
}
```

Session reset setelah idle 12 jam.

### Biaya per Mode

| Mode | Knowledge Source | Claude | Fonnte |
|---|---|---|---|
| Greeting / FAQ | Hardcoded | 0 token | 1 pesan |
| Custom Order | Firestore product_knowledge + price_list | Haiku (cached) | 1/balas |
| Ready Stock | Olsera API real-time | Haiku (data inject) | 1/balas |
| Eskalasi CS | — | 0 token | 2 pesan |

### Endpoint `GET /knowledge`

```
GET /knowledge?division=jersey
Header: X-API-Key: {API_SECRET_KEY}
Response: { "success": true, "division": "jersey", "knowledge": "...(markdown)..." }
```

---

## Strategi Hemat Token (untuk n8n + Claude API)

### 1. Prompt Caching — hemat 90% untuk konten statis

```javascript
// System prompt dengan cache_control
{
  system: [
    {
      type: "text",
      text: BASE_PROMPT,        // instruksi CS agent
      cache_control: { type: "ephemeral" }
    },
    {
      type: "text",
      text: knowledge_divisi,   // dari GET /knowledge
      cache_control: { type: "ephemeral" }
    }
  ],
  messages: conversation_history  // tidak di-cache (dinamis)
}
```

Cache TTL 5 menit. Selama percakapan aktif, input statis tidak dihitung ulang.
Cache read = $0.30/1M token (vs $3.00 normal) → **hemat 90%**.

### 2. Haiku untuk Routing — hemat 73% untuk pesan simpel

```
Pesan masuk
    ↓
Haiku ($0.80/1M): "Ini order baru, cek status, atau FAQ?"
    ↓
FAQ / cek status → Haiku selesai (tanpa Sonnet)
Order baru       → escalate ke Sonnet ($3.00/1M)
```

### 3. FAQ Hardcoded — 0 token

```javascript
const FAQ = {
  "jam buka":        "Kami buka Senin–Sabtu 08.00–17.00 WITA",
  "lokasi":          "Jl. [alamat] Makassar",
  "lama pengerjaan": "Tergantung divisi, estimasi 3–7 hari kerja",
  "ready stock":     "Ready stock dihandle di Olsera. Untuk custom order, silakan lanjutkan di sini.",
}
```

### 4. Potong History — hemat 35%

```javascript
const MAX_HISTORY = 8  // hanya 8 pesan terakhir dikirim ke Claude
const messages = conversationHistory.slice(-MAX_HISTORY)
```

### 5. Knowledge Ringkas — target < 500 token per divisi

```
❌ Verbose: "Untuk pemesanan jersey, pelanggan perlu mengetahui bahwa minimum order..."
✅ Ringkas:  "- Min order: 10 pcs\n- Harga: <50pcs=85rb, 50-100=75rb, >100=65rb"
```

**Estimasi budget:** ~Rp 200–250rb/bulan (10–30 order) dengan semua optimasi aktif.

---

## Fase Pengembangan Agent

### Phase 1 — Bot Custom Order (Sudah/Segera)
- [x] Cloudflare Worker API (`api/create-order.js`)
- [x] Field `sumberOrder` di app
- [x] Tag lokasi per order (lokasiId, lokasiNama, lokasiTipe, produksiUnit)
- [x] Halaman `lokasi.html` — CRUD kelola lokasi (owner only)
- [x] `laporan.html` — section per lokasi + komisi mitra
- [x] `orders.html` — filter per lokasi + badge
- [x] Bot flow lengkap di Worker (`/incoming-chat` dengan `ctx.waitUntil`)
- [x] `WORKER_URL` diisi di `inbox.html` dan `chat.html`
- [ ] **Deploy Worker** — `cd api && npx wrangler deploy`
- [ ] **Set `CLAUDE_API_KEY`** — `npx wrangler secret put CLAUDE_API_KEY`
- [ ] **Deploy Firestore rules** — `firebase deploy --only firestore:rules`
- [ ] Setup Fonnte webhook → arahkan ke `https://harmoni-order-api.adhiitmuh.workers.dev/incoming-chat`
- [ ] Update `GREETING_MSG` di Worker → format menu bernomor (1–13)
- [ ] Tambah handler angka 1–11 → set session.mode + session.division + load knowledge
- [ ] Knowledge files semua 11 divisi diisi di Firestore `product_knowledge`

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
- [ ] Status Update Agent → notif otomatis ke customer saat status order berubah
- [ ] Daily WA summary ke owner (cron Worker jam 08.00 WITA / 00:00 UTC — sudah ada di wrangler.toml)
- [ ] Owner Query Agent — owner tanya via WA, agent jawab dari Firestore
- [ ] Deadline reminder H-2 otomatis

---

## Integrasi Olsera (Ready Stock)

Olsera = ready stock, app ini = custom order. Keduanya dihandle oleh 1 WA Bot yang sama.

### API Key per Cabang — simpan di Cloudflare KV

Jangan pakai env vars untuk banyak cabang. Pakai **Cloudflare KV**:

`wrangler.toml` perlu tambah:
```toml
[[kv_namespaces]]
binding = "OLSERA_KV"
id = "xxx"  # buat via: npx wrangler kv:namespace create OLSERA_KV
```

Setup key per cabang:
```bash
npx wrangler kv:key put --binding=OLSERA_KV "OLSERA_PUSAT" "api_key_xxx"
npx wrangler kv:key put --binding=OLSERA_KV "OLSERA_CABANG_A" "api_key_yyy"
# dst untuk tiap cabang
```

Daftar cabang + mapping KV key disimpan di Firestore `settings/olsera_branches`:
```json
[
  { "id": "pusat", "name": "Pusat Makassar", "kvKey": "OLSERA_PUSAT", "alamat": "Jl. ...", "jam": "08.00–17.00" },
  { "id": "pnk", "name": "Cabang Panakkukang", "kvKey": "OLSERA_PNK", "alamat": "Jl. ...", "jam": "08.00–17.00" }
]
```

Mudah tambah/hapus cabang tanpa redeploy Worker — cukup update Firestore + tambah KV key.

### Data yang Diambil dari Olsera

| Data | Metode | Cache |
|---|---|---|
| Kategori produk | GET /categories | 1 jam di Firestore settings/olsera_cache |
| Stok per produk per cabang | GET /products?q=xxx | Real-time (selalu fetch) |
| Pending/reserved stock | Field available_stock (cek dulu di API response) | Real-time |

**Stok selalu real-time** — otomatis update setiap transaksi kasir di Olsera POS.

### Aturan Reservasi Ready Stock

- **Tidak ada soft reservation** — stok tidak di-hold tanpa pembayaran
- **Full payment dulu** → CS konfirmasi → stok dikonfirmasi
- Flow: bot kirim info rekening → customer transfer → kirim bukti → CS verifikasi manual → update Olsera
- Payment gateway (Midtrans/Xendit) bisa ditambah belakangan kalau volume tinggi

---

## Env Vars Cloudflare Worker (Lengkap)

```bash
# Secrets (wrangler secret put):
npx wrangler secret put FIREBASE_PROJECT_ID        # harmoni-custom-order
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY  # JSON service account
npx wrangler secret put FONNTE_API_KEY             # dari fonnte.com
npx wrangler secret put OWNER_WA_NUMBER            # 628xxx
npx wrangler secret put API_SECRET_KEY             # random secret
npx wrangler secret put NOTIFY_KEY                 # key untuk /incoming-chat + /notify-cs
npx wrangler secret put CLAUDE_API_KEY             # Anthropic API key
npx wrangler secret put FIREBASE_AUTH_API_KEY      # opsional

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
- Target: 1 WA Bot menangani semua inquiry (custom order + ready stock) 24 jam via Fonnte
- Fonnte cocok untuk volume sekarang — pertimbangkan WA Business API resmi kalau >200–300 percakapan/hari
- Reservasi ready stock: full payment dulu (transfer manual, CS verifikasi) — payment gateway bisa ditambah belakangan
