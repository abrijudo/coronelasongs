import { supabase } from "@db/supabase.js";

export async function initPulsador() {
  const $listOn   = document.getElementById("listOn");
  const $listOff  = document.getElementById("listOff");
  const $countOn  = document.getElementById("countOn");
  const $countOff = document.getElementById("countOff");
  const $resetBtn = document.getElementById("resetBtn");

  const $turnName  = document.querySelector("[data-turn-name]");
  const $resultBox = document.getElementById("resultBtns");
  const $btnAcierto = document.getElementById("btnAcierto");
  const $btnFallado = document.getElementById("btnFallado");

  // Timer
  let timerId = null;
  let timeLeft = 15;
  const TOTAL = 15;

  function setTurnName(name){ if ($turnName) $turnName.textContent = name || "—"; }

  function startTimer() {
    stopTimer();
    timeLeft = TOTAL;
    updateTimerUI();
    timerId = setInterval(() => {
      timeLeft--;
      updateTimerUI();
      if (timeLeft <= 0) stopTimer(true);
    }, 1000);
  }

  function stopTimer(keepZero=false){
    if (timerId) clearInterval(timerId);
    timerId = null;
    if (keepZero) {
      timeLeft = 0;
      updateTimerUI();
    }
  }

  function updateTimerUI() {
    const $values = document.querySelectorAll("[data-timer-value], #timer-value");
    $values.forEach(v => v.textContent = String(timeLeft));
  }

  /* ========== Cargar listas ========== */
  async function cargarListas(){
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, jugando, created_at")
      .eq("jugando", true)
      .order("usuario",{ascending:true});

    if (error) { console.error(error); return; }

    let on = 0, off = 0;
    $listOn.innerHTML = "";
    $listOff.innerHTML = "";

    (data||[]).forEach(r=>{
      const p=document.createElement("p"); p.textContent=r.usuario ?? "(sin nombre)";
      if (r.activado) { $listOn.appendChild(p); on++; }
      else { $listOff.appendChild(p); off++; }
    });
    $countOn.textContent  = String(on);
    $countOff.textContent = String(off);

    // calcular turno actual (el más antiguo con activado=true)
    const activados = (data||[]).filter(r=>r.activado).sort((a,b)=> new Date(a.created_at)-new Date(b.created_at));
    const actual = activados[0]?.usuario || "—";

    setTurnName(actual);
    if (actual !== "—") startTimer();
    else stopTimer(true);
  }

  /* ========== Resetear ========== */
  async function resetear(){
    $resetBtn.disabled = true;
    try {
      const { error } = await supabase.from("pulsador").update({ activado:false }).not("id","is",null);
      if (error) console.error(error);
    } finally {
      $resetBtn.disabled = false;
      stopTimer(true);
      setTurnName("—");
      cargarListas();
    }
  }
  $resetBtn?.addEventListener("click", resetear);

  /* ========== Botones resultado ========== */
  async function cambiarPuntosJugador(nombre, delta){
    if (!nombre) return;
    const { data: row } = await supabase
      .from("marcador")
      .select("id, puntos")
      .eq("jugador", nombre)
      .maybeSingle();
    if (row) {
      await supabase.from("marcador").update({ puntos: (row.puntos ?? 0) + delta }).eq("id", row.id);
    } else {
      await supabase.from("marcador").insert({ jugador:nombre, puntos:delta, created_at:new Date().toISOString() });
    }
  }

  $btnAcierto?.addEventListener("click", async ()=>{
    const jugador = $turnName?.textContent;
    if (!jugador || jugador==="—") return;
    await cambiarPuntosJugador(jugador,+1);
    await supabase.from("pulsador").update({ activado:false }).eq("usuario",jugador);
    await cargarListas(); // pasa al siguiente
  });

  $btnFallado?.addEventListener("click", async ()=>{
    const jugador = $turnName?.textContent;
    if (!jugador || jugador==="—") return;
    await cambiarPuntosJugador(jugador,-1);
    await supabase.from("pulsador").update({ activado:false }).eq("usuario",jugador);
    await cargarListas(); // pasa al siguiente
  });

  /* ========== Realtime ========== */
  let chP=null, chS=null;
  function subRealtime(){
    if (chP) supabase.removeChannel(chP);
    if (chS) supabase.removeChannel(chS);

    chP = supabase
      .channel("pulsador-live")
      .on("postgres_changes", { event:"*", schema:"public", table:"pulsador" }, ()=>cargarListas())
      .subscribe();

    chS = supabase
      .channel("marcador-live")
      .on("postgres_changes", { event:"*", schema:"public", table:"marcador" }, ()=>cargarListas())
      .subscribe();
  }

  // primera carga
  await cargarListas();
  subRealtime();

  // polling backup
  setInterval(cargarListas, 2000);

  window.addEventListener("beforeunload",()=>{
    if (chP) supabase.removeChannel(chP);
    if (chS) supabase.removeChannel(chS);
  });
}
