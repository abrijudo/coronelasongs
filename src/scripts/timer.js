// Temporizador sincronizado con Supabase
let intervalId = null;
let lastUser = null;

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
    lastUser = null;
    $timer.classList.add("hidden");
    if ($value) $value.textContent = "15";
  }

  /**
   * Inicia un temporizador sincronizado desde `startTime`
   * - Solo reinicia si cambia el usuario (nuevo turno)
   */
  function startTimer(user, startTime, duration = 17) {
    if (!startTime) return;

    // Evita reinicios si el mismo jugador ya tiene turno activo
    if (lastUser === user && intervalId) return;
    lastUser = user;

    if (intervalId) clearInterval(intervalId);
    $timer.classList.remove("hidden");

    const total = duration;
    const start = new Date(startTime).getTime();

    function tick() {
      const now = Date.now();
      const elapsed = Math.floor((now - start) / 1000);
      const remaining = total - elapsed;

      if (remaining >= 0) {
        paint(remaining, total);
      } else {
        paint(0, total);
        stopTimer();
      }
    }

    tick();
    intervalId = setInterval(tick, 1000);
  }

  // API global para usar desde pulsador.js
  window.startTimer = startTimer;
  window.stopTimer = stopTimer;
}
