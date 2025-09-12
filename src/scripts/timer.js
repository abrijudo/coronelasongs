import { supabase } from "@db/supabase.js";
import { initTimer } from "./timer.js";

export async function initParticipantes() {
  // ... (tu código actual)

  // === BOTÓN PULSAR (robusto/atómico) ===
  if ($btn) {
    $btn.addEventListener("click", async () => {
      if (!myName) return;

      // llama a la función atómica en BD
      const { error } = await supabase.rpc("press_button", { p_usuario: myName });

      if (error) {
        console.error("press_button:", error);
        if ($hint) $hint.textContent = "No se pudo pulsar.";
        return;
      }
      if ($hint) $hint.textContent = "Has pulsado ✅";
      // el timer y el turno se sincronizan solos por Realtime + get_current_turn()
    });
  }

  // ... (init, suscripciones, marcador, etc.)
  await initTimer();
}
