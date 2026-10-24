// --- ATLAS BACKGROUND SCRIPT ---
// Pre-downloads images at 2560px (high quality, manageable size)
// so new tabs can display instantly from local cache.

const CACHE_SIZE = 20;
const LOW_WATER_MARK = 5;
const CACHE_WIDTH = 2560;
const CACHE_QUALITY = 90;

let isRefilling = false; // prevents concurrent refills clobbering each other

browser.runtime.onInstalled.addListener(() => refillAll());
browser.runtime.onStartup.addListener(() => refillAll());
browser.alarms.create('refillAll', { delayInMinutes: 0, periodInMinutes: 60 });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refillAll') refillAll();
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg === 'checkCache') checkAndTopUp();
  if (msg === 'refillNow') refillAll();
  if (msg === 'invalidateCache') invalidateAndRefill();
});

async function local(key) {
  return new Promise((resolve) => {
    browser.storage.local.get(key, (r) => resolve(r[key] ?? null));
  });
}
async function localSet(key, val) {
  return new Promise((resolve) => browser.storage.local.set({ [key]: val }, resolve));
}
async function syncGet(key) {
  return new Promise((resolve) => {
    browser.storage.sync.get(key, (r) => resolve(r[key] ?? null));
  });
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function downloadImage(rawUrl) {
  const url = `${rawUrl}&w=${CACHE_WIDTH}&fit=clip&q=${CACHE_QUALITY}&fm=jpg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  return blobToDataUrl(await res.blob());
}

function toSlim(p) {
  return {
    id: p.id,
    raw: p.urls.raw,
    html: p.links.html,
    name: p.user.name,
    location:
      p.location?.name ||
      (p.location?.city && p.location?.country
        ? `${p.location.city}, ${p.location.country}`
        : null) ||
      p.location?.city ||
      p.location?.country ||
      null,
    description: p.description || p.alt_description || null,
  };
}

// Download images one at a time, appending to cache after EACH download.
// Re-reads the cache before each write so newtab consumption is never lost.
async function downloadAndAppend(photos) {
  let added = 0;
  for (const p of photos) {
    let entry = p;
    try {
      const dataUrl = await downloadImage(p.raw);
      entry = { ...p, dataUrl };
    } catch (e) {
      console.warn(`Atlas: failed to download ${p.id}:`, e);
    }
    // Merge with current cache state (newtab may have consumed some meanwhile)
    const cache = (await local('atlasImageCache')) || [];
    if (cache.length >= CACHE_SIZE) break; // someone else filled it
    // Avoid duplicates
    if (!cache.some((c) => c.id === entry.id)) {
      cache.push(entry);
      await localSet('atlasImageCache', cache);
      added++;
    }
  }
  return added;
}

async function checkAndTopUp() {
  const cache = (await local('atlasImageCache')) || [];
  if (cache.length > LOW_WATER_MARK) return;
  await refillAll();
}

async function invalidateAndRefill() {
  await localSet('atlasImageCache', []);
  await localSet('atlasPhotoQueue', []);
  await refillAll();
}

async function refillAll() {
  if (isRefilling) return;
  isRefilling = true;
  try {
    const key = await local('unsplashKey');
    if (!key) return;

    let cache = (await local('atlasImageCache')) || [];
    let needed = CACHE_SIZE - cache.length;
    if (needed <= 0) return;

    // First consume any leftover metadata queue
    const queue = (await local('atlasPhotoQueue')) || [];
    if (queue.length) {
      const fromQueue = queue.splice(0, needed);
      await localSet('atlasPhotoQueue', queue);
      const added = await downloadAndAppend(fromQueue);
      console.log(`Atlas: added ${added} from queue`);
      cache = (await local('atlasImageCache')) || [];
      needed = CACHE_SIZE - cache.length;
      if (needed <= 0) return;
    }

    // Still short - fetch a fresh batch from the API
    const settings = (await syncGet('atlasLayout')) || {};
    const query = settings.photoQuery || 'landscape wallpaper';
    const pages = settings.photoPages || 20;
    const page = Math.floor(Math.random() * pages) + 1;

    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=50&page=${page}&client_id=${key}`
    );
    if (!res.ok) {
      console.warn(`Atlas: API error ${res.status}`);
      return;
    }
    const data = await res.json();
    if (!data.results?.length) {
      console.warn('Atlas: API returned no results for query:', query);
      return;
    }

    const slim = data.results.map(toSlim);
    const toCache = slim.slice(0, needed);
    const toQueue = slim.slice(needed);

    await localSet('atlasPhotoQueue', toQueue);
    const added = await downloadAndAppend(toCache);

    const finalCache = (await local('atlasImageCache')) || [];
    console.log(`Atlas: cache ${finalCache.length}/${CACHE_SIZE} (+${added}), queue ${toQueue.length}`);
  } catch (e) {
    console.warn('Atlas background refill failed:', e);
  } finally {
    isRefilling = false;
  }
}
