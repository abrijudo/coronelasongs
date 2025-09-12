import { supabase } from "@db/supabase.js";

export async function initPulsador() {
  const $listOn   = document.getElementById("listOn");
  const $listOff  = document.getElementById("listOff");
  const $countOn  = document.getElementById("countOn");
  const $countOff = document.getElementById("countOff");
  const $resetBtn = document.getElementById("resetBtn");
  const $scoreBody = document.getElementById("scoreBody");
  const $turnName  = document.querySelector("[data-turn-name]");
  const $resultBox = document.getElementById("resultBtns");
  const $btnAcierto = document.getElementById("btnAcierto");
  const $btnFallado = document.getElementById("btnFallado");

  let prevActive = new Set();
  let currentUser = null;
  let tick = null;
  let timeLeft = 15;

  /* ===== Helpers temporizador ===== */
  const paintTime = (t) => {
    const el = document.getElementById("timer-value");
    if (el) el.textContent = t;
  };
  const stopTimer = () => { if (tick){ clearInterval(tick); tick=null; } };
  const startTimer = () => {
    stopTimer();
    timeLeft = 15;
    paintTime(timeLeft);
    tick = setInterval(()=>{
      timeLeft--;
      paintTime(timeLeft);
      if (timeLeft<=0) stopTimer();
    },1000);
  };

  const setTurnName = (t)=>{ if($turnName) $turnName.textContent=t||"—"; };

  /* ===== Cargar listas ===== */
  async function cargarListas(){
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, jugando, created_at")
      .eq("jugando", true)
      .order("usuario",{ascending:true});
    if(error){ console.error(error); return; }

    let on=0, off=0;
    $listOn.innerHTML=""; $listOff.innerHTML="";
    (data||[]).forEach(r=>{
      const p=document.createElement("p"); p.textContent=r.usuario||"(sin nombre)";
      if(r.activado){ $listOn.appendChild(p); on++; } else { $listOff.appendChild(p); off++; }
    });
    $countOn.textContent=on; $countOff.textContent=off;

    // turno → el primero activado por fecha
    const activos=(data||[]).filter(r=>r.activado).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    const siguiente=activos[0]?.usuario||null;

    if(siguiente && siguiente!==currentUser){
      currentUser=siguiente;
      setTurnName(currentUser);
      startTimer();
      $resultBox?.classList.remove("hidden");
    } else if(!siguiente){
      currentUser=null;
      setTurnName("—");
      stopTimer();
      $resultBox?.classList.add("hidden");
    }

    prevActive = new Set((data||[]).filter(r=>r.activado).map(r=>r.usuario));
  }

  /* ===== Resetear ===== */
  async function resetear(){
    if (!($resetBtn instanceof HTMLButtonElement)) return;
    $resetBtn.disabled=true;
    try{
      await supabase.from("pulsador").update({activado:false}).not("id","is",null);
      currentUser=null;
      stopTimer();
      setTurnName("—");
      cargarListas();
    }finally{ $resetBtn.disabled=false; }
  }
  $resetBtn?.addEventListener("click", resetear);

  /* ===== Marcador ===== */
  const esc=(s)=>(s??"").toString().replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[m]));
  function renderScore(rows=[]){
    if(!rows.length){ $scoreBody.innerHTML=`<tr><td class="empty" colspan="2">Sin jugadores aún.</td></tr>`; return; }
    $scoreBody.innerHTML=rows.map(r=>`<tr><td>${esc(r.jugador||'').toUpperCase()}</td><td>${Number(r.puntos)||0}</td></tr>`).join("");
  }
  async function cargarMarcador(){
    const { data, error } = await supabase.from("marcador").select("jugador,puntos").order("puntos",{ascending:false});
    if(error){ console.error(error); return; }
    renderScore(data||[]);
  }

  /* ===== Botones Acierto / Fallado ===== */
  $btnAcierto?.addEventListener("click", async ()=>{
    if(!currentUser) return;
    await supabase.rpc("incrementar_puntos",{ jugador_in: currentUser, delta: 1 }).catch(()=>{});
    await supabase.from("pulsador").update({activado:false}).eq("usuario",currentUser);
    currentUser=null;
    await cargarListas();
  });

  $btnFallado?.addEventListener("click", async ()=>{
    if(!currentUser) return;
    await supabase.rpc("incrementar_puntos",{ jugador_in: currentUser, delta: -1 }).catch(()=>{});
    await supabase.from("pulsador").update({activado:false}).eq("usuario",currentUser);
    currentUser=null;
    await cargarListas();
  });

  /* ===== Realtime ===== */
  supabase.channel("pulsador-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"pulsador"}, cargarListas)
    .subscribe();

  supabase.channel("marcador-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"marcador"}, cargarMarcador)
    .subscribe();

  /* ===== INIT ===== */
  await Promise.all([cargarListas(), cargarMarcador()]);
}
