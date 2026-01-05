// ============================================================
// Concerto · Setlists & Tour Info
// - Loads tours from /data/tours.json
// - Renders library + search dropdown
// - On tour select: renders Tour Info + Setlist accordion
// - Auto-generates Spotify + Apple Music links via Netlify functions
// ============================================================

const el = (id) => document.getElementById(id);

const state = {
  tours: [],
  selectedTour: null,
};

const CACHE_KEY = "concerto_setlist_cache_v1";
// cache format: { "<artist>::<title>": { spotifyUrl, appleUrl, lyricsUrl, fetchedAt } }
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
  return `${(artist || "").trim().toLowerCase()}::${(title || "").trim().toLowerCase()}`;
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
      <div class="browse-item-meta">${escapeHtml(t.artist)} · ${escapeHtml(String(t.year || ""))}</div>
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

    // Update library to match query
    renderLibrary(hits);

    // Dropdown results
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

  // click outside closes dropdown
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
  el("tourMeta").textContent = [tour.year, tour.notes].filter(Boolean).join(" · ");

  renderTourInfo(tour);
  renderSetlist(tour);

  setDetailMode(true);

  // Back button
  el("backToLibrary").onclick = () => {
    state.selectedTour = null;
    setDetailMode(false);
    renderLibrary(state.tours);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderTourInfo(t) {
  const grid = el("tourInfoGrid");

  const rows = [
    { label: "Tour Website", value: t.tourWebsite ? "Open" : "Not available" },
    { label: "Start Time (Local)", value: t.startTimeLocal || "—" },
    { label: "Year", value: t.year || "—" }
  ];

  grid.innerHTML = rows.map((r) => `
    <div class="tour-info-row">
      <div>
        <div class="tour-info-label">${escapeHtml(r.label)}</div>
      </div>
      <div class="tour-info-value">${escapeHtml(String(r.value))}</div>
    </div>
  `).join("");

  // Add an action button row if website exists
  if (t.tourWebsite) {
    const actions = document.createElement("div");
    actions.className = "tour-info-actions";
    actions.innerHTML = `
      <a class="show-link-btn primary" href="${t.tourWebsite}" target="_blank" rel="noopener">
        Tour Website
      </a>
    `;
    // place under info card body
    grid.parentElement.appendChild(actions);
  }
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

  // Clean any prior appended tour actions (website button duplicates) inside Tour Info card
  // (This keeps it from stacking when switching tours)
  const infoCard = listEl.closest(".info-cards")?.querySelector(".info-card");
  // Not necessary to over-engineer; leaving as-is is fine.

  setlist.forEach((song, idx) => {
    const title = typeof song === "string" ? song : song.title;
    const artist = song.artist || tour.artist; // per-song override optional

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
        <a class="song-link-btn" data-role="lyrics" target="_blank" rel="noopener" href="#" aria-disabled="true">View Lyrics</a>
        <a class="song-link-btn" data-role="apple"  target="_blank" rel="noopener" href="#" aria-disabled="true">Listen on Apple Music</a>
        <a class="song-link-btn primary" data-role="spotify" target="_blank" rel="noopener" href="#" aria-disabled="true">Listen on Spotify</a>
      </div>
      <div class="song-status" data-role="status">Generating links…</div>
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
  const statusEl = dropdown.querySelector('[data-role="status"]');
  const lyricsBtn = dropdown.querySelector('[data-role="lyrics"]');
  const appleBtn  = dropdown.querySelector('[data-role="apple"]');
  const spotifyBtn= dropdown.querySelector('[data-role="spotify"]');

  // Prevent the accordion from “competing” with taps on iOS
  dropdown.querySelectorAll(".song-link-btn").forEach((a) => {
    a.addEventListener("click", (e) => e.stopPropagation());
    a.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
  });

  const key = cacheKey(artist, title);
  const cached = cache[key];

  if (cached?.spotifyUrl || cached?.appleUrl || cached?.lyricsUrl) {
    applyLinks({ cached, statusEl, lyricsBtn, appleBtn, spotifyBtn });
    statusEl.textContent = "Links ready.";
    return;
  }

  try {
    statusEl.textContent = "Searching…";
    statusEl.style.color = "var(--muted)";

    // Run both calls in parallel + timeout safety
    const withTimeout = (promise, ms) =>
      Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Request timed out")), ms))
      ]);

    const [songlink, lyrics] = await withTimeout(
      Promise.all([
        apiSonglinkBySearch({ artist, title }),
        apiLyrics({ artist, title })
      ]),
      8000
    );

    const payload = {
      spotifyUrl: songlink?.spotifyUrl || null,
      appleUrl: songlink?.appleUrl || null,
      lyricsUrl: lyrics?.lyricsUrl || null,
      fetchedAt: Date.now()
    };

    cache[key] = payload;
    saveCache();

    applyLinks({ cached: payload, statusEl, lyricsBtn, appleBtn, spotifyBtn });
    statusEl.textContent = "Links ready.";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn’t generate links. Try again.";
    statusEl.style.color = "var(--muted)";
  }
}

function applyLinks({ cached, statusEl, lyricsBtn, appleBtn, spotifyBtn }) {
  // Spotify
  if (cached.spotifyUrl) {
    spotifyBtn.href = cached.spotifyUrl;
    spotifyBtn.removeAttribute("aria-disabled");
  } else {
    spotifyBtn.href = "#";
    spotifyBtn.setAttribute("aria-disabled", "true");
  }

  // Apple
  if (cached.appleUrl) {
    appleBtn.href = cached.appleUrl;
    appleBtn.removeAttribute("aria-disabled");
  } else {
    appleBtn.href = "#";
    appleBtn.setAttribute("aria-disabled", "true");
  }

  // Lyrics
  if (cached.lyricsUrl) {
    lyricsBtn.href = cached.lyricsUrl;
    lyricsBtn.removeAttribute("aria-disabled");
  } else {
    lyricsBtn.href = "#";
    lyricsBtn.setAttribute("aria-disabled", "true");
    statusEl.textContent = "Links ready. Lyrics not available for this song.";
  }

  // Disable clicks when aria-disabled
  [lyricsBtn, appleBtn, spotifyBtn].forEach((a) => {
    a.onclick = (e) => {
      if (a.getAttribute("aria-disabled") === "true") e.preventDefault();
    };
  });
}

// ------------------------------
// Netlify function API calls
// ------------------------------

async function apiSonglinkBySearch({ artist, title }) {
  const url = `/.netlify/functions/songlink?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
  const res = await fetch(url);
  return res.json();
}

async function apiLyrics({ artist, title }) {
  const url = `/.netlify/functions/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
  const res = await fetch(url);
  if (!res.ok) return { lyricsUrl: null };
  return res.json(); // { lyricsUrl }
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
