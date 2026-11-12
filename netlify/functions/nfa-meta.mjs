/*
 * GET /api/nfa?v=1&a=..&e=..&p=..&r=..&l=..&s=..&id=..   the metadata of one Not Fungible Avatar (what OpenSea reads).
 * The collection contract (v2, the light one) returns tokenURI = baseURI + the token's traits, so this needs no chain
 * read: it turns the traits into the same blue-chip JSON v1 built on chain (contracts/v1/NotFungibleAvatars-v1.sol):
 * "Not Fungible Avatar #id", one description, image = the GIF (/nft.gif), animation_url = the live show (/game/?view=avatar),
 * visual traits first. A query the contract would never produce (out of range, inconsistent tiers) gets 400.
 * The answer never changes for a query, so the CDN keeps it for good (bump v= in the contract's baseURI to refresh).
 */
const DESCRIPTION = 'Not Fungible Avatars are the people of the party, picked out of a crowd of look-alikes in a game at THE WALL ARCADE. The tier is earned by playing, the rest is the luck of the run. A tribute to NFC Lisbon. Nobody is fungible.';

/* The same lists as the game engine and the v1 contract (tests/nfa-meta-function.test.mjs checks both). */
export const NAMES = {
  action: ['Front Cam', 'Photo Dump', 'Main Character', 'Broke the Internet', 'Cheers', 'Bottomless Brunch', 'Pop the Bubbly', 'Toast to the Moon',
    'Slow Clap', 'Standing O', 'Crowd Goes Wild', 'Encore Encore', 'Gas Fee Victim', 'Fresh Mint', 'Floor Sweeper', 'Genesis 1/1',
    'Coffee First', 'Barista Mode', 'Latte Art Flex', 'Liquid Gold', 'Fist Bump', 'Up Top', 'Secret Handshake', 'Collab of the Year'],
  expression: ['Low Battery', 'Wait What?', 'Sweaty Palms', 'Good Vibes', 'Told You So', 'Rizz', 'Starstruck', 'Crying Laughing', 'Down Bad', 'Galaxy Brain', 'Unicorn Tears'],
  prop: ['None', 'Iced Coffee', 'Pastel de Nata', 'Seed Phrase', 'Red Candle', 'Pizza Slice', 'Cold Wallet', 'Spray Can', 'Green Candle', 'Gas Pump',
    'Diamond', 'Rocket', 'Golden Ticket', 'Private Key', 'Laser Eyes', 'Crown', 'Holo 1/1', 'Genesis Block'],
  role: ['Artist', 'Collector', 'Dev', 'Founder', 'Curator', 'Streamer', 'Degen', 'DJ', 'Whale', 'Bodyguard', 'Barista', 'Gamer', 'Meme Lord', 'Photographer', 'Skater', 'Chef'],
  pass: ['Guest', 'VIP', 'Backstage', 'All Access'],
  passOfRole: [0, 1, 0, 1, 1, 2, 0, 2, 3, 3, 2, 0, 0, 2, 0, 2],
  hair: ['Short', 'Afro', 'Long', 'Top Bun', 'Braids', 'Shaved', 'Bob', 'Hijab'],
  hairColor: ['Black', 'Dark Brown', 'Brown', 'Auburn', 'Blonde', 'Silver', 'White', 'Copper'],
  scarf: ['Navy', 'Plum', 'Sage', 'Sand', 'Azulejo Blue', 'Terracotta', 'Violet', 'Midnight'],
  facial: ['None', 'Beard', 'Moustache'],
  /* Common: six quiet flat colours; Rare: six bright ones; the colour is the person's (see backdropIndex). Epic and Legendary: a picture. */
  backdrop: ['Calcada', 'Nata', 'Sardine', 'Bica', 'Sand', 'Fog', 'Azulejo', 'Tram', 'Terracotta', 'Tagus', 'Jacaranda', 'Manjerico', 'Alfama Rooftops', 'Tagus Golden Hour'],
  rarity: ['Common', 'Rare', 'Epic', 'Legendary'],
  /* What the bust shows: from the person (Eyes, Face Mark, Earring) and from the mint (Pin, Necklace). See details() below. */
  eyes: ['Brown', 'Hazel', 'Green', 'Blue', 'Grey', 'Amber'],
  faceMark: ['None', 'Freckles', 'Beauty Mark'],
  earring: ['None', 'Gold Hoop', 'Pearl', 'Diamond Stud'],
  pin: ['None', 'GM Sun', 'Moon', 'Diamond Hands', 'Rocket', 'Bull', 'Bear', 'Green Candle', 'Keys', 'Block', 'WAGMI Heart'],
  necklace: ['None', 'Gold Chain', 'Coin Pendant', 'Key Pendant', 'Cold Wallet Pendant'],
};

/* The same picks as the art's bustDetails (index.html) and the contract's _details: nothing is stored, all comes from the token's own numbers. */
const EYES_PICK = [0, 0, 0, 1, 1, 2, 3, 3, 4, 5], MARK_PICK = [0, 0, 0, 0, 0, 1, 1, 2], EAR_FEM = [0, 0, 1, 1, 2, 2, 3, 3], EAR_MASC = [0, 0, 0, 0, 0, 0, 1, 3];
const PIN_PICK = [0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], NECK_PICK = [0, 0, 0, 0, 1, 2, 3, 4];
function mix32(v) {
  let h = Math.imul((v ^ 0x5bd1) >>> 0, 0x9e3779b1) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca77) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}
export function details(look, action, expression, prop, score) {
  look &= 0xffff;
  if (((look >> 13) & 3) === 3 || ((look >> 7) & 7) === 7) look &= 0x9fff;
  const hijab = ((look >> 7) & 7) === 7, facial = (look >> 13) & 3, h = mix32(look), fem = facial ? 0 : h & 1;
  const m = mix32((look + Math.imul(action, 65537) + Math.imul(expression, 2097169) + Math.imul(prop, 33554467) + Math.imul(score | 0, 7919)) >>> 0);
  return { fem, eyes: EYES_PICK[(h >>> 1) % 10], mark: MARK_PICK[(h >>> 8) & 7], earring: hijab ? 0 : (fem ? EAR_FEM : EAR_MASC)[(h >>> 12) & 7], pin: PIN_PICK[m & 15], necklace: NECK_PICK[(m >>> 8) & 7] };
}
const tier = (i) => (i < 3 ? 0 : i < 6 ? 1 : i < 9 ? 2 : 3);                    // an Expression's tier
const propTier = (i) => (i < 5 ? 0 : i < 10 ? 1 : i < 15 ? 2 : 3);                // an Item's tier: 5 Common, 5 Rare, 5 Epic, 3 Legendary

/** Which of the six colours a person gets (the game's backdropIndex and the contract's, on the look that is drawn). */
export function backdropIndex(look) {
  let l = look & 0xffff;
  if (((l >> 13) & 3) === 3 || ((l >> 7) & 7) === 7) l &= 0x9fff;
  return ((l ^ (l >> 4) ^ (l >> 8) ^ (l >> 12)) & 0xffff) % 6;
}
/** The Background trait: Common and Rare a flat colour chosen by the look, Epic and Legendary their picture. */
export const backdropName = (rarity, look) => NAMES.backdrop[rarity >= 2 ? 10 + rarity : rarity * 6 + backdropIndex(look)];

/** The token's traits from the query, or null when the contract could never have produced them. */
export function parseToken(q) {
  const int = (v, max) => (typeof v === 'string' && /^\d{1,20}$/.test(v) && Number(v) <= max ? Number(v) : null);
  const t = { id: int(q.id, Number.MAX_SAFE_INTEGER), a: int(q.a, 23), e: int(q.e, 10), p: int(q.p, 17), r: int(q.r, 3), l: int(q.l, 0xffff), s: int(q.s, 0xffffffff) };
  if (Object.values(t).some((v) => v === null) || t.id < 1) return null;
  if (t.a % 4 !== t.r || tier(t.e) > t.r || propTier(t.p) > t.r) return null;
  return t;
}

/** Blue-chip style: what you see first (background, who, how they look), then what they did, then the tier. */
export function attributes(t) {
  const l = t.l, role = l & 15, hair = (l >> 7) & 7, color = (l >> 10) & 7;
  let facial = (l >> 13) & 3;
  if (facial === 3 || hair === 7) facial = 0;                  // what is drawn: facial hair 3 draws none, a hijab hides it
  const a = (trait_type, value) => ({ trait_type, value }), d = details(l, t.a, t.e, t.p, t.s);
  return [
    a('Background', backdropName(t.r, l)), a('Role', NAMES.role[role]), a('Pass', NAMES.pass[NAMES.passOfRole[role]]),
    a('Hair', NAMES.hair[hair]), a('Hair Color', hair === 7 ? NAMES.scarf[color] + ' Scarf' : NAMES.hairColor[color]),
    a('Facial Hair', NAMES.facial[facial]), a('Eyewear', l >> 15 === 1 ? 'Glasses' : 'None'),
    a('Eyes', NAMES.eyes[d.eyes]), a('Face Mark', NAMES.faceMark[d.mark]), a('Earring', NAMES.earring[d.earring]),
    a('Expression', NAMES.expression[t.e]), a('Item', NAMES.prop[t.p]), a('Pin', NAMES.pin[d.pin]), a('Necklace', NAMES.necklace[d.necklace]), a('Moment', NAMES.action[t.a]), a('Tier', NAMES.rarity[t.r]),
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
