/*
 * /api/claim  the end screen's mint (claim-core.mjs). Nothing is stored here: the chain holds runs, tickets and tokens, Studio holds the scores.
 * GET  ?wallet=0x…          is the mint open, on which contract, how many runs this wallet has waiting and left.
 * GET  ?tx=0x…&wallet=0x…   the token that transaction minted to that wallet.
 * POST { runId, seed, startedAt }: find that run on Studio's public leaderboard and put it on chain as a ticket for the wallet that played
 *      (202, ask again; 200, done, with the wallet). The page only names the run: wallet, score and tier come from Studio.
 * Netlify environment: NFA_CONTRACT, NFA_CHAIN_ID (1, or 11155111 to test), NFA_SIGNER_SECRET (64 hex, only here, in no build),
 * NFA_GAME_ID (the game's Studio app id), NFA_GAME_ORIGIN (https://….srstudio.dev, no path);
 * optional NFA_RPC_URL, NFA_MIN_RELAYER_WEI, NFA_PRICE_WEI, NFA_UNIT_PRICE, and the gas the site pays (claim-core.mjs bidOf):
 * NFA_CHEAP_GWEI (0.5: sent at once), NFA_HARD_GWEI (2: the ceiling), NFA_PATIENCE_SEC (180: the bid doubles every such wait).
 * The site's wallet pays the tickets' gas: it is the signer derived from NFA_SIGNER_SECRET, GET /api/claim?relayer=1 names it.
 */
import { grant, mintConfig, mintedInfo, mintStatus, rpcChain, studioBoard } from './claim-core.mjs';

/* The runs waiting for a cheap moment to go on chain, in groups, and the ones just sent (Netlify Blobs), so the site never pays twice. */
async function claimStore() {
  try {
    const { getStore } = await import('@netlify/blobs');
    const s = getStore({ name: 'nfa-claim', consistency: 'strong' });
    return {
      get: async (k) => (await s.get(k, { type: 'json' }))?.v ?? null, set: (k, v) => s.setJSON(k, { v }), del: (k) => s.delete(k),
      list: async (prefix) => (await s.list({ prefix })).blobs.map((b) => b.key),
    };
  } catch { return undefined; }
}

export default async (req) => {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const cfg = mintConfig(process.env), chain = rpcChain(cfg.rpcUrl), url = new URL(req.url);
  try {
    if (req.method === 'GET') {
      if (url.searchParams.has('relayer')) return json(200, { relayer: cfg.relayer });
      const wallet = (url.searchParams.get('wallet') || '').toLowerCase();
      const tx = url.searchParams.get('tx');
      if (tx) { const r = await mintedInfo(tx, wallet, cfg, chain); return json(r.status, r.body); }
      if (wallet && !/^0x[0-9a-f]{40}$/.test(wallet)) return json(400, { error: 'wallet: a 0x address' });
      return json(200, await mintStatus(cfg, chain, wallet));
    }
    if (req.method !== 'POST') return json(405, { error: 'GET or POST' });
    const text = await req.text();
    if (text.length > 2048) return json(413, { error: 'Too large' });
    let body;
    try { body = JSON.parse(text); } catch { return json(400, { error: 'Expected JSON' }); }
    const r = await grant(body, cfg, chain, studioBoard(cfg), Date.now(), await claimStore());
    return json(r.status, r.body);
  } catch (error) {
    console.error('claim', error);
    return json(503, { error: 'The site could not reach the chain or the leaderboard right now. Try again.' });
  }
};

export const config = { path: '/api/claim', rateLimit: { windowLimit: 40, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
