// ============================================================
// Concerto · Setlists & Tour Info
// - Loads tours from /data/tours.json
// - Renders library + search dropdown
// - Tour detail via ?tour=TOUR_ID
// - Auto-generates Spotify + Apple Music links via Netlify
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

// -----------------------------
// Cache
// -----------------------------
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

// -----------------------------
// URL Helpers
// -----------------------------
function normalizeAppleUrl(url) {
  if (!url) return null;
  return String(url).replace("geo.music.apple.com", "music.apple.com");
}

function normalizeExternalUrl(url) {
  if (!url) return null;
  const u = String(url).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) return `https://${u}`;
  return u;
}

function getTourSlug(t) {
  return t?.tourId || "";
}

function getUrlTour() {
  const url = new URL(window.location.href);
  return url.searchParams.get("tour");
}

function setUrlTour(slugOrNull) {
  const url = new URL(window.location.href);
  if (slugOrNull) url.searchParams.set("tour", slugOrNull);
  else url.searchParams.delete("tour");

  window.history.pushState(
    { tourSlug: slugOrNull || null },
    "",
    url.toString()
  );
}

// -----------------------------
// UI State
// -----------------------------
function setLibraryVisible(isVisible) {
  const browse = document.querySelector(".browse-list");
  if (browse) browse.style.display = isVisible ? "" : "none";
}

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

// -----------------------------
// Scroll
// -----------------------------
function scrollToTopInstant() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  });
}

function restoreLibraryScrollInstant() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: libraryScrollY || 0, behavior: "auto" });
    });
  });
}

// -----------------------------
// Data
// -----------------------------
async function loadTours() {
  const res = await fetch("./data/tours.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load tours.json");
  return res.json();
}

// -----------------------------
// Library
// -----------------------------
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
    item.addEventListener("click", () =>
      selectTour(t.tourId, { pushUrl: true })
    );
    wrap.appendChild(item);
  });

  const metaEl = el("libraryMeta");
  if (metaEl) metaEl.textContent = list?.length ? `${list.length} tours` : "";
}

// -----------------------------
// Search
// -----------------------------
function initSearch() {
  const input = el("tourSearch");
  const resultsEl = el("searchResults");
  const clearBtn = el("clearSearchBtn");

  clearBtn?.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input"));
    resultsEl.classList.remove("visible");
    resultsEl.innerHTML = "";
    input.focus();
  });

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();

    if (!q) {
      resultsEl.classList.remove("visible");
      resultsEl.innerHTML = "";
      if (!state.selectedTour) renderLibrary(state.tours);
      return;
    }

    const hits = state.tours.filter(
      (t) =>
        t.tourName.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q)
    );

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

    resultsEl.classList.toggle("visible", hits.length > 0);
  });

  document.addEventListener("click", (e) => {
    if (!resultsEl.contains(e.target) && e.target !== input) {
      resultsEl.classList.remove("visible");
    }
  });
}

// -----------------------------
// Tour Selection
// -----------------------------
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

  renderTourInfo(tour);
  renderSetlist(tour);
  setDetailMode(true);

  el("backToLibrary").onclick = goBackToLibrary;

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

// -----------------------------
// Tour Info
// -----------------------------
function renderTourInfo(t) {
  const grid = el("tourInfoGrid");
  const website = normalizeExternalUrl(t.tourWebsite);

  const websiteRow = website
    ? `
      <a class="tour-info-row tour-info-row--link"
         href="${escapeHtml(website)}"
         data-role="tour-website"
         rel="noopener">
        <div class="tour-info-label">Tour Website</div>
        <div class="tour-info-value">Open</div>
      </a>`
    : "";

  grid.innerHTML = `
    <div class="tour-info-row">
      <div class="tour-info-label">Start Time (Local)</div>
      <div class="tour-info-value">${escapeHtml(
        t.startTimeLocal || "—"
      )}</div>
    </div>
    ${websiteRow}
  `;
}

// -----------------------------
// Setlist
// -----------------------------
function renderSetlist(tour) {
  const listEl = el("setlistList");
  listEl.innerHTML = "";

  const setlist = Array.isArray(tour.setlist) ? tour.setlist : [];

  if (!setlist.length) {
    listEl.innerHTML =
      '<div style="padding:14px 16px;color:#5E6B86;">No setlist yet.</div>';
    return;
  }

  setlist.forEach((song, idx) => {
    const title = typeof song === "string" ? song : song.title;
    const artist = song.artist || tour.artist;

    const row = document.createElement("div");
    row.className = "song-row";

    row.innerHTML = `
      <button type="button" class="song-row-header">
        <span class="song-index">${idx + 1}</span>
        <span class="song-title">${escapeHtml(title)}</span>
        <span class="song-chevron">+</span>
      </button>
      <div class="song-dropdown">
        <div class="song-links">
          <a class="song-link-btn" data-role="apple" href="#" target="_blank" rel="noopener" aria-disabled="true">Listen on Apple Music</a>
          <a class="song-link-btn" data-role="spotify" href="#" target="_blank" rel="noopener" aria-disabled="true">Listen on Spotify</a>
        </div>
      </div>
    `;

    const header = row.querySelector(".song-row-header");
    const dropdown = row.querySelector(".song-dropdown");

    header.addEventListener("click", () => {
      const open = dropdown.classList.toggle("open");
      header.querySelector(".song-chevron").textContent = open ? "–" : "+";
    });

    listEl.appendChild(row);
  });
}

// -----------------------------
// Utilities
// -----------------------------
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// -----------------------------
// Boot
// -----------------------------
(async function init() {
  try {
    state.tours = await loadTours();
    renderLibrary(state.tours);
    initSearch();

    setPageDetailMode(false);
    setDetailMode(false);
    setLibraryVisible(true);

    const slug = getUrlTour();
    if (slug) {
      const match = state.tours.find((t) => getTourSlug(t) === slug);
      if (match) selectTour(match.tourId, { pushUrl: false });
    }

    window.addEventListener("popstate", () => {
      const slugNow = getUrlTour();
      if (!slugNow) {
        goBackToLibrary();
        return;
      }
      const match = state.tours.find((t) => getTourSlug(t) === slugNow);
      if (match) selectTour(match.tourId, { pushUrl: false });
    });
  } catch (e) {
    console.error(e);
  }
})();
