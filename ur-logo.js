/* ==========================================================================
   <ur-logo> — Ukraine Radar logo, fully vector, animated.
   variants:  full      radar emblem + "UKRAINE RADAR" inside the outer ring
              mark      radar emblem only (UR + radar), for headers / buttons
              wordmark  stencil "UKRAINE / RADAR" only
   The sweep rotates continuously (SMIL, no JS per frame). The radar centre is
   intentionally empty: no dot, the beam apex and the crosshair both fade out
   before they reach it.
   ========================================================================== */
(function () {
  'use strict';

  /* ---- geometry, traced from the reference artwork (1254 x 1254 space) ---- */
    var UR = [                                   // the "UR" monogram
    '421,269 514,269 514,559 557,559 557,636 481,636 421,568',   // U left
    '628,271 716,272 716,567 657,636 586,636 586,560 628,559',   // U right (also R stem)
    '741,345 828,345 869,397 869,470 834,511 741,511 741,466 797,466 797,399 741,399', // R bowl
    '744,528 828,528 890,628 807,628'                             // R leg
  ];
  var WORD_TOP = [                             // UKRAINE (white)
    '228,687 263,687 263,772 280,772 280,793 252,793 228,769',
    '340,687 305,687 305,772 288,772 288,793 316,793 340,769',
    '356,687 391,687 391,793 356,793',
    '470,687 431,687 398,723 398,767 457,704',
    '434,740 436,740 466,782 472,793 432,793 413,766 413,762',
    '484,687 517,687 517,793 484,793',
    '525,687 570,687 590,707 590,739 571,758 591,793 555,793 537,760 525,758 525,739 551,739 555,735 555,712 552,709 525,709',
    '640,695 655,731 631,793 598,793 637,696',
    '645,687 677,688 725,793 689,793 682,778 644,778 651,758 674,757',
    '737,687 772,687 772,793 737,793',
    '795,700 799,702 827,743 827,793 796,793',
    '798,687 835,687 908,793 871,793',
    '877,687 909,687 909,778 877,735',
    '931,687 965,687 965,729 1003,729 1003,749 965,750 965,793 931,793',
    '972,687 1026,687 1026,712 997,712 995,708 972,708',
    '972,771 996,771 997,767 1026,767 1026,793 972,793'
  ];
  var WORD_BOT = [                             // RADAR (green)
    '355,815 383,815 383,909 355,909',
    '392,815 433,815 450,832 450,863 434,879 452,909 420,909 402,880 391,880 391,861 416,861 420,858 420,839 417,836 392,836',
    '501,822 513,856 492,909 462,909 498,823',
    '505,815 532,815 575,909 544,909 538,896 504,896 512,877 530,876',
    '587,815 616,815 616,909 587,909',
    '625,815 661,815 682,836 682,888 661,909 624,909 624,888 647,888 651,884 652,841 646,836 624,836',
    '725,823 738,855 717,909 687,909 723,823',
    '731,815 759,815 799,909 768,909 762,896 729,896 736,877 755,876',
    '811,815 839,815 839,909 810,909',
    '846,815 887,815 906,833 906,862 889,879 907,909 875,909 857,880 846,880 846,861 872,861 875,858 875,839 872,836 846,836'
  ];

  function polys(list, cls) {
    return list.map(function (p) { return '<polygon class="' + cls + '" points="' + p + '"/>'; }).join('');
  }

  /* sweep trail: N thin wedges behind the beam, fading out (beam points north) */
  function sweepWedges(cx, cy, R, n, step) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var a1 = -(i + 1) * step * Math.PI / 180, a2 = -i * step * Math.PI / 180;
      var x1 = cx + R * Math.sin(a1), y1 = cy - R * Math.cos(a1);
      var x2 = cx + R * Math.sin(a2), y2 = cy - R * Math.cos(a2);
      var o = (0.34 * Math.pow(1 - i / n, 1.7)).toFixed(3);
      out += '<path d="M' + cx + ' ' + cy + 'L' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
             'A' + R + ' ' + R + ' 0 0 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + 'Z" fill-opacity="' + o + '"/>';
    }
    return out;
  }

  var SWEEP_PERIOD = 4;           // seconds per revolution
  var BLIP_ANGLE = 59;            // degrees clockwise from north

  function build(variant) {
    var full = variant === 'full', mark = variant === 'mark', word = variant === 'wordmark';
    /* one centre for the ring, the range rings, the crosshair and the sweep */
    var cx = full ? 623 : 625, cy = full ? 597 : 462;
    var ringR = full ? 534 : 434;
    var R = ringR - 8;                                   // sweep reaches the inside of the ring
    var radii = full ? [185, 305, 425] : [135, 245, 355];
    var holeR = full ? 135 : 105;                        // clean, empty centre
    var vb = full ? '48 22 1150 1150' : mark ? '150 -13 950 950' : '214 676 826 245';
    var bR = R * 0.8;
    var bx = cx + bR * Math.sin(BLIP_ANGLE * Math.PI / 180);
    var by = cy - bR * Math.cos(BLIP_ANGLE * Math.PI / 180);
    var tHit = (BLIP_ANGLE / 360 * SWEEP_PERIOD).toFixed(3);

    var defs =
      '<defs>' +
      '<linearGradient id="gU" gradientUnits="userSpaceOnUse" x1="0" y1="269" x2="0" y2="636">' +
        '<stop offset="0" stop-color="#c9ff4d"/><stop offset=".42" stop-color="#57ff2e"/><stop offset="1" stop-color="#0b8f1e"/></linearGradient>' +
      '<linearGradient id="gW" gradientUnits="userSpaceOnUse" x1="0" y1="687" x2="0" y2="793">' +
        '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d6d9d0"/></linearGradient>' +
      '<linearGradient id="gG" gradientUnits="userSpaceOnUse" x1="0" y1="815" x2="0" y2="909">' +
        '<stop offset="0" stop-color="#b6ff42"/><stop offset=".55" stop-color="#4dff2c"/><stop offset="1" stop-color="#23d21f"/></linearGradient>' +
      '<linearGradient id="gBeam" gradientUnits="userSpaceOnUse" x1="0" y1="' + cy + '" x2="0" y2="' + (cy - R) + '">' +
        '<stop offset="0" stop-color="#e2ffb0" stop-opacity="0"/><stop offset=".45" stop-color="#e2ffb0" stop-opacity=".9"/><stop offset="1" stop-color="#ffffff"/></linearGradient>' +
      '<radialGradient id="gHole" gradientUnits="userSpaceOnUse" cx="' + cx + '" cy="' + cy + '" r="' + holeR + '"><stop offset="0" stop-color="#000" stop-opacity="1"/><stop offset=".6" stop-color="#000" stop-opacity=".92"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
      '<mask id="mRadar" maskUnits="userSpaceOnUse" x="-100" y="-100" width="1500" height="1500">' +
        '<rect x="-100" y="-100" width="1500" height="1500" fill="#fff"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + holeR + '" fill="url(#gHole)"/></mask>' +
      '<clipPath id="cDisc"><circle cx="' + cx + '" cy="' + cy + '" r="' + (ringR - 6) + '"/></clipPath>' +
      '<filter id="fGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="' + (mark ? 14 : 11) + '"/></filter>' +
      '<filter id="fSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>' +
      '</defs>';

    var rings = radii.map(function (r, i) {
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" class="ring' + (i === 0 ? ' dash' : '') + '"/>';
    }).join('');

    /* ---- radar layer ---- */
    var radar =
      '<g clip-path="url(#cDisc)"><g mask="url(#mRadar)">' +
        rings +
        '<line x1="' + (cx - R) + '" y1="' + cy + '" x2="' + (cx + R) + '" y2="' + cy + '" class="cross"/>' +
        '<line x1="' + cx + '" y1="' + (cy - R) + '" x2="' + cx + '" y2="' + (cy + R) + '" class="cross"/>' +
        '<g id="sweep">' +
          '<g fill="#4dff2e">' + sweepWedges(cx, cy, R, 44, 1.35) + '</g>' +
          '<line x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - R) + '" stroke="#4dff2e" stroke-width="9" opacity=".35" filter="url(#fSoft)"/>' +
          '<line x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - R) + '" stroke="url(#gBeam)" stroke-width="3.2" stroke-linecap="round"/>' +
          '<animateTransform attributeName="transform" type="rotate" from="0 ' + cx + ' ' + cy + '" to="360 ' + cx + ' ' + cy + '" dur="' + SWEEP_PERIOD + 's" repeatCount="indefinite"/>' +
        '</g>' +
      '</g>' +
      /* target blip: lights up as the beam passes, then fades like phosphor */
      '<g>' +
        '<circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="9" fill="#eaffd0" opacity=".12">' +
          '<animate attributeName="opacity" dur="' + SWEEP_PERIOD + 's" repeatCount="indefinite" keyTimes="0;' + (BLIP_ANGLE / 360 - 0.002).toFixed(4) + ';' + (BLIP_ANGLE / 360).toFixed(4) + ';0.62;1" values=".12;.12;1;.3;.12"/>' +
        '</circle>' +
        '<circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="9" fill="none" stroke="#7dff5a" stroke-width="3" opacity="0">' +
          '<animate attributeName="r" begin="' + tHit + 's" dur="' + SWEEP_PERIOD + 's" repeatCount="indefinite" keyTimes="0;.22;1" values="9;46;46"/>' +
          '<animate attributeName="opacity" begin="' + tHit + 's" dur="' + SWEEP_PERIOD + 's" repeatCount="indefinite" keyTimes="0;.22;1" values=".9;0;0"/>' +
        '</circle>' +
      '</g></g>';

    var monogram =
      '<g filter="url(#fGlow)" opacity=".55">' + polys(UR, 'ur') + '</g>' +
      '<g>' + polys(UR, 'ur') + '</g>';

    var ring =
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + ringR + '" fill="none" stroke="#3dff2a" stroke-width="22" filter="url(#fGlow)" opacity=".7"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + ringR + '" fill="none" stroke="#45ff2c" stroke-width="14"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (ringR + 4) + '" fill="none" stroke="#d6ffb8" stroke-width="1.4" opacity=".55"/>';

    var text =
      '<g class="wt">' + polys(WORD_TOP, 'wt') + '</g>' +
      '<g class="wg">' + polys(WORD_BOT, 'wg') + '</g>';

    var body;
    if (word) {
      body = '<g filter="url(#fGlow)" opacity=".25" class="wg">' + polys(WORD_BOT, 'wg') + '</g>' + text;
    } else {
      body =
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + (ringR - 6) + '" fill="#010603" fill-opacity=".9"/>' +
        radar + monogram + (full ? text : '') + ring;
    }

    var css =
      '<style>' +
      ':host{display:inline-block;line-height:0}svg{width:100%;height:100%;display:block;overflow:visible}' +
      '.ring{fill:none;stroke:#2dd82a;stroke-width:3;stroke-opacity:.5}.ring.dash{stroke-dasharray:6 12;stroke-opacity:.4;stroke-width:2.5}' +
      '.cross{stroke:#3dff2a;stroke-opacity:.4;stroke-width:2.6}' +
      'polygon.ur{fill:url(#gU);stroke:#dcffc4;stroke-opacity:.55;stroke-width:1.6;stroke-linejoin:round}' +
      'polygon.wt{fill:url(#gW)}polygon.wg{fill:url(#gG)}' +
      '</style>';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" role="img" aria-label="Ukraine Radar">' +
           css + defs + body + '</svg>';
  }

  class URLogo extends HTMLElement {
    static get observedAttributes() { return ['variant']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
      var v = this.getAttribute('variant') || 'full';
      var root = this.shadowRoot || this.attachShadow({ mode: 'open' });
      root.innerHTML = build(v);
      var svg = root.querySelector('svg');
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
        /* keep the sweep alive for reduced-motion users, just much slower */
        var a = svg.querySelector('#sweep animateTransform');
        if (a) a.setAttribute('dur', '16s');
      }
    }
  }
  if (!customElements.get('ur-logo')) customElements.define('ur-logo', URLogo);

  /* static build, used to generate the favicon and for tooling */
  window.URLogoSVG = build;
})();
