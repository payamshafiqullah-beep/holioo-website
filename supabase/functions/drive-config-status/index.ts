// Public readiness check used by the deploy workflow (booleans only, never values).
Deno.serve(() => new Response(JSON.stringify({
  configured: Boolean(Deno.env.get('GOOGLE_CLIENT_ID') && Deno.env.get('GOOGLE_CLIENT_SECRET')),
  has_client_id: Boolean(Deno.env.get('GOOGLE_CLIENT_ID')),
  has_client_secret: Boolean(Deno.env.get('GOOGLE_CLIENT_SECRET')),
  has_redirect_uri: Boolean(Deno.env.get('GOOGLE_REDIRECT_URI')),
}), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }));
