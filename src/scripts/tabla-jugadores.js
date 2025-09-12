import { supabase } from "@db/supabase.js";

export async function initTablaJugadores() {

  
    const $tbody = document.getElementById('tj-body');
    const $btn   = document.getElementById('tj-refresh');
  
    const fmt = (iso) => {
      try { return iso ? new Date(iso).toLocaleString() : ""; }
      catch { return iso ?? ""; }
    };
  
    // Render de una fila
    const rowHTML = (r) => `
      <tr data-id="${r.id}">
        <td class="mono">${r.id}</td>
        <td class="mono">${fmt(r.created_at)}</td>
        <td>${r.usuario ?? ""}</td>
        <td>${r.rol ?? ""}</td>
        <td><input type="checkbox" ${r.activado ? "checked" : ""} data-k="activado"></td>
        <td><input type="checkbox" ${r.jugando  ? "checked" : ""} data-k="jugando"></td>
      </tr>
    `;
  
    // Inserta manteniendo orden por id asc
    function insertSorted(row) {
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', row.id);
      tr.innerHTML = rowHTML(row).replace(/^<tr[^>]*>|<\/tr>$/g, ''); // solo celdas
  
      const rows = Array.from($tbody.querySelectorAll('tr[data-id]'));
      if (rows.length === 0) {
        $tbody.innerHTML = '';
        $tbody.appendChild(tr);
        return;
      }
      // buscar primera fila con id mayor que el nuevo
      const greater = rows.find(r => Number(r.dataset.id) > row.id);
      if (greater) {
        $tbody.insertBefore(tr, greater);
      } else {
        $tbody.appendChild(tr);
      }
    }
  
    function upsertRow(row) {
      const existing = $tbody.querySelector(`tr[data-id="${row.id}"]`);
      if (existing) {
        existing.outerHTML = rowHTML(row);
      } else {
        insertSorted(row);
      }
    }
  
    function removeRow(id) {
      const tr = $tbody.querySelector(`tr[data-id="${id}"]`);
      if (tr) tr.remove();
      if ($tbody.querySelectorAll('tr[data-id]').length === 0) {
        $tbody.innerHTML = `<tr><td colspan="6" class="tj-center">No hay filas.</td></tr>`;
      }
    }
  
    async function cargar() {
      $tbody.innerHTML = `<tr><td colspan="6" class="tj-center">Cargando…</td></tr>`;
  
      const { data, error } = await supabase
        .from('pulsador')
        .select('id, created_at, usuario, rol, activado, jugando')
        .order('id', { ascending: true });
  
      if (error) {
        console.error(error);
        $tbody.innerHTML = `<tr><td colspan="6" class="tj-center" style="color:#b91c1c;background:#fef2f2;">❌ Error: ${error.message}</td></tr>`;
        return;
      }
  
      if (!data || data.length === 0) {
        $tbody.innerHTML = `<tr><td colspan="6" class="tj-center">No hay filas.</td></tr>`;
        return;
      }
  
      $tbody.innerHTML = data.map(rowHTML).join('');
    }
  
    // Delegación para guardar cambios de checkboxes
    $tbody.addEventListener('change', async (ev) => {
      const input = ev.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') return;
  
      const tr = input.closest('tr[data-id]');
      if (!tr) return;
  
      const id = Number(tr.dataset.id);
      const campo = input.getAttribute('data-k');
      const valor = input.checked;
  
      // Optimista; si falla, revertimos
      const { error: upErr } = await supabase
        .from('pulsador')
        .update({ [campo]: valor })
        .eq('id', id);
  
      if (upErr) {
        console.error(upErr);
        input.checked = !valor;
        alert('❌ No se pudo guardar: ' + upErr.message);
      }
    });
  
    // Botón manual por si lo quieres mantener
    $btn?.addEventListener('click', cargar);
  
    // 1) Carga inicial
    await cargar();
  
    // 2) Suscripción en tiempo real
    const channel = supabase
      .channel('pulsador-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pulsador' },
        (payload) => {
          // payload: { eventType, new, old }
          switch (payload.eventType) {
            case 'INSERT':
              upsertRow(payload.new);
              break;
            case 'UPDATE':
              upsertRow(payload.new);
              break;
            case 'DELETE':
              removeRow(payload.old.id);
              break;
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // console.log('Realtime conectado a pulsador');
        }
      });
  
    // Limpieza (opcional si tu framework reutiliza la vista)
    window.addEventListener('beforeunload', () => {
      supabase.removeChannel(channel);
    });
}
