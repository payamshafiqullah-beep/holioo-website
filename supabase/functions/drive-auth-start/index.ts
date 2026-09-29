// POST {return_to} by a signed-in user → Google URL asking again for Drive permission.
import { cors, json, requestUser, newState, safeReturn, googleAuthUrl } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await requestUser(req);
    if (!user) return json({ error: 'Non autorisé' }, 401);
    const { return_to } = await req.json().catch(() => ({}));
    const state = await newState(safeReturn(return_to ?? null), user.id);
    return json({ auth_url: googleAuthUrl(state, true) });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
