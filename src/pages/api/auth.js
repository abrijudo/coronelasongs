export const prerender = false;

import { createServerClient } from '@supabase/ssr';

export async function POST({ request, cookies }) {
  const supabase = createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (name) => cookies.get(name)?.value,
        set: (name, value, options) => cookies.set(name, value, options),
        remove: (name, options) => cookies.delete(name, options),
      },
    }
  );

  const { event, session } = await request.json();

  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    await supabase.auth.setSession(session);
  } else if (event === 'SIGNED_OUT') {
    await supabase.auth.signOut();
  }

  return new Response(null, { status: 200 });
}
