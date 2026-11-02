/*
 * Binding a mint to its run. The collection is a SuperRare Lazy ERC-721 sold by RareMinter: buyers get sequential token ids and the
 * contract knows nothing about the game. So when the end screen's mint is done, the page posts the run's sealed voucher and the
 * transaction hash; this file checks both (the seal proves a real paid run, the chain proves the token went to that run's wallet)
 * and records the traits for that token. The token's metadata (nfa-token.mjs) reads them.
 * One run binds one token, one token binds one run, one person (look) goes to one token: every write is "only if new".
 */
import { canonLook, lookOfSeed, parseVoucher, sealIsValid } from './mint-core.mjs';

export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_TOPIC = '0x' + '0'.repeat(64);
const DEFAULT_RPC = { 1: 'https://ethereum-rpc.publicnode.com', 11155111: 'https://ethereum-sepolia-rpc.publicnode.com' };

export function releaseConfig(env) {
  const contract = (env.NFA_RELEASE_CONTRACT || '').toLowerCase();
  const chainId = Number(env.NFA_CHAIN_ID || 1);
  const sealKey = env.NFA_SEAL_KEY || '';
  const ok = /^0x[0-9a-f]{40}$/.test(contract) && (chainId === 1 || chainId === 11155111) && /^[0-9a-f]{64}$/.test(sealKey);
  return {
    open: ok, contract, chainId, sealKey,
    currency: 'ETH', unitPrice: env.NFA_RELEASE_PRICE || '0',
    rpcUrl: env.NFA_RPC_URL || DEFAULT_RPC[chainId],
    explorer: chainId === 1 ? 'https://etherscan.io' : 'https://sepolia.etherscan.io',
    openseaAsset: chainId === 1 ? 'https://opensea.io/assets/ethereum' : 'https://testnets.opensea.io/assets/sepolia',
  };
}

/** The tokens this transaction minted to `to` on the collection: ids as decimal strings. */
export function mintedTokens(receipt, contract, to) {
  const toTopic = '0x' + to.slice(2).toLowerCase().padStart(64, '0');
  return (receipt.logs || [])
    .filter((l) => String(l.address).toLowerCase() === contract && l.topics && l.topics.length === 4
      && l.topics[0] === TRANSFER && l.topics[1] === ZERO_TOPIC && String(l.topics[2]).toLowerCase() === toTopic)
    .map((l) => BigInt(l.topics[3]).toString());
}

/** The run's person, or the next free one with the same role (no two Not Fungible Avatars are the same person). */
async function takeLook(store, seed, tokenId) {
  let look = lookOfSeed(seed);
  for (let i = 0; i < 4096; i++) {
    if (await store.setIfNew('look/' + look, { tokenId })) return look;
    if ((await store.get('look/' + look))?.tokenId === tokenId) return look;   // a retry after an interruption
    look = canonLook((look + 16) & 0xffff);
  }
  return null;
}

const answer = (status, body) => ({ status, body });

/** body = the voucher + tx. Answers { status, body }; idempotent: asking again for the same run gives the same token. */
export async function claim(body, cfg, store, readReceipt) {
  if (!cfg.open) return answer(503, { error: 'The mint is not open yet.' });
  const { tx, ...rest } = body && typeof body === 'object' ? body : {};
  if (typeof tx !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return answer(400, { error: 'tx: a transaction hash' });
  const v = parseVoucher(rest);
  if (v instanceof Error) return answer(400, { error: v.message });
  if (!sealIsValid(cfg.sealKey, v)) return answer(403, { error: 'This run is not sealed by the game.' });
  const done = (t) => answer(200, {
    tokenId: t.id, look: t.l, txUrl: `${cfg.explorer}/tx/${t.tx}`, openseaUrl: `${cfg.openseaAsset}/${cfg.contract}/${t.id}`,
  });
  const bound = await store.get('run/' + v.seal);
  if (bound) return done(bound);
  const receipt = await readReceipt(tx);
  if (!receipt) return answer(202, { pending: true });                     // not mined yet: the page asks again
  if (receipt.status !== '0x1' && receipt.status !== 1) return answer(422, { error: 'That transaction failed on chain.' });
  const ids = mintedTokens(receipt, cfg.contract, v.to);
  if (!ids.length) return answer(422, { error: 'That transaction did not mint to the wallet that played this run.' });
  for (const id of ids) {
    if (!await store.setIfNew('token-lock/' + id, { seal: v.seal }) && (await store.get('token-lock/' + id))?.seal !== v.seal) continue;   // another run's token
    const look = await takeLook(store, v.seed, id);
    if (look === null) return answer(409, { error: 'No free person left for this role.' });
    const t = { id, a: v.action, e: v.expression, p: v.prop, r: v.rarity, l: look, s: v.score, tx };
    await store.setIfNew('token/' + id, t);
    await store.setIfNew('run/' + v.seal, t);
    return done(t);
  }
  return answer(409, { error: 'That token already belongs to another run.' });
}

/* Netlify Blobs as a small store whose writes can refuse to overwrite. */
export async function blobStore() {
  const { getStore } = await import('@netlify/blobs');
  const s = getStore({ name: 'nfa-tokens', consistency: 'strong' });
  return {
    get: (key) => s.get(key, { type: 'json' }),
    setIfNew: async (key, value) => Boolean((await s.setJSON(key, value, { onlyIfNew: true })).modified),
    set: (key, value) => s.setJSON(key, value),
  };
}

export async function rpcReceipt(rpcUrl, tx) {
  const res = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [tx] }) });
  if (!res.ok) throw new Error('rpc ' + res.status);
  const j = await res.json();
  if (j.error) throw new Error('rpc: ' + j.error.message);
  return j.result || null;
}
