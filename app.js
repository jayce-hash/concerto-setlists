const el = (id) => document.getElementById(id);
const state = { tours: [], selectedTour: null };
const CACHE_KEY = "concerto_cache_v2";
const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");

const saveCache = () => localStorage.setItem(CACHE_KEY, JSON.stringify(cache));

async function loadTours() {
  const res = await fetch("./data/tours.json");
  state.tours = await res.json();
  renderLibrary(state.tours);
}

function renderLibrary(list) {
  const wrap = el("toursBrowseList");
  wrap.innerHTML = "";
  list.forEach(t => {
    const item = document.createElement("div");
    item.className = "browse-item";
    item.innerHTML = `<div class="browse-item-name">${t.tourName}</div><div class="browse-item-meta">${t.artist}</div>`;
    item.onclick = () => selectTour(t);
    wrap.appendChild(item);
  });
  el("libraryMeta").textContent = `${list.length} tours`;
}

function selectTour(tour) {
  state.selectedTour = tour;
  el("tourName").textContent = tour.tourName;
  el("tourArtist").textContent = tour.artist;
  document.querySelector(".browse-list").style.display = "none";
  document.querySelector(".hero").style.display = "none";
  document.querySelector(".info-content").hidden = false;
  document.querySelector(".info-panel").classList.remove("info-panel--empty");
  renderSetlist(tour);
  window.scrollTo(0,0);
}

el("backToLibrary").onclick = () => {
  document.querySelector(".browse-list").style.display = "block";
  document.querySelector(".hero").style.display = "block";
  document.querySelector(".info-content").hidden = true;
  document.querySelector(".info-panel").classList.add("info-panel--empty");
};

function renderSetlist(tour) {
  const listEl = el("setlistList");
  listEl.innerHTML = "";
  tour.setlist.forEach((song, i) => {
    const title = typeof song === "string" ? song : song.title;
    const row = document.createElement("div");
    row.className = "song-row";
    row.innerHTML = `
      <button class="song-row-header">
        <span class="song-index">${i+1}</span>
        <span class="song-title">${title}</span>
        <span class="song-chevron">+</span>
      </button>
      <div class="song-dropdown">
        <a class="song-link-btn" href="#" target="_blank" aria-disabled="true">Listen on Apple Music</a>
      </div>
    `;
    const header = row.querySelector(".song-row-header");
    header.onclick = () => {
      const drop = row.querySelector(".song-dropdown");
      const isOpen = drop.classList.toggle("open");
      header.querySelector(".song-chevron").textContent = isOpen ? "−" : "+";
      if (isOpen) hydrateLink(title, tour.artist, drop.querySelector("a"));
    };
    listEl.appendChild(row);
  });
}

async function hydrateLink(title, artist, btn) {
  const key = `${artist}-${title}`.toLowerCase();
  if (cache[key]) {
    btn.href = cache[key];
    btn.removeAttribute("aria-disabled");
    return;
  }
  try {
    const res = await fetch(`/.netlify/functions/songlink?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
    const data = await res.json();
    if (data.appleUrl) {
      cache[key] = data.appleUrl;
      saveCache();
      btn.href = data.appleUrl;
      btn.removeAttribute("aria-disabled");
    }
  } catch (e) { console.error(e); }
}

el("tourSearch").oninput = (e) => {
  const q = e.target.value.toLowerCase();
  renderLibrary(state.tours.filter(t => t.tourName.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)));
};

loadTours();
