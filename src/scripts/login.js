import { supabase } from "@db/supabase.js"; // 👈 aquí sí puedes usar alias

export function initLogin() {
  const form = document.querySelector(".login-form");
  const btn = form?.querySelector(".btn-login");

  if (form instanceof HTMLFormElement) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = form.querySelector("#correo").value.trim();
      const password = form.querySelector("#password").value.trim();
      if (!email || !password) {
        alert("Por favor, completa correo y contraseña");
        return;
      }

      btn?.setAttribute("disabled", "true");

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        alert("Error al iniciar sesión: " + error.message);
        btn?.removeAttribute("disabled");
        return;
      }

      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "SIGNED_IN", session: data.session }),
      });

      window.location.replace("/");
    });
  }
}
