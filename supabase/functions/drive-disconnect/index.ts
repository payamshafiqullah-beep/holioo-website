// POST by a signed-in user → revoke and forget the Drive permission.
import { cors, json, requestUser, sql } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requestUser(req);
    if (!user) return json({ error: 'Non autorisé' }, 401);
    const [row] = await sql`delete from private.drive_tokens where user_id = ${user.id} returning refresh_token`;
    if (row) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.refresh_token)}`, { method: 'POST' }).catch(() => {});
    await sql`update public.drive_status set connected = false, updated_at = now() where user_id = ${user.id}`;
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
