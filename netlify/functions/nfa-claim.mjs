/*
 * /api/claim  the end screen's mint through SuperRare (claim-core.mjs).
 * GET   is the mint open, and on which release: what the arcade page passes to Connect's actions.mint.
 * POST  { to, seed, action, expression, prop, rarity, score, seal, tx }: bind that mint to that run.
 * Netlify environment: NFA_RELEASE_CONTRACT, NFA_CHAIN_ID (1, or 11155111 to test), NFA_SEAL_KEY, optional NFA_RELEASE_PRICE and NFA_RPC_URL.
 */
import { blobStore, claim, releaseConfig, rpcReceipt } from './claim-core.mjs';

export default async (req) => {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const cfg = releaseConfig(process.env);
  if (req.method === 'GET') return json(200, cfg.open ? { open: true, chainId: cfg.chainId, contract: cfg.contract, currency: cfg.currency, unitPrice: cfg.unitPrice } : { open: false });
  if (req.method !== 'POST') return json(405, { error: 'GET or POST' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Expected JSON' }); }
  try {
    const r = await claim(body, cfg, await blobStore(), (tx) => rpcReceipt(cfg.rpcUrl, tx));
    return json(r.status, r.body);
  } catch (error) {
    console.error('claim', error);
    return json(503, { error: 'The site could not check the chain right now. Try again.' });
  }
};

export const config = { path: '/api/claim' };
