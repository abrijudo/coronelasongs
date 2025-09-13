import { supabase } from "@db/supabase.js";

async function initInsertarCanciones() {
  const form = document.getElementById("cancion-form");
  if (!(form instanceof HTMLFormElement)) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombre = document.getElementById("nombre");
    const tipo   = document.getElementById("tipo");
    const url    = document.getElementById("url");

    if (!(nombre instanceof HTMLInputElement) ||
        !(tipo instanceof HTMLInputElement) ||
        !(url instanceof HTMLInputElement)) {
      alert("❌ Todos los campos son obligatorios");
      return;
    }

    try {
      const { error } = await supabase
        .from("musica")
        .insert([{
          nombre: nombre.value.trim(),
          tipo: tipo.value.trim(),
          url: url.value.trim(),
          reproducir: true
        }]);

      if (error) throw error;

      alert("✅ Canción insertada correctamente");
      form.reset();
    } catch {
      alert("❌ Error al insertar la canción. Inténtalo de nuevo.");
    }
  });
}

initInsertarCanciones();
