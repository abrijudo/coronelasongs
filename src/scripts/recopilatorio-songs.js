import { supabase } from "@db/supabase.js";

export async function initRecopilatorioSongs() {


const $body     = document.getElementById('songsBody');
const $loading  = document.getElementById('loading');
const $refresh  = document.getElementById('refreshBtn');
const $status   = document.getElementById('status');
const $genreSel = document.getElementById('genreSelect');

/* NUEVO: paginación */
const pageSize = 10;
let page = 1;          // página actual (1-based)
let pages = 1;         // total de páginas
let total = 0;         // total de filas (según filtro)

const $prev = document.getElementById('prevPage');
const $next = document.getElementById('nextPage');
const $pageInfo = document.getElementById('pageInfo');

let channel = null;
let currentGenre = '__ALL__';

const setStatus = (msg) => { if ($status) $status.textContent = msg ?? ""; };

/* ----------- Cargar géneros dinámicamente ----------- */
async function loadGenres() {
  const { data, error } = await supabase
    .from('musica')
    .select('tipo')
    .not('tipo', 'is', null);

  if (error) { console.error('Error cargando géneros:', error); return; }

  const uniques = Array.from(new Set((data ?? [])
    .map(r => (r.tipo ?? '').trim())
    .filter(Boolean))).sort();

  const prev = currentGenre;
  $genreSel.innerHTML = `<option value="__ALL__">Todos</option>` + uniques
    .map(t => `<option value="${t}">${t}</option>`).join('');

  const hasPrev = prev === '__ALL__' || uniques.includes(prev);
  $genreSel.value = hasPrev ? prev : '__ALL__';
  currentGenre = $genreSel.value;
}

/* ----------- Cargar con paginación ----------- */
function updatePager(){
  pages = Math.max(1, Math.ceil(total / pageSize));
  if (page > pages) page = pages;

  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to   = Math.min(page * pageSize, total);
  $pageInfo.textContent = `Página ${page} / ${pages} • ${from}-${to} de ${total}`;

  $prev.disabled = page <= 1;
  $next.disabled = page >= pages;

  const label = currentGenre === '__ALL__' ? 'todos' : currentGenre;
  setStatus(`${total} canciones (${label}) — mostrando ${from}-${to}`);
}

async function load() {
  $loading.hidden = false;
  setStatus("Cargando canciones…");

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let query = supabase
    .from('musica')
    .select('id, nombre, tipo, url, reproducir', { count: 'exact' })
    .order('id', { ascending: true })
    .range(from, to);

  if (currentGenre !== '__ALL__') query = query.eq('tipo', currentGenre);

  const { data, error, count } = await query;

  $loading.hidden = true;

  if (error) {
    console.error(error);
    $body.innerHTML = `<tr><td colspan="5">❌ Error: ${error.message}</td></tr>`;
    setStatus("Error al cargar.");
    return;
  }

  total = count ?? 0;
  renderRows(data || []);
  updatePager();
}

function renderRows(rows){
  $body.innerHTML = rows.map(row => `
    <tr data-id="${row.id}">
      <td class="center">${row.id}</td>
      <td title="${row.nombre ?? ''}">${row.nombre ?? ''}</td>
      <td>${row.tipo ?? ''}</td>
      <td class="center">
        <label class="switch-wrap" aria-label="Marcar reproducción para ${row.nombre ?? 'canción'}">
          <input type="checkbox" ${row.reproducir ? 'checked' : ''}>
          <span class="switch"></span>
        </label>
      </td>
      <td class="center">
        ${row.url ? `<a href="${row.url}" target="_blank" rel="noopener noreferrer">Abrir</a>` : '-'}
      </td>
    </tr>
  `).join('');

  // Toggle listeners
  $body.querySelectorAll('tr').forEach(tr => {
    const input = tr.querySelector('input[type="checkbox"]');
    input?.addEventListener('change', async (e) => {
      const id = tr.getAttribute('data-id');
      const nuevo = e.currentTarget.checked;

      setStatus('Guardando…');
      const { error } = await supabase
        .from('musica')
        .update({ reproducir: nuevo })
        .eq('id', id);

      if (error) {
        console.error(error);
        alert('No se pudo actualizar: ' + error.message);
        e.currentTarget.checked = !nuevo; // revertir
        setStatus('Error guardando cambios');
      } else {
        setStatus('Cambios guardados');
      }
    });
  });
}

/* ----------- Realtime ----------- */
function startRealtime(){
  if(channel) supabase.removeChannel(channel);
  channel = supabase
    .channel('musica-realtime')
    .on('postgres_changes', { event:'*', schema:'public', table:'musica' }, async () => {
      await loadGenres();     // por si aparecen géneros nuevos
      await load();           // se mantiene la página actual
    })
    .subscribe();
}

/* ----------- Eventos UI ----------- */
$refresh?.addEventListener('click', load);

$genreSel?.addEventListener('change', async (e) => {
  currentGenre = e.target.value;
  page = 1;                  // volver a la primera al cambiar filtro
  await load();
});

$prev?.addEventListener('click', () => { if (page > 1)  { page--; load(); }});
$next?.addEventListener('click', () => { if (page < pages) { page++; load(); }});

/* ----------- Init ----------- */
await loadGenres();
await load();
startRealtime();

window.addEventListener('beforeunload', () => {
  if (channel) supabase.removeChannel(channel);
});
}
