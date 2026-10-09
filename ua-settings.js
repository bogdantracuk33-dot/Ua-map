/* ==========================================================================
   UA-SETTINGS — розділ «Налаштування» для UA Radar
   - виїзна панель (як «Стрічка» і «Довідка»), кнопка «ОПЦІЇ» в лівому меню
   - вибір підкладки: тактична, темна, світла, супутник, топографічна, рельєф, без карти
   - глобус (3D, globe.gl підвантажується лише при першому відкритті)
   - кольори рівнів тривоги: червоний ↔ жовтий поміняти неможливо, кольори різні
   - шари, підписи, інтерфейс, експорт/імпорт налаштувань

   Підключати ПІСЛЯ створення `map` (const map = L.map(...)) на місці старого
   L.tileLayer(...).addTo(map). Потрібні: window.L, глобальна `map`.
   Усе інше (geoLayer, raionIdsByName, currentThreats, ...) береться ліниво,
   у момент використання.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof L === 'undefined' || typeof map === 'undefined') return;

  var KEY = 'ua_radar_settings_v1';
  var GLOBE_LIB = ['https://unpkg.com/globe.gl@2.46.2/dist/globe.gl.min.js',
                   'https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js'];
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------------ *
   *  Значення за замовчуванням
   * ------------------------------------------------------------------ */
  var DEF = {
    basemap: 'tactical', globe: false, bright: 100, contrast: 100, sat: 100,
    labels: true, labelsOp: 100, oblasts: true, raionLines: true,
    calmFill: 27, alertFill: 27, alertLine: 1.05,
    red: { h: 353.6, l: 59 }, yellow: { h: 49.9, l: 50 },
    threats: true, threatScale: 100, launch: true,
    globeRotate: false,
    compact: false, blur: 14, noMotion: false, scaleBar: false, coords: false, rememberView: false, view: null
  };

  /* ------------------------------------------------------------------ *
   *  Кольори тривог: ДІАПАЗОНИ ВІДТІНКІВ (HSL, hue у градусах)
   *  Червоний: 345°…8° (через 0°), жовтий: 42°…58°.
   *  Діапазони не перетинаються, між ними ≥34°: жовтий не можна зробити
   *  червоним, червоний — жовтим, а два кольори ніколи не збігаються.
   * ------------------------------------------------------------------ */
  var RANGE = {
    red:    { min: 345, span: 23, lMin: 42, lMax: 66, def: { h: 353.6, l: 59 }, hex: '#ff2e43', edge: '#ff6b78', name: 'Червоний' },
    yellow: { min: 42,  span: 16, lMin: 44, lMax: 62, def: { h: 49.9,  l: 50 }, hex: '#ffd400', edge: '#ffe066', name: 'Жовтий' }
  };
  var SWATCHES = {
    red:    [[353.6, 59], [0, 55], [350, 46], [346, 62], [6, 52], [357, 50]],
    yellow: [[49.9, 50], [54, 50], [46, 50], [58, 54], [43, 52], [52, 60]]
  };
  function hueOffset(level, h) { return ((h - RANGE[level].min) % 360 + 360) % 360; }
  function hueOK(level, h) { return typeof h === 'number' && isFinite(h) && hueOffset(level, h) <= RANGE[level].span + 1e-9; }
  function hueDist(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  function cleanColor(level, c) {
    var r = RANGE[level];
    if (!c || typeof c.h !== 'number' || typeof c.l !== 'number' || !isFinite(c.l) || !hueOK(level, c.h)) return clone(r.def);
    return { h: c.h, l: Math.min(r.lMax, Math.max(r.lMin, c.l)) };
  }
  function hsl2hex(h, s, l) {
    s /= 100; l /= 100;
    var a = s * Math.min(l, 1 - l);
    function f(n) { var k = (n + h / 30) % 12; var v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); return Math.round(255 * v); }
    return '#' + [f(0), f(8), f(4)].map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function isDefaultColor(level, c) { var d = RANGE[level].def; return Math.abs(c.h - d.h) < 0.05 && Math.abs(c.l - d.l) < 0.05; }
  function fillHex(level, c) { return isDefaultColor(level, c) ? RANGE[level].hex : hsl2hex(c.h, 100, c.l); }
  function edgeHex(level, c) { return isDefaultColor(level, c) ? RANGE[level].edge : hsl2hex(c.h, 100, Math.min(c.l + 14, 78)); }
  function hex2rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ------------------------------------------------------------------ *
   *  Підкладки
   * ------------------------------------------------------------------ */
  var CARTO_KEY = '?key=cb1_28ue_1_1abea1b20e7eae7f74e9515f';
  var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var ESRI_ATTR = 'Tiles &copy; Esri';
  var BASES = [
    { id: 'tactical', name: 'Тактична', note: 'темна, зелений відтінок', theme: 'dark', filter: 'hue-rotate(75deg) saturate(1.5) brightness(.95)',
      tpl: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png' + CARTO_KEY, subs: 'abcd', max: 19, attr: '&copy; OpenStreetMap &copy; CARTO' },
    { id: 'light', name: 'Світла', note: 'денний режим', theme: 'light', filter: 'brightness(.97)',
      tpl: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png' + CARTO_KEY, subs: 'abcd', max: 19, attr: '&copy; OpenStreetMap &copy; CARTO' },
    { id: 'satellite', name: 'Супутник', note: 'знімки Esri / Maxar', theme: 'photo', filter: 'brightness(.82) saturate(1.05)',
      tpl: ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, native: 18, attr: ESRI_ATTR + ' &mdash; Maxar, Earthstar Geographics, GIS User Community' },
    { id: 'topo', name: 'Топографічна', note: 'вулиці, ліси, висоти', theme: 'light', filter: 'brightness(.88) saturate(.95)',
      tpl: ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}', max: 19, native: 17, attr: ESRI_ATTR + ' &mdash; USGS, NOAA, HERE, Garmin' },
    { id: 'relief', name: 'Рельєф', note: 'тіньова модель висот', theme: 'light', filter: 'brightness(.86) saturate(.9)',
      tpl: ESRI + 'World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', max: 19, native: 13, attr: ESRI_ATTR + ' &mdash; USGS, NOAA' }
  ];
  function findBase(id) { for (var i = 0; i < BASES.length; i++) if (BASES[i].id === id) return BASES[i]; return null; }
  function tileUrl(b, x, y, z) {
    return b.tpl.replace('{s}', 'a').replace('{r}', '').replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }
  /* мініатюра: плитка z6 над центральною Україною */
  function thumbUrl(b) { return tileUrl(b, 37, 22, 6); }

  /* ------------------------------------------------------------------ *
   *  Збереження
   * ------------------------------------------------------------------ */
  function sanitize(src) {
    var out = clone(DEF);
    if (!src || typeof src !== 'object') return out;
    Object.keys(DEF).forEach(function (k) {
      var v = src[k], d = DEF[k];
      if (k === 'red' || k === 'yellow') { out[k] = cleanColor(k, v); return; }
      if (k === 'view') { if (v && isFinite(v.lat) && isFinite(v.lng) && isFinite(v.z)) out.view = { lat: +v.lat, lng: +v.lng, z: +v.z }; return; }
      if (k === 'basemap') { if (typeof v === 'string' && BASES.some(function (b) { return b.id === v; })) out.basemap = v; return; }
      if (typeof d === 'number') { if (typeof v === 'number' && isFinite(v)) out[k] = v; return; }
      if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; return; }
    });
    /* межі числових значень */
    function lim(k, a, b) { out[k] = Math.min(b, Math.max(a, out[k])); }
    lim('bright', 50, 140); lim('contrast', 60, 150); lim('sat', 0, 200); lim('labelsOp', 20, 100);
    lim('calmFill', 0, 60); lim('alertFill', 8, 70); lim('alertLine', 0.3, 3);
    lim('threatScale', 60, 160); lim('blur', 0, 30);
    /* страховка: два рівні ніколи не збігаються */
    if (hueDist(out.red.h, out.yellow.h) < 30) { out.red = clone(RANGE.red.def); out.yellow = clone(RANGE.yellow.def); }
    return out;
  }
  function loadS() {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return sanitize(null); }
  }
  var S = loadS();
  var saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 150);
  }

  /* ------------------------------------------------------------------ *
   *  Публічний об'єкт
   * ------------------------------------------------------------------ */
  var UAS = window.UAS = {
    S: S,
    RANGE: RANGE,
    hueOK: hueOK,
    /* колір рівня тривоги ('red' | 'yellow') */
    color: function (level) { level = level === 'yellow' ? 'yellow' : 'red'; return fillHex(level, S[level]); },
    edge: function (level) { level = level === 'yellow' ? 'yellow' : 'red'; return edgeHex(level, S[level]); },
    /* стилі полігонів районів */
    alertStyle: function (level, mode) {
      level = level === 'yellow' ? 'yellow' : 'red';
      var fill = UAS.color(level), edge = UAS.edge(level);
      if (mode === 'selected') return { stroke: true, opacity: 1, color: fill, weight: 2.5, fillColor: fill, fillOpacity: Math.max(0.08, S.alertFill / 100 * 0.667) };
      return { stroke: true, opacity: 1, color: edge, weight: S.alertLine, fillColor: fill, fillOpacity: S.alertFill / 100 };
    },
    calmStyle: function () {
      return { stroke: true, opacity: S.raionLines ? 1 : 0, color: '#3c7655', weight: 0.55, fillColor: '#122417', fillOpacity: S.calmFill / 100 };
    },
    onAlerts: function () { onAlerts(); }
  };

  var baseLayer = null;
  function setBase(id) {
    var b = findBase(id) || BASES[0];
    S.basemap = b.id;
    map.eachLayer(function (l) { if (l instanceof L.TileLayer) map.removeLayer(l); });
    var opts = { maxZoom: b.max, attribution: b.attr, className: 'uas-base' };
    if (b.subs) opts.subdomains = b.subs;
    if (b.native) opts.maxNativeZoom = b.native;
    baseLayer = L.tileLayer(b.tpl, opts).addTo(map);
    baseLayer.bringToBack();
    var cl = document.body.classList;
    Array.prototype.slice.call(cl).forEach(function (c) { if (c.indexOf('bm-') === 0) cl.remove(c); });
    cl.add('bm-' + b.theme, 'bm-' + b.id);
    applyFilter();
    if (G.inst) setGlobeBase();                      // відкритий глобус одразу бере нову підкладку
  }
  function applyFilter() {
    var b = findBase(S.basemap) || BASES[0], f = b.filter === 'none' ? '' : b.filter;
    var extra = [];
    if (S.bright !== 100) extra.push('brightness(' + (S.bright / 100) + ')');
    if (S.contrast !== 100) extra.push('contrast(' + (S.contrast / 100) + ')');
    if (S.sat !== 100) extra.push('saturate(' + (S.sat / 100) + ')');
    var all = (f + ' ' + extra.join(' ')).trim();
    document.documentElement.style.setProperty('--uas-filter', all || 'none');
  }

  /* ------------------------------------------------------------------ *
   *  Кольори тривог: застосування
   * ------------------------------------------------------------------ */
  function restyle() {
    try {
      if (typeof geoLayer !== 'undefined' && typeof applyRaionStyle === 'function') {
        geoLayer.eachLayer(function (l) { applyRaionStyle(l, l.feature); });
      }
    } catch (e) {}
  }
  function applyColors() {
    var r = document.documentElement.style;
    r.setProperty('--uas-red', UAS.color('red'));       r.setProperty('--uas-red-edge', UAS.edge('red'));
    r.setProperty('--uas-yellow', UAS.color('yellow')); r.setProperty('--uas-yellow-edge', UAS.edge('yellow'));
    Array.prototype.forEach.call(document.querySelectorAll('#iv-legend .iv-dot[data-lvl]'), function (d) {
      var c = UAS.color(d.getAttribute('data-lvl')); d.style.background = c; d.style.color = c;
    });
    restyle();
    try { if (typeof selectedRaionName !== 'undefined' && selectedRaionName && typeof showRaionInfo === 'function') showRaionInfo(selectedRaionName); } catch (e) {}
    try { if (typeof renderFeed === 'function' && $('feed-panel') && $('feed-panel').classList.contains('open')) renderFeed(); } catch (e) {}
    if (G.inst && G.open) pushGlobe(true);
    syncColorUI();
  }

  /* ------------------------------------------------------------------ *
   *  Прості ефекти
   * ------------------------------------------------------------------ */
  var scaleCtl = null, coordsOn = false;
  function fmtCoord(ll) { return ll.lat.toFixed(4) + ', ' + ll.lng.toFixed(4); }
  function onMouseMove(e) { var el = $('uas-coords'); if (el) el.textContent = fmtCoord(e.latlng); }
  function onMoveCenter() { var el = $('uas-coords'); if (el) el.textContent = fmtCoord(map.getCenter()); }
  function bodyFlag(cls, on) { document.body.classList.toggle(cls, !!on); }

  var EFFECTS = {
    basemap: function () { setBase(S.basemap); },
    bright: applyFilter, contrast: applyFilter, sat: applyFilter,
    labels: function () { var p = map.getPane('labels'); if (p) p.style.display = S.labels ? '' : 'none'; if (G.inst && G.open) scheduleLabels(0); },
    labelsOp: function () { document.documentElement.style.setProperty('--uas-lbl-op', S.labelsOp / 100); },
    oblasts: function () {
      try { if (typeof oblastLayer !== 'undefined' && oblastLayer) { if (S.oblasts) map.addLayer(oblastLayer); else map.removeLayer(oblastLayer); } } catch (e) {}
      if (G.inst && G.open) pushGlobe(true);
    },
    raionLines: function () { restyle(); if (G.inst && G.open) pushGlobe(true); },
    calmFill: function () { restyle(); if (G.inst && G.open) pushGlobe(true); },
    alertFill: function () { restyle(); if (G.inst && G.open) pushGlobe(true); },
    alertLine: function () { restyle(); if (G.inst && G.open) pushGlobe(true); },
    threats: function () { bodyFlag('uas-hide-threats', !S.threats); if (G.inst && G.open) pushHtml(); },
    threatScale: function () { document.documentElement.style.setProperty('--uas-threat-scale', S.threatScale / 100); },
    launch: function () { bodyFlag('uas-hide-launch', !S.launch); if (G.inst && G.open) pushHtml(); },
    compact: function () { bodyFlag('uas-compact', S.compact); },
    blur: function () { document.documentElement.style.setProperty('--uas-blur', S.blur + 'px'); },
    noMotion: function () { bodyFlag('uas-nomotion', S.noMotion); },
    scaleBar: function () {
      if (S.scaleBar && !scaleCtl) { scaleCtl = L.control.scale({ imperial: false, maxWidth: 120 }).addTo(map); }
      if (!S.scaleBar && scaleCtl) { map.removeControl(scaleCtl); scaleCtl = null; }
      bodyFlag('uas-scale', S.scaleBar);
    },
    coords: function () {
      bodyFlag('uas-coords', S.coords);
      var touch = window.matchMedia && matchMedia('(hover: none)').matches;
      if (S.coords && !coordsOn) { coordsOn = true; map.on('mousemove', onMouseMove); if (touch) { map.on('move', onMoveCenter); onMoveCenter(); } }
      if (!S.coords && coordsOn) { coordsOn = false; map.off('mousemove', onMouseMove); map.off('move', onMoveCenter); }
    },
    globeRotate: function () { if (G.inst) G.inst.controls().autoRotate = S.globeRotate; },
    globe: function () { if (S.globe) openGlobe(); else closeGlobe(); syncGlobeSwitch(); },
    red: applyColors, yellow: applyColors
  };
  function applyAll() {
    ['basemap', 'globe', 'labels', 'labelsOp', 'oblasts', 'threats', 'threatScale', 'launch', 'compact', 'blur', 'noMotion', 'scaleBar', 'coords'].forEach(function (k) { EFFECTS[k](); });
    applyColors();
  }

  /* оновлення глобуса при зміні тривог (викликається з основного скрипта) */
  function onAlerts() { if (G.inst && G.open) pushGlobe(false); }

  /* ------------------------------------------------------------------ *
   *  Глобус (globe.gl) — ті самі полігони, мітки й підписи, що й на карті.
   *  Підкладка глобуса ЗАВЖДИ така, як обрана для карти (окремого вибору немає).
   * ------------------------------------------------------------------ */
  var G = { inst: null, open: false, loading: null, sig: '', timer: null, hd: {}, oblastPaths: null, thin: {}, lblT: null, lblItems: null, lblShown: [] };

  function loadGlobeLib() {
    if (window.Globe) return Promise.resolve();
    if (G.loading) return G.loading;
    G.loading = new Promise(function (res, rej) {
      (function next(i) {
        if (i >= GLOBE_LIB.length) { G.loading = null; rej(new Error('globe.gl')); return; }
        var s = document.createElement('script');
        s.src = GLOBE_LIB[i]; s.async = true;
        s.onload = function () { if (window.Globe) res(); else next(i + 1); };
        s.onerror = function () { s.remove(); next(i + 1); };
        document.head.appendChild(s);
      })(0);
    });
    return G.loading;
  }

  /* прорідження геометрії: на глобусі подробиці межі не потрібні */
  function thin(ring, max) {
    if (ring.length <= max) return ring;
    var k = Math.ceil(ring.length / max), out = [];
    for (var i = 0; i < ring.length; i += k) out.push(ring[i]);
    var last = ring[ring.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }
  function thinGeom(g) {
    if (!g) return g;
    if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map(function (r) { return thin(r, 480); }) };
    if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.coordinates.map(function (p) { return p.map(function (r) { return thin(r, 480); }); }) };
    return g;
  }
  /* Межі областей на глобусі рахуємо З ТИХ САМИХ (уже прорідже-них) контурів районів,
     що йдуть у заливку — а не з окремого, незалежно спрощеного набору меж (так було
     раніше: дві різні за точністю трасування однієї коастлінії лягали один на одного
     й виглядали як зайва ламана лінія поверх району). Ребро, що в межах однієї області
     зустрічається лише один раз, лежить на її зовнішньому контурі; ребро, що
     зустрічається двічі, — внутрішня межа між двома районами тієї ж області й не
     малюється. Тому лінія області завжди день-у-день збігається з контуром районів. */
  function computeGlobeOblastPaths(list) {
    var groups = {};
    list.forEach(function (p) {
      var k = p.oblast || '__all__';
      (groups[k] || (groups[k] = [])).push(p.geometry);
    });
    var segs = [];
    Object.keys(groups).forEach(function (k) {
      var count = {}, coordsByKey = {};
      groups[k].forEach(function (geom) {
        if (!geom) return;
        var polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
        polys.forEach(function (poly) {
          poly.forEach(function (ring) {
            for (var i = 0; i < ring.length - 1; i++) {
              var a = ring[i], b = ring[i + 1];
              if (a[0] === b[0] && a[1] === b[1]) continue;
              var ka = a[0].toFixed(9) + ',' + a[1].toFixed(9), kb = b[0].toFixed(9) + ',' + b[1].toFixed(9);
              var key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
              count[key] = (count[key] || 0) + 1;
              if (!coordsByKey[key]) coordsByKey[key] = [[a[1], a[0]], [b[1], b[0]]];
            }
          });
        });
      });
      Object.keys(count).forEach(function (key) { if (count[key] === 1) segs.push(coordsByKey[key]); });
    });
    return segs;
  }

  /* --- елемент-обгортка нульового розміру: вміст центрується навколо точки --- */
  function wrapEl(html, cls, onclick) {
    var box = document.createElement('div'); box.className = 'uas-gh ' + (cls || '');
    box.innerHTML = html;
    if (onclick) { box.style.pointerEvents = 'auto'; box.style.cursor = 'pointer'; box.addEventListener('click', function (e) { e.stopPropagation(); onclick(); }); }
    return box;
  }
  function datum(key, lat, lng, make) {
    var o = G.hd[key] || (G.hd[key] = { el: make() });
    o.lat = lat; o.lng = lng; return o;
  }

  /* --- підписи: ті самі дані й ті самі CSS-класи, що на карті (UALabels.items) --- */
  /* висота камери ↔ zoom карти: alt 0.30 дає той самий масштаб, що й стартовий zoom 6 на карті */
  var START_ALT = 0.3;
  function altToZoom(alt) { return Math.max(5, 6 + Math.log(START_ALT / Math.max(0.004, alt)) / Math.LN2); }
  function unit(it) {
    if (it._x === undefined) {
      var la = it.lat * Math.PI / 180, lo = it.lng * Math.PI / 180;
      it._x = Math.cos(la) * Math.cos(lo); it._y = Math.cos(la) * Math.sin(lo); it._z = Math.sin(la);
    }
  }
  function labelEl(it) {
    if (!it._el) {
      var cls = 'ua-lbl ua-' + it.kind + (it.kind === 'city' ? ' p' + it.p : '');
      it._el = wrapEl('<div class="' + cls + '"><b>' + esc(it.t) + '</b></div>', 'uas-gl');
    }
    return it._el;
  }
  function layoutLabels() {
    G.lblT = null;
    if (!G.inst || !G.open) return;
    var items = (window.UALabels && window.UALabels.items) || null;
    if (!items) { G.lblShown = []; pushHtml(); return; }
    if (!S.labels) { G.lblShown = []; pushHtml(); return; }
    var pov = G.inst.pointOfView(), alt = pov.altitude, z = altToZoom(alt);
    var la0 = pov.lat * Math.PI / 180, lo0 = pov.lng * Math.PI / 180;
    var cx = Math.cos(la0) * Math.cos(lo0), cy = Math.cos(la0) * Math.sin(lo0), cz = Math.sin(la0);
    var horizon = Math.acos(1 / (1 + alt)) * 180 / Math.PI;
    var limitDeg = Math.min(horizon * 0.98, alt * 55 + 3), cosLim = Math.cos(limitDeg * Math.PI / 180);
    var W = window.innerWidth, H = window.innerHeight, taken = [], out = [];
    for (var i = 0; i < items.length && out.length < 1400; i++) {
      var it = items[i];
      if (z < it.z || z > it.zmax) continue;
      unit(it);
      if (it._x * cx + it._y * cy + it._z * cz < cosLim) continue;
      var p = G.inst.getScreenCoords(it.lat, it.lng);
      if (!p || p.x < -40 || p.x > W + 40 || p.y < -30 || p.y > H + 30) continue;
      var w = it.t.length * it.k + 6, h = it.h, x1 = p.x - w / 2, x2 = p.x + w / 2, y1 = p.y - h / 2, y2 = p.y + h / 2, ok = true;
      for (var m = 0; m < taken.length; m++) {
        var t = taken[m];
        if (!(x2 <= t[0] || x1 >= t[2] || y2 <= t[1] || y1 >= t[3])) { ok = false; break; }
      }
      if (!ok && it.r <= 1 && z >= 7) ok = true;
      if (ok) { taken.push([x1, y1, x2, y2]); out.push(it); }
    }
    G.lblShown = out;
    pushHtml();
  }
  function scheduleLabels(ms) {
    if (G.lblT || !G.open) return;
    G.lblT = setTimeout(layoutLabels, ms === undefined ? 90 : ms);
  }

  /* --- усі HTML-мітки глобуса: підписи + цілі + пускові майданчики --- */
  function pushHtml() {
    if (!G.inst) return;
    var html = [], i;
    for (i = 0; i < G.lblShown.length; i++) { var it = G.lblShown[i]; html.push(datum('l' + it.id, it.lat, it.lng, function () { return labelEl(it); })); }
    try {
      if (S.threats && typeof currentThreats !== 'undefined') Object.keys(currentThreats).forEach(function (id) {
        var t = currentThreats[id]; if (!t) return;
        var mk = (typeof threatMarkers !== 'undefined' && threatMarkers[id]) ? threatMarkers[id].getLatLng() : { lat: t.lat, lng: t.lng };
        if (!isFinite(mk.lat) || !isFinite(mk.lng)) return;
        html.push(datum('t' + id + '|' + t.type + '|' + (t.rotation || 0), mk.lat, mk.lng, function () {
          var ic = makeThreatIcon(t.type, t.rotation);
          return wrapEl(ic.options.html, 'uas-gt', function () { try { showThreatInfo(id, currentThreats[id]); } catch (e) {} });
        }));
      });
    } catch (e) {}
    try {
      if (S.launch && typeof LAUNCH_SITES !== 'undefined') LAUNCH_SITES.forEach(function (site) {
        var active = !!((typeof LAUNCH_STATUS !== 'undefined') && LAUNCH_STATUS[site.id] && LAUNCH_STATUS[site.id].active);
        html.push(datum('s' + site.id + '|' + active, site.lat, site.lng, function () {
          var ic = makeLaunchIcon(site.kind, active);
          return wrapEl(ic.options.html, 'uas-gs', function () { try { showLaunchInfo(site); } catch (e) {} });
        }));
      });
    } catch (e) {}
    G.inst.htmlElementsData(html);
  }

  /* --- полігони районів: точно ті самі стилі, що й на карті (raionStyle) --- */
  function pushPolys(force) {
    if (!G.inst || typeof geoLayer === 'undefined' || typeof raionStyle !== 'function') return;
    var list = [], sig = [];
    geoLayer.eachLayer(function (l) {
      var f = l.feature; if (!f || !f.geometry) return;
      var st = raionStyle(f), alert = st.fillColor !== '#122417';
      var key = f.properties.fid;
      var g = G.thin[key] || (G.thin[key] = thinGeom(f.geometry));
      list.push({ geometry: g, name: f.properties.rayon, st: st, alert: alert, oblast: (f.properties && f.properties.oblast) || '__all__' });
      sig.push(alert ? key + st.fillColor : '');
    });
    var s2 = list.length + '|' + sig.join('') + '|' + S.calmFill + '|' + S.alertFill + '|' + S.alertLine + '|' + S.raionLines + '|' + S.red.h + S.red.l + S.yellow.h + S.yellow.l;
    if (!force && s2 === G.sig) return;
    G.sig = s2;
    G.inst.polygonsData(list);
    G.oblastPaths = computeGlobeOblastPaths(list);
    G.inst.pathsData(S.oblasts ? G.oblastPaths : []);
  }
  function pushGlobe(force) {
    if (!G.inst) return;
    pushPolys(force);
    pushHtml();
    if (force) scheduleLabels(0);
  }

  function globeBase() { return findBase(S.basemap) || BASES[0]; }
  function setGlobeBase() {
    if (!G.inst) return;
    var b = globeBase();
    G.inst.globeTileEngineUrl(function (x, y, l) { return tileUrl(b, x, y, l); });
    if (G.inst.globeTileEngineClearCache) G.inst.globeTileEngineClearCache();
  }
  function buildGlobe() {
    var host = $('uas-globe-canvas');
    var g = new window.Globe(host, { animateIn: false, rendererConfig: { alpha: true, antialias: true, powerPreference: 'high-performance' } });
    G.inst = g;
    g.backgroundColor('rgba(0,0,0,0)')
      .width(window.innerWidth).height(window.innerHeight)
      .showAtmosphere(true).atmosphereColor('#3dff2e').atmosphereAltitude(0.14)
      .globeTileEngineMaxLevel(13)
      /* межі областей: тонка біла лінія, як на карті */
      .pathPoints(function (p) { return p; }).pathPointLat(function (c) { return c[0]; }).pathPointLng(function (c) { return c[1]; })
      .pathColor(function () { return 'rgba(255,255,255,.72)'; }).pathStroke(null).pathPointAlt(0.0016).pathTransitionDuration(0)
      /* райони: заливка й контур із raionStyle() */
      .polygonGeoJsonGeometry('geometry')
      .polygonCapColor(function (p) { return hex2rgba(p.st.fillColor, p.st.fillOpacity); })
      .polygonStrokeColor(function (p) { return (p.alert || S.raionLines) ? p.st.color : null; })
      .polygonSideColor(function () { return 'rgba(0,0,0,0)'; })
      .polygonAltitude(function (p) { return p.alert ? 0.0042 : 0.003; })
      .polygonCapCurvatureResolution(0.5)        /* дрібний крок — межі районів щільно прилягають до сфери, а не «спливають» при повороті */
      .polygonsTransitionDuration(0)
      .polygonLabel(function (p) { return '<div class="uas-tip">' + esc(p.name) + '</div>'; })
      .onPolygonClick(function (p) { try { showRaionInfo(p.name); } catch (e) {} })
      /* підписи, цілі, пускові майданчики */
      .htmlLat('lat').htmlLng('lng').htmlAltitude(0.006).htmlElement(function (d) { return d.el; })
      .htmlTransitionDuration(0)                  /* підписи й мітки стрибають миттєво на місце, як на карті, без «плавання» */
      .onZoom(function () { scheduleLabels(); });
    try { var m = g.globeMaterial(); if (m && m.color) m.color.set('#06120a'); } catch (e) {}
    var c = g.controls(); c.autoRotate = S.globeRotate; c.autoRotateSpeed = 0.35; c.minDistance = 100.6; c.maxDistance = 520; c.enableDamping = true;
    setGlobeBase();
    return g;
  }
  function focusUkraine(ms) {
    if (!G.inst) return;
    G.inst.pointOfView({ lat: 48.55, lng: 31.3, altitude: START_ALT }, ms === undefined ? 900 : ms);
    setTimeout(function () { scheduleLabels(0); }, (ms === undefined ? 900 : ms) + 80);
  }
  function zoomGlobe(f) {
    if (!G.inst) return;
    var pov = G.inst.pointOfView();
    G.inst.pointOfView({ altitude: Math.min(4, Math.max(0.006, pov.altitude * f)) }, 350);
    setTimeout(function () { scheduleLabels(0); }, 400);
  }
  function syncGlobeSwitch() {
    var b = $('uas-globe-sw'); if (b) b.checked = !!S.globe;
  }
  function openGlobe() {
    if (G.open) return;
    if (typeof currentTab !== 'undefined' && currentTab !== 'map' && typeof setTab === 'function') setTab('map');
    try { if (typeof closeFeedPanel === 'function') closeFeedPanel(); } catch (e) {}
    G.open = true;
    document.body.classList.add('uas-globe-on');
    var load = $('uas-gload');
    if (G.inst) { load.style.display = 'none'; G.inst.resumeAnimation && G.inst.resumeAnimation(); resizeGlobe(); setGlobeBase(); pushGlobe(true); focusUkraine(600); startGlobeTimer(); return; }
    load.className = 'uas-gload'; load.style.display = 'flex'; load.textContent = 'Завантаження глобуса…';
    loadGlobeLib().then(function () {
      if (!G.open) return;
      buildGlobe(); load.style.display = 'none';
      pushGlobe(true); focusUkraine(0); startGlobeTimer();
    }).catch(function () {
      load.className = 'uas-gload err'; load.textContent = 'Не вдалося завантажити модуль глобуса. Перевірте інтернет і спробуйте ще раз.';
    });
  }
  function startGlobeTimer() { clearInterval(G.timer); G.timer = setInterval(function () { pushGlobe(false); }, 1200); }
  function closeGlobe() {
    if (!G.open) return;
    G.open = false; clearInterval(G.timer); clearTimeout(G.lblT); G.lblT = null;
    document.body.classList.remove('uas-globe-on');
    if (G.inst && G.inst.pauseAnimation) G.inst.pauseAnimation();
    setTimeout(function () { try { map.invalidateSize({ animate: false }); } catch (e) {} }, 50);
  }
  function exitGlobe() { if (S.globe) setKey('globe', false); else closeGlobe(); }
  function resizeGlobe() { if (G.inst) { G.inst.width(window.innerWidth).height(window.innerHeight); scheduleLabels(0); } }

  /* ------------------------------------------------------------------ *
   *  Інтерфейс: розмітка
   * ------------------------------------------------------------------ */
  var ICO = {
    map: '<svg viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4.5M12 17.4v.1"/></svg>',
    layers: '<svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z"/><path d="M10 21h4"/></svg>',
    ui: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M8 9v11"/></svg>',
    data: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>'
  };
  function row(kind, id, label, hint, extra) {
    var s = esc((label + ' ' + (hint || '') + ' ' + (extra || '')).toLowerCase());
    var lab = '<span class="uas-l">' + label + (hint ? '<small>' + hint + '</small>' : '') + '</span>';
    return '<label class="uas-row" data-s="' + s + '">' + lab + '<span class="uas-sw"><input type="checkbox" id="' + id + '" data-k="' + kind + '"><i></i></span></label>';
  }
  function rng(kind, id, label, min, max, step, hint, extra) {
    var s = esc((label + ' ' + (hint || '') + ' ' + (extra || '')).toLowerCase());
    return '<div class="uas-row uas-rng-row" data-s="' + s + '"><div class="uas-rl"><span class="uas-l">' + label + '</span><output id="' + id + '-o"></output></div>' +
      '<input class="uas-range" type="range" id="' + id + '" data-k="' + kind + '" min="' + min + '" max="' + max + '" step="' + step + '">' +
      (hint ? '<div class="uas-note">' + hint + '</div>' : '') + '</div>';
  }
  function chips(kind, id, opts, search) {
    return '<div class="uas-chips" id="' + id + '" data-chip="' + kind + '" data-s="' + esc(search || '') + '">' +
      opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function group(id, icon, title, body, open) {
    return '<details class="uas-group" id="uas-g-' + id + '"' + (open ? ' open' : '') + '><summary>' + ICO[icon] + '<span>' + title + '</span></summary><div class="uas-body">' + body + '</div></details>';
  }
  function colorBlock(level) {
    var r = RANGE[level];
    return '<div class="uas-col" id="uas-col-' + level + '" data-s="кольори тривог ' + r.name.toLowerCase() + ' рівень колір відтінок">' +
      '<div class="uas-col-h"><span class="uas-dot"></span><b>' + r.name + ' рівень</b><small>' + (level === 'red' ? 'ракетна небезпека, масована атака' : 'загроза дронів і шахедів') + '</small></div>' +
      '<div class="uas-sws" id="uas-sws-' + level + '"></div>' +
      '<div class="uas-rl"><span class="uas-l">Відтінок</span></div><input class="uas-range" type="range" id="uas-h-' + level + '" min="0" max="' + r.span + '" step="0.5">' +
      '<div class="uas-rl"><span class="uas-l">Яскравість</span></div><input class="uas-range" type="range" id="uas-l-' + level + '" min="' + r.lMin + '" max="' + r.lMax + '" step="1">' +
      '</div>';
  }
  function buildMaps() {
    return '<div class="uas-maps" id="uas-maps" data-s="підкладка карта супутник супутникова топографічна рельєф світла темна тактична без карти">' +
      BASES.map(function (b) {
        return '<button type="button" class="uas-map ' + b.id + '" data-id="' + b.id + '" data-thumb="' + esc(thumbUrl(b)) + '" title="' + esc(b.name) + '"><span>' + esc(b.name) + '<small>' + esc(b.note) + '</small></span></button>';
      }).join('') + '</div>';
  }

  var PANEL_HTML = function () {
    var g1 = row('globe', 'uas-globe-sw', 'Глобус', '3D-Земля з поточної підкладки; те саме робить повзунок унизу екрана', 'глобус 3d земля перемикач повзунок') +
      '<div class="uas-sub">Підкладка</div>' + buildMaps() +
      '<div class="uas-sub">Вигляд підкладки</div>' +
      rng('bright', 'uas-bright', 'Яскравість', 50, 140, 1, '', 'яскравість підкладка світліше темніше') +
      rng('contrast', 'uas-contrast', 'Контраст', 60, 150, 1, '', 'контраст підкладка') +
      rng('sat', 'uas-sat', 'Насиченість', 0, 200, 1, 'На супутнику зручно трохи знизити яскравість — тоді полігони тривог видно краще.', 'насиченість колір підкладка') +
      '<div class="uas-sub">Підписи та межі</div>' +
      row('labels', 'uas-labels', 'Назви міст і сіл', 'українською, поверх тривог', 'підписи назви населені пункти') +
      rng('labelsOp', 'uas-labelsOp', 'Прозорість підписів', 20, 100, 1, '', 'підписи прозорість') +
      row('oblasts', 'uas-oblasts', 'Межі областей', 'біла тонка лінія', 'кордони області') +
      row('raionLines', 'uas-raionLines', 'Межі районів без тривоги', 'сірувато-зелена лінія', 'кордони райони спокійні') +
      rng('calmFill', 'uas-calmFill', 'Заливка спокійних районів', 0, 60, 1, 'Нуль — карта повністю чиста, кольором виділяються лише тривоги.', 'заливка прозорість спокійні райони');

    var g2 = '<div class="uas-sub">Кольори рівнів</div>' + colorBlock('red') + colorBlock('yellow') +
      '<div class="uas-prev" id="uas-prev" data-s="кольори тривог попередній перегляд"><div id="uas-prev-red">Червоний</div><div id="uas-prev-yellow">Жовтий</div></div>' +
      '<p class="uas-note" data-s="кольори тривог правила обмеження">Червоний можна змінювати лише в червоних відтінках (від рожево-червоного до червоно-помаранчевого), жовтий — лише в жовтих (від бурштинового до лимонного). ' +
      'Поміняти їх місцями чи зробити однаковими неможливо: діапазони не перетинаються.</p>' +
      '<div class="uas-btns" data-s="кольори тривог скинути"><button type="button" class="rp-btn" id="uas-colors-reset">Скинути кольори</button></div>' +
      '<div class="uas-sub">Полігони тривог</div>' +
      rng('alertFill', 'uas-alertFill', 'Заливка тривоги', 8, 70, 1, '', 'заливка прозорість тривога') +
      rng('alertLine', 'uas-alertLine', 'Товщина межі тривоги', 0.3, 3, 0.05, '', 'товщина лінія межа тривога');

    var g3 = row('threats', 'uas-threats', 'Цілі (шахеди, ракети, авіація)', 'мітки на карті', 'шари цілі мітки шахеди ракети') +
      rng('threatScale', 'uas-threatScale', 'Розмір міток цілей', 60, 160, 5, '', 'розмір мітки цілі') +
      row('launch', 'uas-launch', 'Пускові майданчики', 'зелений — спокійно, червоний — пуск', 'шари пускові майданчики');

    var g4 = '<div class="uas-sub">Глобус</div>' +
      '<p class="uas-note" data-s="глобус 3d земля режим повзунок">Глобус працює за тією ж системою, що й карта: ті самі райони, тривоги, цілі, майданчики й підписи. Що ближче наближаєте, то більше назв з’являється — так само, як на карті.</p>' +
      row('globeRotate', 'uas-globeRotate', 'Автообертання глобуса', '', 'глобус обертання');

    var g6 = row('compact', 'uas-compact', 'Компактний режим', 'сховати «Онлайн» і лічильник глядачів', 'інтерфейс компактний') +
      rng('blur', 'uas-blur', 'Розмиття панелей', 0, 30, 1, '', 'скло розмиття панелі') +
      row('noMotion', 'uas-noMotion', 'Менше анімацій', 'вимикає блимання й пульсацію', 'анімація рух') +
      row('scaleBar', 'uas-scaleBar', 'Масштабна лінійка', 'у кілометрах', 'масштаб лінійка') +
      row('coords', 'uas-coords-sw', 'Координати', 'під курсором (на телефоні — центр карти)', 'координати курсор') +
      row('rememberView', 'uas-rememberView', 'Пам’ятати позицію карти', 'при наступному візиті відкриється те саме місце', 'позиція вигляд запам’ятати') +
      '<div class="uas-btns" data-s="повний екран"><button type="button" class="rp-btn" id="uas-fs">Повний екран</button><button type="button" class="rp-btn" id="uas-home">Вся Україна</button></div>';

    var g7 = '<div class="uas-btns" data-s="експорт імпорт налаштування файл"><button type="button" class="rp-btn" id="uas-export">Зберегти в файл</button>' +
      '<button type="button" class="rp-btn" id="uas-import">Завантажити з файлу</button></div><input type="file" id="uas-file" accept="application/json,.json" hidden>' +
      '<p class="uas-note" data-s="експорт імпорт налаштування файл">Налаштування зберігаються в цьому браузері. Файл допоможе перенести їх на інший пристрій.</p>' +
      '<div class="uas-btns" data-s="скинути всі налаштування"><button type="button" class="rp-btn danger" id="uas-reset">Скинути всі налаштування</button></div>';

    return '<div class="uas-head"><h2>ОПЦІЇ</h2><button class="uas-x" type="button" id="uas-close" aria-label="Закрити">✕</button></div>' +
      '<div class="uas-search"><input class="rp-input" id="uas-q" type="search" placeholder="Пошук опцій…" autocomplete="off"></div>' +
      '<div class="uas-scroll" id="uas-scroll">' +
      group('map', 'map', 'КАРТА', g1 + g4, true) + group('alerts', 'alert', 'ТРИВОГИ', g2, false) + group('layers', 'layers', 'ШАРИ', g3, false) +
      group('ui', 'ui', 'ІНТЕРФЕЙС', g6, false) + group('data', 'data', 'ДАНІ', g7, false) +
      '<div class="uas-empty" id="uas-empty">Нічого не знайдено</div></div>';
  };

  /* ------------------------------------------------------------------ *
   *  Інтерфейс: логіка
   * ------------------------------------------------------------------ */
  var toastT = null;
  function toast(msg) {
    var t = $('uas-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  var RANGE_FMT = {
    bright: '%', contrast: '%', sat: '%', labelsOp: '%', calmFill: '%', alertFill: '%', threatScale: '%',
    alertLine: function (v) { return (+v).toFixed(2) + ' px'; }, blur: ' px'
  };
  function fmt(k, v) { var f = RANGE_FMT[k]; return typeof f === 'function' ? f(v) : (+v) + (f || ''); }

  function syncColorUI() {
    ['red', 'yellow'].forEach(function (lv) {
      var col = $('uas-col-' + lv); if (!col) return;
      var c = S[lv], r = RANGE[lv], hex = UAS.color(lv);
      col.style.setProperty('--uas-c', hex);
      var h = $('uas-h-' + lv), l = $('uas-l-' + lv);
      h.value = hueOffset(lv, c.h); l.value = c.l;
      var stops = [];
      for (var i = 0; i <= 6; i++) stops.push('hsl(' + (((r.min + r.span * i / 6) % 360 + 360) % 360).toFixed(1) + ',100%,' + Math.round(c.l) + '%)');
      h.style.setProperty('--uas-track', 'linear-gradient(90deg,' + stops.join(',') + ')');
      l.style.setProperty('--uas-track', 'linear-gradient(90deg,hsl(' + c.h.toFixed(1) + ',100%,' + r.lMin + '%),hsl(' + c.h.toFixed(1) + ',100%,' + r.lMax + '%))');
      Array.prototype.forEach.call($('uas-sws-' + lv).children, function (b) {
        b.classList.toggle('on', Math.abs(+b.dataset.h - c.h) < 0.05 && Math.abs(+b.dataset.l - c.l) < 0.05);
      });
      var pv = $('uas-prev-' + lv);
      if (pv) { pv.style.background = hex2rgba(hex, Math.min(0.9, Math.max(0.35, S.alertFill / 100 * 2))); pv.style.boxShadow = 'inset 0 0 0 1px ' + UAS.edge(lv); }
    });
  }
  function syncUI() {
    if (!$('uas-panel')) return;
    Array.prototype.forEach.call(document.querySelectorAll('#uas-panel input[data-k]'), function (el) {
      var k = el.dataset.k;
      if (el.type === 'checkbox') el.checked = !!S[k];
      else { el.value = S[k]; var o = $(el.id + '-o'); if (o) o.textContent = fmt(k, S[k]); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('#uas-panel [data-chip]'), function (box) {
      var k = box.dataset.chip;
      Array.prototype.forEach.call(box.children, function (b) { b.classList.toggle('on', b.dataset.v === String(S[k])); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#uas-maps .uas-map'), function (b) { b.classList.toggle('on', b.dataset.id === S.basemap); });
    syncColorUI(); syncGlobeSwitch();
  }
  function setKey(k, v) {
    S[k] = v; save();
    if (EFFECTS[k]) EFFECTS[k]();
  }

  /* пошук по налаштуваннях */
  function filterSettings() {
    var q = $('uas-q').value.trim().toLowerCase(), any = false;
    Array.prototype.forEach.call(document.querySelectorAll('#uas-panel .uas-group'), function (g) {
      var hit = 0;
      Array.prototype.forEach.call(g.querySelectorAll('[data-s]'), function (el) {
        var ok = !q || el.dataset.s.indexOf(q) !== -1;
        el.style.display = ok ? '' : 'none'; if (ok) hit++;
      });
      Array.prototype.forEach.call(g.querySelectorAll('.uas-sub'), function (s) { s.style.display = q ? 'none' : ''; });
      var titleHit = q && g.querySelector('summary span').textContent.toLowerCase().indexOf(q) !== -1;
      if (titleHit) Array.prototype.forEach.call(g.querySelectorAll('[data-s]'), function (el) { el.style.display = ''; });
      g.style.display = (!q || hit || titleHit) ? '' : 'none';
      if (q && (hit || titleHit)) { g.open = true; any = true; }
    });
    $('uas-empty').style.display = q && !any ? 'block' : 'none';
    if (!q) Array.prototype.forEach.call(document.querySelectorAll('#uas-panel [data-s]'), function (el) { el.style.display = ''; });
  }

  /* відкриття / закриття панелі */
  var thumbsLoaded = false;
  function openPanel() {
    var p = $('uas-panel'); if (!p || p.classList.contains('open')) return;
    try { if (typeof closeFeedPanel === 'function') closeFeedPanel(); } catch (e) {}
    try { if (typeof currentTab !== 'undefined' && currentTab === 'info' && typeof setTab === 'function') setTab('map'); } catch (e) {}
    if (!thumbsLoaded) {
      thumbsLoaded = true;
      Array.prototype.forEach.call(document.querySelectorAll('#uas-maps .uas-map'), function (b) {
        if (b.dataset.thumb) b.style.backgroundImage = 'url("' + b.dataset.thumb + '")';
      });
    }
    p.classList.add('open');
    var nav = document.querySelector('.nav-item[data-tab="settings"]'); if (nav) nav.classList.add('active');
  }
  function closePanel() {
    var p = $('uas-panel'); if (!p || !p.classList.contains('open')) return;
    p.classList.remove('open');
    var nav = document.querySelector('.nav-item[data-tab="settings"]'); if (nav) nav.classList.remove('active');
  }
  function togglePanel() { var p = $('uas-panel'); if (p && p.classList.contains('open')) closePanel(); else openPanel(); }

  var resetArm = null;
  function buildUI() {
    var panel = document.createElement('aside');
    panel.id = 'uas-panel'; panel.setAttribute('aria-label', 'Опції');
    panel.innerHTML = PANEL_HTML();
    document.body.appendChild(panel);

    var t = document.createElement('div'); t.className = 'uas-toast'; t.id = 'uas-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t);
    var co = document.createElement('div'); co.id = 'uas-coords'; document.body.appendChild(co);

    var gv = document.createElement('div'); gv.id = 'uas-globe';
    gv.innerHTML = '<div id="uas-globe-canvas"></div><div class="uas-gload" id="uas-gload"></div>';
    document.body.appendChild(gv);


    /* поки відкритий глобус, «+» / «−» керують ним, а не прихованою картою */
    var tb = document.querySelector('.toolbar');
    if (tb) tb.addEventListener('click', function (e) {
      if (!G.open) return;
      var b = e.target.closest && e.target.closest('button'); if (!b) return;
      if (b.id === 'reset-view') { e.stopImmediatePropagation(); focusUkraine(); }
      else if (b.id === 'zoom-in') { e.stopImmediatePropagation(); zoomGlobe(0.7); }
      else if (b.id === 'zoom-out') { e.stopImmediatePropagation(); zoomGlobe(1.4); }
    }, true);

    /* прив'язки */
    panel.addEventListener('input', function (e) {
      var el = e.target, k = el.dataset && el.dataset.k;
      if (el.type === 'range' && k) {
        var v = +el.value; var o = $(el.id + '-o'); if (o) o.textContent = fmt(k, v);
        setKey(k, v);
      } else if (el.id && el.id.indexOf('uas-h-') === 0) {
        var lv = el.id.slice(6), r = RANGE[lv];
        S[lv] = cleanColor(lv, { h: (r.min + (+el.value)) % 360, l: S[lv].l }); save(); applyColors();
      } else if (el.id && el.id.indexOf('uas-l-') === 0) {
        var lv2 = el.id.slice(6);
        S[lv2] = cleanColor(lv2, { h: S[lv2].h, l: +el.value }); save(); applyColors();
      }
      else if (el.id === 'uas-q') { filterSettings(); }
    });
    panel.addEventListener('change', function (e) {
      var el = e.target, k = el.dataset && el.dataset.k;
      if (el.type === 'checkbox' && k) { setKey(k, el.checked); }
      if (el.id === 'uas-file') importFile(el.files && el.files[0]);
    });
    panel.addEventListener('click', function (e) {
      var t = e.target, b = t.closest ? t.closest('button') : null; if (!b) return;
      if (b.classList.contains('uas-map')) { setKey('basemap', b.dataset.id); syncUI(); return; }
      var chip = b.parentNode && b.parentNode.dataset && b.parentNode.dataset.chip;
      if (chip) { setKey(chip, b.dataset.v); syncUI(); return; }
      if (b.parentNode && b.parentNode.id && b.parentNode.id.indexOf('uas-sws-') === 0) {
        var lv = b.parentNode.id.slice(8);
        S[lv] = cleanColor(lv, { h: +b.dataset.h, l: +b.dataset.l }); save(); applyColors(); return;
      }
      switch (b.id) {
        case 'uas-close': closePanel(); break;
        case 'uas-colors-reset': S.red = clone(RANGE.red.def); S.yellow = clone(RANGE.yellow.def); save(); applyColors(); toast('Кольори тривог скинуто'); break;
        case 'uas-fs': if (!document.fullscreenElement) { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } else { document.exitFullscreen && document.exitFullscreen(); } break;
        case 'uas-home': if (G.open) focusUkraine(); else map.setView([48.55, 31.3], 6); break;
        case 'uas-export': exportS(); break;
        case 'uas-import': $('uas-file').click(); break;
        case 'uas-reset':
          if (!resetArm) {
            b.textContent = 'Точно скинути? Натисніть ще раз';
            resetArm = setTimeout(function () { resetArm = null; b.textContent = 'Скинути всі налаштування'; }, 3500);
          } else {
            clearTimeout(resetArm); resetArm = null; b.textContent = 'Скинути всі налаштування';
            resetAll();
          }
          break;
      }
    });

    /* кольорові плитки */
    ['red', 'yellow'].forEach(function (lv) {
      $('uas-sws-' + lv).innerHTML = SWATCHES[lv].map(function (s) {
        return '<button type="button" data-h="' + s[0] + '" data-l="' + s[1] + '" style="--sw:' + fillHex(lv, { h: s[0], l: s[1] }) + '" aria-label="' + RANGE[lv].name + ' ' + fillHex(lv, { h: s[0], l: s[1] }) + '"></button>';
      }).join('');
    });

    /* глобус: кнопки */
    window.addEventListener('resize', resizeGlobe);

    /* на вкладці «Радар» карта вимкнена, тож «Опції» й «Стрічка» там недоступні */
    function onRadarTab() { return typeof currentTab !== 'undefined' && currentTab === 'radar'; }
    function blockedOnRadar(e) {
      if (!onRadarTab()) return false;
      e.stopImmediatePropagation(); e.preventDefault();
      toast('Перейдіть на карту, щоб відкрити цю функцію');
      return true;
    }

    /* меню: кнопка «ОПЦІЇ»; інші розділи закривають глобус */
    var nav = document.querySelector('.nav-item[data-tab="settings"]');
    if (nav) nav.addEventListener('click', function (e) { if (blockedOnRadar(e)) return; e.stopImmediatePropagation(); togglePanel(); }, true);
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (n) {
      if (n.dataset.tab === 'settings' || n.id === 'chat-nav-btn') return;
      n.addEventListener('click', function () { if (n.id === 'radar-nav-btn') exitGlobe(); closePanel(); }, true);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var pn = $('uas-panel'); if (pn && pn.classList.contains('open')) closePanel(); else if (G.open) exitGlobe();
    });
    /* «Стрічка» відкривається окремою кнопкою: на «Радарі» — заблоковано, інакше закриваємо опції */
    var fb = $('feed-nav-btn');
    if (fb) fb.addEventListener('click', function (e) { if (blockedOnRadar(e)) return; closePanel(); }, true);

    /* пам'ятати позицію */
    map.on('moveend', function () {
      if (!S.rememberView || document.body.classList.contains('tab-radar')) return;
      var c = map.getCenter(); S.view = { lat: +c.lat.toFixed(4), lng: +c.lng.toFixed(4), z: map.getZoom() }; save();
    });

    syncUI();
  }

  /* експорт / імпорт / скидання */
  function exportS() {
    try {
      var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ua-radar-settings.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    } catch (e) { toast('Не вдалося створити файл'); }
  }
  function replaceS(next) {
    Object.keys(S).forEach(function (k) { delete S[k]; });
    Object.keys(next).forEach(function (k) { S[k] = next[k]; });
    save(); syncUI(); applyAll(); if (G.inst) { setGlobeBase(); if (G.open) pushGlobe(true); G.inst.controls().autoRotate = S.globeRotate; }
  }
  function importFile(f) {
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var raw = JSON.parse(String(r.result)), warn = false;
        ['red', 'yellow'].forEach(function (lv) { if (raw && raw[lv] && !hueOK(lv, raw[lv].h)) warn = true; });
        replaceS(sanitize(raw));
        toast(warn ? 'Імпортовано. Недопустимі кольори тривог замінено стандартними' : 'Налаштування завантажено');
      } catch (e) { toast('Файл не схожий на налаштування UA Radar'); }
      $('uas-file').value = '';
    };
    r.readAsText(f);
  }
  function resetAll() { replaceS(sanitize(null)); toast('Усі налаштування скинуто'); }

  /* ------------------------------------------------------------------ *
   *  Запуск
   * ------------------------------------------------------------------ */
  /* фаза A: підкладка й кольори — одразу, щоб карта не блимала стандартним виглядом */
  setBase(S.basemap);
  var rs = document.documentElement.style;
  rs.setProperty('--uas-red', UAS.color('red')); rs.setProperty('--uas-red-edge', UAS.edge('red'));
  rs.setProperty('--uas-yellow', UAS.color('yellow')); rs.setProperty('--uas-yellow-edge', UAS.edge('yellow'));

  /* фаза B: коли завантажено весь основний скрипт (geoLayer, raionIdsByName, ...) */
  function late() {
    try { buildUI(); } catch (e) { console.error('UA-SETTINGS', e); return; }
    applyAll();
    if (S.rememberView && S.view) { try { map.setView([S.view.lat, S.view.lng], S.view.z, { animate: false }); } catch (e) {} }
    try { onAlerts(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', late); else setTimeout(late, 0);

  /* корисне для дебагу та інших скриптів */
  UAS.open = openPanel; UAS.close = closePanel; UAS.openGlobe = function () { setKey('globe', true); syncUI(); }; UAS.closeGlobe = exitGlobe;
  /* основний скрипт кличе це одразу після того, як перемалював геометрію районів
     (наприклад, після завантаження точніших меж з мережі) — без цього глобус ще
     довго показує старі, закешовані прорідже-ні контури поряд із новою картою. */
  UAS.onRaionsUpdated = function () { G.thin = {}; if (G.inst) pushGlobe(true); };
  UAS.setBase = function (id) { setKey('basemap', id); syncUI(); };
})();
