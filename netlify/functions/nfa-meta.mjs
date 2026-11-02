/*
 * GET /api/nfa?v=1&a=..&e=..&p=..&r=..&l=..&s=..&id=..   the metadata of one Not Fungible Avatar (what OpenSea reads).
 * The collection contract (v2, the light one) returns tokenURI = baseURI + the token's traits, so this needs no chain
 * read: it turns the traits into the same blue-chip JSON v1 built on chain (contracts/v1/NotFungibleAvatars-v1.sol):
 * "Not Fungible Avatar #id", one description, image = the GIF (/nft.gif), animation_url = the live show (/game/?view=avatar),
 * visual traits first. A query the contract would never produce (out of range, inconsistent tiers) gets 400.
 * The answer never changes for a query, so the CDN keeps it for good (bump v= in the contract's baseURI to refresh).
 */
const DESCRIPTION = 'Not Fungible Avatars are the people of Lisbon, picked out of a crowd of look-alikes in Not Fungible Moments at THE WALL ARCADE. Every trait is earned by playing. Nobody is fungible.';

/* The same lists as the game engine and the v1 contract (tests/nfa-meta-function.test.mjs checks both). */
export const NAMES = {
  action: ['Front Cam', 'Photo Dump', 'Main Character', 'Broke the Internet', 'Cheers', 'Bottomless Brunch', 'Pop the Bubbly', 'Toast to the Moon',
    'Slow Clap', 'Standing O', 'Crowd Goes Wild', 'Encore Encore', 'Gas Fee Victim', 'Fresh Mint', 'Floor Sweeper', 'Genesis 1/1',
    'Coffee First', 'Barista Mode', 'Latte Art Flex', 'Liquid Gold', 'Fist Bump', 'Up Top', 'Secret Handshake', 'Collab of the Year'],
  expression: ['Low Battery', 'Wait What?', 'Sweaty Palms', 'Good Vibes', 'Told You So', 'Rizz', 'Starstruck', 'Crying Laughing', 'Down Bad', 'Galaxy Brain', 'Unicorn Tears'],
  prop: ['None', 'Iced Coffee', 'Pastel de Nata', 'Pizza Slice', 'Cold Wallet', 'Spray Can', 'Diamond', 'Rocket', 'Golden Ticket', 'Crown', 'Holo 1/1'],
  role: ['Artist', 'Collector', 'Dev', 'Founder', 'Curator', 'Streamer', 'Degen', 'DJ', 'Whale', 'Bodyguard', 'Barista', 'Gamer', 'Meme Lord', 'Photographer', 'Skater', 'Chef'],
  pass: ['Guest', 'VIP', 'Backstage', 'All Access'],
  passOfRole: [0, 1, 0, 1, 1, 2, 0, 2, 3, 3, 2, 0, 0, 2, 0, 2],
  hair: ['Short', 'Afro', 'Long', 'Top Bun', 'Braids', 'Shaved', 'Bob', 'Hijab'],
  hairColor: ['Black', 'Dark Brown', 'Brown', 'Auburn', 'Blonde', 'Silver', 'White', 'Copper'],
  scarf: ['Navy', 'Plum', 'Sage', 'Sand', 'Azulejo Blue', 'Terracotta', 'Violet', 'Midnight'],
  facial: ['None', 'Beard', 'Moustache'],
  backdrop: ['Azulejo Wall', 'Tram 28 Ride', 'Alfama Rooftops', 'Tagus Golden Hour'],
  rarity: ['Common', 'Rare', 'Epic', 'Legendary'],
};
const tier = (i) => (i < 3 ? 0 : i < 6 ? 1 : i < 9 ? 2 : 3);

/** The token's traits from the query, or null when the contract could never have produced them. */
export function parseToken(q) {
  const int = (v, max) => (typeof v === 'string' && /^\d{1,20}$/.test(v) && Number(v) <= max ? Number(v) : null);
  const t = { id: int(q.id, Number.MAX_SAFE_INTEGER), a: int(q.a, 23), e: int(q.e, 10), p: int(q.p, 10), r: int(q.r, 3), l: int(q.l, 0xffff), s: int(q.s, 0xffffffff) };
  if (Object.values(t).some((v) => v === null) || t.id < 1) return null;
  if (t.a % 4 !== t.r || tier(t.e) > t.r || tier(t.p) > t.r) return null;
  return t;
}

/** Blue-chip style: what you see first (background, who, how they look), then what they did, then the tier. */
export function attributes(t) {
  const l = t.l, role = l & 15, hair = (l >> 7) & 7, color = (l >> 10) & 7;
  let facial = (l >> 13) & 3;
  if (facial === 3 || hair === 7) facial = 0;                  // what is drawn: facial hair 3 draws none, a hijab hides it
  const a = (trait_type, value) => ({ trait_type, value });
  return [
    a('Background', NAMES.backdrop[t.r]), a('Role', NAMES.role[role]), a('Pass', NAMES.pass[NAMES.passOfRole[role]]),
    a('Hair', NAMES.hair[hair]), a('Hair Color', hair === 7 ? NAMES.scarf[color] + ' Scarf' : NAMES.hairColor[color]),
    a('Facial Hair', NAMES.facial[facial]), a('Eyewear', l >> 15 === 1 ? 'Glasses' : 'None'),
    a('Expression', NAMES.expression[t.e]), a('Item', NAMES.prop[t.p]), a('Moment', NAMES.action[t.a]), a('Tier', NAMES.rarity[t.r]),
    { display_type: 'number', trait_type: 'Score', value: t.s },
  ];
}

export function metadata(t, site) {
  const q = `&a=${t.a}&e=${t.e}&p=${t.p}&r=${t.r}&l=${t.l}&s=${t.s}&id=${t.id}`;
  return {
    name: 'Not Fungible Avatar #' + t.id,
    description: DESCRIPTION,
    image: `${site}/nft.gif?v=1${q}`,
    animation_url: `${site}/game/?view=avatar${q}`,
    attributes: attributes(t),
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const t = parseToken(Object.fromEntries(url.searchParams));
  const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' };
  if (!t) return new Response(JSON.stringify({ error: 'Not a Not Fungible Avatar' }), { status: 400, headers: { ...headers, 'cache-control': 'no-store' } });
  return new Response(JSON.stringify(metadata(t, (process.env.NFA_SITE_URL || url.origin).replace(/\/+$/, ''))), {
    headers: { ...headers, 'cache-control': 'public, max-age=86400', 'netlify-cdn-cache-control': 'public, durable, max-age=31536000, immutable' },
  });
};

export const config = { path: '/api/nfa' };
