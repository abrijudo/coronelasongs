// src/scripts/timer.js
import { supabase } from "@db/supabase.js";

export async function initTimer() {
  const $timers     = document.querySelectorAll(".timer");
  const $values     = document.querySelectorAll("[data-timer-value], #timer-value");
  const $progresses = document.querySelectorAll(".timer__progress");

  const $resultBtns = document.getElementById("resultBtns") || null;
  const $btnAcierto = document.getElementById("btnAcierto") || null;
  const $btnFallado = document.getElementById("btnFallado") || null;

  const $turnNames = document.querySelectorAll("[data-turn-name]");
  const setTurnName = (name) => {
    const t = name ? String(name).toUpperCase() : "—";
    $turnNames.forEach(el => (el.textContent = t));
  };
  const show = (el) => { if (el) el.classList.remove("hidden"); };
  const hide = (el) => { if (el) el.classList.add("hidden"); };

  /* ====== Config ====== */
  const TOTAL = 15;                       // segundos de turno
  const R = 54;
  const circleLen = 2 * Math.PI * R;
  $progresses.forEach(c => (c.style.strokeDasharray = String(circleLen)));

  /* ====== Estado local ====== */
  let tick = null;                        // setInterval handler
  let currentUser = null;                 // usuario con el turno
  let driftMs = 0;                        // diferencia cliente - servidor
  let startClientMs = null;               // inicio de turno en tiempo de cliente (ajustado por drift)

  const isTimerRunning = () => tick !== null;

  function paintTime(t) {
    const tt = Math.max(0, t|0);
    $values.forEach(v => (v.textContent = String(tt)));
    const offset = circleLen * (1 - Math.max(0, Math.min(TOTAL, tt)) / TOTAL);
    $progresses.forEach(c => (c.style.strokeDashoffset = String(offset)));
  }

  function stopTimer(keepZero = false) {
    if (tick) clearInterval(tick);
    tick = null;
    if (keepZero) {
      paintTime(0);
      $timers.forEach(t => t.classList.remove("hidden"));
    }
    if ($resultBtns) {
      $btnFallado?.classList.add("hidden");
    }
  }

  function startIntervalFrom(startMsClient) {
    if (tick) clearInterval(tick);

    // durante cuenta atrás
    if ($resultBtns) {
      show($resultBtns);
      $btnAcierto?.classList.remove("hidden");
      $btnFallado?.classList.add("hidden");
    }

    $timers.forEach(t => t.classList.remove("hidden"));

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

  /** Sincroniza con BD (punto de verdad) */
  async function resync() {
    const { data, error } = await supabase.rpc("get_current_turn");
    if (error) { console.error("[timer] get_current_turn:", error); return; }

    const serverNowISO = data?.server_now || null;
    const user = data?.current_usuario || null;
    const startedISO = data?.started_at || null;

    if (serverNowISO) driftMs = Date.now() - Date.parse(serverNowISO);

    if (!user || !startedISO) {
      currentUser = null;
      startClientMs = null;
      setTurnName(null);
      stopTimer(true);
      return;
    }

    const newStartClientMs = Date.parse(startedISO) + driftMs;

    if (currentUser !== user || startClientMs !== newStartClientMs) {
      currentUser = user;
      startClientMs = newStartClientMs;
      setTurnName(currentUser);

      stopTimer(false);
      startIntervalFrom(startClientMs);
    }
  }

  /* ====== Botones resultado (admin) ====== */
  $btnAcierto?.addEventListener("click", async () => {
    const { error } = await supabase.rpc("resolve_turn", { p_delta: 1 });
    if (error) console.error("[timer] resolve_turn(+1):", error);
    await resync();
  });

  $btnFallado?.addEventListener("click", async () => {
    const { error } = await supabase.rpc("resolve_turn", { p_delta: -1 });
    if (error) console.error("[timer] resolve_turn(-1):", error);
    await resync();
  });

  /* ====== Realtime + debounce ====== */
  let debounceId = null;
  const debResync = () => {
    clearTimeout(debounceId);
    debounceId = setTimeout(resync, 120);
  };

  const ch = supabase
    .channel("pulsador-timer-robusto")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "pulsador" },
      debResync
    )
    .subscribe();

  /* ====== Polling de respaldo ====== */
  let pollId = null;
  function startPolling(){ if (!pollId) pollId = setInterval(resync, 2000); }
  function stopPolling(){ if (pollId){ clearInterval(pollId); pollId = null; } }

  await resync();
  startPolling();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) startPolling();
    else { resync(); startPolling(); }
  });

  window.addEventListener("beforeunload", () => {
    supabase.removeChannel?.(ch);
    stopPolling();
    if (tick) clearInterval(tick);
  });
}
