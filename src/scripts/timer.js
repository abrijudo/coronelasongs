import { supabase } from "@db/supabase.js";

export async function initTimer() {
  const $timers = document.querySelectorAll(".timer");
  const $values = document.querySelectorAll("[data-timer-value], #timer-value");
  const $progresses = document.querySelectorAll(".timer__progress");

  const $resultBtns = document.getElementById("resultBtns") || null;
  const $btnAcierto = document.getElementById("btnAcierto") || null;
  const $btnFallado = document.getElementById("btnFallado") || null;

  const $turnNames = document.querySelectorAll("[data-turn-name]");
  const setTurnName = (name) => {
    const t = name ? String(name).toUpperCase() : "—";
    $turnNames.forEach((el) => (el.textContent = t));
  };

  const show = (el) => { if (el) el.classList.remove("hidden"); };
  const hide = (el) => { if (el) el.classList.add("hidden"); };

  const TOTAL = 15; // duración en segundos
  let tick = null;
  let currentUser = null;
  let startAt = null;

  const R = 54;
  const circleLen = 2 * Math.PI * R;
  $progresses.forEach((c) => (c.style.strokeDasharray = String(circleLen)));

  function paintTime(t) {
    $values.forEach((v) => (v.textContent = `${t}`));
    const offset = circleLen * (1 - t / TOTAL);
    $progresses.forEach((c) => (c.style.strokeDashoffset = String(offset)));
  }

  function stopTimer(keepZero = false) {
    if (tick) clearInterval(tick);
    tick = null;
    if (keepZero) {
      paintTime(0);
      $timers.forEach((t) => show(t));
    }
    if ($resultBtns) hide($resultBtns);
  }

  function runTimer(startAt) {
    if (tick) clearInterval(tick);
    tick = setInterval(() => {
      const diff = Math.floor((Date.now() - startAt.getTime()) / 1000);
      const restante = TOTAL - diff;

      if (restante <= 0) {
        clearInterval(tick);
        tick = null;
        paintTime(0);
        hide($resultBtns);
        // 🔥 aquí podrías marcar fin de turno en BD si quieres
      } else {
        paintTime(restante);
      }
    }, 1000);

    $timers.forEach((t) => show(t));
  }

  async function fetchEstado() {
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, jugando, turno_inicio")
      .eq("jugando", true)
      .order("created_at", { ascending: true });

    if (error) return;

    const activos = (data || []).filter((r) => r.activado && r.usuario);
    const siguiente = activos[0] || null;

    if (!siguiente) {
      currentUser = null;
      startAt = null;
      setTurnName(null);
      stopTimer(true);
      return;
    }

    const nuevoUser = siguiente.usuario;
    const nuevoInicio = siguiente.turno_inicio ? new Date(siguiente.turno_inicio) : null;

    if (currentUser !== nuevoUser) {
      // jugador nuevo → reinicio turno
      currentUser = nuevoUser;
      setTurnName(currentUser);

      if (!nuevoInicio) {
        const nowISO = new Date().toISOString();
        await supabase
          .from("pulsador")
          .update({ turno_inicio: nowISO })
          .eq("usuario", nuevoUser);
        startAt = new Date(nowISO);
      } else {
        startAt = nuevoInicio;
      }
      runTimer(startAt);
    } else {
      // mismo jugador → calculo restante
      if (nuevoInicio) {
        startAt = nuevoInicio;
        runTimer(startAt);
      }
    }
  }

  // Botón acierto
  $btnAcierto?.addEventListener("click", async () => {
    if (!currentUser) return;
    // sumar punto
    await supabase.rpc("sumar_punto", { jugador: currentUser }); // opcional, si tienes la función
    // desactivar actual
    await supabase.from("pulsador").update({ activado: false, turno_inicio: null }).eq("usuario", currentUser);
    await fetchEstado();
  });

  // Botón fallado
  $btnFallado?.addEventListener("click", async () => {
    if (!currentUser) return;
    // restar punto
    await supabase.rpc("restar_punto", { jugador: currentUser }); // opcional, si tienes la función
    // desactivar actual
    await supabase.from("pulsador").update({ activado: false, turno_inicio: null }).eq("usuario", currentUser);
    await fetchEstado();
  });

  // Realtime
  const ch = supabase
    .channel("pulsador-timer2")
    .on("postgres_changes", { event: "*", schema: "public", table: "pulsador" }, fetchEstado)
    .subscribe();

  // Polling de respaldo
  let pollId = null;
  function startPolling() { if (!pollId) pollId = setInterval(fetchEstado, 2000); }
  function stopPolling() { if (pollId) { clearInterval(pollId); pollId = null; } }

  await fetchEstado();
  startPolling();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) startPolling();
    else { fetchEstado(); startPolling(); }
  });

  window.addEventListener("beforeunload", () => {
    supabase.removeChannel?.(ch);
    stopPolling();
  });
}
