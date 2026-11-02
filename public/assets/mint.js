/*
 * /mint/ — the mint of one THE WALL ARCADE run, for a player whose arcade page had no browser wallet (a phone, WalletConnect…).
 * The arcade's end screen links here with the run's sealed voucher in the URL fragment (never sent to any server):
 *   /mint/#v1.<to>.<seed>.<action>.<expression>.<prop>.<rarity>.<score>.<seal>
 * Same flow as the arcade (arcade/src/games/avatar-extract/mint.ts, its TypeScript twin): /api/mint-signature checks
 * the seal and returns the whole mintNFA transaction; the wallet sends it (value 0, gas only); the NFT goes to <to>.
 */
(function () {
  'use strict';
  const E = window.AEEngine, A = window.AEArt;
  const $ = (id) => document.getElementById(id);
  const API = '/api/mint-signature';
  const ERRORS = {
    '0f665e51': 'This run is already minted.',
    '589ed34b': 'The mint is closed for now.',
    '52df9fe5': 'Sold out: every person of the collection is minted.',
    '5cd5d233': 'The signature was refused (contract signer not set yet).',
    '4f8a18d7': 'These traits are refused by the contract.'
  };
  const AVATAR_MINTED = '0xfb665e7696de737ce96f277d3217b02bf630203456ba49016c8a60582df6f3b1';
  const tier = (i) => (i < 3 ? 0 : i < 6 ? 1 : i < 9 ? 2 : 3);

  function parse(hash) {
    const p = hash.replace(/^#/, '').split('.');
    if (p.length !== 9 || p[0] !== 'v1' || !/^0x[0-9a-f]{40}$/.test(p[1]) || !/^[0-9a-f]{64}$/.test(p[8])) return null;
    const n = p.slice(2, 8).map((x) => (/^\d{1,10}$/.test(x) ? Number(x) : -1));
    const v = { to: p[1], seed: n[0], action: n[1], expression: n[2], prop: n[3], rarity: n[4], score: n[5], seal: p[8] };
    if (v.seed < 0 || v.seed > 0xffffffff || v.score < 0 || v.score > 0xffffffff || v.rarity < 0 || v.rarity > 3
      || v.action < 0 || v.action > 23 || v.action % 4 !== v.rarity || v.expression < 0 || v.expression > 10 || v.prop < 0 || v.prop > 10
      || tier(v.expression) > v.rarity || tier(v.prop) > v.rarity) return null;
    return v;
  }
  function reason(err) {
    let text = '';
    try { text = JSON.stringify(err); } catch (e) { /* circular */ }
    text += String(err && err.message || err);
    for (const k in ERRORS) if (text.indexOf(k) >= 0) return ERRORS[k];
    if (err && err.code === 4001) return 'You declined in the wallet: nothing was sent.';
    return (err && err.message) || 'The wallet could not send the mint.';
  }

  const v = parse(location.hash);
  if (!v) { $('mint-bad').hidden = false; return; }
  $('mint-run').hidden = false;

  /* the person: the seed's person, or the one the contract will give (lookFor) once a wallet reads it */
  let look = E.canonLook(E.hash32(v.seed >>> 0, 0x10c));
  const act = Math.floor(v.action / 4);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function paintTraits() {
    const role = E.ROLES[look & 15], pass = E.BADGES[E.BADGE_OF_ROLE[look & 15]];
    $('mint-rarity').textContent = E.RARITIES[v.rarity].toUpperCase();
    $('mint-rarity').className = 'mint-rarity r' + v.rarity;
    $('mint-name').textContent = E.EXPRESSIONS[v.expression] + ' ' + role + ' · ' + E.ACTION_TRAITS[act][v.rarity];
    const rows = [['Role', role + ' · ' + pass + ' pass'], ['Moment', E.ACTION_TRAITS[act][v.rarity]], ['Expression', E.EXPRESSIONS[v.expression]],
      ['Item', E.PROPS[v.prop]], ['Background', E.BACKDROPS[v.rarity]], ['Score', String(v.score)]];
    $('mint-traits').replaceChildren(...rows.flatMap(([a, b]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = a; dd.textContent = b; return [dt, dd]; }));
  }
  paintTraits();
  $('mint-to').textContent = v.to.slice(0, 6) + '…' + v.to.slice(-4);
  $('mint-to').title = v.to;
  const canvas = $('mint-avatar'), ctx = canvas.getContext('2d');
  const t0 = performance.now();
  (function frame(now) {
    A.drawMintedAvatar(ctx, canvas.width, canvas.height, { rarity: v.rarity, act: act, expression: E.EXPRESSIONS[v.expression], prop: E.PROPS[v.prop], look: look, dir: 'right' },
      reduced ? A.HERO_T : (now - t0) / 1000);
    if (!reduced) requestAnimationFrame(frame);
  })(t0);

  const go = $('mint-go'), status = $('mint-status');
  const say = (text) => { status.textContent = text; };
  const done = (() => { try { return JSON.parse(localStorage.getItem('nfa.minted.' + v.seal) || 'null'); } catch (e) { return null; } })();
  function showDone(d) {
    go.hidden = true;
    $('mint-done').hidden = false;
    $('mint-done-title').textContent = d.tokenId ? 'Minted: Not Fungible Avatar #' + d.tokenId : 'Mint sent.';
    if (d.openseaUrl) { $('mint-opensea').href = d.openseaUrl; $('mint-opensea').hidden = false; }
    if (d.txUrl) { $('mint-tx').href = d.txUrl; $('mint-tx').hidden = false; }
  }
  if (done) { showDone(done); say(''); return; }

  if (!window.ethereum) {
    go.hidden = true;
    $('mint-app').href = 'https://metamask.app.link/dapp/' + location.host + location.pathname + location.hash;
    $('mint-app').hidden = false;
    say('No wallet in this browser. Open this page in your wallet app\'s browser (or a desktop browser with a wallet).');
  }
  fetch(API, { cache: 'no-store' }).then((r) => r.json()).then((info) => {
    if (!info.configured) { go.disabled = true; say('The mint opens with the Not Fungible Avatars contract. This link stays valid: come back then.'); }
  }).catch(() => {});

  go.addEventListener('click', async () => {
    const wallet = window.ethereum;
    go.disabled = true; go.textContent = 'Minting…';
    try {
      say('Asking for the signature of this run…');
      const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) });
      const plan = await res.json();
      if (!res.ok) throw new Error(plan.error || 'The site answered ' + res.status + '.');
      say('Approve the connection in your wallet…');
      const accounts = await wallet.request({ method: 'eth_requestAccounts' });
      const from = accounts && accounts[0];
      if (!from) throw new Error('No wallet account.');
      const chain = '0x' + plan.chainId.toString(16);
      if (String(await wallet.request({ method: 'eth_chainId' })).toLowerCase() !== chain) {
        say('Switch network in your wallet…');
        try { await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain }] }); } catch (err) {
          throw new Error(err && err.code === 4902 ? 'Add chain ' + plan.chainId + ' to your wallet first.' : reason(err));
        }
      }
      const word = String(await wallet.request({ method: 'eth_call', params: [{ to: plan.contract, data: plan.lookFor }, 'latest'] }));
      if (/^0x[0-9a-f]{64}$/i.test(word)) { look = Number(BigInt(word) & 0xffffn); paintTraits(); }
      const tx = { from: from, to: plan.contract, data: plan.data, value: '0x0' };
      const gas = BigInt(String(await wallet.request({ method: 'eth_estimateGas', params: [tx] })));   // refuses early, safe gas limit
      tx.gas = '0x' + (gas * 6n / 5n).toString(16);
      say('Confirm the mint in your wallet (network fee only)…');
      const hash = String(await wallet.request({ method: 'eth_sendTransaction', params: [tx] }));
      const txUrl = plan.explorer ? plan.explorer + '/tx/' + hash : null;
      say('Minting on chain…');
      for (let i = 0; i < 400; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const rc = await wallet.request({ method: 'eth_getTransactionReceipt', params: [hash] }).catch(() => null);
        if (!rc) continue;
        if (rc.status !== '0x1') throw new Error('The mint transaction failed on chain.');
        const log = (rc.logs || []).find((l) => l.topics && String(l.topics[0]).toLowerCase() === AVATAR_MINTED && String(l.address).toLowerCase() === plan.contract);
        const tokenId = log ? BigInt(log.topics[1]).toString() : null;
        const d = { hash: hash, tokenId: tokenId, txUrl: txUrl, openseaUrl: tokenId && plan.openseaAsset ? plan.openseaAsset + '/' + plan.contract + '/' + tokenId : null };
        try { localStorage.setItem('nfa.minted.' + v.seal, JSON.stringify(d)); } catch (e) { /* storage blocked */ }
        say('');
        showDone(d);
        return;
      }
      showDone({ hash: hash, tokenId: null, txUrl: txUrl, openseaUrl: null });
    } catch (err) {
      say(reason(err));
      go.disabled = false; go.textContent = 'Mint · gas only';
    }
  });
})();
