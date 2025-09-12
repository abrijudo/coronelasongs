import { supabase } from "@db/supabase.js";

export async function initParticipantes() {
  const $gate = document.getElementById("pp-locked");
  const $root = document.getElementById("pp-root");
  const $btn  = document.getElementById("pp-buzz"); // para deshabilitar si no juega
  const $me   = document.getElementById("pp-user-name");

  let myName = null;
  let chGate = null;
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

    // Filtro por usuario para menos ruido
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

  // ✅ Ahora sí puedes usar await aquí
  await checkGate();
  await subscribeGate();

  window.addEventListener("offline", startPolling);
  window.addEventListener("online", () => { stopPolling(); subscribeGate(); });
  window.addEventListener("beforeunload", () => {
    if (chGate) supabase.removeChannel(chGate);
    stopPolling();
  });
}
