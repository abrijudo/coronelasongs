import { supabase } from "@db/supabase.js";

export async function initParticipantes() {
  const $gate  = document.getElementById("pp-locked");
  const $root  = document.getElementById("pp-root");
  const $me    = document.getElementById("pp-user-name");
  const $btn   = document.getElementById("pp-buzz");
  const $hint  = document.getElementById("pp-hint");
  const $tbody = document.getElementById("pp-body");
  const $turn  = document.querySelector("[data-turn-name]");

  let myName = null;
  let pollId = null;

  function showGate(){ $gate.hidden=false; $root.hidden=true; }
  function showApp(){ $gate.hidden=true; $root.hidden=false; }

  async function resolveName(){
    const { data: { user } } = await supabase.auth.getUser();
    myName = user?.user_metadata?.name || user?.email?.split("@")[0] || null;
    if ($me && myName) $me.textContent = myName;
  }

  /* ========== GATE: si jugando=TRUE entras ========== */
  async function checkGate(){
    if (!myName) await resolveName();
    if (!myName) { showGate(); return; }

    const { data, error } = await supabase
      .from("pulsador")
      .select("jugando")
      .eq("usuario", myName)
      .maybeSingle();

    if (error) { console.error("[gate]", error); showGate(); return; }
    (data?.jugando) ? showApp() : showGate();
  }

  /* ========== Marcador ========== */
  async function refreshMarcador(){
    if (!$tbody) return;
    const { data, error } = await supabase
      .from("marcador")
      .select("jugador, puntos")
      .order("puntos", { ascending:false });

    if (error) { console.error("[marcador]", error); return; }

    $tbody.innerHTML="";
    if (!data?.length){
      $tbody.innerHTML=`<tr><td colspan="2" class="empty">Sin jugadores</td></tr>`;
      return;
    }
    for(const row of data){
      const tr=document.createElement("tr");
      tr.className="pp-row";
      if(row.jugador===myName) tr.classList.add("me");
      tr.innerHTML=`<td>${row.jugador}</td><td>${row.puntos??0}</td>`;
      $tbody.appendChild(tr);
    }
  }

  /* ========== Turno activo (sincronizado) ========== */
  async function refreshTurno(){
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, jugando, created_at")
      .eq("jugando", true)
      .order("created_at", { ascending:true })
      .limit(1);

    if (error) { console.error("[turno]", error); return; }
    const actual = data?.[0]?.usuario || "—";
    if ($turn) $turn.textContent = actual;
  }

  /* ========== Pulsar botón ========== */
  $btn?.addEventListener("click", async () => {
    if (!myName) return;

    const { data, error } = await supabase
      .from("pulsador")
      .select("id, activado")
      .eq("usuario", myName)
      .maybeSingle();

    if (error) { console.error("[pulsar]", error); return; }

    if (data?.activado) {
      if ($hint) $hint.textContent="Ya has pulsado";
      return;
    }

    const { error: updError } = await supabase
      .from("pulsador")
      .update({ activado:true, created_at:new Date().toISOString() })
      .eq("id", data.id);

    if (updError) {
      console.error("[pulsar update]", updError);
    } else {
      if ($hint) $hint.textContent="Has pulsado ✅";
    }
  });

  /* ========== Subscriptions realtime ========== */
  supabase.channel("pp-gate")
    .on("postgres_changes", { event:"*", schema:"public", table:"pulsador", filter:`usuario=eq.${myName}` }, checkGate)
    .subscribe();

  supabase.channel("pp-marcador")
    .on("postgres_changes", { event:"*", schema:"public", table:"marcador" }, refreshMarcador)
    .subscribe();

  supabase.channel("pp-turno")
    .on("postgres_changes", { event:"*", schema:"public", table:"pulsador" }, refreshTurno)
    .subscribe();

  /* ========== Polling backup ========== */
  function startPolling(){ if(!pollId) pollId=setInterval(()=>{ checkGate(); refreshMarcador(); refreshTurno(); },2000); }
  function stopPolling(){ if(pollId){ clearInterval(pollId); pollId=null; } }

  await resolveName();
  await checkGate();
  await refreshMarcador();
  await refreshTurno();
  startPolling();

  window.addEventListener("online", ()=>{ stopPolling(); checkGate(); refreshMarcador(); refreshTurno(); });
  window.addEventListener("offline", ()=> startPolling());
}
