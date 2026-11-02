/*
 * /api/mint-signature   the mint of a Not Fungible Moments arcade run (called by the arcade's end screen and by /mint/).
 *   GET  → { configured, chainId, contract, signer, explorer, openseaAsset }
 *   POST { to, seed, action, expression, prop, rarity, score, seal }
 *        → { runId, look, signature, contract, chainId, data, lookFor, explorer, openseaAsset }
 *        `data` is the whole mintNFA transaction: the player sends it to `contract` with value 0 (gas only).
 * A wrong or forged seal gets 403. The contract refuses a second mint of the same run (usedRun), so this needs no database.
 * Netlify environment variables:
 *   NFA_SEAL_KEY       the 64 hex digits of arcade/deploy/private/nfa-seal.key (the same key as the arcade verifier)
 *   NFA_CONTRACT       the collection contract (0x...), whose owner called setSigner(<signer>)
 *   NFA_CHAIN_ID       11155111 (Sepolia) or 1 (Ethereum)
 *   NFA_EXPLORER       optional, e.g. https://sepolia.etherscan.io
 *   NFA_OPENSEA_ASSET  optional, e.g. https://testnets.opensea.io/assets/sepolia  (+ /<contract>/<tokenId>)
 */
import {
  addressOf, lookForCalldata, lookOfSeed, mintCalldata, mintHash, parseVoucher, runIdOf, sealIsValid, signHash, signerKeyOf,
} from './mint-core.mjs';

const CORS = {
  'access-control-allow-origin': '*',            // the seal is the check, not the origin: the arcade and /mint/ both call this
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};
const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function settings(env) {
  const key = (env.NFA_SEAL_KEY || '').trim().toLowerCase().replace(/^0x/, '');
  const contract = (env.NFA_CONTRACT || '').trim().toLowerCase();
  const chainId = Number((env.NFA_CHAIN_ID || '').trim());
  if (!/^[0-9a-f]{64}$/.test(key) || !/^0x[0-9a-f]{40}$/.test(contract) || /^0x0{40}$/.test(contract)
    || !Number.isSafeInteger(chainId) || chainId <= 0) return null;
  const signerKey = signerKeyOf(key);
  return {
    key, contract, chainId, signerKey, signer: addressOf(signerKey),
    explorer: (env.NFA_EXPLORER || '').trim().replace(/\/+$/, ''),
    openseaAsset: (env.NFA_OPENSEA_ASSET || '').trim().replace(/\/+$/, ''),
  };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const s = settings(process.env);
  const pub = s ? { chainId: s.chainId, contract: s.contract, explorer: s.explorer, openseaAsset: s.openseaAsset } : {};
  if (req.method === 'GET') return reply(200, s ? { configured: true, signer: s.signer, ...pub } : { configured: false });
  if (req.method !== 'POST') return reply(405, { error: 'GET or POST' });
  if (!s) return reply(503, { configured: false, error: 'The mint opens with the contract.' });

  const text = await req.text();
  if (text.length > 2048) return reply(413, { error: 'Too large' });
  let body;
  try { body = JSON.parse(text); } catch { return reply(400, { error: 'Invalid JSON' }); }
  const v = parseVoucher(body);
  if (v instanceof Error) return reply(400, { error: v.message });
  if (!sealIsValid(s.key, v)) return reply(403, { error: 'This run is not sealed by the arcade.' });

  const runId = runIdOf(v);
  const signature = signHash(s.signerKey, mintHash(s.chainId, s.contract, v, runId));
  return reply(200, {
    runId, look: lookOfSeed(v.seed), signature, data: mintCalldata(v, runId, signature), lookFor: lookForCalldata(runId), ...pub,
  });
};

export const config = { path: '/api/mint-signature' };
