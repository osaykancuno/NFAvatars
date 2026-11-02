/*
 * GET /nft.gif?a=..&e=..&p=..&r=..&l=..   the animated GIF of one Not Fungible Avatar (the NFT's "image").
 * The contract builds the URL: imageBase ("https://<site>/nft.gif?v=1") + the same params as the game's viewer.
 * Same params, same GIF: Netlify's CDN keeps each one (durable cache), so every NFT is drawn once.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { GlobalFonts } = require('@napi-rs/canvas');
const { loadArt, renderGif } = require('./gif-core.cjs');

const here = path.dirname(fileURLToPath(import.meta.url));
/* Files shipped with the function (netlify.toml included_files), wherever the runtime puts them. */
function shipped(rel) {
  for (const base of [process.cwd(), process.env.LAMBDA_TASK_ROOT, path.join(here, '..', '..'), here]) {
    if (base && fs.existsSync(path.join(base, rel))) return path.join(base, rel);
  }
  throw new Error('missing ' + rel);
}

let art = null;
function load() {
  if (art) return art;
  GlobalFonts.registerFromPath(shipped('netlify/functions/fonts/Fredoka.ttf'), 'Fredoka');
  art = loadArt([fs.readFileSync(shipped('public/assets/nfa-art.js'), 'utf8')]);
  return art;
}

const MAX_BYTES = 4_000_000;   // a function's response must stay well under 6 MB once encoded

export default async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  try {
    const a = load();
    let gif = renderGif(a, q, { size: 400, fps: 20 });
    if (gif.length > MAX_BYTES) gif = renderGif(a, q, { size: 400, fps: 12.5 });   // a very busy scene: fewer frames, same loop
    return new Response(gif, {
      headers: {
        'content-type': 'image/gif',
        'cache-control': 'public, max-age=31536000, immutable',
        'netlify-cdn-cache-control': 'public, durable, max-age=31536000, immutable',
        'access-control-allow-origin': '*'
      }
    });
  } catch (err) {
    return new Response('GIF not available: ' + (err && err.message), { status: 500, headers: { 'cache-control': 'no-store' } });
  }
};

export const config = { path: '/nft.gif' };
