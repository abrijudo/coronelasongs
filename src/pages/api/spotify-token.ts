import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ cookies }) => {
  const token = cookies.get("spotify_token")?.value ?? null;

  return new Response(
    JSON.stringify({ token }),
    { headers: { "Content-Type": "application/json" } }
  );
};
