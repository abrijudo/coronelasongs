import { supabase } from "/src/db/supabase.js";

/**
 * Reglas:
 * - Turno = primer registro con activado=TRUE y fallado=FALSE (ordenado por created_at ASC).
 * - Mostrar botones Acierto/Fallado cuando haya turno; ocultarlos si no lo hay.
 * - Timer: inicia SOLO cuando empieza un turno o cambia de jugador.
 * - Fallado → pasa el jugador a lista de fallados (activado=TRUE, fallado=TRUE) y sigue el turno con el siguiente.
 * - Acierto → se resetea todo y timer se para.
 * - Reset → pone activado=FALSE y fallado=FALSE a todos.
 */

export async function initPulsador() {
  // ---- DOM ----
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

  // Timer DOM
  const $timer    = document.getElementById("timer");
  const $value    = document.getElementById("timer-value");
  const $progress = document.querySelector(".timer__progress");

  // ---- Estado local ----
  let prevCurrent = null;
  let busy = false;
  let intervalId = null;

  // ---- Helpers ----
  const show = (el) => el && el.classList.remove("hidden");
  const hide = (el) => el && el.classList.add("hidden");

  const CIRC = 2 * Math.PI * 54;
  if ($progress) $progress.style.strokeDasharray = String(CIRC);

  function paint(remaining, total) {
    if ($value) $value.textContent = Math.max(0, remaining);
    if ($progress) {
      const offset = CIRC - (remaining / total) * CIRC;
      $progress.style.strokeDashoffset = String(offset);
    }
  }

  function stopTimer() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    if ($timer) $timer.classList.add("hidden");
    if ($value) $value.textContent = "15";
  }

  function startTimer(duration = 15) {
    stopTimer();
    if ($timer) $timer.classList.remove("hidden");

    let remaining = duration;
    const total = duration;
    paint(remaining, total);

    intervalId = setInterval(() => {
      remaining -= 1;
      paint(remaining, total);

      if (remaining <= 0) {
        clearInterval(intervalId);
        intervalId = null;
        if ($timer) $timer.classList.add("hidden");
      }
    }, 1000);
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
      .select("id, usuario, activado, fallado, jugando, created_at")
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
    const current = queue.length ? queue[0].usuario : null;

    $turnName.textContent = current || "—";

    if (current) show($resultBox);
    else hide($resultBox);

    if (current && current !== prevCurrent) {
      startTimer(15);
    }
    if (!current && prevCurrent) {
      stopTimer();
    }

    prevCurrent = current;
  }

  // ---- Botones ----
  $btnAcierto?.addEventListener("click", async () => {
    if (busy) return; busy = true;
    try {
      const current = $turnName.textContent.trim();
      if (!current || current === "—") return;

      await cambiarPuntosJugador(current, +1);
      await supabase.from("pulsador").update({ activado: false, fallado: false }).not("id", "is", null);

      stopTimer();
      hide($resultBox);
      await cargarListas();
    } finally { busy = false; }
  });

  $btnFallado?.addEventListener("click", async () => {
    if (busy) return; busy = true;
    try {
      const current = $turnName.textContent.trim();
      if (!current || current === "—") return;

      await cambiarPuntosJugador(current, -1);
      await supabase.from("pulsador").update({ fallado: true }).eq("usuario", current);

      await cargarListas();
      const hayTurno = ($turnName.textContent.trim() || "—") !== "—";
      if (hayTurno) startTimer(15);
      else stopTimer();
    } finally { busy = false; }
  });

  $resetBtn?.addEventListener("click", async () => {
    if (busy) return; busy = true;
    try {
      await supabase.from("pulsador").update({ activado: false, fallado: false }).not("id", "is", null);
      stopTimer();
      hide($resultBox);
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
  await Promise.all([cargarListas(), cargarMarcador()]);
  subRealtime();
}
