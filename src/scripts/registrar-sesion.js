import { supabase } from "@db/supabase.js";

export async function initRegistrarSesion() {


  // Limpia cualquier query si llegara (seguridad)
  if (window.location.search) {
    window.history.replaceState({}, '', '/registrar-sesion');
  }

  // Si estás logueado, vete al inicio
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) window.location.replace('/');
  })();

  // Mantén cookies sincronizadas (signup puede crear sesión si el proyecto no requiere confirmación)
  supabase.auth.onAuthStateChange(async (event, session) => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, session })
    });
  });

  const form = document.querySelector('.register-form');
  const btn = form?.querySelector('.btn-register');

  if (form instanceof HTMLFormElement) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const usuarioInput = document.getElementById('usuario');
      const correoInput = document.getElementById('correo');
      const passwordInput = document.getElementById('password');
      const confirmInput  = document.getElementById('confirmPassword');

      if (![usuarioInput, correoInput, passwordInput, confirmInput].every(el => el instanceof HTMLInputElement)) {
        alert('Uno o más campos no se encontraron'); return;
      }

      const usuario = usuarioInput.value.trim();
      const correo  = correoInput.value.trim();
      const pass    = passwordInput.value.trim();
      const confirm = confirmInput.value.trim();

      if (!usuario || !correo || !pass || !confirm) {
        alert('Por favor, completa todos los campos'); return;
      }
      if (pass !== confirm) {
        alert('Las contraseñas no coinciden'); return;
      }

      btn?.setAttribute('disabled', 'true');

      // 1) Registro en Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: correo,
        password: pass,
        options: {
          data: { name: usuario } // guarda también en user_metadata
        }
      });

      if (error) {
        alert('Error en el registro: ' + error.message);
        btn?.removeAttribute('disabled');
        return;
      }

      // Tenemos al menos data.user aunque el email requiera confirmación
      const newUser = data.user;

      // 2) Actualiza/crea el perfil (tabla profiles): role=user, display_name
      try {
        if (newUser?.id) {
          await supabase
            .from('profiles')
            .upsert(
              [{ id: newUser.id, role: 'user', display_name: usuario, updated_at: new Date().toISOString() }],
              { onConflict: 'id' }
            );
        }
      } catch (e) {
        console.warn('No se pudo upsert en profiles:', e);
      }

      // 3) Crea/asegura fila en `pulsador` con activado=false, rol=user, jugando=false
      try {
        // Busca si ya existe ese usuario en la tabla pulsador
        const { data: existing } = await supabase
          .from('pulsador')
          .select('id')
          .eq('usuario', usuario)
          .maybeSingle();

        if (existing?.id) {
          await supabase
            .from('pulsador')
            .update({ activado: false, rol: 'user', jugando: false })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('pulsador')
            .insert([{ usuario, activado: false, rol: 'user', jugando: false, created_at: new Date().toISOString() }]);
        }
      } catch (e) {
        console.warn('No se pudo crear/actualizar fila en pulsador:', e);
      }

      // 4) Si el proyecto NO requiere confirmación de email, habrá sesión ya
      if (data.session) {
        await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'SIGNED_IN', session: data.session })
        });
        window.location.replace('/');
        return;
      }

      // 5) Si requiere confirmación → sin sesión
      alert('✅ Registro hecho. Revisa tu email para confirmar la cuenta.');
      window.location.replace('/inicio-sesion');
    });
  }
}
