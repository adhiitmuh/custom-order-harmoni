import { auth, authDb, db, dataAuth } from './config.js'
import { onAuthStateChanged, signOut, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { DIVISION_META, DIVISIONS } from './utils.js'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/custom-order-harmoni/sw.js').catch(() => {})
}

// Pastikan dataAuth (harmoni-custom-order) selalu punya sesi agar Firestore rules isAuth() lolos
// Juga expose promise supaya halaman bisa tunggu sebelum query Firestore
export const dataAuthReady = new Promise(resolve => {
  onAuthStateChanged(dataAuth, (u) => {
    if (u) { resolve(u); return }
    signInAnonymously(dataAuth).then(cred => resolve(cred.user)).catch(() => resolve(null))
  })
})

let _user = null
let _profile = null

export const getUser = () => _user
export const getProfile = () => _profile
export const canViewContact = (role) => role === 'owner'

// Returns true if user has production access for the given division
// (either pure production role, or merangkap production with that division)
export function hasProductionAccess(profile, division) {
  if (!profile) return false
  if (profile.role === 'production') return true
  if (profile.merangkapProduction) {
    return !division || (profile.divisions?.includes(division) ?? false)
  }
  return false
}

function showAccessDenied(msg) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:#f9fafb;font-family:sans-serif;text-align:center;padding:24px;">
      <div style="font-size:44px;">🚫</div>
      <div style="font-size:18px;font-weight:700;color:#034543;">Akses Tidak Diizinkan</div>
      <div style="color:#6b7280;max-width:320px;">${msg}</div>
      <a href="https://adhiitmuh.github.io/harmoni-indonesia/" style="margin-top:8px;color:#034543;font-weight:600;text-decoration:none;">← Kembali ke Portal</a>
    </div>`
}

let _callbackFired = false

export function requireAuth(callback) {
  // ── Optimistic render: render immediately from sessionStorage ──
  // Don't wait for Firebase Auth at all — show page right away,
  // then verify auth in background. If user is logged out, redirect.
  const cachedUid = sessionStorage.getItem('harmoni_uid')
  if (cachedUid) {
    const cached = sessionStorage.getItem(`profile_${cachedUid}`)
    if (cached) {
      try {
        _profile = JSON.parse(cached)
        renderSidebar(_profile)
        callback(_profile)
        _callbackFired = true
      } catch { /* fall through */ }
    }
  }

  // ── Background auth verification ──
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      sessionStorage.removeItem('harmoni_uid')
      window.location.href = 'index.html'
      return
    }
    // If a different user is now logged in, clear stale cache
    if (cachedUid && cachedUid !== user.uid) sessionStorage.clear()
    sessionStorage.setItem('harmoni_uid', user.uid)
    _user = user

    try {
      const snap = await getDoc(doc(authDb, 'users', user.uid))
      const data = snap.exists() ? snap.data() : null

      if (!data || !data.aktif) {
        showAccessDenied('Akun belum diaktifkan. Hubungi admin.')
        return
      }

      let appRole, appDivisions = [], appMerangkapProduction = false
      if (data.role === 'owner') {
        appRole = 'owner'
      } else {
        const appAccess = data.apps?.custom_order
        if (!appAccess?.akses) {
          showAccessDenied('Akun ini tidak memiliki akses ke Harmoni Custom Order.')
          return
        }
        appRole = appAccess.role || 'cs'
        // Divisi tim produksi diatur di Portal Utama (apps.custom_order.divisions)
        appDivisions = appAccess.divisions || []
        // Merangkap production: user punya role utama + akses fitur produksi untuk divisi tertentu
        appMerangkapProduction = appAccess.merangkapProduction === true
      }

      const fresh = { id: snap.id, ...data, name: data.nama || user.email, role: appRole, divisions: appDivisions, merangkapProduction: appMerangkapProduction }
      sessionStorage.setItem(`profile_${snap.id}`, JSON.stringify(fresh))

      // Sync role to harmoni-custom-order so Firestore Rules can check it
      setDoc(doc(db, 'users', snap.id), { role: appRole, branch: data.branch || '', merangkapProduction: appMerangkapProduction, divisions: appDivisions }, { merge: true }).catch(() => {})

      _profile = fresh
      renderSidebar(fresh)

      // Only fire callback if optimistic render didn't already run it
      if (!_callbackFired) {
        _callbackFired = true
        callback(fresh)
      }
    } catch {
      if (!_callbackFired) {
        _callbackFired = true
        _profile = { id: user.uid, name: user.email, role: 'cs' }
        renderSidebar(_profile)
        callback(_profile)
      }
    }
  })
}

export function renderSidebar(profile) {
  const el = document.getElementById('sidebar')
  if (!el) return
  const page = location.pathname.split('/').pop()
  const params = new URLSearchParams(location.search)
  const activeDiv = params.get('div')

  const divLinks = DIVISIONS.map(d => `
    <a href="knowledge.html?div=${d}" class="sidebar-link ${page === 'knowledge.html' && activeDiv === d ? 'active' : ''}">
      <span class="icon">${DIVISION_META[d].icon}</span>${DIVISION_META[d].label}
    </a>`).join('')

  el.innerHTML = `
    <div class="sidebar-nav">
    <div class="sidebar-logo">
      <div style="display:flex;align-items:center;gap:10px">
        <svg viewBox="0 0 100 100" width="28" height="28">
          <circle cx="74" cy="20" r="11" fill="#FFFBD5"/>
          <rect x="22" y="8" width="22" height="80" fill="#FFFBD5"/>
          <path d="M44 88 L44 50 Q44 36 58 36 Q72 36 72 50 L72 88 Z" fill="#FFFBD5"/>
        </svg>
        <div>
          <div class="brand-name">harmoni</div>
          <div class="brand-sub">ORDER SYSTEM</div>
        </div>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">MENU</div>
      <a href="dashboard.html" class="sidebar-link ${page==='dashboard.html'?'active':''}">
        <span class="icon">📊</span>Dashboard
      </a>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">PESANAN</div>
      <a href="orders.html" class="sidebar-link ${page==='orders.html'?'active':''}">
        <span class="icon">📋</span>Semua Order
      </a>
      ${profile.role !== 'production' && profile.role !== 'data' ? `
      <a href="new-order.html" class="sidebar-link ${page==='new-order.html'?'active':''}">
        <span class="icon">＋</span>Order Baru
      </a>` : ''}
      ${(profile.role==='manager'||profile.role==='owner') ? `
      <a href="orders.html?approval=promo" class="sidebar-link ${page==='orders.html'?'':''}">
        <span class="icon">🔑</span>Approval Harga
      </a>` : ''}
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">DIVISI</div>
      ${divLinks}
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">PRODUKSI</div>
      <a href="kalender.html" class="sidebar-link ${page==='kalender.html'?'active':''}">
        <span class="icon">📅</span>Kalender Produksi
      </a>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">PELANGGAN & KEUANGAN</div>
      <a href="crm.html" class="sidebar-link ${page==='crm.html'?'active':''}">
        <span class="icon">👥</span>CRM Pelanggan
      </a>
      <a href="laporan.html" class="sidebar-link ${page==='laporan.html'?'active':''}">
        <span class="icon">📊</span>Laporan Keuangan
      </a>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-label">REFERENSI</div>
      <a href="knowledge.html" class="sidebar-link ${page==='knowledge.html'&&!activeDiv?'active':''}">
        <span class="icon">📖</span>Product Knowledge
      </a>
      ${profile.role === 'owner' ? `
      <a href="https://adhiitmuh.github.io/harmoni-indonesia/" target="_blank" class="sidebar-link">
        <span class="icon">⚙️</span>Kelola Pengguna
      </a>
      <a href="settings.html" class="sidebar-link ${page==='settings.html'?'active':''}">
        <span class="icon">💳</span>Metode Pembayaran
      </a>` : ''}
    </div>
    </div>

    <div class="sidebar-user">
      <div class="avatar">${(profile.name||'U')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="user-name">${profile.name}</div>
        <div class="user-role">${(profile.role||'').toUpperCase()}${profile.merangkapProduction ? ' + PROD' : ''}${profile.branch ? ' · ' + profile.branch : ''}</div>
      </div>
      <button id="logoutBtn" title="Logout" style="background:none;border:none;cursor:pointer;opacity:.4;color:#FFFBD5;font-size:16px;padding:4px;line-height:1">⏻</button>
    </div>`

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    sessionStorage.clear()
    await Promise.all([signOut(auth), signOut(dataAuth).catch(() => {})])
    window.location.href = 'index.html'
  })
}
