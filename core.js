/* دفتر الحسابات — منطق الحساب والبيانات (بدون واجهة)
 * كل المبالغ تُخزَّن كأعداد صحيحة بالأغورة/السنت (×100) لتجنب أخطاء الكسور العشرية.
 * "on"  = عليه  (هو مدين لي)   → يُضاف موجباً إلى رصيده
 * "for" = له    (أنا مدين له)  → يُطرح من رصيده
 * الرصيد الموجب = عليه (مستحق لي)، الرصيد السالب = له (مستحق علي).
 * لا يوجد أي تحويل أو دمج بين الشيكل والدولار في أي مكان.
 */
(function (root) {
  'use strict';

  var CURRENCIES = ['ILS', 'USD'];
  var CUR = {
    ILS: { code: 'ILS', name: 'شيكل', sym: '₪' },
    USD: { code: 'USD', name: 'دولار', sym: '$' }
  };
  var DIR = {
    on: { name: 'عليه', hint: 'مدين لي' },
    for: { name: 'له', hint: 'أنا مدين له' }
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---------- التواريخ ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function isISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  var EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  function isoToSerial(iso) {
    var p = iso.split('-').map(Number);
    return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - EXCEL_EPOCH) / 86400000);
  }
  function serialToISO(n) {
    var d = new Date(EXCEL_EPOCH + Math.floor(n) * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  // يقبل: 2026-10-26 ، 26/10/2026 ، 26-10-2026 ، 26.10.2026 ، رقم تسلسلي من Excel ، كائن Date
  function parseAnyDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) {
      return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    }
    if (typeof v === 'number' && isFinite(v) && v > 0 && v < 2958466) return serialToISO(v);
    var s = normDigits(String(v)).trim();
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) { var r = m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]); return isISODate(r) ? r : null; }
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
    if (m) { var r2 = m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]); return isISODate(r2) ? r2 : null; }
    if (/^\d+(\.\d+)?$/.test(s)) { var n = parseFloat(s); if (n > 0 && n < 2958466) return serialToISO(n); }
    return null;
  }

  // ---------- الأرقام ----------
  function normDigits(s) {
    return String(s)
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); })
      .replace(/٫/g, '.')   // الفاصلة العشرية العربية
      .replace(/٬/g, ',');  // فاصل الآلاف العربي
  }
  function toCents(v) {
    var a = Math.round(Math.abs(v) * 100 + 1e-7);
    return v < 0 ? -a : a;
  }
  // يحسب مبلغاً بسيطاً أو عملية حسابية مثل 25*4+10 بأمان (بدون eval)
  function evalAmount(input) {
    var s = normDigits(input == null ? '' : input)
      .replace(/[×xX]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
      .replace(/\s+/g, '');
    s = s.replace(/,(?=\d{3}(?!\d))/g, '').replace(/,/g, '.');
    if (!s) return { ok: false, empty: true };
    if (!/^[0-9+\-*\/().]+$/.test(s)) return { ok: false };
    var i = 0;
    function peek() { return s.charAt(i); }
    function num() {
      var st = i;
      while (i < s.length && /[0-9.]/.test(s.charAt(i))) i++;
      var t = s.slice(st, i);
      if (!t || t === '.' || (t.match(/\./g) || []).length > 1) throw new Error('num');
      return parseFloat(t);
    }
    function factor() {
      var c = peek();
      if (c === '-') { i++; return -factor(); }
      if (c === '+') { i++; return factor(); }
      if (c === '(') {
        i++; var v = expr();
        if (peek() !== ')') throw new Error('paren');
        i++; return v;
      }
      return num();
    }
    function term() {
      var v = factor();
      while (peek() === '*' || peek() === '/') {
        var op = s.charAt(i++); var r = factor();
        if (op === '*') v *= r; else { if (r === 0) throw new Error('div0'); v /= r; }
      }
      return v;
    }
    function expr() {
      var v = term();
      while (peek() === '+' || peek() === '-') {
        var op = s.charAt(i++); var r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    try {
      var v = expr();
      if (i !== s.length || !isFinite(v)) return { ok: false };
      return { ok: true, value: v, cents: toCents(v), isExpr: /[+\-*\/()]/.test(s.replace(/^\+/, '')) };
    } catch (e) { return { ok: false }; }
  }
  function fmt(c) {
    c = Math.round(c || 0);
    var neg = c < 0; c = Math.abs(c);
    var w = Math.floor(c / 100), f = c % 100;
    var s = String(w).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (f) s += '.' + (f < 10 ? '0' : '') + f;
    return (neg ? '-' : '') + s;
  }
  function centsToNumber(c) { return Math.round(c) / 100; }

  // ---------- قاعدة البيانات ----------
  function emptyDB() {
    return { app: 'dafter', version: 1, people: [], tx: [], meta: { lastBackup: null, lastCurrency: 'ILS' } };
  }
  function normName(n) { return String(n || '').replace(/\s+/g, ' ').trim(); }
  function nameKey(n) { return normName(n).toLowerCase(); }

  function sanitizeTx(t) {
    if (!t || typeof t !== 'object') return null;
    var amount = Math.round(Number(t.amount));
    if (!t.id || !t.personId || !isFinite(amount) || amount <= 0) return null;
    if (CURRENCIES.indexOf(t.currency) < 0) return null;
    if (t.dir !== 'on' && t.dir !== 'for') return null;
    if (!isISODate(t.date)) return null;
    return {
      id: String(t.id), personId: String(t.personId), currency: t.currency, dir: t.dir,
      amount: amount, desc: String(t.desc || '').slice(0, 300), date: t.date,
      created: Number(t.created) || Date.now(), updated: Number(t.updated) || Number(t.created) || Date.now()
    };
  }
  function sanitizeDB(d) {
    var db = emptyDB();
    if (!d || typeof d !== 'object') return db;
    var seen = {};
    (Array.isArray(d.people) ? d.people : []).forEach(function (p) {
      if (!p || !p.id || seen[p.id]) return;
      var name = normName(p.name);
      if (!name) return;
      seen[p.id] = 1;
      db.people.push({ id: String(p.id), name: name, created: Number(p.created) || Date.now() });
    });
    var seenTx = {};
    (Array.isArray(d.tx) ? d.tx : []).forEach(function (t) {
      var s = sanitizeTx(t);
      if (s && seen[s.personId] && !seenTx[s.id]) { seenTx[s.id] = 1; db.tx.push(s); }
    });
    if (d.meta && typeof d.meta === 'object') {
      db.meta.lastBackup = d.meta.lastBackup || null;
      if (CURRENCIES.indexOf(d.meta.lastCurrency) >= 0) db.meta.lastCurrency = d.meta.lastCurrency;
    }
    return db;
  }

  function signed(t) { return t.dir === 'on' ? t.amount : -t.amount; }
  function sortTx(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.created !== b.created) return a.created - b.created;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  // الرصيد الحالي لكل شخص، لكل عملة على حدة
  function balances(db) {
    var map = {};
    db.people.forEach(function (p) { map[p.id] = { ILS: 0, USD: 0, count: 0, last: null, lastTs: 0 }; });
    db.tx.forEach(function (t) {
      var b = map[t.personId]; if (!b) return;
      b[t.currency] += signed(t); b.count++;
      if (!b.last || t.date > b.last) b.last = t.date;
      var ts = Math.max(t.created || 0, t.updated || 0);
      if (ts > b.lastTs) b.lastTs = ts;
    });
    return map;
  }
  // الإجماليات العامة: لكل عملة: مستحق لي (مجموع الأرصدة الموجبة)، مستحق علي، الصافي
  function grandTotals(db, bal) {
    bal = bal || balances(db);
    var g = { ILS: { owedToMe: 0, iOwe: 0, net: 0 }, USD: { owedToMe: 0, iOwe: 0, net: 0 } };
    Object.keys(bal).forEach(function (id) {
      CURRENCIES.forEach(function (c) {
        var v = bal[id][c];
        if (v > 0) g[c].owedToMe += v; else if (v < 0) g[c].iOwe += -v;
        g[c].net += v;
      });
    });
    return g;
  }

  // كشف حساب شخص بعملة واحدة مع الرصيد المتراكم بعد كل معاملة
  // opts: { from, to, dir, q }
  function statement(db, personId, cur, opts) {
    opts = opts || {};
    var all = db.tx.filter(function (t) { return t.personId === personId && t.currency === cur; }).sort(sortTx);
    var bal = 0, opening = 0, rows = [], totOn = 0, totFor = 0, q = opts.q ? String(opts.q).trim() : '';
    for (var k = 0; k < all.length; k++) {
      var t = all[k];
      if (opts.from && t.date < opts.from) { opening += signed(t); bal += signed(t); continue; }
      if (opts.to && t.date > opts.to) break;
      bal += signed(t);
      if (opts.dir && t.dir !== opts.dir) continue;
      if (q && (t.desc || '').indexOf(q) < 0) continue;
      rows.push({ t: t, bal: bal });
      if (t.dir === 'on') totOn += t.amount; else totFor += t.amount;
    }
    return { currency: cur, opening: opening, rows: rows, totOn: totOn, totFor: totFor, closing: bal, hasAny: all.length > 0 };
  }

  function balanceLabel(c) {
    if (c > 0) return DIR.on.name;
    if (c < 0) return DIR.for.name;
    return 'خالص';
  }
  function balanceLong(c) {
    if (c > 0) return 'عليه (مدين لي)';
    if (c < 0) return 'له (أنا مدين له)';
    return 'خالص';
  }

  // ---------- الدمج والاستيراد بدون تكرار ----------
  function fingerprint(t, personName) {
    return [nameKey(personName), t.date, t.currency, t.dir, t.amount, normName(t.desc)].join('|');
  }
  // incoming: { people:[{id?,name}], tx:[{id?, personId?, personName?, date,currency,dir,amount,desc,created?}] }
  // mode: 'merge' | 'replace'
  function mergeInto(db, incoming, mode) {
    var res = { peopleAdded: 0, txAdded: 0, txSkipped: 0, invalid: incoming.invalid || 0 };
    var target = mode === 'replace' ? emptyDB() : db;
    if (mode === 'replace') target.meta = db.meta;
    var byId = {}, byName = {};
    target.people.forEach(function (p) { byId[p.id] = p; byName[nameKey(p.name)] = p; });
    var incPeopleById = {};
    function ensurePerson(id, name) {
      name = normName(name);
      if (id && byId[id]) return byId[id];
      if (name && byName[nameKey(name)]) { if (id) byId[id] = byName[nameKey(name)]; return byName[nameKey(name)]; }
      if (!name) return null;
      var newId = id || uid();
      if (byId[newId]) newId = uid();
      var p = { id: newId, name: name, created: Date.now() };
      target.people.push(p); byId[newId] = p; if (id) byId[id] = p; byName[nameKey(name)] = p;
      res.peopleAdded++;
      return p;
    }
    (incoming.people || []).forEach(function (p) {
      incPeopleById[p.id] = p;
      ensurePerson(p.id, p.name);
    });
    var txIds = {}, fpCount = {}, nameOf = {};
    target.people.forEach(function (p) { nameOf[p.id] = p.name; });
    target.tx.forEach(function (t) {
      txIds[t.id] = 1;
      var f = fingerprint(t, nameOf[t.personId]);
      fpCount[f] = (fpCount[f] || 0) + 1;
    });
    (incoming.tx || []).forEach(function (raw) {
      var pName = raw.personName || (incPeopleById[raw.personId] && incPeopleById[raw.personId].name) || '';
      var person = ensurePerson(raw.personId, pName);
      if (!person) { res.invalid++; return; }
      nameOf[person.id] = person.name;
      var t = sanitizeTx({
        id: raw.id || uid(), personId: person.id, currency: raw.currency, dir: raw.dir,
        amount: raw.amount, desc: raw.desc, date: raw.date, created: raw.created, updated: raw.updated
      });
      if (!t) { res.invalid++; return; }
      if (raw.id && txIds[raw.id]) { res.txSkipped++; return; }
      var f = fingerprint(t, person.name);
      if (fpCount[f] > 0) { fpCount[f]--; res.txSkipped++; return; }
      if (txIds[t.id]) t.id = uid();
      txIds[t.id] = 1;
      target.tx.push(t); res.txAdded++;
    });
    res.db = target;
    return res;
  }

  // ---------- قراءة ملفات Excel / CSV ----------
  var H = {
    id: ['المعرف', 'معرف المعاملة', 'id', 'tx id'],
    personId: ['معرف الشخص', 'person id'],
    person: ['الشخص', 'الاسم', 'اسم الشخص', 'person', 'name'],
    date: ['التاريخ', 'date'],
    desc: ['الوصف', 'البيان', 'ملاحظة', 'ملاحظات', 'description', 'desc', 'note'],
    currency: ['العملة', 'currency'],
    dir: ['النوع', 'نوع المعاملة', 'نوع الحساب', 'type', 'direction'],
    amount: ['المبلغ', 'amount'],
    on: ['عليه', 'عليه (مدين لي)'],
    for: ['له', 'له (أنا مدين له)'],
    created: ['وقت الإنشاء', 'created']
  };
  function headerKey(h) {
    h = normName(normDigits(h)).toLowerCase();
    for (var k in H) { if (H[k].indexOf(h) >= 0) return k; }
    return null;
  }
  function parseCurrency(v) {
    var s = normName(v).toLowerCase();
    if (!s) return null;
    if (/شيك|شيقل|₪|ils|nis|شيكل/.test(s)) return 'ILS';
    if (/دولار|\$|usd/.test(s)) return 'USD';
    return null;
  }
  function parseDir(v) {
    var s = normName(v);
    if (!s) return null;
    if (/^عليه|مدين لي|^on$|^debit/i.test(s)) return 'on';
    if (/^له|أنا مدين|انا مدين|^for$|^credit/i.test(s)) return 'for';
    return null;
  }
  function numCell(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var r = evalAmount(String(v).replace(/[₪$\s]/g, ''));
    return r.ok ? r.value : null;
  }
  // rows: مصفوفة صفوف (كل صف مصفوفة خلايا). يعيد {people, tx, invalid} أو null إن لم يُعرف الجدول
  function parseTxRows(rows, defaults) {
    defaults = defaults || {};
    var hIdx = -1, map = null;
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var m = {};
      (rows[r] || []).forEach(function (cell, c) { var k = headerKey(cell); if (k && m[k] == null) m[k] = c; });
      if ((m.person != null || defaults.personName) && (m.amount != null || m.on != null || m.for != null) && m.date != null) { hIdx = r; map = m; break; }
    }
    if (hIdx < 0) return null;
    var out = { people: [], tx: [], invalid: 0 };
    for (var i = hIdx + 1; i < rows.length; i++) {
      var row = rows[i] || [];
      var get = function (k) { return map[k] == null ? '' : row[map[k]]; };
      var personName = normName(get('person')) || defaults.personName || '';
      var isEmpty = row.every(function (c) { return c === '' || c == null; });
      if (isEmpty) continue;
      if (/^(الإجمالي|الاجمالي|المجموع|رصيد سابق|إجمالي)/.test(personName)) continue;
      var currency = parseCurrency(get('currency')) || defaults.currency || null;
      var dir = parseDir(get('dir'));
      var amount = numCell(get('amount'));
      if (amount == null) {
        var a1 = numCell(get('on')), a2 = numCell(get('for'));
        if (a1) { amount = a1; dir = 'on'; } else if (a2) { amount = a2; dir = 'for'; }
      }
      if (amount != null && amount < 0 && !dir) { dir = 'for'; }
      if (amount != null && amount > 0 && !dir && map.dir == null) dir = 'on';
      var date = parseAnyDate(get('date'));
      if (!personName || !currency || !dir || amount == null || amount === 0 || !date) { out.invalid++; continue; }
      var created = Number(get('created'));
      out.tx.push({
        id: normName(get('id')) || null,
        personId: normName(get('personId')) || null,
        personName: personName, date: date, currency: currency, dir: dir,
        amount: toCents(Math.abs(amount)), desc: normName(get('desc')),
        created: isFinite(created) && created > 1e11 ? created : null
      });
    }
    return out;
  }
  function parsePeopleRows(rows) {
    var hIdx = -1, m = null;
    for (var r = 0; r < Math.min(rows.length, 10); r++) {
      var mm = {};
      (rows[r] || []).forEach(function (cell, c) { var k = headerKey(cell); if (k && mm[k] == null) mm[k] = c; });
      if (mm.person != null) { hIdx = r; m = mm; break; }
    }
    if (hIdx < 0) return [];
    var out = [];
    for (var i = hIdx + 1; i < rows.length; i++) {
      var row = rows[i] || [];
      var name = normName(row[m.person]);
      if (!name || /^(الإجمالي|الاجمالي|المجموع)/.test(name)) continue;
      out.push({ id: m.personId != null ? (normName(row[m.personId]) || null) : null, name: name });
    }
    return out;
  }

  // ---------- إنشاء ملف Excel ----------
  var STY = (function () {
    var border = { style: 'thin', color: { rgb: 'C9D3CF' } };
    var b = { top: border, bottom: border, left: border, right: border };
    var font = 'Arial';
    function base(extra) {
      var s = { font: { name: font, sz: 11 }, alignment: { vertical: 'center', horizontal: 'right', readingOrder: 2, wrapText: true }, border: b };
      if (extra) for (var k in extra) s[k] = extra[k];
      return s;
    }
    return {
      title: { font: { name: font, sz: 16, bold: true, color: { rgb: '0F4C3A' } }, alignment: { horizontal: 'right', readingOrder: 2 } },
      sub: { font: { name: font, sz: 10, color: { rgb: '5F6B66' } }, alignment: { horizontal: 'right', readingOrder: 2 } },
      head: base({ font: { name: font, sz: 11, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '0F4C3A' } }, alignment: { vertical: 'center', horizontal: 'center', readingOrder: 2, wrapText: true } }),
      cell: base(),
      center: base({ alignment: { vertical: 'center', horizontal: 'center', readingOrder: 2 } }),
      num: base({ alignment: { vertical: 'center', horizontal: 'center' } }),
      on: base({ font: { name: font, sz: 11, color: { rgb: '0B6B3A' } }, alignment: { vertical: 'center', horizontal: 'center' } }),
      for: base({ font: { name: font, sz: 11, color: { rgb: 'B42318' } }, alignment: { vertical: 'center', horizontal: 'center' } }),
      person: { font: { name: font, sz: 13, bold: true, color: { rgb: '0F4C3A' } }, fill: { patternType: 'solid', fgColor: { rgb: 'E3F1EB' } }, alignment: { horizontal: 'right', readingOrder: 2 }, border: b },
      open: base({ font: { name: font, sz: 11, italic: true, color: { rgb: '5F6B66' } }, fill: { patternType: 'solid', fgColor: { rgb: 'F4F6F5' } } }),
      total: base({ font: { name: font, sz: 11, bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'FFF4D6' } } }),
      totalNum: base({ font: { name: font, sz: 11, bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'FFF4D6' } }, alignment: { vertical: 'center', horizontal: 'center' } })
    };
  })();
  var NUMFMT = '#,##0.00';
  var BALFMT = '#,##0.00;[Red]-#,##0.00;0.00';
  var DATEFMT = 'dd/mm/yyyy';

  function withStyle(s, extra) { var o = {}; for (var k in s) o[k] = s[k]; for (var e in extra) o[e] = extra[e]; return o; }

  // يبني ورقة من قائمة صفوف خلايا {v, t, s, z}
  function sheetFrom(XLSX, rows, cols, merges, autofilter) {
    var ws = {}, maxC = 0;
    rows.forEach(function (row, r) {
      row.forEach(function (c, ci) {
        if (c == null) return;
        if (typeof c !== 'object') c = { v: c };
        if (c.v == null && !c.s) return;
        var cell = { v: c.v == null ? '' : c.v, t: c.t || (typeof c.v === 'number' ? 'n' : 's') };
        if (c.z) cell.z = c.z;
        if (c.s) cell.s = c.s;
        ws[XLSX.utils.encode_cell({ r: r, c: ci })] = cell;
        if (ci > maxC) maxC = ci;
      });
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 0), c: Math.max(maxC, cols.length - 1) } });
    ws['!cols'] = cols.map(function (w) { return { wch: w }; });
    if (merges && merges.length) ws['!merges'] = merges;
    if (autofilter) ws['!autofilter'] = { ref: autofilter };
    return ws;
  }

  function moneyCell(c, style, fmtStr) { return { v: centsToNumber(c), t: 'n', z: fmtStr || NUMFMT, s: style || STY.num }; }
  function dateCell(iso, style) { return { v: isoToSerial(iso), t: 'n', z: DATEFMT, s: style || STY.center }; }

  // opts: { personId (اختياري), from, to }
  function buildWorkbook(XLSX, db, opts) {
    opts = opts || {};
    var people = db.people.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    if (opts.personId) people = people.filter(function (p) { return p.id === opts.personId; });
    var periodText = (opts.from || opts.to)
      ? 'الفترة: ' + (opts.from ? 'من ' + fmtDate(opts.from) : 'من البداية') + ' ' + (opts.to ? 'إلى ' + fmtDate(opts.to) : 'حتى اليوم')
      : 'الفترة: جميع المعاملات';
    var exportedText = 'تاريخ التصدير: ' + fmtDate(todayISO());
    var hasPeriodStart = !!opts.from;
    var wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    var stOpts = { from: opts.from, to: opts.to };

    // ورقة الملخص
    var sum = [];
    var title = opts.personId && people[0] ? 'كشف حساب: ' + people[0].name : 'ملخص الحسابات';
    sum.push([{ v: title, s: STY.title }]);
    sum.push([{ v: periodText, s: STY.sub }]);
    sum.push([{ v: exportedText + '  —  الرصيد الموجب = عليه (مدين لي)، السالب = له (أنا مدين له). لا يوجد أي تحويل بين العملتين.', s: STY.sub }]);
    sum.push([]);
    var curCols = hasPeriodStart ? ['رصيد سابق', 'عليه (مدين لي)', 'له (أنا مدين له)', 'الرصيد', 'الحالة'] : ['عليه (مدين لي)', 'له (أنا مدين له)', 'الرصيد', 'الحالة'];
    var head1 = [{ v: 'الشخص', s: STY.head }];
    var head0 = [{ v: '', s: STY.head }];
    CURRENCIES.forEach(function (c) {
      curCols.forEach(function (h, i) {
        head0.push({ v: i === 0 ? CUR[c].name + ' (' + CUR[c].sym + ')' : '', s: STY.head });
        head1.push({ v: h, s: STY.head });
      });
    });
    var headRow0 = sum.length;
    sum.push(head0); sum.push(head1);
    var merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: curCols.length * 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: curCols.length * 2 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: curCols.length * 2 } },
      { s: { r: headRow0, c: 0 }, e: { r: headRow0 + 1, c: 0 } }];
    CURRENCIES.forEach(function (c, ci) {
      var st = 1 + ci * curCols.length;
      merges.push({ s: { r: headRow0, c: st }, e: { r: headRow0, c: st + curCols.length - 1 } });
    });
    var stats = {};
    CURRENCIES.forEach(function (c) { stats[c] = { opening: 0, on: 0, for: 0, owedToMe: 0, iOwe: 0, net: 0 }; });
    var perPerson = {};
    people.forEach(function (p) {
      var row = [{ v: p.name, s: STY.cell }];
      perPerson[p.id] = {};
      CURRENCIES.forEach(function (c) {
        var s = statement(db, p.id, c, stOpts);
        perPerson[p.id][c] = s;
        if (hasPeriodStart) row.push(moneyCell(s.opening, STY.num, BALFMT));
        row.push(moneyCell(s.totOn, STY.on));
        row.push(moneyCell(s.totFor, STY.for));
        row.push(moneyCell(s.closing, STY.num, BALFMT));
        row.push({ v: balanceLabel(s.closing), s: s.closing > 0 ? STY.on : s.closing < 0 ? STY.for : STY.center });
        var g = stats[c];
        g.opening += s.opening; g.on += s.totOn; g.for += s.totFor; g.net += s.closing;
        if (s.closing > 0) g.owedToMe += s.closing; else g.iOwe -= s.closing;
      });
      sum.push(row);
    });
    if (!opts.personId) {
      var tRow = [{ v: 'المجموع', s: STY.total }];
      CURRENCIES.forEach(function (c) {
        var g = stats[c];
        if (hasPeriodStart) tRow.push(moneyCell(g.opening, STY.totalNum, BALFMT));
        tRow.push(moneyCell(g.on, STY.totalNum)); tRow.push(moneyCell(g.for, STY.totalNum));
        tRow.push(moneyCell(g.net, STY.totalNum, BALFMT)); tRow.push({ v: balanceLabel(g.net), s: STY.total });
      });
      sum.push(tRow);
      sum.push([]);
      sum.push([{ v: 'الإجماليات العامة (كل عملة على حدة)', s: STY.title }]);
      sum.push([{ v: 'البند', s: STY.head }, { v: 'شيكل (₪)', s: STY.head }, { v: 'دولار ($)', s: STY.head }]);
      sum.push([{ v: 'إجمالي المستحق لي (عليهم)', s: STY.cell }, moneyCell(stats.ILS.owedToMe, STY.on), moneyCell(stats.USD.owedToMe, STY.on)]);
      sum.push([{ v: 'إجمالي المستحق علي (لهم)', s: STY.cell }, moneyCell(stats.ILS.iOwe, STY.for), moneyCell(stats.USD.iOwe, STY.for)]);
      sum.push([{ v: 'الصافي', s: STY.total }, moneyCell(stats.ILS.net, STY.totalNum, BALFMT), moneyCell(stats.USD.net, STY.totalNum, BALFMT)]);
    }
    var sumCols = [24]; for (var k = 0; k < curCols.length * 2; k++) sumCols.push(14);
    XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, sum, sumCols, merges), 'ملخص');

    // أوراق كشف الحساب: ورقة مستقلة لكل عملة
    CURRENCIES.forEach(function (c) {
      var rows = [];
      var sheetMerges = [];
      rows.push([{ v: 'كشف الحساب بال' + CUR[c].name + ' (' + CUR[c].sym + ')', s: STY.title }]);
      rows.push([{ v: periodText + '  —  ' + exportedText, s: STY.sub }]);
      sheetMerges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });
      var any = false;
      people.forEach(function (p) {
        var s = perPerson[p.id][c];
        if (!s.rows.length && !s.opening) return;
        any = true;
        rows.push([]);
        var pr = rows.length;
        rows.push([{ v: p.name, s: STY.person }, { v: '', s: STY.person }, { v: '', s: STY.person }, { v: '', s: STY.person }, { v: '', s: STY.person }, { v: '', s: STY.person }]);
        sheetMerges.push({ s: { r: pr, c: 0 }, e: { r: pr, c: 5 } });
        rows.push(['التاريخ', 'الوصف', 'عليه (مدين لي)', 'له (أنا مدين له)', 'الرصيد بعد المعاملة', 'الحالة'].map(function (h) { return { v: h, s: STY.head }; }));
        if (hasPeriodStart) {
          rows.push([dateCell(opts.from, STY.open), { v: 'رصيد سابق', s: STY.open }, { v: '', s: STY.open }, { v: '', s: STY.open },
            moneyCell(s.opening, withStyle(STY.open, { alignment: { horizontal: 'center' } }), BALFMT), { v: balanceLabel(s.opening), s: STY.open }]);
        }
        s.rows.forEach(function (r) {
          var t = r.t;
          rows.push([
            dateCell(t.date),
            { v: t.desc || '', s: STY.cell },
            t.dir === 'on' ? moneyCell(t.amount, STY.on) : { v: '', s: STY.num },
            t.dir === 'for' ? moneyCell(t.amount, STY.for) : { v: '', s: STY.num },
            moneyCell(r.bal, STY.num, BALFMT),
            { v: balanceLabel(r.bal), s: r.bal > 0 ? STY.on : r.bal < 0 ? STY.for : STY.center }
          ]);
        });
        rows.push([{ v: 'الإجمالي', s: STY.total }, { v: p.name, s: STY.total }, moneyCell(s.totOn, STY.totalNum), moneyCell(s.totFor, STY.totalNum),
          moneyCell(s.closing, STY.totalNum, BALFMT), { v: balanceLong(s.closing), s: STY.total }]);
      });
      if (!any) { rows.push([]); rows.push([{ v: 'لا توجد معاملات بهذه العملة في الفترة المحددة', s: STY.sub }]); }
      XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, rows, [13, 30, 15, 15, 17, 16], sheetMerges), 'كشف ' + CUR[c].name);
    });

    // ورقة البيانات الخام — تُستخدم للاستيراد واستعادة الحسابات
    var data = [['المعرف', 'معرف الشخص', 'الشخص', 'التاريخ', 'الوصف', 'العملة', 'النوع', 'المبلغ', 'وقت الإنشاء'].map(function (h) { return { v: h, s: STY.head }; })];
    var pids = {}; people.forEach(function (p) { pids[p.id] = p; });
    db.tx.filter(function (t) {
      return pids[t.personId] && (!opts.from || t.date >= opts.from) && (!opts.to || t.date <= opts.to);
    }).sort(function (a, b) {
      var n = pids[a.personId].name.localeCompare(pids[b.personId].name, 'ar');
      return n || (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : sortTx(a, b));
    }).forEach(function (t) {
      data.push([{ v: t.id, s: STY.cell }, { v: t.personId, s: STY.cell }, { v: pids[t.personId].name, s: STY.cell }, dateCell(t.date),
        { v: t.desc || '', s: STY.cell }, { v: CUR[t.currency].name, s: STY.center }, { v: DIR[t.dir].name, s: t.dir === 'on' ? withStyle(STY.on, {}) : STY.for },
        moneyCell(t.amount, STY.num), { v: t.created, t: 'n', z: '0', s: STY.num }]);
    });
    XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, data, [16, 16, 22, 12, 30, 9, 8, 13, 15], null,
      XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(data.length - 1, 1), c: 8 } })), 'البيانات');

    // ورقة الأشخاص
    var bal = balances(db);
    var pp = [['معرف الشخص', 'الشخص', 'عدد المعاملات', 'الرصيد الحالي ₪', 'الرصيد الحالي $'].map(function (h) { return { v: h, s: STY.head }; })];
    people.forEach(function (p) {
      var b = bal[p.id];
      pp.push([{ v: p.id, s: STY.cell }, { v: p.name, s: STY.cell }, { v: b.count, t: 'n', s: STY.num }, moneyCell(b.ILS, STY.num, BALFMT), moneyCell(b.USD, STY.num, BALFMT)]);
    });
    XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, pp, [16, 24, 13, 16, 16]), 'الأشخاص');
    return wb;
  }

  // قراءة ملف Excel إلى صيغة قابلة للدمج
  function readWorkbook(XLSX, wb) {
    var names = wb.SheetNames || [];
    function rowsOf(n) { return XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); }
    var people = [];
    if (names.indexOf('الأشخاص') >= 0) people = parsePeopleRows(rowsOf('الأشخاص'));
    var parsed = null;
    if (names.indexOf('البيانات') >= 0) parsed = parseTxRows(rowsOf('البيانات'));
    if (!parsed) {
      for (var i = 0; i < names.length && !parsed; i++) {
        if (names[i] === 'الأشخاص') continue;
        parsed = parseTxRows(rowsOf(names[i]));
      }
    }
    if (!parsed && !people.length) return null;
    parsed = parsed || { people: [], tx: [], invalid: 0 };
    parsed.people = people.concat(parsed.people);
    return parsed;
  }

  // قراءة نسخة احتياطية JSON
  function readBackupJSON(text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return null; }
    if (!d || !Array.isArray(d.people) || !Array.isArray(d.tx)) return null;
    var names = {};
    d.people.forEach(function (p) { if (p && p.id) names[p.id] = p.name; });
    return {
      people: d.people.filter(function (p) { return p && p.id && normName(p.name); }).map(function (p) { return { id: String(p.id), name: p.name }; }),
      tx: d.tx.filter(Boolean).map(function (t) {
        return { id: t.id, personId: t.personId, personName: names[t.personId] || '', date: t.date, currency: t.currency, dir: t.dir, amount: Math.round(Number(t.amount)), desc: t.desc, created: t.created, updated: t.updated };
      }),
      invalid: 0
    };
  }

  var Core = {
    CURRENCIES: CURRENCIES, CUR: CUR, DIR: DIR, uid: uid,
    todayISO: todayISO, isISODate: isISODate, fmtDate: fmtDate, parseAnyDate: parseAnyDate, isoToSerial: isoToSerial, serialToISO: serialToISO,
    normDigits: normDigits, evalAmount: evalAmount, toCents: toCents, fmt: fmt,
    emptyDB: emptyDB, sanitizeDB: sanitizeDB, normName: normName, nameKey: nameKey,
    signed: signed, sortTx: sortTx, balances: balances, grandTotals: grandTotals, statement: statement,
    balanceLabel: balanceLabel, balanceLong: balanceLong,
    mergeInto: mergeInto, parseTxRows: parseTxRows, buildWorkbook: buildWorkbook, readWorkbook: readWorkbook, readBackupJSON: readBackupJSON
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(this);
