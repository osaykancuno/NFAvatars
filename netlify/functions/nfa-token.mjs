/*
 * GET /token/<id>.json   the metadata of one token of the SuperRare release (its baseURI is <site>/token).
 * Bound to a run: the same blue-chip JSON as /api/nfa, with the traits that run earned. Not bound yet (the mint just happened, or the
 * token was minted without a run): a neutral placeholder, not cached for long, so it turns into the person as soon as the run is bound.
 */
import { blobStore } from './claim-core.mjs';
import { metadata } from './nfa-meta.mjs';

export const placeholder = (id, site) => ({
  name: 'Not Fungible Avatar #' + id,
  description: 'Somebody at the party is still getting ready. A Not Fungible Avatar is earned in a run of Not Fungible Moments on THE WALL ARCADE.',
  image: `${site}/assets/featured.png`,
  attributes: [{ trait_type: 'Status', value: 'Waiting for a run' }],
});

export async function tokenResponse(file, site, store) {
  const m = /^([1-9]\d{0,9})\.json$/.exec(file);
  const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' };
  if (!m) return new Response(JSON.stringify({ error: 'Not a token' }), { status: 400, headers: { ...headers, 'cache-control': 'no-store' } });
  const t = await store.get('token/' + m[1]);
  if (!t) return new Response(JSON.stringify(placeholder(m[1], site)), { headers: { ...headers, 'cache-control': 'public, max-age=30' } });
  return new Response(JSON.stringify(metadata({ ...t, id: Number(t.id) }, site)), { headers: { ...headers, 'cache-control': 'public, max-age=86400', 'netlify-cdn-cache-control': 'public, durable, max-age=31536000, immutable' } });
}

export default async (req) => {
  const url = new URL(req.url), file = url.pathname.split('/').pop();
  return tokenResponse(file, (process.env.NFA_SITE_URL || url.origin).replace(/\/+$/, ''), await blobStore());
};

export const config = { path: '/token/:file' };
