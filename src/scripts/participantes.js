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
  let timerInterval = null;
  let lastTurn = null; // para detectar cambio de turno

  function showGate(){ $gate.hidden=false; $root.hidden=true; }
  function showApp(){ $gate.hidden=true; $root.hidden=false; }

  async function resolveName(){
    const { data: { user } } = await supabase.auth.getUser();
    myName = user?.user_metadata?.name || user?.email?.split("@")[0] || null;
    if ($me && myName) $me.textContent = myName;
  }

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

  async function refreshTurno(){
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, created_at, fallado")
      .eq("activado", true)
      .eq("fallado", false)                 // solo los que no han fallado
      .order("created_at", { ascending:true })
      .limit(1);

    if (error) { console.error("[turno]", error); return; }
    const actual = data?.[0];
    const currentTurn = actual?.usuario || null;

    if ($turn) $turn.textContent = currentTurn || "—";

    // Sonido solo si cambia y soy yo
    if (currentTurn && currentTurn !== lastTurn && currentTurn === myName) {
      playBell();
    }

    if (actual?.created_at) {
      startTimerFrom(actual.created_at);
    } else {
      stopTimer();
    }

    lastTurn = currentTurn;
  }

  // ---- Mensaje dinámico ----
  async function refreshHint(){
    if (!myName || !$hint) return;

    const { data, error } = await supabase
      .from("pulsador")
      .select("activado, fallado")
      .eq("usuario", myName)
      .maybeSingle();

    if (error) { console.error("[hint]", error); return; }

    if (data?.activado && !data?.fallado) {
      $hint.textContent = "⚠️ Ya has pulsado";
    } else if (data?.activado && data?.fallado) {
      $hint.textContent = "❌ Has fallado la canción";
    } else if (!data?.activado && !data?.fallado) {
      $hint.textContent = "🎵 ¡Adivina la canción!";
    } else {
      $hint.textContent = "";
    }
  }

  // ---- Pulsar ----
  $btn?.addEventListener("click", async () => {
    if (!myName) return;

    const { data, error } = await supabase
      .from("pulsador")
      .select("id, activado, fallado")
      .eq("usuario", myName)
      .maybeSingle();

    if (error) { console.error("[pulsar]", error); return; }

    if (data?.activado && !data?.fallado) {
      $hint.textContent = "⚠️ Ya has pulsado";
      return;
    }
    if (data?.activado && data?.fallado) {
      $hint.textContent = "❌ Has fallado la canción";
      return;
    }

    if (!data?.activado) {
      const { error: updError } = await supabase
        .from("pulsador")
        .update({
          activado: true,
          created_at: new Date().toISOString(),
          fallado: false
        })
        .eq("id", data.id);

      if (updError) {
        console.error("[pulsar update]", updError);
      } else {
        $hint.textContent = "⚠️ Ya has pulsado";
      }
    }
  });

  // ---- Timer sincronizado ----
  function startTimerFrom(startTime) {
    const total = 15;
    const start = new Date(startTime).getTime();
    stopTimer();

    function tick() {
      const now = Date.now();
      const elapsed = Math.floor((now - start) / 1000);
      const remaining = total - elapsed;
      const $val = document.getElementById("timer-value");
      if ($val) $val.textContent = Math.max(0, remaining);
      if (remaining <= 0) stopTimer();
    }
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    const $val = document.getElementById("timer-value");
    if ($val) $val.textContent = "15";
  }

  // ---- Sonido agradable ----
  function playBell() {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 880; // tono agradable agudo
    gain.gain.setValueAtTime(0.15, ctx.currentTime); // volumen bajo

    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3); // corto
  }

  // ---- Realtime ----
  function subscribeRealtime(){
    supabase.channel("pp-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"pulsador" }, async () => {
        await refreshTurno();
        await refreshHint();
        await checkGate();
      })
      .subscribe();

    supabase.channel("pp-marcador")
      .on("postgres_changes", { event:"*", schema:"public", table:"marcador" }, refreshMarcador)
      .subscribe();
  }

  // ---- Init ----
  await resolveName();
  await checkGate();
  await refreshMarcador();
  await refreshTurno();
  await refreshHint();
  subscribeRealtime();
}
