// GET → redirects the browser to Google (sign-in + Drive permission in one screen).
import { googleAuthUrl, newState, safeReturn, page } from '../_shared/util.ts';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const state = await newState(safeReturn(url.searchParams.get('return_to')));
    return Response.redirect(googleAuthUrl(state, url.searchParams.get('consent') === '1'), 302);
  } catch (e) {
    console.error(e);
    return page('Connexion impossible', 'Le service de connexion est momentanément indisponible. Réessayez dans un instant.');
  }
});
