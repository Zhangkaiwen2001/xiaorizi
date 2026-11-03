/*!
 * 小日子 · 核心日期逻辑（纯函数，不依赖 DOM）
 * 农历换算基于 lunar-javascript (MIT, 6tail)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.XRZLogic = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY_MS = 86400000;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /* ---------- 基础日期 ---------- */

  function parseYmd(s) {
    var p = String(s || '').split('-');
    var y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  function ymd(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function dayNumber(d) {
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  }

  /** b - a 的整天数（只看年月日） */
  function diffDays(a, b) { return dayNumber(b) - dayNumber(a); }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0, 0);
  }

  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

  function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  var WEEK_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  function fmtCN(d, withWeek) {
    var s = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return withWeek ? s + ' · ' + WEEK_CN[d.getDay()] : s;
  }

  function fmtMd(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }

  /* ---------- 农历 ---------- */

  function lib() {
    if (typeof globalThis.Solar === 'undefined' || typeof globalThis.Lunar === 'undefined') {
      throw new Error('农历库未加载');
    }
    return { Solar: globalThis.Solar, Lunar: globalThis.Lunar, LunarMonth: globalThis.LunarMonth };
  }

  /** 公历 Date -> 农历信息 */
  function lunarOf(d) {
    var L = lib();
    var solar = L.Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
    var lunar = solar.getLunar();
    return {
      year: lunar.getYear(),
      month: lunar.getMonth(),
      day: lunar.getDay(),
      monthCn: lunar.getMonthInChinese(),
      dayCn: lunar.getDayInChinese(),
      text: '农历' + lunar.getMonthInChinese() + '月' + lunar.getDayInChinese(),
      ganzhi: lunar.getYearInGanZhi ? lunar.getYearInGanZhi() + '年' : '',
      zodiac: lunar.getYearShengXiao ? lunar.getYearShengXiao() : '',
      jieqi: (lunar.getJieQi && lunar.getJieQi()) || '',
      festivals: (lunar.getFestivals && lunar.getFestivals()) || []
    };
  }

  /** 农历 -> 公历 Date，闰月不存在时回退平月，日期超出时回退当月最后一天 */
  function lunarToSolar(y, m, d, isLeap) {
    var L = lib();
    var warn = '';
    var month = isLeap ? -m : m;
    var lm = L.LunarMonth.fromYm(y, month);
    if (!lm) {
      if (isLeap) { month = m; lm = L.LunarMonth.fromYm(y, month); warn = 'noLeap'; }
      if (!lm) return null;
    }
    var day = d;
    if (lm.getDayCount() < day) { day = lm.getDayCount(); warn = 'shortMonth'; }
    var s;
    try {
      s = L.Lunar.fromYmd(y, month, day).getSolar();
    } catch (e) {
      var lm2 = L.LunarMonth.fromYm(y, m);
      if (!lm2) return null;
      var day2 = Math.min(d, lm2.getDayCount());
      s = L.Lunar.fromYmd(y, m, day2).getSolar();
      warn = warn || 'noLeap';
    }
    return { date: new Date(s.getYear(), s.getMonth() - 1, s.getDay(), 12, 0, 0, 0), warn: warn };
  }

  /** 公历日期的星座 */
  function constellation(d) {
    var L = lib();
    return L.Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()).getXingZuo() + '座';
  }

  /* ---------- 下一个生日 ---------- */

  /**
   * @param person {calendar:'solar'|'lunar', date:'YYYY-MM-DD', lunar:{y,m,d,leap}}
   * @param today  Date
   * @returns null | {date, days, age, yearsKnown, calendar, lunarText, note, isToday}
   */
  function nextBirthday(person, today) {
    if (!person) return null;
    today = today || new Date();
    var t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);

    if (person.calendar === 'lunar' && person.lunar && person.lunar.m) {
      var lb = person.lunar;
      var startLunarYear = lunarOf(t).year;
      for (var ly = startLunarYear - 1; ly <= startLunarYear + 2; ly++) {
        var conv = lunarToSolar(ly, lb.m, lb.d, !!lb.leap);
        if (!conv) continue;
        var dd = diffDays(t, conv.date);
        if (dd >= 0) {
          var note = '';
          if (conv.warn === 'noLeap') note = '今年没有闰' + lb.m + '月，按平月算';
          else if (conv.warn === 'shortMonth') note = '今年该月只有 ' + (lb.d - 1) + ' 天，按月底算';
          var lu = lunarOf(conv.date);
          return {
            date: conv.date,
            days: dd,
            age: ly - lb.y,
            lunarYear: ly,
            calendar: 'lunar',
            lunarText: '农历' + (lb.leap ? '闰' : '') + lu.monthCn + '月' + lu.dayCn,
            solarText: fmtCN(conv.date),
            note: note,
            isToday: dd === 0
          };
        }
      }
      return null;
    }

    var birth = parseYmd(person.date);
    if (!birth) return null;
    var bm = birth.getMonth() + 1, bd = birth.getDate();
    for (var y = t.getFullYear() - 1; y <= t.getFullYear() + 2; y++) {
      var mm = bm, dnum = bd, adj = '';
      if (bm === 2 && bd === 29 && !isLeapYear(y)) { dnum = 28; adj = '今年不是闰年，按 2 月 28 日算'; }
      var cand = new Date(y, mm - 1, Math.min(dnum, daysInMonth(y, mm)), 12, 0, 0, 0);
      var ddays = diffDays(t, cand);
      if (ddays >= 0) {
        var lu = lunarOf(cand);
        return {
          date: cand,
          days: ddays,
          age: y - birth.getFullYear(),
          lunarYear: lu.year,
          calendar: 'solar',
          lunarText: '农历' + lu.monthCn + '月' + lu.dayCn,
          solarText: fmtCN(cand),
          note: adj,
          isToday: ddays === 0
        };
      }
    }
    return null;
  }

  /* ---------- 在一起 ---------- */

  /** 在一起的第 N 天（开始那天算第 1 天） */
  function togetherDays(start, today) {
    var s = parseYmd(start);
    if (!s) return null;
    today = today || new Date();
    var t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
    return diffDays(s, t) + 1;
  }

  /** 日历口径的年月日差 */
  function calendarDiff(start, today) {
    var s = parseYmd(start);
    if (!s) return null;
    today = today || new Date();
    var y = today.getFullYear() - s.getFullYear();
    var m = today.getMonth() - s.getMonth();
    var d = today.getDate() - s.getDate();
    if (d < 0) {
      m -= 1;
      var prev = new Date(today.getFullYear(), today.getMonth(), 0);
      d += prev.getDate();
    }
    if (m < 0) { y -= 1; m += 12; }
    if (y < 0) return { years: 0, months: 0, days: 0, negative: true };
    return { years: y, months: m, days: d };
  }

  function calendarDiffText(start, today) {
    var c = calendarDiff(start, today);
    if (!c) return '';
    var parts = [];
    if (c.years) parts.push(c.years + ' 年');
    if (c.months) parts.push(c.months + ' 个月');
    if (c.days || parts.length === 0) parts.push(c.days + ' 天');
    return parts.join(' ');
  }

  /** 加年份，2 月 29 日回退到 2 月 28 日 */
  function addYears(d, n) {
    var y = d.getFullYear() + n, m = d.getMonth() + 1, dd = d.getDate();
    if (m === 2 && dd === 29 && !isLeapYear(y)) dd = 28;
    return new Date(y, m - 1, dd, 12, 0, 0, 0);
  }

  /** 加月份，日期超出则回退到该月最后一天 */
  function addMonths(d, n) {
    var y = d.getFullYear(), m = d.getMonth() + n, day = d.getDate();
    var last = daysInMonth(y, m + 1);
    return new Date(y, m, Math.min(day, last), 12, 0, 0, 0);
  }

  /** 加周 */
  function addWeeks(d, n) { return addDays(d, n * 7); }

  /** 两个日期是否同年同月同日 */
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // 恋爱纪念日里大家最爱过的那些“天数”，按从小到大排
  var DAY_MILESTONES = [
    100, 200, 300, 365, 400, 500, 520, 600, 666, 700, 777, 800, 888, 900,
    999, 1000, 1024, 1100, 1200, 1314, 1400, 1500, 1600, 1700, 1800, 1900,
    2000, 2020, 2222, 2500, 3000, 3344, 3650, 4000, 4444, 5000, 5200, 6000,
    6666, 7000, 7777, 8000, 8888, 9000, 9999, 10000, 11111, 13140
  ];

  // 每个里程碑配一句彩蛋说明（只在少数“有含义”的日子显示）
  var MILESTONE_NOTES = {
    520: '我爱你',
    999: '长长久久',
    1314: '一生一世',
    3344: '生生世世',
    4444: '岁岁年年',
    5200: '我爱你很久了',
    9999: '天长地久',
    10000: '一万天',
    13140: '一生一世很久了'
  };

  /** 从今天起还没到的纪念日（含天数和周年），按时间排序 */
  function upcomingMilestones(start, today, limit) {
    var s = parseYmd(start);
    if (!s) return [];
    today = today || new Date();
    var t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
    var list = [];
    for (var i = 0; i < DAY_MILESTONES.length; i++) {
      var n = DAY_MILESTONES[i];
      var date = addDays(s, n - 1);
      var left = diffDays(t, date);
      if (left >= 0) {
        list.push({ kind: 'day', n: n, date: date, daysLeft: left, label: '第 ' + n + ' 天', short: n + ' 天' });
      }
    }
    for (var y = 1; y <= 60; y++) {
      var ydate = addYears(s, y);
      var yleft = diffDays(t, ydate);
      if (yleft >= 0) {
        list.push({ kind: 'year', n: y, date: ydate, daysLeft: yleft, label: y + ' 周年', short: y + ' 周年' });
      }
    }
    list.sort(function (a, b) { return a.daysLeft - b.daysLeft || (a.kind === 'day' ? -1 : 1); });
    return limit ? list.slice(0, limit) : list;
  }

  /**
   * 恋爱纪念日专用的“里程碑倒计时”
   * @param startYmd 起始日（在一起那天）
   * @param today    Date
   * @param limit    最多返回几条
   * @returns [{kind:'day'|'year', n, date, daysLeft, label, note}]
   */
  function loveMilestones(startYmd, today, limit) {
    var s = parseYmd(startYmd);
    if (!s) return [];
    today = today || new Date();
    var t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
    var list = [];

    for (var i = 0; i < DAY_MILESTONES.length; i++) {
      var n = DAY_MILESTONES[i];
      var date = addDays(s, n - 1);          // 第 n 天 = 起始日 + (n-1)
      var left = diffDays(t, date);
      if (left < 0) continue;                 // 只保留还没到的
      list.push({
        kind: 'day',
        n: n,
        date: date,
        daysLeft: left,
        label: '第 ' + n + ' 天',
        short: n + ' 天',
        note: MILESTONE_NOTES[n] || ''
      });
    }

    for (var y = 1; y <= 100; y++) {
      var ydate = addYears(s, y);
      var yleft = diffDays(t, ydate);
      if (yleft < 0) continue;
      list.push({
        kind: 'year',
        n: y,
        date: ydate,
        daysLeft: yleft,
        label: y + ' 周年',
        short: y + ' 周年',
        note: ''
      });
    }

    list.sort(function (a, b) {
      return a.daysLeft - b.daysLeft || (a.kind === 'day' ? -1 : 1);
    });
    return limit ? list.slice(0, limit) : list;
  }

  /* ---------- 提醒计划 ---------- */

  /** 生成未来 horizon 天内需要本地通知的条目 */
  function buildPlan(data, now, horizonDays) {
    now = now || new Date();
    horizonDays = horizonDays || 120;
    var t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    var st = data.settings || {};
    var offsets = (st.offsets && st.offsets.length ? st.offsets : [0]);
    var hm = (st.time || '09:00').split(':');
    var hour = parseInt(hm[0], 10) || 9, minute = parseInt(hm[1], 10) || 0;
    var items = [];

    function push(key, date, title, body) {
      var d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
      if (d.getTime() <= now.getTime()) return;
      if (diffDays(t, d) > horizonDays) return;
      items.push({ id: hash(key), at: d.getTime(), title: title, body: body });
    }

    var people = data.people || [];
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      if (p.notify === false) continue;
      var nb = nextBirthday(p, t);
      if (!nb) continue;
      for (var j = 0; j < offsets.length; j++) {
        var off = offsets[j];
        if (nb.days < off) continue;
        var when = addDays(nb.date, -off);
        var title, body;
        if (off === 0) {
          title = '🎂 今天是' + p.name + '的生日';
          body = (p.relation ? '你的' + p.relation + ' · ' : '') + '今年 ' + nb.age + ' 岁，记得送上祝福';
        } else {
          title = '⏰ 还有 ' + off + ' 天是' + p.name + '的生日';
          body = fmtMd(nb.date) + ' · 今年 ' + nb.age + ' 岁，可以提前准备礼物啦';
        }
        push('bd-' + p.id + '-' + off + '-' + ymd(nb.date), when, title, body);
      }
    }

    var start = data.couple && data.couple.start;
    if (start) {
      var ms = upcomingMilestones(start, t, 8);
      for (var k = 0; k < ms.length; k++) {
        var m = ms[k];
        if (m.daysLeft > horizonDays) continue;
        for (var o = 0; o < offsets.length; o++) {
          var off2 = offsets[o];
          if (m.daysLeft < off2) continue;
          var when2 = addDays(m.date, -off2);
          var title2, body2;
          if (off2 === 0) {
            title2 = '❤️ 今天是你们在一起' + (m.kind === 'year' ? '的' : '的第 ') + m.n + (m.kind === 'year' ? ' 周年' : ' 天') + '纪念日';
            body2 = m.kind === 'year' ? ('在一起已经 ' + m.n + ' 年啦，记得一起庆祝') : ('已经 ' + m.n + ' 天啦，记得一起庆祝');
          } else {
            title2 = '❤️ 还有 ' + off2 + ' 天是你们的' + m.label + '纪念日';
            body2 = fmtMd(m.date) + ' · 别忘了准备惊喜';
          }
          push('ms-' + m.kind + '-' + m.n + '-' + off2, when2, title2, body2);
        }
      }
    }

    items.sort(function (a, b) { return a.at - b.at; });
    return items.slice(0, 60);
  }

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return Math.abs(h) % 2000000 + 1000;
  }

  /* ---------- 展示辅助 ---------- */

  function countdownText(days) {
    if (days === 0) return '今天';
    if (days === 1) return '明天';
    if (days === 2) return '后天';
    return days + ' 天后';
  }

  /* ---------- 通用事件引擎 ---------- */

  /**
   * 事件模型
   * {
   *   id, title, emoji, category,            // 名称 / 图标 / 分类
   *   calendar: 'solar' | 'lunar',           // 历法
   *   date: 'YYYY-MM-DD',                    // 公历基准日（农历事件存换算后的公历）
   *   lunar: {y,m,d,leap} | null,            // 农历原始信息
   *   repeat: 'none'|'year'|'month'|'week'|'day',  // 重复周期
   *   direction: 'since' | 'until',          // 正数（已过去）或倒数（还有多久）
   *   pinned: bool, archived: bool,
   *   color: string,                          // 强调色
   *   paused: bool, pausedAt: 'YYYY-MM-DD',   // 暂停计时
   *   notify: bool, note: ''
   * }
   */

  /** 事件在某个“周期年/月”下的实际发生日期；repeat=year 时按农历或公历推算 */
  function occurrenceInYear(ev, year) {
    var base = parseYmd(ev.date);
    if (!base) return null;

    if (ev.repeat === 'year') {
      if (ev.calendar === 'lunar' && ev.lunar && ev.lunar.m) {
        var conv = lunarToSolar(year, ev.lunar.m, ev.lunar.d, !!ev.lunar.leap);
        return conv ? { date: conv.date, warn: conv.warn } : null;
      }
      var mm = base.getMonth() + 1, dd = base.getDate();
      if (mm === 2 && dd === 29 && !isLeapYear(year)) dd = 28;
      return { date: new Date(year, mm - 1, Math.min(dd, daysInMonth(year, mm)), 12, 0, 0, 0), warn: '' };
    }
    return { date: base, warn: '' };
  }

  /**
   * 计算事件的“下一次 / 当前”状态
   * @returns { status:'upcoming'|'today'|'since'|'paused', date, days, count, next, progress }
   */
  function evalEvent(ev, today) {
    if (!ev) return null;
    today = today || new Date();
    var t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
    var base = parseYmd(ev.date);
    if (!base) return null;

    // 暂停：天数冻结在 pausedAt
    if (ev.paused) {
      var frozenTo = parseYmd(ev.pausedAt) || t;
      var frozenDays = diffDays(base, frozenTo) + 1;
      return {
        status: 'paused', date: base, days: frozenDays, count: frozenDays,
        next: null, progress: 0, pausedAt: frozenTo
      };
    }

    var repeat = ev.repeat || 'none';
    var direction = ev.direction || 'since';

    /* ---------- 倒数（until） ---------- */
    if (direction === 'until') {
      var nextDate = null, warn = '';
      if (repeat === 'none') {
        nextDate = base;
      } else if (repeat === 'year') {
        for (var y = t.getFullYear() - 1; y <= t.getFullYear() + 3; y++) {
          var occ = occurrenceInYear(ev, y);
          if (!occ) continue;
          if (diffDays(t, occ.date) >= 0) { nextDate = occ.date; warn = occ.warn; break; }
        }
      } else if (repeat === 'month') {
        var monthsDiff = (t.getFullYear() - base.getFullYear()) * 12 + (t.getMonth() - base.getMonth());
        for (var k = Math.max(0, monthsDiff - 1); k <= monthsDiff + 2; k++) {
          var cand = addMonths(base, k);
          if (diffDays(t, cand) >= 0) { nextDate = cand; break; }
        }
      } else if (repeat === 'week') {
        var wd = base.getDay();
        var delta = (wd - t.getDay() + 7) % 7;
        nextDate = addDays(t, delta);
      } else if (repeat === 'day') {
        nextDate = t;
      }
      if (!nextDate) return null;
      var left = diffDays(t, nextDate);
      return {
        status: left === 0 ? 'today' : 'upcoming',
        date: nextDate, days: left, count: left, next: null, progress: 0, warn: warn
      };
    }

    /* ---------- 正数（since） ---------- */
    var days = diffDays(base, t) + 1;
    var nextMile = null;
    if (repeat === 'year') {
      // 下一个周年
      for (var yr = 1; yr <= 100; yr++) {
        var ann = addYears(base, yr);
        if (diffDays(t, ann) >= 0) { nextMile = { date: ann, label: yr + ' 周年', daysLeft: diffDays(t, ann) }; break; }
      }
    }
    return {
      status: 'since', date: base, days: days, count: days,
      next: nextMile, progress: 0,
      years: days / 365.2425
    };
  }

  /** 事件在给定时间段内的所有发生日（用于日历与提醒） */
  function occurrencesBetween(ev, from, to) {
    var out = [];
    var repeat = ev.repeat || 'none';
    var base = parseYmd(ev.date);
    if (!base) return out;

    // 区间用“天序号”比较，避免 Date 分时/夏令时误差
    var fromN = dayNumber(from), toN = dayNumber(to), baseN = dayNumber(base);
    function inRange(d) {
      var n = dayNumber(d);
      return n >= fromN && n <= toN && n >= baseN;
    }

    if (repeat === 'none') {
      if (inRange(base)) out.push({ date: base, ev: ev });
      return out;
    }

    if (repeat === 'year') {
      for (var y = from.getFullYear() - 1; y <= to.getFullYear() + 1; y++) {
        var occ = occurrenceInYear(ev, y);
        if (!occ) continue;
        if (inRange(occ.date)) out.push({ date: occ.date, ev: ev });
      }
      return out;
    }

    if (repeat === 'month') {
      var monthsDiff = (from.getFullYear() - base.getFullYear()) * 12 + (from.getMonth() - base.getMonth());
      var k = Math.max(0, monthsDiff - 1);
      for (var guard = 0; guard < 60; guard++) {
        var cand = addMonths(base, k);
        if (dayNumber(cand) > toN) break;
        if (inRange(cand)) out.push({ date: cand, ev: ev });
        k++;
      }
      return out;
    }

    if (repeat === 'week' || repeat === 'day') {
      var step = repeat === 'week' ? 7 : 1;
      var offset = diffDays(base, from);
      var k2 = offset > 0 ? Math.ceil(offset / step) : 0;
      var d = addDays(base, k2 * step);
      for (var guard2 = 0; guard2 < 400; guard2++) {
        if (dayNumber(d) > toN) break;
        if (inRange(d)) out.push({ date: d, ev: ev });
        d = addDays(d, step);
      }
      return out;
    }
    return out;
  }

  /** 事件展示文本 */
  function eventHeadline(ev, state) {
    if (!state) return '';
    if (state.status === 'paused') return '已暂停';
    if (state.status === 'today') {
      return ev.direction === 'until' ? '就是今天' : '今天是第 ' + state.days + ' 天';
    }
    if (state.status === 'since') {
      return '第 ' + state.days + ' 天';
    }
    return '还有 ' + state.days + ' 天';
  }

  /** 事件副标题：日期描述 */
  function eventSubline(ev, state) {
    if (!state || !state.date) return '';
    if (ev.direction === 'until') {
      return fmtCN(state.date, true);
    }
    return fmtCN(parseYmd(ev.date), true) + ' 起';
  }

  var REPEAT_LABEL = { none: '不重复', year: '每年', month: '每月', week: '每周', day: '每天' };
  var DIRECTION_LABEL = { since: '正数（已过去）', until: '倒数（还有多久）' };
  var CATEGORIES = [
    { id: 'love', name: '恋爱纪念', emoji: '❤️' },
    { id: 'birthday', name: '生日', emoji: '🎂' },
    { id: 'life', name: '生活', emoji: '🌿' },
    { id: 'work', name: '工作', emoji: '💼' },
    { id: 'festival', name: '节日', emoji: '🎉' }
  ];

  return {
    DAY_MS: DAY_MS,
    parseYmd: parseYmd,
    ymd: ymd,
    fmtCN: fmtCN,
    fmtMd: fmtMd,
    diffDays: diffDays,
    addDays: addDays,
    addYears: addYears,
    isLeapYear: isLeapYear,
    lunarOf: lunarOf,
    lunarToSolar: lunarToSolar,
    constellation: constellation,
    nextBirthday: nextBirthday,
    togetherDays: togetherDays,
    calendarDiff: calendarDiff,
    calendarDiffText: calendarDiffText,
    upcomingMilestones: upcomingMilestones,
    loveMilestones: loveMilestones,
    DAY_MILESTONES: DAY_MILESTONES,
    buildPlan: buildPlan,
    countdownText: countdownText,
    addMonths: addMonths,
    addWeeks: addWeeks,
    sameDay: sameDay,
    occurrenceInYear: occurrenceInYear,
    evalEvent: evalEvent,
    occurrencesBetween: occurrencesBetween,
    eventHeadline: eventHeadline,
    eventSubline: eventSubline,
    REPEAT_LABEL: REPEAT_LABEL,
    DIRECTION_LABEL: DIRECTION_LABEL,
    CATEGORIES: CATEGORIES,
    WEEK_CN: WEEK_CN
  };
});
