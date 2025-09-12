import { supabase } from "@db/supabase.js";

export async function initParticipantes() {
  const $gate = document.getElementById("pp-locked");
  const $root = document.getElementById("pp-root");
  const $btn  = document.getElementById("pp-buzz");
  const $me   = document.getElementById("pp-user-name");
  const $tbody = document.getElementById("pp-body");

  let myName = null;
  let chGate = null;
  let chMarcador = null;
  let pollId = null;

  function showGate() {
    $root.hidden = true;
    $gate.hidden = false;
    if ($btn) $btn.disabled = true;
  }
  function showApp() {
    $gate.hidden = true;
    $root.hidden = false;
    if ($btn) $btn.disabled = false;
  }

  async function resolveName() {
    const { data: { user } } = await supabase.auth.getUser();
    myName = user?.user_metadata?.name || user?.email?.split("@")[0] || null;
    if ($me && myName) $me.textContent = myName;
  }

  // === CONTROL DE GATE (tabla pulsador) ===
  async function checkGate() {
    if (!myName) { await resolveName(); }
    if (!myName) { showGate(); return; }

    const { data, error } = await supabase
      .from("pulsador")
      .select("jugando")
      .eq("usuario", myName)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[gate] error:", error);
      showGate();
      return;
    }
    const jugando = Boolean(data?.jugando);
    jugando ? showApp() : showGate();
  }

  function startPolling() {
    if (!pollId) pollId = setInterval(checkGate, 5000);
  }
  function stopPolling() {
    if (pollId) { clearInterval(pollId); pollId = null; }
  }

  async function subscribeGate() {
    if (chGate) supabase.removeChannel(chGate);
    await resolveName();
    if (!myName) { showGate(); return; }

    chGate = supabase
      .channel("pp-gate")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "pulsador", filter: `usuario=eq.${myName}` },
        checkGate
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") stopPolling();
        if (status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED") {
          startPolling();
          setTimeout(subscribeGate, 1200);
        }
      });
  }

  // === MARCADOR (tabla marcador) ===
  async function refreshMarcador() {
    if (!$tbody) return;

    const { data, error } = await supabase
      .from("marcador")
      .select("jugador, puntos")
      .order("puntos", { ascending: false });

    if (error) {
      console.error("Error leyendo marcador:", error);
      return;
    }

    $tbody.innerHTML = "";

    if (!data || data.length === 0) {
      $tbody.innerHTML = `<tr><td colspan="2" class="empty">Sin jugadores</td></tr>`;
      return;
    }

    for (const row of data) {
      const tr = document.createElement("tr");
      tr.className = "pp-row";
      if (row.jugador === myName) tr.classList.add("me");
      tr.innerHTML = `
        <td>${row.jugador}</td>
        <td>${row.puntos ?? 0}</td>
      `;
      $tbody.appendChild(tr);
    }
  }

  async function subscribeMarcador() {
    if (chMarcador) supabase.removeChannel(chMarcador);

    chMarcador = supabase
      .channel("pp-marcador")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "marcador" },
        refreshMarcador
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refreshMarcador();
      });
  }

  // === INIT ===
  await checkGate();
  await subscribeGate();
  await refreshMarcador();
  await subscribeMarcador();

  window.addEventListener("offline", startPolling);
  window.addEventListener("online", () => { stopPolling(); subscribeGate(); subscribeMarcador(); });
  window.addEventListener("beforeunload", () => {
    if (chGate) supabase.removeChannel(chGate);
    if (chMarcador) supabase.removeChannel(chMarcador);
    stopPolling();
  });
}
