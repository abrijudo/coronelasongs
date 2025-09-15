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
  let lastTurn = null;

  // --- Asegura que timer.js esté listo antes de usar window.startTimer
  let _timerReady = false;
  async function ensureTimerReady() {
    if (_timerReady) return true;
    if (window.startTimer && window.stopTimer) { _timerReady = true; return true; }
    try {
      const mod = await import("./timer.js"); // ajusta la ruta si mueves los archivos
      if (mod?.initTimer) mod.initTimer();
      _timerReady = !!(window.startTimer && window.stopTimer);
      return _timerReady;
    } catch (e) {
      console.error("[timer] No se pudo cargar timer.js", e);
      return false;
    }
  }

  function showGate(){ $gate.hidden=false; $root.hidden=true; }
  function showApp(){ $gate.hidden=true; $root.hidden=false; }

  async function resolveName(){
    const { data: { user } } = await supabase.auth.getUser();
    myName = user?.user_metadata?.name || user?.email?.split("@")[0] || null;
    if ($me && myName) $me.textContent = myName;
  }

  async function checkGate(){
    // 🔥 siempre re-leemos el nombre
    await resolveName();

    if (!myName) { showGate(); return; }

    const { data, error } = await supabase
      .from("pulsador")
      .select("jugando")
      .eq("usuario", myName)
      .maybeSingle();

    if (error) {
      console.error("[gate]", error);
      showGate();
      return;
    }

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
      .select("usuario, turno_inicio, activado, fallado, created_at, id")
      .eq("activado", true)
      .eq("fallado", false)
      .order("created_at", { ascending:true })
      .order("id", { ascending:true })
      .limit(1);

    if (error) { console.error("[turno]", error); return; }
    const actual = data?.[0];
    const currentTurn = actual?.usuario || null;

    if ($turn) $turn.textContent = currentTurn || "—";

    // Siempre re-evaluamos el timer en base a turno_inicio
    await ensureTimerReady();
    if (actual?.turno_inicio) {
      window.startTimer(actual.usuario, actual.turno_inicio);
    } else {
      if (window.stopTimer) window.stopTimer();
    }

    lastTurn = currentTurn;
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

    if (data?.activado) {
      $hint.textContent = data.fallado
        ? "❌ Has fallado la canción"
        : "⚠️ Ya has pulsado";
      return;
    }

    // ¿hay turno activo?
    const { data: turnoActivo } = await supabase
      .from("pulsador")
      .select("id")
      .not("turno_inicio", "is", null)
      .limit(1);

    const updateFields = {
      activado: true,
      created_at: new Date().toISOString(),
      fallado: false,
      ...( (!turnoActivo?.length) ? { turno_inicio: new Date(Date.now() + 17000).toISOString() } : {} ),
    };

    const { error: updError } = await supabase
      .from("pulsador")
      .update(updateFields)
      .eq("id", data.id);

    if (updError) console.error("[pulsar update]", updError);
    else $hint.textContent = "⚠️ Ya has pulsado";
  });

  // ---- Realtime ----
  function subscribeRealtime(){
    supabase.channel("pp-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"pulsador" }, async () => {
        await refreshTurno();
        await checkGate();
      })
      .subscribe();

    supabase.channel("pp-marcador")
      .on("postgres_changes", { event:"*", schema:"public", table:"marcador" }, refreshMarcador)
      .subscribe();

    // 👇 escuchar cambios en profiles (nombre de usuario)
    supabase.channel("pp-profile")
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"profiles" }, async (payload) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (payload?.new?.id === user?.id) {
          await resolveName();
          await checkGate();
          await refreshMarcador();
          await refreshTurno();
        }
      })
      .subscribe();
  }

  // ---- Init ----
  await ensureTimerReady();
  await resolveName();
  await checkGate();
  await refreshMarcador();
  await refreshTurno();
  subscribeRealtime();
}
