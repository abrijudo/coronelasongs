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

      // ===== Opción A: actualizar las 3 tablas desde cliente =====
      async function guardarPerfil() {
        if (!nameInput) return;

        const newName = nameInput.value.trim();
        if (!newName) { alert("⚠️ El nombre no puede estar vacío"); return; }

        const { user } = await obtenerUsuario();
        if (!user) { alert("No hay sesión"); return; }

        // 1) Actualiza metadata del usuario (auth)
        const { error: authError } = await supabase.auth.updateUser({ data: { name: newName } });
        if (authError) {
          alert("❌ Error al actualizar perfil: " + authError.message);
          return;
        }

        // 2) Cambios en BD en paralelo:
        //    - pulsador.usuario (donde == nombre anterior)
        //    - marcador.jugador (donde == nombre anterior)
        //    - profiles.display_name (por id del usuario)
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

        const results = await Promise.allSettled(tasks);

        const failed = results
          .map((r, i) => ({ i, r }))
          .filter(x => x.r.status === 'rejected' || (x.r.value && x.r.value.error));

        if (failed.length) {
          console.error('Fallos al renombrar en tablas:', failed);
          alert('⚠️ Se cambió el nombre, pero alguna tabla no se pudo actualizar. Revisa la consola.');
        } else {
          alert("✅ ¡Nombre actualizado en todas las tablas!");
          currentUserName = newName; // ahora este es el nombre “anterior”
        }

        // 3) Si no existía en pulsador (usuario nuevo), crea el registro base
        const { data: existsRow, error: checkErr } = await supabase
          .from('pulsador')
          .select('id')
          .eq('usuario', newName)
          .maybeSingle();

        if (!existsRow && !checkErr) {
          await supabase.from('pulsador').insert({
            usuario: newName,
            activado: false,
            rol: 'user',
            created_at: new Date().toISOString()
          });
        }
      }

      async function cambiarContrasena() {
        const newPassword = prompt("🔑 Ingresa tu nueva contraseña:");
        if (!newPassword) return;
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) alert("❌ Error: " + error.message);
        else alert("✅ ¡Contraseña cambiada!");
      }

      // Cerrar sesión + sincronizar cookie SSR
      async function cerrarSesion() {
        await supabase.auth.signOut();
        await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'SIGNED_OUT', session: null })
        });
        window.location.replace('/');
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
