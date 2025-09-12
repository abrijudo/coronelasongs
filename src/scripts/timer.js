// /src/scripts/timer.js
import { supabase } from "@db/supabase.js";

/** ================== Estado global del temporizador ================== */
const TOTAL = 15; // segundos
let tick = null;
let timeLeft = TOTAL;
let current = null;

const $timers     = Array.from(document.querySelectorAll(".timer"));
const $values     = Array.from(document.querySelectorAll("[data-timer-value], #timer-value"));
const $progresses = Array.from(document.querySelectorAll(".timer__progress"));
const $resultBtns = document.getElementById("resultBtns") || null;
const $btnAcierto = document.getElementById("btnAcierto") || null;
const $btnFallado = document.getElementById("btnFallado") || null;
const $turnNames  = Array.from(document.querySelectorAll("[data-turn-name]"));

const setTurnName = (name) => {
  const t = name ? String(name).toUpperCase() : "—";
  $turnNames.forEach(el => (el.textContent = t));
};
const show = (el) => { if (el) el.classList.remove("hidden"); };
const hide = (el) => { if (el) el.classList.add("hidden"); };

const R = 54;
const circleLen = 2 * Math.PI * R;
$progresses.forEach(c => (c.style.strokeDasharray = String(circleLen)));

/** ================== Dibujo ================== */
function paintTime(t) {
  $values.forEach(v => (v.textContent = `${t}`));
  const offset = circleLen * (1 - t / TOTAL);
  $progresses.forEach(c => (c.style.strokeDashoffset = String(offset)));
}

/** ================== Timer core ================== */
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

function startTimer(force = false) {
  if (tick && !force) return; // ⛔️ evita duplicados si no se fuerza reinicio
  if (tick) clearInterval(tick);

  timeLeft = TOTAL;
  paintTime(timeLeft);
  $timers.forEach(t => show(t));

  if ($resultBtns) {
    show($resultBtns);
    if ($btnAcierto) $btnAcierto.classList.remove("hidden");
    if ($btnFallado) $btnFallado.classList.add("hidden");
  }

  tick = setInterval(() => {
    timeLeft -= 1;
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

/** ================== BD helpers ================== */
async function cambiarPuntosJugador(nombre, delta) {
  try {
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
  } catch (err) {
    console.error("Error cambiarPuntosJugador:", err);
  }
}

/** ================== Estado del turno ================== */
async function fetchEstado() {
  try {
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, jugando, created_at")
      .eq("jugando", true)
      .order("created_at", { ascending: true });

    if (error) return;

    const activos = (data || []).filter(r => r.activado && r.usuario);
    const siguiente = activos[0]?.usuario || null;

    if (!siguiente) {
      current = null;
      setTurnName(null);
      stopTimer(true);
      return;
    }

    if (current !== siguiente) {
      current = siguiente;
      setTurnName(current);
      startTimer(true); // 👈 reinicia si cambia el jugador
    }
  } catch (err) {
    console.error("Error fetchEstado:", err);
  }
}

/** ================== Botones resultado ================== */
$btnAcierto?.addEventListener("click", async () => {
  if (!current) return;
  await cambiarPuntosJugador(current, +1);
  await supabase.from("pulsador").update({ activado: false }).eq("usuario", current);
  await fetchEstado();
});

$btnFallado?.addEventListener("click", async () => {
  if (!current) return;
  await cambiarPuntosJugador(current, -1);
  await supabase.from("pulsador").update({ activado: false }).eq("usuario", current);
  await fetchEstado();
});

/** ================== Realtime ================== */
export async function initTimer() {
  await fetchEstado();

  const ch = supabase
    .channel("pulsador-timer")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "pulsador" },
      fetchEstado
    )
    .subscribe();

  // respaldo con polling
  setInterval(fetchEstado, 2000);

  window.addEventListener("beforeunload", () => {
    supabase.removeChannel?.(ch);
  });
}
