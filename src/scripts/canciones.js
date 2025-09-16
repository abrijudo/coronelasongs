import { supabase } from '@db/supabase.js';

export function initCanciones() {
  const ALL = "__ALL__";

  // --- Silenciar warning robustness ---
  const nativeWarn = console.warn;
  console.warn = function (...args) {
    if (typeof args[0] === "string" && args[0].includes("robustness level")) return;
    nativeWarn.apply(console, args);
  };

  // --- Helpers ---
  function extractSpotifyTrackId(url) {
    if (!url || typeof url !== "string") return null;
    const clean = url.trim();
    const m =
      clean.match(/\/track\/([a-zA-Z0-9]+)(?:[?#].*)?$/) ||
      clean.match(/spotify:track:([a-zA-Z0-9]+)/);
    return m ? m[1] : null;
  }

  function normalizeSpotifyUrl(url) {
    const id = extractSpotifyTrackId(url);
    return id ? `https://open.spotify.com/track/${id}` : String(url || "").trim();
  }

  // 👇 Nueva función: asegura que siempre hay un token válido
  async function fetchSpotifyToken() {
    const res = await fetch("/api/spotify-token");
    if (!res.ok) {
      window.showSpotifyBanner?.("❌ Error obteniendo token de Spotify", "error");
      return null;
    }
    const { token, error } = await res.json();
    if (!token) {
      window.showSpotifyBanner?.("❌ Tu sesión de Spotify ha caducado. Vuelve a iniciar sesión.", "error");
      window.location.href = "/api/login";
      return null;
    }
    return token;
  }

  let allSongs = [];
  const byType = new Map();
  let types = [];

  let currentPool = [];
  let playlist = [];
  let currentIndex = 0;

  const iframe   = document.getElementById("spotify-iframe");
  const prevBtn  = document.getElementById("prevBtn");
  const nextBtn  = document.getElementById("nextBtn");
  const selectEl = document.getElementById("cancion-select");
  const randBtn  = document.getElementById("randBtn");
  const randIn   = document.getElementById("rand-count");
  const counterEl = document.getElementById("song-counter");

  async function resetPulsador() {
    try {
      await supabase
        .from("pulsador")
        .update({ activado: false, fallado: false })
        .not("id", "is", null);
    } catch (err) {
      console.error("Error al resetear pulsador:", err);
    }
  }

  function pickN(arr, n) {
    const a = arr.slice();
    n = Math.min(n, a.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (a.length - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  }

  function syncButtons() {
    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= playlist.length - 1;
  }

  function updateCounter() {
    if (!counterEl) return;
    if (!playlist.length) {
      counterEl.textContent = "0 de 0";
    } else {
      counterEl.textContent = `${currentIndex + 1} de ${playlist.length}`;
    }
  }

  async function loadTrack(i) {
    if (!playlist[i]) return;

    // 🔄 Antes de poner la canción, revisamos token válido
    const token = await fetchSpotifyToken();
    if (!token) return;

    iframe.src = `https://open.spotify.com/embed/track/${playlist[i].id}?utm_source=generator`;
    currentIndex = i;
    syncButtons();
    updateCounter();
    await resetPulsador();
  }

  function setPlaylist(list) {
    playlist = list;
    currentIndex = 0;
    if (playlist.length) loadTrack(0);
    else {
      iframe.src = "";
      updateCounter();
    }
  }

  async function initData() {
    let from = 0, pageSize = 500;
    let rows = [], finished = false;

    while (!finished) {
      const { data, error } = await supabase
        .from("musica")
        .select("url, tipo, reproducir")
        .eq("reproducir", true)
        .range(from, from + pageSize - 1);

      if (error) { console.error(error); break; }
      if (!data || !data.length) { finished = true; break; }

      rows = rows.concat(data);
      if (data.length < pageSize) finished = true;
      from += pageSize;
    }

    console.log("✅ Total canciones cargadas:", rows.length);

    allSongs = [];
    byType.clear();

    for (const row of rows) {
      const cleanUrl = normalizeSpotifyUrl(row.url);
      const id = extractSpotifyTrackId(cleanUrl);
      if (!id) continue;

      const tipo = row.tipo || "Otros";
      const song = { id, tipo, url: cleanUrl };

      allSongs.push(song);
      if (!byType.has(tipo)) byType.set(tipo, []);
      byType.get(tipo).push(song);
    }

    types = Array.from(byType.keys()).sort();

    selectEl.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = ALL;
    optAll.textContent = "Todos";
    selectEl.appendChild(optAll);

    for (const t of types) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      selectEl.appendChild(opt);
    }

    currentPool = allSongs;
    setPlaylist(currentPool);
  }

  // --- eventos ---
  nextBtn?.addEventListener("click", () => {
    if (currentIndex < playlist.length - 1) loadTrack(currentIndex + 1);
  });

  prevBtn?.addEventListener("click", () => {
    if (currentIndex > 0) loadTrack(currentIndex - 1);
  });

  selectEl?.addEventListener("change", () => {
    const filtro = selectEl.value || ALL;
    if (filtro === ALL) {
      const seen = new Set();
      currentPool = allSongs.filter(song => {
        if (seen.has(song.url)) return false;
        seen.add(song.url);
        return true;
      });
    } else {
      currentPool = byType.get(filtro) || [];
    }
    setPlaylist(currentPool);
  });

  randBtn?.addEventListener("click", () => {
    let n = parseInt(randIn.value, 10);
    if (!Number.isFinite(n) || n <= 0) n = 1;
    const list = pickN(currentPool, n);
    setPlaylist(list);
  });

  initData();
}
