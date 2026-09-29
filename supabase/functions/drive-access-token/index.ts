// POST by a signed-in user → short-lived Google Drive access token.
import { cors, json, requestUser, sql, env } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requestUser(req);
    if (!user) return json({ error: 'Non autorisé' }, 401);
    const [row] = await sql`select refresh_token from private.drive_tokens where user_id = ${user.id}`;
    if (!row) return json({ error: 'Google Drive non connecté' }, 409);
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: row.refresh_token, grant_type: 'refresh_token' }),
    });
    const t = await r.json();
    if (!r.ok || !t.access_token) {
      if (t.error === 'invalid_grant') {
        // Permission revoked or expired: mark Drive as disconnected so the app asks again.
        await sql`delete from private.drive_tokens where user_id = ${user.id}`;
        await sql`update public.drive_status set connected = false, updated_at = now() where user_id = ${user.id}`;
        return json({ error: 'Autorisation Google Drive expirée, reconnectez Drive' }, 409);
      }
      throw new Error(t.error_description || t.error || 'Impossible de renouveler Google Drive');
    }
    return json({ access_token: t.access_token, expires_in: t.expires_in || 3600 });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
