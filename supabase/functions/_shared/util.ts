// Shared helpers for Holioo edge functions.
import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const env = (k: string) => Deno.env.get(k) ?? '';
export const SUPABASE_URL = env('SUPABASE_URL');
export const REDIRECT_URI = env('GOOGLE_REDIRECT_URI') || `${SUPABASE_URL}/functions/v1/drive-auth-callback`;
export const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';

// Only these origins may receive a login code.
const ALLOWED_RETURN = [/^https:\/\/(www\.)?holioo\.fr\//, /^https:\/\/payamshafiqullah-beep\.github\.io\//, /^http:\/\/localhost(:\d+)?\//];
export const safeReturn = (u: string | null) =>
  u && ALLOWED_RETURN.some((r) => r.test(u)) ? u : 'https://www.holioo.fr/app/';

// Direct Postgres access for the private schema (not exposed through the REST API).
export const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 1 });

export const admin = () => createClient(SUPABASE_URL, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
export const anon = () => createClient(SUPABASE_URL, env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const randomToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');

// The signed-in user making this request, or null.
export async function requestUser(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  return error ? null : data.user;
}

export function googleAuthUrl(state: string, consent: boolean) {
  const params = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: consent ? 'consent select_account' : 'select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function newState(returnTo: string, userId: string | null = null) {
  const state = randomToken();
  await sql`delete from private.oauth_states where expires_at < now()`;
  await sql`insert into private.oauth_states (state, return_to, user_id, expires_at)
            values (${state}, ${returnTo}, ${userId}, now() + interval '10 minutes')`;
  return state;
}

// Simple branded HTML page for the OAuth callback (errors, blocked account).
export function page(title: string, text: string, back = 'https://www.holioo.fr/app/') {
  const h = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)}</title><style>body{font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;background:#F7F7FB;color:#1D2140;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}.card{background:#fff;border-radius:28px;padding:32px 24px;max-width:420px;text-align:center;box-shadow:0 18px 50px rgba(29,33,64,.12)}h1{font-size:22px;margin:0 0 10px}p{color:#8A8FA3;line-height:1.5}a{display:inline-block;margin-top:12px;padding:14px 22px;border-radius:18px;background:#5B67F1;color:#fff;text-decoration:none;font-weight:600}</style></head><body><div class="card"><h1>${h(title)}</h1><p>${h(text)}</p><a href="${h(back)}">Retour à Holioo</a></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
