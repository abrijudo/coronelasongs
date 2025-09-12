import { supabase } from "@db/supabase.js";

export async function initPulsador() {


  /* ======== Claves compartidas con timer.js ======== */
  const TURN_KEY     = "turn:current";
  const DEADLINE_KEY = "turn:deadline";
  const STARTED_KEY  = "turn:startedAt";
  const RUNNING_KEY  = "turn:running";
  const TURN_MS      = 20000;           // duración del turno (ajústalo si quieres)

  const $turnName  = document.querySelector("[data-turn-name]");
  const $resultBox = document.getElementById("resultBtns");

  const now = () => Date.now();
  const isRunning = () => Number(localStorage.getItem(DEADLINE_KEY) || 0) > now();
  const setTurnName = (t) => { if ($turnName) $turnName.textContent = t || "—"; };
  const pokeTimer = () => window.dispatchEvent(new CustomEvent("turn:changed"));

  function startTurn(name){
    if (isRunning()) return;            // evita duplicados
    const dl = now() + TURN_MS;
    localStorage.setItem(TURN_KEY, String(name || ""));
    localStorage.setItem(STARTED_KEY, String(now()));
    localStorage.setItem(DEADLINE_KEY, String(dl));
    localStorage.setItem(RUNNING_KEY, "1");
    setTurnName(name || "—");
    $resultBox?.classList.remove("hidden");
    pokeTimer();
  }

  function stopTurn(){
    localStorage.removeItem(RUNNING_KEY);
    localStorage.removeItem(DEADLINE_KEY);
    localStorage.removeItem(STARTED_KEY);
    $resultBox?.classList.add("hidden");
    pokeTimer();
  }

  /* ---------- utilidades ---------- */
  const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ========== LISTAS (jugando = true) ========== */
  const $listOn   = document.getElementById("listOn");
  const $listOff  = document.getElementById("listOff");
  const $countOn  = document.getElementById("countOn");
  const $countOff = document.getElementById("countOff");
  const $resetBtn = document.getElementById("resetBtn");

  // guardamos el set anterior de usuarios activados para detectar “nuevo activado”
  let prevActive = new Set();

  async function cargarListas(){
    const { data, error } = await supabase
      .from("pulsador")
      .select("usuario, activado, jugando")
      .eq("jugando", true)
      .order("usuario", { ascending:true });

    if (error) { console.error(error); return; }

    // render
    let on = 0, off = 0;
    $listOn.innerHTML = "";
    $listOff.innerHTML = "";
    (data || []).forEach(r => {
      const p = document.createElement("p"); p.textContent = r.usuario ?? "(sin nombre)";
      if (r.activado) { $listOn.appendChild(p); on++; } else { $listOff.appendChild(p); off++; }
    });
    $countOn.textContent  = String(on);
    $countOff.textContent = String(off);

    // --- lógica de activación por diferencia ---
    const currentActive = new Set((data || []).filter(r => r.activado).map(r => r.usuario));
    // recién activados = currentActive - prevActive
    const newly = [...currentActive].filter(u => !prevActive.has(u));
    // si aparece alguien nuevo activado -> arrancamos turno (si no está corriendo)
    if (newly.length && !isRunning()) startTurn(newly[0]);
    // si ya no queda nadie activado -> paramos turno
    if (!currentActive.size && isRunning()) stopTurn();

    prevActive = currentActive;
  }

  async function resetear(){
    if (!($resetBtn instanceof HTMLButtonElement)) return;
    $resetBtn.disabled = true;
    try{
      const { error } = await supabase.from("pulsador").update({ activado:false }).not("id","is",null);
      if (error) console.error(error);
    } finally {
      $resetBtn.disabled = false;
      stopTurn();
      setTurnName("—");
      cargarListas();
    }
  }
  $resetBtn?.addEventListener("click", resetear);

  /* ========== MARCADOR ========== */
  const $scoreBody = document.getElementById("scoreBody");
  const esc = (s) => (s ?? "").toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[m]));
  function renderScore(rows=[]){
    if (!rows.length) { $scoreBody.innerHTML = `<tr><td class="empty" colspan="2">Sin jugadores aún.</td></tr>`; return; }
    $scoreBody.innerHTML = rows.map(r => `
      <tr><td>${esc(r.jugador || '').toUpperCase()}</td><td>${Number(r.puntos)||0}</td></tr>
    `).join("");
  }
  async function cargarMarcador(){
    const { data, error } = await supabase
      .from("marcador").select("jugador, puntos")
      .order("puntos",{ascending:false})
      .order("jugador",{ascending:true});
    if (error) { console.error(error); return; }
    renderScore(data||[]);
  }

  /* ========== realtime + polling ========== */
  const debList  = debounce(cargarListas, 120);
  const debScore = debounce(cargarMarcador, 120);

  let chP=null, chS=null;
  function subRealtime(){
    if (chP) supabase.removeChannel(chP);
    if (chS) supabase.removeChannel(chS);

    // pulsador: arranca turno en UPDATE false->true
    chP = supabase
      .channel("pulsador-live")
      .on("postgres_changes", { event:"*", schema:"public", table:"pulsador" }, (payload) => {
        debList();
        if (payload.eventType === "UPDATE") {
          const was = !!payload?.old?.activado;
          const nowOn = !!payload?.new?.activado;
          if (!was && nowOn && payload?.new?.jugando) {
            const name = payload?.new?.usuario || "";
            startTurn(name);
          }
          // si todos van a false, el polling lo apagará; aquí solo apagamos si quieres al detectar un reset duro global
        }
      })
      .subscribe();

    chS = supabase
      .channel("marcador-live")
      .on("postgres_changes", { event:"*", schema:"public", table:"marcador" }, () => debScore())
      .subscribe();
  }

  // polling de respaldo
  const FAST_MS = 1200;
  let t1=null, t2=null;
  function startLoops(){ if (!document.hidden){ if(!t1) t1=setInterval(cargarListas,FAST_MS); if(!t2) t2=setInterval(cargarMarcador,FAST_MS);} }
  function stopLoops(){ if(t1){clearInterval(t1);t1=null;} if(t2){clearInterval(t2);t2=null;} }

  // primera carga + estado previo del turno
  await Promise.all([cargarListas(), cargarMarcador()]);
  setTurnName(localStorage.getItem(TURN_KEY) || "—");
  if (isRunning()) $resultBox?.classList.remove("hidden"); else $resultBox?.classList.add("hidden");

  subRealtime();
  startLoops();

  document.addEventListener("visibilitychange", () => { if (document.hidden) stopLoops(); else { startLoops(); cargarListas(); cargarMarcador(); }});
  window.addEventListener("online",  () => { startLoops(); cargarListas(); cargarMarcador(); subRealtime(); });
  window.addEventListener("offline", () => { startLoops(); });

  window.addEventListener("beforeunload", () => { if (chP) supabase.removeChannel(chP); if (chS) supabase.removeChannel(chS); stopLoops(); });
}
