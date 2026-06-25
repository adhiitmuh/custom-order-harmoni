import { db } from './config.js'
import {
  collection, doc, getDocs, addDoc, setDoc, increment, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

let _staffCache = null

export async function loadStaff() {
  if (_staffCache) return _staffCache
  const snap = await getDocs(collection(db, 'users'))
  const seen = new Set()
  _staffCache = snap.docs
    .map(d => ({ id: d.id, name: d.data().name || d.data().nama || '', role: d.data().role || '' }))
    .filter(u => u.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'id'))
    .filter(u => { if (seen.has(u.name)) return false; seen.add(u.name); return true })
  return _staffCache
}

export function parseMentions(text, staffList) {
  const found = []
  const sorted = [...staffList].sort((a, b) => b.name.length - a.name.length)
  for (const s of sorted) {
    if (text.includes('@' + s.name) && !found.find(f => f.id === s.id)) {
      found.push(s)
    }
  }
  return found
}

export function highlightMentions(escapedHtml, staffList, myId) {
  let result = escapedHtml
  const sorted = [...staffList].sort((a, b) => b.name.length - a.name.length)
  for (const s of sorted) {
    const safe = s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const isMe = s.id === myId
    result = result.replace(
      new RegExp('@' + safe, 'g'),
      `<span class="mention${isMe ? ' mention-me' : ''}">@${s.name}</span>`
    )
  }
  return result
}

export async function writeMentionNotifs(mentionedStaff, fromId, fromName, preview, orderId, orderNumber) {
  for (const staff of mentionedStaff) {
    if (staff.id === fromId) continue
    try {
      await setDoc(doc(db, 'user_mentions', staff.id), { unreadMentions: increment(1) }, { merge: true })
      await addDoc(collection(db, 'notifications'), {
        type:        'mention',
        targetUid:   staff.id,
        fromUid:     fromId,
        fromName:    fromName || 'Staff',
        preview:     preview ? preview.slice(0, 80) : '',
        orderId:     orderId || null,
        orderNumber: orderNumber || null,
        createdAt:   Timestamp.now(),
      })
    } catch (e) {
      console.warn('mention notif failed:', staff.id, e)
    }
  }
}

export async function resetMentionCount(uid) {
  try {
    await setDoc(doc(db, 'user_mentions', uid), { unreadMentions: 0 }, { merge: true })
  } catch {}
}

export function attachMentionAutocomplete(textarea, staffList) {
  let dropdown = null
  let atPos = -1

  function removeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null }
    atPos = -1
  }

  function getActiveMention() {
    const pos = textarea.selectionStart
    const before = textarea.value.slice(0, pos)
    const m = before.match(/(?:^|\s)@(\S*)$/)
    if (!m) return null
    return { query: m[1], atPos: before.lastIndexOf('@') }
  }

  function showDropdown(matches, foundAtPos) {
    removeDropdown()
    if (!matches.length) return
    atPos = foundAtPos

    dropdown = document.createElement('div')
    dropdown.className = 'mention-dropdown'
    dropdown.innerHTML = matches.map((s, i) =>
      `<div class="mention-item${i === 0 ? ' hover' : ''}" data-name="${s.name.replace(/"/g, '&quot;')}">
        ${s.name}<span class="mention-item-role">${s.role}</span>
      </div>`
    ).join('')

    dropdown.addEventListener('mousedown', e => {
      const item = e.target.closest('.mention-item')
      if (!item) return
      e.preventDefault()
      insertMention(item.dataset.name)
    })

    const rect = textarea.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    Object.assign(dropdown.style, {
      position: 'fixed',
      left: rect.left + 'px',
      width: Math.min(200, rect.width) + 'px',
      zIndex: '600',
    })
    if (spaceBelow < 180) {
      dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px'
    } else {
      dropdown.style.top = (rect.bottom + 4) + 'px'
    }
    document.body.appendChild(dropdown)
  }

  function insertMention(name) {
    const val = textarea.value
    const pos = textarea.selectionStart
    const before = val.slice(0, atPos)
    const after = val.slice(pos)
    textarea.value = before + '@' + name + ' ' + after
    const newPos = before.length + name.length + 2
    textarea.setSelectionRange(newPos, newPos)
    textarea.dispatchEvent(new Event('input'))
    textarea.focus()
    removeDropdown()
  }

  textarea.addEventListener('input', () => {
    const mention = getActiveMention()
    if (mention) {
      const filtered = staffList
        .filter(s => s.name.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 6)
      showDropdown(filtered, mention.atPos)
    } else {
      removeDropdown()
    }
  })

  textarea.addEventListener('keydown', e => {
    if (!dropdown) return
    const items = [...dropdown.querySelectorAll('.mention-item')]
    const activeIdx = items.findIndex(i => i.classList.contains('hover'))

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items.forEach(i => i.classList.remove('hover'))
      items[Math.min(activeIdx + 1, items.length - 1)]?.classList.add('hover')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items.forEach(i => i.classList.remove('hover'))
      items[Math.max(activeIdx - 1, 0)]?.classList.add('hover')
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const active = dropdown.querySelector('.mention-item.hover') || items[0]
      if (active) { e.preventDefault(); insertMention(active.dataset.name) }
    } else if (e.key === 'Escape') {
      e.preventDefault(); removeDropdown()
    }
  })

  textarea.addEventListener('blur', () => setTimeout(removeDropdown, 200))

  return removeDropdown
}
