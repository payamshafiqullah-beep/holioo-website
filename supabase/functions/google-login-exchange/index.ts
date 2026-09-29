// POST {code} → the session created by the Google callback (one-time use, 2 minutes).
import { cors, json, sql } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { code } = await req.json().catch(() => ({}));
    if (!code || typeof code !== 'string') return json({ error: 'Code manquant' }, 400);
    const rows = await sql`delete from private.login_codes where code = ${code} returning access_token, refresh_token, expires_at`;
    const row = rows[0];
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'Code expiré, reconnectez-vous' }, 410);
    return json({ access_token: row.access_token, refresh_token: row.refresh_token });
  } catch (e) {
    console.error(e);
    return json({ error: 'Échange impossible' }, 500);
  }
});
