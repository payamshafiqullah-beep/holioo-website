// POST {action, ...} — admin only. Actions: list, update, block, unblock, delete.
import { admin, cors, json, requestUser, sql } from '../_shared/util.ts';

const EDITABLE = ['display_name', 'university', 'faculty', 'program', 'level', 'semester', 'academic_year'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const me = await requestUser(req);
    if (!me) return json({ error: 'Non autorisé' }, 401);
    const [mine] = await sql`select role, blocked from public.profiles where id = ${me.id}`;
    if (mine?.role !== 'admin' || mine.blocked) return json({ error: 'Réservé à l’administrateur' }, 403);

    const body = await req.json().catch(() => ({}));
    const sb = admin();
    const target = String(body.id || '');
    if (body.action !== 'list' && !target) return json({ error: 'Utilisateur manquant' }, 400);
    if (['block', 'delete'].includes(body.action) && target === me.id) return json({ error: 'Vous ne pouvez pas vous bloquer ou vous supprimer vous-même' }, 400);

    switch (body.action) {
      case 'list': {
        const users = [];
        for (let page = 1; ; page++) {
          const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) throw error;
          users.push(...data.users);
          if (data.users.length < 1000) break;
        }
        const profiles = await sql`select p.*, coalesce(d.connected, false) as drive_connected from public.profiles p left join public.drive_status d on d.user_id = p.id`;
        const byId = new Map(profiles.map((p) => [p.id, p]));
        return json({
          users: users.map((u) => {
            const p = byId.get(u.id) || {};
            return {
              id: u.id,
              email: u.email,
              device: /^device_.*@holioo\.app$/.test(u.email || ''),
              name: p.display_name || p.name || u.user_metadata?.full_name || '',
              avatar_url: p.avatar_url || u.user_metadata?.avatar_url || null,
              role: p.role || 'user',
              blocked: !!p.blocked,
              drive_connected: !!p.drive_connected,
              university: p.university || '', faculty: p.faculty || '', program: p.program || '',
              level: p.level || '', semester: p.semester || '', academic_year: p.academic_year || '',
              created_at: u.created_at,
              last_sign_in_at: p.last_login_at || u.last_sign_in_at,
            };
          }).sort((a, b) => String(b.last_sign_in_at || '').localeCompare(String(a.last_sign_in_at || ''))),
        });
      }
      case 'update': {
        const changes: Record<string, string> = {};
        for (const k of EDITABLE) if (typeof body.changes?.[k] === 'string') changes[k] = body.changes[k].trim().slice(0, 120);
        if (changes.display_name !== undefined) (changes as Record<string, string>).name = changes.display_name;
        if (!Object.keys(changes).length) return json({ error: 'Aucune modification' }, 400);
        await sql`update public.profiles set ${sql(changes)}, updated_at = now() where id = ${target}`;
        return json({ ok: true });
      }
      case 'block':
      case 'unblock': {
        const blocked = body.action === 'block';
        await sql`update public.profiles set blocked = ${blocked}, updated_at = now() where id = ${target}`;
        // Ban at the auth level too, so existing sessions cannot be refreshed.
        const { error } = await sb.auth.admin.updateUserById(target, { ban_duration: blocked ? '876000h' : 'none' });
        if (error) throw error;
        return json({ ok: true });
      }
      case 'delete': {
        const files = await sb.storage.from('public-materials').list(target, { limit: 1000 });
        for (const dir of files.data || []) {
          const inner = await sb.storage.from('public-materials').list(`${target}/${dir.name}`, { limit: 1000 });
          const paths = (inner.data || []).map((f) => `${target}/${dir.name}/${f.name}`);
          if (paths.length) await sb.storage.from('public-materials').remove(paths);
        }
        await sql.begin(async (tx) => {
          await tx`delete from private.drive_tokens where user_id = ${target}`;
          await tx`delete from private.oauth_states where user_id = ${target}`;
          await tx`delete from public.public_materials where owner_id = ${target}`;
          for (const t of ['inbox_photos', 'inbox_batches', 'photos', 'pdfs', 'sessions', 'sections', 'courses', 'drive_status']) {
            await tx`delete from ${tx('public.' + t)} where user_id = ${target}`;
          }
          await tx`delete from public.profiles where id = ${target}`;
        });
        const { error } = await sb.auth.admin.deleteUser(target);
        if (error) throw error;
        return json({ ok: true });
      }
      default:
        return json({ error: 'Action inconnue' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
