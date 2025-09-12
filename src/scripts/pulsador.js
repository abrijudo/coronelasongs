import { supabase } from "@db/supabase.js";

export async function initPulsador() {
  const $listOn    = document.getElementById("listOn");
  const $listOff   = document.getElementById("listOff");
  const $countOn   = document.getElementById("countOn");
  const $countOff  = document.getElementById("countOff");
  const $resetBtn  = document.getElementById("resetBtn");
  const $scoreBody = document.getElementById("scoreBody");
  const $turnName  = document.querySelector("[data-turn-name]");

  const $btnAcierto = document.getElementById("btnAcierto");
  const $btnFallado = document.getElementById("btnFallado");

  let currentTurn = null; // nombre del jugador en turno

  /* ---------- helpers marcador ---------- */
  async function cambiarPuntosJugador(nombre, delta) {
    if (!nombre) return;

    const { data: row, error } = await supabase
      .from("marcador")
      .select("id, puntos")
      .eq("jugador", nombre)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[marcador] select", error);
      return;
    }

    if (row) {
      const nuevo = (row.puntos ?? 0) + delta;
      const { error: upErr } = await supabase
        .from("marcador")
        .update({ puntos: nuevo })
        .eq("id", row.id);
      if (upErr) console.error("[marcador] update", upErr);
    } else {
      const { error: insErr } = await supabase
        .from("marcador")
        .insert({
          jugador: nombre,
          puntos: delta,
          created_at: new Date().toISOString(),
        });
      if (insErr) console.error("[marcador] insert", insErr);
    }
  }

  /* ---------- pintar marcador ---------- */
  async function cargarMarcador() {
    const { data, error } = await supabase
      .from("marcador")
      .select("jugador, puntos")
      .order("puntos", { ascending: false })
      .order("jugador", { ascending: true });

    if (error) { console.error("[marcador] list", error); return; }

    $scoreBody.innerHTML = (data && data.length)
      ? data.map(r => `<tr><td>${r.jugador}</td><td>${r.puntos ?? 0}</td></tr>`).join("")
      : `<tr><td class="empty" colspan="2">Sin jugadores aún.</td></tr>`;
  }

  /* ---------- pintar listas + determinar turno ---------- */
  async function cargarListas() {
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, jugando, created_at")
      .eq("jugando", true)
      .order("created_at", { ascending: true }); // Para que el más antiguo activado vaya primero

    if (error) { console.error("[pulsador] list", error); return; }

    let on = 0, off = 0;
    $listOn.innerHTML  = "";
    $listOff.innerHTML = "";

    (data || []).forEach(r => {
      const p = document.createElement("p");
      p.textContent = r.usuario ?? "(sin nombre)";
      if (r.activado) { $listOn.appendChild(p); on++; }
      else            { $listOff.appendChild(p); off++; }
    });

    $countOn.textContent  = String(on);
    $countOff.textContent = String(off);

    // El siguiente en turno es el primer "activado"
    const siguiente = (data || []).find(r => r.activado)?.usuario || null;
    currentTurn = siguiente;
    if ($turnName) $turnName.textContent = currentTurn || "—";

    // Temporizador según haya/no haya turno
    if (currentTurn) {
      if (window.startTimer) window.startTimer(15);
    } else {
      if (window.stopTimer) window.stopTimer();
    }
  }

  /* ---------- acciones ---------- */
  async function resetear() {
    $resetBtn.disabled = true;
    try {
      const { error } = await supabase
        .from("pulsador")
        .update({ activado: false })
        .not("id", "is", null);
      if (error) console.error("[pulsador] reset", error);

      if (window.stopTimer) window.stopTimer();
      await cargarListas();
    } finally {
      $resetBtn.disabled = false;
    }
  }
  $resetBtn?.addEventListener("click", resetear);

  // ✅ Acierto: +1 y limpiar toda la cola
  $btnAcierto?.addEventListener("click", async () => {
    if (!currentTurn) return;
    $btnAcierto.disabled = true; $btnFallado.disabled = true;
    try {
      await cambiarPuntosJugador(currentTurn, +1);
      // limpiar cola
      const { error } = await supabase
        .from("pulsador")
        .update({ activado: false })
        .not("id", "is", null);
      if (error) console.error("[pulsador] acierto - clear", error);

      // parar temporizador y refrescar
      if (window.stopTimer) window.stopTimer();
      await cargarListas();
      await cargarMarcador();
    } finally {
      $btnAcierto.disabled = false; $btnFallado.disabled = false;
    }
  });

  // ✅ Fallado: -1 al actual, lo saca de la cola y pasa al siguiente (si lo hay)
  $btnFallado?.addEventListener("click", async () => {
    if (!currentTurn) return;
    $btnAcierto.disabled = true; $btnFallado.disabled = true;
    try {
      await cambiarPuntosJugador(currentTurn, -1);

      // Desactivar SOLO al actual
      const { error } = await supabase
        .from("pulsador")
        .update({ activado: false })
        .eq("usuario", currentTurn);
      if (error) console.error("[pulsador] fallado - update", error);

      // Refrescar: si queda otro activado, cargarListas() arrancará el timer de nuevo
      await cargarListas();
      await cargarMarcador();
    } finally {
      $btnAcierto.disabled = false; $btnFallado.disabled = false;
    }
  });

  /* ---------- realtime ---------- */
  const chP = supabase
    .channel("pulsador-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "pulsador" }, () => cargarListas())
    .subscribe();

  const chS = supabase
    .channel("marcador-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "marcador" }, () => cargarMarcador())
    .subscribe();

  /* ---------- init ---------- */
  await Promise.all([cargarListas(), cargarMarcador()]);

  // limpieza
  window.addEventListener("beforeunload", () => {
    supabase.removeChannel?.(chP);
    supabase.removeChannel?.(chS);
  });
}
