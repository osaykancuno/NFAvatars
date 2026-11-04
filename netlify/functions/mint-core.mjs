/*
 * The arcade mint, server side (used by claim-core.mjs and tools/nfa-seal-key.mjs): the shared trait logic, the contract's signer and the
 * raw transaction. There is NO seal: the game's verifier holds no secret. A paid run is read from Studio's public leaderboard by
 * claim-core.mjs (run id, wallet and score all come from Studio), the traits are computed here with the very same rules as the game
 * (index.html ae-engine; tests/claim-function.test.mjs compares the two over thousands of run ids), and the signer below signs the
 * contract's mintHash. That signed run goes on chain as a ticket (the collection's grantRun).
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/* The person of a run: the same hash32 / canonLook as the game (index.html ae-engine, arcade core.ts). */
export function hash32(a, b) {
  let h = (a ^ Math.imul((b + 0x9E3779B9) | 0, 0x85EBCA6B)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7FEB352D);
  h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
  return (h ^ (h >>> 16)) >>> 0;
}
export const canonLook = (look) => {
  const l = look & 0xffff;
  return ((l >> 13) & 3) === 3 || ((l >> 7) & 7) === 7 ? l & 0x9fff : l;
};
export const lookOfSeed = (seed) => canonLook(hash32(seed >>> 0, 0x10c));

/* The score carries the tier: tier * 100000 + points (points capped at 99999, at least 1 overall). The game's encodeScore. */
export const TIER_STEP = 100000;
export const tierOfScore = (score) => Math.floor(score / TIER_STEP);
export const pointsOfScore = (score) => score % TIER_STEP;

/* The luck of the run: the game's traitSeedOfRun and picksOf (index.html ae-engine), with the same tier tables. */
export function traitSeedOfRun(runId) {
  let h = 0x811c9dc5;
  for (const byte of utf8ToBytes(String(runId).toLowerCase())) { h ^= byte; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const EXPR_START = [0, 3, 6, 9], EXPR_COUNT = [3, 3, 3, 2], PROP_START = [0, 5, 10, 15], PROP_COUNT = [5, 5, 5, 3];
/** Moment, expression and item of a run of this tier (0..3): { act, action, expression, prop } as the contract stores them. */
export function picksOf(rarity, traitSeed) {
  const ts = traitSeed >>> 0, act = hash32(ts, 0x51) % 6;
  const exprTier = hash32(ts, 0xE2) % (rarity + 1), propTier = hash32(ts, 0xA8) % (rarity + 1);
  return {
    act, action: act * 4 + rarity,
    expression: EXPR_START[exprTier] + hash32(ts, 0xE1) % EXPR_COUNT[exprTier],
    prop: PROP_START[propTier] + hash32(ts, 0xA7) % PROP_COUNT[propTier],
  };
}

/* The contract's secret-derived signer: one secret to keep (NFA_SIGNER_SECRET, on Netlify only, in no build), one address for setSigner(). */
export function signerKeyOf(secret) {
  const k = keccak_256(concatBytes(utf8ToBytes('Not Fungible Avatars signer v1|'), hexToBytes(secret)));
  if (!secp256k1.utils.isValidSecretKey(k)) throw new Error('Unusable signer secret: make a new one');
  return k;
}
export function addressOf(secretKey) {
  const pub = secp256k1.getPublicKey(secretKey, false);                  // 0x04 || x || y
  return '0x' + bytesToHex(keccak_256(pub.subarray(1)).subarray(12));
}

/* The contract's run id: the first 30 bytes of keccak256 of the (lowercase) platform run id, then the person (the contract mints
   lookFor(runId) from the low 16 bits and keys usedRun on the id shifted right by 16: one run, one ticket, whatever the look). */
export const runIdOf = (platformRunId, look) => '0x' + bytesToHex(keccak_256(utf8ToBytes(String(platformRunId).toLowerCase()))).slice(0, 60) + look.toString(16).padStart(4, '0');

const word = (n) => BigInt(n).toString(16).padStart(64, '0');
const strip = (hex) => hex.replace(/^0x/, '').toLowerCase();

/** keccak256(abi.encode(chainid, contract, to, action, expression, prop, rarity, score, runId)), as the contract's mintHash. v = { to, action, expression, prop, rarity, score }. */
export function mintHash(chainId, contract, v, runId) {
  const enc = word(chainId) + strip(contract).padStart(64, '0') + strip(v.to).padStart(64, '0')
    + word(v.action) + word(v.expression) + word(v.prop) + word(v.rarity) + word(v.score) + strip(runId);
  return keccak_256(hexToBytes(enc));
}

/** EIP-191 personal_sign of the 32-byte hash: r || s || v (27/28), what ECDSA.recover in the contract expects. */
export function signHash(secretKey, hash) {
  const prefixed = keccak_256(concatBytes(utf8ToBytes('\x19Ethereum Signed Message:\n32'), hash));
  const sig = secp256k1.sign(prefixed, secretKey, { prehash: false, format: 'recovered' });   // recovery || r || s
  return '0x' + bytesToHex(sig.subarray(1)) + (27 + sig[0]).toString(16);
}

const selector = (signature) => bytesToHex(keccak_256(utf8ToBytes(signature)).subarray(0, 4));
const GRANT = selector('grantRun(address,uint8,uint8,uint8,uint8,uint32,bytes32,bytes)');

/** The transaction data of grantRun(to, action, expression, prop, rarity, score, runId, signature). */
export function grantCalldata(v, runId, signature) {
  const sig = strip(signature);
  return '0x' + GRANT + strip(v.to).padStart(64, '0') + word(v.action) + word(v.expression) + word(v.prop)
    + word(v.rarity) + word(v.score) + strip(runId) + word(8 * 32) + word(sig.length / 2) + sig.padEnd(Math.ceil(sig.length / 64) * 64, '0');
}

const GRANT_RUNS = selector('grantRuns(bytes)');

/** One run as grantRuns reads it: 125 bytes, to (20) action expression prop rarity (1 each) score (4) runId (32) signature (65). */
export function grantRecord(v, runId, signature) {
  const b = (n, bytes) => BigInt(n).toString(16).padStart(bytes * 2, '0');
  const rec = strip(v.to).padStart(40, '0') + b(v.action, 1) + b(v.expression, 1) + b(v.prop, 1) + b(v.rarity, 1) + b(v.score, 4) + strip(runId) + strip(signature);
  if (rec.length !== 250) throw new Error('a run record is 125 bytes');
  return rec;
}

/** The transaction data of grantRuns(records): many runs in one transaction. */
export function grantRunsCalldata(records) {
  const data = records.join('');
  return '0x' + GRANT_RUNS + word(32) + word(data.length / 2) + data.padEnd(Math.ceil(data.length / 64) * 64, '0');
}

export const keccak = (bytes) => keccak_256(bytes);
export { hexToBytes };

/* RLP, just enough for one transaction: byte strings and flat lists. */
const rlpLen = (n, base) => {
  if (n < 56) return Uint8Array.of(base + n);
  const h = n.toString(16), b = hexToBytes(h.length % 2 ? '0' + h : h);
  return concatBytes(Uint8Array.of(base + 55 + b.length), b);
};
const rlpBytes = (b) => (b.length === 1 && b[0] < 0x80 ? b : concatBytes(rlpLen(b.length, 0x80), b));
const rlpList = (items) => { const body = concatBytes(...items); return concatBytes(rlpLen(body.length, 0xc0), body); };
const rlpInt = (n) => { const big = BigInt(n); if (big === 0n) return rlpBytes(new Uint8Array(0)); const h = big.toString(16); return rlpBytes(hexToBytes(h.length % 2 ? '0' + h : h)); };
const rlpHex = (hex) => rlpBytes(hexToBytes(strip(hex)));

/** A signed EIP-1559 transaction, as eth_sendRawTransaction wants it. */
export function signRawTx(secretKey, { chainId, nonce, priority, maxFee, gas, to, data }) {
  const fields = [rlpInt(chainId), rlpInt(nonce), rlpInt(priority), rlpInt(maxFee), rlpInt(gas), rlpHex(to), rlpInt(0), rlpHex(data), rlpList([])];
  const hash = keccak_256(concatBytes(Uint8Array.of(2), rlpList(fields)));
  const sig = secp256k1.sign(hash, secretKey, { prehash: false, format: 'recovered' });   // recovery || r || s
  const trim = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; return rlpBytes(b[i] === 0 ? new Uint8Array(0) : b.subarray(i)); };
  const signed = rlpList([...fields, rlpInt(sig[0]), trim(sig.subarray(1, 33)), trim(sig.subarray(33, 65))]);
  return '0x02' + bytesToHex(signed);
}
