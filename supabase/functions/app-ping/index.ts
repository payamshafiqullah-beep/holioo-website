// POST {deviceId, event: 'open' | 'beat', platform, version} — called by the app while it is open.
// Anonymous on purpose (guests have no account): it only records that a device is alive, never content.
// Whether the device belongs to a signed-in user comes from the Authorization header, not from the body.
import { cors, json, requestUser, sql } from '../_shared/util.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORMS = ['ipad', 'iphone', 'android', 'desktop'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.deviceId || '');
    if (!UUID.test(id)) return json({ error: 'Appareil invalide' }, 400);
    const platform = PLATFORMS.includes(body.platform) ? body.platform : 'other';
    const version = String(body.version || '').slice(0, 40);
    const opened = body.event === 'open' ? 1 : 0;
    const user = await requestUser(req);   // null for a guest

    await sql`
      insert into private.app_activity (device_id, user_id, platform, app_version, opens)
      values (${id}, ${user?.id ?? null}, ${platform}, ${version}, ${opened})
      on conflict (device_id) do update set
        user_id = coalesce(excluded.user_id, private.app_activity.user_id),
        platform = excluded.platform,
        app_version = excluded.app_version,
        opens = private.app_activity.opens + excluded.opens,
        last_seen_at = now()`;
    await sql`
      insert into private.app_activity_daily (day, device_id)
      values ((now() at time zone 'Europe/Paris')::date, ${id})
      on conflict do nothing`;
    return json({ ok: true });
  } catch (e) {
    console.error('app-ping', e);
    return json({ error: 'Erreur serveur' }, 500);
  }
});
