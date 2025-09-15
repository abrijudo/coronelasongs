// timer.js
// Temporizador sincronizado con Supabase usando el campo `turno_inicio` (hora fin)

let intervalId = null;

export function initTimer() {
  const $timer = document.getElementById("timer");
  const $value = document.getElementById("timer-value");
  const $progress = document.querySelector(".timer__progress");

  // Si no existe el widget en la página, no inicializamos nada
  if (!$timer || !$value || !$progress) return;

  const DURATION = 17; // segundos totales
  const CIRC = 2 * Math.PI * 54; // r=54 en el SVG del círculo
  $progress.style.strokeDasharray = String(CIRC);

  function paint(remaining, total) {
    $value.textContent = Math.max(0, remaining);
    const offset = CIRC - (remaining / total) * CIRC;
    $progress.style.strokeDashoffset = String(offset);
  }

  function hardStopToZero() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    // NO ocultamos ni devolvemos a 17; nos quedamos mostrando 0
  }

  function stopTimer() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    // Ocultamos y dejamos el widget listo para el próximo turno
    $timer.classList.add("hidden");
    $value.textContent = "17";
    $progress.style.strokeDashoffset = "0";
  }

  /**
   * Arranca el temporizador a partir de una HORA FIN (`endTime` = turno_inicio)
   * Todos los clientes calculan la misma cuenta atrás: ceil((end - now)/1000).
   */
  function startTimer(user, endTimeISO) {
    if (!endTimeISO) return;

    const end = new Date(endTimeISO).getTime();
    if (Number.isNaN(end)) return;

    if (intervalId) clearInterval(intervalId);
    $timer.classList.remove("hidden");

    function tick() {
      const now = Date.now();
      const remaining = Math.ceil((end - now) / 1000);

      if (remaining > 0) {
        paint(remaining, DURATION);
      } else {
        paint(0, DURATION);
        hardStopToZero(); // se queda en 0 visible hasta que llegue un nuevo turno o un reset
      }
    }

    tick(); // primera actualización inmediata
    intervalId = setInterval(tick, 1000);
  }

  // Exponemos API global
  window.startTimer = startTimer;
  window.stopTimer = stopTimer;
}
