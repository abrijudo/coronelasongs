import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ cookies }) => {
  let token = cookies.get("spotify_token")?.value;
  const refresh = cookies.get("spotify_refresh")?.value;

  if (!token && refresh) {
    // Pedimos un nuevo access_token usando el refresh_token
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: import.meta.env.SPOTIFY_CLIENT_ID!,
      client_secret: import.meta.env.SPOTIFY_CLIENT_SECRET!
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const data = await res.json();

    if (data.access_token) {
      token = data.access_token;
      return new Response(JSON.stringify({ token }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `spotify_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`
        }
      });
    }

    return new Response(JSON.stringify({ token: null, error: "No access token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ token }), {
    headers: { "Content-Type": "application/json" }
  });
};
