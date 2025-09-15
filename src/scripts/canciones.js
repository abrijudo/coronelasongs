// Usar ruta relativa para mejor compatibilidad
import { supabase } from '@db/supabase.js';

export function initCanciones() {
  const ALL = "__ALL__";

  // Extraer ID canónico
  function extractSpotifyTrackId(url) {
    if (!url || typeof url !== "string") return null;
    const clean = url.trim();
    const m =
      clean.match(/\/track\/([a-zA-Z0-9]+)(?:[?#].*)?$/) ||
      clean.match(/spotify:track:([a-zA-Z0-9]+)/);
    return m ? m[1] : null;
  }

  // Normaliza URL a formato único
  function normalizeSpotifyUrl(url) {
    const id = extractSpotifyTrackId(url);
    return id ? `https://open.spotify.com/track/${id}` : String(url || "").trim();
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
  const counterEl = document.getElementById("song-counter"); // 👈 marcador

  // ---- reset de pulsador ----
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
    iframe.src = `https://open.spotify.com/embed/track/${playlist[i].id}?utm_source=generator`;
    currentIndex = i;
    syncButtons();
    updateCounter(); // 👈 actualizar marcador
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
    const { data, error } = await supabase
      .from("musica")
      .select("url, tipo, reproducir")
      .eq("reproducir", true);

    if (error) {
      console.error("Supabase:", error);
      return;
    }

    allSongs = [];
    byType.clear();

    const seen = new Set(); // 👈 evitar duplicados por URL

    for (const row of (data || [])) {
      const cleanUrl = normalizeSpotifyUrl(row.url);
      if (seen.has(cleanUrl)) continue; // saltar repetidas
      seen.add(cleanUrl);

      const id = extractSpotifyTrackId(cleanUrl);
      if (!id) continue;

      const tipo = row.tipo || "Otros";
      const song = { id, tipo };
      allSongs.push(song);

      if (!byType.has(tipo)) byType.set(tipo, []);
      byType.get(tipo).push(song);
    }

    types = Array.from(byType.keys()).sort();

    // limpiar opciones previas
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
    currentPool = (filtro === ALL) ? allSongs : (byType.get(filtro) || []);
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
