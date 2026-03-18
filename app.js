// ============================================================
// Concerto · Setlists
// - Loads tours from /data/tours.json
// - Renders library + search dropdown
// - On tour select: renders Setlist accordion only
// - Each tour is its own mini-page via ?tour=TOUR_ID + back/forward support
// - Auto-generates Spotify + Apple Music links via Netlify functions
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
        <a class="song-link-btn" data-role="spotify" href="#" target="_blank" rel="noopener" aria-disabled="true">
          Listen on Spotify
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
  const spotifyBtn = dropdown.querySelector('[data-role="spotify"]');

  dropdown.querySelectorAll("a.song-link-btn").forEach((a) => {
    a.addEventListener("click", (e) => e.stopPropagation(), true);
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
  const appleUrl = normalizeAppleUrl(cached.appleUrl);
  const spotifyUrl = cached.spotifyUrl;

  if (appleUrl) {
    appleBtn.href = appleUrl;
    appleBtn.removeAttribute("aria-disabled");
  } else {
    appleBtn.href = "#";
    appleBtn.setAttribute("aria-disabled", "true");
  }

  if (spotifyUrl) {
    spotifyBtn.href = spotifyUrl;
    spotifyBtn.removeAttribute("aria-disabled");
  } else {
    spotifyBtn.href = "#";
    spotifyBtn.setAttribute("aria-disabled", "true");
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

    const slug = getUrlTour();
    if (slug) {
      const match = state.tours.find((t) => getTourSlug(t) === slug);
      if (match) {
        selectTour(match.tourId, { pushUrl: false });
      }
    }

    window.addEventListener("popstate", () => {
      const slugNow = getUrlTour();

      if (!slugNow) {
        state.selectedTour = null;
        setPageDetailMode(false);
        setDetailMode(false);
        setLibraryVisible(true);
        renderLibrary(state.tours);
        restoreLibraryScrollInstant();
        return;
      }

      const match = state.tours.find((t) => getTourSlug(t) === slugNow);
      if (match) {
        selectTour(match.tourId, { pushUrl: false });
      }
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
