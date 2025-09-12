import { supabase } from "@db/supabase.js";

export function initCancionesSDK() {
  const ALL = "__ALL__";
  let allSongs = [];
  const byType = new Map();
  let currentPool = [];
  let playlist = [];
  let currentIndex = 0;

  let player; // Spotify Web Playback SDK
  let deviceId;

  // DOM
  const selectEl = document.getElementById("cancion-select");
  const randBtn = document.getElementById("randBtn");
  const randIn = document.getElementById("rand-count");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const playBtn = document.getElementById("playBtn");
  const trackLabel = document.getElementById("current-track");

  function pickN(arr, n) {
    const a = arr.slice();
    n = Math.min(n, a.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (a.length - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
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

    for (const row of data || []) {
      const match = row.url.match(/\/track\/([a-zA-Z0-9]+)/);
      if (!match) continue;
      const id = match[1];
      const tipo = row.tipo || "Otros";
      const song = { id, tipo, url: row.url };
      allSongs.push(song);
      if (!byType.has(tipo)) byType.set(tipo, []);
      byType.get(tipo).push(song);
    }

    for (const t of Array.from(byType.keys()).sort()) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      selectEl.appendChild(opt);
    }

    currentPool = allSongs;
    playlist = currentPool;
  }

  async function playTrack(id) {
    if (!deviceId) {
      alert("⚠️ No hay dispositivo activo de Spotify");
      return;
    }

    const token = localStorage.getItem("spotify_token"); // ⚠️ Necesitas OAuth
    if (!token) {
      alert("Debes autenticarte con Spotify primero.");
      return;
    }

    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: "PUT",
      body: JSON.stringify({ uris: [`spotify:track:${id}`] }),
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });

    const song = playlist[currentIndex];
    trackLabel.textContent = `▶️ Reproduciendo: ${song?.id || ""}`;
  }

  function loadTrack(i) {
    if (!playlist[i]) return;
    currentIndex = i;
    playTrack(playlist[i].id);
  }

  window.onSpotifyWebPlaybackSDKReady = () => {
    const token = localStorage.getItem("spotify_token"); // ⚠️ Poner aquí el token OAuth
    if (!token) {
      alert("Falta token de Spotify. Haz login.");
      return;
    }

    player = new Spotify.Player({
      name: "Mi Reproductor Web",
      getOAuthToken: cb => { cb(token); },
      volume: 0.5,
    });

    player.addListener("ready", ({ device_id }) => {
      console.log("Dispositivo listo:", device_id);
      deviceId = device_id;
    });

    player.connect();
  };

  // Eventos UI
  nextBtn.addEventListener("click", () => {
    if (currentIndex < playlist.length - 1) loadTrack(currentIndex + 1);
  });
  prevBtn.addEventListener("click", () => {
    if (currentIndex > 0) loadTrack(currentIndex - 1);
  });
  playBtn.addEventListener("click", () => {
    player.togglePlay();
  });

  selectEl.addEventListener("change", () => {
    const filtro = selectEl.value || ALL;
    currentPool = (filtro === ALL) ? allSongs : (byType.get(filtro) || []);
    playlist = currentPool;
    currentIndex = 0;
    loadTrack(0);
  });

  randBtn.addEventListener("click", () => {
    let n = parseInt(randIn.value, 10);
    if (!Number.isFinite(n) || n <= 0) n = 1;
    playlist = pickN(currentPool, n);
    currentIndex = 0;
    loadTrack(0);
  });

  initData();
}
