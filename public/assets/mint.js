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
  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  let wallet = null, waiting = 0;

  async function refresh() {
    const { status, body } = await getJson(`${API}${wallet ? `?wallet=${wallet}` : ''}`);
    if (status !== 200 || !body.open) {
      $('mint-go').disabled = true;
      say(status === 200 ? 'The mint opens with the collection.' : 'The mint cannot be checked right now. Try again in a minute.');
      return null;
    }
    if (!wallet) { waiting = 0; $('mint-go').disabled = false; $('mint-go').textContent = 'Connect your wallet'; say('See the runs waiting for your wallet.'); return body; }
    waiting = body.waiting || 0;
    // Always name the wallet: a run waits on the wallet that played it, and many people keep more than one account.
    $('mint-go').textContent = waiting ? `Mint · ${waiting} waiting` : 'Use another wallet';
    $('mint-go').disabled = false;
    say(waiting ? `${short(wallet)}: ${waiting} ${waiting === 1 ? 'run' : 'runs'} waiting. You pay only the network fee.`
      : `No run waiting for ${short(wallet)}. A run waits on the wallet that played it: the end screen of the game shows which one.`);
    return body;
  }

  const follow = async (accounts) => { wallet = accounts && accounts[0] ? String(accounts[0]).toLowerCase() : null; await refresh(); };

  async function connect() {
    if (!window.ethereum) { say('No wallet in this browser. Open this page in your wallet app, or mint from the end screen of THE WALL ARCADE.'); return; }
    await follow(await window.ethereum.request({ method: 'eth_requestAccounts' }));
  }

  // Lets the wallet show its account picker again; a wallet without it is simply followed when its account changes.
  async function switchWallet() {
    try { await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }); }
    catch (e) {
      if (e && e.code === 4001) throw e;
      say(`Switch to the wallet that played in your wallet app: this page follows it.`);
      return;
    }
    await follow(await window.ethereum.request({ method: 'eth_accounts' }));
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
    (!wallet ? connect() : waiting ? mint() : switchWallet())
      .catch((e) => { say(e && e.code === 4001 ? 'You declined in the wallet: nothing was sent. Your runs stay safe.' : (e && e.message) || 'Something went wrong. Your runs stay safe.'); })
      .finally(() => { $('mint-go').disabled = false; });
  });
  if (window.ethereum && window.ethereum.on) window.ethereum.on('accountsChanged', (a) => { follow(a).catch(() => undefined); });
  // A wallet this page may already see is shown at once, without a prompt.
  (window.ethereum ? window.ethereum.request({ method: 'eth_accounts' }).then(follow) : refresh())
    .catch(() => refresh()).catch(() => say('The mint cannot be checked right now. Try again in a minute.'));
})();
