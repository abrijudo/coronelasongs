import { supabase } from "/src/db/supabase.js";

export async function initPulsador() {
  const $listOn    = document.getElementById("listOn");
  const $listOff   = document.getElementById("listOff");
  const $listFail  = document.getElementById("listFail");

  const $countOn   = document.getElementById("countOn");
  const $countOff  = document.getElementById("countOff");
  const $countFail = document.getElementById("countFail");

  const $resetBtn  = document.getElementById("resetBtn");
  const $scoreBody = document.getElementById("scoreBody");
  const $turnName  = document.querySelector("[data-turn-name]");

  const $resultBox  = document.getElementById("resultBtns");
  const $btnAcierto = document.getElementById("btnAcierto");
  const $btnFallado = document.getElementById("btnFallado");

  let busy = false;

  // --- Asegura que timer.js esté listo
  let _timerReady = false;
  async function ensureTimerReady() {
    if (_timerReady) return true;
    if (window.startTimer && window.stopTimer) { _timerReady = true; return true; }
    try {
      const mod = await import("./timer.js"); // ajusta la ruta si mueves los archivos
      if (mod?.initTimer) mod.initTimer();
      _timerReady = !!(window.startTimer && window.stopTimer);
      return _timerReady;
    } catch (e) {
      console.error("[timer] No se pudo cargar timer.js", e);
      return false;
    }
  }

  async function cambiarPuntosJugador(nombre, delta) {
    if (!nombre) return;
    const { data: row } = await supabase
      .from("marcador")
      .select("id, puntos")
      .eq("jugador", nombre)
      .maybeSingle();

    if (row) {
      await supabase
        .from("marcador")
        .update({ puntos: (row.puntos ?? 0) + delta })
        .eq("id", row.id);
    } else {
      await supabase.from("marcador").insert({
        jugador: nombre,
        puntos: delta,
        created_at: new Date().toISOString(),
      });
    }
  }

  const esc = (s) =>
    (s ?? "").toString().replace(/[&<>"']/g, (m) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]
    ));

  async function cargarMarcador() {
    const { data, error } = await supabase
      .from("marcador")
      .select("jugador, puntos")
      .order("puntos", { ascending: false })
      .order("jugador", { ascending: true });

    if (error) return console.error(error);

    if (!data?.length) {
      $scoreBody.innerHTML = `<tr><td class="empty" colspan="2">Sin jugadores aún.</td></tr>`;
      return;
    }
    $scoreBody.innerHTML = data
      .map((r) => `<tr><td>${esc(r.jugador || "").toUpperCase()}</td><td>${Number(r.puntos) || 0}</td></tr>`)
      .join("");
  }

  async function cargarListas() {
    const { data, error } = await supabase
      .from("pulsador")
      .select("id, usuario, activado, fallado, jugando, turno_inicio, created_at")
      .eq("jugando", true)
      .order("created_at", { ascending: true });

    if (error) return console.error(error);

    let on = 0, off = 0, fail = 0;
    $listOn.innerHTML = "";
    $listOff.innerHTML = "";
    $listFail.innerHTML = "";

    (data || []).forEach((r) => {
      const p = document.createElement("p");
      p.textContent = r.usuario ?? "(sin nombre)";

      if (r.activado && !r.fallado) { 
        $listOn.appendChild(p); on++; 
      }
      else if (r.activado && r.fallado) { 
        $listFail.appendChild(p); fail++; 
      }
      else { 
        $listOff.appendChild(p); off++; 
      }
    });

    $countOn.textContent = String(on);
    $countOff.textContent = String(off);
    $countFail.textContent = String(fail);

    const queue = (data || []).filter((r) => r.activado && !r.fallado);
    const currentRow = queue.length ? queue[0] : null;
    const current = currentRow?.usuario || null;

    $turnName.textContent = current || "—";

    await ensureTimerReady();
    if (current && currentRow?.turno_inicio) {
      window.startTimer(current, currentRow.turno_inicio);
      $resultBox?.classList.remove("hidden");
    } else {
      window.stopTimer?.();
      $resultBox?.classList.add("hidden");
    }
  }

  // ---- Botones ----
  $btnAcierto?.addEventListener("click", async () => {
    if (busy) return; busy = true;
    try {
      const current = $turnName.textContent.trim();
      if (!current || current === "—") return;

      await cambiarPuntosJugador(current, +1);

      await supabase.from("pulsador").update({
        activado: false,
        fallado: false,
        turno_inicio: null
      }).neq("id", 0); // fuerza actualizar todas las filas

      window.stopTimer?.();
      $resultBox?.classList.add("hidden");
      await cargarListas();
    } finally { busy = false; }
  });

  $btnFallado?.addEventListener("click", async () => {
    if (busy) return; busy = true;
    try {
      const current = $turnName.textContent.trim();
      if (!current || current === "—") return;

      await cambiarPuntosJugador(current, -1);

      // El que falla pierde el turno
      await supabase.from("pulsador")
        .update({ fallado: true, turno_inicio: null })
        .eq("usuario", current);

      // Buscar siguiente en cola
      const { data: next } = await supabase
        .from("pulsador")
        .select("id")
        .eq("activado", true)
        .eq("fallado", false)
        .order("created_at", { ascending: true })
        .limit(1);

      if (next?.length) {
        await supabase.from("pulsador")
          .update({ turno_inicio: new Date(Date.now() + 17000).toISOString() })
          .eq("id", next[0].id);
      }

      await cargarListas();
    } finally { busy = false; }
  });

  $resetBtn?.addEventListener("click", async () => {
    if (busy) return; busy = true;
    try {
      await supabase.from("pulsador").update({
        activado: false,
        fallado: false,
        turno_inicio: null
      }).neq("id", 0); // actualiza todas

      window.stopTimer?.();
      $resultBox?.classList.add("hidden");
      await cargarListas();
    } finally { busy = false; }
  });

  // ---- Realtime ----
  let chP = null, chS = null;
  function subRealtime() {
    if (chP) supabase.removeChannel(chP);
    if (chS) supabase.removeChannel(chS);

    chP = supabase
      .channel("pulsador-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "pulsador" }, cargarListas)
      .subscribe();

    chS = supabase
      .channel("marcador-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "marcador" }, cargarMarcador)
      .subscribe();
  }

  // ---- Init ----
  await ensureTimerReady();
  await Promise.all([cargarListas(), cargarMarcador()]);
  subRealtime();
}
