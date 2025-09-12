import { createServerClient } from "@supabase/ssr";

export const supabaseServer = (Astro) => {
  const { cookies } = Astro;

  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (key) => cookies.get(key)?.value,
        set: (key, value, options) =>
          cookies.set(key, value, { path: "/", ...options }),
        remove: (key, options) =>
          cookies.delete(key, { path: "/", ...options }),
      },
    }
  );
};
