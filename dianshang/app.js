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
      dict: {
        orderStatus: [], channels: [], asTypes: [], asStatus: [],
        goodsStatus: [], customerLevel: [], categories: [],
      },
      stats: {
        cards: {}, byDay: [], statusDist: [], topGoods: [], lowStock: [], todoAftersale: [],
      },

      goodsQuery: { keyword: '', category: '', status: '' },
      goods: { rows: [], total: 0 },

      orderQuery: { keyword: '', status: '', channel: '' },
      order: { rows: [], total: 0, page: 1, pageSize: 20 },

      asQuery: { keyword: '', status: '' },
      aftersale: { rows: [], total: 0 },

      stock: { goods: [], pendingShip: [], logs: [] },
      customers: [],
      formData: { customers: [], goods: [], channels: [], doneOrders: [] },

      dlgGoods: false,
      goodsForm: {},

      dlgRestock: false,
      restockTarget: {},
      restockQty: 50,

      dlgOrder: false,
      orderForm: { customerId: '', channel: '淘宝', items: [{ goodsId: '', qty: 1 }], remark: '' },

      dlgDetail: false,
      detail: { order: null, items: [], logs: [], aftersales: [] },

      dlgShip: false,
      shipTarget: {},
      shipForm: { expressCompany: '中通快递', expressNo: '' },

      dlgAs: false,
      asForm: { orderId: '', type: 'return_refund', reason: '' },

      dlgAsHandle: false,
      asTarget: {},
      asHandleForm: { agree: true, remark: '' },
    };
  },

  computed: {
    pageTitle() {
      return {
        dashboard: '数据看板', goods: '商品管理', order: '订单管理',
        stock: '库存发货', customer: '客户管理', aftersale: '售后退货',
      }[this.view] || '';
    },
    pageDesc() {
      return {
        dashboard: '订单走势、状态分布与售后待办',
        goods: '商品档案、上下架与库存变动',
        order: '订单列表、明细与状态机流转',
        stock: '待发货订单、库存预警与出入库流水',
        customer: '买家档案、下单次数与消费额',
        aftersale: '售后单处理，退货同意自动回补库存',
      }[this.view] || '';
    },
    cards() {
      const c = this.stats.cards || {};
      return [
        { label: '今日订单', value: c.todayOrders || 0, unit: '单', foot: `今日金额 ¥${(c.todayAmount || 0).toFixed(2)}`, tone: '' },
        { label: '待发货', value: c.pendingShip || 0, unit: '单', foot: '需要仓库出库', tone: 'tone-warning' },
        { label: '近 14 天销售额', value: `¥${(c.sales14 || 0).toFixed(0)}`, unit: '', foot: '不含已取消订单', tone: 'tone-success' },
        { label: '售后待处理', value: c.asPending || 0, unit: '单', foot: '退货 / 换货 / 退款', tone: 'tone-danger' },
      ];
    },
    expressCompanies() {
      return ['顺丰速运', '中通快递', '圆通速递', '韵达快递', '京东物流'];
    },
    orderTotal() {
      return (this.orderForm.items || []).reduce((s, r) => s + this.itemSubtotal(r), 0);
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
    day(iso) { return iso ? String(iso).slice(0, 10) : '—'; },
    money(n) { return '¥' + Number(n || 0).toFixed(2); },
    labelOf(kind, v) {
      const list = this.dict[kind] || [];
      const hit = list.find((x) => x.value === v);
      return hit ? hit.label : (v || '—');
    },
    tagOf(kind, v) {
      const list = this.dict[kind] || [];
      const hit = list.find((x) => x.value === v);
      return hit ? hit.type : 'info';
    },
    lowRow({ row }) { return row.is_low ? 'row-low' : ''; },
    goodsOf(id) { return this.formData.goods.find((g) => g.id === id) || null; },
    itemSubtotal(row) {
      const g = this.goodsOf(row.goodsId);
      return g ? Number(g.price) * Number(row.qty || 0) : 0;
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
      await this.loadGoods();
      await this.loadOrder(1);
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
      if (name === 'goods') this.loadGoods();
      if (name === 'order') this.loadOrder(1);
      if (name === 'stock') this.loadStock();
      if (name === 'customer') this.loadCustomers();
      if (name === 'aftersale') this.loadAftersale();
    },

    /* ---------- 加载 ---------- */
    async loadBase() {
      this.dict = await this.call(window.api.dict());
      this.info = await this.call(window.api.info());
      this.formData = await this.call(window.api.orderFormData());
    },
    async loadDashboard() {
      this.stats = await this.call(window.api.dashboard());
      this.$nextTick(() => this.renderCharts());
    },
    async loadGoods() {
      this.loading = true;
      try {
        this.goods = await this.call(window.api.goodsList(this.goodsQuery));
      } finally {
        this.loading = false;
      }
    },
    async loadOrder(page = 1) {
      this.loading = true;
      try {
        const q = { ...this.orderQuery, page, pageSize: this.order.pageSize };
        this.order = await this.call(window.api.orderList(q));
      } finally {
        this.loading = false;
      }
    },
    async loadStock() {
      this.loading = true;
      try {
        this.stock = await this.call(window.api.stockList());
      } finally {
        this.loading = false;
      }
    },
    async loadCustomers() {
      this.loading = true;
      try {
        this.customers = await this.call(window.api.customers());
      } finally {
        this.loading = false;
      }
    },
    async loadAftersale() {
      this.loading = true;
      try {
        this.aftersale = await this.call(window.api.aftersaleList(this.asQuery));
      } finally {
        this.loading = false;
      }
    },
    async refreshAll() {
      await this.loadFormData();
      await this.loadDashboard();
      await this.loadGoods();
      await this.loadOrder(this.order.page || 1);
      await this.loadStock();
    },
    async loadFormData() {
      this.formData = await this.call(window.api.orderFormData());
    },

    /* ---------- 图表 ---------- */
    renderCharts() {
      if (typeof echarts === 'undefined') return;
      const lineEl = document.getElementById('chartLine');
      const pieEl = document.getElementById('chartPie');
      const topEl = document.getElementById('chartTop');
      if (!lineEl || !pieEl || !topEl) return;

      const days = (this.stats.byDay || []).map((d) => d.date);
      const amounts = (this.stats.byDay || []).map((d) => Number(d.amount));
      if (this._line) this._line.dispose();
      this._line = echarts.init(lineEl);
      this._line.setOption({
        grid: { left: 58, right: 20, top: 24, bottom: 30 },
        tooltip: { trigger: 'axis', valueFormatter: (v) => '¥' + Number(v).toFixed(2) },
        xAxis: {
          type: 'category', data: days, boundaryGap: false,
          axisLine: { lineStyle: { color: '#dfe6ee' } },
          axisLabel: { color: '#8b95a3', fontSize: 11 },
        },
        yAxis: {
          type: 'value', splitLine: { lineStyle: { color: '#f0f3f8' } },
          axisLabel: { color: '#8b95a3', fontSize: 11, formatter: (v) => (v >= 1000 ? (v / 1000) + 'k' : v) },
        },
        series: [{
          type: 'line', data: amounts, smooth: false, symbolSize: 5,
          lineStyle: { width: 2.4, color: '#4f46e5' },
          itemStyle: { color: '#4f46e5' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: 'rgba(99,102,241,.28)' }, { offset: 1, color: 'rgba(99,102,241,.02)' }],
            },
          },
        }],
      });

      const dist = (this.stats.statusDist || []).filter((d) => d.count > 0);
      const colors = {
        pending_pay: '#94a3b8', paid: '#f59e0b', shipped: '#3b82f6',
        done: '#22c55e', aftersale: '#ef4444', refunded: '#a855f7', canceled: '#cbd5e1',
      };
      if (this._pie) this._pie.dispose();
      this._pie = echarts.init(pieEl);
      this._pie.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c} 单 ({d}%)' },
        legend: { bottom: 2, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: '#5b6675', fontSize: 11 } },
        series: [{
          type: 'pie', radius: ['40%', '64%'], center: ['50%', '43%'],
          label: { show: false }, avoidLabelOverlap: true,
          data: dist.map((d) => ({
            name: d.label, value: d.count, itemStyle: { color: colors[d.value] || '#94a3b8' },
          })),
        }],
      });

      const top = (this.stats.topGoods || []).slice().reverse();
      if (this._top) this._top.dispose();
      this._top = echarts.init(topEl);
      this._top.setOption({
        grid: { left: 118, right: 44, top: 12, bottom: 16 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => v + ' 件' },
        xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0f3f8' } }, axisLabel: { color: '#8b95a3', fontSize: 11 } },
        yAxis: {
          type: 'category', data: top.map((t) => t.title),
          axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: '#5b6675', fontSize: 11 },
        },
        series: [{
          type: 'bar', data: top.map((t) => t.qty), barWidth: 13,
          itemStyle: { color: '#a855f7', borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: '#5b6675', fontSize: 11 },
        }],
      });
    },

    /* ---------- 商品 ---------- */
    openGoodsCreate() {
      this.goodsForm = {
        sku: '', name: '', category: '服饰', price: 99, cost: 0, stock: 100, safetyStock: 20,
      };
      this.dlgGoods = true;
    },
    async submitGoods() {
      this.saving = true;
      try {
        const r = await this.call(window.api.goodsCreate(this.goodsForm));
        ElMessage.success(`商品已保存：${r.sku}`);
        this.dlgGoods = false;
        await this.refreshAll();
      } catch (_) { /* 已提示 */ } finally {
        this.saving = false;
      }
    },
    async toggleGoods(row) {
      const to = row.status === 'on' ? 'off' : 'on';
      try {
        await this.call(window.api.goodsToggle({ id: row.id, status: to }));
        ElMessage.success(to === 'off' ? '已下架' : '已上架');
        await this.loadGoods();
        await this.loadFormData();
      } catch (_) {}
    },
    openRestock(row) {
      this.restockTarget = row;
      this.restockQty = 50;
      this.dlgRestock = true;
    },
    async submitRestock() {
      this.saving = true;
      try {
        const r = await this.call(window.api.goodsRestock({ id: this.restockTarget.id, qty: Number(this.restockQty) }));
        ElMessage.success(`入库成功，当前库存 ${r.stock} 件`);
        this.dlgRestock = false;
        await this.loadGoods();
        await this.loadStock();
        await this.loadFormData();
      } catch (_) {} finally {
        this.saving = false;
      }
    },

    /* ---------- 订单 ---------- */
    openOrderCreate() {
      this.orderForm = {
        customerId: this.formData.customers[0] ? this.formData.customers[0].id : '',
        channel: '淘宝',
        items: [{ goodsId: '', qty: 1 }],
        remark: '',
      };
      this.dlgOrder = true;
    },
    addOrderItem() { this.orderForm.items.push({ goodsId: '', qty: 1 }); },
    removeOrderItem(i) { this.orderForm.items.splice(i, 1); },
    async submitOrder() {
      this.saving = true;
      try {
        const payload = {
          customerId: this.orderForm.customerId,
          channel: this.orderForm.channel,
          remark: this.orderForm.remark,
          items: this.orderForm.items
            .filter((r) => r.goodsId)
            .map((r) => ({ goodsId: r.goodsId, qty: Number(r.qty || 1) })),
        };
        const r = await this.call(window.api.orderCreate(payload));
        ElMessage.success(`订单已创建：${r.orderNo}，库存已扣减`);
        this.dlgOrder = false;
        await this.refreshAll();
      } catch (_) {} finally {
        this.saving = false;
      }
    },
    async openOrderDetail(row) {
      this.detail = await this.call(window.api.orderGet({ id: row.id }));
      this.dlgDetail = true;
    },
    async payOrder(row) {
      try {
        await this.call(window.api.orderPay({ id: row.id }));
        ElMessage.success('已收款，订单进入待发货');
        await this.refreshAll();
      } catch (_) {}
    },
    async cancelOrder(row) {
      try {
        await this.call(window.api.orderCancel({ id: row.id }));
        ElMessage.success('订单已取消，库存已回补');
        await this.refreshAll();
      } catch (_) {}
    },
    async completeOrder(row) {
      try {
        await this.call(window.api.orderComplete({ id: row.id }));
        ElMessage.success('订单已完成');
        await this.refreshAll();
      } catch (_) {}
    },
    openShip(row) {
      this.shipTarget = row;
      this.shipForm = { expressCompany: '中通快递', expressNo: '' };
      this.dlgShip = true;
    },
    async submitShip() {
      this.saving = true;
      try {
        await this.call(window.api.orderShip({
          id: this.shipTarget.id,
          expressCompany: this.shipForm.expressCompany,
          expressNo: this.shipForm.expressNo,
        }));
        ElMessage.success('已发货');
        this.dlgShip = false;
        await this.refreshAll();
      } catch (_) {} finally {
        this.saving = false;
      }
    },

    /* ---------- 售后 ---------- */
    openAsCreate(orderRow) {
      this.asForm = {
        orderId: orderRow ? orderRow.id : (this.formData.doneOrders[0] ? this.formData.doneOrders[0].id : ''),
        type: 'return_refund',
        reason: '',
      };
      this.dlgAs = true;
    },
    async submitAsCreate() {
      this.saving = true;
      try {
        const r = await this.call(window.api.aftersaleCreate({
          orderId: this.asForm.orderId, type: this.asForm.type, reason: this.asForm.reason,
        }));
        ElMessage.success(`售后单已创建：${r.asNo}`);
        this.dlgAs = false;
        await this.refreshAll();
        await this.loadAftersale();
      } catch (_) {} finally {
        this.saving = false;
      }
    },
    openAsHandle(row) {
      this.asTarget = row;
      this.asHandleForm = { agree: true, remark: '' };
      this.dlgAsHandle = true;
    },
    async submitAsHandle() {
      this.saving = true;
      try {
        const r = await this.call(window.api.aftersaleHandle({
          id: this.asTarget.id, agree: this.asHandleForm.agree, remark: this.asHandleForm.remark,
        }));
        ElMessage.success(r.status === 'agreed' ? '已同意，退货商品已回补库存' : '已拒绝');
        this.dlgAsHandle = false;
        await this.loadAftersale();
        await this.refreshAll();
      } catch (_) {} finally {
        this.saving = false;
      }
    },

    /* ---------- 演示说明 ---------- */
    aboutDemo() {
      const ElMessageBox = ElementPlus.ElMessageBox;
      ElMessageBox.alert(
        '这是一个静态网页演示版，用来让人在不安装任何东西的情况下点开看界面。\n\n' +
        '· 界面与交互是真实实现：六个模块都能点，下单会真的校验并扣库存、超卖会被拒绝、' +
        '取消订单会回补库存、售后同意退货会再回补一次；\n' +
        '· 数据是内置的示例数据（12 个商品、12 张订单、6 个示例买家、3 张售后单），刷新页面即恢复初始值；\n' +
        '· 没有后端、不连服务器、不读写本地文件，因此操作不会真正保存；\n' +
        '· 正式版会接平台订单接口（淘宝 / 得物等）、真实库存与支付回调，演示版只演示业务规则。',
        '关于本演示',
        { confirmButtonText: '知道了', customClass: 'about-box' }
      );
    },

    /* ---------- 截图脚本入口 ---------- */
    closeAll() {
      this.dlgGoods = false;
      this.dlgRestock = false;
      this.dlgOrder = false;
      this.dlgDetail = false;
      this.dlgShip = false;
      this.dlgAs = false;
      this.dlgAsHandle = false;
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
      if (action === 'goods') { this.go('goods'); await this.loadGoods(); return; }
      if (action === 'goods-create') {
        this.go('goods'); await this.loadGoods(); this.openGoodsCreate();
        this.goodsForm.sku = 'SKU-F6001';
        this.goodsForm.name = '便携折叠水壶 600ml';
        this.goodsForm.category = '运动';
        this.goodsForm.price = 119;
        this.goodsForm.cost = 52;
        this.goodsForm.stock = 200;
        this.goodsForm.safetyStock = 30;
        return;
      }
      if (action === 'order') { this.go('order'); await this.loadOrder(1); return; }
      if (action === 'order-create') {
        this.go('order'); await this.loadOrder(1); this.openOrderCreate();
        const g1 = this.formData.goods.find((g) => g.sku === 'SKU-A1001') || this.formData.goods[0];
        const g2 = this.formData.goods.find((g) => g.sku === 'SKU-C3002') || this.formData.goods[1];
        this.orderForm.items = [{ goodsId: g1.id, qty: 2 }, { goodsId: g2.id, qty: 1 }];
        this.orderForm.channel = '得物';
        this.orderForm.remark = '演示：买家备注工作日送货';
        return;
      }
      if (action === 'order-detail') {
        this.go('order'); await this.loadOrder(1);
        const row = this.order.rows.find((r) => r.status === 'shipped')
          || this.order.rows.find((r) => r.item_count > 1)
          || this.order.rows[0];
        if (row) await this.openOrderDetail(row);
        return;
      }
      if (action === 'stock') { this.go('stock'); await this.loadStock(); return; }
      if (action === 'ship') {
        this.go('stock'); await this.loadStock();
        const row = this.stock.pendingShip[0];
        if (row) {
          this.openShip(row);
          this.shipForm.expressCompany = '顺丰速运';
          this.shipForm.expressNo = 'SF7788990011223';
        }
        return;
      }
      if (action === 'customer') { this.go('customer'); await this.loadCustomers(); return; }
      if (action === 'aftersale') { this.go('aftersale'); await this.loadAftersale(); return; }
      if (action === 'aftersale-handle') {
        this.go('aftersale'); await this.loadAftersale();
        const row = this.aftersale.rows.find((r) => r.status === 'pending');
        if (row) {
          this.openAsHandle(row);
          this.asHandleForm.agree = true;
          this.asHandleForm.remark = '核实尺码问题属实，同意退货退款';
        }
        return;
      }
    },
  },

  async mounted() {
    window.__demo = (a) => this.demo(a);
    window.addEventListener('resize', () => {
      if (this._line) this._line.resize();
      if (this._pie) this._pie.resize();
      if (this._top) this._top.resize();
    });
  },
});

app.use(ElementPlus, { locale: (typeof ElementPlusLocaleZhCn !== 'undefined') ? ElementPlusLocaleZhCn : undefined });
app.mount('#app');
