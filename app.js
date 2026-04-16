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
  return `${(artist || "").trim().toLowerCase()}::${(title || "").trim().toLowerCase()}`;
}

function normalizeAppleUrl(url) {
  if (!url) return null;
  return String(url).replace("geo.music.apple.com", "music.apple.com");
}

function getTourSlug(t) { return t?.tourId || ""; }

function getUrlTour() {
  const url = new URL(window.location.href);
  return url.searchParams.get("tour");
}

function setUrlTour(slugOrNull) {
  const url = new URL(window.location.href);
  if (slugOrNull) url.searchParams.set("tour", slugOrNull);
  else url.searchParams.delete("tour");
  window.history.pushState({ tourSlug: slugOrNull || null }, "", url.toString());
}

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

function scrollToTopInstant() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

async function loadTours() {
  const res = await fetch("./data/tours.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load tours.json");
  return res.json();
}

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
}

function initSearch() {
  const input = el("tourSearch");
  const resultsEl = el("searchResults");
  const clearBtn = el("clearSearchBtn");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      resultsEl.classList.remove("visible");
      return;
    }
    const hits = state.tours.filter(t => 
      t.tourName.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );
    renderLibrary(hits);
  });
}

function selectTour(tourId, opts = {}) {
  const tour = state.tours.find(t => t.tourId === tourId);
  if (!tour) return;
  state.selectedTour = tour;
  if (opts.pushUrl) setUrlTour(getTourSlug(tour));
  setLibraryVisible(false);
  setPageDetailMode(true);
  el("tourName").textContent = tour.tourName;
  el("tourArtist").textContent = tour.artist;
  renderSetlist(tour);
  setDetailMode(true);
  scrollToTopInstant();
}

function renderSetlist(tour) {
  const listEl = el("setlistList");
  listEl.innerHTML = "";
  const setlist = Array.isArray(tour.setlist) ? tour.setlist : [];

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
          <a class="song-link-btn" data-role="apple" href="#" target="_blank" rel="noopener" aria-disabled="true">
            Listen on Apple Music
          </a>
        </div>
      </div>
    `;

    const header = row.querySelector(".song-row-header");
    const dropdown = row.querySelector(".song-dropdown");

    header.addEventListener("click", async () => {
      const open = dropdown.classList.toggle("open");
      header.querySelector(".song-chevron").textContent = open ? "–" : "+";
      if (open) await hydrateAppleLink({ title, artist, dropdown });
    });

    listEl.appendChild(row);
  });
}

async function hydrateAppleLink({ title, artist, dropdown }) {
  const appleBtn = dropdown.querySelector('[data-role="apple"]');
  const key = cacheKey(artist, title);
  
  if (cache[key]?.appleUrl) {
    applyAppleLink(cache[key].appleUrl, appleBtn);
    return;
  }

  try {
    const res = await fetch(`/.netlify/functions/songlink?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
    const data = await res.json();
    if (data.appleUrl) {
      cache[key] = { appleUrl: data.appleUrl };
      saveCache();
      applyAppleLink(data.appleUrl, appleBtn);
    }
  } catch (err) { console.error(err); }
}

function applyAppleLink(url, btn) {
  const cleanUrl = normalizeAppleUrl(url);
  if (cleanUrl) {
    btn.href = cleanUrl;
    btn.removeAttribute("aria-disabled");
  }
}

function escapeHtml(str) {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

(async function init() {
  state.tours = await loadTours();
  renderLibrary(state.tours);
  initSearch();
  const slug = getUrlTour();
  if (slug) {
    const match = state.tours.find(t => getTourSlug(t) === slug);
    if (match) selectTour(match.tourId, { pushUrl: false });
  }
})();
