import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const client_id = import.meta.env.SPOTIFY_CLIENT_ID;
  const redirect_uri = import.meta.env.SPOTIFY_REDIRECT_URI;
  const scope = "playlist-read-private playlist-read-collaborative user-read-email user-read-private";

  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.append("response_type", "code");
  url.searchParams.append("client_id", client_id);
  url.searchParams.append("scope", scope);
  url.searchParams.append("redirect_uri", redirect_uri);

  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() }
  });
};
