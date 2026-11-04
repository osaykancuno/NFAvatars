/*
 * Every 5 minutes: the runs still waiting in the queue (the gas was above NFA_MAX_GWEI, or nobody asked since) go on chain as one group,
 * if the gas is cheap enough now. The same code as /api/claim (claim-core.mjs sendGroup), so a player who closed the page still gets the ticket.
 */
import { mintConfig, rpcChain, sendGroup } from './claim-core.mjs';

export default async () => {
  const cfg = mintConfig(process.env);
  if (!cfg.open) return new Response(null, { status: 204 });
  try {
    const { getStore } = await import('@netlify/blobs');
    const s = getStore({ name: 'nfa-claim', consistency: 'strong' });
    const store = {
      get: async (k) => (await s.get(k, { type: 'json' }))?.v ?? null, set: (k, v) => s.setJSON(k, { v }), del: (k) => s.delete(k),
      list: async (prefix) => (await s.list({ prefix })).blobs.map((b) => b.key),
    };
    const r = await sendGroup(cfg, rpcChain(cfg.rpcUrl), store);
    if (r.body.group) console.log('claim group sent', r.body.group);
  } catch (error) {
    console.error('claim cron', error);
  }
  return new Response(null, { status: 204 });
};

export const config = { schedule: '*/5 * * * *' };
