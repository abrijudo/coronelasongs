import { supabase } from "@db/supabase.js";

export async function initPulsador() {
  const $listOn   = document.getElementById("listOn");
  const $listOff  = document.getElementById("listOff");
  const $countOn  = document.getElementById("countOn");
  const $countOff = document.getElementById("countOff");
  const $resetBtn = document.getElementById("resetBtn");
  const $scoreBody = document.getElementById("scoreBody");
  const $turnName  = document.querySelector("[data-turn-name]");

  async function cargarListas() {
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, jugando, created_at")
      .eq("jugando", true)
      .order("created_at", { ascending: true });

    if (error) return console.error(error);

    let on = 0, off = 0;
    $listOn.innerHTML = "";
    $listOff.innerHTML = "";

    (data || []).forEach(r => {
      const p = document.createElement("p");
      p.textContent = r.usuario ?? "(sin nombre)";
      if (r.activado) { 
        $listOn.appendChild(p); 
        on++; 
      } else { 
        $listOff.appendChild(p); 
        off++; 
      }
    });

    $countOn.textContent  = String(on);
    $countOff.textContent = String(off);

    // Turno: el primero activado por created_at
    const actual = (data || []).find(r => r.activado);
    if ($turnName) $turnName.textContent = actual?.usuario || "—";

    // Timer sincronizado
    if (actual?.usuario && actual?.created_at) {
      window.startTimer(actual.usuario, actual.created_at);
    } else {
      window.stopTimer();
    }
  }

  async function cargarMarcador() {
    const { data, error } = await supabase
      .from("marcador")
      .select("jugador, puntos")
      .order("puntos", { ascending: false });
    if (error) return console.error(error);

    $scoreBody.innerHTML = data?.map(r =>
      `<tr><td>${r.jugador}</td><td>${r.puntos ?? 0}</td></tr>`
    ).join("") || `<tr><td colspan="2" class="empty">Sin jugadores</td></tr>`;
  }

  async function resetear() {
    await supabase.from("pulsador").update({ activado: false }).not("id","is",null);
    cargarListas();
  }
  $resetBtn?.addEventListener("click", resetear);

  // Realtime
  supabase.channel("pulsador-live")
    .on("postgres_changes", { event:"*", schema:"public", table:"pulsador" }, cargarListas)
    .subscribe();

  supabase.channel("marcador-live")
    .on("postgres_changes", { event:"*", schema:"public", table:"marcador" }, cargarMarcador)
    .subscribe();

  // Init
  await Promise.all([cargarListas(), cargarMarcador()]);
}
