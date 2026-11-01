/* =============================================================
 * mock-api.js — Sales Performance Dashboard (demo data layer)
 * -------------------------------------------------------------
 * Deterministic synthetic dataset: 2025-01-01 .. 2026-10-31,
 * daily grain, region x channel. Every number is generated from a
 * fixed seed, so the demo looks the same on every reload.
 *
 * Shape of the API mirrors a real backend:
 *   api.dashboard(filters) -> { ok, data } | { ok:false, error }
 * Swapping this file for real fetch() calls requires no UI change.
 * ============================================================= */
(function () {
  'use strict';

  /* ---------- deterministic RNG (mulberry32) ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  /* ---------- dimensions ---------- */
  const REGIONS = [
    { key: 'na', name: 'North America', weight: 0.41 },
    { key: 'eu', name: 'Europe', weight: 0.26 },
    { key: 'apac', name: 'Asia Pacific', weight: 0.19 },
    { key: 'latam', name: 'Latin America', weight: 0.09 },
    { key: 'mea', name: 'Middle East & Africa', weight: 0.05 },
  ];
  const CHANNELS = [
    { key: 'direct', name: 'Direct Sales', weight: 0.33, aov: 1180, conv: 0.038 },
    { key: 'partner', name: 'Partner Network', weight: 0.21, aov: 1460, conv: 0.031 },
    { key: 'market', name: 'Marketplace', weight: 0.29, aov: 640, conv: 0.026 },
    { key: 'online', name: 'Online Store', weight: 0.17, aov: 380, conv: 0.045 },
  ];
  /* seasonality: Feb dip, summer plateau, Nov peak (holiday campaigns) */
  const MONTH_FACTOR = [0.84, 0.76, 0.96, 1.00, 1.03, 1.06, 1.11, 1.07, 1.14, 1.21, 1.44, 1.30];
  const DOW_FACTOR = [0.72, 1.04, 1.08, 1.06, 1.10, 1.02, 0.78]; /* Sun..Sat */
  const GROWTH = 0.00028; /* steady year-over-year-ish growth per day */

  /* ---------- date helpers ---------- */
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const iso = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  const parse = (s) => { const p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };
  const addDays = (s, n) => iso(new Date(parse(s) + n * 86400000));
  const dayDiff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

  const MIN_DATE = '2025-01-01';
  const MAX_DATE = '2026-10-31';

  /* ---------- build the daily fact table ---------- */
  const FACT = [];
  (function build() {
    const total = dayDiff(MIN_DATE, MAX_DATE);
    for (let i = 0; i <= total; i++) {
      const day = addDays(MIN_DATE, i);
      const d = new Date(parse(day));
      const mf = MONTH_FACTOR[d.getUTCMonth()];
      const df = DOW_FACTOR[d.getUTCDay()];
      const drift = 1 + GROWTH * i;
      for (const r of REGIONS) {
        for (const c of CHANNELS) {
          const seed = hash(day + '|' + r.key + '|' + c.key);
          const rand = rng(seed);
          const noise = 0.86 + rand() * 0.28;
          /* base daily revenue for this cell */
          let rev = 54000 * r.weight * c.weight * 4 * mf * df * drift * noise;

          /* --- anomalies (deliberate, so the charts show real texture) --- */
          /* APAC marketplace outage: 6-10 Jul 2026 */
          if (day >= '2026-07-06' && day <= '2026-07-10' && r.key === 'apac' && c.key === 'market') rev *= 0.08;
          /* LATAM direct-sales promotion: 15-18 Sep 2026 */
          if (day >= '2026-09-15' && day <= '2026-09-18' && r.key === 'latam' && c.key === 'direct') rev *= 2.9;
          /* Black Friday week 2025 */
          if (day >= '2025-11-24' && day <= '2025-11-30') rev *= 1.55;
          /* EU summer slowdown, first two weeks of August */
          if (d.getUTCMonth() === 7 && d.getUTCDate() <= 14 && r.key === 'eu') rev *= 0.74;

          const aov = c.aov * (0.92 + rand() * 0.18) * (r.key === 'na' ? 1.12 : r.key === 'apac' ? 0.94 : 1);
          const orders = Math.max(1, Math.round(rev / aov));
          const conv = c.conv * (0.85 + rand() * 0.3);
          const sessions = Math.round(orders / conv);
          const refundRate = 0.012 + rand() * 0.028 + (c.key === 'market' ? 0.008 : 0);
          FACT.push({
            d: day, m: day.slice(0, 7), region: r.key, channel: c.key,
            revenue: Math.round(rev), orders, sessions,
            refunds: Math.round(orders * refundRate),
          });
        }
      }
    }
  })();

  /* ---------- aggregation ---------- */
  function pick(filters) {
    const f = filters || {};
    const from = f.from || addDays(MAX_DATE, -89);
    const to = f.to || MAX_DATE;
    const regions = (f.regions && f.regions.length) ? f.regions : REGIONS.map((r) => r.key);
    const channels = (f.channels && f.channels.length) ? f.channels : CHANNELS.map((c) => c.key);
    return FACT.filter((x) => x.d >= from && x.d <= to && regions.indexOf(x.region) >= 0 && channels.indexOf(x.channel) >= 0);
  }

  function totals(rows) {
    const t = { revenue: 0, orders: 0, sessions: 0, refunds: 0 };
    for (const x of rows) { t.revenue += x.revenue; t.orders += x.orders; t.sessions += x.sessions; t.refunds += x.refunds; }
    t.aov = t.orders ? t.revenue / t.orders : 0;
    t.conv = t.sessions ? t.orders / t.sessions : 0;
    t.refundRate = t.orders ? t.refunds / t.orders : 0;
    t.customers = Math.round(t.orders * 0.58);
    return t;
  }

  const groupBy = (rows, key) => {
    const map = new Map();
    for (const x of rows) {
      const k = x[key];
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(x);
    }
    return map;
  };

  function monthsIn(from, to) {
    const out = [];
    let cur = from.slice(0, 7);
    const end = to.slice(0, 7);
    while (cur <= end) {
      out.push(cur);
      let [y, m] = cur.split('-').map(Number);
      m++; if (m > 12) { m = 1; y++; }
      cur = y + '-' + pad(m);
      if (out.length > 36) break;
    }
    return out;
  }

  function isoWeekStart(day) {
    const d = new Date(parse(day));
    const dow = d.getUTCDay();
    const back = dow === 0 ? 6 : dow - 1; /* Monday start */
    return addDays(day, -back);
  }

  const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = (ym) => { const p = ym.split('-'); return MONTH_LABEL[+p[1] - 1] + ' ' + p[0].slice(2); };

  /* ---------- response envelope ---------- */
  const ok = (data) => Promise.resolve({ ok: true, data });
  const fail = (msg) => Promise.resolve({ ok: false, error: msg });
  const guard = (fn) => function (payload) {
    try { return ok(fn(payload || {})); } catch (e) { return fail(e.message || String(e)); }
  };

  /* ---------- endpoints ---------- */
  function meta() {
    return {
      regions: REGIONS.map((r) => ({ key: r.key, name: r.name })),
      channels: CHANNELS.map((c) => ({ key: c.key, name: c.name })),
      minDate: MIN_DATE,
      maxDate: MAX_DATE,
      currency: 'USD',
      updatedAt: MAX_DATE + ' 06:00 UTC',
      source: 'Sample dataset · 669 days · 5 regions · 4 channels',
    };
  }

  function dashboard(f) {
    const from = f.from || addDays(MAX_DATE, -89);
    const to = f.to || MAX_DATE;
    if (from > to) throw new Error('Start date must be before end date.');
    if (dayDiff(from, to) > 900) throw new Error('Date range is too wide for the demo dataset.');

    const rows = pick({ ...f, from, to });
    const cur = totals(rows);

    /* previous period of equal length, for the delta badges */
    const len = dayDiff(from, to) + 1;
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(len - 1));
    const prev = totals(pick({ ...f, from: prevFrom, to: prevTo }));

    const delta = (a, b) => (b > 0 ? (a - b) / b : 0);

    const kpis = [
      { key: 'revenue', label: 'Revenue', value: cur.revenue, format: 'currency', delta: delta(cur.revenue, prev.revenue), hint: 'vs previous ' + len + ' days' },
      { key: 'orders', label: 'Orders', value: cur.orders, format: 'int', delta: delta(cur.orders, prev.orders), hint: 'vs previous ' + len + ' days' },
      { key: 'aov', label: 'Avg. Order Value', value: cur.aov, format: 'money', delta: delta(cur.aov, prev.aov), hint: 'vs previous ' + len + ' days' },
      { key: 'conv', label: 'Conversion Rate', value: cur.conv, format: 'pct', delta: delta(cur.conv, prev.conv), hint: 'orders / sessions' },
      { key: 'customers', label: 'Active Customers', value: cur.customers, format: 'int', delta: delta(cur.customers, prev.customers), hint: 'estimated unique buyers' },
      { key: 'refund', label: 'Refund Rate', value: cur.refundRate, format: 'pct', delta: delta(cur.refundRate, prev.refundRate), invert: true, hint: 'lower is better' },
    ];

    /* monthly trend, current period vs the same months one year earlier */
    const months = monthsIn(from, to);
    const byMonth = months.map((ym) => {
      const c = totals(rows.filter((x) => x.m === ym));
      const p = ym.split('-');
      const prevYm = (+p[0] - 1) + '-' + p[1];
      const pv = totals(pick({ ...f, from: prevYm + '-01', to: prevYm + '-28' }));
      return { month: monthLabel(ym), ym, revenue: c.revenue, orders: c.orders, prevRevenue: pv.revenue };
    });

    /* weekly trend: last 12 weeks inside the range */
    const weekMap = new Map();
    for (const x of rows) {
      const w = isoWeekStart(x.d);
      if (!weekMap.has(w)) weekMap.set(w, { revenue: 0, orders: 0 });
      const o = weekMap.get(w); o.revenue += x.revenue; o.orders += x.orders;
    }
    const byWeek = Array.from(weekMap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-12)
      .map(([w, v]) => ({ week: w.slice(5).replace('-', '/'), revenue: v.revenue, orders: v.orders }));

    /* region / channel breakdown */
    const regMap = groupBy(rows, 'region');
    const byRegion = REGIONS.filter((r) => regMap.has(r.key))
      .map((r) => { const t = totals(regMap.get(r.key)); return { key: r.key, name: r.name, revenue: t.revenue, orders: t.orders, conv: t.conv }; })
      .sort((a, b) => b.revenue - a.revenue);

    const chMap = groupBy(rows, 'channel');
    const byChannel = CHANNELS.filter((c) => chMap.has(c.key))
      .map((c) => { const t = totals(chMap.get(c.key)); return { key: c.key, name: c.name, revenue: t.revenue, orders: t.orders }; })
      .sort((a, b) => b.revenue - a.revenue);

    /* top movers: biggest region x channel cells, used by the table default sort */
    return {
      kpis,
      byMonth,
      byWeek,
      byRegion,
      byChannel,
      range: { from, to, days: len, prevFrom, prevTo },
      totals: cur,
      rowCount: rows.length,
    };
  }

  function table(f) {
    const from = f.from || addDays(MAX_DATE, -89);
    const to = f.to || MAX_DATE;
    const len = dayDiff(from, to) + 1;
    const rows = pick({ ...f, from, to });
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(len - 1));
    const prevRows = pick({ ...f, from: prevFrom, to: prevTo });

    const prevMap = new Map();
    for (const x of prevRows) {
      const k = x.region + '|' + x.channel;
      if (!prevMap.has(k)) prevMap.set(k, { revenue: 0, orders: 0 });
      const o = prevMap.get(k); o.revenue += x.revenue; o.orders += x.orders;
    }

    const out = [];
    for (const [rk, rrows] of groupBy(rows, 'region').entries()) {
      for (const [ck, crows] of groupBy(rrows, 'channel').entries()) {
        const t = totals(crows);
        const p = prevMap.get(rk + '|' + ck) || { revenue: 0, orders: 0 };
        out.push({
          id: rk + '-' + ck,
          region: (REGIONS.find((r) => r.key === rk) || {}).name || rk,
          channel: (CHANNELS.find((c) => c.key === ck) || {}).name || ck,
          revenue: t.revenue,
          orders: t.orders,
          aov: t.aov,
          conv: t.conv,
          refundRate: t.refundRate,
          growth: p.revenue > 0 ? (t.revenue - p.revenue) / p.revenue : 0,
        });
      }
    }

    const sortBy = f.sortBy || 'revenue';
    const desc = f.order !== 'asc';
    out.sort((a, b) => {
      const x = a[sortBy], y = b[sortBy];
      if (typeof x === 'string') return desc ? (x < y ? 1 : -1) : (x < y ? -1 : 1);
      return desc ? y - x : x - y;
    });

    const pageSize = Math.max(1, Number(f.pageSize) || 8);
    const total = out.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, Number(f.page) || 1), pages);
    return {
      rows: out.slice((page - 1) * pageSize, page * pageSize),
      total, page, pages, pageSize,
      sortBy, order: desc ? 'desc' : 'asc',
    };
  }

  function about() {
    return {
      title: 'About this demo',
      lines: [
        'This is a working front-end dashboard: filters, sorting, pagination and all four charts are live.',
        'Every figure comes from a built-in sample dataset (669 days of synthetic sales data). Nothing is sent to a server, and a refresh restores the initial state.',
        'The production version runs against your own data source — the API layer is a single file, so the UI does not change when it is connected.',
      ],
    };
  }

  window.api = {
    meta: guard(meta),
    dashboard: guard(dashboard),
    table: guard(table),
    about: guard(about),
  };

  /* small hook for the automated verification script */
  window.__probe = {
    minDate: MIN_DATE,
    maxDate: MAX_DATE,
    factRows: FACT.length,
    sum: (f) => totals(pick(f)).revenue,
  };
})();
