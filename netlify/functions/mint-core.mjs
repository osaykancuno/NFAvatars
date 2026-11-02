/*
 * The arcade mint, server side (used by mint-signature.mjs and tools/nfa-seal-key.mjs).
 *
 * A paid run of Not Fungible Moments on THE WALL ARCADE ends with a voucher in the platform's final state:
 *   { to, seed, action, expression, prop, rarity, score } + seal
 * `to` is the wallet the page claimed for the run; `seal` = HMAC-SHA256(NFA_SEAL_KEY, sealMessage(voucher)), made by the
 * game's verifier on SuperRare's server (arcade/src/verifiers/avatar-extract.ts). Only that verifier and this site know
 * the key, so a valid seal proves a real, finished, paid run. This file checks it and signs the contract's mintHash
 * with the signer derived from the same key: the player then sends mintNFA from any wallet, paying only gas.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/* The same text the arcade verifier seals (core.ts sealMessage). */
export const sealMessage = (v) => `NFA-1|${v.to}|${v.seed}|${v.action}|${v.expression}|${v.prop}|${v.rarity}|${v.score}`;
export const sealOf = (key, v) => bytesToHex(hmac(sha256, hexToBytes(key), utf8ToBytes(sealMessage(v))));

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

const tier = (i) => (i < 3 ? 0 : i < 6 ? 1 : i < 9 ? 2 : 3);
const isInt = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const KEYS = ['to', 'seed', 'action', 'expression', 'prop', 'rarity', 'score', 'seal'];

/** A voucher as a page posts it, or an Error saying what is wrong (the same trait checks as mintNFA). */
export function parseVoucher(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return new Error('Expected a JSON object');
  if (Object.keys(body).length !== KEYS.length || !KEYS.every((k) => Object.prototype.hasOwnProperty.call(body, k))) {
    return new Error('Expected exactly: ' + KEYS.join(', '));
  }
  const { to, seed, action, expression, prop, rarity, score, seal } = body;
  if (typeof to !== 'string' || !/^0x[0-9a-f]{40}$/.test(to)) return new Error('to: a lowercase 0x address');
  if (!isInt(seed, 0, 0xffffffff) || !isInt(score, 0, 0xffffffff)) return new Error('seed and score: 32-bit integers');
  if (!isInt(rarity, 0, 3) || !isInt(action, 0, 23) || !isInt(expression, 0, 10) || !isInt(prop, 0, 10)
    || action % 4 !== rarity || tier(expression) > rarity || tier(prop) > rarity) return new Error('Traits out of range');
  if (typeof seal !== 'string' || !/^[0-9a-f]{64}$/.test(seal)) return new Error('seal: 64 hex digits');
  return { to, seed, action, expression, prop, rarity, score, seal };
}

/** Constant-time check of the seal. */
export function sealIsValid(key, v) {
  const a = hexToBytes(sealOf(key, v)), b = hexToBytes(v.seal);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* The contract's signer, derived from the seal key: one secret to keep, one address for setSigner(). */
export function signerKeyOf(sealKey) {
  const k = keccak_256(concatBytes(utf8ToBytes('Not Fungible Avatars signer v1|'), hexToBytes(sealKey)));
  if (!secp256k1.utils.isValidSecretKey(k)) throw new Error('Unusable seal key: make a new one');
  return k;
}
export function addressOf(secretKey) {
  const pub = secp256k1.getPublicKey(secretKey, false);                  // 0x04 || x || y
  return '0x' + bytesToHex(keccak_256(pub.subarray(1)).subarray(12));
}

/* runId: the seal's first 30 bytes, then the person (the contract mints lookFor(runId), from its low 16 bits). */
export const runIdOf = (v) => '0x' + v.seal.slice(0, 60) + lookOfSeed(v.seed).toString(16).padStart(4, '0');

const word = (n) => BigInt(n).toString(16).padStart(64, '0');
const strip = (hex) => hex.replace(/^0x/, '').toLowerCase();

/** keccak256(abi.encode(chainid, contract, to, action, expression, prop, rarity, score, runId)), as the contract's mintHash. */
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
const MINT = selector('mintNFA(address,uint8,uint8,uint8,uint8,uint32,bytes32,bytes)');
const LOOK_FOR = selector('lookFor(bytes32)');

/** The transaction data of mintNFA(to, action, expression, prop, rarity, score, runId, signature). */
export function mintCalldata(v, runId, signature) {
  const sig = strip(signature);
  return '0x' + MINT + strip(v.to).padStart(64, '0') + word(v.action) + word(v.expression) + word(v.prop)
    + word(v.rarity) + word(v.score) + strip(runId) + word(8 * 32) + word(sig.length / 2) + sig.padEnd(Math.ceil(sig.length / 64) * 64, '0');
}
export const lookForCalldata = (runId) => '0x' + LOOK_FOR + strip(runId);
