/* global Vue, ElementPlus, ElementPlusLocaleZhCn, echarts */
'use strict';

const { createApp } = Vue;
const ElMessage = ElementPlus.ElMessage;

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const app = createApp({
  data() {
    return {
      session: null,
      loginForm: { username: 'admin', password: '' },
      logging: false,
      loginError: '',

      view: 'dashboard',
      loading: false,
      saving: false,
      info: {},
      settingsData: { list: [], users: [] },
      dict: {
        equipmentStatus: [], equipmentCategory: [], maintenanceType: [],
        maintenanceStatus: [], cooperationLevel: [],
      },
      customers: [],
      spares: [],
      allEquipments: [],
      stats: { equipment: {}, maintenance: {}, lowStock: [], dueSoon: [], byMonth: [], byType: [] },

      eqQuery: { keyword: '', status: '', customerId: '' },
      equipment: { rows: [], total: 0, page: 1, pageSize: 20 },

      mtQuery: { keyword: '', type: '' },
      maintenance: { rows: [], total: 0, page: 1, pageSize: 20 },

      dlgEquipment: false,
      eqForm: {},

      dlgStatus: false,
      statusEq: {},
      statusForm: { toStatus: '', reason: '' },

      dlgDetail: false,
      detail: { equipment: null, logs: [], maintenances: [] },

      dlgMaintenance: false,
      mtForm: { parts: [] },

      dlgMtDetail: false,
      mtDetail: { record: null, parts: [] },
    };
  },

  computed: {
    pageTitle() {
      return {
        dashboard: '首页看板', equipment: '设备管理', maintenance: '维护记录',
        stock: '备件库存', customer: '客户信息', settings: '系统设置',
      }[this.view] || '';
    },
    pageDesc() {
      return {
        dashboard: '设备状态、维护趋势与库存预警总览',
        equipment: '设备档案、状态机与状态变更流水',
        maintenance: '维护记录、备件用料与库存联动',
        stock: '备件库存与安全库存预警',
        customer: '客户档案与名下设备数',
        settings: '系统参数、账号角色与运行环境',
      }[this.view] || '';
    },
    cards() {
      const e = this.stats.equipment || {};
      const m = this.stats.maintenance || {};
      return [
        { label: '设备总数', value: e.total || 0, unit: '台', foot: '全部在管设备', tone: '' },
        { label: '运行中', value: e.running || 0, unit: '台', foot: '正常投运', tone: 'tone-success' },
        { label: '待维修', value: e.pending || 0, unit: '台', foot: '需要安排上门', tone: 'tone-warning' },
        { label: '维护记录', value: m.count || 0, unit: '条', foot: `累计费用 ¥${Number(m.amount || 0).toFixed(0)}`, tone: 'tone-muted' },
      ];
    },
    partsTotal() {
      return (this.mtForm.parts || []).reduce((s, r) => s + this.partSubtotal(r), 0);
    },
  },

  methods: {
    /* ---------- 工具 ---------- */
    async call(promise) {
      const res = await promise;
      if (!res || res.ok !== true) {
        ElMessage.error((res && res.error) || '操作失败');
        throw new Error((res && res.error) || '操作失败');
      }
      return res.data;
    },
    fmt(iso) {
      if (!iso) return '—';
      return String(iso).slice(0, 16).replace('T', ' ');
    },
    statusLabel(v) {
      const s = this.dict.equipmentStatus.find((x) => x.value === v);
      return s ? s.label : v || '—';
    },
    statusTag(v) {
      const s = this.dict.equipmentStatus.find((x) => x.value === v);
      return s ? s.type : 'info';
    },
    typeLabel(v) {
      const t = this.dict.maintenanceType.find((x) => x.value === v);
      return t ? t.label : v || '—';
    },
    levelLabel(v) {
      const l = this.dict.cooperationLevel.find((x) => x.value === v);
      return l ? l.label : v || '—';
    },
    roleLabel(v) {
      return { admin: '系统管理员', manager: '运维主管', staff: '运维工程师' }[v] || v || '—';
    },
    stockRowClass({ row }) {
      return row.is_low ? 'row-low-stock' : '';
    },
    partSubtotal(row) {
      const p = this.spares.find((x) => x.id === row.partId);
      if (!p) return 0;
      return Number(p.unit_price || 0) * Number(row.qty || 0);
    },

    /* ---------- 登录 ---------- */
    async doLogin() {
      if (this.logging) return false;
      this.logging = true;
      this.loginError = '';
      try {
        const res = await window.api.login({
          username: this.loginForm.username,
          password: this.loginForm.password,
        });
        if (!res || res.ok !== true) {
          this.loginError = (res && res.error) || '登录失败';
          ElMessage.error(this.loginError);
          return false;
        }
        this.session = res.data;
        this.loginForm.password = '';
        ElMessage.success(`欢迎，${res.data.displayName}`);
        await this.afterLogin();
        return true;
      } catch (e) {
        this.loginError = e && e.message ? e.message : '登录失败';
        return false;
      } finally {
        this.logging = false;
      }
    },
    async afterLogin() {
      await this.loadBase();
      await this.loadDashboard();
      await this.loadEquipment(1);
      await this.loadMaintenance(1);
      this.view = 'dashboard';
      await this.$nextTick();
      this.renderCharts();
    },
    logout() {
      this.session = null;
      this.loginForm = { username: 'admin', password: '' };
      this.loginError = '';
    },

    /* ---------- 导航 ---------- */
    go(name) {
      this.view = name;
      if (name === 'dashboard') this.$nextTick(() => this.renderCharts());
      if (name === 'settings') this.loadSettings();
    },

    /* ---------- 加载 ---------- */
    async loadBase() {
      this.dict = await this.call(window.api.dict());
      this.customers = await this.call(window.api.customers());
      this.spares = await this.call(window.api.spares());
      const all = await this.call(window.api.equipmentList({ page: 1, pageSize: 500 }));
      this.allEquipments = all.rows;
      this.info = await this.call(window.api.info());
    },
    async loadDashboard() {
      this.stats = await this.call(window.api.dashboard());
      this.$nextTick(() => this.renderCharts());
    },
    async loadEquipment(page = 1) {
      this.loading = true;
      try {
        const q = { ...this.eqQuery, page, pageSize: this.equipment.pageSize };
        this.equipment = await this.call(window.api.equipmentList(q));
      } finally {
        this.loading = false;
      }
    },
    async loadMaintenance(page = 1) {
      this.loading = true;
      try {
        const q = { ...this.mtQuery, page, pageSize: this.maintenance.pageSize };
        this.maintenance = await this.call(window.api.maintenanceList(q));
      } finally {
        this.loading = false;
      }
    },
    async loadSpares() {
      this.spares = await this.call(window.api.spares());
    },
    async loadSettings() {
      this.settingsData.list = await this.call(window.api.settings());
      this.settingsData.users = await this.call(window.api.users());
    },

    /* ---------- 图表 ---------- */
    renderCharts() {
      if (typeof echarts === 'undefined') return;
      const barEl = document.getElementById('chartBar');
      const pieEl = document.getElementById('chartPie');
      if (!barEl || !pieEl) return;

      const months = (this.stats.byMonth || []).map((r) => r.ym);
      const counts = (this.stats.byMonth || []).map((r) => Number(r.c));
      if (this._bar) this._bar.dispose();
      this._bar = echarts.init(barEl);
      this._bar.setOption({
        grid: { left: 44, right: 18, top: 24, bottom: 30 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: months, axisLine: { lineStyle: { color: '#dfe6ee' } }, axisLabel: { color: '#8b95a3', fontSize: 11 } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0f3f8' } }, axisLabel: { color: '#8b95a3', fontSize: 11 } },
        series: [{
          type: 'bar', data: counts, barWidth: 26,
          itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', color: '#5b6675', fontSize: 11 },
        }],
      });

      const e = this.stats.equipment || {};
      if (this._pie) this._pie.dispose();
      this._pie = echarts.init(pieEl);
      this._pie.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c} 台 ({d}%)' },
        legend: { bottom: 4, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: '#5b6675', fontSize: 11 } },
        series: [{
          type: 'pie', radius: ['42%', '66%'], center: ['50%', '44%'],
          avoidLabelOverlap: true,
          label: { show: false },
          data: [
            { name: '运行中', value: e.running || 0, itemStyle: { color: '#22c55e' } },
            { name: '待维修', value: e.pending || 0, itemStyle: { color: '#f59e0b' } },
            { name: '已停用', value: e.stopped || 0, itemStyle: { color: '#94a3b8' } },
          ],
        }],
      });
    },

    /* ---------- 设备 ---------- */
    openEquipmentCreate() {
      this.eqForm = {
        equipmentNo: '', model: '', name: '', category: '反渗透',
        customerId: this.customers[0] ? this.customers[0].id : '', capacity: '',
        installAddress: '', installDate: today(), warrantyEnd: '', status: 'running',
      };
      this.dlgEquipment = true;
    },
    async submitEquipment() {
      this.saving = true;
      try {
        await this.call(window.api.equipmentCreate(this.eqForm));
        ElMessage.success('设备已保存');
        this.dlgEquipment = false;
        await this.loadEquipment(1);
        await this.loadBase();
        await this.loadDashboard();
      } catch (_) { /* 已提示 */ } finally {
        this.saving = false;
      }
    },
    openStatusDialog(row) {
      this.statusEq = row;
      this.statusForm = {
        toStatus: row.status === 'running' ? 'pending_repair' : 'running',
        reason: '',
      };
      this.dlgStatus = true;
    },
    async submitStatus() {
      this.saving = true;
      try {
        await this.call(window.api.equipmentChangeStatus({
          id: this.statusEq.id, toStatus: this.statusForm.toStatus, reason: this.statusForm.reason,
        }));
        ElMessage.success('状态已变更，流水已记录');
        this.dlgStatus = false;
        await this.loadEquipment(this.equipment.page);
        await this.loadDashboard();
      } catch (_) {} finally {
        this.saving = false;
      }
    },
    async openEquipmentDetail(row) {
      this.detail = await this.call(window.api.equipmentGet({ id: row.id }));
      this.dlgDetail = true;
    },

    /* ---------- 维护记录 ---------- */
    openMaintenanceCreate() {
      this.mtForm = {
        equipmentId: '', customerName: '', type: 'routine',
        occurredDate: today(), faultDesc: '', solution: '',
        costLabor: 0, nextDueDate: '', parts: [],
      };
      this.dlgMaintenance = true;
    },
    onEqPick(id) {
      const e = this.allEquipments.find((x) => x.id === id);
      const c = e ? this.customers.find((x) => x.id === e.customer_id) : null;
      this.mtForm.customerName = c ? (c.short_name || c.name) : '';
    },
    addPartRow() {
      this.mtForm.parts.push({ partId: '', qty: 1 });
    },
    async submitMaintenance() {
      this.saving = true;
      try {
        const payload = {
          equipmentId: this.mtForm.equipmentId,
          type: this.mtForm.type,
          occurredAt: `${this.mtForm.occurredDate}T09:30:00+08:00`,
          faultDesc: this.mtForm.faultDesc,
          solution: this.mtForm.solution,
          costLabor: Number(this.mtForm.costLabor || 0),
          nextDueDate: this.mtForm.nextDueDate || null,
          parts: this.mtForm.parts.filter((p) => p.partId).map((p) => ({ partId: p.partId, qty: p.qty })),
        };
        const r = await this.call(window.api.maintenanceCreate(payload));
        ElMessage.success(`已保存 ${r.recordNo}，备件已扣减`);
        this.dlgMaintenance = false;
        await this.loadMaintenance(1);
        await this.loadSpares();
        await this.loadDashboard();
      } catch (_) {} finally {
        this.saving = false;
      }
    },
    async openMaintenanceDetail(row) {
      this.mtDetail = await this.call(window.api.maintenanceGet({ id: row.id }));
      this.dlgMtDetail = true;
    },

    /* 网页演示版：说清楚这是什么、数据从哪来、什么没做 */
    aboutDemo() {
      const ElMessageBox = ElementPlus.ElMessageBox;
      ElMessageBox.alert(
        '这是一个静态网页演示版，用来让人在不安装任何东西的情况下点开看界面。\n\n' +
        '· 界面与交互是真实实现：六个模块都能点，新增设备、改状态、新增维护记录都会真的走一遍校验并更新页面数据；\n' +
        '· 数据是内置的示例数据（3 家示例客户、8 台设备、8 条维护记录、6 种备件），刷新页面即恢复初始值；\n' +
        '· 没有后端、不连服务器、不读写本地文件，因此操作不会真正保存；\n' +
        '· 正式版是 Windows 桌面程序，数据存本机 SQLite，后续再接导入导出、备份与多角色权限。',
        '关于本演示',
        { confirmButtonText: '知道了', customClass: 'about-box' }
      );
    },

    /* ---------- 截图脚本入口 ---------- */
    closeAll() {
      this.dlgEquipment = false;
      this.dlgStatus = false;
      this.dlgDetail = false;
      this.dlgMaintenance = false;
      this.dlgMtDetail = false;
    },
    async demo(action) {
      this.closeAll();
      await new Promise((r) => setTimeout(r, 260));

      if (action === 'login') {
        this.session = null;
        this.loginForm = { username: 'admin', password: '' };
        this.loginError = '';
        return;
      }
      if (action === 'login-submit') {
        this.loginForm = { username: 'admin', password: 'admin123' };
        const okLogin = await this.doLogin();
        if (!okLogin) throw new Error('演示登录失败：' + (this.loginError || '未知原因'));
        if (ElMessage && ElMessage.closeAll) ElMessage.closeAll();
        return;
      }
      if (!this.session) {
        this.loginForm = { username: 'admin', password: 'admin123' };
        const okLogin = await this.doLogin();
        if (!okLogin) throw new Error('演示登录失败：' + (this.loginError || '未知原因'));
        if (ElMessage && ElMessage.closeAll) ElMessage.closeAll();
      }

      if (action === 'dashboard' || action === 'chart') {
        this.go('dashboard');
        await this.loadDashboard();
        await new Promise((r) => setTimeout(r, 300));
        this.renderCharts();
        return;
      }
      if (action === 'settings') { this.go('settings'); await this.loadSettings(); return; }
      if (action === 'equipment') { this.go('equipment'); await this.loadEquipment(1); return; }
      if (action === 'equipment-create') {
        this.go('equipment'); await this.loadEquipment(1); this.openEquipmentCreate();
        this.eqForm.equipmentNo = 'DX-2026-0051';
        this.eqForm.model = 'RO-15T';
        this.eqForm.name = '15t/h 反渗透主机';
        this.eqForm.capacity = '15 t/h';
        this.eqForm.installAddress = '江苏厂区三号车间';
        return;
      }
      if (action === 'equipment-detail') {
        this.go('equipment'); await this.loadEquipment(1);
        const row = this.equipment.rows.find((r) => r.maintenance_count > 0) || this.equipment.rows[0];
        if (row) await this.openEquipmentDetail(row);
        return;
      }
      if (action === 'equipment-status') {
        this.go('equipment'); await this.loadEquipment(1);
        const row = this.equipment.rows.find((r) => r.status === 'pending_repair') || this.equipment.rows[0];
        if (row) {
          this.openStatusDialog(row);
          this.statusForm.reason = '膜组件已到货，安排更换后恢复运行';
        }
        return;
      }
      if (action === 'maintenance') { this.go('maintenance'); await this.loadMaintenance(1); return; }
      if (action === 'maintenance-create') {
        this.go('maintenance'); await this.loadMaintenance(1);
        this.openMaintenanceCreate();
        const eq = this.allEquipments.find((x) => x.id === 3) || this.allEquipments[0];
        if (eq) { this.mtForm.equipmentId = eq.id; this.onEqPick(eq.id); }
        this.mtForm.type = 'repair';
        this.mtForm.faultDesc = 'UF-20T 超滤产水量下降至 12t/h，跨膜压差 0.12MPa，产水浊度升高';
        this.mtForm.solution = '更换超滤膜组件 2 支，化学清洗后复测产水量 19t/h';
        this.mtForm.costLabor = 800;
        this.mtForm.nextDueDate = '2027-02-08';
        this.mtForm.parts = [{ partId: 2, qty: 2 }];
        return;
      }
      if (action === 'stock') { this.go('stock'); await this.loadSpares(); return; }
    },
  },

  async mounted() {
    // 登录前不加载任何业务数据：界面上只有一个登录框
    window.__demo = (a) => this.demo(a);
    window.addEventListener('resize', () => {
      if (this._bar) this._bar.resize();
      if (this._pie) this._pie.resize();
    });
  },
});

app.use(ElementPlus, { locale: (typeof ElementPlusLocaleZhCn !== 'undefined') ? ElementPlusLocaleZhCn : undefined });
app.mount('#app');
