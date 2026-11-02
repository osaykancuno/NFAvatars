/* ------------------------------------------------------------------
 * SITE CONFIG — fill in at launch. Shared by every page (home, play, collection).
 * The OpenSea API key is NOT here: it lives in Netlify's environment variables (see README).
 * ------------------------------------------------------------------ */
window.NFA_SITE = {
  siteUrl: 'https://notfungibleavatars.party/',
  arcadeUrl: 'https://thewallarcade.superrare.com',   // THE WALL ARCADE; later the game's own page in the arcade
  openseaUrl: '',             // e.g. https://opensea.io/collection/not-fungible-avatars
  contract: '',               // the Ethereum contract, at launch (a SuperRare release)
  chainName: 'Ethereum',
  explorer: 'https://etherscan.io',
  rpcUrl: 'https://ethereum-rpc.publicnode.com',             // public RPC (CORS *): live "minted" counter before OpenSea has stats
  xUrl: 'https://x.com/osaykancuno'
};
