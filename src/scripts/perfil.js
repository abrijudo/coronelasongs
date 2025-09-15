import { supabase } from "@db/supabase.js";  // 👈 ruta relativa correcta

export function initPerfil() {
  const modal = document.getElementById('profileModal');
  const openBtn = document.getElementById('openProfileBtn');
  const closeBtn = document.getElementById('closeModalBtn');
  const saveBtn = document.getElementById('saveProfileBtn');
  const changePassBtn = document.getElementById('changePasswordBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const emailInput = document.getElementById('profileEmail');
  const nameInput = document.getElementById('profileName');

  // 👉 Aquí añadimos un contenedor para mensajes
  const msgBox = document.getElementById('profileMessage');

  let currentUserName = '';

  async function obtenerUsuario() {
    const { data, error } = await supabase.auth.getUser();
    if (error) { console.error("Error al obtener usuario:", error); return { user: null }; }
    return data;
  }

  async function cargarPerfil() {
    const { user } = await obtenerUsuario();
    if (!user) return;
    if (emailInput) emailInput.value = user.email || '';
    if (nameInput) {
      const savedName = (user.user_metadata && user.user_metadata.name) || '';
      nameInput.value = savedName;
      currentUserName = savedName;
    }
  }

  async function guardarPerfil() {
    if (!nameInput) return;

    const newName = nameInput.value.trim();
    if (!newName) { showMessage("⚠️ El nombre no puede estar vacío", true); return; }

    const { user } = await obtenerUsuario();
    if (!user) { showMessage("No hay sesión", true); return; }

    const { error: authError } = await supabase.auth.updateUser({ data: { name: newName } });
    if (authError) {
      showMessage("❌ Error al actualizar perfil: " + authError.message, true);
      return;
    }

    // Actualiza tablas relacionadas
    const tasks = [
      supabase.from('pulsador')
        .update({ usuario: newName })
        .eq('usuario', currentUserName),

      supabase.from('marcador')
        .update({ jugador: newName })
        .eq('jugador', currentUserName),

      supabase.from('profiles')
        .upsert(
          { id: user.id, display_name: newName },
          { onConflict: 'id' }
        )
    ];

    await Promise.allSettled(tasks);
    currentUserName = newName;

    // Cierra el modal + mensaje
    showMessage("✅ Cambios guardados correctamente");
    if (modal) modal.style.display = 'none';
  }

  async function cambiarContrasena() {
    const newPassword = prompt("🔑 Ingresa tu nueva contraseña:");
    if (!newPassword) return;
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) showMessage("❌ Error: " + error.message, true);
    else showMessage("✅ ¡Contraseña cambiada!");
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'SIGNED_OUT', session: null })
    });
    window.location.replace('/');
  }

  // 👉 función para mostrar mensajes
  function showMessage(text, isError = false) {
    if (!msgBox) return;
    msgBox.textContent = text;
    msgBox.style.color = isError ? "red" : "limegreen";
    msgBox.style.display = "block";

    setTimeout(() => {
      msgBox.style.display = "none";
    }, 3000);
  }

  // Abrir / cerrar modal
  openBtn?.addEventListener('click', () => { if (modal) { modal.style.display = 'block'; cargarPerfil(); } });
  closeBtn?.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
  window.addEventListener('click', (e) => { if (modal && e.target === modal) modal.style.display = 'none'; });

  // Acciones
  saveBtn?.addEventListener('click', guardarPerfil);
  changePassBtn?.addEventListener('click', cambiarContrasena);
  logoutBtn?.addEventListener('click', cerrarSesion);
}
