// src/scripts/timer.js
import { supabase } from "@db/supabase.js";

export async function initTimer() {
  const $timers = document.querySelectorAll(".timer");
  const $values = document.querySelectorAll("[data-timer-value], #timer-value");
  const $progresses = document.querySelectorAll(".timer__progress");
  const $turnNames = document.querySelectorAll("[data-turn-name]");

  const $resultBtns = document.getElementById("resultBtns") || null;
  const $btnAcierto = document.getElementById("btnAcierto") || null;
  const $btnFallado = document.getElementById("btnFallado") || null;

  const TOTAL = 15; // segundos
  let tick = null;
  let currentUser = null;
  let startClientMs = null;
  let driftMs = 0;

  const R = 54;
  const circleLen = 2 * Math.PI * R;
  $progresses.forEach(c => (c.style.strokeDasharray = String(circleLen)));

  const setTurnName = (name) => {
    const t = name ? String(name).toUpperCase() : "—";
    $turnNames.forEach(el => (el.textContent = t));
  };
  const show = (el) => el?.classList.remove("hidden");
  const hide = (el) => el?.classList.add("hidden");

  function paintTime(t) {
    const tt = Math.max(0, t|0);
    $values.forEach(v => (v.textContent = String(tt)));
    const offset = circleLen * (1 - Math.max(0, Math.min(TOTAL, tt)) / TOTAL);
    $progresses.forEach(c => (c.style.strokeDashoffset = String(offset)));
  }

  function stopTimer() {
    if (tick) clearInterval(tick);
    tick = null;
    paintTime(0);
    if ($resultBtns) hide($resultBtns);
  }

  function startIntervalFrom(startMsClient) {
    if (tick) clearInterval(tick);

    if ($resultBtns) {
      show($resultBtns);
      $btnAcierto?.classList.remove("hidden");
      $btnFallado?.classList.add("hidden");
    }
    $timers.forEach(t => show(t));

    const computeLeft = () => {
      const elapsed = Math.floor((Date.now() - startMsClient) / 1000);
      return TOTAL - elapsed;
    };

    paintTime(computeLeft());
    tick = setInterval(() => {
      const left = computeLeft();
      if (left <= 0) {
        clearInterval(tick);
        tick = null;
        paintTime(0);
        if ($resultBtns) {
          $btnAcierto?.classList.remove("hidden");
          $btnFallado?.classList.remove("hidden");
        }
      } else {
        paintTime(left);
      }
    }, 1000);
  }

  async function fetchEstado() {
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, turno_inicio")
      .eq("jugando", true)
      .order("turno_inicio", { ascending: true });

    if (error) {
      console.error("[timer] fetchEstado:", error);
      return;
    }

    const activos = (data || []).filter(r => r.activado && r.usuario);
    if (!activos.length) {
      currentUser = null;
      setTurnName(null);
      stopTimer();
      return;
    }

    const siguiente = activos[0];
    const nuevoUser = siguiente.usuario;
    const nuevoInicio = siguiente.turno_inicio ? new Date(siguiente.turno_inicio) : null;

    if (!nuevoInicio) return;

    const nuevoStartClientMs = nuevoInicio.getTime() + driftMs;

    if (currentUser !== nuevoUser || startClientMs !== nuevoStartClientMs) {
      currentUser = nuevoUser;
      startClientMs = nuevoStartClientMs;
      setTurnName(currentUser);

      stopTimer();
      startIntervalFrom(startClientMs);
    }
  }

  // botones
  $btnAcierto?.addEventListener("click", async () => {
    if (!currentUser) return;
    await supabase.from("marcador").update({ puntos: supabase.rpc("increment", { val: 1 }) }).eq("jugador", currentUser);
    await supabase.from("pulsador").update({ activado: false, turno_inicio: null }).eq("usuario", currentUser);
    await fetchEstado();
  });

  $btnFallado?.addEventListener("click", async () => {
    if (!currentUser) return;
    await supabase.from("marcador").update({ puntos: supabase.rpc("increment", { val: -1 }) }).eq("jugador", currentUser);
    await supabase.from("pulsador").update({ activado: false, turno_inicio: null }).eq("usuario", currentUser);
    await fetchEstado();
  });

  // realtime
  const ch = supabase
    .channel("pulsador-timer")
    .on("postgres_changes", { event: "*", schema: "public", table: "pulsador" }, fetchEstado)
    .subscribe();

  // polling fallback
  let pollId = null;
  function startPolling(){ if (!pollId) pollId = setInterval(fetchEstado, 2000); }
  function stopPolling(){ if (pollId){ clearInterval(pollId); pollId = null; } }

  await fetchEstado();
  startPolling();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) startPolling();
    else { fetchEstado(); startPolling(); }
  });

  window.addEventListener("beforeunload", () => {
    supabase.removeChannel?.(ch);
    stopPolling();
    if (tick) clearInterval(tick);
  });
}
