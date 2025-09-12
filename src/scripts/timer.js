import { supabase } from "@db/supabase.js";

export async function initTimer() {
  /* ================== UI refs ================== */
  const $timers     = Array.from(document.querySelectorAll(".timer"));
  const $values     = Array.from(document.querySelectorAll("[data-timer-value], #timer-value"));
  const $progresses = Array.from(document.querySelectorAll(".timer__progress"));

  const $resultBtns = document.getElementById("resultBtns") || null;
  const $btnAcierto = document.getElementById("btnAcierto") || null;
  const $btnFallado = document.getElementById("btnFallado") || null;

  const $turnNames = Array.from(document.querySelectorAll("[data-turn-name]"));
  const setTurnName = (name) => {
    const t = name ? String(name).toUpperCase() : "—";
    $turnNames.forEach(el => (el.textContent = t));
  };

  const show = (el) => { if (el) el.classList.remove("hidden"); };
  const hide = (el) => { if (el) el.classList.add("hidden"); };

  /* ================== Temporizador ================== */
  const TOTAL = 15; // segundos
  let timeLeft = TOTAL;
  let tick = null;

  const isTimerRunning = () => tick !== null;

  const R = 54;
  const circleLen = 2 * Math.PI * R;
  $progresses.forEach(c => (c.style.strokeDasharray = String(circleLen)));

  function paintTime(t) {
    $values.forEach(v => (v.textContent = `${t}`));
    const offset = circleLen * (1 - t / TOTAL);
    $progresses.forEach(c => (c.style.strokeDashoffset = String(offset)));
  }

  function stopTimer(keepZero = false) {
    if (tick) clearInterval(tick);
    tick = null;
    if (keepZero) {
      timeLeft = 0;
      paintTime(0);
      $timers.forEach(t => show(t));
    }
    if ($resultBtns) {
      if ($btnFallado) $btnFallado.classList.add("hidden");
    }
  }

  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(audioCtx.destination); o.start();
      setTimeout(() => o.stop(), 120);
    } catch {}
  }

  function startTimer() {
    if (isTimerRunning()) return; // ⛔️ NO reiniciar si ya está corriendo

    if ($resultBtns) {
      show($resultBtns);
      if ($btnAcierto) $btnAcierto.classList.remove("hidden");
      if ($btnFallado) $btnFallado.classList.add("hidden");
    }

    timeLeft = TOTAL;
    paintTime(timeLeft);
    $timers.forEach(t => show(t));

    tick = setInterval(() => {
      timeLeft -= 1;
      if (timeLeft <= 5 && timeLeft > 0) beep();
      paintTime(Math.max(timeLeft, 0));
      if (timeLeft <= 0) {
        clearInterval(tick);
        tick = null;
        if ($resultBtns) {
          if ($btnAcierto) $btnAcierto.classList.remove("hidden");
          if ($btnFallado) $btnFallado.classList.remove("hidden");
        }
      }
    }, 1000);
  }

  /* ================== Marcador helpers ================== */
  async function cambiarPuntosJugador(nombre, delta) {
    if (!nombre) return;
    const { data: row, error } = await supabase
      .from("marcador")
      .select("id, puntos")
      .eq("jugador", nombre)
      .maybeSingle();
    if (error && error.code !== "PGRST116") return;

    if (row) {
      await supabase.from("marcador").update({ puntos: (row.puntos ?? 0) + delta }).eq("id", row.id);
    } else {
      await supabase.from("marcador").insert({
        jugador: nombre, puntos: delta, created_at: new Date().toISOString()
      });
    }
  }

  /* ================== Estado ================== */
  let current = null;
  let prevActiveSet = new Set();

  async function fetchEstado() {
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, jugando, created_at")
      .eq("jugando", true)
      .order("created_at", { ascending: true });

    if (error) return;

    const activos = (data || []).filter(r => r.activado && r.usuario);
    const siguiente = activos[0]?.usuario || null;

    const currentSet = new Set(activos.map(r => r.usuario));
    const newly = [...currentSet].filter(u => !prevActiveSet.has(u));
    prevActiveSet = currentSet;

    if (!siguiente) {
      current = null;
      setTurnName(null);
      hide($resultBtns);
      stopTimer(true);
      return;
    }

    if (current !== siguiente || newly.length) {
      current = siguiente;
      setTurnName(current);
      if (!isTimerRunning()) startTimer();
    }
  }

/* ================== Botones resultado ================== */
$btnAcierto?.addEventListener("click", async () => {
  if (!current) return;

  // Quitar un punto y desactivar al actual
  await cambiarPuntosJugador(current, +1);
  await supabase.from("pulsador").update({ activado: false }).eq("usuario", current);

  // Buscar si queda alguien más activado
  const { data: restantes } = await supabase
    .from("pulsador")
    .select("usuario")
    .eq("jugando", true)
    .eq("activado", true)
    .order("created_at", { ascending: true });

  if (restantes && restantes.length > 0) {
    current = restantes[0].usuario;
    setTurnName(current);

    // Reinicia el timer limpio
    stopTimer();
    startTimer();
  } else {
    // Nadie más activado → termina turno
    stopTimer(true);
    setTurnName(null);
    hide($resultBtns);
  }
});

$btnFallado?.addEventListener("click", async () => {
  if (!current) return;

  // Restar punto y desactivar al actual
  await cambiarPuntosJugador(current, -1);
  await supabase.from("pulsador").update({ activado: false }).eq("usuario", current);

  // Buscar si queda alguien más activado
  const { data: restantes } = await supabase
    .from("pulsador")
    .select("usuario")
    .eq("jugando", true)
    .eq("activado", true)
    .order("created_at", { ascending: true });

  if (restantes && restantes.length > 0) {
    current = restantes[0].usuario;
    setTurnName(current);

    // Reinicia el timer limpio
    stopTimer();
    startTimer();
  } else {
    // Nadie más activado → termina turno
    stopTimer(true);
    setTurnName(null);
    hide($resultBtns);
  }
});


  /* ================== Realtime + Polling ================== */
  const ch = supabase
    .channel("pulsador-timer")
    .on("postgres_changes", { event: "*", schema: "public", table: "pulsador" }, fetchEstado)
    .subscribe();

  let pollId = null;
  function startPolling(){ if (!pollId) pollId = setInterval(fetchEstado, 1500); }
  function stopPolling(){ if (pollId){ clearInterval(pollId); pollId = null; } }

  await fetchEstado();
  startPolling();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { startPolling(); }
    else { fetchEstado(); startPolling(); }
  });

  window.addEventListener("beforeunload", () => {
    supabase.removeChannel?.(ch);
    stopPolling();
  });
}
