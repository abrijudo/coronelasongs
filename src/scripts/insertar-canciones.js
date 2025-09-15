import { supabase } from "@db/supabase.js";

/* -------- Helpers -------- */

// Extraer el ID del track de cualquier formato de URL Spotify
function extractSpotifyTrackId(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  const patterns = [
    // https://open.spotify.com/intl-es/track/7bAX...?si=...
    /open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/([a-zA-Z0-9]+)/,
    // https://open.spotify.com/embed/track/7bAX...
    /open\.spotify\.com\/embed\/track\/([a-zA-Z0-9]+)/,
    // spotify:track:7bAX...
    /spotify:track:([a-zA-Z0-9]+)/,
    // Solo el ID (22 chars)
    /^([a-zA-Z0-9]{22})$/
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

// Normaliza cualquier enlace a formato canónico
function normalizeSpotifyUrl(url) {
  const id = extractSpotifyTrackId(url);
  return id ? `https://open.spotify.com/track/${id}` : String(url || "").trim();
}

async function fetchSpotifyToken() {
  const res = await fetch("/api/spotify-token");
  if (!res.ok) return null;
  const { token } = await res.json();
  return token || null;
}

async function fetchPlaylistTracks(playlistId, token) {
  let offset = 0;
  const items = [];
  while (true) {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Spotify API error");
    const data = await res.json();

    for (const it of data.items || []) {
      if (it && it.track) items.push(it.track);
    }

    if (data.next) offset += 100;
    else break;
  }
  return items;
}

function chunk(arr, n) {
  return arr.length ? [arr.slice(0, n), ...chunk(arr.slice(n), n)] : [];
}

/* -------- Main init -------- */

export async function initInsertarCanciones() {
  const formCancion   = document.getElementById("cancion-form");
  const formPlaylist  = document.getElementById("playlist-form");

  /* ---- Insertar UNA canción ---- */
  formCancion?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombre = document.getElementById("nombre")?.value?.trim() || "";
    const tipo   = document.getElementById("tipo")?.value?.trim() || "";
    const rawUrl = document.getElementById("url")?.value?.trim() || "";
    const url    = normalizeSpotifyUrl(rawUrl);

    if (!nombre || !tipo || !url) {
      alert("❌ Todos los campos son obligatorios");
      return;
    }

    try {
      // 🔍 Verificar si ya existe con ese tipo + url
      const { data: exists, error: checkError } = await supabase
        .from("musica")
        .select("id")
        .eq("url", url)
        .eq("tipo", tipo)
        .maybeSingle();

      if (checkError) throw checkError;

      if (exists) {
        alert("⚠️ Esa canción ya está registrada en este género.");
        return;
      }

      // ✅ Insertar nueva
      const { error } = await supabase.from("musica").insert([{
        nombre, tipo, url, reproducir: true
      }]);
      if (error) throw error;

      alert("✅ Canción insertada correctamente");
      formCancion.reset();
    } catch (err) {
      console.error(err);
      alert("❌ Error al insertar la canción.");
    }
  });

  /* ---- Insertar PLAYLIST completa ---- */
  formPlaylist?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const urlInput  = document.getElementById("playlist-url");
    const tipoInput = document.getElementById("playlist-tipo");

    const playlistUrl = urlInput?.value?.trim() || "";
    const tipo        = tipoInput?.value?.trim() || "";

    if (!playlistUrl || !tipo) {
      alert("❌ Todos los campos son obligatorios");
      return;
    }

    // Extraer playlistId
    const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)(?:[?#].*)?$/);
    if (!match) {
      alert("❌ URL de playlist no válida");
      return;
    }
    const playlistId = match[1];

    try {
      // 1) Token
      const token = await fetchSpotifyToken();
      if (!token) {
        alert("❌ No hay token de Spotify. Inicia sesión primero.");
        return;
      }

      // 2) Traer canciones
      const tracks = await fetchPlaylistTracks(playlistId, token);

      // 3) Mapear con nombre + artistas y normalizar URL
      const mapped = [];
      for (const t of tracks) {
        const name = t?.name?.trim();
        const artists = Array.isArray(t?.artists) ? t.artists.map(a => a?.name).filter(Boolean).join(", ") : "";
        const extUrl = normalizeSpotifyUrl(t?.external_urls?.spotify);
        if (!name || !extUrl) continue;

        mapped.push({
          nombre: `${name} - ${artists}`,
          url: extUrl,
          tipo,
          reproducir: true
        });
      }

      if (!mapped.length) {
        alert("⚠️ No se encontraron canciones válidas en la playlist.");
        return;
      }

      // 4) Quitar duplicados internos (misma playlist)
      const seen = new Set();
      const uniqueByUrl = [];
      for (const s of mapped) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        uniqueByUrl.push(s);
      }

      // 5) Evitar duplicados ya existentes en DB (por tipo + url)
      const urls = uniqueByUrl.map(s => s.url);
      const chunks = chunk(urls, 500);

      const existingUrls = new Set();
      for (const part of chunks) {
        const { data, error } = await supabase
          .from("musica")
          .select("url")
          .eq("tipo", tipo)
          .in("url", part);
        if (error) throw error;
        for (const r of (data || [])) existingUrls.add(r.url);
      }

      const toInsert = uniqueByUrl.filter(s => !existingUrls.has(s.url));

      if (!toInsert.length) {
        alert("⚠️ Todas las canciones de esta playlist ya estaban guardadas en ese género.");
        return;
      }

      // 6) Insertar en lotes
      const insertChunks = chunk(toInsert, 500);
      for (const part of insertChunks) {
        const { error } = await supabase.from("musica").insert(part);
        if (error) throw error;
      }

      alert(`✅ Insertadas ${toInsert.length} canciones (descartadas ${uniqueByUrl.length - toInsert.length} duplicadas).`);
      formPlaylist.reset();
    } catch (err) {
      console.error(err);
      alert("❌ Error al importar la playlist.");
    }
  });
}
