/*
 * From a finished run to a mint, with nothing kept here: the chain holds it all, and SuperRare's Studio is the source of truth.
 * The game's verifier holds no secret and the page can say anything, so a page only names a run: { runId, seed, startedAt }.
 * This file finds that run on Studio's PUBLIC leaderboard (GET <game origin>/api/v1/games/<game id>/scoring/leaderboard?from=&to=),
 * walking time windows around startedAt until the run's own id (scoreId) turns up, and takes from that entry everything that matters:
 * the wallet that played, the score (which carries the tier: tier * 100000 + points) and its trust level. The traits come from the same rules
 * as the game (tier from the score; moment, expression and item from the run id; the person from the seed, which only picks a look).
 * Then it signs the run for the collection and sends grantRun from the site's wallet (gas only, about 100,000), so the traits are on chain
 * as a ticket for the wallet that played. The ticket goes to Studio's wallet, never to one from the page: anyone may post anybody's run
 * and it only ever goes to its real owner, once. The player then mints through SuperRare's RareMinter whenever they like: the contract's
 * mintTo spends the wallet's oldest ticket. Sending the same run twice is harmless: the contract takes a run once.
 */
import {
  addressOf, canonLook, grantCalldata, grantRecord, grantRunsCalldata, hexToBytes, keccak, lookOfSeed, mintHash, picksOf, pointsOfScore, runIdOf, signHash, signRawTx, signerKeyOf,
  tierOfScore, traitSeedOfRun,
} from './mint-core.mjs';

export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_TOPIC = '0x' + '0'.repeat(64);
const DEFAULT_RPC = { 1: 'https://ethereum-rpc.publicnode.com', 11155111: 'https://ethereum-sepolia-rpc.publicnode.com' };
const RARE_MINTER = { 1: '0x5fa112EFeD8297bec0010b312208d223E0cE891E', 11155111: '0xd28Dc0B89104d7BBd902F338a0193fF063617ccE' };
const GWEI = 1_000_000_000n;
const MAX_GROUP = 20;            // runs per transaction at most
const LOCK_MS = 30_000;          // one group goes out at a time: the next waits for this, or for the previous one to be sent
const TIP_MIN = 1_000_000n, TIP_MAX = 20_000_000n;    // the priority fee: 0.001 to 0.02 gwei, what Ethereum asks when it is quiet
const sel = (signature) => Buffer.from(keccak(Buffer.from(signature)).subarray(0, 4)).toString('hex');
const word = (n) => BigInt(n).toString(16).padStart(64, '0');
const addrWord = (a) => a.slice(2).toLowerCase().padStart(64, '0');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,9})?(Z|[+-]\d\d:\d\d)$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BEFORE = 60_000, AFTER = 15 * 60_000, LEAF = 100, BUDGET = 24;       // the search: a minute before startedAt, 15 minutes after; down to 0.1 s; requests per POST
const HINT_BEFORE = 10_000, HINT_AFTER = 2000, RUN_MS = 90_000;              // the first windows: around the run's first POST, then the 90 s a paid run can last
const MISSING_ROUNDS = 3;                                                     // whole searches without the run: it is listed under missing/ for a person to look at
const SEARCH_MS = 7000;                                                       // and at most 7 s of it, inside Netlify's 10 s
const SENT_MS = 180_000;                                                      // a ticket just sent is not sent again for 3 minutes (it is on its way)

export function mintConfig(env) {
  const contract = (env.NFA_CONTRACT || '').trim().toLowerCase();
  const chainId = Number((env.NFA_CHAIN_ID || '1').trim());
  const secret = (env.NFA_SIGNER_SECRET || '').trim().toLowerCase().replace(/^0x/, '');
  const gameId = (env.NFA_GAME_ID || '').trim().toLowerCase();
  const gameOrigin = (env.NFA_GAME_ORIGIN || '').trim().replace(/\/+$/, '');
  let originOk = false;
  try { const u = new URL(gameOrigin); originOk = u.protocol === 'https:' && u.origin === gameOrigin && !u.username && !u.password; } catch { /* not a URL */ }
  const ok = /^0x[0-9a-f]{40}$/.test(contract) && (chainId === 1 || chainId === 11155111) && /^[0-9a-f]{64}$/.test(secret) && UUID.test(gameId) && originOk;
  const signerKey = ok ? signerKeyOf(secret) : null;
  return {
    open: ok, contract, chainId, signerKey, relayer: signerKey ? addressOf(signerKey) : '', gameId, gameOrigin,
    rpcUrl: (env.NFA_RPC_URL || '').trim() || DEFAULT_RPC[chainId],
    // the most the site pays per unit of gas: above it the runs wait in the queue (the ticket comes later, the cost never goes up)
    maxFee: BigInt(Number(env.NFA_MAX_GWEI) > 0 ? Math.round(Number(env.NFA_MAX_GWEI) * 1e9) : 150_000_000),   // 0.15 gwei
    minBalance: BigInt(env.NFA_MIN_RELAYER_WEI || '300000000000000'),                                             // 0.0003 ETH
    priceWei: BigInt((env.NFA_PRICE_WEI || '1').trim()),                                                          // Connect does not take price 0 yet: 1 wei for now
    unitPrice: (env.NFA_UNIT_PRICE || '0.000000000000000001').trim(),                                             // the same price, as Connect's actions.mint wants it
    explorer: chainId === 1 ? 'https://etherscan.io' : 'https://sepolia.etherscan.io',
    openseaAsset: chainId === 1 ? 'https://opensea.io/assets/ethereum' : 'https://testnets.opensea.io/assets/sepolia',
  };
}

/** The little the site needs from the chain, one JSON-RPC call each. Throws when the node cannot be reached. */
export function rpcChain(rpcUrl) {
  const rpc = async (method, params) => {
    const res = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (!res.ok) throw new Error('rpc ' + res.status);
    const j = await res.json();
    if (j.error) { const e = new Error('rpc: ' + j.error.message); e.data = j.error.data; throw e; }
    return j.result;
  };
  return {
    call: (to, data) => rpc('eth_call', [{ to, data }, 'latest']),
    estimate: (from, to, data) => rpc('eth_estimateGas', [{ from, to, data }]),
    balance: async (a) => BigInt(await rpc('eth_getBalance', [a, 'latest'])),
    nonce: async (a) => BigInt(await rpc('eth_getTransactionCount', [a, 'pending'])),
    fees: async () => {
      const [block, tip] = await Promise.all([rpc('eth_getBlockByNumber', ['latest', false]), rpc('eth_maxPriorityFeePerGas', []).catch(() => '0x0')]);
      return { base: BigInt(block.baseFeePerGas), tip: BigInt(tip) };
    },
    send: (raw) => rpc('eth_sendRawTransaction', [raw]),
    receipt: (tx) => rpc('eth_getTransactionReceipt', [tx]),
  };
}

/** Studio's public leaderboard as a board(fromMs, toMs) function: the entries of the runs that ended in [from, to), each scorer's best, top ten. */
export function studioBoard(cfg) {
  return async (fromMs, toMs) => {
    const url = `${cfg.gameOrigin}/api/v1/games/${cfg.gameId}/scoring/leaderboard?from=${encodeURIComponent(new Date(fromMs).toISOString())}&to=${encodeURIComponent(new Date(toMs).toISOString())}`;
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('leaderboard ' + res.status);
    const j = await res.json();
    if (!j || !Array.isArray(j.entries) || j.entries.length > 200) throw new Error('leaderboard: no entries');
    return j.entries;
  };
}

/**
 * The windows to search for a run, most likely first. All inside [startedAt - 60 s, min(startedAt + 15 min, now + 1 s)):
 * a few seconds around `hint` (when the site first heard of the run: the end screen posts as the run ends), then the 90 s after startedAt
 * (a paid run lasts about 65 s), then the whole range. The leaderboard is not an official API and shows only the top ten of a window,
 * each scorer's best, so short windows are the ones that can be trusted to show a run.
 */
export function searchPlan(startedAt, now, hint) {
  const from = startedAt - BEFORE, to = Math.min(startedAt + AFTER, now + 1000);
  if (!(to > from)) return [];
  const clip = ([a, b]) => [Math.max(a, from), Math.min(b, to)];
  const plan = [];
  if (Number.isFinite(hint) && hint >= from && hint < to) plan.push(clip([hint - HINT_BEFORE, hint + HINT_AFTER]));
  plan.push(clip([startedAt, startedAt + RUN_MS]), [from, to]);
  return plan.filter(([a, b], i) => b > a && plan.findIndex(([x, y]) => x === a && y === b) === i);
}

/**
 * Where a run missing from a window's entries can still be. Ten shown (a full page): anywhere, behind better scorers, so the two halves of
 * the clock, down to 0.1 s. Fewer: only behind a better run of its own wallet (even one played at the same time in another tab), so the
 * window without the instants of the shown runs: the pieces between them show what those runs hid, or nothing.
 */
function pieces(entries, a, b) {
  const times = entries.length >= 10 ? [] : [...new Set(entries.map((e) => Date.parse(e?.achievedAt)))].sort((x, y) => x - y);
  if (!times.length || !times.every((t) => Number.isFinite(t) && t >= a && t < b)) {
    const mid = a + Math.floor((b - a) / 2);
    return b - a > LEAF ? [[a, mid], [mid, b]] : [];
  }
  const out = [];
  let at = a;
  for (const t of times) { if (t > at) out.push([at, t]); at = t + 1; }
  if (b > at) out.push([at, b]);
  return out;
}

/**
 * Looks for a run on the leaderboard: `board(fromMs, toMs)` gives the entries of that window (injected, so a test can fake it).
 * Windows come from `queue` (searchPlan by default). When the run is not in a window's entries, the window's `pieces` are
 * searched, level by level inside each window of the plan. An empty window holds no run at all and is not split. At most `budget` requests: the windows left come back as `queue`, so the next POST
 * goes on from there instead of starting again. startedAt is the page's word: a wrong one only means the run is not found.
 * Returns { entry, requests, queue }; entry is null when not found (yet).
 */
export async function findRun(board, runId, startedAt, { now = Date.now(), budget = BUDGET, deadline = Date.now() + SEARCH_MS, hint, queue } = {}) {
  const id = String(runId).toLowerCase();
  // [from, to, window of the plan it came from, depth]: the plan's first window is searched level by level before the next one
  const todo = Array.isArray(queue) ? queue.map(([a, b, w = 0, d = 0]) => [a, b, w, d]) : searchPlan(startedAt, now, hint).map(([a, b], w) => [a, b, w, 0]);
  let requests = 0;
  while (todo.length && requests < budget && Date.now() < deadline) {        // within the function's time limit: the page asks again
    const next = todo.reduce((best, x, i) => (x[2] < todo[best][2] || (x[2] === todo[best][2] && x[3] < todo[best][3]) ? i : best), 0);
    const [a, b, w, d] = todo.splice(next, 1)[0];
    requests++;
    const entries = await board(a, b);
    if (!Array.isArray(entries)) throw new Error('board: no entries');
    const hit = entries.find((e) => e && typeof e.scoreId === 'string' && e.scoreId.toLowerCase() === id);
    if (hit) return { entry: hit, requests, queue: [] };
    if (entries.length) todo.push(...pieces(entries, a, b).map(([x, y]) => [x, y, w, d + 1]));
  }
  return { entry: null, requests, queue: todo };
}

const readers = {
  mintOpen: sel('mintOpen()'), totalRuns: sel('totalRuns()'), isRunUsed: sel('isRunUsed(bytes32)'), ticketsOf: sel('ticketsOf(address)'), avatars: sel('avatars(uint256)'),
};
const ERRORS = {
  [sel('WalletLimit()')]: [409, 'This wallet has played its 50 runs, the most one wallet can have.'],
  [sel('SoldOut()')]: [409, 'All 10,000 are taken.'],
  [sel('MintClosed()')]: [409, 'The mint is closed for now.'],
};
const refusal = (error) => {
  const text = String(error?.data?.data ?? error?.data ?? '') + ' ' + String(error?.message ?? '');
  for (const [s, r] of Object.entries(ERRORS)) if (text.includes(s)) return r;
  return null;
};
const answer = (status, body) => ({ status, body });

/** What the page asks before a credit is spent, and on the way back: open? sold out? how many runs may this wallet still have? */
export async function mintStatus(cfg, chain, wallet) {
  if (!cfg.open) return { open: false };
  const [isOpen, runs, balance, tickets] = await Promise.all([
    chain.call(cfg.contract, '0x' + readers.mintOpen), chain.call(cfg.contract, '0x' + readers.totalRuns), chain.balance(cfg.relayer),
    wallet ? chain.call(cfg.contract, '0x' + readers.ticketsOf + addrWord(wallet)) : null,
  ]);
  const taken = Number(BigInt(runs));
  const out = {
    open: BigInt(isOpen) === 1n && balance >= cfg.minBalance, soldOut: taken >= 10000, taken, chainId: cfg.chainId, contract: cfg.contract,
    minter: RARE_MINTER[cfg.chainId], currency: 'ETH', unitPrice: cfg.unitPrice, priceWei: cfg.priceWei.toString(),
    payWei: (cfg.priceWei + cfg.priceWei * 3n / 100n).toString(),                                                // RareMinter adds its 3%, rounded down
  };
  if (tickets) { out.waiting = Number(BigInt('0x' + tickets.slice(2, 66))); out.left = Number(BigInt('0x' + tickets.slice(66, 130))); }
  return out;
}

const KEYS = ['runId', 'seed', 'startedAt'];
/** What a page posts: exactly { runId, seed, startedAt }, or an Error saying what is wrong. */
export function parseClaim(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return new Error('Expected a JSON object');
  if (Object.keys(body).length !== KEYS.length || !KEYS.every((k) => Object.prototype.hasOwnProperty.call(body, k))) return new Error('Expected exactly: ' + KEYS.join(', '));
  const { runId, seed, startedAt } = body;
  if (typeof runId !== 'string' || !UUID.test(runId)) return new Error('runId: a UUID');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) return new Error('seed: a 32-bit integer');
  if (typeof startedAt !== 'string' || startedAt.length > 40 || !ISO.test(startedAt) || !Number.isFinite(Date.parse(startedAt))) return new Error('startedAt: an ISO date');
  return { runId: runId.toLowerCase(), seed, startedAt: Date.parse(startedAt) };
}

/**
 * The traits of a leaderboard entry, or an Error: server-verified, a wallet, a score this game can give.
 * Returns { wallet, chainId, tier, points, traits: { to, action, expression, prop, rarity, score }, look } for the run.
 */
export function entryToRun(entry, runId, seed, chainId = 1) {
  const p = entry && entry.player;
  if (!entry || entry.trustLevel !== 'server_verified') return new Error('Studio has not verified this run.');
  if (!p || p.kind !== 'wallet') return new Error('This run was not played with a wallet, so it cannot be minted.');
  if (typeof p.id !== 'string' || !ADDRESS.test(p.id)) return new Error('This run has no valid wallet.');
  // a wallet signed in on Ethereum (or on the collection's own chain): a smart wallet of another chain may not exist at this address here
  if (!Number.isSafeInteger(p.chainId) || (p.chainId !== 1 && p.chainId !== chainId)) return new Error('This run was played with a wallet of another chain.');
  const text = typeof entry.score === 'number' ? String(entry.score) : entry.score;
  if (typeof text !== 'string' || !/^\d{1,16}$/.test(text) || !Number.isSafeInteger(Number(text))) return new Error('This run has no valid score.');
  const score = Number(text), tier = tierOfScore(score), points = pointsOfScore(score);
  if (tier > 3 || score < 1) return new Error('This is not a score the game can give.');
  const picks = picksOf(tier, traitSeedOfRun(runId));
  const wallet = p.id.toLowerCase();
  return {
    wallet, chainId: p.chainId, tier, points, look: lookOfSeed(seed),
    traits: { to: wallet, action: picks.action, expression: picks.expression, prop: picks.prop, rarity: tier, score: points },
  };
}

/** A store kept in memory: a call without Netlify Blobs (tests, local) still works, one run per transaction. */
export function memoryStore() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); },
    list: async (prefix) => [...m.keys()].filter((k) => k.startsWith(prefix)) };
}

/**
 * body = { runId, seed, startedAt }. `board` reads Studio's leaderboard (see studioBoard). `store` = { get, set, del, list } (Netlify Blobs
 * in production): the runs waiting to go on chain, and the ones just sent. 200 once the run's ticket is on chain, 202 while the page should
 * ask again (the run is not on the leaderboard yet, it waits for a cheap moment, or its group is on its way).
 * The site pays the gas, so it pays as little as it can: runs go out in groups (grantRuns: one transaction, one base fee, warm slots),
 * never above cfg.maxFee per unit of gas.
 */
export async function grant(body, cfg, chain, board, now = Date.now(), store = memoryStore()) {
  if (!cfg.open) return answer(503, { error: 'The mint is not open yet.' });
  const c = parseClaim(body);
  if (c instanceof Error) return answer(400, { error: c.message });
  // the cheap checks first: a run already on chain, waiting, or just sent costs no leaderboard search and no gas
  const runId = runIdOf(c.runId, lookOfSeed(c.seed));
  const used = await chain.call(cfg.contract, '0x' + readers.isRunUsed + runId.slice(2));
  if (BigInt(used) === 1n) return answer(200, { granted: true });
  const key = runId.slice(2, 62);
  const sentAt = await store.get('sent/' + key).catch(() => null);
  if (sentAt && now - sentAt < SENT_MS) return answer(202, { pending: true });
  if (!(await store.get('queue/' + key).catch(() => null))) {
    // the search goes on across POSTs: where it stopped, and when the site first heard of the run (the end screen posts as it ends)
    const s = (await store.get('search/' + key).catch(() => null)) || { hint: now, rounds: 0 };
    const { entry, queue } = await findRun(board, c.runId, c.startedAt, { now, hint: s.hint, queue: s.queue?.length ? s.queue : undefined });
    if (!entry) {
      // a whole search without the run: the leaderboard may be late, so start again, but after a few rounds a person should look
      const rounds = s.rounds + (queue.length ? 0 : 1);
      if (rounds >= MISSING_ROUNDS) await store.set('missing/' + key, { runId: c.runId, seed: c.seed, startedAt: c.startedAt, firstSeen: s.hint, rounds }).catch(() => undefined);
      await store.set('search/' + key, { hint: s.hint, rounds, queue }).catch(() => undefined);
      return answer(202, { pending: true });
    }
    await store.del('search/' + key).catch(() => undefined);
    await store.del('missing/' + key).catch(() => undefined);
    const run = entryToRun(entry, c.runId, c.seed, cfg.chainId);
    if (run instanceof Error) return answer(403, { error: run.message });
    const signature = signHash(cfg.signerKey, mintHash(cfg.chainId, cfg.contract, run.traits, runId));
    // asked of the chain for this run alone: 50 runs on the wallet, sold out, closed are said now, not after a credit is lost
    try { await chain.estimate(cfg.relayer, cfg.contract, grantCalldata(run.traits, runId, signature)); } catch (error) {
      const known = refusal(error);
      if (known) return answer(known[0], { error: known[1] });
      throw error;
    }
    await store.set('queue/' + key, { record: grantRecord(run.traits, runId, signature), runId, at: now, wallet: run.wallet });
  }
  return sendGroup(cfg, chain, store, now);
}

/** Sends the waiting runs as one grantRuns, when the gas is cheap enough and no other group is going out right now. */
export async function sendGroup(cfg, chain, store, now = Date.now()) {
  const lock = await store.get('lock').catch(() => null);
  if (lock && now - lock < LOCK_MS) return answer(202, { pending: true });
  await store.set('lock', now).catch(() => undefined);
  const waiting = [];
  for (const k of (await store.list('queue/')).slice(0, MAX_GROUP * 2)) {
    const q = await store.get(k).catch(() => null);
    if (!q) continue;
    if (BigInt(await chain.call(cfg.contract, '0x' + readers.isRunUsed + q.runId.slice(2))) === 1n) { await store.del(k); continue; }
    waiting.push({ k, q });
  }
  waiting.sort((a, b) => a.q.at - b.q.at);
  const group = waiting.slice(0, MAX_GROUP);
  const release = () => store.set('lock', 0).catch(() => undefined);
  if (!group.length) { await release(); return answer(202, { pending: true }); }
  const { base, tip } = await chain.fees();
  const priority = tip < TIP_MIN ? TIP_MIN : tip > TIP_MAX ? TIP_MAX : tip;
  if (base + priority > cfg.maxFee) { await release(); return answer(202, { pending: true, wait: 'gas' }); }
  const data = grantRunsCalldata(group.map((g) => g.q.record));
  const gas = BigInt(await chain.estimate(cfg.relayer, cfg.contract, data)) * 5n / 4n + 10_000n;
  const raw = signRawTx(cfg.signerKey, { chainId: cfg.chainId, nonce: await chain.nonce(cfg.relayer), priority, maxFee: cfg.maxFee, gas, to: cfg.contract, data });
  try { await chain.send(raw); } catch (error) {
    // two groups at once can pick one nonce: the runs stay in the queue and go out with the next
    if (!/nonce|known|underpriced/i.test(String(error?.message))) throw error;
    await release();
    return answer(202, { pending: true, wait: 'retry' });
  }
  for (const g of group) { await store.set('sent/' + g.k.slice(6), now).catch(() => undefined); await store.del(g.k).catch(() => undefined); }
  await release();
  return answer(202, { pending: true, group: group.length });
}

/** The tokens this transaction minted to `to` on the collection: ids as decimal strings. */
export function mintedTokens(receipt, contract, to) {
  const toTopic = addrWord(to).replace(/^/, '0x');
  return (receipt.logs || [])
    .filter((l) => String(l.address).toLowerCase() === contract && l.topics && l.topics.length === 4
      && l.topics[0] === TRANSFER && l.topics[1] === ZERO_TOPIC && String(l.topics[2]).toLowerCase() === toTopic)
    .map((l) => BigInt(l.topics[3]).toString());
}

/** After the mint: which token, with its look. 202 while the block is not there yet. */
export async function mintedInfo(tx, wallet, cfg, chain) {
  if (!cfg.open) return answer(503, { error: 'The mint is not open yet.' });
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx || '') || !/^0x[0-9a-f]{40}$/.test(wallet || '')) return answer(400, { error: 'tx and wallet, please' });
  const receipt = await chain.receipt(tx);
  if (!receipt) return answer(202, { pending: true });
  if (receipt.status !== '0x1' && receipt.status !== 1) return answer(422, { error: 'That transaction failed on chain.' });
  const ids = mintedTokens(receipt, cfg.contract, wallet);
  if (!ids.length) return answer(422, { error: 'That transaction did not mint to this wallet.' });
  const id = ids[0];
  const traits = await chain.call(cfg.contract, '0x' + readers.avatars + word(id));
  return answer(200, {
    tokenId: id, look: canonLook(Number(BigInt('0x' + traits.slice(2 + 64 * 5, 2 + 64 * 6)))),
    txUrl: `${cfg.explorer}/tx/${tx}`, openseaUrl: `${cfg.openseaAsset}/${cfg.contract}/${id}`,
  });
}

export { lookOfSeed, hexToBytes };
