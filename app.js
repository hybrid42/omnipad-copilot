/* ============================================================
   Omnipad — offline dashboard of website tiles
   Vanilla JS, no dependencies. State persisted in localStorage.
   ============================================================ */
(() => {
  'use strict';

  const GRID = 9;
  const SLOTS = GRID * GRID;              // 81 tiles
  const STORE_KEY = 'omnipad.tiles.v1';
  const THEME_KEY = 'omnipad.theme.v1';

  /* ---------- Default tiles ---------- */
  const DEFAULTS = [
    { name: 'Google',   url: 'google.com',        color: '#4285f4' },
    { name: 'YouTube',  url: 'youtube.com',       color: '#ff0000' },
    { name: 'GitHub',   url: 'github.com',        color: '#6e5494' },
    { name: 'Gmail',    url: 'mail.google.com',   color: '#ea4335' },
    { name: 'Maps',     url: 'maps.google.com',   color: '#34a853' },
    { name: 'Wikipedia',url: 'wikipedia.org',     color: '#636466' },
    { name: 'Reddit',   url: 'reddit.com',        color: '#ff4500' },
    { name: 'X',        url: 'x.com',             color: '#1d9bf0' },
    { name: 'ChatGPT',  url: 'chatgpt.com',       color: '#10a37f' },
    { name: 'Outlook',  url: 'outlook.com',       color: '#0072c6' },
    { name: 'Drive',    url: 'drive.google.com',  color: '#ffba00' },
    { name: 'Notion',   url: 'notion.so',         color: '#111111' },
  ];

  /* ---------- State ---------- */
  let tiles = load();          // sparse array of length SLOTS (null = empty)
  let editMode = false;
  let editingIndex = null;     // index being edited, or null for "add"
  let dragFrom = null;

  /* ---------- Elements ---------- */
  const $ = (sel) => document.querySelector(sel);
  const board      = $('#board');
  const statusEl   = $('#status');
  const searchEl   = $('#search');
  const editBtn    = $('#editModeBtn');
  const themeBtn   = $('#themeBtn');
  const menuBtn    = $('#menuBtn');
  const menuSheet  = $('#menuSheet');
  const editor     = $('#editor');
  const form       = $('#editorForm');
  const fName      = $('#fName');
  const fUrl       = $('#fUrl');
  const fColor     = $('#fColor');
  const preview    = $('#preview');
  const editorTitle= $('#editorTitle');
  const deleteBtn  = $('#deleteBtn');
  const cancelBtn  = $('#cancelBtn');
  const importFile = $('#importFile');

  /* ---------- Persistence ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return normalize(parsed);
      }
    } catch (_) { /* ignore corrupt data */ }
    return normalize(DEFAULTS);
  }

  function normalize(arr) {
    const out = new Array(SLOTS).fill(null);
    arr.slice(0, SLOTS).forEach((t, i) => {
      if (t && t.name && t.url) {
        out[i] = { name: String(t.name), url: String(t.url), color: t.color || '#ff7331' };
      }
    });
    return out;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(tiles)); }
    catch (_) { setStatus('Storage full — could not save', true); }
  }

  /* ---------- Helpers ---------- */
  function normalizeUrl(u) {
    u = (u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }

  function hostOf(u) {
    try { return new URL(normalizeUrl(u)).hostname.replace(/^www\./, ''); }
    catch (_) { return ''; }
  }

  function faviconUrl(u) {
    const host = hostOf(u);
    return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : '';
  }

  function initial(name) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  let statusTimer;
  function setStatus(msg, warn = false) {
    statusEl.textContent = msg;
    statusEl.style.color = warn ? 'var(--danger)' : '';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusEl.textContent = 'Ready'; statusEl.style.color = ''; }, 2600);
  }

  /* ---------- Rendering ---------- */
  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const frag = document.createDocumentFragment();

    tiles.forEach((tile, i) => {
      if (tile) {
        frag.appendChild(buildTile(tile, i, q));
      } else if (editMode) {
        frag.appendChild(buildEmpty(i));
      } else {
        // keep grid position stable: render a hidden placeholder
        const ph = document.createElement('div');
        ph.className = 'tile empty';
        ph.setAttribute('aria-hidden', 'true');
        frag.appendChild(ph);
      }
    });

    board.replaceChildren(frag);
  }

  function buildTile(tile, index, q) {
    const el = document.createElement('a');
    el.className = 'tile';
    el.href = normalizeUrl(tile.url);
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.dataset.index = index;
    el.style.animationDelay = `${Math.min(index * 8, 260)}ms`;
    el.title = `${tile.name} — ${hostOf(tile.url)}`;

    // dim non-matching tiles when searching
    if (q && !(`${tile.name} ${tile.url}`.toLowerCase().includes(q))) {
      el.style.opacity = '.18';
      el.style.filter = 'grayscale(.6)';
    }

    const badge = document.createElement('span');
    badge.className = 'tile-badge';
    badge.style.setProperty('--c', tile.color || '#ff7331');
    badge.textContent = initial(tile.name);

    // Try favicon; fall back to the letter badge if it fails/offline
    const fav = faviconUrl(tile.url);
    if (fav) {
      const img = new Image();
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => { badge.textContent = ''; badge.appendChild(img); };
      img.onerror = () => { /* keep letter badge */ };
      img.src = fav;
    }

    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = tile.name;

    const remove = document.createElement('button');
    remove.className = 'tile-remove';
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = 'Remove tile';
    remove.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      deleteTile(index);
    });

    el.append(badge, name, remove);

    // In edit mode, clicking opens the editor instead of the link
    el.addEventListener('click', (e) => {
      if (editMode) { e.preventDefault(); openEditor(index); }
    });

    // Drag & drop (enabled in edit mode)
    el.draggable = editMode;
    if (editMode) attachDrag(el, index);

    return el;
  }

  function buildEmpty(index) {
    const el = document.createElement('button');
    el.className = 'tile empty';
    el.type = 'button';
    el.dataset.index = index;
    el.title = 'Add tile here';
    el.innerHTML = '<span class="plus">＋</span>';
    el.addEventListener('click', () => openEditor(index));
    // allow dropping onto empty slots
    el.draggable = false;
    attachDropTarget(el, index);
    return el;
  }

  /* ---------- Drag & drop reorder ---------- */
  function attachDrag(el, index) {
    el.addEventListener('dragstart', (e) => {
      dragFrom = index;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(index)); } catch (_) {}
    });
    el.addEventListener('dragend', () => {
      dragFrom = null;
      el.classList.remove('dragging');
      board.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
    });
    attachDropTarget(el, index);
  }

  function attachDropTarget(el, index) {
    el.addEventListener('dragover', (e) => {
      if (dragFrom === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drop-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drop-target');
      if (dragFrom === null || dragFrom === index) return;
      moveTile(dragFrom, index);
    });
  }

  function moveTile(from, to) {
    // Move item to target slot; if occupied, swap. Empty slots just relocate.
    const moving = tiles[from];
    tiles[from] = tiles[to];
    tiles[to] = moving;
    save();
    render();
    setStatus('Tiles reordered');
  }

  /* ---------- CRUD ---------- */
  function firstEmpty() {
    const i = tiles.indexOf(null);
    return i === -1 ? null : i;
  }

  function openEditor(index) {
    editingIndex = index;
    const existing = (index !== null && index !== undefined) ? tiles[index] : null;
    editorTitle.textContent = existing ? 'Edit tile' : 'Add tile';
    fName.value  = existing ? existing.name : '';
    fUrl.value   = existing ? existing.url : '';
    fColor.value = existing ? (existing.color || '#ff7331') : '#ff7331';
    deleteBtn.hidden = !existing;
    updatePreview();
    if (typeof editor.showModal === 'function') editor.showModal();
    else editor.setAttribute('open', '');
    setTimeout(() => fName.focus(), 40);
  }

  function updatePreview() {
    const badge = preview.querySelector('.tile-badge');
    const name  = preview.querySelector('.tile-name');
    badge.style.setProperty('--c', fColor.value);
    badge.textContent = initial(fName.value) || '?';
    name.textContent = fName.value || 'Name';
  }

  function submitEditor(e) {
    e.preventDefault();
    const name = fName.value.trim();
    const url  = fUrl.value.trim();
    if (!name || !url) return;

    let idx = editingIndex;
    if (idx === null || idx === undefined || tiles[idx] === undefined) idx = firstEmpty();
    if (idx === null) { setStatus('Grid is full (81 tiles)', true); closeEditor(); return; }

    tiles[idx] = { name, url, color: fColor.value };
    save();
    render();
    setStatus(editingIndex !== null && tiles[editingIndex] ? 'Tile saved' : 'Tile added');
    closeEditor();
  }

  function deleteTile(index) {
    if (tiles[index] == null) return;
    const el = board.querySelector(`.tile[data-index="${index}"]`);
    const finish = () => { tiles[index] = null; save(); render(); setStatus('Tile removed'); };
    if (el) {
      el.style.transition = 'transform .18s var(--ease), opacity .18s var(--ease)';
      el.style.transform = 'scale(.6)';
      el.style.opacity = '0';
      setTimeout(finish, 160);
    } else finish();
  }

  function closeEditor() {
    editingIndex = null;
    if (typeof editor.close === 'function' && editor.open) editor.close();
    else editor.removeAttribute('open');
  }

  /* ---------- Edit mode / theme ---------- */
  function toggleEditMode(force) {
    editMode = force !== undefined ? force : !editMode;
    document.body.classList.toggle('edit-mode', editMode);
    editBtn.setAttribute('aria-pressed', String(editMode));
    render();
    setStatus(editMode ? 'Edit mode on — drag, add or remove' : 'Edit mode off');
  }

  function applyTheme(theme) {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f4f5f8' : '#0f1115');
  }

  function toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const next = isLight ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  }

  /* ---------- Import / export / reset ---------- */
  function exportTiles() {
    const data = JSON.stringify(tiles.filter(Boolean), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'omnipad-tiles.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('Exported tiles');
  }

  function importTiles(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error('bad');
        tiles = normalize(parsed);
        save(); render();
        setStatus('Imported tiles');
      } catch (_) { setStatus('Invalid file', true); }
    };
    reader.readAsText(file);
  }

  function resetTiles() {
    if (!confirm('Reset all tiles to defaults? This cannot be undone.')) return;
    tiles = normalize(DEFAULTS);
    save(); render();
    setStatus('Reset to defaults');
  }

  /* ---------- Menu ---------- */
  function toggleMenu(force) {
    const show = force !== undefined ? force : menuSheet.hidden;
    menuSheet.hidden = !show;
  }

  menuSheet.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    toggleMenu(false);
    switch (btn.dataset.action) {
      case 'add':    toggleEditMode(true); openEditor(firstEmpty()); break;
      case 'export': exportTiles(); break;
      case 'import': importFile.click(); break;
      case 'reset':  resetTiles(); break;
    }
  });

  document.addEventListener('click', (e) => {
    if (!menuSheet.hidden && !menuSheet.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
      toggleMenu(false);
    }
  });

  /* ---------- Events ---------- */
  editBtn.addEventListener('click', () => toggleEditMode());
  themeBtn.addEventListener('click', toggleTheme);
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  searchEl.addEventListener('input', render);

  form.addEventListener('submit', submitEditor);
  cancelBtn.addEventListener('click', closeEditor);
  deleteBtn.addEventListener('click', () => {
    if (editingIndex !== null) { deleteTile(editingIndex); closeEditor(); }
  });
  fName.addEventListener('input', updatePreview);
  fColor.addEventListener('input', updatePreview);
  editor.addEventListener('cancel', (e) => { e.preventDefault(); closeEditor(); });

  importFile.addEventListener('change', () => {
    if (importFile.files[0]) importTiles(importFile.files[0]);
    importFile.value = '';
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key.toLowerCase() === 'e') toggleEditMode();
    if (e.key.toLowerCase() === 'n') { toggleEditMode(true); openEditor(firstEmpty()); }
    if (e.key === '/') { e.preventDefault(); searchEl.focus(); }
    if (e.key === 'Escape') toggleMenu(false);
  });

  /* ---------- Service worker (offline) ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  /* ---------- Init ---------- */
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  render();
})();
