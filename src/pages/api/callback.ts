import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ url }) => {
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("No code provided", { status: 400 });
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: import.meta.env.SPOTIFY_REDIRECT_URI!,
    client_id: import.meta.env.SPOTIFY_CLIENT_ID!,
    client_secret: import.meta.env.SPOTIFY_CLIENT_SECRET!,
  });

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await tokenRes.json();

  if (data.error) {
    return new Response(`Spotify error: ${data.error}`, { status: 400 });
  }

  // Guardamos access_token y refresh_token
  const headers: Record<string, string> = {
    Location: "/"
  };

  headers["Set-Cookie"] =
    `spotify_token=${data.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax`;

  if (data.refresh_token) {
    headers["Set-Cookie"] += `, spotify_refresh=${data.refresh_token}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  }

  return new Response(null, {
    status: 302,
    headers
  });
};
