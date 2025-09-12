// Temporizador simple con API global para que lo use pulsador.js
let intervalId = null;

export function initTimer() {
  const $timer = document.getElementById("timer");
  const $value = document.getElementById("timer-value");
  const $progress = document.querySelector(".timer__progress");

  if (!$timer || !$value || !$progress) return;

  const CIRC = 2 * Math.PI * 54; // r = 54 (en el SVG)
  $progress.style.strokeDasharray = String(CIRC);

  function paint(remaining, total) {
    $value.textContent = Math.max(0, remaining);
    const offset = CIRC - (remaining / total) * CIRC;
    $progress.style.strokeDashoffset = String(offset);
  }

  function stopTimer() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    // Ocúltalo cuando no hay turno
    $timer.classList.add("hidden");
  }

  function startTimer(duration = 15) {
    if (intervalId) clearInterval(intervalId);
    $timer.classList.remove("hidden");

    let remaining = duration;
    const total = duration;

    paint(remaining, total);
    intervalId = setInterval(() => {
      remaining -= 1;
      paint(remaining, total);

      if (remaining <= 0) {
        clearInterval(intervalId);
        intervalId = null;
        // Al terminar, lo dejamos visible con 0s o lo ocultamos:
        // Ocultarlo queda más limpio:
        $timer.classList.add("hidden");
      }
    }, 1000);
  }

  // API global
  window.startTimer = startTimer;
  window.stopTimer = stopTimer;
}
