// ============================================================
// Concerto · Setlists
// - Loads tours from /data/tours.json
// - Renders library + search dropdown
// - On tour select: renders Setlist accordion only
// - Each tour is its own mini-page via hash routing
// - Auto-generates Apple Music links via Netlify functions
// ============================================================

const el = (id) => document.getElementById(id);

const state = {
  tours: [],
  selectedTour: null,
};

const CACHE_KEY = "concerto_setlist_cache_v1";
const cache = loadCache();

let libraryScrollY = 0;

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

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

function normalizeAppleUrl(url) {
  if (!url) return null;
  return String(url).replace("geo.music.apple.com", "music.apple.com");
}

// ------------------------------
// Mini-page routing helpers
// ------------------------------
function getTourSlug(t) {
  return t?.tourId || "";
}

// Returns the matched tour based on Hash, Path, or Query Param
function getTourFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const incomingQuery = params.get("tour");

  const hashPath = window.location.hash.replace(/^#\/?/, '').toLowerCase(); 
  const urlPath = window.location.pathname.replace(/^\/|\/$/g, '').toLowerCase(); 

  // 1. Fallback for old ?tour= links
  if (incomingQuery) {
    return state.tours.find((t) => t.tourId.toLowerCase() === incomingQuery.toLowerCase());
  }
  
  // 2. Magic Link check using clean paths
  const searchString = (hashPath || urlPath).replace(/[^a-z0-9]/g, '');
  if (searchString && searchString !== 'indexhtml') {
    return state.tours.find((t) => {
      const cleanId = t.tourId.replace(/[^a-z0-9]/g, '');
      const cleanName = t.tourName.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanId === searchString || cleanName === searchString;
    });
  }
  return null;
}

// Update the URL to the clean hash format
function setUrlTour(slugOrNull) {
  if (slugOrNull) {
    const cleanHash = slugOrNull.replace(/[^a-z0-9]/g, '');
    window.history.pushState({ tourSlug: slugOrNull }, "", "#" + cleanHash);
  } else {
    window.history.pushState({ tourSlug: null }, "", window.location.pathname);
  }
}

function setLibraryVisible(isVisible) {
  const browse = document.querySelector(".browse-list");
  if (browse) browse.style.display = isVisible ? "" : "none";
}

// ------------------------------
// Detail mode
// ------------------------------
function setPageDetailMode(isDetail) {
  document.body.classList.toggle("tour-detail", !!isDetail);
}

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

// ------------------------------
// Scroll helpers
// ------------------------------
function scrollToTopInstant() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  });
}

function restoreLibraryScrollInstant() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: libraryScrollY || 0, left: 0, behavior: "auto" });
    });
  });
}

// ------------------------------
// Data
// ------------------------------
async function loadTours() {
  // MUST have leading slash to fix deep linking
  const res = await fetch("/data/tours.json", { cache: "no-store" });
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
    item.addEventListener("click", () => selectTour(t.tourId, { pushUrl: true }));
    wrap.appendChild(item);
  });

  const metaEl = el("libraryMeta");
  if (metaEl) metaEl.textContent = list?.length ? `${list.length} tours` : "";
}

// ------------------------------
// Search dropdown
// ------------------------------
function initSearch() {
  const input = el("tourSearch");
  const resultsEl = el("searchResults");
  const clearBtn = el("clearSearchBtn");

  if (clearBtn && input) {
    clearBtn.addEventListener("click", () => {
      input.value = "";
      input.dispatchEvent(new Event("input"));
      resultsEl.classList.remove("visible");
      resultsEl.innerHTML = "";
      input.focus();
    });
  }

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();

    if (!q) {
      resultsEl.classList.remove("visible");
      resultsEl.innerHTML = "";

      if (!state.selectedTour) {
        setLibraryVisible(true);
        renderLibrary(state.tours);
      }
      return;
    }

    setLibraryVisible(true);

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
        selectTour(t.tourId, { pushUrl: true });
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
function selectTour(tourId, opts = {}) {
  const { pushUrl = false } = opts;

  const tour = state.tours.find((t) => t.tourId === tourId);
  if (!tour) return;

  if (!state.selectedTour) {
    libraryScrollY = window.scrollY || 0;
  }

  state.selectedTour = tour;

  if (pushUrl) setUrlTour(getTourSlug(tour));
  setLibraryVisible(false);

  setPageDetailMode(true);

  el("tourName").textContent = tour.tourName;
  el("tourArtist").textContent = tour.artist;
  el("tourMeta").textContent = tour.notes || "";

  renderSetlist(tour);

  setDetailMode(true);

  const backBtn = el("backToLibrary");
  backBtn.onclick = () => goBackToLibrary();

  scrollToTopInstant();
}

function goBackToLibrary() {
  state.selectedTour = null;
  setUrlTour(null);

  setPageDetailMode(false);
  setDetailMode(false);

  setLibraryVisible(true);
  renderLibrary(state.tours);

  restoreLibraryScrollInstant();
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
      <span class="song-index">${idx + 1}</span>
      <span class="song-title">${escapeHtml(title)}</span>
      <span class="song-meta">${escapeHtml(artist)}</span>
      <span class="song-chevron">+</span>
    `;

    const dropdown = document.createElement("div");
    dropdown.className = "song-dropdown";
    dropdown.innerHTML = `
      <div class="song-links">
        <a class="song-link-btn" data-role="apple" href="#" target="_blank" rel="noopener" aria-disabled="true">
          Listen on Apple Music
        </a>
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

  dropdown.querySelectorAll("a.song-link-btn").forEach((a) => {
    a.addEventListener("click", (e) => e.stopPropagation(), true);
  });

  const key = cacheKey(artist, title);
  const cached = cache[key];

  if (cached?.appleUrl) {
    applyLinks({ cached, appleBtn });
    return;
  }

  try {
    const songlink = await apiSonglinkBySearch({ artist, title });

    const payload = {
      appleUrl: songlink?.appleUrl || null,
      fetchedAt: Date.now(),
    };

    cache[key] = payload;
    saveCache();

    applyLinks({ cached: payload, appleBtn });
  } catch (err) {
    console.error(err);
  }
}

function applyLinks({ cached, appleBtn }) {
  const appleUrl = normalizeAppleUrl(cached.appleUrl);

  if (appleUrl) {
    appleBtn.href = appleUrl;
    appleBtn.removeAttribute("aria-disabled");
  } else {
    appleBtn.href = "#";
    appleBtn.setAttribute("aria-disabled", "true");
  }
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

    setPageDetailMode(false);
    setDetailMode(false);
    setLibraryVisible(true);

    const match = getTourFromUrl();
    if (match) {
      selectTour(match.tourId, { pushUrl: false });
    }

    window.addEventListener("popstate", () => {
      const matchNow = getTourFromUrl();

      if (!matchNow) {
        state.selectedTour = null;
        setPageDetailMode(false);
        setDetailMode(false);
        setLibraryVisible(true);
        renderLibrary(state.tours);
        restoreLibraryScrollInstant();
        return;
      }

      selectTour(matchNow.tourId, { pushUrl: false });
    });
  } catch (e) {
    console.error(e);
    const panel = el("infoPanel");
    panel.innerHTML = `<div style="max-width:680px;margin:16px auto;padding:16px;background:#fff;border:1px solid #E2E7F0;border-radius:16px;">
      <div style="font-weight:800;color:#121E36;">Couldn't load Setlists</div>
      <div style="margin-top:6px;color:#5E6B86;">Check that <code>data/tours.json</code> exists and is valid JSON.</div>
    </div>`;
  }
})();
