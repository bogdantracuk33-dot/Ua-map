/* PRELOADER: підключити в самому кінці, після всіх інших <script> */
(function(){
  var pl = document.getElementById('preloader'); if(!pl) return;
  var steps = ['ui','tiles','borders','data'], state = {}, finished = false, t0 = Date.now(), MIN_MS = 1400, MAX_MS = 15000;
  var fill = document.getElementById('pl-fill'), pct = document.getElementById('pl-pct'), stat = document.getElementById('pl-status');

  /* годинник (Київ) */
  function tick(){
    var n = new Date();
    document.getElementById('pl-time').textContent = new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(n);
    document.getElementById('pl-date').textContent = new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric'}).format(n);
  }
  tick(); var clock = setInterval(tick, 1000);

  function render(){
    var done = steps.filter(function(s){ return state[s]; }).length;
    var p = Math.round(done / steps.length * 100);
    fill.style.width = p + '%'; pct.textContent = p + '%';
    steps.forEach(function(s, i){
      var li = pl.querySelector('[data-step="'+s+'"]');
      li.className = state[s] === 'err' ? 'err' : state[s] ? 'ok' : (i === 0 || state[steps[i-1]] ? 'on' : '');
    });
    if(done === steps.length) finish();
  }
  function mark(s, ok){ if(state[s]) return; state[s] = ok === false ? 'err' : 'ok'; render(); }

  function finish(){
    if(finished) return; finished = true;
    stat.textContent = 'Готово';
    var wait = Math.max(0, MIN_MS - (Date.now() - t0));
    setTimeout(function(){
      pl.classList.add('done');
      clearInterval(clock);
      setTimeout(function(){ pl.remove(); }, 700);
      if(window.map && map.invalidateSize) map.invalidateSize();
    }, wait + 250);
  }

  /* 1. інтерфейс */
  if(document.readyState === 'complete') mark('ui'); else window.addEventListener('load', function(){ mark('ui'); });

  /* 2. тайли карти */
  try{
    var tl = null; map.eachLayer(function(l){ if(l instanceof L.TileLayer) tl = l; });
    if(tl && !tl._loading && tl._tiles && Object.keys(tl._tiles).length) mark('tiles');
    else if(tl) tl.once('load', function(){ mark('tiles'); });
    else mark('tiles', false);
  }catch(e){ mark('tiles', false); }

  /* 3. кордони районів (чекаємо, поки шар районів буде побудований) */
  var bt = setInterval(function(){
    try{ if(Object.keys(raionLayers).length){ clearInterval(bt); mark('borders'); } }catch(e){}
  }, 200);

  /* 4. дані Firebase */
  try{
    Promise.all([ db.ref('alerts').once('value'), db.ref('threats').once('value') ])
      .then(function(){ mark('data'); }, function(){ mark('data', false); });
  }catch(e){ mark('data', false); }

  /* запобіжник: не тримаємо користувача довше MAX_MS */
  setTimeout(function(){ steps.forEach(function(s){ if(!state[s]) state[s] = 'err'; }); render(); }, MAX_MS);
  render();
})();
