/* ------------------------------------------------------------------
 * The Not Fungible Avatars theme (the promo video's music) on the site pages, never in the game.
 * Off until the visitor turns it on (browsers block sound before a click); the choice and the position
 * are remembered, so the music carries on from page to page. Pages add:
 *   <script src="assets/site-music.js" data-src="assets/nfa-theme.mp3" defer></script>
 * ------------------------------------------------------------------ */
(function () {
  var me = document.currentScript, src = me && me.getAttribute('data-src');
  if (!src) return;
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };

  var style = document.createElement('style');
  style.textContent = '.nfa-music{position:fixed;right:16px;bottom:16px;z-index:50;display:inline-flex;align-items:center;gap:8px;' +
    'min-height:44px;padding:0 16px;font:900 13px/1 var(--nfa-font,system-ui);letter-spacing:.06em;color:var(--nfa-ink,#1b1d3a);' +
    'background:var(--nfa-tram,#ffcf1f);border:var(--nfa-outline,3px solid #1b1d3a);border-radius:999px;box-shadow:0 4px 0 var(--nfa-ink,#1b1d3a);cursor:pointer}' +
    '.nfa-music[aria-pressed="false"]{background:var(--nfa-cream,#fff6e5)}' +
    '.nfa-music .eq{display:inline-flex;gap:2px;align-items:flex-end;height:14px}' +
    '.nfa-music .eq i{width:3px;height:4px;background:currentColor;border-radius:2px}' +
    '.nfa-music[aria-pressed="true"] .eq i{animation:nfaeq .9s ease-in-out infinite}' +
    '.nfa-music .eq i:nth-child(2){animation-delay:.2s}.nfa-music .eq i:nth-child(3){animation-delay:.4s}' +
    '@keyframes nfaeq{0%,100%{height:4px}50%{height:14px}}' +
    '@media (prefers-reduced-motion: reduce){.nfa-music .eq i{animation:none!important}}';
  document.head.appendChild(style);

  var audio = new Audio(src);
  audio.loop = true; audio.preload = 'none'; audio.volume = 0.6;
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'nfa-music';
  btn.innerHTML = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="lbl"></span>';
  var paint = function (on) {
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('.lbl').textContent = on ? 'Music on' : 'Music off';
    btn.setAttribute('aria-label', on ? 'Turn the music off' : 'Turn the Not Fungible Avatars theme on');
  };
  var play = function () {
    var at = Number(get('nfa.music.at')) || 0;
    var seek = function () { try { audio.currentTime = at; } catch (e) { /* not seekable */ } };
    if (audio.readyState >= 1) seek(); else audio.addEventListener('loadedmetadata', seek, { once: true });
    return audio.play().then(function () { paint(true); }, function () { paint(false); });
  };
  btn.addEventListener('click', function () {
    if (audio.paused) { set('nfa.music', 'on'); play(); }
    else { audio.pause(); set('nfa.music', 'off'); paint(false); }
  });
  audio.addEventListener('timeupdate', function () { set('nfa.music.at', audio.currentTime.toFixed(1)); });
  paint(false);
  document.body.appendChild(btn);
  // Turned on earlier: try to carry on (allowed once the visitor has interacted with the site; otherwise one click resumes it).
  if (get('nfa.music') === 'on') play();
})();
