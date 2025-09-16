import { supabase } from "@db/supabase.js";

/* -------- Helpers -------- */
function extractSpotifyTrackId(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const patterns = [
    /open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/([a-zA-Z0-9]+)/,
    /open\.spotify\.com\/embed\/track\/([a-zA-Z0-9]+)/,
    /spotify:track:([a-zA-Z0-9]+)/,
    /^([a-zA-Z0-9]{22})$/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}
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

// 👇 función para mostrar un banner arriba
function showBanner(msg, type = "success") {
  let banner = document.getElementById("spotify-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "spotify-banner";
    document.body.appendChild(banner);
  }
  banner.className = type; // success o error
  banner.textContent = msg;

  setTimeout(() => banner.remove(), 4000);
}


async function fetchPlaylistTracks(playlistId, token) {
  let offset = 0;
  const items = [];
  let skipped = 0;

  while (true) {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&offset=${offset}`;
    let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 401) {
      // 👇 intentar renovar token
      const refreshRes = await fetch("/api/spotify-token");
      const refreshData = await refreshRes.json();

      if (refreshData?.token) {
        token = refreshData.token;
        showBanner("🔄 Sesión de Spotify renovada automáticamente");
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        showBanner("❌ Tu sesión de Spotify ha caducado. Inicia sesión de nuevo.", "error");
        window.location.href = "/api/login";
        return [];
      }
    }

    if (!res.ok) throw new Error("Spotify API error");
    const data = await res.json();

    for (const it of data.items || []) {
      if (it && it.track) items.push(it.track);
      else skipped++;
    }

    if (data.next) offset += 100;
    else break;
  }

  console.log(`✅ Recuperados ${items.length} tracks válidos`);
  if (skipped) console.log(`⚠️ ${skipped} tracks se omitieron`);
  return items;
}

function chunk(arr, n) {
  return arr.length ? [arr.slice(0, n), ...chunk(arr.slice(n), n)] : [];
}

/* -------- Main init -------- */
export async function initInsertarCanciones() {
  const formCancion   = document.getElementById("cancion-form");
  const formPlaylist  = document.getElementById("playlist-form");
  const formDelete    = document.getElementById("delete-form");
  const selectDelete  = document.getElementById("delete-tipo");

  /* ---- Rellenar géneros en el select de eliminación ---- */
  async function cargarGeneros() {
    try {
      const { data, error } = await supabase
        .from("musica")
        .select("tipo")
        .neq("tipo", null);

      if (error) throw error;

      const uniqueTipos = [...new Set(data.map(d => d.tipo))].sort();
      selectDelete.innerHTML = `<option value="">-- Selecciona un género --</option>`;
      uniqueTipos.forEach(tipo => {
        const opt = document.createElement("option");
        opt.value = tipo;
        opt.textContent = tipo;
        selectDelete.appendChild(opt);
      });
    } catch (err) {
      console.error("Error cargando géneros:", err);
    }
  }
  cargarGeneros();

  /* ---- Insertar UNA canción ---- */
  formCancion?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("nombre")?.value?.trim() || "";
    const tipo   = document.getElementById("tipo")?.value?.trim() || "";
    const rawUrl = document.getElementById("url")?.value?.trim() || "";
    const url    = normalizeSpotifyUrl(rawUrl);
    if (!nombre || !tipo || !url) return alert("❌ Todos los campos son obligatorios");

    try {
      const { data: exists } = await supabase
        .from("musica")
        .select("id")
        .eq("url", url)
        .eq("tipo", tipo)
        .maybeSingle();

      if (exists) return alert("⚠️ Esa canción ya está registrada en este género.");

      const { error } = await supabase.from("musica").insert([{ nombre, tipo, url, reproducir: true }]);
      if (error) throw error;
      alert("✅ Canción insertada correctamente");
      formCancion.reset();
      cargarGeneros();
    } catch (err) {
      console.error(err);
      alert("❌ Error al insertar la canción.");
    }
  });

  /* ---- Insertar PLAYLIST completa ---- */
  formPlaylist?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const urlInput  = document.getElementById("playlist-url")?.value?.trim() || "";
    const tipo      = document.getElementById("playlist-tipo")?.value?.trim() || "";
    if (!urlInput || !tipo) return alert("❌ Todos los campos son obligatorios");

    const match = urlInput.match(/playlist\/([a-zA-Z0-9]+)(?:[?#].*)?$/);
    if (!match) return alert("❌ URL de playlist no válida");
    const playlistId = match[1];

    try {
      let token = await fetchSpotifyToken();
      if (!token) return alert("❌ No hay token de Spotify. Inicia sesión primero.");

      const tracks = await fetchPlaylistTracks(playlistId, token);

      const mapped = tracks.map(t => {
        const name = t?.name?.trim();
        const artists = Array.isArray(t?.artists) ? t.artists.map(a => a?.name).filter(Boolean).join(", ") : "";
        const extUrl = normalizeSpotifyUrl(t?.external_urls?.spotify);
        if (!name || !extUrl) return null;
        return { nombre: `${name} - ${artists}`, url: extUrl, tipo, reproducir: true };
      }).filter(Boolean);

      const seen = new Set();
      const uniqueByUrl = mapped.filter(s => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
      });

      const urls = uniqueByUrl.map(s => s.url);
      const chunksUrls = chunk(urls, 500);
      const existingUrls = new Set();
      for (const part of chunksUrls) {
        const { data } = await supabase
          .from("musica")
          .select("url")
          .eq("tipo", tipo)
          .in("url", part);
        for (const r of (data || [])) existingUrls.add(r.url);
      }

      const toInsert = uniqueByUrl.filter(s => !existingUrls.has(s.url));
      if (!toInsert.length) return alert("⚠️ Todas las canciones ya estaban guardadas en ese género.");

      for (const part of chunk(toInsert, 500)) {
        const { error } = await supabase.from("musica").insert(part);
        if (error) throw error;
      }

      alert(`✅ Insertadas ${toInsert.length} canciones`);
      formPlaylist.reset();
      cargarGeneros();
    } catch (err) {
      console.error(err);
      alert("❌ Error al importar la playlist.");
    }
  });

  /* ---- Eliminar un GÉNERO completo ---- */
  formDelete?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const tipo = selectDelete.value;
    if (!tipo) return alert("❌ Debes seleccionar un género.");
    if (!confirm(`⚠️ ¿Seguro que quieres eliminar TODAS las canciones del género "${tipo}"?`)) return;

    try {
      const { error } = await supabase.from("musica").delete().eq("tipo", tipo);
      if (error) throw error;
      alert(`✅ Eliminadas todas las canciones del género "${tipo}"`);
      formDelete.reset();
      cargarGeneros();
    } catch (err) {
      console.error(err);
      alert("❌ Error al eliminar el género.");
    }
  });
}
