// ============================================================
// Concerto · Setlists & Tour Info
// - Loads tours from /data/tours.json
// - Renders library + search dropdown
// - On tour select: renders Tour Info + Setlist accordion
// - Auto-generates Spotify + Apple Music links via Netlify functions
//
// FIXES:
// 1) Use BuildFire navigation.openWindow(..., "_system") for ONE-TAP external opens
// 2) Do NOT use touchend/pointer handlers (they cause long-press weirdness in iOS WebViews)
// 3) Do NOT override button onclick with stopPropagation (use capture listener instead)
// ============================================================

const el = (id) => document.getElementById(id);

const state = {
  tours: [],
  selectedTour: null,
};

const CACHE_KEY = "concerto_setlist_cache_v1";
// cache format: { "<artist>::<title>": { spotifyUrl, appleUrl, fetchedAt } }
const cache = loadCache();

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function cacheKey(artist, title) {
  return `${(artist || "").trim().toLowerCase()}::${(title || "")
    .trim()
    .toLowerCase()}`;
}

// ------------------------------
// Open external (BuildFire/Cordova/iOS WebView safe)
// Use BuildFire first (this is what worked in your WYSIWYG snippet)
// ------------------------------
function openExternal(url, target = "_system") {
  if (!url) return;

  // BuildFire: most reliable one-tap
  try {
    if (window.buildfire?.navigation?.openWindow) {
      window.buildfire.navigation.openWindow(url, target);
      return;
    }
  } catch {}

  // Cordova InAppBrowser (if present)
  try {
    if (window.cordova?.InAppBrowser?.open) {
      window.cordova.InAppBrowser.open(url, target);
      return;
    }
  } catch {}

  // Plain web fallback
  const w = window.open(url, "_blank");
  if (!w) window.location.href = url;
}

// One-tap binder (CLICK ONLY; no touchend/pointerup)
function bindOneTapOpen(node, url, target = "_system") {
  if (!node) return;

  if (!url) {
    node.setAttribute("aria-disabled", "true");
    node.disabled = true;
    node.onclick = null;
    return;
  }

  node.removeAttribute("aria-disabled");
  node.disabled = false;

  node.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openExternal(url, target);
  };
}

// Apple Music: prefer opening the Music app (itms-apps) but keep it simple.
// In BuildFire, even https://music.apple.com opens fine with "_system".
function normalizeAppleUrl(url) {
  if (!url) return null;
  return String(url).replace("geo.music.apple.com", "music.apple.com");
}
function appleDeepLink(url) {
  const http = normalizeAppleUrl(url);
  if (!http) return null;
  const itms = http.replace(/^https?:\/\//, "itms-apps://");
  return { itms, http };
}
function bindOneTapApple(node, appleUrl) {
  if (!node) return;

  const links = appleDeepLink(appleUrl);
  if (!links) {
    node.setAttribute("aria-disabled", "true");
    node.disabled = true;
    node.onclick = null;
    return;
  }

  node.removeAttribute("aria-disabled");
  node.disabled = false;

  // Try Music app first; if it doesn't open, user still has a web URL option later.
  node.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Attempt app
    openExternal(links.itms, "_system");

    // Fallback to web after a short delay (safe in most shells)
    setTimeout(() => {
      openExternal(links.http, "_system");
    }, 450);
  };
}

// ------------------------------
// Data
// ------------------------------
async function loadTours() {
  const res = await fetch("./data/tours.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load tours.json");
  return res.json();
}

// ------------------------------
// Library rendering
// ------------------------------
function renderLibrary(list) {
  const wrap = el("toursBrowseList");
  wrap.innerHTML = "";

  list.forEach((t) => {
    const item = document.createElement("div");
    item.className = "browse-item";
    item.innerHTML = `
      <div class="browse-item-name">${escapeHtml(t.tourName)}</div>
      <div class="browse-item-meta">${escapeHtml(t.artist)}</div>
    `;
    item.addEventListener("click", () => selectTour(t.tourId));
    wrap.appendChild(item);
  });
}

// ------------------------------
// Search dropdown
// ------------------------------
function initSearch() {
  const input = el("tourSearch");
  const resultsEl = el("searchResults");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      resultsEl.classList.remove("visible");
      resultsEl.innerHTML = "";
      renderLibrary(state.tours);
      return;
    }

    const hits = state.tours.filter((t) => {
      return (
        t.tourName.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q)
      );
    });

    renderLibrary(hits);

    resultsEl.innerHTML = "";
    hits.slice(0, 8).forEach((t) => {
      const r = document.createElement("div");
      r.className = "search-result-item";
      r.textContent = `${t.tourName} — ${t.artist}`;
      r.addEventListener("click", () => {
        input.value = "";
        resultsEl.classList.remove("visible");
        resultsEl.innerHTML = "";
        selectTour(t.tourId);
      });
      resultsEl.appendChild(r);
    });

    if (hits.length) resultsEl.classList.add("visible");
    else resultsEl.classList.remove("visible");
  });

  document.addEventListener("click", (e) => {
    if (!resultsEl.contains(e.target) && e.target !== input) {
      resultsEl.classList.remove("visible");
    }
  });
}

// ------------------------------
// Tour selection + detail view
// ------------------------------
function setDetailMode(isDetail) {
  const panel = el("infoPanel");
  const empty = panel.querySelector(".info-empty");
  const content = panel.querySelector(".info-content");

  if (isDetail) {
    panel.classList.remove("info-panel--empty");
    empty.style.display = "none";
    content.hidden = false;
  } else {
    panel.classList.add("info-panel--empty");
    empty.style.display = "block";
    content.hidden = true;
  }
}

function selectTour(tourId) {
  const tour = state.tours.find((t) => t.tourId === tourId);
  if (!tour) return;

  state.selectedTour = tour;

  el("tourName").textContent = tour.tourName;
  el("tourArtist").textContent = tour.artist;
  el("tourMeta").textContent = tour.notes || "";

  renderTourInfo(tour);
  renderSetlist(tour);

  setDetailMode(true);

  el("backToLibrary").onclick = () => {
    state.selectedTour = null;
    setDetailMode(false);
    renderLibrary(state.tours);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Tour info: Website row is a pill button like Start Time and opens external browser one-tap
function renderTourInfo(t) {
  const grid = el("tourInfoGrid");

  grid.innerHTML = `
    <div class="tour-info-row">
      <div class="tour-info-label">Start Time (Local)</div>
      <div class="tour-info-value">${escapeHtml(t.startTimeLocal || "—")}</div>
    </div>

    ${
      t.tourWebsite
        ? `
      <button class="tour-info-row tour-info-row--button" type="button" data-role="tour-website">
        <div class="tour-info-label">Tour Website</div>
        <div class="tour-info-value">Open</div>
      </button>
      `
        : ""
    }
  `;

  const btn = grid.querySelector('[data-role="tour-website"]');
  if (btn && t.tourWebsite) bindOneTapOpen(btn, t.tourWebsite, "_system");
}

// ------------------------------
// Setlist rendering + link generation
// ------------------------------
function renderSetlist(tour) {
  const listEl = el("setlistList");
  listEl.innerHTML = "";

  const setlist = Array.isArray(tour.setlist) ? tour.setlist : [];

  if (!setlist.length) {
    listEl.innerHTML = `<div style="padding:14px 16px; color: var(--muted); font-size: var(--fs-14);">No setlist yet.</div>`;
    return;
  }

  setlist.forEach((song, idx) => {
    const title = typeof song === "string" ? song : song.title;
    const artist = song.artist || tour.artist;

    const row = document.createElement("div");
    row.className = "song-row";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "song-row-header";
    header.innerHTML = `
      <div class="song-index">${idx + 1}</div>
      <div class="song-title">${escapeHtml(title)}</div>
      <div class="song-meta">${escapeHtml(artist)}</div>
      <div class="song-chevron">+</div>
    `;

    const dropdown = document.createElement("div");
    dropdown.className = "song-dropdown";
    dropdown.innerHTML = `
      <div class="song-links">
        <button class="song-link-btn" data-role="apple" type="button" aria-disabled="true">
          Listen on Apple Music
        </button>
        <button class="song-link-btn" data-role="spotify" type="button" aria-disabled="true">
          Listen on Spotify
        </button>
      </div>
    `;

    header.addEventListener("click", async () => {
      const open = dropdown.classList.toggle("open");
      header.querySelector(".song-chevron").textContent = open ? "–" : "+";
      if (open) {
        await hydrateSongLinks({ title, artist, dropdown });
      }
    });

    row.appendChild(header);
    row.appendChild(dropdown);
    listEl.appendChild(row);
  });
}

async function hydrateSongLinks({ title, artist, dropdown }) {
  const appleBtn = dropdown.querySelector('[data-role="apple"]');
  const spotifyBtn = dropdown.querySelector('[data-role="spotify"]');

  // Prevent clicks on link buttons from toggling accordion
  // IMPORTANT: capture=true so it doesn't overwrite our onclick binders.
  dropdown.querySelectorAll("button.song-link-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => e.stopPropagation(), true);
  });

  const key = cacheKey(artist, title);
  const cached = cache[key];

  if (cached?.spotifyUrl || cached?.appleUrl) {
    applyLinks({ cached, appleBtn, spotifyBtn });
    return;
  }

  try {
    const songlink = await apiSonglinkBySearch({ artist, title });

    const payload = {
      spotifyUrl: songlink?.spotifyUrl || null,
      appleUrl: songlink?.appleUrl || null,
      fetchedAt: Date.now(),
    };

    cache[key] = payload;
    saveCache();

    applyLinks({ cached: payload, appleBtn, spotifyBtn });
  } catch (err) {
    console.error(err);
  }
}

function applyLinks({ cached, appleBtn, spotifyBtn }) {
  // Use BuildFire external open for both (one tap)
  bindOneTapOpen(spotifyBtn, cached.spotifyUrl, "_system");
  bindOneTapApple(appleBtn, cached.appleUrl);
}

// ------------------------------
// Netlify function API calls
// ------------------------------
async function apiSonglinkBySearch({ artist, title }) {
  const url = `/.netlify/functions/songlink?artist=${encodeURIComponent(
    artist
  )}&title=${encodeURIComponent(title)}`;
  const res = await fetch(url);
  return res.json();
}

// ------------------------------
// Utilities
// ------------------------------
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------------------------
// Boot
// ------------------------------
(async function init() {
  try {
    state.tours = await loadTours();
    renderLibrary(state.tours);
    initSearch();
    setDetailMode(false);
  } catch (e) {
    console.error(e);
    const panel = el("infoPanel");
    panel.innerHTML = `<div style="max-width:680px;margin:16px auto;padding:16px;background:#fff;border:1px solid #E2E7F0;border-radius:16px;">
      <div style="font-weight:800;color:#121E36;">Couldn’t load Setlists & Tour Info</div>
      <div style="margin-top:6px;color:#5E6B86;">Check that <code>data/tours.json</code> exists and is valid JSON.</div>
    </div>`;
  }
})();
