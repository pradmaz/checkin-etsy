/* Check-in streak card - custom StreamElements widget
   Per-viewer data (first check-in, total, current streak, best streak) is kept in SE_API.store. */
(function () {
  'use strict';

  var THEMES = [
    { n: 'green',  c: '#76ff1f', c2: '#1c7d00', rgb: '118,255,31' },
    { n: 'cyan',   c: '#1fc8ff', c2: '#0a5a9c', rgb: '31,200,255' },
    { n: 'red',    c: '#ff2d3d', c2: '#8c0014', rgb: '255,45,61' },
    { n: 'purple', c: '#b23cff', c2: '#4a0a8c', rgb: '178,60,255' },
    { n: 'orange', c: '#ffb21f', c2: '#9c5200', rgb: '255,178,31' },
    { n: 'pink',   c: '#ff2d9c', c2: '#8c0a54', rgb: '255,45,156' }
  ];
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  var SVG = {
    flame: '<svg class="flame" viewBox="0 0 64 64"><path class="f" d="M32 3C34 14 46 20 49 33C52 46 43 59 32 60C21 59 12 48 15 36C17 28 22 25 24 18C27 22 28 26 28 29C33 24 33 12 32 3Z"/><path fill="#fff" fill-opacity=".85" d="M32 60C25 58 21 52 24 45C26 41 29 39 30 35C34 40 40 45 39 52C38 57 35 59 32 60Z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><circle class="f" cx="12" cy="12" r="11"/><path d="M6.5 12.5l3.8 3.8 7.2-8" fill="none" stroke="#08080d" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    crown: '<svg viewBox="0 0 64 64"><path class="f" d="M6 46L10 18L22 30L32 12L42 30L54 18L58 46Z"/><path class="f" d="M8 50H56V57H8Z"/></svg>',
    bars:  '<svg viewBox="0 0 64 64"><rect class="f" x="8" y="30" width="12" height="26"/><rect class="f" x="26" y="12" width="12" height="44"/><rect class="f" x="44" y="22" width="12" height="34"/></svg>',
    cal:   '<svg viewBox="0 0 64 64"><rect class="s" x="7" y="12" width="50" height="46" rx="6" stroke-width="5"/><rect class="f" x="7" y="12" width="50" height="14"/><rect class="f" x="18" y="5" width="5" height="12" rx="2"/><rect class="f" x="41" y="5" width="5" height="12" rx="2"/><rect class="f" x="16" y="34" width="8" height="7"/><rect class="f" x="28" y="34" width="8" height="7"/><rect class="f" x="40" y="34" width="8" height="7"/><rect class="f" x="16" y="45" width="8" height="7"/><rect class="f" x="28" y="45" width="8" height="7"/></svg>',
    yt:    '<svg viewBox="0 0 42 30"><rect width="42" height="30" rx="8" fill="#ff1a1a"/><path d="M17 8.5L28 15L17 21.5Z" fill="#fff"/></svg>',
    tw:    '<svg viewBox="0 0 42 30"><rect width="42" height="30" rx="8" fill="#9146ff"/><path d="M12 7H30V18L25 23H20L17 26V23H12Z" fill="#fff"/><path d="M19 11V16M24 11V16" stroke="#9146ff" stroke-width="2.2"/></svg>'
  };

  var TEMPLATE =
    '<div class="inner">' +
      '<div class="dots dl"></div><div class="dots dr"></div>' +
      '<div class="glow">' +
        '<div class="chev c1"></div><div class="chev c2"></div>' +
        '<div class="frag f1"></div><div class="frag f2"></div>' +
        '<div class="accent"></div>' +
        '<div class="logo"><div class="logo-in"></div></div>' +
        '<div class="bar"><div class="bar-in">' +
          '<div class="stat">' + SVG.crown + '<div class="st"><div class="sv best"></div><div class="sl">BEST STREAK</div></div></div>' +
          '<div class="stat">' + SVG.bars  + '<div class="st"><div class="sv total"></div><div class="sl">TOTAL CHECK-INS</div></div></div>' +
          '<div class="stat">' + SVG.cal   + '<div class="st"><div class="sv date first"></div><div class="sl">FIRST CHECK-IN</div></div></div>' +
        '</div></div>' +
      '</div>' +
      '<div class="panel"></div>' +
      '<div class="avatar"></div>' +
      '<div class="plat"></div>' +
      '<div class="info">' +
        '<div class="name"></div>' +
        '<div class="checked">' + SVG.check + '<span>CHECKED IN</span></div>' +
        '<div class="streak">' + SVG.flame + '<div class="snum">0</div></div>' +
        '<div class="slabel"><span>DAY STREAK</span><span class="delta"></span></div>' +
      '</div>' +
    '</div>';

  var cfg = {};
  var db = { users: {} };
  var dbReady = false;
  var queue = [];
  var busy = false;
  var lastTheme = -1;
  var channelName = '';
  var avatarCache = {};
  var pending = [];          // check-ins that arrive before the saved data has finished loading
  var cdUser = {}, cdTop = 0, cdBest = 0;   // cooldown timers
  var resetArmed = 0;                        // time until which !resetcheckin is waiting for its confirmation
  var restoreArm = { what: '', until: 0 };   // same for restores
  var curBoard = '';                         // board type currently on screen
  var toastTimer = null, toolsTimer = null;

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function storeKey() { return cfg.storeKey || 'checkinStreakV1'; }

  function pickTheme() {
    var mode = cfg.colorMode || 'random', i;
    for (i = 0; i < THEMES.length; i++) {
      if (THEMES[i].n === mode) { lastTheme = i; return THEMES[i]; }
    }
    do { i = Math.floor(Math.random() * THEMES.length); } while (i === lastTheme && THEMES.length > 1);
    lastTheme = i;
    return THEMES[i];
  }

  /* "today" = calendar day in the chosen timezone, rolling over at the chosen hour */
  function today() {
    var hour = Math.max(0, Math.min(23, num(cfg.resetHour, 0)));
    var shifted = new Date(Date.now() - hour * 3600000);
    var opts = { year: 'numeric', month: '2-digit', day: '2-digit' };
    var parts;
    try {
      var o = { year: opts.year, month: opts.month, day: opts.day };
      if (cfg.timezone) o.timeZone = String(cfg.timezone).trim();
      parts = new Intl.DateTimeFormat('en-US', o).formatToParts(shifted);
    } catch (e) {
      parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(shifted);
    }
    function g(t) { for (var i = 0; i < parts.length; i++) { if (parts[i].type === t) return Number(parts[i].value); } return 0; }
    var y = g('year'), m = g('month'), d = g('day');
    return { key: y + '-' + pad(m) + '-' + pad(d), idx: Math.round(Date.UTC(y, m - 1, d) / 86400000) };
  }
  function idxOf(key) {
    var p = key.split('-').map(Number);
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
  }
  function fmtDate(key) {
    var p = key.split('-').map(Number);
    return pad(p[2]) + ' ' + MONTHS[p[1] - 1] + ' ' + p[0];
  }

  /* ---------- stream days ---------- */
  /* A "stream day" is any day on which at least one viewer checked in. In the default "stream"
     mode only those days can be missed, so days you are not live never hurt anyone's streak. */
  function markStreamDay(key) {
    if (!Array.isArray(db.streamDays)) db.streamDays = [];
    if (Array.isArray(db.ignored) && db.ignored.indexOf(key) >= 0) return false;   // a mod said this day does not count
    var a = db.streamDays;
    if (a.indexOf(key) >= 0) return false;
    a.push(key);
    a.sort();                                          // ISO dates sort correctly as text
    if (a.length > 500) a.splice(0, a.length - 500);   // keep the last 500 stream days
    return true;
  }
  /* stream days between the viewer's last check-in and today. With "minimum check-ins per stream day"
     above 1, a day on which only one or two people checked in (a test, a late stray check-in) is not counted. */
  var WD = ['sun','mon','tue','wed','thu','fri','sat'];
  function isOffDay(key) {                       // weekdays typed into "days that never count" (e.g. sat,sun)
    var list = String(cfg.offDays || '').toLowerCase();
    if (!list.trim()) return false;
    var p = key.split('-').map(Number), wd = WD[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
    return list.indexOf(wd) >= 0;
  }
  function countedDays(lastKey, todayKey) {
    var a = db.streamDays || [], dc = db.dayCounts || {}, min = Math.max(1, num(cfg.minDayCheckins, 1)), out = [], i;
    for (i = 0; i < a.length; i++) {
      if (a[i] > lastKey && a[i] < todayKey && !isOffDay(a[i]) && (dc[a[i]] === undefined || dc[a[i]] >= min)) out.push(a[i]);
    }
    return out;
  }
  function missedDays(lastKey, t) {
    if ((cfg.dayMode || 'stream') === 'calendar') {
      var n = 0, i;
      for (i = idxOf(lastKey) + 1; i < t.idx; i++) { if (!isOffDay(new Date(i * 86400000).toISOString().slice(0, 10))) n++; }
      return n;
    }
    return countedDays(lastKey, t.key).length;
  }

  /* ---------- penalty rules ---------- */
  /* "Penalty rules" box: comma separated  missed=action  e.g.  "2=-3, 3=reset"
     actions:  -3 (lose 3)   -50% (lose half)   half   reset   =5 (set streak to 5)   0 (nothing)
     the rule with the highest "missed" that fits applies. Empty box = use the simple number fields. */
  function parseRules() {
    var raw = String(cfg.penaltyRules || '').trim(), out = [];
    if (raw) {
      raw.split(/[,;\n]+/).forEach(function (part) {
        var m = part.trim().toLowerCase().match(/^(\d+)\s*[=:>]\s*(.+)$/);
        if (!m) return;
        var at = Number(m[1]), a = m[2].trim(), r = null, x;
        if (a === 'reset') r = { at: at, kind: 'reset' };
        else if (a === 'half') r = { at: at, kind: 'pct', val: 50 };
        else if (a === '0' || a === 'none') r = { at: at, kind: 'sub', val: 0 };
        else if ((x = a.match(/^-\s*(\d+(?:\.\d+)?)\s*%$/))) r = { at: at, kind: 'pct', val: Number(x[1]) };
        else if ((x = a.match(/^-\s*(\d+)$/))) r = { at: at, kind: 'sub', val: Number(x[1]) };
        else if ((x = a.match(/^=\s*(\d+)$/))) r = { at: at, kind: 'set', val: Number(x[1]) };
        if (r && at >= 1) out.push(r);
      });
    }
    if (!out.length) {
      out.push({ at: Math.max(1, num(cfg.missedForPenalty, 2)), kind: 'sub', val: Math.max(0, num(cfg.penaltyAmount, 3)) });
      out.push({ at: Math.max(1, num(cfg.missedForReset, 3)), kind: 'reset' });
    }
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }
  function applyRules(streak, missed) {
    var rules = parseRules(), r = null, i;
    for (i = 0; i < rules.length; i++) { if (missed >= rules[i].at) r = rules[i]; }
    if (!r) return { after: streak, reset: false };
    if (r.kind === 'reset') return { after: 0, reset: streak > 0 };
    if (r.kind === 'pct') return { after: Math.max(0, Math.round(streak * (1 - r.val / 100))), reset: false };
    if (r.kind === 'set') return { after: Math.min(streak, r.val), reset: false };
    return { after: Math.max(0, streak - r.val), reset: false };
  }
  /* free passes: forgive this many penalties per viewer per calendar month */
  function passesLeft(u) {
    var allowed = Math.max(0, num(cfg.freePasses, 0)), month = today().key.slice(0, 7);
    return allowed - (u.passMonth === month ? (u.passUsed || 0) : 0);
  }
  function bumpDay(key) {
    if (!db.dayCounts || typeof db.dayCounts !== 'object') db.dayCounts = {};
    db.dayCounts[key] = (db.dayCounts[key] || 0) + 1;
    var ks = Object.keys(db.dayCounts);
    if (ks.length > 520) { ks.sort(); ks.slice(0, ks.length - 500).forEach(function (k) { delete db.dayCounts[k]; }); }
  }

  /* ---------- streak rules ---------- */
  function processCheckIn(userKey, name) {
    var t = today();
    var dayAdded = markStreamDay(t.key);               // today is now a stream day
    var u = db.users[userKey];
    var prev = 0, lost = 0, reset = false, missed, passUsed = false;

    if (!u) {
      u = db.users[userKey] = { name: name, first: t.key, last: t.key, streak: 1, best: 1, total: 1 };
      bumpDay(t.key);
    } else {
      u.name = name;
      var lastIdx = idxOf(u.last);
      if (t.idx <= lastIdx) return { already: true, changed: dayAdded, n: summary(u, name, 0, 0, false) };
      missed = missedDays(u.last, t);           // whole days skipped in between
      bumpDay(t.key);
      var s = prev = u.streak;
      var ru = applyRules(prev, missed);
      if (ru.after < prev && passesLeft(u) > 0) {          // a free pass forgives this penalty
        var mo = t.key.slice(0, 7);
        u.passUsed = (u.passMonth === mo ? (u.passUsed || 0) : 0) + 1; u.passMonth = mo;
        passUsed = true;
      } else { s = ru.after; reset = ru.reset; }
      lost = prev - s;
      if (lost > 0 || reset) logPenalty(userKey, name, u.last, t.key, missed, prev, s);
      s += 1;                                  // today's check-in
      u.streak = s;
      u.best = Math.max(u.best, s);
      u.total += 1;
      u.last = t.key;
    }
    var sm = summary(u, name, prev, lost, reset);
    sm.missed = (typeof missed === 'number') ? missed : 0;
    sm.pass = passUsed;
    return { already: false, changed: true, n: sm };
  }
  /* every penalty / reset is written down (kept inside the backup) so you can always see why it happened */
  function logPenalty(userKey, name, lastKey, todayKey, missed, before, after) {
    if (!Array.isArray(db.log)) db.log = [];
    var between = (cfg.dayMode || 'stream') === 'calendar' ? [] : countedDays(lastKey, todayKey);
    db.log.push({ at: new Date().toISOString(), user: userKey, name: name, lastCheckIn: lastKey, today: todayKey,
                  mode: cfg.dayMode || 'stream', missedDays: missed, missedList: between.slice(0, 10),
                  streakBefore: before, streakAfter: after });
    if (db.log.length > 100) db.log.splice(0, db.log.length - 100);
  }
  function summary(u, name, prev, lost, reset) {
    return { name: name, streak: u.streak, prev: prev, lost: lost, reset: reset,
             best: u.best, total: u.total, first: fmtDate(u.first) };
  }

  /* streak as it stands today: the penalty / reset is only written when the viewer next checks in,
     so for the leaderboards we work out what it would be right now */
  function effectiveStreak(u, t) {
    if (u.last >= t.key) return u.streak;
    var after = applyRules(u.streak, missedDays(u.last, t)).after;
    return (after < u.streak && passesLeft(u) > 0) ? u.streak : after;
  }
  /* type 'top' = best ACTIVE streaks, 'best' = best ALL-TIME streaks */
  function rankRows(type, limit) {
    var t = today(), out = [], k;
    for (k in db.users) {
      var u = db.users[k];
      if (!u || typeof u.streak !== 'number') continue;
      var eff = effectiveStreak(u, t);
      var val = type === 'best' ? u.best : eff;
      if (val > 0) out.push({ key: k, u: u, eff: eff, val: val });
    }
    out.sort(function (a, b) {
      return (b.val - a.val) || (b.u.best - a.u.best) || (a.u.first < b.u.first ? -1 : a.u.first > b.u.first ? 1 : 0) ||
             String(a.u.name).localeCompare(String(b.u.name));
    });
    return out.slice(0, limit);
  }
  function userKeyOf(data, service) {
    var name = data.displayName || data.nick || 'viewer';
    return service + ':' + String(data.userId || data.nick || name).toLowerCase();
  }
  function findUser(name) {
    name = String(name || '').trim().replace(/^@/, '').toLowerCase();
    if (!name) return '';
    var best = '', k;
    for (k in db.users) {
      var u = db.users[k];
      if (String(u.name).toLowerCase() === name || k.split(':').slice(1).join(':') === name) {
        if (!best || u.last > db.users[best].last) best = k;     // same name on both platforms: newest activity wins
      }
    }
    return best;
  }
  function cooling(map, key, sec, mod) {
    sec = num(sec, 0);
    if (sec <= 0 || (mod && cfg.modBypass !== false)) return false;
    var now = Date.now();
    if (map[key] && now < map[key]) return true;
    map[key] = now + sec * 1000;
    return false;
  }

  /* ---------- storage ---------- */
  function loadDb(tries) {
    tries = tries || 0;
    if (typeof SE_API === 'undefined' || !SE_API.store) { dbReady = true; return Promise.resolve(); }
    return SE_API.store.get(storeKey()).then(function (v) {
      db = (v && v.users) ? v : { users: {} };
      if (!Array.isArray(db.streamDays)) db.streamDays = [];
      dbReady = true;
      if (!Object.keys(db.users).length) {          // cloud data is empty: use the copy kept in this browser, if there is one
        var m = mirrorRead();
        if (m) { db = m; save(); toast('DATA RECOVERED FROM THE LOCAL COPY: ' + Object.keys(db.users).length + ' VIEWERS'); }
      }
    }).catch(function () {
      if (tries < 4) return sleep(1500).then(function () { return loadDb(tries + 1); });
      console.warn('[checkin] could not load saved data - check-ins are paused so nothing gets overwritten');
    });
  }
  function store(key) { return SE_API.store.get(key); }
  function storeSetP(key, val) {
    try { if (typeof SE_API !== 'undefined' && SE_API.store) return Promise.resolve(SE_API.store.set(key, val)); }
    catch (e) { console.warn('[checkin] store failed', e); }
    return Promise.resolve();
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function backupDb(suffix) {
    return storeSetP(storeKey() + suffix, { savedAt: new Date().toISOString(), data: clone(db) });
  }
  /* the last 7 days of snapshots, one per stream day (taken at that day's first check-in, so each one
     shows how things stood at the END of the previous stream day) */
  function histPush() {
    var key = today().key;
    return SE_API.store.get(storeKey() + '_hist').catch(function () { return null; }).then(function (h) {
      h = (h && h.days) ? h : { days: {} };
      h.days[key] = { savedAt: new Date().toISOString(),
        data: { users: clone(db.users), streamDays: (db.streamDays || []).slice(-60), dayCounts: clone(db.dayCounts || {}), ignored: clone(db.ignored || []) } };
      var ks = Object.keys(h.days).sort();
      while (ks.length > 7) delete h.days[ks.shift()];
      return storeSetP(storeKey() + '_hist', h);
    });
  }
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function cleanDb(o) {                      // accepts a backup file or a raw db; returns a safe db or null
    if (o && o.data && o.data.users) o = o.data;
    if (!o || typeof o.users !== 'object' || !o.users) return null;
    var out = { users: {}, streamDays: [] }, k, count = 0;
    function n0(v) { v = Math.floor(Number(v)); return isFinite(v) && v > 0 ? v : 0; }
    for (k in o.users) {
      var u = o.users[k];
      if (!u || !DATE_RE.test(String(u.first)) || !DATE_RE.test(String(u.last))) continue;
      var c = { name: String(u.name || 'viewer').slice(0, 60), first: u.first, last: u.last,
                streak: n0(u.streak), best: n0(u.best), total: n0(u.total) };
      if (c.best < c.streak) c.best = c.streak;
      if (/^\d{4}-\d{2}$/.test(String(u.passMonth || ''))) { c.passMonth = u.passMonth; c.passUsed = n0(u.passUsed); }
      if (/^https?:\/\//.test(String(u.av || ''))) c.av = String(u.av);
      out.users[String(k).slice(0, 100)] = c; count++;
    }
    if (!count) return null;
    var days = Array.isArray(o.streamDays) ? o.streamDays : [], seen = {};
    days.forEach(function (d) { if (DATE_RE.test(String(d)) && !seen[d]) { seen[d] = 1; out.streamDays.push(d); } });
    out.streamDays.sort();
    if (o.dayCounts && typeof o.dayCounts === 'object') {
      out.dayCounts = {};
      Object.keys(o.dayCounts).forEach(function (d) { var v = Math.floor(Number(o.dayCounts[d])); if (DATE_RE.test(d) && isFinite(v) && v > 0) out.dayCounts[d] = v; });
    }
    if (Array.isArray(o.ignored)) out.ignored = o.ignored.filter(function (d) { return DATE_RE.test(String(d)); });
    return out;
  }
  /* second copy of the data inside this browser / OBS profile, in case the StreamElements store ever comes back empty */
  function mirrorKey() { return storeKey() + '_local'; }
  function mirrorWrite() {
    try { localStorage.setItem(mirrorKey(), JSON.stringify({ savedAt: new Date().toISOString(), data: db })); } catch (e) { /* storage may be blocked */ }
  }
  function mirrorRead() {
    try { var v = JSON.parse(localStorage.getItem(mirrorKey()) || 'null'); return v && cleanDb(v.data); } catch (e) { return null; }
  }
  var lastSave = Promise.resolve();
  function save() {
    mirrorWrite();
    try {
      if (typeof SE_API !== 'undefined' && SE_API.store) {
        var p = Promise.resolve(SE_API.store.set(storeKey(), db)).catch(function (e) {
          console.warn('[checkin] save failed', e); toast('SAVE FAILED - USE BACKUP NOW');
        });
        lastSave = p;
        return p;
      }
    } catch (e) { console.warn('[checkin] save failed', e); }
    return Promise.resolve();
  }
  /* Take the newest saved data before changing anything, so a second copy of the widget
     (editor tab, another scene) can never overwrite newer check-ins with an out-of-date copy. */
  function refreshDb() {
    if (typeof SE_API === 'undefined' || !SE_API.store) return Promise.resolve();
    return lastSave.then(function () { return SE_API.store.get(storeKey()); }).then(function (v) {
      if (v && v.users && Object.keys(v.users).length >= 0) {
        db = v;
        if (!Array.isArray(db.streamDays)) db.streamDays = [];
      }
    }).catch(function () { /* keep working with what we have */ });
  }
  var chain = Promise.resolve();

  /* ---------- chat ---------- */
  function isMod(data) {
    var ad = data.authorDetails;                       // YouTube
    if (ad && (ad.isChatOwner || ad.isChatModerator)) return true;
    var b = data.badges || [], i;
    for (i = 0; i < b.length; i++) {
      var t = String(b[i] && (b[i].type || b[i].id) || b[i]);
      if (/broadcaster|moderator|owner/i.test(t)) return true;
    }
    return String(data.nick || data.displayName || '').toLowerCase() === channelName;
  }

  /* ---------- avatars ---------- */
  function fetchTimeout(url, ms) {
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { clearTimeout(timer); return r; });
  }
  function resolveAvatar(n) {
    if (n.avatar) return Promise.resolve(n.avatar);
    if (n.sample) return Promise.resolve(cfg.avatarPlaceholder || '');   // test cards show instantly
    if (n.service === 'twitch' && n.name) {
      var k = n.name.toLowerCase();
      if (avatarCache[k]) return Promise.resolve(avatarCache[k]);
      return fetchTimeout('https://decapi.me/twitch/avatar/' + encodeURIComponent(k), 3500)
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          txt = String(txt).trim();
          if (/^https?:\/\//.test(txt)) { avatarCache[k] = txt; return txt; }
          return cfg.avatarPlaceholder || '';
        })
        .catch(function () { return cfg.avatarPlaceholder || ''; });
    }
    return Promise.resolve(cfg.avatarPlaceholder || '');
  }

  /* ---------- card ---------- */
  function initial(name) {
    var d = document.createElement('div');
    d.className = 'ini';
    d.textContent = String(name || '?').charAt(0).toUpperCase();
    return d;
  }

  function buildCard(n, theme, avatarUrl, preview) {
    var card = document.createElement('div');
    card.className = 'card' + (preview ? ' preview' : '');
    card.style.setProperty('--c', theme.c);
    card.style.setProperty('--c2', theme.c2);
    card.style.setProperty('--rgb', theme.rgb);
    card.innerHTML = TEMPLATE;

    $('.name', card).textContent = n.name;
    $('.snum', card).textContent = preview ? n.streak : n.prev;
    $('.best', card).textContent = n.best;
    $('.total', card).textContent = n.total;
    $('.first', card).textContent = n.first;

    if (n.sample) {                                    // make test cards obvious
      var tg = document.createElement('div');
      tg.className = 'testtag';
      tg.textContent = 'TEST';
      $('.inner', card).appendChild(tg);
    }

    var dl = $('.delta', card);
    var why = n.missed ? ' (MISSED ' + n.missed + ')' : '';
    if (n.pass) { dl.textContent = 'FREE PASS USED'; dl.className = 'delta'; dl.style.fontSize = '14px'; why = ''; }
    else if (n.reset) { dl.textContent = 'RESET' + why; dl.className = 'delta bad'; }
    else if (n.lost > 0) { dl.textContent = '−' + n.lost + why; dl.className = 'delta bad'; }
    if (why) dl.style.fontSize = '14px';

    var av = $('.avatar', card);
    if (avatarUrl) {
      var img = document.createElement('img');
      img.alt = '';
      img.onerror = function () { av.innerHTML = ''; av.appendChild(initial(n.name)); };
      img.src = avatarUrl;
      av.appendChild(img);
    } else {
      av.appendChild(initial(n.name));
    }

    var plat = $('.plat', card);
    if (cfg.showPlatform === false || (n.service !== 'youtube' && n.service !== 'twitch')) plat.style.display = 'none';
    else plat.innerHTML = n.service === 'youtube' ? SVG.yt : SVG.tw;

    var logo = $('.logo', card);
    if (cfg.showLogo === false) logo.style.display = 'none';
    else fillLogo($('.logo-in', card));

    if (n.kind === 'me') {
      $('.checked span', card).textContent = n.checkedToday ? 'CHECKED IN TODAY' : 'NOT CHECKED IN YET';
    }
    return card;
  }
  function fillLogo(li) {
    if (cfg.logoImage) { var im = document.createElement('img'); im.alt = ''; im.src = cfg.logoImage; li.appendChild(im); }
    else {
      var txt = cfg.logoText ? String(cfg.logoText) : 'PMZ';
      li.className = 'logo-in has-text';
      li.innerHTML = SVG.crown;
      var sp = document.createElement('span');
      sp.className = 'logo-text';
      sp.textContent = txt;
      li.appendChild(sp);
    }
  }

  /* ---------- leaderboard card ---------- */
  function boardTheme(type) {
    var mode = cfg.colorMode || 'random', i;
    for (i = 0; i < THEMES.length; i++) if (THEMES[i].n === mode) return THEMES[i];
    return type === 'best' ? THEMES[3] : THEMES[0];          // green for active, purple for all-time
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function buildBoard(n, theme, avatars) {
    var rows = n.rows, H = 160 + 52 * rows.length;
    var card = el('div', 'card lb');
    card.style.setProperty('--c', theme.c);
    card.style.setProperty('--c2', theme.c2);
    card.style.setProperty('--rgb', theme.rgb);
    card.style.height = (H + 40) + 'px';
    card.innerHTML =
      '<div class="inner">' +
        '<div class="lbglow" style="height:' + H + 'px"><div class="lbo"></div><div class="lbi"></div></div>' +
        '<div class="chev lbc1"></div><div class="chev lbc2"></div>' +
        '<div class="lbtitle"></div><div class="lbsub"></div>' +
        '<div class="lblogo"><div class="logo-in"></div></div>' +
        '<div class="lbline"></div><div class="lbrows"></div>' +
        '<div class="lbfoot" style="top:' + (H - 12) + 'px"></div>' +
      '</div>';
    $('.lbtitle', card).textContent = n.type === 'best' ? 'BEST STREAKS' : 'LEADERBOARD';
    $('.lbsub', card).textContent = (n.type === 'best' ? 'ALL-TIME BEST' : 'ACTIVE STREAKS') + ' / TOP ' + rows.length;
    var foot = $('.lbfoot', card);
    var cmd = n.type === 'best' ? (cfg.cmdBest || '!beststreak') : (cfg.cmdTop || '!topstreak');
    var b = el('span', 'lbcmd', String(cmd).toUpperCase());
    foot.appendChild(b);
    foot.appendChild(el('span', null, '  /  UPDATES LIVE'));
    if (cfg.showLogo === false) $('.lblogo', card).style.display = 'none'; else fillLogo($('.lblogo .logo-in', card));

    var host = $('.lbrows', card), top = rows.length ? rows[0].val : 1;
    var icon = n.type === 'best' ? SVG.crown : SVG.flame;
    icon = icon.replace('<svg class="flame"', '<svg').replace('<svg', '<svg class="ri"');
    rows.forEach(function (r, i) {
      var row = el('div', 'lbrow r' + Math.min(i + 1, 4));
      var bar = el('div', 'lbbar');
      bar.style.width = Math.max(10, Math.round(r.val / top * 100)) + '%';
      row.appendChild(bar);
      row.appendChild(el('div', 'lbrank', String(i + 1)));
      var av = el('div', 'lbav');
      if (avatars && avatars[i]) {
        var img = document.createElement('img');
        img.alt = '';
        img.onerror = function () { av.innerHTML = ''; av.textContent = String(r.u.name).charAt(0).toUpperCase(); };
        img.src = avatars[i];
        av.appendChild(img);
      } else av.textContent = String(r.u.name || '?').charAt(0).toUpperCase();
      row.appendChild(av);
      row.appendChild(el('div', 'lbname', r.u.name));
      var val = el('div', 'lbval');
      val.innerHTML = icon;
      val.appendChild(el('span', 'lbnum', String(r.val)));
      val.appendChild(el('span', 'lbunit', 'DAYS'));
      row.appendChild(val);
      host.appendChild(row);
    });
    return card;
  }
  function rowAvatar(r) {
    if (r.u.av) return Promise.resolve(r.u.av);
    return resolveAvatar({ service: r.key.split(':')[0], name: r.u.name, sample: !!r.sample });
  }
  function showBoard(n) {
    var slotEl = $('#slot'), theme = boardTheme(n.type);
    return Promise.all(n.rows.map(rowAvatar)).then(function (avs) {
      var card = buildBoard(n, theme, avs);
      var h = 200 + 52 * n.rows.length;
      var dur = Math.max(4, num(cfg.timeBoard, 12)) * 1000;
      curBoard = n.type;
      slotEl.style.width = 'calc(600px * var(--s, 1))';
      slotEl.style.height = 'calc(' + h + 'px * var(--s, 1))';
      slotEl.classList.add('busy');
      slotEl.appendChild(card);
      void card.offsetWidth;
      card.classList.add('in');
      playSound();
      var killer = setTimeout(function () { if (card.remove) card.remove(); }, dur + 3000);
      return sleep(dur).then(function () {
        card.classList.add('out');
        return sleep(700);
      }).then(function () { clearTimeout(killer); if (card.remove) card.remove(); })
        .then(function () { curBoard = ''; slotEl.style.width = ''; slotEl.style.height = ''; });
    });
  }

  function countTo(el, from, to, ms) {
    var start = performance.now();
    function step(t) {
      var p = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function playSound() {
    if (!cfg.soundFile) return;
    try {
      var a = new Audio(cfg.soundFile);
      a.volume = Math.max(0, Math.min(1, num(cfg.soundVolume, 25) / 100));
      var p = a.play(); if (p && p.catch) p.catch(function () {});
    } catch (e) { /* ignore */ }
  }

  function show(n) {
    if (n.kind === 'board') return showBoard(n);
    var theme = pickTheme();
    var slotEl = $('#slot');
    return resolveAvatar(n).then(function (avatar) {
      var card = buildCard(n, theme, avatar, false);
      var dur = Math.max(4, num(n.kind === 'me' ? cfg.timeMe : cfg.timeExit, n.kind === 'me' ? 8 : 10)) * 1000;
      slotEl.classList.add('busy');                    // hides the Edit Mode sample while a real card plays
      slotEl.appendChild(card);
      void card.offsetWidth;
      card.classList.add('in');
      playSound();
      setTimeout(function () { countTo($('.snum', card), n.prev, n.streak, 900); }, 650);
      var killer = setTimeout(function () { if (card.remove) card.remove(); }, dur + 3000);   // safety net
      return sleep(dur).then(function () {
        card.classList.add('out');
        return sleep(700);
      }).then(function () { clearTimeout(killer); if (card.remove) card.remove(); });
    });
  }

  function enqueue(n) {
    // During a rush of check-ins, skip the card (the check-in itself is still counted and saved)
    if (queue.length >= Math.max(1, num(cfg.maxQueue, 6))) { console.warn('[checkin] card skipped, queue is full'); return; }
    queue.push(n);
    pump();
  }
  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    show(queue.shift()).catch(function (e) { console.warn('[checkin] show failed', e); })
      .then(function () {
        busy = false;
        if (!queue.length) { var s = $('#slot'); if (s && s.classList) s.classList.remove('busy'); }
        pump();
      });
  }

  /* ---------- layout / preview ---------- */
  function applyLayout() {
    var pos = ['bl', 'br', 'tl', 'tr', 'c'].indexOf(cfg.position) >= 0 ? cfg.position : 'bl';
    $('#stage').className = 'pos-' + pos;
    document.documentElement.style.setProperty('--s', num(cfg.scaleWidget, 1));
  }

  var SAMPLE_NAMES = ['ShadowRex', 'LunaticJay', 'NekoChan', 'GameHiru', 'PixelSlayer', 'RaviPlays'];
  function sampleNotification() {
    var r = Math.floor(Math.random() * 60) + 3;
    return { name: SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)],
             sample: true, service: Math.random() < 0.5 ? 'youtube' : 'twitch', avatar: cfg.avatarPlaceholder || '',
             streak: r, prev: r - 1, lost: 0, reset: false,
             best: r + Math.floor(Math.random() * 20), total: r * 3 + 7, first: '12 Jun 2026' };
  }
  function sampleBoard(type) {
    var real = dbReady ? rankRows(type, Math.max(3, Math.min(10, num(cfg.boardRows, 10)))) : [];
    if (real.length) return { kind: 'board', type: type, rows: real };
    var vals = type === 'best' ? [112, 87, 74, 66, 58, 51, 47, 40, 36, 31] : [56, 41, 33, 28, 24, 19, 15, 12, 9, 7];
    var names = ['ShadowRex', 'LunaticJay', 'NekoChan', 'GameHiru', 'PixelSlayer', 'RaviPlays', 'MochiMage', 'NightOwl', 'TurboTina', 'ByteBandit'];
    var rows = [], n = Math.max(3, Math.min(10, num(cfg.boardRows, 10))), i;
    for (i = 0; i < n; i++) rows.push({ key: 'sample:' + i, sample: true, val: vals[i], eff: vals[i], u: { name: names[i], best: vals[i], total: vals[i] * 2, first: '2026-01-01', last: '2026-01-01' } });
    return { kind: 'board', type: type, rows: rows };
  }
  function renderPreview() {
    var n = sampleNotification();
    n.name = 'ShadowRex'; n.streak = 12; n.best = 24; n.total = 86; n.service = 'youtube';
    var card = buildCard(n, THEMES[0], cfg.avatarPlaceholder || '', true);
    $('#slot').appendChild(card);
    void card.offsetWidth;
    card.classList.add('in');
  }

  /* ---------- events ---------- */
  function handleCheckIn(data, service) {
    if (!dbReady) { if (pending.length < 30) pending.push([data, service]); return; }
    chain = chain.then(refreshDb).then(function () { return doCheckIn(data, service); })
      .catch(function (e) { console.warn('[checkin] check-in failed', e); });
  }
  function doCheckIn(data, service) {
    var name = data.displayName || data.nick || 'viewer';
    var userKey = userKeyOf(data, service);
    var avatar = data.avatar || (data.authorDetails && data.authorDetails.profileImageUrl) || '';
    var t = today();
    // first check-in of a new stream day: keep a copy of yesterday's data as a safety net
    if ((db.streamDays || []).indexOf(t.key) < 0 && Object.keys(db.users).length) { backupDb('_daily'); histPush(); }
    var res = processCheckIn(userKey, name);
    var u = db.users[userKey], avChanged = false;
    if (u && avatar && u.av !== avatar) { u.av = avatar; avChanged = true; }
    if (res.already) { if (res.changed || avChanged) return save(); return; }
    var n = res.n;
    n.service = service;
    n.avatar = avatar;
    enqueue(n);
    return save();
  }

  /* ---- toast + editor tools panel ---- */
  function toast(msg) {
    if (cfg.showToasts === false) return;
    var e = $('#toast');
    if (!e) return;
    e.textContent = msg;
    e.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { e.style.display = 'none'; }, 6000);
  }
  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: mime });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch (e) { /* ignore */ } }, 500);
    } catch (e) { /* the box below still has the text to copy */ }
  }
  function showTools(title, text, filename, mime) {
    var p = $('#tools');
    if (!p) return;
    $('#ttitle').textContent = title;
    $('#ttext').value = text;
    p.style.display = 'block';
    if (filename) download(filename, text, mime || 'text/plain');
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {}); } catch (e) { /* ignore */ }
    if (toolsTimer) clearTimeout(toolsTimer);
    toolsTimer = setTimeout(function () { p.style.display = 'none'; }, 300000);
  }
  function editorOnly() {
    if (cfg.editMode) return true;
    toast('TURN ON EDIT MODE TO USE BACKUP / EXPORT TOOLS');
    return false;
  }
  function stamp() { return today().key; }

  /* ---- backup / export / restore ---- */
  function csvCell(v) {
    v = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;                 // stops spreadsheet formulas from names
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportCsv(type) {
    var rows = rankRows(type, 50);
    var out = ['rank,name,platform,current_streak,best_streak,total_checkins,first_checkin,last_checkin'];
    rows.forEach(function (r, i) {
      out.push([i + 1, r.u.name, r.key.split(':')[0], r.eff, r.u.best, r.u.total, r.u.first, r.u.last].map(csvCell).join(','));
    });
    return out.join('\n');
  }
  function doExport(type) {
    if (!dbReady || !editorOnly()) return;
    var label = type === 'best' ? 'all-time best streaks' : 'current streaks';
    showTools('Giveaway list - top 50 ' + label + ' (also downloaded / copied)', exportCsv(type),
      'giveaway-' + (type === 'best' ? 'best-alltime' : 'current') + '-' + stamp() + '.csv', 'text/csv');
  }
  function doBackup() {
    if (!dbReady || !editorOnly()) return;
    var text = JSON.stringify({ format: 'checkin-backup', version: 1, exportedAt: new Date().toISOString(), data: db });
    showTools('Backup - saved as a .txt file (also copied). To restore: Load .txt file, then Restore from this box', text, 'checkin-backup-' + stamp() + '.txt', 'text/plain');
    toast('BACKUP CREATED: ' + Object.keys(db.users).length + ' VIEWERS');
  }
  /* two-step: the first press only arms it, the second press within 20 s does it */
  function confirmStep(what, warn) {
    var now = Date.now();
    if (restoreArm.what === what && now < restoreArm.until) { restoreArm = { what: '', until: 0 }; return true; }
    restoreArm = { what: what, until: now + 20000 };
    toast(warn + ' - PRESS THE SAME BUTTON AGAIN WITHIN 20 SECONDS TO CONFIRM');
    return false;
  }
  function applyRestore(clean, label) {
    return backupDb('_safety').then(function () {
      db = clean;
      save();
      toast('RESTORED ' + label + ': ' + Object.keys(db.users).length + ' VIEWERS (previous data kept as safety backup)');
    });
  }
  function doRestoreText(text, what) {
    if (!dbReady || !editorOnly()) return;
    var clean = null;
    try { clean = cleanDb(JSON.parse(String(text || '').trim())); } catch (e) { /* invalid */ }
    if (!clean) { toast('RESTORE FAILED: THAT IS NOT A VALID BACKUP'); return; }
    if (!confirmStep(what, 'THIS REPLACES ALL CURRENT DATA WITH ' + Object.keys(clean.users).length + ' VIEWERS')) return;
    applyRestore(clean, 'FROM BACKUP');
  }
  function doRestoreStored(suffix, what) {
    if (!dbReady || !editorOnly()) return;
    store(storeKey() + suffix).then(function (v) {
      var clean = v && cleanDb(v.data);
      if (!clean) { toast('NO ' + what + ' FOUND'); return; }
      if (!confirmStep(what, 'THIS REPLACES ALL CURRENT DATA WITH THE ' + what + ' FROM ' + String(v.savedAt || '?').slice(0, 10))) return;
      applyRestore(clean, what);
    }).catch(function () { toast('COULD NOT READ ' + what); });
  }

  function doListSnapshots() {
    if (!dbReady || !editorOnly()) return;
    store(storeKey() + '_hist').then(function (h) {
      var ks = (h && h.days) ? Object.keys(h.days).sort() : [];
      if (!ks.length) { toast('NO SNAPSHOTS SAVED YET (ONE IS TAKEN AT THE FIRST CHECK-IN OF EACH STREAM DAY)'); return; }
      var lines = ks.map(function (k) { var c = cleanDb(h.days[k].data); return k + '  -  ' + (c ? Object.keys(c.users).length : 0) + ' viewers'; });
      showTools('Saved snapshots (type a date into "Restore snapshot date", then press the restore button)', lines.join('\n'));
      toast('SNAPSHOTS: ' + ks.join(', '));
    }).catch(function () { toast('COULD NOT READ SNAPSHOTS'); });
  }
  function doRestoreDate() {
    if (!dbReady || !editorOnly()) return;
    var d = String(cfg.restoreDate || '').trim();
    if (!DATE_RE.test(d)) { toast('TYPE A DATE LIKE 2026-10-15 INTO "RESTORE SNAPSHOT DATE" FIRST'); return; }
    store(storeKey() + '_hist').then(function (h) {
      var snap = h && h.days && h.days[d];
      var clean = snap && cleanDb(snap.data);
      if (!clean) { toast('NO SNAPSHOT FOR ' + d + ' - PRESS "SHOW SNAPSHOT DATES"'); return; }
      if (!confirmStep('SNAPSHOT ' + d, 'THIS REPLACES ALL CURRENT DATA WITH THE SNAPSHOT TAKEN AT THE START OF ' + d + ' (' + Object.keys(clean.users).length + ' VIEWERS)')) return;
      applyRestore(clean, 'SNAPSHOT ' + d);
    }).catch(function () { toast('COULD NOT READ SNAPSHOTS'); });
  }

  /* ---- mod tools for wrong penalties ---- */
  function handleIgnoreDay(rest, mod) {
    if (!dbReady || !mod) return;
    var d = String(rest || '').trim() || today().key;
    if (!DATE_RE.test(d)) { toast('USAGE: ' + (cfg.cmdIgnoreDay || '!ignoreday') + ' 2026-10-15  (no date = today)'); return; }
    chain = chain.then(refreshDb).then(function () {
      if (!Array.isArray(db.ignored)) db.ignored = [];
      if (db.ignored.indexOf(d) < 0) db.ignored.push(d);
      db.streamDays = (db.streamDays || []).filter(function (x) { return x !== d; });
      if (db.dayCounts) delete db.dayCounts[d];
      toast(d + ' WILL NOT COUNT AS A STREAM DAY ANY MORE');
      return save();
    }).catch(function (e) { console.warn('[checkin] ignoreday failed', e); });
  }
  function handleUndoPenalty(rest, mod) {
    if (!dbReady || !mod) return;
    chain = chain.then(refreshDb).then(function () {
      var k = findUser(rest);
      if (!k) { toast('VIEWER NOT FOUND: ' + String(rest || '').trim()); return; }
      var log = db.log || [], i, e = null;
      for (i = log.length - 1; i >= 0; i--) { if (log[i].user === k && !log[i].undone) { e = log[i]; break; } }
      if (!e) { toast('NO PENALTY FOUND FOR ' + String(db.users[k].name).toUpperCase()); return; }
      var back = Math.max(0, e.streakBefore - e.streakAfter), u = db.users[k];
      u.streak += back;
      if (u.best < u.streak) u.best = u.streak;
      e.undone = true;
      toast(String(u.name).toUpperCase() + ': PENALTY UNDONE, +' + back + ' (STREAK NOW ' + u.streak + ')');
      return save();
    }).catch(function (e) { console.warn('[checkin] undo failed', e); });
  }

  /* ---- chat commands ---- */
  function handleMe(data, service, mod) {
    if (!dbReady) return;
    var key = userKeyOf(data, service), u = db.users[key];
    if (!u) return;                                          // not checked in yet ever: nothing to show
    if (cooling(cdUser, key, cfg.cdStreak, mod)) return;
    var t = today(), eff = effectiveStreak(u, t);
    enqueue({ kind: 'me', name: u.name, service: service,
              avatar: data.avatar || (data.authorDetails && data.authorDetails.profileImageUrl) || u.av || '',
              streak: eff, prev: eff, lost: 0, reset: false, best: u.best, total: u.total,
              first: fmtDate(u.first), checkedToday: u.last === t.key });
  }
  function handleBoard(type, mod) {
    if (!dbReady) return;
    var now = Date.now(), sec = num(type === 'best' ? cfg.cdBest : cfg.cdTop, 0);
    var until = type === 'best' ? cdBest : cdTop;
    if (sec > 0 && !(mod && cfg.modBypass !== false) && now < until) return;
    if (curBoard === type) return;
    for (var i = 0; i < queue.length; i++) if (queue[i].kind === 'board' && queue[i].type === type) return;
    var rows = rankRows(type, Math.max(3, Math.min(10, num(cfg.boardRows, 10))));
    if (!rows.length) return;
    if (type === 'best') cdBest = now + sec * 1000; else cdTop = now + sec * 1000;
    enqueue({ kind: 'board', type: type, rows: rows });
  }
  function handleReset(mod) {
    if (!dbReady || !mod) return;
    var now = Date.now();
    if (now > resetArmed) {
      resetArmed = now + 30000;
      toast('RESET DELETES ALL STREAKS - TYPE ' + String(cfg.cmdReset || '!resetcheckin').toUpperCase() + ' AGAIN WITHIN 30 SECONDS TO CONFIRM');
      return;
    }
    resetArmed = 0;
    backupDb('_safety').then(function () {
      db = { users: {}, streamDays: [] };
      save();
      toast('ALL CHECK-IN DATA RESET (SAFETY BACKUP KEPT)');
    });
  }
  function handleSet(rest, mod) {
    if (!dbReady || !mod) return;
    var m = String(rest || '').trim().match(/^(.*\S)\s+(\d{1,4})$/);
    if (!m) { toast('USAGE: ' + (cfg.cmdSetStreak || '!setstreak') + ' name 12'); return; }
    var k = findUser(m[1]);
    if (!k) { toast('VIEWER NOT FOUND: ' + m[1]); return; }
    var u = db.users[k], v = Number(m[2]);
    u.streak = v;
    if (u.best < v) u.best = v;
    save();
    toast(u.name.toUpperCase() + ' STREAK SET TO ' + v);
  }
  function handleRemove(rest, mod) {
    if (!dbReady || !mod) return;
    var k = findUser(rest);
    if (!k) { toast('VIEWER NOT FOUND: ' + String(rest || '').trim()); return; }
    var nm = db.users[k].name;
    backupDb('_safety').then(function () {
      delete db.users[k];
      save();
      toast(nm.toUpperCase() + ' REMOVED FROM CHECK-INS');
    });
  }

  /* If an older copy of this widget is still running in the same page, shut it down first
     (two copies would each react to every click and show their own cards). */
  var stale = false;
  var lastTest = 0;
  try { if (window.__checkinCleanup) window.__checkinCleanup(); } catch (e) { /* ignore */ }

  function onLoad(obj) {
    if (stale) return;
    var d = obj.detail || {};
    cfg = d.fieldData || {};
    channelName = String((d.channel && d.channel.username) || '').toLowerCase();
    applyLayout();
    var slotEl = $('#slot');
    if (slotEl) slotEl.innerHTML = '';                 // clear leftovers from any earlier run
    queue = []; busy = false;
    var tp = $('#tools'); if (tp) tp.style.display = 'none';
    loadDb().then(function () {
      if (stale) return;
      if (cfg.editMode) renderPreview();
      if (dbReady) { var p = pending.splice(0); p.forEach(function (x) { handleCheckIn(x[0], x[1]); }); }
    });
  }

  function onEvent(obj) {
    if (stale) return;
    var d = obj && obj.detail;
    if (!d) return;
    var ev0 = d.event || {};
    if (d.listener === 'widget-button' || ev0.listener === 'widget-button') {
      var field = ev0.field || d.field;
      var now = Date.now();
      if ((field === 'testButton' || field === 'testTopButton' || field === 'testBestButton') &&
          !busy && !queue.length && now - lastTest > 1500) {   // no stacking on repeat clicks
        lastTest = now;
        if (field === 'testButton') enqueue(sampleNotification());
        else enqueue(sampleBoard(field === 'testBestButton' ? 'best' : 'top'));
      }
      else if (field === 'backupButton') doBackup();
      else if (field === 'exportCurrentButton') doExport('top');
      else if (field === 'exportBestButton') doExport('best');
      else if (field === 'restoreButton') doRestoreText(cfg.restoreData, 'RESTORE FROM PASTED BACKUP');
      else if (field === 'restoreSafetyButton') doRestoreStored('_safety', 'SAFETY BACKUP');
      else if (field === 'restoreDailyButton') doRestoreStored('_daily', 'DAILY BACKUP');
      else if (field === 'listSnapshotsButton') doListSnapshots();
      else if (field === 'restoreDateButton') doRestoreDate();
      return;
    }
    if (d.listener !== 'message' || !d.event) return;
    var ev = d.event, data = ev.data || {};
    var text = String(data.text || '').trim();
    if (!text) return;
    var word = text.split(/\s+/)[0].toLowerCase();
    var service = String(ev.service || data.service ||
      ((data.authorDetails || data.snippet) ? 'youtube' : 'twitch')).toLowerCase();
    var rest = text.slice(text.split(/\s+/)[0].length).trim();
    function is(field, dflt) { return word === String(cfg[field] || dflt).toLowerCase(); }
    function on(field) { return cfg[field] !== false; }
    if (is('cmdCheckIn', '!checkin')) handleCheckIn(data, service);
    else if (is('cmdStreak', '!streak')) { if (on('enableStreak')) handleMe(data, service, isMod(data)); }
    else if (is('cmdTop', '!topstreak')) { if (on('enableTop')) handleBoard('top', isMod(data)); }
    else if (is('cmdBest', '!beststreak')) { if (on('enableBest')) handleBoard('best', isMod(data)); }
    else if (is('cmdReset', '!resetcheckin')) handleReset(isMod(data));
    else if (is('cmdSetStreak', '!setstreak')) handleSet(rest, isMod(data));
    else if (is('cmdRemove', '!removecheckin')) handleRemove(rest, isMod(data));
    else if (is('cmdBackup', '!backupcheckin')) { if (isMod(data)) doBackup(); }
    else if (is('cmdIgnoreDay', '!ignoreday')) handleIgnoreDay(rest, isMod(data));
    else if (is('cmdUndoPenalty', '!undopenalty')) handleUndoPenalty(rest, isMod(data));
  }

  function wireTools() {
    var c = $('#tclose'), cp = $('#tcopy'), r = $('#trestore');
    if (c) c.onclick = function () { $('#tools').style.display = 'none'; };
    if (cp) cp.onclick = function () {
      var t = $('#ttext');
      try { t.select(); document.execCommand('copy'); toast('COPIED'); } catch (e) { /* ignore */ }
    };
    if (r) r.onclick = function () { doRestoreText($('#ttext').value, 'RESTORE FROM BOX'); };
    var bar = $('.tb');
    if (bar && !$('#tload')) {
      var fi = document.createElement('input');
      fi.type = 'file'; fi.accept = '.txt,.json,text/plain,application/json'; fi.style.display = 'none'; fi.id = 'tfile';
      fi.onchange = function () {
        var f = fi.files && fi.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { $('#ttext').value = String(rd.result || ''); toast('FILE LOADED - NOW PRESS "RESTORE FROM THIS BOX" TWICE'); };
        rd.readAsText(f);
      };
      var lb = document.createElement('button');
      lb.id = 'tload'; lb.textContent = 'Load .txt file';
      lb.onclick = function () { fi.click(); };
      bar.insertBefore(lb, bar.firstChild);
      bar.appendChild(fi);
    }
    if (bar && !$('#tdl')) {
      var d = document.createElement('button');
      d.id = 'tdl'; d.textContent = 'Download';
      d.onclick = function () { download('checkin-export-' + stamp() + '.txt', $('#ttext').value, 'text/plain'); };
      bar.insertBefore(d, bar.firstChild);
    }
  }
  wireTools();

  window.addEventListener('onWidgetLoad', onLoad);
  window.addEventListener('onEventReceived', onEvent);
  window.__checkinCleanup = function () {
    stale = true;
    queue = [];
    try { window.removeEventListener('onWidgetLoad', onLoad); window.removeEventListener('onEventReceived', onEvent); } catch (e) { /* ignore */ }
    try { var s = $('#slot'); if (s) s.innerHTML = ''; } catch (e) { /* ignore */ }
    try { var tp = $('#tools'); if (tp) tp.style.display = 'none'; } catch (e) { /* ignore */ }
  };
})();
