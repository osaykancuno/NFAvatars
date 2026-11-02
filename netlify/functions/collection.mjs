/*
 * GET /api/collection   the collection's live numbers from OpenSea, for collection/ (the API key never reaches the browser).
 * Netlify environment variables:
 *   OPENSEA_SLUG       the collection slug (opensea.io/collection/<slug>); empty = not launched yet
 *   OPENSEA_API_KEY    an OpenSea API key (docs.opensea.io)
 *   OPENSEA_API_BASE   optional, default https://api.opensea.io (testnets: https://testnets-api.opensea.io)
 * The CDN keeps the answer 5 minutes, so OpenSea is asked at most a few times an hour whatever the traffic.
 */
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function reply(body, seconds) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'netlify-cdn-cache-control': 'public, durable, max-age=' + seconds + ', stale-while-revalidate=600'
    }
  });
}

/* One NFT of an OpenSea event, as the page shows it. */
function item(ev) {
  const nft = ev.nft || {}, pay = ev.payment;
  return {
    id: nft.identifier || null,
    name: nft.name || (nft.identifier ? 'Not Fungible Avatar #' + nft.identifier : 'Not Fungible Avatar'),
    image: nft.display_image_url || nft.image_url || null,
    url: nft.opensea_url || null,
    time: num(ev.event_timestamp),
    price: pay && pay.quantity != null ? Number(pay.quantity) / Math.pow(10, pay.decimals || 0) : null,
    symbol: pay ? pay.symbol || '' : ''
  };
}

export default async () => {
  const slug = (process.env.OPENSEA_SLUG || '').trim(), key = (process.env.OPENSEA_API_KEY || '').trim();
  const base = (process.env.OPENSEA_API_BASE || 'https://api.opensea.io').replace(/\/+$/, '');
  if (!slug) return reply({ configured: false }, 300);
  const get = async (path) => {
    const res = await fetch(base + path, { headers: Object.assign({ accept: 'application/json' }, key ? { 'x-api-key': key } : {}) });
    if (!res.ok) throw new Error(path + ' → ' + res.status);
    return res.json();
  };
  const s = encodeURIComponent(slug);
  const [info, stats, sales, mints] = await Promise.allSettled([
    get('/api/v2/collections/' + s),
    get('/api/v2/collections/' + s + '/stats'),
    get('/api/v2/events/collection/' + s + '?event_type=sale&limit=8'),
    get('/api/v2/events/collection/' + s + '?event_type=mint&limit=12')
  ]);
  if (info.status === 'rejected' && stats.status === 'rejected') {
    return reply({ configured: true, ok: false, error: 'OpenSea did not answer', updatedAt: new Date().toISOString() }, 60);
  }
  const c = info.status === 'fulfilled' ? info.value : {};
  const total = stats.status === 'fulfilled' && stats.value.total ? stats.value.total : {};
  const intervals = {};
  if (stats.status === 'fulfilled') for (const i of stats.value.intervals || []) intervals[i.interval] = { sales: num(i.sales), volume: num(i.volume), symbol: i.volume_symbol || '' };
  return reply({
    configured: true, ok: true, updatedAt: new Date().toISOString(),
    collection: {
      name: c.name || 'Not Fungible Avatars', url: c.opensea_url || 'https://opensea.io/collection/' + slug,
      supply: num(c.total_supply), image: c.image_url || null
    },
    stats: {
      owners: num(total.num_owners), sales: num(total.sales),
      floor: num(total.floor_price), floorSymbol: total.floor_price_symbol || '',
      volume: num(total.volume), volumeSymbol: total.volume_symbol || '',
      day: intervals.one_day || null, week: intervals.seven_day || null
    },
    sales: sales.status === 'fulfilled' ? (sales.value.asset_events || []).map(item) : [],
    mints: mints.status === 'fulfilled' ? (mints.value.asset_events || []).map(item) : []
  }, 300);
};

export const config = { path: '/api/collection' };
