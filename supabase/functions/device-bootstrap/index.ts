// Retired: anonymous device accounts are replaced by mandatory Google sign-in.
// Kept as a stub so old cached app versions get a clear answer instead of creating accounts.
import { cors, json } from '../_shared/util.ts';

Deno.serve((req) => req.method === 'OPTIONS'
  ? new Response('ok', { headers: cors })
  : json({ error: 'Connexion avec Google requise. Mettez à jour Holioo.' }, 410));
