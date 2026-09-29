// Google redirects here after sign-in (and Drive permission). It:
//  1. checks the state, exchanges the code, reads the Google identity
//  2. refuses blocked accounts
//  3. finds or creates the Holioo user and opens a session for it
//  4. stores the Drive refresh token server-side (private schema)
//  5. sends the browser back to the app with a one-time code (no token in the URL)
import { admin, anon, env, page, randomToken, REDIRECT_URI, sql } from '../_shared/util.ts';

const holiooId = (id: string) => `h${id.replace(/-/g, '').slice(0, 10)}`;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let back = 'https://www.holioo.fr/app/';
  try {
    if (url.searchParams.get('error')) return page('Connexion annulée', 'Vous n’avez pas été connecté à Holioo.', back);
    const code = url.searchParams.get('code'), state = url.searchParams.get('state');
    if (!code || !state) return page('Lien invalide', 'Recommencez la connexion depuis Holioo.', back);

    const [st] = await sql`delete from private.oauth_states where state = ${state} returning return_to, user_id, expires_at`;
    if (!st || new Date(st.expires_at).getTime() < Date.now()) return page('Lien expiré', 'Recommencez la connexion depuis Holioo.', back);
    back = st.return_to;

    // Google tokens + identity
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
    });
    const tok = await tr.json();
    if (!tr.ok || !tok.access_token) throw new Error(tok.error_description || tok.error || 'Échange Google refusé');
    const ur = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const g = await ur.json();
    if (!ur.ok || !g.email || g.email_verified === false) throw new Error('Adresse Google non vérifiée');
    const email = String(g.email).toLowerCase();

    // Blocked accounts never get a session.
    const [blocked] = await sql`select 1 from public.profiles where lower(email) = ${email} and blocked`;
    if (blocked) return page('Accès bloqué', 'Votre accès à Holioo a été suspendu. Contactez l’administrateur si vous pensez qu’il s’agit d’une erreur.', 'https://www.holioo.fr/');

    // Find or create the auth user, then open a session through a server-side magic link
    // (generateLink never sends an e-mail).
    const sb = admin();
    const meta = { full_name: g.name || null, avatar_url: g.picture || null, provider: 'google', google_sub: g.sub };
    const created = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta });
    if (created.error && !/already|exists|registered/i.test(created.error.message)) throw created.error;
    const link = await sb.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error) throw link.error;
    const user = link.data.user;
    if (created.error) await sb.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, ...meta } });
    const otp = await anon().auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
    if (otp.error || !otp.data.session) throw otp.error || new Error('Session introuvable');

    // Profile (admin role comes from private.admin_emails)
    const [isAdmin] = await sql`select 1 from private.admin_emails where lower(email) = ${email}`;
    const name = g.name || email.split('@')[0];
    await sql`
      insert into public.profiles (id, user_id, holioo_id, email, name, display_name, avatar_url, role, last_login_at)
      values (${user.id}, ${user.id}, ${holiooId(user.id)}, ${email}, ${name}, ${name}, ${g.picture || null}, ${isAdmin ? 'admin' : 'user'}, now())
      on conflict (id) do update set
        email = excluded.email,
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        role = case when ${!!isAdmin} then 'admin' else public.profiles.role end,
        last_login_at = now()`;

    // Drive permission (refresh token only comes on consent; keep the previous one otherwise)
    const hasDrive = String(tok.scope || '').includes('drive.file');
    if (hasDrive && tok.refresh_token) {
      await sql`insert into private.drive_tokens (user_id, refresh_token, email, scope, updated_at)
                values (${user.id}, ${tok.refresh_token}, ${email}, ${tok.scope}, now())
                on conflict (user_id) do update set refresh_token = excluded.refresh_token, email = excluded.email, scope = excluded.scope, updated_at = now()`;
    }
    const [drive] = await sql`select 1 from private.drive_tokens where user_id = ${user.id}`;
    if (!drive && hasDrive && !st.user_id) {
      // No stored refresh token yet: ask Google once more with consent (states with a user_id never loop).
      const state2 = randomToken();
      await sql`insert into private.oauth_states (state, return_to, user_id, expires_at) values (${state2}, ${back}, ${user.id}, now() + interval '10 minutes')`;
      const p = new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: REDIRECT_URI, response_type: 'code', scope: tok.scope, access_type: 'offline', prompt: 'consent', login_hint: email, state: state2 });
      return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`, 302);
    }
    await sql`insert into public.drive_status (user_id, connected, email, updated_at) values (${user.id}, ${!!drive}, ${email}, now())
              on conflict (user_id) do update set connected = excluded.connected, email = excluded.email, updated_at = now()`;

    // Hand the session to the app through a one-time code.
    const loginCode = randomToken();
    await sql`delete from private.login_codes where expires_at < now()`;
    await sql`insert into private.login_codes (code, access_token, refresh_token, expires_at)
              values (${loginCode}, ${otp.data.session.access_token}, ${otp.data.session.refresh_token}, now() + interval '2 minutes')`;
    return Response.redirect(`${back.split('#')[0]}#holioo_login=${loginCode}`, 302);
  } catch (e) {
    console.error(e);
    return page('Connexion impossible', e instanceof Error ? e.message : String(e), back);
  }
});
