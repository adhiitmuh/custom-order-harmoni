# Setup Harmoni Web (Firebase + GitHub Pages)

## 1. Firebase Console — Aktifkan layanan

### Authentication
1. Buka https://console.firebase.google.com → project `harmoni-custom-order`
2. Authentication → Sign-in method → Email/Password → Enable

### Firestore
1. Firestore Database → Create database → Start in test mode
2. Setelah jadi, masuk Rules tab → paste isi file `firestore.rules` → Publish

### Storage
1. Storage → Get started → mulai dengan rules default dulu
2. Ganti rules di Storage menjadi:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 2. Buat akun Owner pertama

1. Firebase Console → Authentication → Users → Add user
2. Isi Email: (misal) `owner@harmoni.id` dan Password
3. Setelah user terbuat, copy UID-nya
4. Firestore → users → Add document:
   - Document ID: (paste UID tadi)
   - Fields:
     - `name`: "Admin (Owner)" (string)
     - `email`: "owner@harmoni.id" (string)
     - `role`: "owner" (string)
     - `createdAt`: (timestamp, sekarang)

---

## 3. Deploy ke GitHub Pages

1. Buat repo baru di GitHub (misal: `harmoni-orders`)
2. Upload semua file dari folder `harmoni-web/`
3. Settings → Pages → Source: main branch → folder: / (root)
4. Tunggu ~1 menit → akses di `https://username.github.io/harmoni-orders/`

---

## 4. Login pertama

1. Buka URL GitHub Pages
2. Login dengan email & password yang dibuat di langkah 2
3. Product Knowledge masih kosong → buka halaman Knowledge → klik "Isi Data Default"

---

## Tambah CS / Tim Produksi

Login sebagai Owner → Kelola Pengguna → Tambah Pengguna
