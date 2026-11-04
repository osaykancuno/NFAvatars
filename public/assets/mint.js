/*
 * /mint/  the way back: every finished run of Not Fungible Avatars is on chain as a ticket for the wallet that played, so it can be
 * minted here too, from a browser wallet, on any day. The arcade's end screen does the same through SuperRare's window.
 * The transaction is RareMinter.mintDirectSale(collection, ETH, price, 1, []): 1 wei and gas, and the contract spends the wallet's oldest ticket.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const API = '/api/claim', MINT_DIRECT_SALE = '0xd647ed3c';
  const say = (text) => { $('mint-status').textContent = text; };
  const word = (n) => BigInt(n).toString(16).padStart(64, '0');
  const addr = (a) => a.slice(2).toLowerCase().padStart(64, '0');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const getJson = async (url) => { const res = await fetch(url, { cache: 'no-store' }); return { status: res.status, body: await res.json().catch(() => ({})) }; };
  let wallet = null;

  async function refresh() {
    const { status, body } = await getJson(`${API}${wallet ? `?wallet=${wallet}` : ''}`);
    if (status !== 200 || !body.open) {
      $('mint-go').disabled = true;
      say(status === 200 ? 'The mint opens with the collection.' : 'The mint cannot be checked right now. Try again in a minute.');
      return null;
    }
    if (!wallet) { $('mint-go').textContent = 'Connect your wallet'; say('See the runs waiting for your wallet.'); return body; }
    const n = body.waiting || 0;
    $('mint-go').textContent = n ? `Mint · ${n} waiting` : 'Nothing waiting';
    $('mint-go').disabled = !n;
    say(n ? 'You pay only the network fee.' : `No run waiting for this wallet. It can still play ${body.left} more.`);
    return body;
  }

  async function connect() {
    if (!window.ethereum) { say('No wallet in this browser. Open this page in your wallet app, or mint from the end screen of THE WALL ARCADE.'); return; }
    [wallet] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    wallet = wallet.toLowerCase();
    await refresh();
  }

  async function mint() {
    const s = await refresh();
    if (!s || !s.waiting) return;
    const chain = '0x' + s.chainId.toString(16);
    if (String(await window.ethereum.request({ method: 'eth_chainId' })).toLowerCase() !== chain) {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain }] });
    }
    say('Confirm in your wallet (network fee only)…');
    const data = MINT_DIRECT_SALE + addr(s.contract) + word(0) + word(s.priceWei) + word(1) + word(160) + word(0);
    const tx = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: wallet, to: s.minter, data, value: '0x' + BigInt(s.payWei).toString(16) }] });
    say('Minting on chain…');
    for (let i = 0; i < 90; i++) {
      await wait(4000);
      const { status, body } = await getJson(`${API}?tx=${tx}&wallet=${wallet}`);
      if (status === 200) {
        const a = document.createElement('a');
        a.href = body.openseaUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = `Not Fungible Avatar #${body.tokenId}`;
        $('mint-done').replaceChildren('Minted: ', a);
        await refresh();
        return;
      }
      if (status >= 400 && status < 500) throw new Error(body.error || 'The mint did not go through.');
    }
    say('The block is taking long. Your NFT will be in your wallet.');
  }

  $('mint-go').addEventListener('click', () => {
    $('mint-go').disabled = true;
    (wallet ? mint() : connect())
      .catch((e) => { say(e && e.code === 4001 ? 'You declined in the wallet: nothing was sent. Your runs stay safe.' : (e && e.message) || 'Something went wrong. Your runs stay safe.'); })
      .finally(() => { $('mint-go').disabled = false; if (wallet) refresh().catch(() => undefined); });
  });
  refresh().catch(() => say('The mint cannot be checked right now. Try again in a minute.'));
})();
