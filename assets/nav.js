/* FallForge · top nav injector */
(function(){
  if (window.__ff_nav) return; window.__ff_nav = true;
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var pages = [
    { href: 'mint.html',    label: 'Mint a model' },
    { href: 'install.html', label: 'Install now' },
    { href: 'how.html',     label: 'How it works' },
    { href: 'https://sjgant80-hub.github.io/fallhub/', label: 'FallHub' }
  ];
  var el = document.createElement('header');
  el.className = 'site-header';
  el.innerHTML = ''
    + '<a href="index.html" class="brand"><span class="glyph">◊</span>FallForge<span class="co">AI-Native Solutions</span></a>'
    + '<nav class="nav">'
    + pages.map(function(p){
        var external = p.href.indexOf('http') === 0;
        return '<a href="'+p.href+'"'+(here===p.href?' class="on"':'')+(external?' target="_blank"':'')+'>'+p.label+'</a>';
      }).join('')
    + '</nav>';
  function inject(){ document.body.insertBefore(el, document.body.firstChild); }
  if (document.body) inject();
  else document.addEventListener('DOMContentLoaded', inject);

  var ft = document.createElement('footer');
  ft.className = 'footer';
  ft.innerHTML = '<strong style="color:var(--cream)">FallForge</strong> · the forge for sovereign AI · by <a href="https://www.ai-nativesolutions.com/">AI-Native Solutions</a> · <a href="mint.html">Mint a model</a> · <a href="install.html">Install</a> · <a href="how.html">How it works</a> · powered by the Konomi architecture, created by Thomas Frumkin · MIT';
  document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(ft); });
  if (document.body && document.readyState !== 'loading') document.body.appendChild(ft);
})();
