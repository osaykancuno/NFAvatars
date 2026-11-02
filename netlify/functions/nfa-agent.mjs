/*
 * /api/agent?a=..&e=..&p=..&r=..&l=..&s=..&id=..   a Not Fungible Avatar as an agent.
 * GET  the agent's registration file, in the format of ERC-8004 (Trustless Agents): what its agentURI points to once the owner
 *      registers it in the Identity Registry on Ethereum. The token's ERC-6551 wallet is listed too (any ERC-721 can have one).
 * POST { "message": "gm" } the avatar's answer: its voice comes from its traits (public/assets/nfa-agent.mjs).
 * A query the collection could never produce gets 400. No secret and no model here.
 */
import { NAMES, attributes, parseToken } from './nfa-meta.mjs';
import { personaOf, reply } from '../../public/assets/nfa-agent.mjs';

export const STANDARDS = {
  identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',   // ERC-8004, Ethereum mainnet
  accountRegistry: '0x000000006551c19487814612e58FE06813775758',    // ERC-6551
};

export const personaOfToken = (t) => personaOf({
  role: t.l & 15, roleName: NAMES.role[t.l & 15], expression: NAMES.expression[t.e], prop: NAMES.prop[t.p], moment: NAMES.action[t.a], tier: NAMES.rarity[t.r],
});

export function registrationFile(t, site, contract, chainId = 1) {
  const q = `a=${t.a}&e=${t.e}&p=${t.p}&r=${t.r}&l=${t.l}&s=${t.s}&id=${t.id}`, persona = personaOfToken(t);
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'Not Fungible Avatar #' + t.id,
    description: `${persona.name}. ${persona.bio} ${persona.moment} One of the people of Lisbon in Not Fungible Avatars, with a voice that comes from its traits.`,
    image: `${site}/nft.gif?v=1&${q}`,
    services: [
      { name: 'web', endpoint: `${site}/#agents` },
      { name: 'chat', endpoint: `${site}/api/agent?${q}`, version: '1' },
    ],
    x402Support: false,
    active: true,
    registrations: [],                    // filled once the owner registers it: { agentId, agentRegistry: "eip155:1:<identity registry>" }
    supportedTrust: [],
    token: {
      standard: 'ERC-721', chainId, contract: contract || null, tokenId: t.id,
      wallet: { standard: 'ERC-6551', registry: STANDARDS.accountRegistry },
      identityRegistry: `eip155:${chainId}:${STANDARDS.identityRegistry}`,
      attributes: attributes(t),
    },
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { ...headers, 'cache-control': 'no-store' } });
  const t = parseToken(Object.fromEntries(url.searchParams));
  if (!t) return fail(400, 'Not a Not Fungible Avatar');
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return fail(400, 'Send JSON: { "message": "gm" }'); }
    if (!body || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 280) return fail(400, 'message: 1 to 280 characters');
    return new Response(JSON.stringify({ reply: reply(personaOfToken(t), body.message) }), { headers: { ...headers, 'cache-control': 'no-store' } });
  }
  if (req.method !== 'GET') return fail(405, 'GET or POST');
  const site = (process.env.NFA_SITE_URL || url.origin).replace(/\/+$/, '');
  return new Response(JSON.stringify(registrationFile(t, site, process.env.NFA_CONTRACT || null)), { headers: { ...headers, 'cache-control': 'public, max-age=3600' } });
};

export const config = { path: '/api/agent' };
