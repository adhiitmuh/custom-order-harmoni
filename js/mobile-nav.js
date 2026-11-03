// Tampilan HP: bar atas + tombol ☰ membuka menu samping sebagai laci (lihat @media di css/style.css)
export function pasangNavHp() {
  if (document.getElementById('mobileTopbar')) return
  const judul = (document.querySelector('.main h1')?.textContent || document.title || 'Harmoni').trim()

  const bar = document.createElement('div')
  bar.id = 'mobileTopbar'
  bar.className = 'mobile-topbar'
  bar.innerHTML = `
    <button type="button" class="mobile-menu-btn" aria-label="Buka menu">☰</button>
    <div class="mobile-title"></div>
    <button type="button" class="mobile-bell" aria-label="Notifikasi">🔔<span class="mobile-bell-badge"></span></button>
    <img src="img/logo-beige.png" alt="harmoni" class="mobile-logo">`
  bar.querySelector('.mobile-title').textContent = judul
  const backdrop = document.createElement('div')
  backdrop.className = 'sidebar-backdrop'

  const buka = v => document.body.classList.toggle('sidebar-open', v)
  bar.querySelector('.mobile-menu-btn').addEventListener('click', () => buka(true))
  backdrop.addEventListener('click', () => buka(false))
  // Pilih menu → laci tertutup
  document.getElementById('sidebar')?.addEventListener('click', e => { if (e.target.closest('a')) buka(false) })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') buka(false) })

  bar.querySelector('.mobile-bell').addEventListener('click', () => window.toggleNotifPanel?.())
  // Angka badge lonceng di bar atas mengikuti badge lonceng di menu samping
  const badgeHp = bar.querySelector('.mobile-bell-badge')
  const salinBadge = () => {
    const asli = document.getElementById('notifBadge')
    const tampil = asli && asli.style.display !== 'none' && asli.textContent.trim()
    badgeHp.textContent = tampil ? asli.textContent.trim() : ''
    badgeHp.style.display = tampil ? '' : 'none'
  }
  new MutationObserver(salinBadge).observe(document.getElementById('sidebar') || document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] })
  salinBadge()

  document.body.prepend(bar)
  document.body.appendChild(backdrop)
}
