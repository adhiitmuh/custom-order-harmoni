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

## Arsitektur Agent WA Bot

```
Customer WA
    │
    ▼
[Fonnte Webhook → n8n]
    │
    ├─ 1. Haiku: routing — order baru / follow-up / FAQ / ready stock?
    │
    ├─ FAQ hardcoded → balas langsung (0 token Claude)
    │
    ├─ Cek status → GET /get-order → balas
    │
    └─ Order baru:
         ├─ GET /knowledge?division=xxx → fetch dari Firestore
         ├─ Sonnet: kumpulkan info (nama, spek, qty, deadline)
         ├─ Customer konfirmasi → POST /create-order → Firebase
         └─ Notif WA customer + owner (via Fonnte)
```

### Endpoint Tambahan: GET /knowledge

Fetch knowledge divisi dari Firestore `product_knowledge` collection.

```
GET /knowledge?division=jersey
Header: X-API-Key: {API_SECRET_KEY}
```

Response: `{ "success": true, "division": "jersey", "knowledge": "...(markdown)..." }`

Dipakai n8n untuk inject ke system prompt Claude sebelum percakapan order.

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

### Phase 1 (Sekarang — deploy dulu)
- [x] Cloudflare Worker API (`api/create-order.js`)
- [x] Field `sumberOrder` di app
- [ ] Deploy Worker ke Cloudflare
- [ ] Setup n8n + Fonnte webhook
- [ ] Build CS Agent flow (1 divisi dulu — Jersey)

### Phase 2
- [ ] Endpoint `GET /knowledge` di Worker
- [ ] Knowledge files semua 11 divisi di Firestore
- [ ] Status Update Agent → notif otomatis ke customer saat status berubah
- [ ] Daily WA summary ke owner (n8n scheduled, jam 08.00)

### Phase 3
- [ ] Owner Query Agent — owner tanya via WA, agent jawab dari Firestore
- [ ] Deadline reminder H-2 otomatis

---

## Integrasi Olsera

**Tidak diintegrasikan untuk sekarang.** Olsera = ready stock, app ini = custom order — beda proses. Kalau customer tanya soal ready stock via WA Bot, agent jawab hardcoded: *"Ready stock bisa dilihat langsung di toko / hubungi admin."*

---

## Konteks Bisnis

- Owner: Adhitya (Makassar)
- Peak season jersey: Agustus (karnaval)
- Volume: 10–30 order/bulan
- Target: semua inquiry WA custom order dihandle AI Agent (n8n + Claude + Fonnte)
