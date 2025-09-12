import { supabase } from "@db/supabase.js";

export async function initParticipantes() {
  const $gate  = document.getElementById("pp-locked");
  const $root  = document.getElementById("pp-root");
  const $me    = document.getElementById("pp-user-name");
  const $btn   = document.getElementById("pp-buzz");
  const $hint  = document.getElementById("pp-hint");
  const $tbody = document.getElementById("pp-body");
  const $turn  = document.querySelector("[data-turn-name]");
  const $timer = document.getElementById("timer");
  const $tval  = document.getElementById("timer-value");

  // 🔥 Botones admin (solo estarán en pulsador.astro)
  const $btnAcierto = document.getElementById("btnAcierto");
  const $btnFallado = document.getElementById("btnFallado");

  let myName = null;
  let pollId = null;
  let tick   = null;
  let timeLeft = 15;
  let currentUser = null;

  /* ===== Helpers ===== */
  function showGate(){ $gate.hidden=false; $root.hidden=true; }
  function showApp(){ $gate.hidden=true; $root.hidden=false; }
  const paintTime = (t)=>{ if($tval) $tval.textContent=t; };
  const stopTimer = ()=>{ if(tick){clearInterval(tick);tick=null;} if($timer) $timer.classList.add("hidden"); };
  const startTimer = ()=>{
    stopTimer();
    timeLeft=15;
    paintTime(timeLeft);
    if($timer) $timer.classList.remove("hidden");
    tick=setInterval(()=>{
      timeLeft--;
      paintTime(timeLeft);
      if(timeLeft<=0) stopTimer();
    },1000);
  };

  async function resolveName(){
    const { data: { user } } = await supabase.auth.getUser();
    myName = user?.user_metadata?.name || user?.email?.split("@")[0] || null;
    if ($me && myName) $me.textContent = myName;
  }

  /* ===== Gate ===== */
  async function checkGate(){
    if (!myName) await resolveName();
    if (!myName) { showGate(); return; }
    const { data } = await supabase.from("pulsador").select("jugando").eq("usuario", myName).maybeSingle();
    (data?.jugando) ? showApp() : showGate();
  }

  /* ===== Marcador ===== */
  async function refreshMarcador(){
    if (!$tbody) return;
    const { data, error } = await supabase
      .from("marcador").select("jugador, puntos")
      .order("puntos",{ascending:false});
    if (error) return console.error(error);
    $tbody.innerHTML="";
    if (!data?.length){ $tbody.innerHTML=`<tr><td colspan="2">Sin jugadores</td></tr>`; return; }
    data.forEach(r=>{
      const tr=document.createElement("tr");
      tr.className="pp-row";
      if(r.jugador===myName) tr.classList.add("me");
      tr.innerHTML=`<td>${r.jugador}</td><td>${r.puntos??0}</td>`;
      $tbody.appendChild(tr);
    });
  }

  /* ===== Turno ===== */
  async function refreshTurno(){
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, jugando, created_at")
      .eq("jugando",true)
      .eq("activado",true)
      .order("created_at",{ascending:true})
      .limit(1);
    if (error) return console.error(error);

    const next = data?.[0]?.usuario || null;
    if ($turn) $turn.textContent = next || "—";

    if(next && next!==currentUser){
      currentUser=next;
      startTimer();  // 🔥 arranca o reinicia el timer con nuevo turno
    }
    if(!next){ currentUser=null; stopTimer(); }
  }

  /* ===== Botón Pulsar (participante) ===== */
  $btn?.addEventListener("click", async ()=>{
    if (!myName) return;
    const { data } = await supabase.from("pulsador").select("id, activado").eq("usuario",myName).maybeSingle();
    if (data?.activado){ if($hint) $hint.textContent="Ya has pulsado"; return; }
    await supabase.from("pulsador").update({activado:true, created_at:new Date().toISOString()}).eq("id",data.id);
    if($hint) $hint.textContent="Has pulsado ✅";
  });

  /* ===== Botones admin: Acierto / Fallado ===== */
  $btnAcierto?.addEventListener("click", async ()=>{
    if (!currentUser) return;
    // +1 punto
    await supabase.from("marcador")
      .upsert({ jugador: currentUser, puntos: 1 }, { onConflict: "jugador" })
      .select();
    // Desactivar al jugador actual
    await supabase.from("pulsador").update({activado:false}).eq("usuario",currentUser);
    currentUser=null;
    await refreshTurno();
  });

  $btnFallado?.addEventListener("click", async ()=>{
    if (!currentUser) return;
    // -1 punto
    await supabase.from("marcador")
      .upsert({ jugador: currentUser, puntos: -1 }, { onConflict: "jugador" })
      .select();
    // Desactivar al jugador actual
    await supabase.from("pulsador").update({activado:false}).eq("usuario",currentUser);
    currentUser=null;
    await refreshTurno(); // 🔥 pasa al siguiente turno si lo hay
  });

  /* ===== Subscriptions ===== */
  supabase.channel("pp-gate")
    .on("postgres_changes",{event:"*",schema:"public",table:"pulsador",filter:`usuario=eq.${myName}`},checkGate)
    .subscribe();

  supabase.channel("pp-marcador")
    .on("postgres_changes",{event:"*",schema:"public",table:"marcador"},refreshMarcador)
    .subscribe();

  supabase.channel("pp-turno")
    .on("postgres_changes",{event:"*",schema:"public",table:"pulsador"},refreshTurno)
    .subscribe();

  /* ===== Polling backup ===== */
  function startPolling(){ if(!pollId) pollId=setInterval(()=>{checkGate();refreshMarcador();refreshTurno();},2000);}
  function stopPolling(){ if(pollId){clearInterval(pollId);pollId=null;} }

  /* ===== INIT ===== */
  await resolveName();
  await checkGate();
  await refreshMarcador();
  await refreshTurno();
  startPolling();

  window.addEventListener("online", ()=>{ stopPolling(); checkGate(); refreshMarcador(); refreshTurno(); });
  window.addEventListener("offline", ()=> startPolling());
}
