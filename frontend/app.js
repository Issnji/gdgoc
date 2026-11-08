/**
 * FilmLog — Frontend untuk backend Laravel (JWT) GDGoC.
 * Zero-build SPA. Disesuaikan dengan kontrak backend di /backend/routes/api.php.
 */

// ==========================================
// 0. HELPERS
// ==========================================
const POSTER_FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="100%" height="100%" fill="#1e242b"/>' +
  '<text x="50%" y="50%" fill="#8996a6" font-family="sans-serif" font-size="18" text-anchor="middle">No Poster</text></svg>'
);

// Escape semua data dari backend sebelum masuk innerHTML (cegah XSS dari review/username/judul).
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Backend menyimpan genres/cast sebagai array JSON, tapi tetap toleran terhadap string "a, b".
function listOf(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(',').map(v => v.trim()).filter(Boolean);
  return [];
}

function posterOf(movie) {
  return esc((movie && movie.poster_url) || POSTER_FALLBACK);
}

const POSTER_ONERROR = `this.onerror=null;this.src=POSTER_FALLBACK`;

// ==========================================
// 1. STATE MANAGEMENT
// ==========================================
const state = {
  apiBaseUrl: localStorage.getItem('filmlog_api_url') || 'http://localhost:8000/api',
  token: localStorage.getItem('filmlog_token') || null,
  user: JSON.parse(localStorage.getItem('filmlog_user') || 'null'),
  currentTab: 'discover',
  authMode: 'login', // 'login' | 'register'
  catalog: [],         // seluruh film (tanpa filter), dipakai untuk lookup dan daftar genre
  filteredMovies: [],  // hasil GET /movies (sudah difilter server) yang ditampilkan di Discover
  usingFallback: false, // true jika backend mati dan data diambil dari ../data/movies.json
  watchlist: [],       // [{ id, user_id, movie_id, created_at, movie: {...} }]
  watchedList: [],     // [{ id, user_id, movie_id, rating, review, watched_at, movie: {...} }]
  selectedGenre: 'ALL',
  searchQuery: '',
  searchTimer: null,
  movieRequestId: 0,
  activeDetailMovie: null,
  logs: []
};

function findMovie(movieId) {
  const id = String(movieId);
  return state.catalog.find(m => String(m.id) === id)
    || state.filteredMovies.find(m => String(m.id) === id)
    || null;
}

function entryMovieId(item) {
  if (item && typeof item === 'object') {
    return item.movie_id ?? item.movieId ?? (item.movie && item.movie.id) ?? item.id;
  }
  return item;
}

// ==========================================
// 2. HTTP CLIENT & NETWORK INSPECTOR
// ==========================================
class ApiError extends Error {
  constructor(message, status = 0, errors = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

// Laravel mengirim error validasi sebagai { message, errors: { field: [msg, ...] } } (422).
function collectErrorMessages(data) {
  if (data && typeof data === 'object' && data.errors && typeof data.errors === 'object') {
    const all = Object.values(data.errors).flat().filter(Boolean);
    if (all.length) return [...new Set(all)];
  }
  return [];
}

function extractErrorMessage(data, status) {
  const list = collectErrorMessages(data);
  if (list.length) return list.join('\n');
  if (data && typeof data === 'object' && (data.message || data.error)) return data.message || data.error;
  return `Request gagal dengan status ${status}`;
}

async function apiFetch(endpoint, options = {}) {
  const url = `${state.apiBaseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  const method = options.method || 'GET';
  const headers = {
    // Accept: application/json wajib untuk Laravel. Tanpa ini error validasi/401 bisa berupa redirect HTML.
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const sentToken = state.token;
  if (sentToken) {
    headers['Authorization'] = `Bearer ${sentToken}`;
  }

  const startTime = performance.now();
  let status = 0;

  try {
    const res = await fetch(url, { ...options, headers });
    status = res.status;

    const contentType = res.headers.get('content-type') || '';
    const responseData = contentType.includes('application/json') ? await res.json() : await res.text();

    logApiRequest({
      time: new Date().toLocaleTimeString(),
      method,
      url,
      status,
      ok: res.ok,
      duration: Math.round(performance.now() - startTime)
    });

    if (!res.ok) {
      // Token JWT kedaluwarsa/tidak valid pada endpoint terproteksi.
      if (status === 401 && sentToken && !endpoint.startsWith('/auth')) {
        handleSessionExpired();
      }
      throw new ApiError(extractErrorMessage(responseData, status), status, collectErrorMessages(responseData));
    }

    return responseData;
  } catch (err) {
    if (status === 0) {
      logApiRequest({
        time: new Date().toLocaleTimeString(),
        method,
        url,
        status: 'CORS/ERR',
        ok: false,
        duration: Math.round(performance.now() - startTime)
      });
      throw new ApiError(`Tidak dapat terhubung ke backend (${state.apiBaseUrl}). Pastikan server menyala dan CORS aktif.`, 0);
    }
    throw err;
  }
}

function logApiRequest(logItem) {
  state.logs.unshift(logItem);
  if (state.logs.length > 20) state.logs.pop();

  const container = document.getElementById('logs-content');
  if (!container) return;

  container.innerHTML = state.logs.map(l => `
    <div class="flex items-center justify-between py-1 border-b border-brand-border/40">
      <div class="flex items-center gap-2 overflow-hidden">
        <span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${
          l.ok ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
        }">${esc(l.method)}</span>
        <span class="text-white truncate max-w-xs sm:max-w-md">${esc(l.url)}</span>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <span class="${l.ok ? 'text-emerald-400' : 'text-rose-400'} font-bold">${esc(l.status)}</span>
        <span class="text-brand-muted text-[10px]">${l.duration}ms</span>
        <span class="text-brand-muted text-[10px] hidden sm:inline">${esc(l.time)}</span>
      </div>
    </div>
  `).join('');
}

function toggleLogsDrawer() {
  const content = document.getElementById('logs-content');
  const icon = document.getElementById('log-drawer-icon');
  const text = document.getElementById('log-drawer-text');
  const isHidden = content.classList.contains('hidden');

  if (isHidden) {
    content.classList.remove('hidden');
    icon.style.transform = 'rotate(180deg)';
    text.textContent = 'Hide Logs';
  } else {
    content.classList.add('hidden');
    icon.style.transform = 'rotate(0deg)';
    text.textContent = 'Show Logs';
  }
}

// ==========================================
// 3. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  updateApiUrlDisplay();
  renderAuthUI();
  loadDiscoverMovies();
  if (state.token) {
    loadWatchlist();
    loadWatchedList();
  }
});

function updateApiUrlDisplay() {
  const display = document.getElementById('api-url-display');
  const input = document.getElementById('api-base-url-input');
  if (display) display.textContent = state.apiBaseUrl;
  if (input) input.value = state.apiBaseUrl;
}

// ==========================================
// 4. TAB NAVIGATION
// ==========================================
function switchTab(tabId) {
  state.currentTab = tabId;

  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  const activeSection = document.getElementById(`tab-${tabId}`);
  if (activeSection) activeSection.classList.remove('hidden');

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.remove('text-white', 'bg-brand-card');
    btn.classList.add('text-brand-muted');
  });
  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeNav) {
    activeNav.classList.remove('text-brand-muted');
    activeNav.classList.add('text-white', 'bg-brand-card');
  }

  if (tabId === 'watchlist') {
    if (!state.token) {
      showToast('Silakan login terlebih dahulu untuk melihat Watchlist', 'info');
      openAuthModal('login');
      return;
    }
    loadWatchlist();
  } else if (tabId === 'watched') {
    if (!state.token) {
      showToast('Silakan login terlebih dahulu untuk melihat Watched list', 'info');
      openAuthModal('login');
      return;
    }
    loadWatchedList();
  }

  lucide.createIcons();
}

// ==========================================
// 5. MOVIES (DISCOVER)
// ==========================================
// Filter pencarian, genre, dan acak dikerjakan backend lewat query string:
// GET /movies?search=...&genre=...&random=1
async function loadDiscoverMovies(shuffle = false) {
  const statusEl = document.getElementById('movie-grid-status');
  const gridEl = document.getElementById('movie-grid');
  const requestId = ++state.movieRequestId;
  statusEl.classList.remove('hidden');

  const params = new URLSearchParams();
  if (state.searchQuery) params.set('search', state.searchQuery);
  if (state.selectedGenre !== 'ALL') params.set('genre', state.selectedGenre);
  if (shuffle) params.set('random', '1');
  const qs = params.toString();

  try {
    const data = await apiFetch(`/movies${qs ? `?${qs}` : ''}`);
    if (requestId !== state.movieRequestId) return; // respons usang (user sudah mengetik lagi)

    const list = Array.isArray(data) ? data : (data.data || []);
    state.usingFallback = false;
    state.filteredMovies = list;

    // Request tanpa filter = katalog lengkap, dipakai untuk lookup & pill genre.
    if (!qs || !state.catalog.length) {
      if (!qs) state.catalog = list;
      renderGenrePills();
    }

    if (shuffle) showToast('Daftar film berhasil diacak (shuffle)!', 'success');
    renderMovieGrid();
    statusEl.classList.add('hidden');
    document.getElementById('api-status-dot').className = 'w-2 h-2 rounded-full bg-emerald-400';
  } catch (err) {
    if (requestId !== state.movieRequestId) return;
    statusEl.classList.add('hidden');
    document.getElementById('api-status-dot').className = 'w-2 h-2 rounded-full bg-rose-500';

    // Fallback: backend belum jalan, pakai seed lokal supaya layout tetap terlihat.
    console.warn('Backend not reachable, loading fallback local seed:', err.message);
    try {
      const fallbackRes = await fetch('../data/movies.json');
      state.catalog = await fallbackRes.json();
      state.usingFallback = true;
      renderGenrePills();
      applyFallbackFilters(shuffle);
      showToast('⚠️ Backend belum aktif. Menampilkan data lokal (fallback). Cek server di ' + state.apiBaseUrl, 'warning');
    } catch (fallbackErr) {
      gridEl.innerHTML = `
        <div class="col-span-full py-12 text-center text-rose-400 bg-rose-950/20 border border-rose-900/40 rounded-xl p-6">
          <p class="font-bold mb-1">Gagal terhubung ke backend (${esc(state.apiBaseUrl)})</p>
          <p class="text-xs text-brand-muted">${esc(err.message)}</p>
        </div>
      `;
    }
  }
}

// Hanya dipakai saat mode fallback (tanpa backend).
function applyFallbackFilters(shuffle = false) {
  const q = state.searchQuery.toLowerCase();
  state.filteredMovies = state.catalog.filter(movie => {
    const matchesSearch = !q
      || movie.title.toLowerCase().includes(q)
      || (movie.director && movie.director.toLowerCase().includes(q));
    const matchesGenre = state.selectedGenre === 'ALL' || listOf(movie.genres).includes(state.selectedGenre);
    return matchesSearch && matchesGenre;
  });
  if (shuffle) state.filteredMovies.sort(() => Math.random() - 0.5);
  renderMovieGrid();
}

function handleMovieFilter() {
  state.searchQuery = document.getElementById('movie-search').value.trim();
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => loadDiscoverMovies(), 300); // debounce agar tidak spam request
}

function filterByGenre(genre) {
  state.selectedGenre = genre;
  renderGenrePills();
  loadDiscoverMovies();
}

// Pill genre dibangun dari katalog backend, bukan hardcode.
function renderGenrePills() {
  const container = document.getElementById('genre-filters');
  if (!container) return;

  const genres = [...new Set(state.catalog.flatMap(m => listOf(m.genres)))].sort();
  const pill = (value, label) => {
    const active = state.selectedGenre === value;
    const cls = active
      ? 'bg-white text-black font-semibold'
      : 'bg-brand-surface border border-brand-border text-brand-muted hover:text-white';
    return `<button data-genre="${esc(value)}" onclick="filterByGenre(this.dataset.genre)" class="genre-btn px-3 py-1.5 rounded-full whitespace-nowrap ${cls}">${esc(label)}</button>`;
  };
  container.innerHTML = pill('ALL', 'All Genres') + genres.map(g => pill(g, g)).join('');
}

function renderMovieGrid() {
  const gridEl = document.getElementById('movie-grid');
  if (!gridEl) return;

  if (state.filteredMovies.length === 0) {
    gridEl.innerHTML = `
      <div class="col-span-full py-16 text-center text-brand-muted">
        <p class="text-base font-semibold text-white">Tidak ada film yang cocok</p>
        <p class="text-xs mt-1">Coba ubah kata kunci pencarian atau filter genre.</p>
      </div>
    `;
    return;
  }

  gridEl.innerHTML = state.filteredMovies.map(movie => {
    const isWatchlisted = isMovieInWatchlist(movie.id);
    const isWatched = isMovieWatched(movie.id);

    return `
      <div class="poster-hover group relative bg-brand-card rounded-xl overflow-hidden border border-brand-border/70 hover:border-brand-green/60 transition-all duration-300 hover:shadow-xl hover:shadow-brand-green/10 flex flex-col">
        <div class="relative aspect-[2/3] w-full overflow-hidden bg-brand-dark cursor-pointer" onclick="openMovieDetail(${Number(movie.id)})">
          <img src="${posterOf(movie)}" alt="${esc(movie.title)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="${POSTER_ONERROR}" />

          <div class="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur text-xs font-bold text-amber-400 flex items-center gap-1 border border-white/10">
            ★ <span>${esc(movie.rating ?? 'N/A')}</span>
          </div>

          ${isWatched ? `<div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-brand-green/90 text-[10px] font-bold text-black">WATCHED</div>` : ''}

          <div class="poster-overlay absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 transition-opacity duration-200 flex flex-col justify-end p-3 space-y-2">
            <button onclick="event.stopPropagation(); toggleWatchlist(${Number(movie.id)})" class="w-full py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              isWatchlisted ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-brand-surface/90 hover:bg-brand-green hover:text-black text-white border border-brand-border'
            }">
              <i data-lucide="${isWatchlisted ? 'check' : 'bookmark'}" class="w-3.5 h-3.5"></i>
              <span>${isWatchlisted ? 'In Watchlist' : 'Add Watchlist'}</span>
            </button>
            <button onclick="event.stopPropagation(); openWatchedModal(${Number(movie.id)})" class="w-full py-1.5 px-2 rounded-lg text-xs font-semibold bg-brand-surface/90 hover:bg-amber-400 hover:text-black text-white border border-brand-border flex items-center justify-center gap-1.5 transition">
              <i data-lucide="star" class="w-3.5 h-3.5"></i>
              <span>${isWatched ? 'Sudah Ditonton' : 'Mark Watched'}</span>
            </button>
          </div>
        </div>

        <div class="p-3 flex-1 flex flex-col justify-between">
          <div>
            <h3 class="font-bold text-sm text-white line-clamp-1 group-hover:text-brand-green transition cursor-pointer" onclick="openMovieDetail(${Number(movie.id)})">${esc(movie.title)}</h3>
            <p class="text-xs text-brand-muted mt-0.5">${esc(movie.year)} • ${esc(movie.director || 'Unknown')}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function isMovieInWatchlist(movieId) {
  return state.watchlist.some(item => String(entryMovieId(item)) === String(movieId));
}

function isMovieWatched(movieId) {
  return state.watchedList.some(item => String(entryMovieId(item)) === String(movieId));
}

// ==========================================
// 6. MOVIE DETAIL MODAL
// ==========================================
async function openMovieDetail(movieId) {
  let movie = findMovie(movieId);

  // GET /api/movies/:id membalas { data: {...} }
  try {
    const remote = await apiFetch(`/movies/${movieId}`);
    if (remote) movie = remote.data || remote;
  } catch (err) {
    if (!movie) {
      showToast(err.message, 'error');
      return;
    }
  }

  if (!movie) return;
  state.activeDetailMovie = movie;

  const isWatchlisted = isMovieInWatchlist(movie.id);
  const genres = listOf(movie.genres);
  const cast = listOf(movie.cast);

  const contentEl = document.getElementById('modal-detail-content');
  contentEl.innerHTML = `
    <div class="flex flex-col sm:flex-row gap-6">
      <div class="w-full sm:w-52 shrink-0">
        <img src="${posterOf(movie)}" alt="${esc(movie.title)}" onerror="${POSTER_ONERROR}" class="w-full rounded-xl shadow-xl border border-brand-border" />
      </div>

      <div class="flex-1 space-y-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-bold px-2 py-0.5 rounded bg-brand-green/20 text-brand-green border border-brand-green/30">${esc(movie.year)}</span>
            <span class="text-xs text-brand-muted">${esc(movie.duration || '')}</span>
            <span class="text-xs font-bold text-amber-400 flex items-center gap-0.5 ml-auto">★ ${esc(movie.rating ?? 'N/A')}</span>
          </div>
          <h2 class="text-2xl sm:text-3xl font-black text-white leading-tight">${esc(movie.title)}</h2>
          <p class="text-sm text-brand-muted mt-1">Directed by <span class="text-white font-medium">${esc(movie.director || 'Unknown')}</span></p>
        </div>

        <div class="flex flex-wrap gap-1.5">
          ${genres.map(g => `<span class="px-2 py-0.5 rounded-full bg-brand-dark border border-brand-border text-[11px] text-brand-muted">${esc(g)}</span>`).join('')}
        </div>

        <div>
          <h4 class="text-xs font-bold text-brand-muted uppercase tracking-wider mb-1">Synopsis</h4>
          <p class="text-sm text-gray-300 leading-relaxed">${esc(movie.synopsis || 'No synopsis available.')}</p>
        </div>

        ${cast.length ? `
          <div>
            <h4 class="text-xs font-bold text-brand-muted uppercase tracking-wider mb-1">Cast</h4>
            <p class="text-xs text-brand-muted">${cast.map(esc).join(' • ')}</p>
          </div>
        ` : ''}

        <div class="pt-4 border-t border-brand-border flex items-center gap-3">
          <button onclick="toggleWatchlist(${Number(movie.id)})" class="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
            isWatchlisted ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-brand-green text-black hover:brightness-110'
          }">
            <i data-lucide="${isWatchlisted ? 'check' : 'bookmark'}" class="w-4 h-4"></i>
            <span>${isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}</span>
          </button>

          <button onclick="closeMovieDetailModal(); openWatchedModal(${Number(movie.id)})" class="py-2.5 px-4 rounded-xl font-bold text-xs bg-brand-surfaceHover hover:bg-amber-400 hover:text-black border border-brand-border text-white flex items-center justify-center gap-2 transition">
            <i data-lucide="star" class="w-4 h-4"></i>
            <span>Log Review</span>
          </button>
        </div>
      </div>
    </div>
  `;

  showDetailModal();
  lucide.createIcons();
}

// Timer disimpan agar penutupan modal yang tertunda tidak menyembunyikan modal yang baru dibuka
// (mis. klik "Log Review" dari modal detail).
let detailModalTimer = null;

function showDetailModal() {
  clearTimeout(detailModalTimer);
  const modal = document.getElementById('movie-detail-modal');
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeMovieDetailModal() {
  state.activeDetailMovie = null;
  const modal = document.getElementById('movie-detail-modal');
  modal.classList.add('opacity-0');
  detailModalTimer = setTimeout(() => modal.classList.add('hidden'), 200);
}

// ==========================================
// 7. WATCHLIST
// ==========================================
function updateWatchlistBadge() {
  const badge = document.getElementById('watchlist-badge');
  const countEl = document.getElementById('watchlist-count');
  if (badge) {
    badge.textContent = state.watchlist.length;
    badge.classList.toggle('hidden', state.watchlist.length === 0);
  }
  if (countEl) countEl.textContent = `${state.watchlist.length} films`;
}

async function loadWatchlist() {
  if (!state.token) return;

  try {
    // GET /api/watchlist membalas { message, data: [{ ..., movie: {...} }] }
    const data = await apiFetch('/watchlist');
    state.watchlist = Array.isArray(data) ? data : (data.data || []);
    updateWatchlistBadge();
    renderWatchlistGrid();
    if (state.filteredMovies.length) renderMovieGrid(); // sinkronkan tombol di Discover
  } catch (err) {
    console.error('Failed to load watchlist:', err.message);
  }
}

async function toggleWatchlist(movieId) {
  if (!state.token) {
    showToast('Silakan login terlebih dahulu untuk mengelola Watchlist', 'info');
    openAuthModal('login');
    return;
  }

  const id = Number(movieId);

  try {
    if (isMovieInWatchlist(id)) {
      // DELETE /api/watchlist/:movieId
      await apiFetch(`/watchlist/${id}`, { method: 'DELETE' });
      showToast('Film dihapus dari watchlist', 'info');
    } else {
      // POST /api/watchlist  { movieId }
      await apiFetch('/watchlist', {
        method: 'POST',
        body: JSON.stringify({ movieId: id })
      });
      showToast('Berhasil ditambahkan ke watchlist! 📌', 'success');
    }

    await loadWatchlist();
    if (state.activeDetailMovie && String(state.activeDetailMovie.id) === String(id)) {
      openMovieDetail(id);
    }
  } catch (err) {
    showToast(err.message, 'error');
    // 409 (sudah ada) / 404 (sudah terhapus) berarti state lokal usang, sinkronkan ulang.
    if (err.status === 409 || err.status === 404) loadWatchlist();
  }
}

function renderWatchlistGrid() {
  const gridEl = document.getElementById('watchlist-grid');
  const emptyEl = document.getElementById('watchlist-empty');
  if (!gridEl) return;

  if (state.watchlist.length === 0) {
    gridEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  gridEl.innerHTML = state.watchlist.map(item => {
    const movieId = entryMovieId(item);
    const movie = item.movie || findMovie(movieId) || { id: movieId, title: `Movie #${movieId}` };

    return `
      <div class="bg-brand-card rounded-xl overflow-hidden border border-brand-border flex flex-col group">
        <div class="relative aspect-[2/3] overflow-hidden bg-brand-dark cursor-pointer" onclick="openMovieDetail(${Number(movie.id)})">
          <img src="${posterOf(movie)}" alt="${esc(movie.title)}" onerror="${POSTER_ONERROR}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
        <div class="p-3 flex-1 flex flex-col justify-between">
          <div>
            <h4 class="font-bold text-sm text-white truncate cursor-pointer hover:text-brand-green" onclick="openMovieDetail(${Number(movie.id)})">${esc(movie.title)}</h4>
            <p class="text-xs text-brand-muted mt-0.5">${esc(movie.year || '')}</p>
          </div>
          <div class="flex items-center gap-2 mt-3 pt-2 border-t border-brand-border">
            <button onclick="toggleWatchlist(${Number(movie.id)})" class="text-xs text-rose-400 hover:text-rose-300 py-1 flex items-center gap-1">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus
            </button>
            <button onclick="openWatchedModal(${Number(movie.id)})" class="text-xs text-amber-400 hover:text-amber-300 py-1 ml-auto flex items-center gap-1 font-semibold">
              <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Watched
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// ==========================================
// 8. WATCHED & REVIEWS
// ==========================================
async function loadWatchedList() {
  if (!state.token) return;

  try {
    // GET /api/watched membalas { message, data: [{ rating, review, watched_at, movie: {...} }] }
    const data = await apiFetch('/watched');
    const list = Array.isArray(data) ? data : (data.data || []);
    // Backend tidak mengurutkan, tampilkan yang terbaru dulu.
    state.watchedList = list.slice().sort((a, b) =>
      new Date(b.watched_at || b.created_at || 0) - new Date(a.watched_at || a.created_at || 0));
    renderWatchedList();
    if (state.filteredMovies.length) renderMovieGrid();
  } catch (err) {
    console.error('Failed to load watched list:', err.message);
  }
}

function openWatchedModal(movieId) {
  if (!state.token) {
    showToast('Silakan login terlebih dahulu untuk mencatat film yang sudah ditonton', 'info');
    openAuthModal('login');
    return;
  }

  // Backend menolak duplikat (409), jadi arahkan ke daftar watched.
  if (isMovieWatched(movieId)) {
    showToast('Film ini sudah tercatat di Watched. Hapus dulu jika ingin mencatat ulang.', 'info');
    switchTab('watched');
    return;
  }

  const movie = findMovie(movieId) || { id: movieId, title: `Movie #${movieId}` };

  const contentEl = document.getElementById('modal-detail-content');
  contentEl.innerHTML = `
    <div class="space-y-4">
      <div class="border-b border-brand-border pb-3">
        <span class="text-xs font-bold text-brand-green uppercase tracking-wider">Log Review & Thoughts</span>
        <h2 class="text-2xl font-bold text-white mt-1">${esc(movie.title)}</h2>
      </div>

      <form id="watched-form" onsubmit="handleWatchedSubmit(event, ${Number(movie.id)})" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-brand-muted uppercase mb-1.5">Rating Kamu (1 - 5 Bintang)</label>
          <div class="flex items-center gap-2" id="star-selector">
            ${[1, 2, 3, 4, 5].map(star => `
              <button type="button" onclick="setRatingValue(${star})" class="star-btn text-2xl text-brand-muted hover:text-amber-400 transition" data-star="${star}">
                ★
              </button>
            `).join('')}
          </div>
          <input type="hidden" id="watched-rating-input" value="5" />
        </div>

        <div>
          <label class="block text-xs font-semibold text-brand-muted uppercase mb-1.5">Opini & Review Kamu <span class="normal-case font-normal">(opsional, maks. 1000 karakter)</span></label>
          <textarea id="watched-review-input" rows="4" maxlength="1000" placeholder="Tuliskan pendapatmu tentang alur cerita, akting, atau kesan setelah menonton film ini..." class="w-full bg-brand-dark border border-brand-border rounded-xl p-3 text-sm text-white placeholder-brand-muted focus:outline-none focus:border-brand-green resize-none"></textarea>
        </div>

        <div class="pt-3 border-t border-brand-border flex items-center justify-end gap-3">
          <button type="button" onclick="closeMovieDetailModal()" class="px-4 py-2 text-sm text-brand-muted hover:text-white transition">Batal</button>
          <button type="submit" id="watched-submit-btn" class="px-5 py-2.5 bg-brand-green text-black font-bold text-sm rounded-xl hover:brightness-110 transition flex items-center gap-2">
            <i data-lucide="check" class="w-4 h-4"></i> Simpan Catatan
          </button>
        </div>
      </form>
    </div>
  `;

  setRatingValue(5);
  showDetailModal();
  lucide.createIcons();
}

function setRatingValue(val) {
  const input = document.getElementById('watched-rating-input');
  if (input) input.value = val;

  document.querySelectorAll('#star-selector .star-btn').forEach(btn => {
    const starNum = parseInt(btn.getAttribute('data-star'), 10);
    btn.className = starNum <= val
      ? 'star-btn text-2xl text-amber-400 transition scale-110'
      : 'star-btn text-2xl text-brand-muted transition';
  });
}

async function handleWatchedSubmit(event, movieId) {
  event.preventDefault();
  const rating = parseInt(document.getElementById('watched-rating-input').value, 10); // backend: integer 1-5
  const review = document.getElementById('watched-review-input').value.trim();
  const btn = document.getElementById('watched-submit-btn');
  btn.disabled = true;

  try {
    // POST /api/watched  { movieId, rating, review }
    await apiFetch('/watched', {
      method: 'POST',
      body: JSON.stringify({ movieId: Number(movieId), rating, review: review || null })
    });

    showToast('Catatan film berhasil disimpan! ⭐', 'success');
    closeMovieDetailModal();
    loadWatchedList();
  } catch (err) {
    showToast(err.message, 'error');
    if (err.status === 409) {
      closeMovieDetailModal();
      loadWatchedList();
    }
  } finally {
    btn.disabled = false;
  }
}

async function removeWatched(movieId) {
  if (!confirm('Hapus catatan film ini dari daftar Watched?')) return;

  try {
    // DELETE /api/watched/:movieId
    await apiFetch(`/watched/${Number(movieId)}`, { method: 'DELETE' });
    showToast('Catatan watched dihapus', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
  loadWatchedList();
}

function renderWatchedList() {
  const container = document.getElementById('watched-list');
  const emptyEl = document.getElementById('watched-empty');
  if (!container) return;

  if (state.watchedList.length === 0) {
    container.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  container.innerHTML = state.watchedList.map(item => {
    const movieId = entryMovieId(item);
    const movie = item.movie || findMovie(movieId) || { id: movieId, title: `Movie #${movieId}` };

    const stars = Math.min(5, Math.max(0, Math.round(Number(item.rating) || 0)));
    const ratingStars = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    const rawDate = item.watched_at || item.created_at;
    const dateStr = rawDate ? new Date(rawDate).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : 'Baru saja';

    return `
      <div class="bg-brand-surface p-4 sm:p-5 rounded-2xl border border-brand-border flex gap-4 sm:gap-6 items-start">
        <img src="${posterOf(movie)}" alt="${esc(movie.title)}" onerror="${POSTER_ONERROR}" class="w-16 sm:w-20 aspect-[2/3] object-cover rounded-lg shrink-0 border border-brand-border shadow-md" />
        <div class="flex-1 space-y-2">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <h4 class="font-bold text-base text-white hover:text-brand-green cursor-pointer" onclick="openMovieDetail(${Number(movie.id)})">
              ${esc(movie.title)} <span class="text-xs text-brand-muted font-normal">(${esc(movie.year || '')})</span>
            </h4>
            <div class="flex items-center gap-2">
              <span class="text-amber-400 font-bold text-sm tracking-wider">${ratingStars}</span>
              <span class="text-[11px] text-brand-muted">${esc(dateStr)}</span>
            </div>
          </div>
          <p class="text-sm text-gray-300 leading-relaxed bg-brand-dark/40 p-3 rounded-xl border border-brand-border/40 font-normal whitespace-pre-line">${
            item.review ? `"${esc(item.review)}"` : '<span class="text-brand-muted italic">Tidak ada catatan ulasan.</span>'
          }</p>
          <div class="flex justify-end">
            <button onclick="removeWatched(${Number(movie.id)})" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// ==========================================
// 9. AI RECOMMENDATION (GEMINI)
// ==========================================
function setAiPrompt(text) {
  document.getElementById('ai-prompt-input').value = text.trim();
}

async function submitAiRecommendation() {
  const promptInput = document.getElementById('ai-prompt-input');
  const prompt = promptInput.value.trim();
  if (prompt.length < 3) {
    showToast('Tuliskan deskripsi atau suasana film yang ingin kamu cari (min. 3 karakter)', 'warning');
    return;
  }

  const btn = document.getElementById('btn-submit-ai');
  const resultContainer = document.getElementById('ai-result-container');

  btn.disabled = true;
  btn.innerHTML = `<div class="animate-spin w-4 h-4 border-2 border-black border-t-transparent rounded-full"></div> Analyzing...`;

  try {
    // POST /api/movies/recommend  { prompt }  ->  { movie_id, reasoning }
    const response = await apiFetch('/movies/recommend', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });

    await renderAiRecommendation(response.data || response);
    resultContainer.classList.remove('hidden');
    showToast('Gemini berhasil menemukan film yang cocok! ✨', 'success');
  } catch (err) {
    showToast(`AI Recommendation Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i> Ask AI`;
    lucide.createIcons();
  }
}

async function renderAiRecommendation(data) {
  const container = document.getElementById('ai-result-container');
  const movieId = data.movie_id;

  // Backend hanya membalas movie_id + reasoning, jadi detail film diambil dari katalog / GET /movies/:id.
  let movie = findMovie(movieId);
  if (!movie && movieId) {
    try {
      const remote = await apiFetch(`/movies/${movieId}`);
      movie = remote.data || remote;
    } catch (err) { /* tampilkan reasoning saja */ }
  }
  movie = movie || { id: movieId, title: `Movie #${movieId}` };

  const reasoning = data.reasoning || 'Film ini dipilih berdasarkan kecocokan tema, plot, dan atmosfer yang kamu minta.';

  container.innerHTML = `
    <div class="bg-gradient-to-br from-brand-surface via-brand-card to-brand-surface p-6 sm:p-8 rounded-2xl border-2 border-brand-green/40 shadow-2xl relative overflow-hidden">
      <div class="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
        <i data-lucide="sparkles" class="w-32 h-32 text-brand-green"></i>
      </div>

      <div class="relative z-10">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-green/20 text-brand-green text-xs font-bold mb-4 border border-brand-green/40">
          ✨ Rekomendasi Terpilih dari Database Anda
        </div>

        <div class="flex flex-col sm:flex-row gap-6 items-start">
          <img src="${posterOf(movie)}" alt="${esc(movie.title)}" onerror="${POSTER_ONERROR}" class="w-36 sm:w-44 aspect-[2/3] object-cover rounded-xl border border-brand-border shadow-xl shrink-0" />

          <div class="flex-1 space-y-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-amber-400">★ ${esc(movie.rating ?? 'N/A')}</span>
                <span class="text-xs text-brand-muted">• ${esc(movie.year || '')}</span>
              </div>
              <h3 class="text-2xl font-black text-white hover:text-brand-green cursor-pointer" onclick="openMovieDetail(${Number(movie.id)})">${esc(movie.title)}</h3>
              <p class="text-xs text-brand-muted">Directed by ${esc(movie.director || 'Unknown')}</p>
            </div>

            <div class="bg-brand-dark/70 border border-brand-border/60 rounded-xl p-4 space-y-1.5">
              <span class="text-xs font-bold text-brand-green flex items-center gap-1.5">
                <i data-lucide="bot" class="w-3.5 h-3.5"></i> Alasan Rekomendasi (Gemini Analysis):
              </span>
              <p class="text-xs text-gray-200 leading-relaxed italic">"${esc(reasoning)}"</p>
            </div>

            <div class="pt-2 flex items-center gap-3">
              <button onclick="openMovieDetail(${Number(movie.id)})" class="px-4 py-2 bg-brand-surfaceHover border border-brand-border hover:border-brand-green text-xs font-semibold text-white rounded-xl transition">
                Lihat Detail Lengkap
              </button>
              <button onclick="toggleWatchlist(${Number(movie.id)})" class="px-4 py-2 bg-brand-green text-black text-xs font-bold rounded-xl hover:brightness-110 transition flex items-center gap-1.5">
                <i data-lucide="bookmark" class="w-3.5 h-3.5"></i> Masukkan ke Watchlist
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  lucide.createIcons();
}

// ==========================================
// 10. AUTHENTICATION (LOGIN & REGISTER)
// ==========================================
function renderAuthUI() {
  const container = document.getElementById('auth-container');
  if (!container) return;

  if (state.token && state.user) {
    const name = state.user.username || state.user.email || 'U';
    container.innerHTML = `
      <div class="flex items-center space-x-2">
        <div class="w-8 h-8 rounded-full bg-brand-border flex items-center justify-center font-bold text-xs text-white uppercase border border-brand-border">
          ${esc(name[0])}
        </div>
        <span class="text-xs font-semibold text-white hidden sm:inline">${esc(name)}</span>
        <button onclick="logout()" title="Logout" class="p-1.5 rounded-lg text-brand-muted hover:text-rose-400 hover:bg-rose-950/20 transition">
          <i data-lucide="log-out" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="flex items-center space-x-2">
        <button onclick="openAuthModal('login')" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:bg-brand-surfaceHover transition">
          Login
        </button>
        <button onclick="openAuthModal('register')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-green text-black hover:brightness-110 transition">
          Register
        </button>
      </div>
    `;
  }
  lucide.createIcons();
}

function openAuthModal(mode = 'login') {
  setAuthMode(mode);
  const modal = document.getElementById('auth-modal');
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

function setAuthMode(mode) {
  state.authMode = mode;
  const usernameField = document.getElementById('field-username-container');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('auth-submit-btn');
  const tabLogin = document.getElementById('auth-tab-login');
  const tabRegister = document.getElementById('auth-tab-register');
  const errorMsg = document.getElementById('auth-error-msg');
  errorMsg.classList.add('hidden');

  if (mode === 'register') {
    usernameField.classList.remove('hidden');
    usernameInput.required = true;      // backend: required, 3-50, alpha_dash, unique
    passwordInput.minLength = 8;        // backend: min 8
    submitBtn.textContent = 'Create Account';
    tabRegister.className = 'font-bold text-lg text-white border-b-2 border-brand-green pb-1';
    tabLogin.className = 'font-medium text-lg text-brand-muted hover:text-white pb-1';
  } else {
    usernameField.classList.add('hidden');
    usernameInput.required = false;
    passwordInput.removeAttribute('minlength');
    submitBtn.textContent = 'Sign In';
    tabLogin.className = 'font-bold text-lg text-white border-b-2 border-brand-green pb-1';
    tabRegister.className = 'font-medium text-lg text-brand-muted hover:text-white pb-1';
  }
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('filmlog_token', token);
  localStorage.setItem('filmlog_user', JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  state.watchlist = [];
  state.watchedList = [];
  localStorage.removeItem('filmlog_token');
  localStorage.removeItem('filmlog_user');
  updateWatchlistBadge();
  renderWatchlistGrid();
  renderWatchedList();
  renderAuthUI();
  if (state.filteredMovies.length) renderMovieGrid();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const username = document.getElementById('auth-username').value.trim();
  const errorEl = document.getElementById('auth-error-msg');
  const submitBtn = document.getElementById('auth-submit-btn');
  const isRegister = state.authMode === 'register';

  errorEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';

  try {
    // Register: { username, email, password } -> 201 { token, user }
    // Login:    { email, password }            -> 200 { token, user }
    const data = await apiFetch(isRegister ? '/auth/register' : '/auth/login', {
      method: 'POST',
      body: JSON.stringify(isRegister ? { username, email, password } : { email, password })
    });

    if (!data.token) throw new ApiError('Respons backend tidak berisi token.', 500);

    saveSession(data.token, data.user || { email, username });
    showToast(`Berhasil masuk sebagai ${state.user.username || state.user.email}! 👋`, 'success');
    document.getElementById('auth-form').reset();
    closeAuthModal();
    renderAuthUI();
    loadWatchlist();
    loadWatchedList();
  } catch (err) {
    errorEl.textContent = err.message; // pesan validasi Laravel dipisah per baris
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isRegister ? 'Create Account' : 'Sign In';
  }
}

function handleSessionExpired() {
  if (!state.token) return; // sudah dibersihkan oleh request lain
  clearSession();
  if (state.currentTab === 'watchlist' || state.currentTab === 'watched') switchTab('discover');
  showToast('Sesi berakhir, silakan login lagi.', 'warning');
  openAuthModal('login');
}

function logout() {
  clearSession();
  switchTab('discover');
  showToast('Anda telah keluar (Logged out)', 'info');
}

// ==========================================
// 11. API CONFIGURATION MODAL
// ==========================================
function openApiConfigModal() {
  const modal = document.getElementById('api-config-modal');
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeApiConfigModal() {
  const modal = document.getElementById('api-config-modal');
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

function setApiUrlPreset(url) {
  document.getElementById('api-base-url-input').value = url;
}

function saveApiBaseUrl() {
  const input = document.getElementById('api-base-url-input');
  let val = input.value.trim().replace(/\/$/, '');
  if (!val.startsWith('http://') && !val.startsWith('https://')) {
    val = 'http://' + val;
  }
  state.apiBaseUrl = val;
  localStorage.setItem('filmlog_api_url', val);
  updateApiUrlDisplay();
  closeApiConfigModal();
  showToast(`API URL diubah ke: ${val}`, 'success');

  // Reset filter & katalog karena backend berganti.
  state.catalog = [];
  state.selectedGenre = 'ALL';
  state.searchQuery = '';
  document.getElementById('movie-search').value = '';
  loadDiscoverMovies();
  if (state.token) {
    loadWatchlist();
    loadWatchedList();
  }
}

// ==========================================
// 12. TOAST NOTIFICATIONS
// ==========================================
let toastTimeout = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msg = document.getElementById('toast-message');

  const icons = { success: '🟢', error: '🔴', warning: '🟡', info: '🔵' };

  icon.textContent = icons[type] || '🔵';
  msg.textContent = message;

  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3500);
}