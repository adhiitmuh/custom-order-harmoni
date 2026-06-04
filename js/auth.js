import { auth, db } from './config.js'
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { DIVISION_META, DIVISIONS } from './utils.js'

let _user = null
let _profile = null

export const getUser = () => _user
export const getProfile = () => _profile
export const canViewContact = (role) => role === 'owner'

export function requireAuth(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return }
    _user = user
    try {
      const snap = await getDoc(doc(db, 'users', user.uid))
      _profile = snap.exists() ? { id: snap.id, ...snap.data() } : { id: user.uid, name: user.email, role: 'cs', branch: '' }
    } catch {
      _profile = { id: user.uid, name: user.email, role: 'cs' }
    }
    renderSidebar(_profile)
    callback(_profile)
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
      ${profile.role !== 'production' ? `
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
      <a href="users.html" class="sidebar-link ${page==='users.html'?'active':''}">
        <span class="icon">⚙️</span>Kelola Pengguna
      </a>` : ''}
    </div>

    <div class="sidebar-user">
      <div class="avatar">${(profile.name||'U')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="user-name">${profile.name}</div>
        <div class="user-role">${(profile.role||'').toUpperCase()}${profile.branch ? ' · ' + profile.branch : ''}</div>
      </div>
      <button id="logoutBtn" title="Logout" style="background:none;border:none;cursor:pointer;opacity:.4;color:#FFFBD5;font-size:16px;padding:4px;line-height:1">⏻</button>
    </div>`

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut(auth)
    window.location.href = 'index.html'
  })
}
