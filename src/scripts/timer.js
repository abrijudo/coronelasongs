// Temporizador sincronizado basado en created_at
let intervalId = null;
let currentTurnUser = null;   // usuario que está en turno
let currentStartTime = null;  // fecha de inicio del turno (created_at en DB)

export function initTimer() {
  const $timer = document.getElementById("timer");
  const $value = document.getElementById("timer-value");
  const $progress = document.querySelector(".timer__progress");

  if (!$timer || !$value || !$progress) return;

  const CIRC = 2 * Math.PI * 54; // r=54 en el SVG
  $progress.style.strokeDasharray = String(CIRC);

  function paint(remaining, total) {
    $value.textContent = Math.max(0, remaining);
    const offset = CIRC - (remaining / total) * CIRC;
    $progress.style.strokeDashoffset = String(offset);
  }

  function stopTimer() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    currentTurnUser = null;
    currentStartTime = null;
    $timer.classList.add("hidden");
  }

  /**
   * Arranca o mantiene el temporizador para el jugador de turno
   * @param {string} usuarioTurno - nombre del jugador actual
   * @param {string} startISO - fecha de inicio ISO (created_at)
   * @param {number} duration - segundos de duración
   */
  function startTimer(usuarioTurno, startISO, duration = 15) {
    // Si es el mismo usuario en turno y ya teníamos un start, no reiniciar
    if (usuarioTurno === currentTurnUser && currentStartTime) {
      return;
    }

    // Nuevo turno: reiniciar valores
    currentTurnUser = usuarioTurno;
    currentStartTime = new Date(startISO).getTime();

    if (intervalId) clearInterval(intervalId);
    $timer.classList.remove("hidden");

    function tick() {
      const now = Date.now();
      const elapsed = Math.floor((now - currentStartTime) / 1000);
      const remaining = duration - elapsed;

      paint(remaining, duration);

      if (remaining <= 0) {
        stopTimer();
      }
    }

    tick();
    intervalId = setInterval(tick, 1000);
  }

  // API global
  window.startTimer = startTimer;
  window.stopTimer = stopTimer;
}
