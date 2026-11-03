/* 小日子 v2 · 界面逻辑 */
(function () {
  'use strict';

  var L = window.XRZLogic;
  var Bridge = (window.Android && typeof window.Android.setupNotifications === 'function') ? window.Android : null;

  var STORE_KEY = 'xiaorizi.data.v2';
  var LEGACY_KEY = 'xiaorizi.data.v1';

  var DEFAULT_SETTINGS = {
    notify: true, offsets: [0], time: '09:00',
    theme: 'auto', accent: 'coral'
  };

  var ACCENTS = {
    coral: { name: '珊瑚', a: '#ff6f61', b: '#ff9a76', soft: '#fff4ee' },
    rose: { name: '玫瑰', a: '#ef4f7b', b: '#ff8fb0', soft: '#fff0f4' },
    ocean: { name: '海洋', a: '#3b82f6', b: '#6fc6ff', soft: '#eef6ff' },
    forest: { name: '森林', a: '#2f9e6f', b: '#63d3a2', soft: '#eefaf4' },
    amber: { name: '琥珀', a: '#d98324', b: '#f5b556', soft: '#fff8ec' },
    violet: { name: '紫罗兰', a: '#7c5cff', b: '#b49bff', soft: '#f4f1ff' }
  };

  var EMOJIS = ['❤️', '🎂', '🎉', '💍', '👶', '🎓', '✈️', '🏠', '🐱', '🐶', '🌸', '⭐', '🎁', '💼', '📚', '🏃', '🍰', '🎄', '🧧', '💐'];

  var state = null;
  var tab = 'home';
  var filterCat = 'all';
  var searchText = '';

  /* ================= 存储 ================= */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nativeGet() {
    try { return Bridge && Bridge.getData ? Bridge.getData() : ''; } catch (e) { return ''; }
  }

  function readRaw() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (!raw) {
      var n = nativeGet();
      if (n) raw = n;
    }
    return raw;
  }

  function blankState() {
    return {
      version: 2,
      events: [],
      settings: Object.assign({}, DEFAULT_SETTINGS),
      seenSetup: false,
      created: Date.now()
    };
  }

  /** v1（people + couple）迁移为 v2 事件 */
  function migrateV1(old) {
    var st = blankState();
    st.seenSetup = true;
    if (old.couple && old.couple.start) {
      var names = [old.couple.him, old.couple.her].filter(Boolean).join(' & ');
      st.events.push({
        id: uid(), title: names || '我们在一起', emoji: '❤️', category: 'love',
        calendar: 'solar', date: old.couple.start, lunar: null,
        repeat: 'year', direction: 'since',
        pinned: true, archived: false, color: 'rose',
        notify: true, note: '', legacyCouple: true
      });
    }
    (old.people || []).forEach(function (p) {
      st.events.push({
        id: uid(), title: p.name + '的生日', emoji: '🎂', category: 'birthday',
        calendar: p.calendar === 'lunar' ? 'lunar' : 'solar',
        date: p.date, lunar: p.lunar || null,
        repeat: 'year', direction: 'until',
        pinned: false, archived: false, color: 'coral',
        notify: p.notify !== false, note: p.relation || '', birth: true
      });
    });
    if (old.settings) {
      st.settings = Object.assign({}, DEFAULT_SETTINGS, {
        notify: old.settings.notify !== false,
        offsets: old.settings.offsets && old.settings.offsets.length ? old.settings.offsets : [0],
        time: old.settings.time || '09:00'
      });
    }
    return st;
  }

  function normalize(st) {
    if (!st || typeof st !== 'object') return blankState();
    if (!Array.isArray(st.events)) st.events = [];
    st.settings = Object.assign({}, DEFAULT_SETTINGS, st.settings || {});
    if (!Array.isArray(st.settings.offsets) || !st.settings.offsets.length) st.settings.offsets = [0];
    if (!ACCENTS[st.settings.accent]) st.settings.accent = 'coral';
    st.version = 2;
    st.events.forEach(function (e) {
      if (!e.id) e.id = uid();
      if (!e.repeat) e.repeat = 'none';
      if (!e.direction) e.direction = 'since';
      if (!e.category) e.category = 'life';
      if (!e.emoji) e.emoji = '⭐';
      if (typeof e.notify !== 'boolean') e.notify = true;
      if (typeof e.pinned !== 'boolean') e.pinned = false;
      // 置顶时间戳：数值越大越靠前。老数据统一给 0，先沿用按天数的顺序；
      // 用户之后重新置顶会拿到真实时间戳并排到最前，老数据不会凭空插队。
      if (!e.pinned) e.pinnedAt = 0;
      else if (typeof e.pinnedAt !== 'number' || !isFinite(e.pinnedAt)) e.pinnedAt = 0;
      if (typeof e.archived !== 'boolean') e.archived = false;
      if (typeof e.paused !== 'boolean') e.paused = false;
    });
    return st;
  }

  function load() {
    var raw = readRaw();
    var st = null;
    if (raw) {
      try { st = JSON.parse(raw); } catch (e) { st = null; }
    }
    if (!st) {
      try {
        var legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          var old = JSON.parse(legacy);
          if (old && (old.people || old.couple)) return migrateV1(old);
        }
      } catch (e) {}
      return blankState();
    }
    return normalize(st);
  }

  var saveTimer = null;
  function save() {
    var json = JSON.stringify(state);
    try { localStorage.setItem(STORE_KEY, json); } catch (e) {}
    try { if (Bridge && Bridge.setData) Bridge.setData(json); } catch (e) {}
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      syncNotifications();
      pushWidget();
    }, 600);
  }

  function today() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0);
  }

  /* ================= 主题 ================= */

  function applyTheme() {
    var s = state.settings;
    var acc = ACCENTS[s.accent] || ACCENTS.coral;
    var root = document.documentElement;
    root.style.setProperty('--accent', acc.a);
    root.style.setProperty('--accent-2', acc.b);
    root.style.setProperty('--accent-soft', acc.soft);

    var dark = false;
    if (s.theme === 'dark') dark = true;
    else if (s.theme === 'light') dark = false;
    else dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark', dark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1b1918' : acc.soft);
    if (Bridge && Bridge.setWidgetTheme) {
      try { Bridge.setWidgetTheme(dark ? 'dark' : 'light'); } catch (e) {}
    }
  }

  /* ================= 通知 & 小组件 ================= */

  function syncNotifications() {
    if (!Bridge) return;
    if (!state.settings.notify) { try { Bridge.setupNotifications('[]'); } catch (e) {} return; }
    var plan = [];
    try { plan = buildPlanV2(state, new Date(), 400); } catch (e) { plan = []; }
    try { Bridge.setupNotifications(JSON.stringify(plan)); } catch (e) {}
  }

  function pushWidget() {
    if (!Bridge || !Bridge.updateWidget) return;
    try {
      var rows = sortedForHome();
      var top = rows.length ? rows[0].ev : null;
      // 小组件跟随“首页大卡片”的封面与主题色
      var cover = (top && top.cover) ? top.cover : '';
      var accent = (ACCENTS[state.settings.accent] || ACCENTS.coral).a;
      if (Bridge.setWidgetSkin) Bridge.setWidgetSkin(cover, accent);
      Bridge.updateWidget(JSON.stringify(topEventsForWidget()));
    } catch (e) {}
  }

  function requestNotifyPermission() {
    if (Bridge && Bridge.requestPermission) { try { Bridge.requestPermission(); } catch (e) {} }
  }

  /* ================= 提醒计划（v2 通用版） ================= */

  function buildPlanV2(st, now, horizonDays) {
    var t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    var settings = st.settings || {};
    var offsets = settings.offsets && settings.offsets.length ? settings.offsets : [0];
    var hm = (settings.time || '09:00').split(':');
    var hour = parseInt(hm[0], 10) || 9, minute = parseInt(hm[1], 10) || 0;
    var items = [];
    var seen = {};

    function hash(str) {
      var h = 5381;
      for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
      return Math.abs(h) % 2000000 + 1000;
    }

    var horizon = new Date(t.getFullYear(), t.getMonth(), t.getDate() + horizonDays, 12);

    st.events.forEach(function (ev) {
      if (!ev.notify || ev.archived || ev.paused) return;
      var occs = [];
      try { occs = L.occurrencesBetween(ev, t, horizon); } catch (e) { occs = []; }
      // 每天/每周重复的只排最近 30 次，避免刷屏
      if (ev.repeat === 'day' || ev.repeat === 'week') occs = occs.slice(0, 30);
      occs.forEach(function (o) {
        var daysLeft = L.diffDays(t, o.date);
        if (daysLeft < 0) return;
        offsets.forEach(function (off) {
          if (daysLeft < off) return;
          var when = new Date(o.date.getFullYear(), o.date.getMonth(), o.date.getDate() - off, hour, minute, 0, 0);
          if (when.getTime() <= now.getTime()) return;
          var title, body;
          if (ev.direction === 'until') {
            if (off === 0) {
              title = (ev.emoji || '⏰') + ' 今天是' + ev.title;
              var extra = '';
              if (ev.birth && ev.date) {
                var b = L.parseYmd(ev.date);
                if (b) extra = '，满 ' + (o.date.getFullYear() - b.getFullYear()) + ' 岁';
              }
              body = '记得送上祝福' + extra;
            } else {
              title = (ev.emoji || '⏰') + ' 还有 ' + off + ' 天是' + ev.title;
              body = L.fmtMd(o.date) + ' · 可以提前准备';
            }
          } else {
            var dayN = L.diffDays(L.parseYmd(ev.date), o.date) + 1;
            if (off === 0) {
              title = (ev.emoji || '❤️') + ' 今天是' + ev.title + '第 ' + dayN + ' 天';
              body = '已走过 ' + L.calendarDiffText(ev.date, o.date) + '，记得纪念一下';
            } else {
              title = (ev.emoji || '❤️') + ' 还有 ' + off + ' 天是' + ev.title + '第 ' + dayN + ' 天';
              body = L.fmtMd(o.date) + ' · 别忘了准备惊喜';
            }
          }
          var key = 'ev-' + ev.id + '-' + L.ymd(o.date) + '-' + off;
          if (seen[key]) return;
          seen[key] = 1;
          items.push({ id: hash(key), at: when.getTime(), title: title, body: body });
        });
      });
    });

    // 恋爱纪念日的里程碑（520 / 1314 / 999 / 周年 …）单独排提醒
    st.events.forEach(function (ev) {
      if (!ev.notify || ev.archived || ev.paused) return;
      if (ev.direction !== 'since') return;
      if (ev.milestones === false) return;
      var isLove = ev.category === 'love' || ev.legacyCouple || ev.milestones === true;
      if (!isLove) return;
      var ms = [];
      try { ms = L.loveMilestones(ev.date, t, 40); } catch (e) { ms = []; }
      ms.forEach(function (m) {
        if (m.daysLeft > horizonDays) return;
        // 有含义的日子才提前提醒；普通整百天只当天提醒，避免打扰
        var offs = m.note || m.kind === 'year' ? offsets : [0];
        offs.forEach(function (off) {
          if (m.daysLeft < off) return;
          var when = new Date(m.date.getFullYear(), m.date.getMonth(), m.date.getDate() - off, hour, minute, 0, 0);
          if (when.getTime() <= now.getTime()) return;
          var title, body;
          var label = m.label + (m.note ? '（' + m.note + '）' : '');
          if (off === 0) {
            title = (ev.emoji || '❤️') + ' 今天是' + ev.title + label;
            body = '已经走过 ' + L.calendarDiffText(ev.date, m.date) + '，记得一起庆祝';
          } else {
            title = (ev.emoji || '❤️') + ' 还有 ' + off + ' 天是' + ev.title + label;
            body = L.fmtMd(m.date) + ' · 别忘了准备惊喜';
          }
          var key = 'ms-' + ev.id + '-' + m.kind + '-' + m.n + '-' + off;
          if (seen[key]) return;
          seen[key] = 1;
          items.push({ id: hash(key), at: when.getTime(), title: title, body: body });
        });
      });
    });

    items.sort(function (a, b) { return a.at - b.at; });
    return items.slice(0, 80);
  }

  /* ================= 计算辅助 ================= */

  function evalAll() {
    var t = today();
    return state.events.map(function (ev) {
      var st = null;
      try { st = L.evalEvent(ev, t); } catch (e) { st = null; }
      return { ev: ev, st: st };
    });
  }

  /**
   * 统一的排序规则（首页 / 全部 / 小组件共用，避免三处各写一套）：
   *   1) 置顶在前；多个置顶之间，最近置顶的在前（pinnedAt 大的在前）
   *   2) 同一天置顶（或都是老数据 pinnedAt=0）时，按“更紧急”排序：
   *      倒数的事件剩余天数少的在前，正数的事件已经过的天数多的在前
   *   3) 暂停的事件排在最后；仍然相同时用 id 兜底，保证顺序稳定不跳动
   */
  function compareRows(a, b) {
    var ap = !!a.ev.pinned, bp = !!b.ev.pinned;
    if (ap !== bp) return ap ? -1 : 1;

    if (ap && bp) {
      var at = a.ev.pinnedAt || 0, bt = b.ev.pinnedAt || 0;
      if (at !== bt) return bt - at;
    }

    var aPaused = a.st.status === 'paused', bPaused = b.st.status === 'paused';
    if (aPaused !== bPaused) return aPaused ? 1 : -1;

    var ad = a.st.status === 'paused' ? 99999 : (a.ev.direction === 'until' ? a.st.days : 90000 - a.st.days);
    var bd = b.st.status === 'paused' ? 99999 : (b.ev.direction === 'until' ? b.st.days : 90000 - b.st.days);
    if (ad !== bd) return ad - bd;

    return String(a.ev.id) < String(b.ev.id) ? -1 : (String(a.ev.id) > String(b.ev.id) ? 1 : 0);
  }

  function sortedForHome() {
    var rows = evalAll().filter(function (r) { return r.st && !r.ev.archived; });
    rows.sort(compareRows);
    return rows;
  }

  /** 首页大卡片：优先取“最近置顶”的那一个 */
  function featuredRow(rows) {
    for (var i = 0; i < rows.length; i++) if (rows[i].ev.pinned) return rows[i];
    return rows[0] || null;
  }

  /**
   * 推给桌面小组件的数据。
   * 关键：不再推“算好的文案”，而是推「基准日期 + 计算方式」，让原生每天自己重算，
   * 否则跨天后小组件会一直停在旧数字上。
   */
  function topEventsForWidget() {
    var rows = sortedForHome().slice(0, 6);
    var t = today();
    return rows.map(function (r) {
      var ev = r.ev;
      // 倒数事件把“下一次发生日”作为基准；正数事件用最初那天
      var baseDate = ev.direction === 'until' && r.st.date ? r.st.date : L.parseYmd(ev.date);
      return {
        title: ev.title,
        emoji: ev.emoji || '⭐',
        text: L.eventHeadline(ev, r.st),
        sub: ev.direction === 'until'
          ? (L.fmtMd(r.st.date) + (r.st.status === 'today' ? '' : ' · ' + L.WEEK_CN[r.st.date.getDay()]))
          : L.fmtMd(L.parseYmd(ev.date)),
        days: r.st.days,
        direction: ev.direction,
        color: (ACCENTS[ev.color] || ACCENTS[state.settings.accent] || ACCENTS.coral).a,
        paused: !!ev.paused,
        pausedDays: ev.paused ? r.st.days : 0,
        // 以下三项给原生做每日重算
        baseYmd: baseDate ? L.ymd(baseDate) : '',
        todayYmd: L.ymd(t),
        repeat: ev.repeat || 'none',
        nextYmd: ev.direction === 'until' && r.st.date ? L.ymd(r.st.date) : ''
      };
    });
  }

  /* ================= 渲染框架 ================= */

  var $view = document.getElementById('view');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function accentOf(ev) {
    return (ACCENTS[ev.color] || ACCENTS[state.settings.accent] || ACCENTS.coral).a;
  }

  /**
   * 切换置顶（唯一的入口，首页/列表/编辑页都走这里）。
   * 置顶时写入 pinnedAt 时间戳，保证“最后置顶的那个”稳稳排在第一位、成为首页大卡片；
   * 取消置顶时清零，避免下次再置顶沿用旧时间戳。
   * @returns {'pinned'|'unpinned'|null}
   */
  function togglePin(id, force) {
    var ev = null;
    for (var i = 0; i < state.events.length; i++) {
      if (state.events[i].id === id) { ev = state.events[i]; break; }
    }
    if (!ev) return null;
    var want = (typeof force === 'boolean') ? force : !ev.pinned;
    if (want === !!ev.pinned) return null;

    ev.pinned = want;
    ev.pinnedAt = want ? Date.now() : 0;
    save();
    // 置顶会改变首页大卡片与小组件顺序，这里立即重绘，不必等用户手动刷新
    render();
    pushWidget();
    return want ? 'pinned' : 'unpinned';
  }

  function render() {
    applyTheme();
    var t = today();
    var lu = null;
    try { lu = L.lunarOf(t); } catch (e) { lu = null; }
    var sub = document.getElementById('todayLine');
    if (sub) {
      sub.textContent = (t.getMonth() + 1) + '月' + t.getDate() + '日 · ' +
        L.WEEK_CN[t.getDay()] + (lu ? ' · ' + lu.text : '');
    }

    if (tab === 'home') $view.innerHTML = renderHome(t);
    else if (tab === 'list') $view.innerHTML = renderList(t);
    else if (tab === 'calendar') $view.innerHTML = renderCalendar(t);
    else $view.innerHTML = renderSettings(t);

    bindView();
    markTab();
  }

  function markTab() {
    document.querySelectorAll('.tabbar [data-tab]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === tab);
    });
  }

  /* ================= 首页 ================= */

  function renderHome(t) {
    var rows = sortedForHome();
    var html = [];

    var todayRows = rows.filter(function (r) { return r.st.status === 'today'; });
    if (todayRows.length) {
      html.push('<div class="today-banner">' + todayRows.map(function (r) {
        return '<div class="tb-row"><span>' + (r.ev.emoji || '🎉') + '</span>' +
          '<span class="tb-text">' + esc(r.ev.title) + '</span>' +
          '<span class="tb-tag">今天</span></div>';
      }).join('') + '</div>');
    }

    if (!rows.length) {
      html.push(renderEmptyHome());
      return html.join('');
    }

    var featured = featuredRow(rows);
    if (!featured) { html.push(renderEmptyHome()); return html.join(''); }
    html.push(renderHero(featured, t));

    var rest = rows.filter(function (r) { return r !== featured; });

    // 其余置顶：单独成组，跟随大卡片的置顶顺序（最近置顶在前），点右侧 📌 可直接取消
    var otherPinned = rest.filter(function (r) { return r.ev.pinned; });
    if (otherPinned.length) {
      html.push('<div class="section-head"><h2>其他置顶</h2>' +
        '<span class="muted small">' + otherPinned.length + ' 个</span></div>');
      html.push('<div class="card list-card">' + otherPinned.map(function (r) {
        return eventRowHtml(r, { pin: true });
      }).join('') + '</div>');
    }

    // 置顶的已经在上面单独展示过，下面的分组里不再重复出现
    var restOthers = rest.filter(function (r) { return !r.ev.pinned; });

    // 里程碑：恋爱纪念日的 520 / 1314 / 999 / 周年 等，显示日期与倒计时
    var loveRows = rows.filter(function (r) { return loveMilesOf(r.ev, t).length; });
    loveRows.forEach(function (r) {
      var all = loveMilesOf(r.ev, t);
      // 只展示“值得庆祝”的：有含义的彩蛋日（520/1314/999…）+ 最近 2 个周年 + 最近的整千天
      var picked = [];
      all.forEach(function (m) { if (m.note) picked.push(m); });
      all.filter(function (m) { return m.kind === 'year'; })
        .slice(0, 2).forEach(function (m) { if (picked.indexOf(m) < 0) picked.push(m); });
      var thousand = all.filter(function (m) { return m.kind === 'day' && m.n % 1000 === 0; }).slice(0, 1);
      thousand.forEach(function (m) { if (picked.indexOf(m) < 0) picked.push(m); });
      // 不够 4 条时，用最近的整百天补齐，保证卡片不空
      all.forEach(function (m) {
        if (picked.length >= 4) return;
        if (m.kind === 'year') return;
        if (picked.indexOf(m) < 0) picked.push(m);
      });
      picked = picked.slice(0, 5);
      picked.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
      var ms = picked;
      if (!ms.length) return;
      html.push('<div class="section-head"><h2>' + esc(r.ev.title) + ' · 里程碑</h2>' +
        '<button class="link-btn" data-action="all-milestones" data-id="' + esc(r.ev.id) + '">全部 ' + all.length + ' 个 ›</button></div>');
      html.push('<div class="card ms-card">' + ms.map(function (m) {
        var big = m.daysLeft === 0;
        return '<div class="ms-row' + (big ? ' ms-today' : '') + '">' +
          '<div class="ms-badge">' + (m.kind === 'year' ? '🎊' : '💗') + '</div>' +
          '<div class="ms-info">' +
            '<div class="ms-name">' + esc(m.label) + (m.note ? ' · ' + esc(m.note) : '') + '</div>' +
            '<div class="ms-date">' + L.fmtCN(m.date, true) + '</div>' +
          '</div>' +
          '<div class="ms-count">' +
            (big ? '<b>就是今天</b>' : '<b>' + m.daysLeft + '</b><span>天后</span>') +
          '</div>' +
        '</div>';
      }).join('') + '</div>');
    });


    var upcoming = restOthers.filter(function (r) { return r.ev.direction === 'until'; })
      .sort(function (a, b) { return a.st.days - b.st.days; }).slice(0, 6);
    if (upcoming.length) {
      html.push('<div class="section-head"><h2>即将到来</h2>' +
        '<button class="link-btn" data-goto="list">全部 ›</button></div>');
      html.push('<div class="card list-card">' + upcoming.map(eventRowHtml).join('') + '</div>');
    }

    var since = restOthers.filter(function (r) { return r.ev.direction === 'since'; })
      .sort(function (a, b) { return b.st.days - a.st.days; }).slice(0, 6);
    if (since.length) {
      html.push('<div class="section-head"><h2>已经历</h2>' +
        '<button class="link-btn" data-goto="list">全部 ›</button></div>');
      html.push('<div class="card list-card">' + since.map(eventRowHtml).join('') + '</div>');
    }

    html.push('<div class="quick-actions">' +
      '<button class="qa-btn" data-action="add-event">＋ 添加日子</button>' +
      '<button class="qa-btn" data-action="share-featured">↗ 分享卡片</button>' +
      '</div>');

    return html.join('');
  }

  /** 某一个恋爱纪念日的全部里程碑 */
  function openAllMilestones(id) {
    var ev = state.events.find(function (x) { return x.id === id; });
    if (!ev) return;
    var t = today();
    var ms = [];
    try { ms = L.loveMilestones(ev.date, t, 200); } catch (e) { ms = []; }

    var body = ms.length ? ('<div class="ms-all">' + ms.map(function (m) {
      return '<div class="ms-row' + (m.daysLeft === 0 ? ' ms-today' : '') + '">' +
        '<div class="ms-badge">' + (m.kind === 'year' ? '🎊' : '💗') + '</div>' +
        '<div class="ms-info">' +
          '<div class="ms-name">' + esc(m.label) + (m.note ? ' · ' + esc(m.note) : '') + '</div>' +
          '<div class="ms-date">' + L.fmtCN(m.date, true) + '</div>' +
        '</div>' +
        '<div class="ms-count">' +
          (m.daysLeft === 0 ? '<b>就是今天</b>' : '<b>' + m.daysLeft + '</b><span>天后</span>') +
        '</div>' +
      '</div>';
    }).join('') + '</div>') : '<div class="empty"><div class="emoji">💗</div><h3>暂时没有未到的里程碑</h3></div>';

    openSheet({
      title: ev.title + ' · 全部里程碑',
      body: body,
      footer: '<button class="btn primary" data-close="1">完成</button>'
    });
  }

  function renderEmptyHome() {
    return '' +
      '<section class="card empty-hero">' +
        '<div class="eh-emoji">🎂❤️⏳</div>' +
        '<h2>记下重要的日子</h2>' +
        '<p>生日、恋爱纪念日、假期、考试……<br/>所有你在乎的日子，都帮你数着。</p>' +
        '<button class="btn primary" data-action="add-event">＋ 添加第一个日子</button>' +
        '<div class="eh-links">' +
          '<button class="link-btn" data-action="quick-birthday">快速加生日</button>' +
          '<button class="link-btn" data-action="quick-love">快速加恋爱纪念</button>' +
        '</div>' +
      '</section>';
  }

  /** 只有“恋爱纪念 / 在一起”这类正向计时的日子才展示 520、1314 等里程碑 */
  function loveMilesOf(ev, t) {
    if (!ev || ev.direction !== 'since') return [];
    if (ev.milestones === false) return [];
    if (!(ev.category === 'love' || ev.legacyCouple || ev.milestones === true)) return [];
    try { return L.loveMilestones(ev.date, t, 12); } catch (e) { return []; }
  }

  function renderHero(row, t) {
    var ev = row.ev, st = row.st;
    var acc = accentOf(ev);
    var isUntil = ev.direction === 'until';
    var bigNum = st.days;
    var headline = st.status === 'paused' ? '计时已暂停'
      : (isUntil ? (st.days === 0 ? '就是今天' : '还有') : '已经');

    var meta = [];
    if (isUntil) {
      meta.push('📅 ' + L.fmtCN(st.date, true));
      if (ev.birth && ev.date) {
        var b = L.parseYmd(ev.date);
        if (b) meta.push('🎂 满 ' + (st.date.getFullYear() - b.getFullYear()) + ' 岁');
      }
    } else {
      meta.push('📅 ' + L.fmtCN(L.parseYmd(ev.date)) + ' 起');
      meta.push('已走过 ' + L.calendarDiffText(ev.date, t));
    }

    var nextLine = '';
    if (!isUntil) {
      // 恋爱纪念日优先展示“520 / 1314 / 周年”这类有意义的日子，没有就取最近一个里程碑
      var ms = loveMilesOf(ev, t);
      var pick = null;
      for (var mi = 0; mi < ms.length; mi++) {
        if (ms[mi].note || ms[mi].kind === 'year') { pick = ms[mi]; break; }
      }
      if (!pick && ms.length) pick = ms[0];
      if (!pick && st.next) {
        nextLine = '<div class="hero-next">下一个 · <b>' + esc(st.next.label) + '</b> · ' +
          L.fmtMd(st.next.date) +
          '<span>' + (st.next.daysLeft === 0 ? '就是今天' : st.next.daysLeft + ' 天后') + '</span></div>';
      } else if (pick) {
        var noteTxt = pick.note ? ' · ' + esc(pick.note) : '';
        nextLine = '<div class="hero-next">' +
          '下一个 · <b>' + esc(pick.label) + '</b>' + noteTxt + ' · ' + L.fmtMd(pick.date) +
          '<span>' + (pick.daysLeft === 0 ? '就是今天' : pick.daysLeft + ' 天后') + '</span></div>';
      }
    }

    var bg = ev.cover ? ' hero-photo' : '';
    // 注意：.hero 用了 background 简写，内联必须同时给出 size/repeat/position，否则图片会按原尺寸平铺
    var bgStyle = ev.cover
      ? '--hero:' + acc +
        ';background-image:linear-gradient(180deg,rgba(20,14,10,.32),rgba(20,14,10,.66)),url(\'' + ev.cover + '\')' +
        ';background-size:cover,cover;background-position:center,center;background-repeat:no-repeat,no-repeat'
      : '--hero:' + acc;

    return '' +
      '<section class="hero' + bg + '" style="' + bgStyle + '" data-action="open-event" data-id="' + esc(ev.id) + '">' +
        '<div class="hero-top">' +
          '<span class="hero-emoji">' + (ev.emoji || '⭐') + '</span>' +
          '<span class="hero-title">' + esc(ev.title) + '</span>' +
          (ev.paused ? '<span class="hero-pill">暂停中</span>' : '') +
        '</div>' +
        '<div class="hero-num">' +
          '<span class="hn-label">' + headline + '</span>' +
          '<span class="hn-value">' + bigNum + '</span>' +
          '<span class="hn-unit">天</span>' +
        '</div>' +
        '<div class="hero-meta">' + meta.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' +
        nextLine +
        '<div class="hero-actions">' +
          '<button class="hero-act" data-action="share-event" data-id="' + esc(ev.id) + '">分享卡片</button>' +
          '<button class="hero-act ghost" data-action="open-event" data-id="' + esc(ev.id) + '">编辑</button>' +
        '</div>' +
      '</section>';
  }

  /**
   * 列表行
   * @param {object} [opts] { pin:true } 才显示置顶按钮，避免首页每个分组都挂一个 📌
   */
  function eventRowHtml(row, opts) {
    var ev = row.ev, st = row.st;
    var showPin = !!(opts && opts.pin);
    var acc = accentOf(ev);
    var right;
    if (st.status === 'paused') right = '<div class="er-num muted">—</div><div class="er-unit">暂停</div>';
    else if (ev.direction === 'until') {
      right = st.days === 0
        ? '<div class="er-today">今天</div>'
        : '<div class="er-num" style="color:' + acc + '">' + st.days + '</div><div class="er-unit">天后</div>';
    } else {
      right = '<div class="er-num" style="color:' + acc + '">' + st.days + '</div><div class="er-unit">天</div>';
    }
    var sub = ev.direction === 'until'
      ? L.fmtCN(st.date) + ' · ' + L.WEEK_CN[st.date.getDay()]
      : L.fmtCN(L.parseYmd(ev.date)) + ' 起';
    return '' +
      '<div class="er" data-action="open-event" data-id="' + esc(ev.id) + '">' +
        '<div class="er-dot" style="background:' + acc + '"></div>' +
        '<div class="er-main">' +
          '<div class="er-title">' + (ev.emoji || '⭐') + ' ' + esc(ev.title) + '</div>' +
          '<div class="er-sub">' + esc(sub) + (ev.note ? ' · ' + esc(ev.note) : '') + '</div>' +
        '</div>' +
        '<div class="er-right">' + right + '</div>' +
        // 置顶按钮独立于整行点击，避免误触进编辑页；点一下即刻生效
        (showPin
          ? '<button class="pin-toggle' + (ev.pinned ? ' on' : '') + '" data-pin="' + esc(ev.id) + '" ' +
            'aria-label="' + (ev.pinned ? '取消置顶' : '置顶') + '" title="' + (ev.pinned ? '取消置顶' : '置顶') + '">📌</button>'
          : '') +
      '</div>';
  }

  /* ================= 全部事件 ================= */

  function renderList(t) {
    var rows = evalAll().filter(function (r) { return r.st && !r.ev.archived; });
    var archived = state.events.filter(function (e) { return e.archived; });

    var cats = [{ id: 'all', name: '全部', emoji: '📋' }].concat(L.CATEGORIES);
    if (filterCat !== 'all') rows = rows.filter(function (r) { return r.ev.category === filterCat; });
    if (searchText) {
      var q = searchText.toLowerCase();
      rows = rows.filter(function (r) {
        return (r.ev.title + ' ' + (r.ev.note || '')).toLowerCase().indexOf(q) >= 0;
      });
    }

    rows.sort(compareRows);

    var html = [];
    html.push('<div class="page-title"><h1>全部日子</h1>' +
      '<button class="round-btn" data-action="add-event">＋</button></div>');

    html.push('<div class="search-box">' +
      '<input id="searchInput" placeholder="搜索日子、备注…" value="' + esc(searchText) + '" />' +
      (searchText ? '<button class="clear-search" data-action="clear-search">✕</button>' : '') +
      '</div>');

    html.push('<div class="chips">' + cats.map(function (c) {
      return '<button class="chip-btn' + (filterCat === c.id ? ' on' : '') + '" data-cat="' + c.id + '">' +
        c.emoji + ' ' + c.name + '</button>';
    }).join('') + '</div>');

    if (!rows.length) {
      html.push('<div class="card empty"><div class="emoji">🔍</div><h3>没有找到</h3>' +
        '<p>换个关键词或分类试试</p></div>');
    } else {
      html.push('<div class="card list-card">' + rows.map(function (r) {
        return eventRowHtml(r, { pin: true });
      }).join('') + '</div>');
    }

    if (archived.length) {
      html.push('<div class="section-head"><h2>已归档</h2><span class="muted small">' + archived.length + ' 个</span></div>');
      html.push('<div class="card list-card">' + archived.map(function (ev) {
        return '<div class="er" data-action="open-event" data-id="' + esc(ev.id) + '">' +
          '<div class="er-dot" style="background:#c9beb6"></div>' +
          '<div class="er-main"><div class="er-title">' + (ev.emoji || '⭐') + ' ' + esc(ev.title) + '</div>' +
          '<div class="er-sub">已归档 · 点开可恢复</div></div>' +
          '<div class="er-right"><div class="er-unit">›</div></div></div>';
      }).join('') + '</div>');
    }

    return html.join('');
  }

  /* ================= 日历 ================= */

  var calCursor = null;

  function renderCalendar(t) {
    if (!calCursor) calCursor = new Date(t.getFullYear(), t.getMonth(), 1, 12);
    var y = calCursor.getFullYear(), m = calCursor.getMonth();
    var first = new Date(y, m, 1, 12);
    var startDay = first.getDay();
    var total = new Date(y, m + 1, 0).getDate();

    var from = new Date(y, m, 1, 12), to = new Date(y, m, total, 12);
    var marks = {};
    state.events.forEach(function (ev) {
      if (ev.archived) return;
      var occs = [];
      try { occs = L.occurrencesBetween(ev, from, to); } catch (e) {}
      occs.forEach(function (o) {
        var key = L.ymd(o.date);
        if (!marks[key]) marks[key] = [];
        marks[key].push({ ev: ev, date: o.date });
      });
    });

    var cells = [];
    for (var i = 0; i < startDay; i++) cells.push('<div class="cal-cell blank"></div>');
    for (var d = 1; d <= total; d++) {
      var date = new Date(y, m, d, 12);
      var key = L.ymd(date);
      var list = marks[key] || [];
      var isToday = L.sameDay(date, t);
      var dots = list.slice(0, 3).map(function (x) {
        return '<span class="dot" style="background:' + accentOf(x.ev) + '"></span>';
      }).join('');
      cells.push('<div class="cal-cell' + (isToday ? ' today' : '') + '">' +
        '<span class="dnum">' + d + '</span>' +
        '<span class="dots">' + dots + '</span>' +
        '</div>');
    }

    var monthList = [];
    Object.keys(marks).sort().forEach(function (k) {
      marks[k].forEach(function (x) { monthList.push(x); });
    });
    monthList.sort(function (a, b) { return a.date - b.date; });

    var listHtml = monthList.length ? monthList.map(function (x) {
      var isPast = L.diffDays(t, x.date) < 0;
      var isToday = L.diffDays(t, x.date) === 0;
      return '<div class="cal-item' + (isPast ? ' past' : '') + '" data-action="open-event" data-id="' + esc(x.ev.id) + '">' +
        '<div class="ci-day">' + x.date.getDate() + '<span>' + (x.date.getMonth() + 1) + '月</span></div>' +
        '<div class="ci-main"><div class="ci-title">' + (x.ev.emoji || '⭐') + ' ' + esc(x.ev.title) + '</div>' +
        '<div class="ci-sub">' + L.WEEK_CN[x.date.getDay()] + (isPast ? ' · 已过去' : '') + '</div></div>' +
        '<div class="ci-right">' + (isToday ? '<span class="ci-today">今天</span>' : '') + '</div>' +
        '</div>';
    }).join('') : '<div class="empty small-empty"><div class="emoji">📅</div><h3>这个月还没有日子</h3></div>';

    return '' +
      '<div class="page-title"><h1>日历</h1>' +
        '<div class="cal-nav">' +
          '<button class="round-btn sm" data-cal="-1">‹</button>' +
          '<button class="round-btn sm" data-cal="0">今</button>' +
          '<button class="round-btn sm" data-cal="1">›</button>' +
        '</div>' +
      '</div>' +
      '<div class="card cal-card">' +
        '<div class="cal-month">' + y + ' 年 ' + (m + 1) + ' 月</div>' +
        '<div class="cal-week">' + ['日','一','二','三','四','五','六'].map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
        '<div class="cal-grid">' + cells.join('') + '</div>' +
      '</div>' +
      '<div class="section-head"><h2>本月安排</h2><span class="muted small">' + monthList.length + ' 个</span></div>' +
      '<div class="card cal-list">' + listHtml + '</div>';
  }

  /* ================= 设置 ================= */

  function renderSettings(t) {
    var s = state.settings;
    var darks = [{ id: 'auto', n: '跟随系统' }, { id: 'light', n: '浅色' }, { id: 'dark', n: '深色' }];
    var hasPerm = Bridge && (function () { try { return Bridge.hasPermission(); } catch (e) { return false; } })();

    return '' +
      '<div class="page-title"><h1>设置</h1></div>' +

      '<div class="section-head"><h2>外观</h2></div>' +
      '<div class="card pad">' +
        '<div class="set-row"><div class="set-label">主题色</div>' +
          '<div class="accent-row">' + Object.keys(ACCENTS).map(function (k) {
            var a = ACCENTS[k];
            return '<button class="accent-dot' + (s.accent === k ? ' on' : '') + '" data-accent="' + k + '" ' +
              'style="background:' + a.a + '"></button>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="set-row"><div class="set-label">深色模式</div>' +
          '<div class="segmented sm">' + darks.map(function (d) {
            return '<button data-theme="' + d.id + '" class="' + (s.theme === d.id ? 'on' : '') + '">' + d.n + '</button>';
          }).join('') + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="section-head"><h2>提醒</h2></div>' +
      '<div class="card pad">' +
        '<div class="set-row"><div><div class="set-label">开启提醒</div>' +
          '<div class="set-sub">生日和纪念日按时通知</div></div>' +
          '<label class="switch"><input type="checkbox" id="setNotify"' + (s.notify ? ' checked' : '') + ' /><span class="track"></span></label>' +
        '</div>' +
        '<div class="set-row"><div><div class="set-label">提醒时间</div>' +
          '<div class="set-sub">每天这个时间发出提醒</div></div>' +
          '<input type="time" class="input time-input" id="setTime" value="' + esc(s.time) + '" />' +
        '</div>' +
        '<div class="set-row col"><div class="set-label">提前几天提醒</div>' +
          '<div class="offset-row">' + [0, 1, 3, 7].map(function (n) {
            return '<button class="chip-btn' + (s.offsets.indexOf(n) >= 0 ? ' on' : '') + '" data-off="' + n + '">' +
              (n === 0 ? '当天' : '提前 ' + n + ' 天') + '</button>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="notice ' + (hasPerm ? 'ok' : '') + '">' +
          (!s.notify ? '提醒已关闭，不会发送通知。'
            : hasPerm ? '✓ 通知已开启，会在设定时间提醒。'
              : '通知权限未开启，点下方按钮授权。') +
        '</div>' +
        '<div class="btn-row" style="margin-top:10px">' +
          '<button class="btn sm" id="btnTestNotify">发送测试提醒</button>' +
          '<button class="btn sm" id="btnNotifySettings">系统通知设置</button>' +
        '</div>' +
        '<div class="hint">Vivo 手机若收不到提醒：设置 → 电池 → 后台耗电管理 → 小日子 → 允许后台高耗电；并在应用权限里打开「自启动」。</div>' +
      '</div>' +

      '<div class="section-head"><h2>桌面小组件</h2></div>' +
      '<div class="card pad">' +
        '<p class="set-sub" style="margin:0 0 10px">把最重要的日子放到手机桌面，一眼就能看到。</p>' +
        '<button class="btn block" id="btnWidgetGuide">查看添加方法</button>' +
      '</div>' +

      '<div class="section-head"><h2>数据</h2></div>' +
      '<div class="card pad">' +
        '<div class="btn-row">' +
          '<button class="btn sm" id="btnExport">导出备份</button>' +
          '<button class="btn sm" id="btnImport">导入备份</button>' +
        '</div>' +
        '<div class="btn-row" style="margin-top:10px">' +
          '<button class="btn sm danger" id="btnClear">清空全部</button>' +
        '</div>' +
        '<div class="hint">数据只存在本机，卸载会一并删除，建议定期导出。</div>' +
      '</div>' +

      '<div class="about">小日子 v2.4 · 完全离线 · 无广告</div>';
  }

  /* ================= 事件绑定 ================= */

  function bindView() {
    $view.querySelectorAll('[data-action]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var action = el.getAttribute('data-action');
        var id = el.getAttribute('data-id');
        if (action === 'add-event') openEventSheet(null);
        else if (action === 'open-event') openEventSheet(id);
        else if (action === 'share-event') { if (id) openShareSheet(id); }
        else if (action === 'share-featured') {
          var rows = sortedForHome();
          if (rows.length) openShareSheet(rows[0].ev.id);
          else toast('先添加一个日子吧');
        } else if (action === 'quick-birthday') {
          openEventSheet(null, { category: 'birthday', direction: 'until', repeat: 'year', emoji: '🎂' });
        } else if (action === 'quick-love') {
          openEventSheet(null, { category: 'love', direction: 'since', repeat: 'year', emoji: '❤️' });
        } else if (action === 'all-milestones') {
          openAllMilestones(id);
        } else if (action === 'clear-search') {
          searchText = '';
          render();
        }
      });
    });

    // 列表 / 首页置顶按钮：只切换置顶，不打开编辑页
    $view.querySelectorAll('[data-pin]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        var id = el.getAttribute('data-pin');
        var res = togglePin(id);
        if (res === 'pinned') toast('已置顶，排到最前面');
        else if (res === 'unpinned') toast('已取消置顶');
      });
    });

    $view.querySelectorAll('[data-goto]').forEach(function (el) {
      el.addEventListener('click', function () { switchTab(el.getAttribute('data-goto')); });
    });

    $view.querySelectorAll('[data-cat]').forEach(function (el) {
      el.addEventListener('click', function () {
        filterCat = el.getAttribute('data-cat');
        render();
      });
    });

    var si = $view.querySelector('#searchInput');
    if (si) {
      si.addEventListener('input', function () {
        searchText = si.value;
        var pos = si.selectionStart;
        render();
        var again = $view.querySelector('#searchInput');
        if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
      });
    }

    $view.querySelectorAll('[data-cal]').forEach(function (el) {
      el.addEventListener('click', function () {
        var d = parseInt(el.getAttribute('data-cal'), 10);
        if (d === 0) calCursor = new Date(today().getFullYear(), today().getMonth(), 1, 12);
        else calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + d, 1, 12);
        render();
      });
    });

    bindSettings();
  }

  function bindSettings() {
    var s = state.settings;

    $view.querySelectorAll('[data-accent]').forEach(function (el) {
      el.addEventListener('click', function () {
        s.accent = el.getAttribute('data-accent');
        save(); render();
      });
    });

    $view.querySelectorAll('[data-theme]').forEach(function (el) {
      el.addEventListener('click', function () {
        s.theme = el.getAttribute('data-theme');
        save(); render();
      });
    });

    var n = $view.querySelector('#setNotify');
    if (n) n.addEventListener('change', function () {
      s.notify = n.checked;
      if (s.notify) requestNotifyPermission();
      save(); render();
    });

    var tm = $view.querySelector('#setTime');
    if (tm) tm.addEventListener('change', function () {
      s.time = tm.value || '09:00';
      save(); toast('提醒时间已设为 ' + s.time);
    });

    $view.querySelectorAll('[data-off]').forEach(function (el) {
      el.addEventListener('click', function () {
        var v = parseInt(el.getAttribute('data-off'), 10);
        var i = s.offsets.indexOf(v);
        if (i >= 0) {
          if (s.offsets.length === 1) { toast('至少保留一个提醒时间'); return; }
          s.offsets.splice(i, 1);
        } else s.offsets.push(v);
        s.offsets.sort(function (a, b) { return a - b; });
        save(); render();
      });
    });

    var tn = $view.querySelector('#btnTestNotify');
    if (tn) tn.addEventListener('click', function () {
      if (Bridge && Bridge.testNotification) { Bridge.testNotification(); syncNotifications(); }
      else toast('请在手机上测试');
    });

    var ns = $view.querySelector('#btnNotifySettings');
    if (ns) ns.addEventListener('click', function () {
      if (Bridge && Bridge.openNotificationSettings) Bridge.openNotificationSettings();
      else toast('请在系统设置中打开通知');
    });

    var wg = $view.querySelector('#btnWidgetGuide');
    if (wg) wg.addEventListener('click', openWidgetGuide);

    var ex = $view.querySelector('#btnExport');
    if (ex) ex.addEventListener('click', doExport);

    var im = $view.querySelector('#btnImport');
    if (im) im.addEventListener('click', doImport);

    var cl = $view.querySelector('#btnClear');
    if (cl) cl.addEventListener('click', function () {
      if (!confirm('确定清空所有日子？此操作不可恢复（建议先导出备份）。')) return;
      state.events = [];
      save(); render(); toast('已清空');
    });
  }

  /* ================= 标签切换 ================= */

  function switchTab(name) {
    tab = name;
    render();
  }

  document.querySelectorAll('.tabbar [data-tab]').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
  });

  /* ================= 底部弹层 ================= */

  var sheetRoot = document.getElementById('sheetRoot');
  var sheetSeq = 0;

  function openSheet(opts) {
    closeSheet();
    var mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = '' +
      '<div class="sheet" role="dialog">' +
        '<div class="sheet-head">' +
          '<h3>' + esc(opts.title || '') + '</h3>' +
          '<button class="sheet-close" data-close="1">✕</button>' +
        '</div>' +
        '<div class="sheet-body">' + (opts.body || '') + '</div>' +
        (opts.footer ? '<div class="sheet-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    sheetRoot.appendChild(mask);
    requestAnimationFrame(function () { mask.classList.add('show'); });
    mask.addEventListener('click', function (ev) {
      if (ev.target === mask) closeSheet();
      if (ev.target.closest && ev.target.closest('[data-close]')) closeSheet();
    });
    if (opts.onMount) opts.onMount(mask);
    return mask;
  }

  function closeSheet() {
    var m = sheetRoot.querySelector('.sheet-mask');
    if (!m) return;
    m.classList.remove('show');
    setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 230);
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ================= 添加 / 编辑事件 ================= */

  function openEventSheet(id, preset) {
    var ev = null;
    if (id) ev = state.events.find(function (x) { return x.id === id; });
    var isNew = !ev;
    if (!ev) {
      ev = {
        id: uid(), title: '', emoji: (preset && preset.emoji) || '⭐',
        category: (preset && preset.category) || 'life',
        calendar: 'solar', date: L.ymd(today()), lunar: null,
        repeat: (preset && preset.repeat) || 'none',
        direction: (preset && preset.direction) || 'since',
        pinned: false, archived: false,
        color: state.settings.accent, notify: true, note: '',
        paused: false
      };
    }

    var base = L.parseYmd(ev.date) || today();
    var years = [];
    for (var y = 1900; y <= today().getFullYear() + 5; y++) years.push(y);
    // 农历默认值优先用事件自带的 lunar；否则按基准公历换算
    var lunarInfo = (ev.lunar && ev.lunar.y) ? {
      y: ev.lunar.y, m: ev.lunar.m, d: ev.lunar.d, leap: !!ev.lunar.leap
    } : (function () {
      var lu = L.lunarOf(base);
      return { y: lu.year, m: Math.abs(lu.month), d: lu.day, leap: lu.month < 0 };
    })();

    var body = '' +
      // 置顶放在最上面：这是最常改、也最容易找不到的开关（旧版埋在滚动区最底部）
      '<div class="set-row pin-row">' +
        '<div><div class="set-label">📌 置顶到首页</div>' +
        '<div class="set-sub" id="pinHint"></div></div>' +
        '<label class="switch"><input type="checkbox" id="evPin"' + (ev.pinned ? ' checked' : '') + ' /><span class="track"></span></label>' +
      '</div>' +

      '<div class="field"><label>名字</label>' +
        '<input class="input" id="evTitle" maxlength="30" placeholder="例如：妈妈的生日、我们在一起、国庆假期" value="' + esc(ev.title) + '" />' +
      '</div>' +

      '<div class="field"><label>图标</label>' +
        '<div class="emoji-grid" id="emojiGrid">' + EMOJIS.map(function (e) {
          return '<button class="emoji-cell' + (e === ev.emoji ? ' on' : '') + '" data-emoji="' + e + '">' + e + '</button>';
        }).join('') + '</div>' +
      '</div>' +

      '<div class="field"><label>分类</label>' +
        '<div class="chips">' + L.CATEGORIES.map(function (c) {
          return '<button class="chip-btn' + (c.id === ev.category ? ' on' : '') + '" data-catpick="' + c.id + '">' + c.emoji + ' ' + c.name + '</button>';
        }).join('') + '</div>' +
      '</div>' +

      '<div class="field"><label>计算方式</label>' +
        '<div class="segmented" id="dirSeg">' +
          '<button data-dir="since" class="' + (ev.direction === 'since' ? 'on' : '') + '">正数 · 已经过去</button>' +
          '<button data-dir="until" class="' + (ev.direction === 'until' ? 'on' : '') + '">倒数 · 还有多久</button>' +
        '</div>' +
        '<div class="hint" id="dirHint"></div>' +
      '</div>' +

      '<div class="field"><label>日期</label>' +
        '<div class="segmented sm" id="calSeg" style="margin-bottom:8px">' +
          '<button data-cal2="solar" class="' + (ev.calendar === 'solar' ? 'on' : '') + '">公历</button>' +
          '<button data-cal2="lunar" class="' + (ev.calendar === 'lunar' ? 'on' : '') + '">农历</button>' +
        '</div>' +
        '<div id="solarDateRow" style="display:' + (ev.calendar === 'lunar' ? 'none' : 'block') + '">' +
          wheelHtml('wSolar', [
            { key: 'y', items: years, value: base.getFullYear(), unit: '年' },
            { key: 'm', items: range(1, 12), value: base.getMonth() + 1, unit: '月' },
            { key: 'd', items: range(1, daysInMonthOf(base.getFullYear(), base.getMonth() + 1)), value: base.getDate(), unit: '日' }
          ]) +
        '</div>' +
        '<div id="lunarDateRow" style="display:' + (ev.calendar === 'lunar' ? 'block' : 'none') + '">' +
          wheelHtml('wLunar', [
            { key: 'y', items: years, value: lunarInfo.y, unit: '年', pad: false },
            { key: 'm', items: lunarMonthItems(), value: lunarInfo.leap ? (lunarInfo.m + 'l') : String(lunarInfo.m) },
            { key: 'd', items: lunarDayItems(), value: String(lunarInfo.d) }
          ]) +
        '</div>' +
        '<div class="hint" id="dateHint"></div>' +
      '</div>' +

      '<div class="field"><label>重复</label>' +
        '<div class="chips" id="repChips">' + ['none', 'year', 'month', 'week', 'day'].map(function (r) {
          return '<button class="chip-btn' + (ev.repeat === r ? ' on' : '') + '" data-rep="' + r + '">' + L.REPEAT_LABEL[r] + '</button>';
        }).join('') + '</div>' +
        '<div class="hint" id="repHint"></div>' +
      '</div>' +

      '<div class="field"><label>备注（可不填）</label>' +
        '<input class="input" id="evNote" maxlength="40" placeholder="例如：喜欢的蛋糕口味" value="' + esc(ev.note || '') + '" />' +
      '</div>' +

      '<div class="field"><label>背景图（可选）</label>' +
        '<div class="cover-pick">' +
          '<div class="cover-thumb' + (ev.cover ? ' has' : '') + '" id="coverThumb"' +
            (ev.cover ? ' style="background-image:url(\'' + ev.cover + '\')"' : '') + '>' +
            (ev.cover ? '' : '<span>＋<br/>选图</span>') +
          '</div>' +
          '<div class="cover-actions">' +
            '<button class="btn sm" id="coverPick">从相册选择</button>' +
            '<button class="btn sm" id="coverClear"' + (ev.cover ? '' : ' disabled') + '>移除背景</button>' +
            '<div class="hint" style="margin-top:6px">会用作首页大卡片和分享卡片的底图</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="set-row" id="msRow" style="display:' + (ev.direction === 'since' ? 'flex' : 'none') + '">' +
        '<div><div class="set-label">显示里程碑倒计时</div>' +
        '<div class="set-sub">自动算出 520 · 999 · 1314 · 周年 等日子</div></div>' +
        '<label class="switch"><input type="checkbox" id="evMs"' + (ev.milestones !== false ? ' checked' : '') + ' /><span class="track"></span></label>' +
      '</div>' +

      '<div class="set-row"><div><div class="set-label">这个日子的提醒</div>' +
        '<div class="set-sub">关闭后不再单独提醒</div></div>' +
        '<label class="switch"><input type="checkbox" id="evNotify"' + (ev.notify ? ' checked' : '') + ' /><span class="track"></span></label>' +
      '</div>' +

      '<div class="btn-row" style="margin-top:14px">' +
        '<button class="btn sm" id="evArchive">' + (ev.archived ? '取消归档' : '归档') + '</button>' +
        (isNew ? '' : '<button class="btn sm" id="evPause">' + (ev.paused ? '继续计时' : '暂停计时') + '</button>') +
      '</div>';

    openSheet({
      title: isNew ? '添加日子' : '编辑日子',
      body: body,
      footer: (isNew ? '' : '<button class="btn danger" id="evDel" style="flex:0 0 auto;padding:12px 16px">删除</button>') +
        '<button class="btn" data-close="1">取消</button>' +
        '<button class="btn primary" id="evSave">保存</button>',
      onMount: function (m) {
        var dir = ev.direction, cal = ev.calendar, rep = ev.repeat;
        var emoji = ev.emoji, cat = ev.category;
        var pinned = ev.pinned, archived = !!ev.archived, paused = !!ev.paused;
        // 记录“这次编辑中是否亲手置顶过”：只有亲手打开开关时才刷新置顶时间戳，
        // 单纯改标题保存不会把顺序顶掉
        var pinTouchedAt = 0;
        var cover = ev.cover || '';
        var msOn = ev.milestones !== false;

        function syncHints() {
          m.querySelector('#dirHint').textContent = dir === 'since'
            ? '显示已经过去了多少天，适合「在一起」「宝宝出生」'
            : '显示距离那天还有多少天，适合「生日」「考试」「假期」';
          var rh = m.querySelector('#repHint');
          if (rep === 'none') rh.textContent = '只算这一次，不重复';
          else if (rep === 'year') rh.textContent = cal === 'lunar' ? '每年按农历同一天重复（自动换算公历）' : '每年同一天重复，适合生日和周年';
          else if (rep === 'month') rh.textContent = '每月同一天重复';
          else if (rep === 'week') rh.textContent = '每周同一天重复';
          else rh.textContent = '每天都重复';
        }

        var solarWheels = {};
        var lunarWheels = {};

        function solarPick() {
          return {
            y: parseInt(solarWheels.y ? solarWheels.y.value() : base.getFullYear(), 10),
            m: parseInt(solarWheels.m ? solarWheels.m.value() : base.getMonth() + 1, 10),
            d: parseInt(solarWheels.d ? solarWheels.d.value() : base.getDate(), 10)
          };
        }

        function lunarPick() {
          var mv = lunarWheels.m ? lunarWheels.m.value() : String(lunarInfo.m);
          return {
            y: parseInt(lunarWheels.y ? lunarWheels.y.value() : lunarInfo.y, 10),
            m: parseInt(mv, 10),
            leap: mv.indexOf('l') > 0,
            d: parseInt(lunarWheels.d ? lunarWheels.d.value() : lunarInfo.d, 10)
          };
        }

        function refreshDateHint() {
          var hint = m.querySelector('#dateHint');
          if (cal === 'solar') {
            var sp = solarPick();
            var dt = new Date(sp.y, sp.m - 1, sp.d, 12);
            var lu = L.lunarOf(dt);
            hint.textContent = L.fmtCN(dt, true) + ' · 农历' + lu.monthCn + '月' + lu.dayCn;
          } else {
            var lp = lunarPick();
            var res = L.lunarToSolar(lp.y, lp.m, lp.d, lp.leap);
            hint.textContent = res
              ? ('对应公历 ' + L.fmtCN(res.date, true) + (res.warn ? ' · 该年无闰月，按平月算' : ''))
              : '这个日期不存在（该年没有这个闰月），请换一个';
          }
        }

        /* 初始化两组滚轮 */
        solarWheels.y = bindWheel(m, 'wSolar-y', function () { syncSolarDays(); });
        solarWheels.m = bindWheel(m, 'wSolar-m', function () { syncSolarDays(); });
        solarWheels.d = bindWheel(m, 'wSolar-d', function () { refreshDateHint(); });

        function syncSolarDays() {
          var sp = solarPick();
          var max = daysInMonthOf(sp.y, sp.m);
          solarWheels.d.setItems(range(1, max), Math.min(sp.d, max));
          refreshDateHint();
        }

        lunarWheels.y = bindWheel(m, 'wLunar-y', function () { refreshDateHint(); });
        lunarWheels.m = bindWheel(m, 'wLunar-m', function () { refreshDateHint(); });
        lunarWheels.d = bindWheel(m, 'wLunar-d', function () { refreshDateHint(); });

        m.querySelector('#emojiGrid').addEventListener('click', function (e) {
          var b = e.target.closest('[data-emoji]');
          if (!b) return;
          emoji = b.getAttribute('data-emoji');
          m.querySelectorAll('[data-emoji]').forEach(function (x) { x.classList.toggle('on', x === b); });
        });

        m.querySelectorAll('[data-catpick]').forEach(function (b) {
          b.addEventListener('click', function () {
            cat = b.getAttribute('data-catpick');
            m.querySelectorAll('[data-catpick]').forEach(function (x) { x.classList.toggle('on', x === b); });
          });
        });

        m.querySelector('#dirSeg').addEventListener('click', function (e) {
          var b = e.target.closest('[data-dir]');
          if (!b) return;
          dir = b.getAttribute('data-dir');
          m.querySelectorAll('[data-dir]').forEach(function (x) { x.classList.toggle('on', x === b); });
          var msRow = m.querySelector('#msRow');
          if (msRow) msRow.style.display = dir === 'since' ? 'flex' : 'none';
          syncHints();
        });

        m.querySelector('#calSeg').addEventListener('click', function (e) {
          var b = e.target.closest('[data-cal2]');
          if (!b) return;
          cal = b.getAttribute('data-cal2');
          m.querySelectorAll('[data-cal2]').forEach(function (x) { x.classList.toggle('on', x === b); });
          m.querySelector('#solarDateRow').style.display = cal === 'solar' ? 'block' : 'none';
          m.querySelector('#lunarDateRow').style.display = cal === 'lunar' ? 'block' : 'none';
          setTimeout(function () {
            if (cal === 'lunar' && lunarWheels.y) {
              lunarWheels.y.reset(lunarInfo.y);
              lunarWheels.m.reset(lunarInfo.leap ? (lunarInfo.m + 'l') : String(lunarInfo.m));
              lunarWheels.d.reset(String(lunarInfo.d));
            } else if (cal === 'solar' && solarWheels.y) {
              solarWheels.y.reset('');
            }
            refreshDateHint();
          }, 60);
          syncHints();
        });


        m.querySelector('#repChips').addEventListener('click', function (e) {
          var b = e.target.closest('[data-rep]');
          if (!b) return;
          rep = b.getAttribute('data-rep');
          m.querySelectorAll('[data-rep]').forEach(function (x) { x.classList.toggle('on', x === b); });
          syncHints();
        });

        function applyCover() {
          var thumb = m.querySelector('#coverThumb');
          var clearBtn = m.querySelector('#coverClear');
          if (cover) {
            thumb.classList.add('has');
            thumb.style.backgroundImage = 'url(' + cover + ')';
            thumb.innerHTML = '';
            clearBtn.removeAttribute('disabled');
          } else {
            thumb.classList.remove('has');
            thumb.style.backgroundImage = '';
            thumb.innerHTML = '<span>＋<br/>选图</span>';
            clearBtn.setAttribute('disabled', 'disabled');
          }
        }

        m.querySelector('#coverPick').addEventListener('click', function () {
          if (Bridge && Bridge.pickImage) {
            window.__pendingCoverApply = function (dataUrl) {
              cover = dataUrl || '';
              applyCover();
              toast('背景已更新，保存后生效');
            };
            try { Bridge.pickImage(); } catch (e) { toast('无法打开相册'); }
          } else {
            toast('请在手机上选择图片');
          }
        });

        m.querySelector('#coverClear').addEventListener('click', function () {
          cover = '';
          applyCover();
        });

        function paintPin() {
          var hint = m.querySelector('#pinHint');
          if (!hint) return;
          if (!pinned) {
            hint.textContent = '打开后排在首页最前面，并成为首页大卡片与桌面小组件显示的那一个';
          } else {
            var others = state.events.filter(function (x) {
              return x.pinned && !x.archived && x.id !== ev.id;
            }).length;
            hint.textContent = others
              ? '已有 ' + others + ' 个置顶；保存后这条排第一（最近置顶优先），其余在「其他置顶」'
              : '保存后它会成为首页大卡片与桌面小组件显示的那一个';
          }
        }

        m.querySelector('#evPin').addEventListener('change', function (e) {
          pinned = e.target.checked;
          // 打开开关 → 记下“刚刚置顶”的时间；关掉 → 清空，重新打开会拿到新时间
          pinTouchedAt = pinned ? Date.now() : 0;
          paintPin();
        });
        paintPin();
        m.querySelector('#evArchive').addEventListener('click', function (e) {
          archived = !archived;
          e.currentTarget.textContent = archived ? '取消归档' : '归档';
        });
        var pb = m.querySelector('#evPause');
        if (pb) pb.addEventListener('click', function (e) {
          paused = !paused;
          e.currentTarget.textContent = paused ? '继续计时' : '暂停计时';
        });

        syncHints(); refreshDateHint();

        m.querySelector('#evSave').addEventListener('click', function () {
          var title = m.querySelector('#evTitle').value.trim();
          if (!title) { toast('给这个日子起个名字吧'); return; }
          var dateStr, lunar = null;
          if (cal === 'solar') {
            var sp = solarPick();
            var dt = new Date(sp.y, sp.m - 1, sp.d, 12);
            dateStr = L.ymd(dt);
            var lu = L.lunarOf(dt);
            lunar = { y: lu.year, m: Math.abs(lu.month), d: lu.day, leap: lu.month < 0 };
          } else {
            var lp = lunarPick();
            var conv = L.lunarToSolar(lp.y, lp.m, lp.d, lp.leap);
            if (!conv) { toast('农历日期无法转换，请换一个'); return; }
            dateStr = L.ymd(conv.date);
            lunar = { y: lp.y, m: lp.m, d: lp.d, leap: lp.leap };
          }

          var rec = {
            id: ev.id, title: title, emoji: emoji, category: cat,
            calendar: cal, date: dateStr, lunar: lunar,
            repeat: rep, direction: dir, pinned: pinned, archived: archived,
            // 置顶时间戳规则：
            //   · 这次亲手打开了开关 → 用刚才的时间（保证排到第一）
            //   · 原本就是置顶、且没动开关 → 保留原时间戳（只改标题不会打乱顺序）
            //   · 取消置顶 → 清零
            pinnedAt: pinned ? (pinTouchedAt || ev.pinnedAt || Date.now()) : 0,
            color: ev.color || state.settings.accent,
            notify: m.querySelector('#evNotify').checked,
            note: m.querySelector('#evNote').value.trim(),
            paused: paused,
            pausedAt: paused ? (ev.pausedAt || L.ymd(today())) : null,
            birth: ev.birth || false,
            milestones: (function(){ var el = m.querySelector('#evMs'); return el ? el.checked : msOn; })(),
            cover: cover
          };

          var idx = -1;
          for (var i = 0; i < state.events.length; i++) if (state.events[i].id === rec.id) idx = i;
          if (idx >= 0) state.events[idx] = rec; else state.events.push(rec);
          save(); closeSheet(); render(); pushWidget();
          var s2 = null;
          try { s2 = L.evalEvent(rec, today()); } catch (e) {}
          toast(s2 ? ('已保存 · ' + L.eventHeadline(rec, s2)) : '已保存');
        });

        var del = m.querySelector('#evDel');
        if (del) del.addEventListener('click', function () {
          if (!confirm('删除「' + ev.title + '」？')) return;
          state.events = state.events.filter(function (x) { return x.id !== ev.id; });
          save(); closeSheet(); render(); toast('已删除');
        });
      }
    });
  }

  /* ================= 滚轮日期选择器 ================= */

  function range(a, b) {
    var out = [];
    for (var i = a; i <= b; i++) out.push(i);
    return out;
  }

  function daysInMonthOf(y, m) { return new Date(y, m, 0).getDate(); }

  function lunarMonthItems() {
    var out = [];
    for (var i = 1; i <= 12; i++) {
      out.push({ v: String(i), t: lunarNum(i) + '月' });
      out.push({ v: i + 'l', t: '闰' + lunarNum(i) + '月' });
    }
    return out;
  }

  function lunarDayItems() {
    var out = [];
    for (var i = 1; i <= 30; i++) out.push({ v: String(i), t: lunarDayNum(i) });
    return out;
  }

  /** 生成一组滚轮的 HTML；items 可为数字或 {v,t} */
  function wheelHtml(prefix, cols) {
    return '<div class="wheel-row">' + cols.map(function (c) {
      var id = prefix + '-' + c.key;
      var items = c.items.map(function (it) {
        var v = (it && it.v !== undefined) ? it.v : it;
        var t = (it && it.t !== undefined) ? it.t : (c.unit ? it + c.unit : it);
        var sel = String(v) === String(c.value) ? ' data-sel="1"' : '';
        return '<div class="wheel-item" data-v="' + esc(v) + '"' + sel + '>' + esc(t) + '</div>';
      }).join('');
      return '<div class="wheel" id="' + id + '"><div class="wheel-list">' + items + '</div></div>';
    }).join('') + '</div>';
  }

  /** 绑定滚轮：滚动停止后吸附 + 回调 */
  function bindWheel(root, id, onChange) {
    var el = root.querySelector('#' + id);
    if (!el) return null;
    var list = el.querySelector('.wheel-list');
    var H = 40; // 单行高度，与 CSS 保持一致
    var timer = null;
    var api = {
      el: el,
      value: function () {
        var idx = Math.round(el.scrollTop / H);
        var items = list.children;
        if (idx < 0) idx = 0;
        if (idx >= items.length) idx = items.length - 1;
        return items[idx] ? items[idx].getAttribute('data-v') : null;
      },
      setItems: function (arr, keepValue) {
        var old = keepValue;
        var cur = old !== undefined ? old : api.value();
        list.innerHTML = arr.map(function (it) {
          var v = (it && it.v !== undefined) ? it.v : it;
          var t = (it && it.t !== undefined) ? it.t : it;
          return '<div class="wheel-item" data-v="' + esc(v) + '">' + esc(t) + '</div>';
        }).join('');
        var target = 0;
        for (var i = 0; i < list.children.length; i++) {
          if (list.children[i].getAttribute('data-v') === String(cur)) { target = i; break; }
        }
        el.scrollTop = target * H;
        markItems();
      },
      setIndex: function (i) {
        el.scrollTop = i * H;
        markItems();
      },
      /** 元素从 display:none 变可见后，重新定位到当前应选中的项 */
      reset: function (wanted) {
        var target = wanted !== undefined ? String(wanted) : null;
        var idx = -1;
        var items = list.children;
        for (var i = 0; i < items.length; i++) {
          var v = items[i].getAttribute('data-v');
          if (target !== null ? v === target : items[i].getAttribute('data-sel') === '1') { idx = i; break; }
        }
        if (idx < 0) idx = 0;
        el.scrollTop = idx * H;
        markItems();
      }
    };

    function markItems() {
      var idx = Math.round(el.scrollTop / H);
      for (var i = 0; i < list.children.length; i++) {
        list.children[i].classList.toggle('on', i === idx);
      }
    }

    el.addEventListener('scroll', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var idx = Math.round(el.scrollTop / H);
        el.scrollTo({ top: idx * H, behavior: 'smooth' });
        markItems();
        if (onChange) onChange(api.value());
      }, 90);
    }, { passive: true });

    // 点击某一项也能选中
    el.addEventListener('click', function (e) {
      var it = e.target.closest('.wheel-item');
      if (!it) return;
      var idx = Array.prototype.indexOf.call(list.children, it);
      el.scrollTo({ top: idx * H, behavior: 'smooth' });
      markItems();
      if (onChange) setTimeout(function () { onChange(api.value()); }, 260);
    });

    // 初始化到当前选中项
    setTimeout(function () {
      var sel = list.querySelector('[data-sel="1"]');
      if (sel) {
        var idx = Array.prototype.indexOf.call(list.children, sel);
        el.scrollTop = idx * H;
      }
      markItems();
    }, 0);

    return api;
  }

  function monthsOptions(sel) {
    var out = '';
    for (var i = 1; i <= 12; i++) out += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + i + ' 月</option>';
    return out;
  }
  function daysOptions(sel) {
    var out = '';
    for (var i = 1; i <= 31; i++) out += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + i + ' 日</option>';
    return out;
  }
  function lunarNum(n) {
    var cn = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    return cn[n] || n;
  }
  function lunarDayNum(n) {
    var cn = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
      '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
      '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
    return cn[n] || n;
  }
  function lunarMonthsOptions(sel, isLeap) {
    var out = '';
    for (var i = 1; i <= 12; i++) {
      out += '<option value="' + i + '"' + (i === sel && !isLeap ? ' selected' : '') + '>' + lunarNum(i) + '月</option>';
      out += '<option value="' + i + 'l"' + (i === sel && isLeap ? ' selected' : '') + '>闰' + lunarNum(i) + '月</option>';
    }
    return out;
  }
  function lunarDaysOptions(sel) {
    var out = '';
    for (var i = 1; i <= 30; i++) out += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + lunarDayNum(i) + '</option>';
    return out;
  }

  /* ================= 分享卡片 ================= */

  function openShareSheet(id) {
    var ev = state.events.find(function (x) { return x.id === id; });
    if (!ev) return;
    var st = null;
    try { st = L.evalEvent(ev, today()); } catch (e) {}

    openSheet({
      title: '分享卡片',
      body: '<div class="share-preview"><canvas id="shareCanvas"></canvas></div>' +
        '<div class="hint" style="text-align:center">生成图片后可保存到相册，发给 TA 或朋友圈</div>',
      footer: '<button class="btn" data-close="1">取消</button>' +
        '<button class="btn primary" id="shareSave">保存图片</button>',
      onMount: function (m) {
        var canvas = m.querySelector('#shareCanvas');
        drawShareCard(canvas, ev, st);
        m.querySelector('#shareSave').addEventListener('click', function () {
          var dataUrl = canvas.toDataURL('image/png');
          if (Bridge && Bridge.saveImage) {
            try { Bridge.saveImage(dataUrl, 'xiaorizi-' + Date.now() + '.png'); toast('已保存到相册'); return; } catch (e) {}
          }
          try {
            var a = document.createElement('a');
            a.href = dataUrl; a.download = 'xiaorizi.png'; a.click();
            toast('已导出图片');
          } catch (e) { toast('保存失败'); }
        });
      }
    });
  }

  function drawShareCard(canvas, ev, st) {
    var W = 1080, H = 1440;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var acc = accentOf(ev);

    if (ev.cover) {
      // 有背景图：铺满 + 半透明遮罩，文字用白色
      var img = new Image();
      img.onload = function () { drawCoverCard(ctx, img, ev, st, W, H, acc); };
      img.onerror = function () { drawGradientCard(ctx, ev, st, W, H, acc); };
      img.src = ev.cover;
      return;
    }
    drawGradientCard(ctx, ev, st, W, H, acc);
  }

  /** 纯色渐变版卡片（原样式） */
  function drawGradientCard(ctx, ev, st, W, H, acc) {
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#fff8f3');
    g.addColorStop(0.55, '#ffeef0');
    g.addColorStop(1, '#f2f7ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.16;
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.arc(W - 90, 120, 220, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(60, H - 140, 180, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    roundRect(ctx, 70, 110, W - 140, H - 260, 56);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 3; ctx.stroke();

    ctx.textAlign = 'center';

    ctx.font = '110px "Apple Color Emoji","Noto Color Emoji",sans-serif';
    ctx.fillText(ev.emoji || '⭐', W / 2, 320);

    ctx.fillStyle = '#2b2724';
    ctx.font = 'bold 56px -apple-system,"PingFang SC","Noto Sans SC",sans-serif';
    ctx.fillText(fitText(ctx, ev.title, W - 220), W / 2, 420);

    var big = st ? st.days : 0;
    var label = st ? (ev.direction === 'until'
      ? (big === 0 ? '就是今天' : '还有')
      : (big === 0 ? '从今天开始' : '已经')) : '';
    ctx.fillStyle = '#8a7a72';
    ctx.font = '40px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText(label, W / 2, 520);

    ctx.fillStyle = acc;
    ctx.font = 'bold 230px -apple-system,"DIN Alternate","PingFang SC",sans-serif';
    ctx.fillText(String(big), W / 2, 760);

    ctx.fillStyle = '#8a7a72';
    ctx.font = '44px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText('天', W / 2, 840);

    ctx.fillStyle = '#6f6560';
    ctx.font = '38px -apple-system,"PingFang SC",sans-serif';
    var dateLine = (ev.direction === 'until' && st)
      ? L.fmtCN(st.date, true)
      : L.fmtCN(L.parseYmd(ev.date), true) + ' 起';
    ctx.fillText(dateLine, W / 2, 940);

    if (ev.direction === 'since' && st) {
      ctx.fillStyle = '#a89d96';
      ctx.font = '34px -apple-system,"PingFang SC",sans-serif';
      ctx.fillText('已走过 ' + L.calendarDiffText(ev.date, today()), W / 2, 1000);
    }

    ctx.fillStyle = acc;
    ctx.globalAlpha = 0.9;
    drawHeart(ctx, W / 2, H - 258, 20);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#bdb2aa';
    ctx.font = '30px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText('小日子 · 记录每一个重要的日子', W / 2, H - 170);
  }

  /** 背景图版卡片 */
  function drawCoverCard(ctx, img, ev, st, W, H, acc) {
    // 等比裁切铺满
    var scale = Math.max(W / img.width, H / img.height);
    var dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

    // 上浅下深遮罩，保证文字可读
    var mask = ctx.createLinearGradient(0, 0, 0, H);
    mask.addColorStop(0, 'rgba(18,12,8,0.28)');
    mask.addColorStop(0.45, 'rgba(18,12,8,0.42)');
    mask.addColorStop(1, 'rgba(18,12,8,0.72)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18;

    ctx.font = '110px "Apple Color Emoji","Noto Color Emoji",sans-serif';
    ctx.fillText(ev.emoji || '⭐', W / 2, 330);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px -apple-system,"PingFang SC","Noto Sans SC",sans-serif';
    ctx.fillText(fitText(ctx, ev.title, W - 220), W / 2, 436);

    var big = st ? st.days : 0;
    var label = st ? (ev.direction === 'until'
      ? (big === 0 ? '就是今天' : '还有') : (big === 0 ? '从今天开始' : '已经')) : '';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '40px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText(label, W / 2, 540);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 230px -apple-system,"DIN Alternate","PingFang SC",sans-serif';
    ctx.fillText(String(big), W / 2, 790);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '44px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText('天', W / 2, 872);

    var dateLine = (ev.direction === 'until' && st)
      ? L.fmtCN(st.date, true)
      : L.fmtCN(L.parseYmd(ev.date), true) + ' 起';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '38px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText(dateLine, W / 2, 980);

    if (ev.direction === 'since' && st) {
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '34px -apple-system,"PingFang SC",sans-serif';
      ctx.fillText('已走过 ' + L.calendarDiffText(ev.date, today()), W / 2, 1042);
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '30px -apple-system,"PingFang SC",sans-serif';
    ctx.fillText('小日子 · 记录每一个重要的日子', W / 2, H - 120);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawHeart(ctx, cx, cy, size) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + size * 0.75);
    ctx.bezierCurveTo(cx - size * 1.4, cy - size * 0.4, cx - size * 0.45, cy - size * 1.25, cx, cy - size * 0.35);
    ctx.bezierCurveTo(cx + size * 0.45, cy - size * 1.25, cx + size * 1.4, cy - size * 0.4, cx, cy + size * 0.75);
    ctx.fill();
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return t + '…';
  }

  /* ================= 备份与恢复 ================= */

  function backupPayload() {
    return JSON.stringify({ app: 'xiaorizi', version: 2, exportedAt: new Date().toISOString(), data: state }, null, 2);
  }

  function doExport() {
    var name = 'xiaorizi-backup-' + L.ymd(today()) + '.json';
    var text = backupPayload();
    if (Bridge && Bridge.exportBackup) {
      try { Bridge.exportBackup(name, text); toast('选择保存位置即可'); return; } catch (e) {}
    }
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 800);
    } catch (e) { toast('导出失败'); }
  }

  function doImport() {
    if (Bridge && Bridge.pickBackup) {
      try { Bridge.pickBackup(); return; } catch (e) {}
    }
    fallbackImport();
  }

  function fallbackImport() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { importFromString(String(r.result)); };
      r.readAsText(f);
    });
    input.click();
  }

  function importFromString(text) {
    if (!text) { toast('没有读到内容'); return; }
    try {
      var obj = JSON.parse(text);
      if (!confirm('导入会覆盖当前数据，确定继续？')) return;
      var payload = (obj.data && Array.isArray(obj.data.events)) ? obj.data
        : (Array.isArray(obj.events) ? obj : null);
      if (!payload) { toast('这不是小日子的备份文件'); return; }
      state = normalize(payload);
      state.seenSetup = true;
      save(); render(); toast('备份已导入');
    } catch (e) { toast('文件格式不正确'); }
  }

  function openWidgetGuide() {
    openSheet({
      title: '添加桌面小组件',
      body: '' +
        '<ol class="guide">' +
          '<li>回到手机桌面，<b>长按空白处</b></li>' +
          '<li>点底部「<b>小组件</b>」或「添加工具」</li>' +
          '<li>在列表里找到「<b>小日子</b>」</li>' +
          '<li>选择 2×2 或 4×2 尺寸，拖到桌面</li>' +
        '</ol>' +
        '<div class="notice" style="margin-top:12px">小组件会自动显示置顶/最近的日子。在 App 内修改后，回到桌面等几秒或下拉刷新就会更新。</div>' +
        '<div class="hint">找不到小组件时：确认是系统自带桌面（vivo 的「华容网格」类桌面可能不显示第三方小组件），并允许自启动。</div>',
      footer: '<button class="btn primary" data-close="1">知道了</button>'
    });
  }

  /* ================= 启动 ================= */

  function boot() {
    state = load();
    applyTheme();
    render();

    if (!state.seenSetup && !state.events.length) {
      setTimeout(function () {
        openSheet({
          title: '👋 欢迎使用小日子',
          body: '<div class="hero-setup">' +
            '<div class="big">🎂❤️⏳</div>' +
            '<h2>记下重要的日子</h2>' +
            '<p>生日、恋爱纪念日、假期、考试……<br/>所有你在乎的日子，都帮你数着。</p>' +
            '<button class="btn primary" id="welcomeStart">添加第一个日子</button>' +
            '</div>',
          onMount: function (m) {
            m.querySelector('#welcomeStart').addEventListener('click', function () {
              state.seenSetup = true; save(); closeSheet();
              setTimeout(function () { openEventSheet(null); }, 240);
            });
          }
        });
      }, 420);
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { render(); pushWidget(); }
    });

    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', function () { if (state.settings.theme === 'auto') render(); });
    }

    setTimeout(function () { syncNotifications(); pushWidget(); }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 给原生层调用 */
  window.xrzRender = render;
  window.xrzSyncNotifications = syncNotifications;
  window.xrzImportFromString = importFromString;
  window.xrzOnImagePicked = function (dataUrl) {
    if (typeof window.__pendingCoverApply === 'function') {
      try { window.__pendingCoverApply(dataUrl); } catch (e) {}
    }
  };
  window.xrzPushWidget = pushWidget;
  window.xrzBack = function () {
    if (sheetRoot.querySelector('.sheet-mask')) { closeSheet(); return true; }
    if (tab !== 'home') { switchTab('home'); return true; }
    var v = document.querySelector('.view');
    if (v && v.scrollTop > 8) { v.scrollTop = 0; return true; }
    return false;
  };
})();
