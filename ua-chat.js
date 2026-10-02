/* ==========================================================================
   UA-CHAT — повідомлення «хмарками» як у Telegram + модерація через сервер.
   Читання — напряму з Firebase (realtime). УСЕ, що пише/видаляє/закріплює —
   тільки через ендпоінти бота /chat/* (перевірка токена, адмінів, AI-фільтр).
   Підключати ПІСЛЯ скрипта Радара (потрібні RADAR_CFG, RK, rlsGet, chatIdentity).
   ========================================================================== */
(function () {
  'use strict';
  var API = RADAR_CFG.API;
  var $ = function (id) { return document.getElementById(id); };
  var area = $('msg-area');
  var msgs = [], pinned = null, replyTo = null, busy = false, serverAdmin = null, raf = 0;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function toast(t, ok) {
    var e = $('error-box'); e.innerText = t; e.style.background = ok ? '#1f7a2e' : '';
    e.style.display = 'block'; clearTimeout(e._t); e._t = setTimeout(function () { e.style.display = 'none'; }, 3500);
  }
  async function call(path, body) {
    var r = await fetch(API + '/chat/' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: rlsGet(RK.token) }, body || {}))
    });
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok || j.error) { var er = new Error(j.reason || j.error || ('Помилка ' + r.status)); er.code = j.error; throw er; }
    return j;
  }

  /* адмін: відповідь сервера головніша; поки її нема — локальний список (лише для показу кнопок) */
  window.chatIsAdminViewer = function () {
    if (serverAdmin !== null) return serverAdmin;
    return !!(chatIdentity && CHAT_ADMIN_IDS.indexOf(String(chatIdentity.telegramId)) > -1);
  };
  var isMe = function (m) { return !!(chatIdentity && String(m.telegramId) === String(chatIdentity.telegramId)); };

  function hue(id) { var h = 0, s = String(id); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; }
  var hm = function (t) { return new Date(t || 0).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }); };
  function dayLabel(d) {
    var t = new Date(); if (d.toDateString() === t.toDateString()) return 'Сьогодні';
    t.setDate(t.getDate() - 1); if (d.toDateString() === t.toDateString()) return 'Вчора';
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  }

  /* ---------- рендер ---------- */
  function render() {
    raf = 0;
    var stick = area.scrollHeight - area.scrollTop - area.clientHeight < 90;
    var html = '', prev = null, lastDay = '';
    msgs.forEach(function (m, i) {
      var d = new Date(m.time || 0), day = d.toDateString();
      if (day !== lastDay) { html += '<div class="tg-day"><span>' + dayLabel(d) + '</span></div>'; lastDay = day; prev = null; }
      var nx = msgs[i + 1];
      var grp = function (a, b) { return a && b && a.telegramId === b.telegramId && Math.abs((b.time || 0) - (a.time || 0)) < 300000 && new Date(b.time || 0).toDateString() === day; };
      var first = !grp(prev, m), last = !grp(m, nx), me = isMe(m), adm = m.role === 'admin', c = hue(m.telegramId || m.nick);
      var ava = me ? '' : last
        ? '<div class="tg-ava" style="background:hsl(' + c + ' 55% 34%)">' + esc((m.nick || '?').trim().charAt(0).toUpperCase()) + '</div>'
        : '<div class="tg-ava-sp"></div>';
      var nick = (!me && first)
        ? '<div class="tg-nick" style="color:hsl(' + c + ' 75% 68%)">' + esc(m.nick) + (adm ? ' <i class="tg-adm">адмін</i>' : '') + '</div>' : '';
      var rep = m.reply ? '<div class="tg-reply" data-go="' + esc(m.reply.k) + '"><b>' + esc(m.reply.nick) + '</b><span>' + esc(m.reply.text) + '</span></div>' : '';
      html += '<div class="tg-row ' + (me ? 'me' : 'ot') + (first ? ' f' : '') + (last ? ' l' : '') + '" data-k="' + esc(m.k) + '">' + ava +
        '<div class="tg-bubble' + (adm ? ' adm' : '') + '">' + nick + rep +
        '<div class="tg-text">' + esc(m.text) + '<span class="tg-time">' + hm(m.time) + '</span></div></div></div>';
      prev = m;
    });
    area.innerHTML = html;
    if (stick) area.scrollTop = area.scrollHeight;
  }
  function sched() { if (!raf) raf = requestAnimationFrame(render); }

  function renderPinned() {
    var box = $('chat-pinned');
    if (!pinned) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.innerHTML = '<div class="cp-body" data-go="' + esc(pinned.id) + '"><div class="cp-label">📌 Закріплене</div><div class="cp-txt"><b>' +
      esc(pinned.nick) + ':</b> ' + esc(pinned.text) + '</div></div>' +
      (chatIsAdminViewer() ? '<span class="cp-unpin" data-act="unpin" title="Відкріпити">✕</span>' : '');
    box.style.display = 'flex';
  }

  function jump(k) {
    var el = area.querySelector('[data-k="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]');
    if (!el) { toast('Повідомлення поза історією'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1400);
  }

  /* ---------- меню дій (клік / тап / ПКМ по хмарці) ---------- */
  function closeMenu() { var m = $('tg-menu'); if (m) m.remove(); }
  function openMenu(row, x, y) {
    closeMenu();
    var k = row.dataset.k, m = msgs.find(function (z) { return z.k === k; }); if (!m) return;
    var adm = chatIsAdminViewer(), items = [['reply', '↩ Відповісти'], ['copy', '⧉ Копіювати']];
    if (adm) items.push(pinned && pinned.id === k ? ['unpin', '📌 Відкріпити'] : ['pin', '📌 Закріпити']);
    if (adm || isMe(m)) items.push(['del', '🗑 Видалити', 'danger']);
    var el = document.createElement('div'); el.id = 'tg-menu';
    el.innerHTML = items.map(function (i) { return '<button data-act="' + i[0] + '" class="' + (i[2] || '') + '">' + i[1] + '</button>'; }).join('');
    $('chat-panel').appendChild(el);
    var r = $('chat-panel').getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(x - r.left, r.width - el.offsetWidth - 8)) + 'px';
    el.style.top = Math.max(8, Math.min(y - r.top, r.height - el.offsetHeight - 8)) + 'px';
    el.onclick = async function (e) {
      var a = e.target.dataset.act; if (!a) return; closeMenu();
      try {
        if (a === 'reply') { replyTo = { k: k, nick: m.nick, text: m.text }; showReply(); }
        else if (a === 'copy') { navigator.clipboard && navigator.clipboard.writeText(m.text); toast('Скопійовано', true); }
        else if (a === 'pin') { await call('pin', { id: k }); toast('Закріплено', true); }
        else if (a === 'unpin') { await call('unpin'); }
        else if (a === 'del') { if (confirm('Видалити це повідомлення?')) await call('delete', { id: k }); }
      } catch (er) { toast(er.message); }
    };
  }
  area.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]'); if (g) { jump(g.dataset.go); return; }
    var row = e.target.closest('.tg-row'); if (row) { e.stopPropagation(); openMenu(row, e.clientX, e.clientY); }
  });
  area.addEventListener('contextmenu', function (e) { var row = e.target.closest('.tg-row'); if (row) { e.preventDefault(); openMenu(row, e.clientX, e.clientY); } });
  document.addEventListener('click', function (e) { if (!e.target.closest('#tg-menu')) closeMenu(); });
  $('chat-pinned').addEventListener('click', async function (e) {
    var g = e.target.closest('[data-go]');
    if (e.target.dataset.act === 'unpin') { try { await call('unpin'); } catch (er) { toast(er.message); } }
    else if (g) jump(g.dataset.go);
  });

  /* ---------- відповідь + відправка ---------- */
  function showReply() {
    var b = $('tg-replybar'); b.hidden = !replyTo; if (!replyTo) return;
    b.querySelector('b').innerText = replyTo.nick; b.querySelector('span').innerText = replyTo.text; $('msg-field').focus();
  }
  window.chatCancelReply = function () { replyTo = null; showReply(); };
  window.sendMsg = async function () {
    if (busy || !chatIdentity) return;
    var f = $('msg-field'), text = f.value.trim(); if (!text) return;
    busy = true; $('msg-send').disabled = true;
    try { await call('send', { text: text, replyTo: replyTo && replyTo.k }); f.value = ''; chatCancelReply(); }
    catch (e) { toast(e.message); }
    finally { busy = false; $('msg-send').disabled = false; f.focus(); }
  };
  $('msg-field').onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };

  /* ---------- Firebase (лише читання) ---------- */
  var q = db.ref('chat').limitToLast(150);
  q.on('child_added', function (s) {
    var m = s.val() || {}; m.k = s.key; msgs.push(m); sched();
    if (!$('chat-panel').classList.contains('open')) $('chat-nav-btn').classList.add('has-alert');
  });
  q.on('child_removed', function (s) { msgs = msgs.filter(function (x) { return x.k !== s.key; }); sched(); });
  db.ref('chat_pinned').on('value', function (s) { pinned = s.val(); renderPinned(); });

  /* після входу: хто я (сервер) → перемалювати все, бо історія прийшла ще до входу */
  var _box = window.chatShowBox;
  window.chatShowBox = function () {
    _box();
    sched();
    call('whoami').then(function (j) { serverAdmin = !!j.admin; sched(); renderPinned(); }).catch(function () { serverAdmin = null; });
  };
})();
