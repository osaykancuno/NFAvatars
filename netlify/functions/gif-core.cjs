/*
 * The NFT's animated GIF, drawn with the GAME'S OWN ART: one full loop of the minted show (the end screen and the
 * OpenSea viewer, index.html?view=avatar). Shared by tools/nfa-gif.cjs (art read from index.html) and the Netlify
 * function nft-gif.mjs (art read from public/assets/nfa-art.js, generated from index.html by `npm run brand`).
 */
'use strict';
const vm = require('vm');
const { createCanvas } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

/* Run the game's scripts (ae-engine + ae-art) in a sandbox: returns { E: AEEngine, A: AEArt }. */
function loadArt(sources) {
  const sandbox = {};
  vm.createContext(sandbox);
  for (const src of sources) vm.runInContext(src, sandbox);
  if (!sandbox.AEEngine || !sandbox.AEArt) throw new Error('the game art did not load');
  return { E: sandbox.AEEngine, A: sandbox.AEArt };
}

/* The viewer's own parsing: out-of-range values fall back to the same defaults. */
function traits(E, q) {
  const int = (v, lo, hi, def) => { const n = Number(v); return v !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : def; };
  const a = int(q.a, 0, 23, 0), e = int(q.e, 0, 10, 3), p = int(q.p, 0, 10, 0), r = int(q.r, 0, 3, 0), l = int(q.l, 0, 65535, 0);
  return { rarity: r, act: Math.floor(a / 4), expression: E.EXPRESSIONS[e], prop: E.PROPS[p], look: E.canonLook(l), dir: 'right' };
}

/* One full cycle of the show (MINT_CYCLE s), so the GIF loops on the person's own loop. */
function renderGif(art, q, opts) {
  const { E, A } = art;
  const size = (opts && opts.size) || 480, fps = (opts && opts.fps) || 20;
  const d = traits(E, q), cv = createCanvas(size, size), ctx = cv.getContext('2d');
  const n = Math.round(A.MINT_CYCLE * fps), delay = Math.round(1000 / fps);
  const frames = [];
  for (let i = 0; i < n; i++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    A.drawMintedAvatar(ctx, size, size, d, i / fps);
    frames.push(ctx.getImageData(0, 0, size, size).data);
  }
  // one palette for the whole loop (no colour flicker between frames), sampled from every 4th frame
  const sample = new Uint8ClampedArray(frames.filter((_, i) => i % 4 === 0).reduce((s, f) => s + f.length, 0));
  let o = 0; frames.forEach((f, i) => { if (i % 4 === 0) { sample.set(f, o); o += f.length; } });
  const palette = quantize(sample, 256);
  const gif = GIFEncoder();
  frames.forEach((f, i) => gif.writeFrame(applyPalette(f, palette), size, size, i === 0 ? { palette, delay, repeat: 0 } : { delay }));
  gif.finish();
  return Buffer.from(gif.bytes());
}

module.exports = { loadArt, traits, renderGif };
