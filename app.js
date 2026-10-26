/* دفتر الحسابات — الواجهة */
(function () {
  'use strict';
  var C = window.Core;
  var KEY = 'dafter.db.v1';
  var KEY_BEFORE_IMPORT = 'dafter.db.beforeImport';
  var APP_VERSION = '1.0.0';
  var db = C.emptyDB();
  var bal = {};
  var view = document.getElementById('view');
  var toastEl = document.getElementById('toast');
  var homeState = { q: '', sort: 'recent' };
  var personFilter = { pid: null, cur: '', dir: '', from: '', to: '', q: '' };
  var deferredInstall = null;

  // ================= أدوات =================
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function money(c, cur) { return '<span class="num">' + C.fmt(Math.abs(c)) + ' ' + C.CUR[cur].sym + '</span>'; }
  function initial(name) { var s = (name || '?').trim(); return esc(s.charAt(0)); }
  function person(id) { for (var i = 0; i < db.people.length; i++) if (db.people[i].id === id) return db.people[i]; return null; }
  var ICON = {
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    filter: '<svg viewBox="0 0 24 24"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>',
    chev: '<svg viewBox="0 0 24 24" class="chev"><path d="M6 9l6 6 6-6"/></svg>',
    userPlus: '<svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="4"/><path d="M2 21a8 8 0 0 1 16 0M19 8v6M16 11h6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>'
  };

  // ================= التخزين =================
  var IDB = {
    db: null,
    open: function () {
      if (this.db) return Promise.resolve(this.db);
      var self = this;
      return new Promise(function (res, rej) {
        if (!window.indexedDB) return rej(new Error('no idb'));
        var r = indexedDB.open('dafter', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { self.db = r.result; res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    },
    get: function () {
      return this.open().then(function (d) {
        return new Promise(function (res) {
          var q = d.transaction('kv').objectStore('kv').get('db');
          q.onsuccess = function () { res(q.result || null); };
          q.onerror = function () { res(null); };
        });
      }).catch(function () { return null; });
    },
    put: function (text) {
      return this.open().then(function (d) {
        return new Promise(function (res) {
          var tr = d.transaction('kv', 'readwrite');
          tr.objectStore('kv').put(text, 'db');
          tr.oncomplete = function () { res(true); };
          tr.onerror = function () { res(false); };
        });
      }).catch(function () { return false; });
    }
  };
  function recompute() { bal = C.balances(db); }
  function persistText() { return JSON.stringify(db); }
  var persistAsked = false;
  function save() {
    var text = persistText();
    var ok = true;
    try { localStorage.setItem(KEY, text); } catch (e) { ok = false; }
    IDB.put(text).then(function (r) {
      if (!ok && !r) alertSheet('تعذّر حفظ البيانات على الجهاز', 'قد تكون مساحة التخزين ممتلئة أو أن المتصفح في وضع التصفح الخاص. احفظ نسخة احتياطية الآن من صفحة البيانات.');
    });
    recompute();
    if (!persistAsked && navigator.storage && navigator.storage.persist) {
      persistAsked = true;
      navigator.storage.persist().catch(function () {});
    }
  }
  function loadLocal() {
    try {
      var s = localStorage.getItem(KEY);
      if (s) { db = C.sanitizeDB(JSON.parse(s)); return true; }
    } catch (e) { /* تالف */ }
    return false;
  }
  function boot() {
    var had = loadLocal();
    recompute();
    if (had) { route(); return Promise.resolve(); }
    return IDB.get().then(function (t) {
      if (t) {
        try {
          db = C.sanitizeDB(JSON.parse(t));
          try { localStorage.setItem(KEY, t); } catch (e) {}
          recompute();
          if (db.tx.length || db.people.length) setTimeout(function () { toast('تمت استعادة بياناتك من التخزين الداخلي'); }, 400);
        } catch (e) {}
      }
      route();
    });
  }
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && e.newValue) { try { db = C.sanitizeDB(JSON.parse(e.newValue)); recompute(); route(); } catch (x) {} }
  });

  // ================= التنبيهات =================
  var toastTimer = null;
  function toast(msg, action) {
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '');
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    if (action) {
      $('button', toastEl).onclick = function () { toastEl.classList.remove('show'); action.fn(); };
    }
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, action ? 6500 : 3000);
  }

  // ================= النوافذ المنبثقة + زر الرجوع =================
  var stack = [];
  var closeWaiters = [];
  function openSheet(html, onMount) {
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeSheet(); });
    stack.push(ov);
    history.pushState({ sheet: stack.length }, '');
    requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('show'); }); });
    if (onMount) onMount(ov.firstChild);
    return ov.firstChild;
  }
  function closeSheet() {
    return new Promise(function (res) {
      if (!stack.length) return res();
      closeWaiters.push(res);
      history.back();
    });
  }
  window.addEventListener('popstate', function () {
    if (stack.length) {
      var ov = stack.pop();
      ov.classList.remove('show');
      setTimeout(function () { ov.remove(); }, 230);
      var w = closeWaiters.shift();
      if (w) setTimeout(w, 0);
    }
  });
  function sheetHead(title) {
    return '<h2>' + esc(title) + '<button type="button" class="iconbtn x" data-close aria-label="إغلاق">' + ICON.close + '</button></h2>';
  }
  function bindClose(el) { $$('[data-close]', el).forEach(function (b) { b.onclick = function () { closeSheet(); }; }); }
  function confirmSheet(title, text, okLabel, danger) {
    return new Promise(function (res) {
      var done = false;
      openSheet(sheetHead(title) + '<p class="confirm-text">' + text + '</p><div class="btn-row"><button type="button" class="btn ' + (danger ? 'danger' : 'primary') + '" data-ok>' + esc(okLabel) + '</button><button type="button" class="btn" data-close>إلغاء</button></div>', function (el) {
        bindClose(el);
        $('[data-ok]', el).onclick = function () { done = true; closeSheet().then(function () { res(true); }); };
        var ov = el.parentNode;
        var obs = new MutationObserver(function () { if (!document.body.contains(ov)) { obs.disconnect(); if (!done) res(false); } });
        obs.observe(document.body, { childList: true });
      });
    });
  }
  function alertSheet(title, text) {
    openSheet(sheetHead(title) + '<p class="confirm-text">' + esc(text) + '</p><button type="button" class="btn primary block" data-close>حسناً</button>', bindClose);
  }

  // ================= التوجيه =================
  function route() {
    var h = location.hash || '#/';
    var m = h.match(/^#\/p\/(.+)$/);
    document.body.classList.remove('no-fab');
    if (m) renderPerson(decodeURIComponent(m[1]));
    else if (h === '#/data') { document.body.classList.add('no-fab'); renderData(); }
    else renderHome();
  }
  window.addEventListener('hashchange', function () { route(); window.scrollTo(0, 0); });

  // ================= الصفحة الرئيسية =================
  function balChip(c, cur) {
    if (!c) return '<span class="amt zero">' + money(0, cur) + '</span>';
    var on = c > 0;
    return '<span class="amt ' + (on ? 'on' : 'for') + '">' + money(c, cur) + '<small>' + (on ? 'عليه' : 'له') + '</small></span>';
  }
  function daysSince(ts) { return ts ? Math.floor((Date.now() - ts) / 86400000) : null; }
  function renderHome() {
    var g = C.grandTotals(db, bal);
    var html = '<header class="appbar"><div class="brand"><img src="icon-192.png" alt=""><h1>دفتر الحسابات</h1></div>' +
      '<a href="#/data" class="iconbtn" aria-label="التصدير والنسخ الاحتياطي">' + ICON.gear + '</a></header>';
    html += '<section class="totals" aria-label="الإجماليات">';
    C.CURRENCIES.forEach(function (cur) {
      var t = g[cur];
      html += '<div class="tcur"><div class="tcur-h"><span class="sym">' + C.CUR[cur].sym + '</span>' + C.CUR[cur].name + '</div>' +
        '<div class="trow"><span>لي عند الناس</span><b class="on-c">' + money(t.owedToMe, cur) + '</b></div>' +
        '<div class="trow"><span>علي للناس</span><b class="for-c">' + money(t.iOwe, cur) + '</b></div>' +
        '<div class="trow net"><span>الصافي ' + (t.net ? '<small class="' + (t.net > 0 ? 'on-c' : 'for-c') + '">' + (t.net > 0 ? 'لي' : 'علي') + '</small>' : '') + '</span><b class="' + (t.net > 0 ? 'on-c' : t.net < 0 ? 'for-c' : 'muted') + '">' + money(t.net, cur) + '</b></div></div>';
    });
    html += '</section>';
    // تذكير النسخ الاحتياطي
    var d = daysSince(db.meta.lastBackup);
    if (db.tx.length >= 3 && (d == null || d >= 7)) {
      html += '<div class="banner"><span>' + (d == null ? 'لم تحفظ نسخة احتياطية بعد.' : 'مرّ ' + d + ' يوماً على آخر نسخة احتياطية.') + ' احفظ نسخة لحماية بياناتك.</span><a class="btn" href="#/data">حفظ نسخة</a></div>';
    }
    if (deferredInstall) {
      html += '<div class="banner"><span>ثبّت التطبيق على الشاشة الرئيسية ليفتح بسرعة ويعمل دون إنترنت.</span><button type="button" class="btn" data-act="install">تثبيت</button></div>';
    }
    html += '<div class="tools"><label class="search">' + ICON.search + '<input type="search" id="q" placeholder="ابحث عن شخص…" value="' + esc(homeState.q) + '" autocomplete="off" enterkeyhint="search"></label>' +
      '<button type="button" class="iconbtn" data-act="add-person" aria-label="إضافة شخص" style="background:var(--surface);border:1px solid var(--line);width:50px;height:50px;border-radius:14px">' + ICON.userPlus + '</button></div>';
    html += '<div class="tools" style="margin-top:0"><span class="muted" style="font-size:14px;flex:1" id="pcount"></span><select class="select" id="sort" aria-label="الترتيب">' +
      [['recent', 'آخر حركة'], ['name', 'الاسم'], ['owed', 'الأكثر عليه (₪ ثم $)'], ['owe', 'الأكثر له (₪ ثم $)']].map(function (o) {
        return '<option value="' + o[0] + '"' + (homeState.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>';
    html += '<ul class="people" id="plist"></ul>';
    view.innerHTML = html;
    var q = $('#q');
    q.addEventListener('input', function () { homeState.q = q.value; renderPeopleList(); });
    $('#sort').addEventListener('change', function () { homeState.sort = this.value; renderPeopleList(); });
    renderPeopleList();
  }
  function renderPeopleList() {
    var ul = $('#plist'); if (!ul) return;
    var q = C.nameKey(C.normDigits(homeState.q));
    var list = db.people.filter(function (p) { return !q || C.nameKey(p.name).indexOf(q) >= 0; });
    var s = homeState.sort;
    list.sort(function (a, b) {
      var A = bal[a.id], B = bal[b.id];
      if (s === 'name') return a.name.localeCompare(b.name, 'ar');
      if (s === 'owed') return (B.ILS - A.ILS) || (B.USD - A.USD) || a.name.localeCompare(b.name, 'ar');
      if (s === 'owe') return (A.ILS - B.ILS) || (A.USD - B.USD) || a.name.localeCompare(b.name, 'ar');
      return (Math.max(B.lastTs, b.created || 0) - Math.max(A.lastTs, a.created || 0));
    });
    $('#pcount').textContent = db.people.length ? (q ? list.length + ' من ' + db.people.length + ' شخص' : db.people.length + ' شخص') : '';
    if (!db.people.length) {
      ul.outerHTML = '<div class="card empty" id="plist"><b>دفترك فارغ</b>ابدأ بإضافة أول شخص، ثم سجّل له أو عليه أي مبلغ.<div style="margin-top:16px"><button type="button" class="btn primary" data-act="add-person">' + ICON.userPlus + ' إضافة شخص</button></div></div>';
      return;
    }
    if (ul.tagName !== 'UL') { var nu = document.createElement('ul'); nu.className = 'people'; nu.id = 'plist'; ul.replaceWith(nu); ul = nu; }
    if (!list.length) { ul.innerHTML = '<li class="empty">لا يوجد شخص بهذا الاسم.<div style="margin-top:12px"><button type="button" class="btn primary" data-act="add-person" data-name="' + esc(homeState.q) + '">إضافة «' + esc(homeState.q) + '»</button></div></li>'; return; }
    ul.innerHTML = list.map(function (p) {
      var b = bal[p.id];
      var sub = b.count ? 'آخر حركة ' + C.fmtDate(b.last) + ' · ' + b.count + ' معاملة' : 'لا توجد معاملات';
      return '<li><a class="prow" href="#/p/' + encodeURIComponent(p.id) + '"><span class="av">' + initial(p.name) + '</span>' +
        '<span class="pmain"><span class="pname">' + esc(p.name) + '</span><span class="psub">' + sub + '</span></span>' +
        '<span class="pbal">' + balChip(b.ILS, 'ILS') + balChip(b.USD, 'USD') + '</span></a></li>';
    }).join('');
  }

  // ================= صفحة الشخص (كشف الحساب) =================
  function renderPerson(pid) {
    var p = person(pid);
    if (!p) { location.replace('#/'); return; }
    if (personFilter.pid !== pid) personFilter = { pid: pid, cur: '', dir: '', from: '', to: '', q: '' };
    var b = bal[pid];
    var html = '<header class="appbar"><a href="#/" class="iconbtn" aria-label="رجوع">' + ICON.back + '</a><h1>' + esc(p.name) + '</h1>' +
      '<button type="button" class="iconbtn" data-act="person-menu" aria-label="خيارات">' + ICON.more + '</button></header>';
    html += '<section class="balcards">';
    C.CURRENCIES.forEach(function (cur) {
      var v = b[cur], cls = v > 0 ? 'on' : v < 0 ? 'for' : '';
      html += '<div class="balcard ' + cls + '"><div class="lbl">' + C.CUR[cur].sym + ' ' + C.CUR[cur].name + '</div><div class="big">' + money(v, cur) + '</div>' +
        '<div class="state">' + (v > 0 ? 'عليه · مدين لي' : v < 0 ? 'له · أنا مدين له' : '<span class="muted">خالص</span>') + '</div></div>';
    });
    html += '</section>';
    html += '<div class="quick"><button type="button" class="qbtn on" data-act="add-on">+ عليه<small>هو مدين لي</small></button>' +
      '<button type="button" class="qbtn for" data-act="add-for">+ له<small>أنا مدين له</small></button></div>';
    var f = personFilter;
    var active = (f.cur ? 1 : 0) + (f.dir ? 1 : 0) + (f.from || f.to ? 1 : 0) + (f.q ? 1 : 0);
    html += '<details class="filters"' + (active ? ' open' : '') + '><summary>' + ICON.filter + 'تصفية المعاملات' + (active ? ' <span class="badge">' + active + '</span>' : '') + ICON.chev + '</summary><div class="fbody">' +
      '<div><div class="flabel">العملة</div><div class="chips" data-f="cur">' + chip('', 'الكل', f.cur) + chip('ILS', '₪ شيكل', f.cur) + chip('USD', '$ دولار', f.cur) + '</div></div>' +
      '<div><div class="flabel">النوع</div><div class="chips" data-f="dir">' + chip('', 'الكل', f.dir) + chip('on', 'عليه', f.dir) + chip('for', 'له', f.dir) + '</div></div>' +
      '<div><div class="flabel">الفترة</div><div class="chips" data-f="period" style="margin-bottom:8px">' + periodChips(f.from, f.to) + '</div>' +
      '<div class="daterow"><label class="field"><span class="flabel">من</span><input type="date" class="input" id="f-from" value="' + esc(f.from) + '"></label>' +
      '<label class="field"><span class="flabel">إلى</span><input type="date" class="input" id="f-to" value="' + esc(f.to) + '"></label></div></div>' +
      '<div><div class="flabel">بحث في الوصف</div><input type="search" class="input" id="f-q" placeholder="مثال: طعام" value="' + esc(f.q) + '"></div>' +
      (active ? '<button type="button" class="btn ghost" data-act="clear-filters">مسح التصفية</button>' : '') +
      '</div></details>';
    html += '<div id="stmts"></div>';
    view.innerHTML = html;
    renderStatements(pid);
    $$('.chips[data-f]', view).forEach(function (box) {
      box.addEventListener('click', function (e) {
        var btn = e.target.closest('.chip'); if (!btn) return;
        var k = box.getAttribute('data-f'), v = btn.getAttribute('data-v');
        if (k === 'period') { var r = periodRange(v); personFilter.from = r[0]; personFilter.to = r[1]; }
        else personFilter[k] = v;
        renderPerson(pid);
      });
    });
    $('#f-from').addEventListener('change', function () { personFilter.from = this.value; renderPerson(pid); });
    $('#f-to').addEventListener('change', function () { personFilter.to = this.value; renderPerson(pid); });
    var fq = $('#f-q');
    fq.addEventListener('input', function () { personFilter.q = fq.value; renderStatements(pid); });
  }
  function chip(v, label, cur) { return '<button type="button" class="chip" data-v="' + v + '" aria-pressed="' + (v === cur) + '">' + label + '</button>'; }
  function periodRange(k) {
    var d = new Date(), y = d.getFullYear(), m = d.getMonth();
    function iso(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
    if (k === 'month') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    if (k === 'last') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    if (k === 'year') return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
    return ['', ''];
  }
  function periodChips(from, to) {
    var keys = [['all', 'الكل'], ['month', 'هذا الشهر'], ['last', 'الشهر الماضي'], ['year', 'هذه السنة']];
    return keys.map(function (k) {
      var r = periodRange(k[0]);
      return '<button type="button" class="chip" data-v="' + k[0] + '" aria-pressed="' + (r[0] === from && r[1] === to) + '">' + k[1] + '</button>';
    }).join('');
  }
  function renderStatements(pid) {
    var box = $('#stmts'); if (!box) return;
    var f = personFilter;
    var opts = { from: f.from || null, to: f.to || null, dir: f.dir || null, q: f.q || null };
    var curs = f.cur ? [f.cur] : C.CURRENCIES;
    var html = '';
    var shown = 0;
    curs.forEach(function (cur) {
      var s = C.statement(db, pid, cur, opts);
      if (!s.hasAny && !f.cur) return;
      shown++;
      html += '<section class="stmt"><div class="stmt-h"><span class="sym">' + C.CUR[cur].sym + '</span>كشف ال' + C.CUR[cur].name + '<span class="cnt">' + s.rows.length + ' معاملة · الأحدث أولاً</span></div><ul class="txl">';
      if (!s.rows.length) html += '<li class="empty" style="padding:20px">لا توجد معاملات مطابقة</li>';
      for (var i = s.rows.length - 1; i >= 0; i--) {
        var r = s.rows[i], t = r.t;
        html += '<li class="tx ' + t.dir + '" data-tx="' + esc(t.id) + '" role="button" tabindex="0"><span class="tx-ic"></span><div class="tx-l"><div class="tx-desc">' + (t.desc ? esc(t.desc) : '<span class="muted">بدون وصف</span>') + '</div><div class="tx-date">' + C.fmtDate(t.date) + '</div></div>' +
          '<div class="tx-r"><div class="tx-amt"><small>' + (t.dir === 'on' ? 'عليه' : 'له') + '</small>' + money(t.amount, cur) + '</div>' +
          '<div class="tx-bal">الرصيد: ' + (r.bal ? (r.bal > 0 ? 'عليه ' : 'له ') + money(r.bal, cur) : 'خالص') + '</div></div></li>';
      }
      if (opts.from) {
        html += '<li class="tx open-row"><div class="tx-l"><div class="tx-desc">رصيد سابق</div><div class="tx-date">قبل ' + C.fmtDate(opts.from) + '</div></div><div class="tx-r"><div class="tx-bal">' + (s.opening ? (s.opening > 0 ? 'عليه ' : 'له ') + money(s.opening, cur) : 'خالص') + '</div></div></li>';
      }
      html += '</ul><div class="stmt-f"><div><span>إجمالي عليه</span><b class="on-c">' + money(s.totOn, cur) + '</b></div><div><span>إجمالي له</span><b class="for-c">' + money(s.totFor, cur) + '</b></div>' +
        '<div><span>' + (opts.to ? 'الرصيد في ' + C.fmtDate(opts.to) : 'الرصيد النهائي') + '</span><b class="' + (s.closing > 0 ? 'on-c' : s.closing < 0 ? 'for-c' : 'muted') + '">' + (s.closing ? (s.closing > 0 ? 'عليه ' : 'له ') : '') + money(s.closing, cur) + '</b></div></div></section>';
    });
    if (!shown) html = '<div class="card empty"><b>لا توجد معاملات بعد</b>اضغط «+ عليه» أو «+ له» لتسجيل أول مبلغ.</div>';
    box.innerHTML = html;
  }

  // ================= نافذة المعاملة (إضافة/تعديل) =================
  var DESC_CHIPS = ['طعام', 'مشتريات', 'دين', 'دفعة', 'سلفة', 'تسديد'];
  function openTxSheet(o) {
    o = o || {};
    var editing = o.tx || null;
    var st = {
      personId: editing ? editing.personId : (o.personId || null),
      personText: '',
      currency: editing ? editing.currency : (db.meta.lastCurrency || 'ILS'),
      dir: editing ? editing.dir : (o.dir || null),
      amount: editing ? C.fmt(editing.amount).replace(/,/g, '') : '',
      desc: editing ? editing.desc : '',
      date: editing ? editing.date : C.todayISO()
    };
    var html = sheetHead(editing ? 'تعديل معاملة' : 'معاملة جديدة') +
      '<div class="stack">' +
      '<div id="pp"></div>' +
      '<div class="amount-wrap"><input id="amt" class="input amount" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="المبلغ" value="' + esc(st.amount) + '">' +
      '<div class="ops">' + ['+', '−', '×', '÷'].map(function (x) { return '<button type="button" data-op="' + x + '" aria-label="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
      '<div class="calc" id="calc"></div></div>' +
      '<div class="seg" id="cur"><button type="button" data-v="ILS">₪ شيكل</button><button type="button" data-v="USD">$ دولار</button></div>' +
      '<div class="seg dir" id="dir"><button type="button" class="on" data-v="on">عليه<small>هو مدين لي</small></button><button type="button" class="for" data-v="for">له<small>أنا مدين له</small></button></div>' +
      '<div><input id="desc" class="input" placeholder="الوصف (اختياري)" maxlength="300" value="' + esc(st.desc) + '" enterkeyhint="done">' +
      '<div class="chips" style="margin-top:8px">' + DESC_CHIPS.map(function (d) { return '<button type="button" class="chip" data-desc="' + d + '">' + d + '</button>'; }).join('') + '</div></div>' +
      '<label class="field"><span class="flabel">التاريخ</span><input id="date" type="date" class="input" value="' + st.date + '"></label>' +
      '<div class="preview" id="prev"></div>' +
      '<div class="err" id="err"></div>' +
      '<button type="button" class="btn primary block" id="save" style="min-height:58px;font-size:19px">' + ICON.check + ' حفظ</button>' +
      (editing ? '<button type="button" class="btn danger block" id="del">حذف المعاملة</button>' : '') +
      '</div>';
    openSheet(html, function (el) {
      bindClose(el);
      var amt = $('#amt', el), calc = $('#calc', el), prev = $('#prev', el), err = $('#err', el);
      function renderPicker() {
        var box = $('#pp', el);
        var p = st.personId && person(st.personId);
        if (p) {
          box.innerHTML = '<div class="picked"><span class="av">' + initial(p.name) + '</span><b>' + esc(p.name) + '</b><button type="button" class="btn ghost" id="chg">تغيير</button></div>';
          $('#chg', box).onclick = function () { st.personId = null; st.personText = ''; renderPicker(); updatePreview(); var i = $('#pq', el); if (i) i.focus(); };
        } else {
          box.innerHTML = '<input id="pq" class="input" placeholder="اسم الشخص — اكتب للبحث أو لإضافة جديد" autocomplete="off" value="' + esc(st.personText) + '"><ul class="suggest" id="sg"></ul>';
          var pq = $('#pq', box);
          pq.addEventListener('input', function () { st.personText = pq.value; renderSuggest(); updatePreview(); });
          renderSuggest();
        }
      }
      function renderSuggest() {
        var ul = $('#sg', el); if (!ul) return;
        var q = C.nameKey(C.normDigits(st.personText));
        var list = db.people.filter(function (p) { return !q || C.nameKey(p.name).indexOf(q) >= 0; });
        list.sort(function (a, b) {
          if (q) { var ea = C.nameKey(a.name).indexOf(q) === 0, eb = C.nameKey(b.name).indexOf(q) === 0; if (ea !== eb) return ea ? -1 : 1; }
          return (bal[b.id].lastTs || b.created || 0) - (bal[a.id].lastTs || a.created || 0);
        });
        list = list.slice(0, 6);
        var exact = db.people.some(function (p) { return C.nameKey(p.name) === q; });
        var h = list.map(function (p) { return '<li><button type="button" data-pick="' + esc(p.id) + '"><span class="av">' + initial(p.name) + '</span>' + esc(p.name) + '</button></li>'; }).join('');
        if (q && !exact) h += '<li><button type="button" class="new" data-new>+ إضافة «' + esc(C.normName(st.personText)) + '» كشخص جديد</button></li>';
        ul.innerHTML = h;
        ul.classList.toggle('hidden', !h);
        $$('[data-pick]', ul).forEach(function (b) { b.onclick = function () { st.personId = b.getAttribute('data-pick'); renderPicker(); updatePreview(); amt.focus(); }; });
        var nb = $('[data-new]', ul);
        if (nb) nb.onclick = function () { var p = addPerson(st.personText); if (p) { st.personId = p.id; renderPicker(); updatePreview(); amt.focus(); } };
      }
      function setSeg(id, v) { $$('#' + id + ' button', el).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === v)); }); }
      function updatePreview() {
        var r = C.evalAmount(amt.value);
        calc.innerHTML = r.ok && r.isExpr ? '= <b class="num">' + C.fmt(r.cents) + '</b>' : (!r.ok && !r.empty ? '<span class="for-c">صيغة المبلغ غير صحيحة</span>' : '');
        var p = st.personId && person(st.personId);
        if (p && r.ok && r.cents > 0 && st.dir && st.currency) {
          var cur = st.currency;
          var base = bal[p.id][cur];
          if (editing && editing.currency === cur) base -= C.signed(editing);
          var after = base + (st.dir === 'on' ? r.cents : -r.cents);
          prev.innerHTML = 'رصيد <b>' + esc(p.name) + '</b> بال' + C.CUR[cur].name + ' بعد الحفظ: <b class="' + (after > 0 ? 'on-c' : after < 0 ? 'for-c' : '') + '">' + (after ? (after > 0 ? 'عليه ' : 'له ') + money(after, cur) : 'خالص') + '</b>';
          prev.classList.remove('hidden');
        } else prev.classList.add('hidden');
        err.textContent = '';
      }
      renderPicker();
      setSeg('cur', st.currency); setSeg('dir', st.dir);
      $('#cur', el).onclick = function (e) { var b = e.target.closest('button'); if (!b) return; st.currency = b.getAttribute('data-v'); setSeg('cur', st.currency); updatePreview(); };
      $('#dir', el).onclick = function (e) { var b = e.target.closest('button'); if (!b) return; st.dir = b.getAttribute('data-v'); setSeg('dir', st.dir); updatePreview(); };
      amt.addEventListener('input', updatePreview);
      $$('[data-op]', el).forEach(function (b) {
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); });
        b.onclick = function () {
          var op = { '+': '+', '−': '-', '×': '*', '÷': '/' }[b.getAttribute('data-op')];
          var s = amt.selectionStart != null ? amt.selectionStart : amt.value.length, en = amt.selectionEnd != null ? amt.selectionEnd : s;
          amt.value = amt.value.slice(0, s) + op + amt.value.slice(en);
          try { amt.setSelectionRange(s + 1, s + 1); } catch (x) {}
          amt.focus(); updatePreview();
        };
      });
      $$('[data-desc]', el).forEach(function (b) { b.onclick = function () { $('#desc', el).value = b.getAttribute('data-desc'); }; });
      $('#save', el).onclick = function () {
        // إن كتب اسماً جديداً ولم يختره، يُضاف تلقائياً أو يُطابق اسماً موجوداً
        if (!st.personId && C.normName(st.personText)) {
          var ex = db.people.filter(function (p) { return C.nameKey(p.name) === C.nameKey(st.personText); })[0];
          if (ex) st.personId = ex.id;
          else { var np = addPerson(st.personText); if (np) st.personId = np.id; }
          if (st.personId) renderPicker();
        }
        var r = C.evalAmount(amt.value);
        var date = $('#date', el).value;
        var problem = !st.personId ? 'اختر الشخص أولاً' :
          (!r.ok || r.cents <= 0) ? (r.ok && r.cents < 0 ? 'المبلغ يجب أن يكون موجباً — استخدم «له» أو «عليه» لتحديد الاتجاه' : 'اكتب المبلغ') :
          !st.dir ? 'حدد: هل المبلغ «عليه» أم «له»؟' :
          !C.isISODate(date) ? 'التاريخ غير صحيح' : '';
        if (problem) { err.textContent = problem; return; }
        var desc = C.normName($('#desc', el).value);
        var now = Date.now();
        var savedPid = st.personId, cur = st.currency;
        if (editing) {
          var before = JSON.parse(JSON.stringify(editing));
          var t = db.tx.filter(function (x) { return x.id === editing.id; })[0];
          if (!t) { err.textContent = 'المعاملة لم تعد موجودة'; return; }
          t.personId = st.personId; t.currency = cur; t.dir = st.dir; t.amount = r.cents; t.desc = desc; t.date = date; t.updated = now;
          db.meta.lastCurrency = cur;
          save();
          closeSheet().then(function () {
            route();
            toast('تم تعديل المعاملة', { label: 'تراجع', fn: function () { var x = db.tx.filter(function (y) { return y.id === before.id; })[0]; if (x) { for (var k in before) x[k] = before[k]; save(); route(); } } });
          });
        } else {
          var tx = { id: C.uid(), personId: st.personId, currency: cur, dir: st.dir, amount: r.cents, desc: desc, date: date, created: now, updated: now };
          db.tx.push(tx);
          db.meta.lastCurrency = cur;
          save();
          closeSheet().then(function () {
            route();
            var b = bal[savedPid][cur], pn = person(savedPid).name;
            toast('تم الحفظ ✓ رصيد ' + pn + ': ' + (b ? (b > 0 ? 'عليه ' : 'له ') + C.fmt(Math.abs(b)) + ' ' + C.CUR[cur].sym : 'خالص'),
              { label: 'تراجع', fn: function () { db.tx = db.tx.filter(function (x) { return x.id !== tx.id; }); save(); route(); } });
          });
        }
      };
      if (editing) {
        $('#del', el).onclick = function () {
          confirmSheet('حذف المعاملة؟', 'سيتم حذف هذه المعاملة وإعادة حساب الرصيد تلقائياً.', 'حذف', true).then(function (ok) {
            if (!ok) return;
            var removed = db.tx.filter(function (x) { return x.id === editing.id; })[0];
            db.tx = db.tx.filter(function (x) { return x.id !== editing.id; });
            save();
            closeSheet().then(function () {
              route();
              toast('تم حذف المعاملة', { label: 'تراجع', fn: function () { if (removed) { db.tx.push(removed); save(); route(); } } });
            });
          });
        };
      }
      updatePreview();
      setTimeout(function () {
        if (!st.personId) { var i = $('#pq', el); if (i) i.focus(); }
        else if (!editing) amt.focus();
      }, 260);
    });
  }

  // ================= الأشخاص =================
  function addPerson(name) {
    name = C.normName(name);
    if (!name) return null;
    var ex = db.people.filter(function (p) { return C.nameKey(p.name) === C.nameKey(name); })[0];
    if (ex) return ex;
    var p = { id: C.uid(), name: name, created: Date.now() };
    db.people.push(p);
    save();
    return p;
  }
  function openPersonSheet(p, presetName) {
    var html = sheetHead(p ? 'تعديل الاسم' : 'إضافة شخص') +
      '<div class="stack"><input id="pn" class="input" placeholder="الاسم" maxlength="80" value="' + esc(p ? p.name : (presetName || '')) + '" enterkeyhint="done" autocomplete="off">' +
      '<div class="err" id="perr"></div><button type="button" class="btn primary block" id="psave">' + (p ? 'حفظ' : 'إضافة') + '</button></div>';
    openSheet(html, function (el) {
      bindClose(el);
      var inp = $('#pn', el);
      function doSave() {
        var name = C.normName(inp.value);
        if (!name) { $('#perr', el).textContent = 'اكتب الاسم'; return; }
        var dup = db.people.filter(function (x) { return C.nameKey(x.name) === C.nameKey(name) && (!p || x.id !== p.id); })[0];
        if (dup) { $('#perr', el).textContent = 'يوجد شخص بنفس الاسم. أضف ما يميّزه (مثل اسم العائلة).'; return; }
        if (p) { p.name = name; save(); closeSheet().then(function () { route(); toast('تم تعديل الاسم'); }); }
        else {
          var np = { id: C.uid(), name: name, created: Date.now() };
          db.people.push(np); save();
          closeSheet().then(function () { homeState.q = ''; location.hash = '#/p/' + encodeURIComponent(np.id); toast('تمت إضافة ' + name); });
        }
      }
      $('#psave', el).onclick = doSave;
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSave(); });
      setTimeout(function () { inp.focus(); }, 260);
    });
  }
  function personMenu(pid) {
    var p = person(pid); if (!p) return;
    openSheet(sheetHead(p.name) + '<div class="list-act">' +
      '<button type="button" class="btn block" data-m="rename">تعديل الاسم</button>' +
      '<button type="button" class="btn block" data-m="export">تصدير كشف الحساب إلى Excel</button>' +
      '<button type="button" class="btn danger block" data-m="delete">حذف الشخص وكل معاملاته</button></div>', function (el) {
      bindClose(el);
      $('[data-m=rename]', el).onclick = function () { closeSheet().then(function () { openPersonSheet(p); }); };
      $('[data-m=export]', el).onclick = function () {
        closeSheet().then(function () { openExportSheet({ personId: pid, from: personFilter.from, to: personFilter.to }); });
      };
      $('[data-m=delete]', el).onclick = function () {
        var b = bal[pid];
        var txt = 'سيتم حذف <b>' + esc(p.name) + '</b> و<b>' + b.count + '</b> معاملة.';
        if (b.ILS || b.USD) txt += '<br>الرصيد الحالي: ' + (b.ILS ? (b.ILS > 0 ? 'عليه ' : 'له ') + money(b.ILS, 'ILS') : '') + (b.ILS && b.USD ? ' و ' : '') + (b.USD ? (b.USD > 0 ? 'عليه ' : 'له ') + money(b.USD, 'USD') : '');
        closeSheet().then(function () {
          confirmSheet('حذف الشخص؟', txt, 'حذف نهائي', true).then(function (ok) {
            if (!ok) return;
            var removedTx = db.tx.filter(function (t) { return t.personId === pid; });
            db.tx = db.tx.filter(function (t) { return t.personId !== pid; });
            db.people = db.people.filter(function (x) { return x.id !== pid; });
            save();
            location.hash = '#/';
            toast('تم حذف ' + p.name, { label: 'تراجع', fn: function () { db.people.push(p); db.tx = db.tx.concat(removedTx); save(); route(); } });
          });
        });
      };
    });
  }

  // ================= Excel والملفات =================
  var xlsxPromise = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'xlsx.min.js';
      s.onload = function () { window.XLSX ? res(window.XLSX) : rej(new Error('XLSX')); };
      s.onerror = function () { xlsxPromise = null; rej(new Error('XLSX')); };
      document.head.appendChild(s);
    });
    return xlsxPromise;
  }
  function safeName(s) { return String(s).replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 60); }
  function stamp() { var d = new Date(); return C.todayISO() + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); }
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 10000);
  }
  function canShareFile(blob, name) {
    try { var f = new File([blob], name, { type: blob.type }); return !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; }
  }
  function shareBlob(blob, name) {
    var f = new File([blob], name, { type: blob.type });
    return navigator.share({ files: [f], title: name }).catch(function (e) { if (e && e.name !== 'AbortError') toast('تعذّرت المشاركة، استخدم «حفظ الملف»'); });
  }
  function resultBox(blob, name) {
    var share = canShareFile(blob, name);
    return '<div class="result"><div class="fname">📄 <bdi class="fn">' + esc(name) + '</bdi> <span class="muted" style="font-weight:400">(' + Math.max(1, Math.round(blob.size / 1024)) + ' كيلوبايت)</span></div>' +
      '<div class="btn-row"><button type="button" class="btn primary" data-dl>حفظ الملف</button>' + (share ? '<button type="button" class="btn" data-share>مشاركة…</button>' : '') + '</div>' +
      '<p class="note">«حفظ الملف» يضعه في مجلد التنزيلات. «مشاركة» ترسله إلى واتساب أو البريد أو Drive أو أي تطبيق آخر.</p></div>';
  }
  function bindResult(el, blob, name) {
    var dl = $('[data-dl]', el), sh = $('[data-share]', el);
    if (dl) dl.onclick = function () { downloadBlob(blob, name); toast('تم حفظ الملف في التنزيلات'); };
    if (sh) sh.onclick = function () { shareBlob(blob, name); };
  }
  function markBackup() { db.meta.lastBackup = Date.now(); save(); }

  function openExportSheet(o) {
    o = o || {};
    var st = { personId: o.personId || '', from: o.from || '', to: o.to || '' };
    var opts = '<option value="">جميع الأشخاص (ملف واحد)</option>' + db.people.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }).map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === st.personId ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
    var html = sheetHead('تصدير إلى Excel') + '<div class="stack">' +
      '<label class="field"><span class="flabel">ماذا تريد أن تصدّر؟</span><select class="input" id="xp">' + opts + '</select></label>' +
      '<div><div class="flabel">الفترة الزمنية</div><div class="chips" id="xper" style="margin-bottom:8px"></div>' +
      '<div class="daterow"><label class="field"><span class="flabel">من</span><input type="date" class="input" id="xf" value="' + esc(st.from) + '"></label><label class="field"><span class="flabel">إلى</span><input type="date" class="input" id="xt" value="' + esc(st.to) + '"></label></div></div>' +
      '<p class="note">يحتوي الملف على: ورقة «ملخص» بالإجماليات، وورقة «كشف شيكل» وورقة «كشف دولار» منفصلتين مع الرصيد بعد كل معاملة، وورقة «البيانات» التي تُستخدم للاستيراد والاستعادة.</p>' +
      '<div class="err" id="xerr"></div>' +
      '<button type="button" class="btn primary block" id="xgo">إنشاء ملف Excel</button><div id="xres"></div></div>';
    openSheet(html, function (el) {
      bindClose(el);
      function chips() { $('#xper', el).innerHTML = periodChips(st.from, st.to); }
      chips();
      $('#xper', el).onclick = function (e) { var b = e.target.closest('.chip'); if (!b) return; var r = periodRange(b.getAttribute('data-v')); st.from = r[0]; st.to = r[1]; $('#xf', el).value = st.from; $('#xt', el).value = st.to; chips(); $('#xres', el).innerHTML = ''; };
      $('#xf', el).onchange = function () { st.from = this.value; chips(); $('#xres', el).innerHTML = ''; };
      $('#xt', el).onchange = function () { st.to = this.value; chips(); $('#xres', el).innerHTML = ''; };
      $('#xp', el).onchange = function () { st.personId = this.value; $('#xres', el).innerHTML = ''; };
      $('#xgo', el).onclick = function () {
        var btn = this;
        if (st.from && st.to && st.from > st.to) { $('#xerr', el).textContent = 'تاريخ البداية بعد تاريخ النهاية'; return; }
        if (!db.people.length) { $('#xerr', el).textContent = 'لا توجد بيانات للتصدير بعد'; return; }
        $('#xerr', el).textContent = '';
        btn.disabled = true; btn.textContent = 'جارٍ الإنشاء…';
        loadXLSX().then(function (XLSX) {
          var wb = C.buildWorkbook(XLSX, db, { personId: st.personId || null, from: st.from || null, to: st.to || null });
          var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
          var blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          var p = st.personId && person(st.personId);
          var name = (p ? 'كشف_حساب_' + safeName(p.name) : 'دفتر_الحسابات') + (st.from || st.to ? '_' + (st.from || 'البداية') + '_إلى_' + (st.to || 'اليوم') : '') + '_' + stamp() + '.xlsx';
          if (!st.personId && !st.from && !st.to) markBackup();
          $('#xres', el).innerHTML = resultBox(blob, name);
          bindResult(el, blob, name);
          btn.disabled = false; btn.textContent = 'إنشاء ملف Excel';
        }).catch(function (e) {
          btn.disabled = false; btn.textContent = 'إنشاء ملف Excel';
          $('#xerr', el).textContent = 'تعذّر إنشاء الملف: ' + (e && e.message ? e.message : e);
        });
      };
    });
  }

  function backupJSONBlob() {
    var data = JSON.parse(JSON.stringify(db));
    data.exportedAt = new Date().toISOString();
    data.appVersion = APP_VERSION;
    return new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  }

  function readImportFile(file) {
    var name = (file.name || '').toLowerCase();
    if (/\.json$/.test(name)) {
      return file.text().then(function (t) { var r = C.readBackupJSON(t); if (!r) throw new Error('ملف النسخة الاحتياطية غير صالح'); return r; });
    }
    return loadXLSX().then(function (XLSX) {
      var p = /\.csv$/.test(name)
        ? file.text().then(function (t) { return XLSX.read(t.replace(/^﻿/, ''), { type: 'string', raw: true }); })
        : file.arrayBuffer().then(function (buf) {
          var head = new Uint8Array(buf.slice(0, 1));
          if (head[0] === 0x7B) { // JSON بامتداد آخر
            var r = C.readBackupJSON(new TextDecoder().decode(buf)); if (r) return { __json: r };
          }
          return XLSX.read(buf, { type: 'array' });
        });
      return p.then(function (wb) {
        if (wb.__json) return wb.__json;
        var r = C.readWorkbook(XLSX, wb);
        if (!r) throw new Error('لم أجد في الملف جدولاً بأعمدة: الشخص، التاريخ، المبلغ، العملة، النوع');
        return r;
      });
    });
  }
  function openImportSheet(file) {
    var html = sheetHead('استيراد البيانات') + '<div class="stack" id="ib"><p class="muted">جارٍ قراءة الملف…</p></div>';
    openSheet(html, function (el) {
      bindClose(el);
      var box = $('#ib', el);
      readImportFile(file).then(function (inc) {
        function plan(mode) { return C.mergeInto(C.sanitizeDB(JSON.parse(JSON.stringify(db))), inc, mode); }
        var pm = plan('merge'), pr = plan('replace');
        box.innerHTML = '<p style="margin:0"><b><bdi class="fn">' + esc(file.name) + '</bdi></b><br><span class="muted">يحتوي على ' + inc.tx.length + ' معاملة' + (inc.invalid ? ' و ' + inc.invalid + ' سطر غير صالح سيتم تجاهله' : '') + '.</span></p>' +
          '<label class="radio"><input type="radio" name="mode" value="merge" checked><span><b>دمج مع بياناتي (موصى به)</b><small>سيُضاف ' + pm.txAdded + ' معاملة جديدة و' + pm.peopleAdded + ' شخص جديد، ويتم تخطي ' + pm.txSkipped + ' معاملة موجودة مسبقاً (بدون تكرار).</small></span></label>' +
          '<label class="radio"><input type="radio" name="mode" value="replace"><span><b>استبدال كل البيانات</b><small>يحذف بياناتك الحالية (' + db.people.length + ' شخص، ' + db.tx.length + ' معاملة) ويضع محتوى الملف مكانها: ' + pr.db.people.length + ' شخص و' + pr.txAdded + ' معاملة.</small></span></label>' +
          '<button type="button" class="btn primary block" id="igo">استيراد</button>' +
          '<p class="note">قبل الاستيراد تُحفظ نسخة من حالتك الحالية تلقائياً، ويمكنك التراجع من صفحة البيانات.</p>';
        $('#igo', el).onclick = function () {
          var mode = $('input[name=mode]:checked', el).value;
          var go = function () {
            try { localStorage.setItem(KEY_BEFORE_IMPORT, JSON.stringify({ at: Date.now(), db: db })); } catch (e) {}
            var res = C.mergeInto(db, inc, mode);
            db = res.db;
            save();
            closeSheet().then(function () {
              route();
              alertSheet('تم الاستيراد ✓', (mode === 'replace' ? 'تم استبدال البيانات. ' : '') + 'أُضيف ' + res.txAdded + ' معاملة و' + res.peopleAdded + ' شخص. تم تخطي ' + res.txSkipped + ' معاملة مكررة' + (res.invalid ? ' و' + res.invalid + ' سطر غير صالح' : '') + '.');
            });
          };
          if (mode === 'replace') {
            confirmSheet('استبدال كل البيانات؟', 'سيتم حذف بياناتك الحالية واستبدالها بمحتوى الملف. يمكنك التراجع لاحقاً من صفحة البيانات.', 'استبدال', true).then(function (ok) { if (ok) go(); });
          } else go();
        };
      }).catch(function (e) {
        box.innerHTML = '<p class="err">' + esc(e && e.message ? e.message : 'تعذّرت قراءة الملف') + '</p><p class="note">الملفات المدعومة: ملف Excel صدّرته من هذا التطبيق، أو أي ملف Excel/CSV فيه أعمدة بعناوين: الشخص، التاريخ، المبلغ، العملة (شيكل/دولار)، النوع (عليه/له)، الوصف. أو نسخة احتياطية ‎.json.</p><button type="button" class="btn block" data-close>إغلاق</button>';
        bindClose(el);
      });
    });
  }

  // ================= صفحة البيانات والنسخ الاحتياطي =================
  function renderData() {
    var last = db.meta.lastBackup;
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var before = null;
    try { before = JSON.parse(localStorage.getItem(KEY_BEFORE_IMPORT) || 'null'); } catch (e) {}
    var html = '<header class="appbar"><a href="#/" class="iconbtn" aria-label="رجوع">' + ICON.back + '</a><h1>البيانات والنسخ الاحتياطي</h1></header>';
    html += '<div class="section-title">تصدير إلى Excel</div><div class="card"><p style="margin:0 0 12px">ملف ‎.xlsx يفتح في Microsoft Excel، فيه الملخص وكشف الشيكل وكشف الدولار في أوراق منفصلة.</p>' +
      '<button type="button" class="btn primary block" data-act="export">تصدير الحسابات إلى Excel</button></div>';
    html += '<div class="section-title">النسخة الاحتياطية الكاملة</div><div class="card">' +
      '<div class="kv"><span>آخر نسخة احتياطية</span><b>' + (last ? C.fmtDate(new Date(last).toISOString().slice(0, 10)) : '<span class="for-c">لم تُحفظ بعد</span>') + '</b></div>' +
      '<p class="note">تشمل جميع الأشخاص والمعاملات. احفظها في Google Drive أو أرسلها لنفسك على واتساب، ثم استعدها من «استيراد» عند تغيير الهاتف.</p>' +
      '<div class="btn-row" style="margin-top:12px"><button type="button" class="btn primary" data-act="backup-xlsx">نسخة Excel كاملة</button><button type="button" class="btn" data-act="backup-json">نسخة JSON</button></div><div id="bres"></div></div>';
    html += '<div class="section-title">استيراد واستعادة</div><div class="card"><p style="margin:0 0 12px">اختر ملف Excel صدّرته من التطبيق، أو أي ملف Excel فيه أعمدة: الشخص، التاريخ، المبلغ، العملة، النوع — أو نسخة ‎.json. لا تتكرر المعاملات الموجودة.</p>' +
      '<label class="btn block" style="position:relative">اختيار ملف للاستيراد<input type="file" id="imp" accept=".xlsx,.xls,.csv,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" style="position:absolute;inset:0;opacity:0;width:100%;cursor:pointer"></label>' +
      (before && before.db ? '<button type="button" class="btn ghost block" data-act="undo-import" style="margin-top:8px">التراجع عن آخر استيراد (' + C.fmtDate(new Date(before.at).toISOString().slice(0, 10)) + ')</button>' : '') + '</div>';
    html += '<div class="section-title">التخزين على هذا الجهاز</div><div class="card">' +
      '<div class="kv"><span>الأشخاص</span><b>' + db.people.length + '</b></div>' +
      '<div class="kv"><span>المعاملات</span><b>' + db.tx.length + '</b></div>' +
      '<div class="kv"><span>الحفظ الدائم</span><b id="persist">…</b></div>' +
      '<div class="kv"><span>العمل دون إنترنت</span><b id="offline">…</b></div>' +
      '<p class="note">تُحفظ البيانات تلقائياً بعد كل عملية في ذاكرة التطبيق على الهاتف (نسختان داخليتان)، وتبقى بعد إغلاق التطبيق وإعادة تشغيل الهاتف. مسح بيانات المتصفح أو حذف التطبيق يحذفها، لذلك احتفظ بنسخة احتياطية.</p></div>';
    html += '<div class="section-title">التطبيق</div><div class="card">' +
      (standalone ? '<div class="okline">' + ICON.check + 'التطبيق مثبّت على الشاشة الرئيسية</div>' :
        deferredInstall ? '<button type="button" class="btn primary block" data-act="install">تثبيت على الشاشة الرئيسية</button>' :
          '<p style="margin:0">' + (ios ? 'للتثبيت على iPhone: افتح الصفحة في Safari، اضغط زر المشاركة ⬆️ ثم «إضافة إلى الشاشة الرئيسية».' : 'للتثبيت على Android: افتح قائمة Chrome ⋮ ثم «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».') + '</p>') +
      '<div class="kv" style="margin-top:8px"><span>المظهر</span><select class="select" id="theme" style="height:42px;max-width:none"><option value="">تلقائي</option><option value="light">فاتح</option><option value="dark">داكن</option></select></div>' +
      '<div class="kv"><span>الإصدار</span><span class="num">' + APP_VERSION + '</span></div></div>';
    html += '<div class="section-title">منطقة الخطر</div><div class="card"><button type="button" class="btn danger block" data-act="wipe">حذف كل البيانات من هذا الجهاز</button></div>';
    view.innerHTML = html;
    var th = '';
    try { th = localStorage.getItem('dafter.theme') || ''; } catch (e) {}
    $('#theme').value = th;
    $('#theme').onchange = function () { setTheme(this.value); };
    $('#imp').onchange = function () { var f = this.files && this.files[0]; this.value = ''; if (f) openImportSheet(f); };
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) {
        var el = $('#persist'); if (el) el.innerHTML = p ? '<span class="on-c">مفعّل</span>' : '<span class="muted">يتفعّل بعد التثبيت</span>';
      });
    } else $('#persist').textContent = '—';
    var off = $('#offline');
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') off.innerHTML = '<span class="muted">يحتاج تشغيل التطبيق من رابطه</span>';
    else navigator.serviceWorker.getRegistration().then(function (r) { off.innerHTML = r && r.active ? '<span class="on-c">جاهز</span>' : '<span class="muted">جارٍ التجهيز…</span>'; });
  }
  function setTheme(v) {
    try { if (v) localStorage.setItem('dafter.theme', v); else localStorage.removeItem('dafter.theme'); } catch (e) {}
    if (v) document.documentElement.setAttribute('data-theme', v); else document.documentElement.removeAttribute('data-theme');
    var dark = v === 'dark' || (!v && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', dark ? '#111614' : '#0F4C3A');
  }

  // ================= الأحداث العامة =================
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]');
    if (a) {
      var act = a.getAttribute('data-act');
      var pid = (location.hash.match(/^#\/p\/(.+)$/) || [])[1];
      pid = pid ? decodeURIComponent(pid) : null;
      if (act === 'quick-add') openTxSheet({ personId: pid });
      else if (act === 'add-on') openTxSheet({ personId: pid, dir: 'on' });
      else if (act === 'add-for') openTxSheet({ personId: pid, dir: 'for' });
      else if (act === 'add-person') openPersonSheet(null, a.getAttribute('data-name') || '');
      else if (act === 'person-menu') personMenu(pid);
      else if (act === 'clear-filters') { personFilter = { pid: pid, cur: '', dir: '', from: '', to: '', q: '' }; renderPerson(pid); }
      else if (act === 'export') openExportSheet({});
      else if (act === 'backup-xlsx' || act === 'backup-json') {
        var box = $('#bres');
        var make = act === 'backup-json' ? Promise.resolve({ blob: backupJSONBlob(), name: 'نسخة_احتياطية_دفتر_الحسابات_' + stamp() + '.json' })
          : loadXLSX().then(function (XLSX) {
            var out = XLSX.write(C.buildWorkbook(XLSX, db, {}), { bookType: 'xlsx', type: 'array', compression: true });
            return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: 'نسخة_احتياطية_دفتر_الحسابات_' + stamp() + '.xlsx' };
          });
        make.then(function (r) { markBackup(); box.innerHTML = resultBox(r.blob, r.name); bindResult(box, r.blob, r.name); var kv = $('.kv b', box.parentNode); if (kv) kv.textContent = C.fmtDate(C.todayISO()); })
          .catch(function () { toast('تعذّر إنشاء النسخة'); });
      }
      else if (act === 'undo-import') {
        confirmSheet('التراجع عن آخر استيراد؟', 'ستعود بياناتك إلى ما كانت عليه قبل آخر استيراد. أي تعديل بعده سيُفقد.', 'تراجع', true).then(function (ok) {
          if (!ok) return;
          try { var b = JSON.parse(localStorage.getItem(KEY_BEFORE_IMPORT)); db = C.sanitizeDB(b.db); localStorage.removeItem(KEY_BEFORE_IMPORT); save(); route(); toast('تمت الاستعادة'); } catch (x) { toast('تعذّر التراجع'); }
        });
      }
      else if (act === 'wipe') {
        confirmSheet('حذف كل البيانات؟', 'سيتم حذف جميع الأشخاص (' + db.people.length + ') والمعاملات (' + db.tx.length + ') من هذا الجهاز. تأكد أنك حفظت نسخة احتياطية.', 'متابعة', true).then(function (ok) {
          if (!ok) return;
          confirmSheet('تأكيد أخير', 'هذا الإجراء لا يمكن التراجع عنه إلا من نسخة احتياطية.', 'احذف كل شيء', true).then(function (ok2) {
            if (!ok2) return;
            var keepMeta = db.meta; db = C.emptyDB(); db.meta = keepMeta; save(); location.hash = '#/'; route(); toast('تم حذف كل البيانات');
          });
        });
      }
      else if (act === 'install' && deferredInstall) {
        deferredInstall.prompt();
        deferredInstall.userChoice.finally(function () { deferredInstall = null; route(); });
      }
      return;
    }
    var tx = e.target.closest('[data-tx]');
    if (tx) {
      var t = db.tx.filter(function (x) { return x.id === tx.getAttribute('data-tx'); })[0];
      if (t) openTxSheet({ tx: t });
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-tx]')) e.target.click();
  });

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; route(); });
  window.addEventListener('appinstalled', function () { deferredInstall = null; toast('تم تثبيت التطبيق'); });

  // ================= التشغيل =================
  (function () { var th = ''; try { th = localStorage.getItem('dafter.theme') || ''; } catch (e) {} setTheme(th); })();
  boot();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
  // تجهيز مكتبة Excel مسبقاً في الخلفية لتسريع التصدير
  setTimeout(function () { loadXLSX().catch(function () {}); }, 2500);
  // كشف للاختبار
  window.__dafter = { get db() { return db; }, save: save, reload: function () { loadLocal(); recompute(); route(); } };
})();
