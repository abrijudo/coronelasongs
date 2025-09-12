// Cliente: toggles en tiempo real para la tabla `pulsador`
import { supabase } from "@db/supabase.js";

const $container = document.getElementById('playersContainer');
const $loading = document.getElementById('loading');

let channel;

async function render() {
  if (!$container) return;

  $loading.hidden = false;
  $container.hidden = true;

  const { data, error } = await supabase
    .from('pulsador')
    .select('id, usuario, activado')
    .order('usuario', { ascending: true });

  $loading.hidden = true;

  if (error) {
    console.error(error);
    $container.innerHTML = '<p class="error">❌ Error al cargar datos.</p>';
    $container.hidden = false;
    return;
  }

  if (!data || data.length === 0) {
    $container.innerHTML = '<p class="empty">No hay jugadores registrados.</p>';
    $container.hidden = false;
    return;
  }

  $container.innerHTML = data.map(row => `
    <div class="player-item" data-id="${row.id}">
      <span class="player-name">${row.usuario ?? '(sin nombre)'}</span>
      <label style="display:inline-flex;align-items:center;gap:10px">
        <input type="checkbox" ${row.activado ? 'checked' : ''} aria-label="Estado de ${row.usuario}">
        <span class="switch"></span>
      </label>
    </div>
  `).join('');

  $container.querySelectorAll('.player-item input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', async (e) => {
      const wrapper = e.currentTarget.closest('.player-item');
      const id = wrapper.dataset.id;
      const nuevo = e.currentTarget.checked;

      const { error: upErr } = await supabase
        .from('pulsador')
        .update({ activado: nuevo })
        .eq('id', id);

      if (upErr) {
        console.error(upErr);
        e.currentTarget.checked = !nuevo;
        alert('❌ No se pudo actualizar. Inténtalo de nuevo.');
      }
    });
  });

  $container.hidden = false;
}

function startRealtime() {
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel('pulsador-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pulsador' }, () => render())
    .subscribe();
}

render();
startRealtime();

window.addEventListener('beforeunload', () => { if (channel) supabase.removeChannel(channel); });
