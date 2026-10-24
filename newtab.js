/* ============================================
   ATLAS - newtab.js
   ============================================ */

// --- STORAGE HELPERS ---
// local: device-specific data (API key, icon images)
// sync:  cross-device data (settings, links metadata)

function localGet(key) {
  return new Promise((resolve) => {
    try {
      if (typeof browser !== 'undefined' && browser.storage)
        browser.storage.local.get(key, (r) => resolve(r[key] ?? null));
      else if (typeof chrome !== 'undefined' && chrome.storage)
        chrome.storage.local.get(key, (r) => resolve(r[key] ?? null));
      else resolve(JSON.parse(localStorage.getItem('local_' + key)));
    } catch {
      resolve(null);
    }
  });
}

function localSet(key, value) {
  return new Promise((resolve) => {
    try {
      if (typeof browser !== 'undefined' && browser.storage)
        browser.storage.local.set({ [key]: value }, resolve);
      else if (typeof chrome !== 'undefined' && chrome.storage)
        chrome.storage.local.set({ [key]: value }, resolve);
      else {
        localStorage.setItem('local_' + key, JSON.stringify(value));
        resolve();
      }
    } catch {
      resolve();
    }
  });
}

function syncGet(key) {
  return new Promise((resolve) => {
    try {
      if (typeof browser !== 'undefined' && browser.storage)
        browser.storage.sync.get(key, (r) => resolve(r[key] ?? null));
      else if (typeof chrome !== 'undefined' && chrome.storage)
        chrome.storage.sync.get(key, (r) => resolve(r[key] ?? null));
      else resolve(JSON.parse(localStorage.getItem('sync_' + key)));
    } catch {
      resolve(null);
    }
  });
}

function syncSet(key, value) {
  return new Promise((resolve) => {
    try {
      if (typeof browser !== 'undefined' && browser.storage)
        browser.storage.sync.set({ [key]: value }, resolve);
      else if (typeof chrome !== 'undefined' && chrome.storage)
        chrome.storage.sync.set({ [key]: value }, resolve);
      else {
        localStorage.setItem('sync_' + key, JSON.stringify(value));
        resolve();
      }
    } catch {
      resolve();
    }
  });
}

// Convenience alias - keep local as default for backward compat
const storageGet = localGet;
const storageSet = localSet;

// --- UNSPLASH WALLPAPERS ---
let unsplashKey = null;
let currentPhoto = null;
const bgA = document.getElementById('bg-a');
const bgDimEl = document.getElementById('bg-dim');
const photoCredit = document.getElementById('photo-credit');

async function fetchAndShowWallpaper() {
  if (!unsplashKey) return;
  try {
    // Try queue first - instant, no API call needed
    let p = await dequeuePhoto();
    if (!p) p = await fetchPhotoFromAPI();
    if (!p) return;

    currentPhoto = p;
    applyPhotoToBackground(p);

    // Required by Unsplash guidelines
    fetch(`https://api.unsplash.com/photos/${p.id}/download?client_id=${unsplashKey}`).catch(() => {});

    // Silently preload next photo into browser cache so next tab is instant
    preloadNextPhoto();
  } catch (e) {
    console.warn('Unsplash fetch error:', e);
  }
}

async function dequeuePhoto() {
  // Check pre-downloaded image cache first - truly instant display
  const cache = await localGet('atlasImageCache');
  if (cache?.length) {
    const next = cache[0];
    // Remove by ID (not position) so concurrent background appends aren't lost
    const fresh = (await localGet('atlasImageCache')) || [];
    await localSet('atlasImageCache', fresh.filter((p) => p.id !== next.id));
    try { browser.runtime.sendMessage('checkCache'); } catch {}
    return next;
  }
  // Fall back to metadata queue - still needs image download
  const queue = await localGet('atlasPhotoQueue');
  if (!queue?.length) return null;
  const [next, ...rest] = queue;
  await localSet('atlasPhotoQueue', rest);
  return next;
}

async function fetchPhotoFromAPI() {
  const query = (layoutSettings.photoQuery ?? SETTINGS_DEFAULTS.photoQuery).trim();
  const pages = layoutSettings.photoPages ?? SETTINGS_DEFAULTS.photoPages;
  const page = Math.floor(Math.random() * pages) + 1;
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=30&page=${page}&client_id=${unsplashKey}`
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        await localSet('unsplashKey', null);
        showSetup('Your API key was rejected. Please check and re-enter it.');
      } else {
        console.warn(`Atlas: API error ${res.status}`);
      }
      return null;
    }
    const data = await res.json();
    if (!data.results?.length) return null;
    return data.results[Math.floor(Math.random() * data.results.length)];
  } catch (e) {
    console.warn('Atlas: fetchPhotoFromAPI failed:', e);
    return null;
  }
}

function preloadNextPhoto() {
  localGet('atlasPhotoQueue').then((queue) => {
    if (!queue?.length) return;
    const next = queue[0];
    const w = Math.max(screen.width, 1920);
    const quality = layoutSettings.photoQuality ?? SETTINGS_DEFAULTS.photoQuality;
    const img = new Image();
    img.src = `${next.raw}&w=${w}&fit=clip&q=${quality}&fm=jpg`;
  });
}

function applyPhotoToBackground(p) {
  if (!p) return;
  const w = Math.max(screen.width, 1920);
  const quality = layoutSettings.photoQuality ?? SETTINGS_DEFAULTS.photoQuality;
  // Use pre-downloaded data URL if available (instant), otherwise fetch from Unsplash
  const rawUrl = p.urls?.raw || p.raw;
  const url = p.dataUrl || `${rawUrl}&w=${w}&fit=clip&q=${quality}&fm=jpg`;
  bgA.style.backgroundImage = `url('${url}')`;
  bgA.classList.add('active');

  // Support both queue format (location is a string) and API format (location is an object)
  const locName =
    (typeof p.location === 'string' ? p.location : null) ||
    p.location?.name ||
    (p.location?.city && p.location?.country
      ? `${p.location.city}, ${p.location.country}`
      : null) ||
    p.location?.city ||
    p.location?.country ||
    null;
  const title = locName || p.description || p.alt_description || 'Untitled';

  const a = document.createElement('a');
  a.className = 'credit-link';
  const photoHtml = p.links?.html || p.html;
  a.href = `${photoHtml}?utm_source=atlas_new_tab&utm_medium=referral`;
  a.target = '_blank';

  const userName = p.user?.name || p.name;

  const loc = document.createElement('span');
  loc.className = 'credit-location';
  loc.textContent = `📍 ${title}`;

  const underline = document.createElement('span');
  underline.style.textDecoration = 'underline';
  underline.textContent = 'Unsplash';

  a.appendChild(loc);
  a.appendChild(document.createTextNode('\u00a0\u00a0Photo by ' + userName + ' on '));
  a.appendChild(underline);

  photoCredit.textContent = '';
  photoCredit.appendChild(a);
}

async function initWallpapers() {
  await fetchAndShowWallpaper();
}

// --- API KEY SETUP SCREEN ---
const setupScreen = document.getElementById('setup-screen');
const setupInput = document.getElementById('setup-key-input');
const setupBtn = document.getElementById('setup-save-btn');
const setupError = document.getElementById('setup-error');

function showSetup(errorMsg = '') {
  setupScreen.classList.remove('hidden');
  setupError.textContent = errorMsg;
  setTimeout(() => setupInput.focus(), 100);
}
function hideSetup() {
  setupScreen.classList.add('hidden');
}

setupBtn.addEventListener('click', async () => {
  const key = setupInput.value.trim();
  if (!key) {
    setupError.textContent = 'Please enter your Access Key.';
    return;
  }
  setupError.textContent = '';
  setupBtn.textContent = 'Connecting…';
  setupBtn.disabled = true;
  try {
    const res = await fetch(
      `https://api.unsplash.com/photos/random?count=1&orientation=landscape&client_id=${key}`
    );
    if (!res.ok) throw new Error('invalid');
    await storageSet('unsplashKey', key);
    unsplashKey = key;
    // Kick off background cache building now that we have a key
    try { browser.runtime.sendMessage('refillNow'); } catch {}
    hideSetup();
    initWallpapers();
  } catch {
    setupError.textContent = 'Key invalid or network error. Check and try again.';
  } finally {
    setupBtn.textContent = 'Connect';
    setupBtn.disabled = false;
  }
});
setupInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') setupBtn.click();
});

// --- STORAGE MIGRATION ---
// Migrate saved data from old 'orbit' keys to 'atlas' keys once
async function migrateStorage() {
  // Migrate old 'orbit' keys to 'atlas' keys
  const oldLinks = await localGet('orbitLinks');
  if (oldLinks) {
    await syncSet(
      'atlasLinks',
      oldLinks.map(({ icon: _icon, ...link }) => link)
    );
    const icons = {};
    oldLinks.forEach((link, i) => {
      if (link.icon) icons[i] = link.icon;
    });
    if (Object.keys(icons).length) await localSet('atlasIcons', icons);
    await localSet('orbitLinks', null);
  }
  const oldLayout = await localGet('orbitLayout');
  if (oldLayout) {
    await syncSet('atlasLayout', oldLayout);
    await localSet('orbitLayout', null);
  }
  // Migrate atlasLinks from local to sync if it ended up there
  const localLinks = await localGet('atlasLinks');
  if (localLinks) {
    await syncSet(
      'atlasLinks',
      localLinks.map(({ icon: _icon, ...link }) => link)
    );
    const icons = {};
    localLinks.forEach((link, i) => {
      if (link.icon) icons[i] = link.icon;
    });
    if (Object.keys(icons).length) await localSet('atlasIcons', icons);
    await localSet('atlasLinks', null);
  }
  const localLayout = await localGet('atlasLayout');
  if (localLayout) {
    await syncSet('atlasLayout', localLayout);
    await localSet('atlasLayout', null);
  }
}

async function boot() {
  await migrateStorage();
  const savedKey = await storageGet('unsplashKey');
  if (savedKey) {
    unsplashKey = savedKey;
    initWallpapers();
  } else showSetup();
}
boot();

// --- SEARCH ENGINES ---
const ALL_ENGINES = [
  { name: 'Google', url: 'https://www.google.com/search?q=' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  { name: 'Brave', url: 'https://search.brave.com/search?q=' },
  { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=' },
  { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' },
  { name: 'Startpage', url: 'https://www.startpage.com/search?q=' },
  { name: 'Kagi', url: 'https://kagi.com/search?q=' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
  { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search=' },
];

let searchEngineUrl = ALL_ENGINES[0].url;
const searchInputEl = document.getElementById('search-input');
const engineLabel = document.getElementById('engine-label');
const engineDropdown = document.getElementById('engine-dropdown');
const enginePill = document.getElementById('search-engine-pill');

function selectEngine(engine) {
  searchEngineUrl = engine.url;
  engineLabel.textContent = engine.name;
  engineDropdown.querySelectorAll('.engine-opt').forEach((opt) => {
    opt.classList.toggle('active', opt.dataset.name === engine.name);
  });
  engineDropdown.classList.add('hidden');
  searchInputEl.focus();
}

function rebuildEngineDropdown() {
  const enabled = layoutSettings.enabledEngines ?? SETTINGS_DEFAULTS.enabledEngines;
  const engines = ALL_ENGINES.filter((e) => enabled.includes(e.name));

  // Rebuild dropdown options
  engineDropdown.innerHTML = '';
  engines.forEach((engine) => {
    const div = document.createElement('div');
    div.className =
      'engine-opt px-4 py-2.5 text-xs tracking-wide cursor-pointer text-cream/60 hover:bg-cream/5 hover:text-cream transition-colors';
    div.dataset.url = engine.url;
    div.dataset.name = engine.name;
    div.textContent = engine.name;
    div.addEventListener('click', () => selectEngine(engine));
    engineDropdown.appendChild(div);
  });

  // If current engine was disabled, switch to first available
  const stillEnabled = engines.find((e) => e.url === searchEngineUrl);
  if (!stillEnabled && engines.length > 0) selectEngine(engines[0]);
  else if (engines.length > 0) {
    // Re-apply active class
    engineDropdown.querySelectorAll('.engine-opt').forEach((opt) => {
      opt.classList.toggle('active', opt.dataset.url === searchEngineUrl);
    });
  }

  // Hide pill entirely when only one engine is active
  enginePill.style.display = engines.length <= 1 ? 'none' : '';
}

function renderEngineCheckboxes() {
  const container = document.getElementById('engine-checkboxes');
  if (!container) return;
  const enabled = layoutSettings.enabledEngines ?? SETTINGS_DEFAULTS.enabledEngines;
  container.innerHTML = '';

  ALL_ENGINES.forEach((engine) => {
    const isEnabled = enabled.includes(engine.name);
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-3 py-1';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'text-sm tracking-wide text-cream/60';
    nameSpan.textContent = engine.name;

    const label = document.createElement('label');
    label.className = 'relative inline-flex items-center cursor-pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'sr-only peer engine-checkbox';
    checkbox.dataset.engine = engine.name;
    checkbox.checked = isEnabled;

    const pill = document.createElement('div');
    pill.className = [
      'w-9 h-5 bg-cream/20 rounded-full peer peer-checked:bg-gold/70 transition-colors',
      "after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white",
      'after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4',
    ].join(' ');

    label.appendChild(checkbox);
    label.appendChild(pill);
    row.appendChild(nameSpan);
    row.appendChild(label);
    container.appendChild(row);
  });

  container.querySelectorAll('.engine-checkbox').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const checked = Array.from(container.querySelectorAll('.engine-checkbox'))
        .filter((c) => c.checked)
        .map((c) => c.dataset.engine);
      // Always keep at least one enabled
      if (checked.length === 0) {
        cb.checked = true;
        return;
      }
      layoutSettings.enabledEngines = checked;
      rebuildEngineDropdown();
      await saveSettings();
    });
  });
}

enginePill.addEventListener('click', (e) => {
  e.stopPropagation();
  engineDropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => engineDropdown.classList.add('hidden'));

searchInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = searchInputEl.value.trim();
    if (!val) return;
    const looksLikeUrl = /^(https?:\/\/|www\.)|^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/|$)/.test(val);
    window.location.href = looksLikeUrl
      ? val.startsWith('http')
        ? val
        : 'https://' + val
      : searchEngineUrl + encodeURIComponent(val);
  }
});
setTimeout(() => searchInputEl.focus(), 100);

// --- LINKS ---
const MAX_LINKS = 32; // 8 cols × 4 rows max

const DEFAULT_LINKS = [
  { label: 'YouTube', url: 'https://youtube.com' },
  { label: 'Yahoo Mail', url: 'https://mail.yahoo.com' },
  { label: 'Amazon', url: 'https://amazon.com' },
  { label: 'Gmail', url: 'https://mail.google.com' },
  { label: 'Reddit', url: 'https://old.reddit.com' },
  { label: 'WhatsApp', url: 'https://web.whatsapp.com' },
  { label: 'AO3', url: 'https://archiveofourown.org' },
  { label: 'Messages', url: 'https://messages.google.com/web' },
  { label: 'Fanfiction', url: 'https://www.fanfiction.net' },
  { label: 'Calendar', url: 'https://calendar.google.com' },
];

function padLinks(links) {
  const arr = [...(links || [])].slice(0, MAX_LINKS);
  while (arr.length < MAX_LINKS) arr.push({ label: '', url: '', icon: null });
  return arr;
}

// Resize an image File to a square data URL for storage
function resizeImage(file, size, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const ratio = Math.max(size / img.width, size / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      callback(canvas.toDataURL('image/webp', 0.85));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderLink(link) {
  const size = layoutSettings.iconSize ?? SETTINGS_DEFAULTS.iconSize;
  const imgSize = size - 4;
  const showLbl = layoutSettings.showLabels ?? SETTINGS_DEFAULTS.showLabels;

  const a = document.createElement('a');
  a.className = 'flex flex-col items-center gap-2 cursor-pointer no-underline text-cream';
  a.href = link.url || '#';
  a.title = link.label || link.url || '';
  if (link.url)
    a.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = link.url;
    });

  const circle = document.createElement('div');
  circle.className = [
    'link-circle rounded-full bg-ink/40 backdrop-blur-md border border-cream/20',
    'flex items-center justify-center overflow-hidden relative',
    'transition-all duration-200 hover:scale-110 hover:-translate-y-0.5',
    'hover:border-gold/40 hover:shadow-xl',
  ].join(' ');
  circle.style.width = size + 'px';
  circle.style.height = size + 'px';

  const shine = document.createElement('div');
  shine.className =
    'absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-transparent pointer-events-none';
  circle.appendChild(shine);

  if (link.url || link.label) {
    if (link.icon) {
      // Custom uploaded icon
      const img = document.createElement('img');
      img.className = 'object-cover rounded-full relative z-10';
      img.src = link.icon;
      img.style.width = imgSize + 'px';
      img.style.height = imgSize + 'px';
      circle.appendChild(img);
    } else {
      // Letter initial
      const span = document.createElement('div');
      span.className =
        'font-display font-medium text-gold relative z-10 flex items-center justify-center leading-none';
      span.style.fontSize = imgSize + 'px';
      span.textContent = (link.label || link.url || '?').charAt(0).toUpperCase();
      circle.appendChild(span);
    }
  } else {
    const plus = document.createElement('div');
    plus.className = 'text-cream/20 relative z-10 text-lg leading-none';
    plus.textContent = '+';
    circle.appendChild(plus);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  }

  const label = document.createElement('span');
  label.className =
    'link-label tracking-widest uppercase text-cream/60 font-bold text-center max-w-20 overflow-hidden text-ellipsis whitespace-nowrap';
  label.style.fontSize = (layoutSettings.labelFontSize ?? SETTINGS_DEFAULTS.labelFontSize) + 'px';
  label.textContent = link.label || '';
  label.style.display = showLbl ? '' : 'none';

  a.appendChild(circle);
  a.appendChild(label);
  return a;
}

let currentLinks = [];

function renderGrid(links) {
  const cols = layoutSettings.gridCols ?? SETTINGS_DEFAULTS.gridCols;
  const rows = layoutSettings.gridRows ?? SETTINGS_DEFAULTS.gridRows;
  const count = cols * rows;
  const grid = document.getElementById('links-grid');
  grid.innerHTML = '';
  links.slice(0, count).forEach((link) => grid.appendChild(renderLink(link)));
}

async function loadLinks() {
  const savedLinks = await syncGet('atlasLinks');
  const savedIcons = (await localGet('atlasIcons')) || {};
  currentLinks = padLinks(savedLinks);
  // Merge local icons back into link objects
  currentLinks = currentLinks.map((link, i) => ({ ...link, icon: savedIcons[i] || null }));
  renderGrid(currentLinks);
}

async function saveLinks() {
  // Links metadata (no icon data) goes to sync for cross-device transfer
  await syncSet(
    'atlasLinks',
    currentLinks.map(({ icon: _icon, ...link }) => link)
  );
  // Icon images stay local — too large for sync storage
  const icons = {};
  currentLinks.forEach((link, i) => {
    if (link.icon) icons[i] = link.icon;
  });
  await localSet('atlasIcons', icons);
}
loadLinks();

// --- EDIT MODAL ---
const modal = document.getElementById('modal-overlay');
const modalList = document.getElementById('modal-list');

function openModal() {
  const cols = layoutSettings.gridCols ?? SETTINGS_DEFAULTS.gridCols;
  const rows = layoutSettings.gridRows ?? SETTINGS_DEFAULTS.gridRows;
  const count = cols * rows;

  modalList.innerHTML = '';
  currentLinks.slice(0, count).forEach((link, i) => {
    const row = document.createElement('div');
    row.className =
      'flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-cream/5 border border-transparent focus-within:border-cream/20 transition-colors';
    if (link.icon) row.dataset.icon = link.icon;

    // - Icon upload cell -
    const iconWrap = document.createElement('div');
    iconWrap.className = 'relative w-9 h-9 shrink-0 cursor-pointer group';
    iconWrap.title = 'Click to upload custom icon';

    const iconCircle = document.createElement('div');
    iconCircle.className =
      'w-9 h-9 rounded-full bg-ink/60 border border-cream/20 flex items-center justify-center overflow-hidden hover:border-gold/40 transition-colors';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'hidden';

    function refreshIconPreview(src) {
      iconCircle.innerHTML = '';
      if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.className = 'w-full h-full object-cover';
        iconCircle.appendChild(img);
        row.dataset.icon = src;
      } else {
        const letter = document.createElement('span');
        letter.className = 'font-display text-gold text-sm font-medium leading-none';
        letter.textContent = (link.label || '?').charAt(0).toUpperCase();
        iconCircle.appendChild(letter);
        delete row.dataset.icon;
      }
    }

    refreshIconPreview(link.icon || null);
    iconCircle.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) resizeImage(file, 128, (dataUrl) => refreshIconPreview(dataUrl));
    });

    // Clear button (visible on hover)
    const clearIcon = document.createElement('button');
    clearIcon.className =
      'absolute -top-1 -right-1 w-4 h-4 rounded-full bg-ink border border-cream/20 text-cream/40 text-xs leading-none items-center justify-center hidden group-hover:flex hover:text-cream hover:bg-red-900/50 transition-colors';
    clearIcon.textContent = '×';
    clearIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      refreshIconPreview(null);
    });

    iconWrap.appendChild(iconCircle);
    iconWrap.appendChild(fileInput);
    iconWrap.appendChild(clearIcon);

    const num = document.createElement('div');
    num.className = 'w-8 text-center text-xs text-gold font-display font-medium shrink-0';
    num.textContent = i + 1;

    const nameInput = document.createElement('input');
    nameInput.className =
      'flex-1 min-w-0 bg-cream/5 border border-cream/20 rounded-lg px-2.5 py-1.5 text-cream font-ui text-xs tracking-wide outline-none focus:border-gold/40 transition-colors placeholder:text-cream/25';
    nameInput.type = 'text';
    nameInput.placeholder = 'Label';
    nameInput.value = link.label || '';
    nameInput.dataset.field = 'label';

    const urlInput = document.createElement('input');
    urlInput.className =
      'flex-1 min-w-0 bg-cream/5 border border-cream/20 rounded-lg px-2.5 py-1.5 text-cream font-ui text-xs tracking-wide outline-none focus:border-gold/40 transition-colors placeholder:text-cream/25';
    urlInput.type = 'url';
    urlInput.placeholder = 'https://…';
    urlInput.value = link.url || '';
    urlInput.dataset.field = 'url';

    urlInput.addEventListener('blur', () => {
      const val = urlInput.value.trim();
      if (!val || /^https?:\/\//i.test(val)) return;
      urlInput.value = `https://${val}`;
    });

    const clearBtn = document.createElement('button');
    clearBtn.className =
      'bg-transparent border-0 text-cream/50 cursor-pointer text-xl leading-none p-1 hover:text-red-400 transition-colors shrink-0';
    clearBtn.title = 'Clear';
    clearBtn.textContent = '×';
    clearBtn.addEventListener('click', () => {
      nameInput.value = '';
      urlInput.value = '';
    });

    row.append(iconWrap, num, nameInput, urlInput, clearBtn);
    modalList.appendChild(row);
  });
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
}

document.getElementById('edit-toggle').addEventListener('click', openModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    closeModal();
    e.stopPropagation();
  }
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const cols = layoutSettings.gridCols ?? SETTINGS_DEFAULTS.gridCols;
  const rows = layoutSettings.gridRows ?? SETTINGS_DEFAULTS.gridRows;
  const count = cols * rows;

  const rows_ = Array.from(modalList.children);
  const edited = Array.from(rows_).map((row) => ({
    label: row.querySelector('[data-field="label"]').value.trim(),
    url: row.querySelector('[data-field="url"]').value.trim(),
    icon: row.dataset.icon || null,
  }));

  // Merge edited back into full currentLinks array
  for (let i = 0; i < count; i++) currentLinks[i] = edited[i] || { label: '', url: '' };

  await saveLinks();
  renderGrid(currentLinks);
  closeModal();
});

document.getElementById('change-key-btn').addEventListener('click', () => {
  closeModal();
  setupInput.value = unsplashKey || '';
  showSetup();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    hideSetup();
  }
});

// --- SETTINGS ---
const SETTINGS_DEFAULTS = {
  // Search engines
  enabledEngines: ['Google', 'DuckDuckGo', 'Bing', 'Brave'],
  // Visibility
  showSearch: true,
  showGrid: true,
  // Search bar
  searchWidth: 580,
  searchHeight: 52,
  searchFontSize: 20,
  searchX: 0,
  searchY: 0,
  // Icon grid
  gridCols: 5,
  gridRows: 2,
  iconSize: 80,
  iconGapRow: 20,
  iconGapCol: 28,
  showLabels: true,
  labelFontSize: 11,
  gridX: 0,
  gridY: 0,
  // Global
  blockGap: 40,
  // Wallpaper
  bgDim: 0,
  photoQuery: 'landscape wallpaper',
  photoQuality: 85,
  photoPages: 20,
};

// Sliders only (text inputs and toggles handled separately)
const SLIDER_MAP = [
  ['s-search-width', 'v-search-width', 'searchWidth'],
  ['s-search-height', 'v-search-height', 'searchHeight'],
  ['s-search-font', 'v-search-font', 'searchFontSize'],
  ['s-search-x', 'v-search-x', 'searchX'],
  ['s-search-y', 'v-search-y', 'searchY'],
  ['s-grid-cols', 'v-grid-cols', 'gridCols'],
  ['s-grid-rows', 'v-grid-rows', 'gridRows'],
  ['s-icon-size', 'v-icon-size', 'iconSize'],
  ['s-icon-gap-row', 'v-icon-gap-row', 'iconGapRow'],
  ['s-icon-gap-col', 'v-icon-gap-col', 'iconGapCol'],
  ['s-label-font', 'v-label-font', 'labelFontSize'],
  ['s-grid-y', 'v-grid-y', 'gridY'],
  ['s-block-gap', 'v-block-gap', 'blockGap'],
  ['s-bg-dim', 'v-bg-dim', 'bgDim'],
  ['s-photo-quality', 'v-photo-quality', 'photoQuality'],
  ['s-photo-pages', 'v-photo-pages', 'photoPages'],
];

let layoutSettings = { ...SETTINGS_DEFAULTS };

function applySettings(s) {
  const searchWrap = document.getElementById('search-wrap');
  const searchBox = document.getElementById('search-box');
  const linksWrap = document.getElementById('links-wrap');
  const grid = document.getElementById('links-grid');

  // Section visibility
  if (searchWrap) searchWrap.style.display = s.showSearch ? '' : 'none';
  if (linksWrap) linksWrap.style.display = s.showGrid ? '' : 'none';

  // Search bar
  if (searchWrap) {
    searchWrap.style.maxWidth = s.searchWidth + 'px';
    searchWrap.style.marginBottom = s.blockGap + 'px';
    searchWrap.style.transform = `translate(${s.searchX}px, ${s.searchY}px)`;
  }
  if (searchBox) searchBox.style.height = s.searchHeight + 'px';
  if (searchInputEl) searchInputEl.style.fontSize = s.searchFontSize + 'px';

  // Icon grid
  if (linksWrap) linksWrap.style.transform = `translate(${s.gridX}px, ${s.gridY}px)`;
  if (grid) {
    grid.style.gridTemplateColumns = `repeat(${s.gridCols}, ${s.iconSize + 10}px)`;
    grid.style.gap = `${s.iconGapRow}px ${s.iconGapCol}px`;
  }

  // Update rendered icon sizes + label visibility
  const imgSize = s.iconSize - 4;
  document.querySelectorAll('.link-circle').forEach((c) => {
    c.style.width = s.iconSize + 'px';
    c.style.height = s.iconSize + 'px';
  });
  document.querySelectorAll('.link-circle img, .link-circle .font-display').forEach((el) => {
    el.style.width = el.style.height = el.style.fontSize = imgSize + 'px';
  });
  document.querySelectorAll('.link-label').forEach((el) => {
    el.style.fontSize = s.labelFontSize + 'px';
    el.style.display = s.showLabels ? '' : 'none';
  });

  // Background dim
  if (bgDimEl) bgDimEl.style.opacity = (s.bgDim / 100).toFixed(2);
}

function syncSlidersToSettings(s) {
  SLIDER_MAP.forEach(([sliderId, valueId, key]) => {
    const slider = document.getElementById(sliderId);
    const lbl = document.getElementById(valueId);
    if (slider) slider.value = s[key];
    if (lbl) lbl.textContent = s[key];
  });
  // Sync text input
  const queryInput = document.getElementById('s-photo-query');
  if (queryInput) queryInput.value = s.photoQuery ?? SETTINGS_DEFAULTS.photoQuery;
  // Sync toggle
  const showLabels = s.showLabels ?? SETTINGS_DEFAULTS.showLabels;
  updateLabelsSegment(showLabels);
  syncLabelSizeVisibility(showLabels);
}

async function loadSettings() {
  const saved = await syncGet('atlasLayout');
  if (saved) layoutSettings = { ...SETTINGS_DEFAULTS, ...saved };
  applySettings(layoutSettings);
  syncSlidersToSettings(layoutSettings);
  syncSectionToggles(layoutSettings);
  renderEngineCheckboxes();
  rebuildEngineDropdown();
}

async function saveSettings() {
  await syncSet('atlasLayout', layoutSettings);
}

// Wire sliders
SLIDER_MAP.forEach(([sliderId, valueId, key]) => {
  const slider = document.getElementById(sliderId);
  const lbl = document.getElementById(valueId);
  if (!slider) return;
  slider.addEventListener('input', () => {
    layoutSettings[key] = Number(slider.value);
    if (lbl) lbl.textContent = slider.value;
    applySettings(layoutSettings);
    // Re-render grid if cols or rows changed
    if (key === 'gridCols' || key === 'gridRows') renderGrid(currentLinks);
  });
  slider.addEventListener('change', saveSettings);
});

// Photo query text input
const photoQueryInput = document.getElementById('s-photo-query');
if (photoQueryInput) {
  photoQueryInput.addEventListener('change', async () => {
    layoutSettings.photoQuery = photoQueryInput.value.trim() || SETTINGS_DEFAULTS.photoQuery;
    await saveSettings();
    // Old cached photos no longer match the query - rebuild the cache
    try { browser.runtime.sendMessage('invalidateCache'); } catch {}
  });
}

// Section visibility toggles
function syncSectionToggles(s) {
  const showSearch = s.showSearch ?? SETTINGS_DEFAULTS.showSearch;
  const showGrid = s.showGrid ?? SETTINGS_DEFAULTS.showGrid;

  const searchToggle = document.getElementById('s-show-search');
  const gridToggle = document.getElementById('s-show-grid');
  if (searchToggle) searchToggle.checked = showSearch;
  if (gridToggle) gridToggle.checked = showGrid;

  const searchContent = document.getElementById('search-settings-content');
  const searchMsg = document.getElementById('search-disabled-msg');
  searchContent?.classList.toggle('hidden', !showSearch);
  searchMsg?.classList.toggle('hidden', showSearch);

  const gridContent = document.getElementById('grid-settings-content');
  const gridMsg = document.getElementById('grid-disabled-msg');
  gridContent?.classList.toggle('hidden', !showGrid);
  gridMsg?.classList.toggle('hidden', showGrid);
}

const showSearchToggle = document.getElementById('s-show-search');
if (showSearchToggle) {
  showSearchToggle.addEventListener('change', async () => {
    layoutSettings.showSearch = showSearchToggle.checked;
    applySettings(layoutSettings);
    syncSectionToggles(layoutSettings);
    await saveSettings();
  });
}

const showGridToggle = document.getElementById('s-show-grid');
if (showGridToggle) {
  showGridToggle.addEventListener('change', async () => {
    layoutSettings.showGrid = showGridToggle.checked;
    applySettings(layoutSettings);
    syncSectionToggles(layoutSettings);
    await saveSettings();
  });
}
const labelSizeRow = document.getElementById('label-size-row');
const labelsOnDiv = document.getElementById('s-labels-on');
const labelsOffDiv = document.getElementById('s-labels-off');
const labelsSlider = document.getElementById('s-labels-slider');
const labelsToggleBox = document.getElementById('s-labels-toggle');

function updateLabelsSegment(visible) {
  if (!labelsOnDiv || !labelsOffDiv || !labelsSlider) return;
  labelsSlider.style.left = visible ? '0%' : '50%';
  labelsOnDiv.className = `relative z-10 flex-1 py-1.5 text-center transition-colors duration-200 ${visible ? 'text-ink font-medium' : 'text-cream/40'}`;
  labelsOffDiv.className = `relative z-10 flex-1 py-1.5 text-center transition-colors duration-200 ${visible ? 'text-cream/40' : 'text-ink font-medium'}`;
}

function syncLabelSizeVisibility(visible) {
  if (!labelSizeRow) return;
  labelSizeRow.style.opacity = visible ? '' : '0.25';
  labelSizeRow.style.pointerEvents = visible ? '' : 'none';
  labelSizeRow.style.transition = 'opacity 0.2s';
}

labelsToggleBox?.addEventListener('click', async () => {
  layoutSettings.showLabels = !layoutSettings.showLabels;
  updateLabelsSegment(layoutSettings.showLabels);
  syncLabelSizeVisibility(layoutSettings.showLabels);
  applySettings(layoutSettings);
  await saveSettings();
});

// Refresh photo button
document.getElementById('refresh-photo-btn')?.addEventListener('click', async () => {
  bgA.classList.remove('active');
  bgA.style.backgroundImage = '';
  // Trigger background to refill cache while we load the next photo
  try { browser.runtime.sendMessage('refillNow'); } catch {}
  await new Promise((r) => setTimeout(r, 300));
  await fetchAndShowWallpaper();
});

// Section reset buttons
document.querySelectorAll('.settings-reset[data-reset]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const keyMap = {
      engines: ['enabledEngines'],
      search: ['searchWidth', 'searchHeight', 'searchFontSize', 'searchX', 'searchY'],
      grid: [
        'gridCols',
        'gridRows',
        'iconSize',
        'iconGapRow',
        'iconGapCol',
        'showLabels',
        'labelFontSize',
        'gridX',
        'gridY',
      ],
      global: ['blockGap'],
      wallpaper: ['bgDim', 'photoQuery', 'photoQuality', 'photoPages'],
    };
    (keyMap[btn.dataset.reset] || []).forEach((k) => {
      layoutSettings[k] = SETTINGS_DEFAULTS[k];
    });
    applySettings(layoutSettings);
    syncSlidersToSettings(layoutSettings);
    if (btn.dataset.reset === 'engines') {
      renderEngineCheckboxes();
      rebuildEngineDropdown();
    }
    if (btn.dataset.reset === 'grid') renderGrid(currentLinks);
    if (btn.dataset.reset === 'search' || btn.dataset.reset === 'grid') {
      syncSectionToggles(layoutSettings);
    }
    await saveSettings();
  });
});

// Reset all
document.getElementById('reset-all-btn').addEventListener('click', async () => {
  layoutSettings = { ...SETTINGS_DEFAULTS };
  applySettings(layoutSettings);
  syncSlidersToSettings(layoutSettings);
  syncSectionToggles(layoutSettings);
  renderEngineCheckboxes();
  rebuildEngineDropdown();
  renderGrid(currentLinks);
  await saveSettings();
});

// --- EXPORT / IMPORT ---
async function exportData() {
  const data = {
    version: '1.2.0',
    exportedAt: new Date().toISOString(),
    layout: layoutSettings,
    links: currentLinks, // includes icon data
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `atlas-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.layout) {
      layoutSettings = { ...SETTINGS_DEFAULTS, ...data.layout };
      await syncSet('atlasLayout', layoutSettings);
      applySettings(layoutSettings);
      syncSlidersToSettings(layoutSettings);
      syncSectionToggles(layoutSettings);
    }
    if (data.links) {
      currentLinks = padLinks(data.links);
      await saveLinks();
      renderGrid(currentLinks);
    }
    // Flash button to confirm
    const btn = document.getElementById('import-btn');
    if (btn) {
      btn.textContent = 'Imported!';
      setTimeout(() => (btn.textContent = 'Import'), 2000);
    }
  } catch (e) {
    console.warn('Import failed:', e);
    const btn = document.getElementById('import-btn');
    if (btn) {
      btn.textContent = 'Failed!';
      setTimeout(() => (btn.textContent = 'Import'), 2000);
    }
  }
}

document.getElementById('export-btn')?.addEventListener('click', exportData);

const importFileInput = document.getElementById('import-file');
document.getElementById('import-btn')?.addEventListener('click', () => importFileInput?.click());
importFileInput?.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (file) {
    importData(file);
    importFileInput.value = '';
  }
});

// --- FLYOUT ---
const flyout = document.getElementById('settings-flyout');

function updateSliderRanges() {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const items = [
    { id: 'search-wrap', ySlider: 's-search-y', xSlider: 's-search-x' },
    { id: 'links-wrap', ySlider: 's-grid-y', xSlider: 's-grid-x' },
  ];
  items.forEach(({ id, ySlider, xSlider }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = el.style.transform;
    el.style.transform = 'none';
    const rect = el.getBoundingClientRect();
    el.style.transform = saved;
    const ys = document.getElementById(ySlider);
    const xs = document.getElementById(xSlider);
    if (ys) {
      ys.min = -Math.floor(rect.top);
      ys.max = Math.floor(vh - rect.bottom);
    }
    if (xs) {
      xs.min = -Math.floor(rect.left);
      xs.max = Math.floor(vw - rect.right);
    }
  });
}

document.getElementById('settings-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  flyout.classList.toggle('open');
  if (flyout.classList.contains('open')) updateSliderRanges();
});
document.getElementById('settings-close').addEventListener('click', () => {
  flyout.classList.remove('open');
});
document.addEventListener('click', (e) => {
  const modalOpen = modal && !modal.classList.contains('hidden');
  if (flyout.classList.contains('open') && !flyout.contains(e.target) && !modalOpen) {
    flyout.classList.remove('open');
  }
});

loadSettings();
