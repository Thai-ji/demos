/* =============================================================
 * app.js 鈥?Sales Performance Dashboard (demo UI)
 * Vue 3 (options API) + Element Plus + ECharts, no build step.
 * All data comes from window.api (mock-api.js / real backend).
 * ============================================================= */
const { createApp, markRaw } = Vue;
const ElMessage = ElementPlus.ElMessage;

const COLORS = {
  ink: '#1f2a44', sub: '#6b7a99', line: '#e4e9f2',
  brand: '#3b5bdb', brandSoft: 'rgba(59,91,219,0.14)',
  teal: '#0ca678', amber: '#f08c00', violet: '#7048e8', rose: '#e03131',
};
const PALETTE = ['#3b5bdb', '#0ca678', '#7048e8', '#f08c00', '#e03131', '#1098ad'];

const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');
const fmtMoney = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('en-US');
const fmtCompact = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(v);
};
const fmtPct = (n, digits = 2) => (Number(n || 0) * 100).toFixed(digits) + '%';
const fmtDelta = (n) => (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';

const app = createApp({
  data() {
    return {
      ready: false,
      loading: false,
      meta: { regions: [], channels: [], minDate: '2025-01-01', maxDate: '2026-10-31' },
      filters: { from: '', to: '', regions: [], channels: [] },
      dateRange: [],
      preset: '90',
      data: { kpis: [], byMonth: [], byWeek: [], byRegion: [], byChannel: [], range: {}, totals: {} },
      table: { rows: [], total: 0, page: 1, pages: 1, pageSize: 8, sortBy: 'revenue', order: 'desc' },
      tableLoading: false,
      aboutVisible: false,
      about: { lines: [] },
      charts: {},
      chartTimer: null,
    };
  },
  computed: {
    rangeLabel() {
      const r = this.data.range || {};
      if (!r.from) return '';
      const f = (s) => {
        const d = new Date(s + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      };
      return f(r.from) + ' 鈥?' + f(r.to) + '  路  ' + r.days + ' days';
    },
    activeFilterCount() {
      return (this.filters.regions.length ? 1 : 0) + (this.filters.channels.length ? 1 : 0) + (this.preset === 'custom' ? 1 : 0);
    },
  },
  methods: {
    fmtInt, fmtMoney, fmtCompact, fmtPct, fmtDelta,

    kpiValue(k) {
      if (k.format === 'currency') return fmtMoney(k.value);
      if (k.format === 'money') return '$' + Number(k.value).toFixed(2);
      if (k.format === 'pct') return fmtPct(k.value);
      return fmtInt(k.value);
    },
    kpiGood(k) {
      const up = k.delta >= 0;
      return k.invert ? !up : up;
    },

    /* ---------- filters ---------- */
    isoLocal(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },
    applyPreset(key) {
      this.preset = key;
      const max = this.meta.maxDate;
      const shift = (days) => {
        const d = new Date(max + 'T00:00:00');
        d.setDate(d.getDate() - days + 1);
        return this.isoLocal(d);
      };
      if (key === '30') { this.filters.from = shift(30); this.filters.to = max; }
      else if (key === '90') { this.filters.from = shift(90); this.filters.to = max; }
      else if (key === '180') { this.filters.from = shift(180); this.filters.to = max; }
      else if (key === '365') { this.filters.from = shift(365); this.filters.to = max; }
      else if (key === 'ytd') { this.filters.from = max.slice(0, 4) + '-01-01'; this.filters.to = max; }
      this.dateRange = [this.filters.from, this.filters.to];
      this.reload();
    },
    onDateChange(v) {
      if (!v || v.length !== 2) return;
      this.preset = 'custom';
      this.filters.from = v[0];
      this.filters.to = v[1];
      this.reload();
    },
    resetFilters() {
      this.filters.regions = [];
      this.filters.channels = [];
      this.applyPreset('90');
    },
    disabledDate(d) {
      const s = this.isoLocal(d);
      return s < this.meta.minDate || s > this.meta.maxDate;
    },

    /* ---------- data ---------- */
    async reload() {
      this.loading = true;
      const f = {
        from: this.filters.from, to: this.filters.to,
        regions: this.filters.regions, channels: this.filters.channels,
      };
      const r = await window.api.dashboard(f);
      this.loading = false;
      if (!r.ok) { ElMessage.error(r.error); return; }
      this.data = r.data;
      await this.loadTable(1);
      await this.$nextTick();
      this.drawCharts();
    },
    async loadTable(page) {
      this.tableLoading = true;
      const r = await window.api.table({
        from: this.filters.from, to: this.filters.to,
        regions: this.filters.regions, channels: this.filters.channels,
        page: page || this.table.page,
        pageSize: this.table.pageSize,
        sortBy: this.table.sortBy,
        order: this.table.order,
      });
      this.tableLoading = false;
      if (!r.ok) { ElMessage.error(r.error); return; }
      this.table = Object.assign({}, this.table, r.data);
    },
    onSortChange({ prop, order }) {
      if (!prop || !order) { this.table.sortBy = 'revenue'; this.table.order = 'desc'; }
      else { this.table.sortBy = prop; this.table.order = order === 'ascending' ? 'asc' : 'desc'; }
      this.loadTable(1);
    },
    onPageChange(p) { this.loadTable(p); },
    onPageSizeChange(s) { this.table.pageSize = s; this.loadTable(1); },

    /* ---------- charts ---------- */
    initCharts() {
      ['trend', 'week', 'region', 'channel'].forEach((k) => {
        const el = document.getElementById('chart-' + k);
        if (el && !this.charts[k]) this.charts[k] = markRaw(echarts.init(el, null, { renderer: 'canvas' }));
      });
    },
    drawCharts() {
      this.initCharts();
      const d = this.data;
      const axis = {
        axisLine: { lineStyle: { color: COLORS.line } },
        axisTick: { show: false },
        axisLabel: { color: COLORS.sub, fontSize: 11 },
        splitLine: { lineStyle: { color: '#f0f3f9' } },
      };

      if (this.charts.trend) {
        this.charts.trend.setOption({
          grid: { left: 8, right: 16, top: 34, bottom: 4, containLabel: true },
          tooltip: {
            trigger: 'axis',
            backgroundColor: '#fff', borderColor: COLORS.line, borderWidth: 1,
            textStyle: { color: COLORS.ink, fontSize: 12 },
            valueFormatter: (v) => fmtCompact(v),
          },
          legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: COLORS.sub, fontSize: 11 } },
          xAxis: Object.assign({ type: 'category', boundaryGap: false, data: d.byMonth.map((x) => x.month) }, axis),
          yAxis: Object.assign({ type: 'value', axisLabel: Object.assign({}, axis.axisLabel, { formatter: (v) => fmtCompact(v) }) }, { splitLine: axis.splitLine, axisLine: { show: false }, axisTick: { show: false } }),
          series: [
            {
              name: 'Revenue', type: 'line', smooth: 0.28, symbol: 'circle', symbolSize: 6,
              lineStyle: { width: 2.4, color: COLORS.brand }, itemStyle: { color: COLORS.brand },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(59,91,219,0.26)' },
                  { offset: 1, color: 'rgba(59,91,219,0.01)' },
                ]),
              },
              data: d.byMonth.map((x) => x.revenue),
            },
            {
              name: 'Same months last year', type: 'line', smooth: 0.28, symbol: 'none',
              lineStyle: { width: 1.8, type: 'dashed', color: '#9aa8c4' }, itemStyle: { color: '#9aa8c4' },
              data: d.byMonth.map((x) => x.prevRevenue),
            },
          ],
        }, true);
      }

      if (this.charts.week) {
        this.charts.week.setOption({
          grid: { left: 8, right: 16, top: 34, bottom: 4, containLabel: true },
          tooltip: {
            trigger: 'axis', backgroundColor: '#fff', borderColor: COLORS.line, borderWidth: 1,
            textStyle: { color: COLORS.ink, fontSize: 12 }, valueFormatter: (v) => fmtCompact(v),
          },
          legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: COLORS.sub, fontSize: 11 } },
          xAxis: Object.assign({ type: 'category', data: d.byWeek.map((x) => x.week) }, axis),
          yAxis: Object.assign({ type: 'value', axisLabel: Object.assign({}, axis.axisLabel, { formatter: (v) => fmtCompact(v) }) }, { splitLine: axis.splitLine, axisLine: { show: false }, axisTick: { show: false } }),
          series: [
            {
              name: 'Weekly revenue', type: 'bar', barMaxWidth: 26,
              itemStyle: {
                borderRadius: [4, 4, 0, 0],
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#4c6ef5' }, { offset: 1, color: '#a5b4fc' },
                ]),
              },
              data: d.byWeek.map((x) => x.revenue),
            },
          ],
        }, true);
      }

      if (this.charts.region) {
        const rows = d.byRegion.slice().reverse();
        this.charts.region.setOption({
          grid: { left: 8, right: 46, top: 8, bottom: 4, containLabel: true },
          tooltip: {
            trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#fff',
            borderColor: COLORS.line, borderWidth: 1, textStyle: { color: COLORS.ink, fontSize: 12 },
            valueFormatter: (v) => fmtCompact(v),
          },
          xAxis: Object.assign({ type: 'value', axisLabel: Object.assign({}, axis.axisLabel, { formatter: (v) => fmtCompact(v) }) }, { splitLine: axis.splitLine, axisLine: { show: false }, axisTick: { show: false } }),
          yAxis: Object.assign({ type: 'category', data: rows.map((x) => x.name) }, { axisLabel: { color: COLORS.ink, fontSize: 11.5 }, axisLine: { show: false }, axisTick: { show: false } }),
          series: [{
            type: 'bar', barMaxWidth: 18,
            itemStyle: { borderRadius: [0, 4, 4, 0], color: COLORS.teal },
            label: { show: true, position: 'right', color: COLORS.sub, fontSize: 11, formatter: (p) => fmtCompact(p.value) },
            data: rows.map((x) => x.revenue),
          }],
        }, true);
      }

      if (this.charts.channel) {
        this.charts.channel.setOption({
          color: PALETTE,
          tooltip: {
            trigger: 'item', backgroundColor: '#fff', borderColor: COLORS.line, borderWidth: 1,
            textStyle: { color: COLORS.ink, fontSize: 12 },
            formatter: (p) => p.name + '<br/>' + fmtCompact(p.value) + ' 路 ' + p.percent + '%',
          },
          legend: { bottom: 0, left: 'center', icon: 'circle', itemWidth: 9, itemHeight: 9, textStyle: { color: COLORS.sub, fontSize: 11 } },
          series: [{
            type: 'pie', radius: ['46%', '68%'], center: ['50%', '44%'], avoidLabelOverlap: true,
            itemStyle: { borderColor: '#fff', borderWidth: 2 },
            label: { show: false },
            emphasis: { label: { show: true, fontSize: 13, fontWeight: 600, formatter: '{b}\n{d}%' } },
            data: d.byChannel.map((x) => ({ name: x.name, value: x.revenue })),
          }],
        }, true);
      }
    },
    resizeCharts() {
      Object.values(this.charts).forEach((c) => c && c.resize());
    },

    /* ---------- misc ---------- */
    async openAbout() {
      const r = await window.api.about();
      if (r.ok) this.about = r.data;
      this.aboutVisible = true;
    },
    csvCell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; },
    exportCsv() {
      const head = ['Region', 'Channel', 'Revenue', 'Orders', 'AOV', 'Conversion', 'Refund rate', 'Growth'];
      const lines = [head.join(',')].concat(this.table.rows.map((r) => [
        this.csvCell(r.region), this.csvCell(r.channel), r.revenue, r.orders,
        r.aov.toFixed(2), (r.conv * 100).toFixed(2) + '%', (r.refundRate * 100).toFixed(2) + '%', (r.growth * 100).toFixed(1) + '%',
      ].join(',')));
      const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sales-by-region-channel.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      ElMessage.success('Exported the current page as CSV');
    },
  },

  async mounted() {
    const m = await window.api.meta();
    if (m.ok) this.meta = m.data;
    this.filters.from = '';
    this.applyPreset('90');
    this.ready = true;
    window.addEventListener('resize', () => this.resizeCharts());
    /* keep chart sizing correct when the panel width changes */
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => this.resizeCharts());
      ro.observe(document.body);
    }
    window.__demo = {
      preset: (k) => this.applyPreset(k),
      setRegions: (keys) => { this.filters.regions = keys; this.preset = 'custom'; return this.reload(); },
      setChannels: (keys) => { this.filters.channels = keys; this.preset = 'custom'; return this.reload(); },
      setRange: (a, b) => { this.filters.from = a; this.filters.to = b; this.preset = 'custom'; return this.reload(); },
      sort: (by, order) => { this.table.sortBy = by; this.table.order = order; return this.loadTable(1); },
      page: (p) => this.loadTable(p),
      about: () => this.openAbout(),
      closeAll: () => { document.querySelectorAll('.el-overlay').forEach((o) => { o.style.display = 'none'; }); },
      state: () => ({
        kpi: this.data.kpis.map((k) => ({ key: k.key, value: k.value, delta: k.delta })),
        rows: this.table.rows.length, total: this.table.total, page: this.table.page,
        firstRow: this.table.rows[0] || null,
        range: this.data.range,
        regionCount: this.data.byRegion.length,
        channelCount: this.data.byChannel.length,
      }),
    };
  },
});

app.use(ElementPlus);
app.mount('#app');
