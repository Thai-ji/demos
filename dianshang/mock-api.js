/* =====================================================================
 * mock-api.js — 电商订单管理平台 · 静态网页演示版
 * 用一份内存数据模拟后端接口，接口返回值统一信封 { ok, data, error }。
 * 业务规则在这里真跑一遍：下单扣库存、超卖拒绝、取消回补、状态机流转、
 * 售后同意回补库存。刷新页面即恢复初始值（不落盘、不连服务器）。
 * ===================================================================== */
(function () {
  'use strict';

  const ok = (data) => ({ ok: true, data });
  const fail = (msg) => ({ ok: false, error: msg });
  function wrap(fn) {
    return function (payload) {
      try {
        return ok(fn(payload || {}));
      } catch (e) {
        return fail((e && e.message) || String(e));
      }
    };
  }

  const pad = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(3, '0');
  const OPERATOR = '演示管理员';

  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function at(offsetDays, hh, mm) {
    const d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    d.setHours(hh == null ? 10 : hh, mm == null ? 0 : mm, 0, 0);
    return iso(d);
  }
  function dayOf(isoStr) { return String(isoStr || '').slice(0, 10); }
  const nowISO = () => iso(new Date());

  /* ---------------- 字典 ---------------- */
  const DICT = {
    orderStatus: [
      { value: 'pending_pay', label: '待付款', type: 'info' },
      { value: 'paid', label: '待发货', type: 'warning' },
      { value: 'shipped', label: '已发货', type: 'primary' },
      { value: 'done', label: '已完成', type: 'success' },
      { value: 'aftersale', label: '售后中', type: 'danger' },
      { value: 'refunded', label: '已退款', type: 'danger' },
      { value: 'canceled', label: '已取消', type: 'info' },
    ],
    channels: ['淘宝', '得物', '抖音', '微信小店', '自营商城'],
    asTypes: [
      { value: 'refund_only', label: '仅退款' },
      { value: 'return_refund', label: '退货退款' },
      { value: 'exchange', label: '换货' },
    ],
    asStatus: [
      { value: 'pending', label: '待处理', type: 'warning' },
      { value: 'agreed', label: '已同意', type: 'success' },
      { value: 'rejected', label: '已拒绝', type: 'info' },
    ],
    goodsStatus: [
      { value: 'on', label: '在售', type: 'success' },
      { value: 'off', label: '已下架', type: 'info' },
    ],
    customerLevel: [
      { value: 'vip', label: 'VIP', type: 'danger' },
      { value: 'normal', label: '普通', type: 'info' },
    ],
    categories: ['服饰', '家居', '数码', '美妆', '运动'],
  };

  /* ---------------- 内存库 ---------------- */
  const db = {
    goods: [], customers: [], orders: [], orderItems: [],
    orderLogs: [], aftersales: [], stockLogs: [],
  };
  let seq = { order: 0, as: 0, item: 0, log: 0, stock: 0 };
  let auth = { failed: 0, lockedUntil: 0 };

  /* ---------------- 工具 ---------------- */
  function goodsById(id) { return db.goods.find((g) => g.id === id) || null; }
  function orderById(id) { return db.orders.find((o) => o.id === id) || null; }
  function customerById(id) { return db.customers.find((c) => c.id === id) || null; }
  function itemsOf(orderId) { return db.orderItems.filter((i) => i.order_id === orderId); }
  function logsOf(orderId) { return db.orderLogs.filter((l) => l.order_id === orderId); }
  function asOf(orderId) { return db.aftersales.filter((a) => a.order_id === orderId); }

  function addLog(orderId, action, from, to, atIso, remark) {
    db.orderLogs.push({
      id: ++seq.log, order_id: orderId, action, from_status: from, to_status: to,
      operator: OPERATOR, remark: remark || '', created_at: atIso || nowISO(),
    });
  }

  /* 库存变动：唯一入口，before/after 都记流水，永不允许出现负数 */
  function stockDelta(goods, delta, type, refNo, remark) {
    const before = Number(goods.stock);
    const after = before + Number(delta);
    if (after < 0) {
      throw new Error('「' + goods.name + '」库存不足：当前库存 ' + before + ' 件，需要 ' + Math.abs(delta) + ' 件');
    }
    goods.stock = after;
    db.stockLogs.push({
      id: ++seq.stock, goods_id: goods.id, sku: goods.sku, name: goods.name,
      type, qty_delta: Number(delta), before_qty: before, after_qty: after,
      ref_no: refNo, operator: OPERATOR, created_at: nowISO(),
    });
    return after;
  }

  function nextOrderNo(dayIso) {
    seq.order += 1;
    return 'SO' + String(dayIso || '').replace(/-/g, '') + pad3(seq.order);
  }
  function nextAsNo() {
    seq.as += 1;
    return 'AS' + String(new Date().getFullYear()) + pad3(seq.as);
  }

  function orderRow(o) {
    const c = customerById(o.customer_id);
    const items = itemsOf(o.id);
    return {
      ...o,
      customer_name: c ? c.name : '—',
      customer_level: c ? c.level : 'normal',
      item_count: items.length,
      qty_total: items.reduce((s, i) => s + Number(i.qty), 0),
      first_title: items.length ? items[0].title : '',
    };
  }

  /* ---------------- 种子数据 ---------------- */
  function seed() {
    db.goods = [
      { id: 1, sku: 'SKU-A1001', name: '男士速干短袖T恤', category: '服饰', price: 89, cost: 42, stock: 320, safety_stock: 50, status: 'on' },
      { id: 2, sku: 'SKU-A1002', name: '女士冰丝防晒衣', category: '服饰', price: 129, cost: 58, stock: 210, safety_stock: 40, status: 'on' },
      { id: 3, sku: 'SKU-A1003', name: '儿童纯棉家居服套装', category: '服饰', price: 79, cost: 35, stock: 8, safety_stock: 30, status: 'on' },
      { id: 4, sku: 'SKU-B2001', name: '便携榨汁杯 350ml', category: '家居', price: 69, cost: 28, stock: 156, safety_stock: 30, status: 'on' },
      { id: 5, sku: 'SKU-B2002', name: '多功能不粘锅 28cm', category: '家居', price: 199, cost: 95, stock: 42, safety_stock: 20, status: 'on' },
      { id: 6, sku: 'SKU-B2003', name: '折叠收纳箱 60L', category: '家居', price: 49, cost: 19, stock: 5, safety_stock: 25, status: 'on' },
      { id: 7, sku: 'SKU-C3001', name: '蓝牙运动耳机', category: '数码', price: 259, cost: 130, stock: 88, safety_stock: 20, status: 'on' },
      { id: 8, sku: 'SKU-C3002', name: '20W 快充充电头', category: '数码', price: 39, cost: 15, stock: 480, safety_stock: 80, status: 'on' },
      { id: 9, sku: 'SKU-C3003', name: '无线充电板 15W', category: '数码', price: 99, cost: 44, stock: 12, safety_stock: 30, status: 'off' },
      { id: 10, sku: 'SKU-D4001', name: '保湿面霜 50g', category: '美妆', price: 159, cost: 62, stock: 74, safety_stock: 20, status: 'on' },
      { id: 11, sku: 'SKU-D4002', name: '氨基酸洁面乳 120g', category: '美妆', price: 59, cost: 21, stock: 190, safety_stock: 40, status: 'on' },
      { id: 12, sku: 'SKU-E5001', name: '轻量跑鞋 41 码', category: '运动', price: 329, cost: 160, stock: 26, safety_stock: 15, status: 'on' },
    ].map((g) => ({ ...g, created_at: nowISO(), updated_at: nowISO() }));

    db.customers = [
      { id: 1, name: '示例买家A', level: 'vip', phone: '13800000001', city: '上海', channel: '淘宝', created_at: at(-320, 10, 0) },
      { id: 2, name: '示例买家B', level: 'normal', phone: '13800000002', city: '杭州', channel: '得物', created_at: at(-260, 11, 30) },
      { id: 3, name: '示例买家C', level: 'vip', phone: '13800000003', city: '成都', channel: '抖音', created_at: at(-210, 9, 15) },
      { id: 4, name: '示例买家D', level: 'normal', phone: '13800000004', city: '武汉', channel: '淘宝', created_at: at(-150, 14, 40) },
      { id: 5, name: '示例买家E', level: 'normal', phone: '13800000005', city: '广州', channel: '微信小店', created_at: at(-90, 16, 20) },
      { id: 6, name: '示例买家F', level: 'vip', phone: '13800000006', city: '北京', channel: '自营商城', created_at: at(-45, 10, 50) },
    ];

    /* 订单：d=相对今天的天数，items=[[商品id, 数量], ...] */
    const orderSeed = [
      { d: 0, h: 9, m: 20, cust: 1, ch: '淘宝', status: 'pending_pay', items: [[1, 2], [8, 1]] },
      { d: 0, h: 10, m: 5, cust: 2, ch: '得物', status: 'paid', items: [[7, 1]] },
      { d: -1, h: 15, m: 30, cust: 3, ch: '抖音', status: 'paid', items: [[2, 1], [10, 1]] },
      { d: -1, h: 20, m: 10, cust: 4, ch: '淘宝', status: 'shipped', items: [[5, 1]], express: ['顺丰速运', 'SF1234567890123'] },
      { d: -2, h: 11, m: 45, cust: 5, ch: '微信小店', status: 'paid', items: [[4, 2], [11, 1], [8, 2]] },
      { d: -3, h: 13, m: 20, cust: 6, ch: '淘宝', status: 'done', items: [[12, 1]] },
      { d: -4, h: 19, m: 5, cust: 1, ch: '得物', status: 'done', items: [[7, 1], [9, 1]] },
      { d: -5, h: 10, m: 30, cust: 3, ch: '抖音', status: 'aftersale', items: [[2, 1]] },
      { d: -6, h: 16, m: 0, cust: 4, ch: '自营商城', status: 'canceled', items: [[1, 1]] },
      { d: -8, h: 12, m: 15, cust: 2, ch: '淘宝', status: 'done', items: [[10, 2], [11, 2]] },
      { d: -10, h: 9, m: 40, cust: 5, ch: '得物', status: 'refunded', items: [[5, 1]] },
      { d: -12, h: 18, m: 25, cust: 6, ch: '抖音', status: 'done', items: [[1, 1], [8, 2], [12, 1]] },
    ];

    orderSeed.forEach((s) => {
      const created = at(s.d, s.h, s.m);
      const order = {
        id: db.orders.length + 1,
        order_no: nextOrderNo(dayOf(created)),
        customer_id: s.cust,
        channel: s.ch,
        status: s.status,
        total_amount: 0,
        item_count: s.items.length,
        remark: '',
        created_at: created,
        paid_at: null, shipped_at: null, done_at: null, canceled_at: null,
        express_company: '', express_no: '',
      };
      let total = 0;
      s.items.forEach(([gid, qty]) => {
        const g = goodsById(gid);
        db.orderItems.push({
          id: ++seq.item, order_id: order.id, goods_id: g.id, sku: g.sku,
          title: g.name, price: g.price, qty, subtotal: g.price * qty,
        });
        total += g.price * qty;
      });
      order.total_amount = total;

      addLog(order.id, '创建订单', null, 'pending_pay', created, '演示数据：买家下单');
      if (s.status !== 'pending_pay' && s.status !== 'canceled') {
        order.paid_at = at(s.d, s.h, Math.min(59, s.m + 8));
        addLog(order.id, '买家付款', 'pending_pay', 'paid', order.paid_at, '支付成功');
      }
      if (['shipped', 'done', 'aftersale', 'refunded'].indexOf(s.status) >= 0) {
        order.shipped_at = at(s.d + 1, 10, 20);
        order.express_company = s.express ? s.express[0] : '中通快递';
        order.express_no = s.express ? s.express[1] : 'ZT' + String(760000000000 + order.id * 137);
        addLog(order.id, '仓库发货', 'paid', 'shipped', order.shipped_at, order.express_company + ' ' + order.express_no);
      }
      if (['done', 'aftersale', 'refunded'].indexOf(s.status) >= 0) {
        order.done_at = at(s.d + 3, 20, 30);
        addLog(order.id, '买家确认收货', 'shipped', 'done', order.done_at, '订单完成');
      }
      if (s.status === 'canceled') {
        order.canceled_at = at(s.d, s.h + 1, s.m);
        addLog(order.id, '买家取消订单', 'pending_pay', 'canceled', order.canceled_at, '未付款超时取消，库存已回补');
      }
      if (s.status === 'aftersale') {
        addLog(order.id, '买家申请售后', 'done', 'aftersale', at(s.d + 4, 9, 10), '申请退货退款');
      }
      if (s.status === 'refunded') {
        addLog(order.id, '买家申请售后', 'done', 'aftersale', at(s.d + 4, 9, 10), '申请仅退款');
        addLog(order.id, '售后同意退款', 'aftersale', 'refunded', at(s.d + 4, 15, 30), '包装破损，已退款');
      }
      db.orders.push(order);
    });

    db.aftersales = [
      {
        id: 1, as_no: nextAsNo(), order_id: 8, type: 'return_refund',
        reason: '尺码偏小，申请退货退款', status: 'pending',
        created_at: at(-1, 9, 10), handled_at: null, remark: '',
      },
      {
        id: 2, as_no: nextAsNo(), order_id: 11, type: 'refund_only',
        reason: '外包装破损，商品有磕碰', status: 'agreed',
        created_at: at(-6, 9, 10), handled_at: at(-6, 15, 30), remark: '已同意，退款原路返回',
      },
      {
        id: 3, as_no: nextAsNo(), order_id: 6, type: 'exchange',
        reason: '颜色与详情页描述不符，申请换货', status: 'rejected',
        created_at: at(-2, 10, 0), handled_at: at(-2, 14, 0), remark: '核实为拍摄色差，不支持换货',
      },
    ];

    db.stockLogs = [
      { id: ++seq.stock, goods_id: 1, sku: 'SKU-A1001', name: '男士速干短袖T恤', type: '入库', qty_delta: 200, before_qty: 120, after_qty: 320, ref_no: 'PO-20261028-01', operator: OPERATOR, created_at: at(-4, 9, 0) },
      { id: ++seq.stock, goods_id: 8, sku: 'SKU-C3002', name: '20W 快充充电头', type: '入库', qty_delta: 300, before_qty: 180, after_qty: 480, ref_no: 'PO-20261028-02', operator: OPERATOR, created_at: at(-4, 9, 5) },
      { id: ++seq.stock, goods_id: 2, sku: 'SKU-A1002', name: '女士冰丝防晒衣', type: '入库', qty_delta: 100, before_qty: 110, after_qty: 210, ref_no: 'PO-20261030-01', operator: OPERATOR, created_at: at(-2, 14, 0) },
    ];
  }

  /* ---------------- 登录 ---------------- */
  const USERS = [{ username: 'admin', password: 'admin123', displayName: '演示管理员', role: 'admin', roleLabel: '店铺管理员' }];

  function login(p) {
    const now = Date.now();
    if (auth.lockedUntil > now) {
      const left = Math.ceil((auth.lockedUntil - now) / 60000);
      throw new Error('账号已锁定，请 ' + left + ' 分钟后再试');
    }
    const u = USERS.find((x) => x.username === String(p.username || '').trim());
    if (!u || u.password !== String(p.password || '')) {
      auth.failed += 1;
      if (auth.failed >= 5) {
        auth.lockedUntil = now + 5 * 60000;
        auth.failed = 0;
        throw new Error('密码连续错误 5 次，账号锁定 5 分钟');
      }
      throw new Error('用户名或密码不正确（还可尝试 ' + (5 - auth.failed) + ' 次）');
    }
    auth.failed = 0;
    return { username: u.username, displayName: u.displayName, role: u.role, roleLabel: u.roleLabel, loginAt: nowISO() };
  }

  /* ---------------- 商品 ---------------- */
  function goodsList(p) {
    const kw = String(p.keyword || '').trim().toLowerCase();
    const cat = p.category || '';
    const st = p.status || '';
    const rows = db.goods.filter((g) => {
      if (cat && g.category !== cat) return false;
      if (st && g.status !== st) return false;
      if (kw) {
        const hay = (g.sku + ' ' + g.name + ' ' + g.category).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    }).map((g) => ({ ...g, is_low: Number(g.stock) <= Number(g.safety_stock) }));
    return { rows, total: rows.length };
  }

  function goodsCreate(p) {
    const sku = String(p.sku || '').trim().toUpperCase();
    const name = String(p.name || '').trim();
    if (!sku) throw new Error('商品编码不能为空');
    if (!name) throw new Error('商品名称不能为空');
    if (db.goods.some((g) => g.sku === sku)) throw new Error('商品编码已存在：' + sku);
    const price = Number(p.price);
    if (!(price > 0)) throw new Error('售价必须大于 0');
    const stock = Number(p.stock || 0);
    if (!Number.isInteger(stock) || stock < 0) throw new Error('初始库存必须是不小于 0 的整数');
    const g = {
      id: db.goods.length + 1, sku, name,
      category: p.category || DICT.categories[0],
      price, cost: Number(p.cost || 0),
      stock, safety_stock: Number(p.safetyStock || 0),
      status: 'on', created_at: nowISO(), updated_at: nowISO(),
    };
    db.goods.push(g);
    return { id: g.id, sku: g.sku };
  }

  function goodsToggle(p) {
    const g = goodsById(Number(p.id));
    if (!g) throw new Error('商品不存在');
    const st = p.status === 'off' ? 'off' : 'on';
    if (g.status === st) throw new Error('商品已是该状态');
    g.status = st;
    g.updated_at = nowISO();
    return { id: g.id, status: g.status };
  }

  function goodsRestock(p) {
    const g = goodsById(Number(p.id));
    if (!g) throw new Error('商品不存在');
    const qty = Number(p.qty);
    if (!Number.isInteger(qty) || qty <= 0) throw new Error('入库数量必须是大于 0 的整数');
    const after = stockDelta(g, qty, '入库', 'PO-' + String(Date.now()).slice(-8));
    return { id: g.id, stock: after };
  }

  /* ---------------- 订单 ---------------- */
  function orderList(p) {
    const kw = String(p.keyword || '').trim().toLowerCase();
    const st = p.status || '';
    const ch = p.channel || '';
    let rows = db.orders.map(orderRow).filter((o) => {
      if (st && o.status !== st) return false;
      if (ch && o.channel !== ch) return false;
      if (kw) {
        const hay = (o.order_no + ' ' + o.customer_name + ' ' + o.channel + ' ' + o.first_title).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
    const page = Math.max(1, Number(p.page || 1));
    const pageSize = Math.max(1, Number(p.pageSize || 20));
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
  }

  function orderGet(p) {
    const o = orderById(Number(p.id));
    if (!o) throw new Error('订单不存在');
    const row = orderRow(o);
    return {
      order: row,
      items: itemsOf(o.id),
      logs: logsOf(o.id).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
      aftersales: asOf(o.id),
    };
  }

  function orderCreate(p) {
    const cust = customerById(Number(p.customerId));
    if (!cust) throw new Error('请选择买家');
    const ch = p.channel;
    if (DICT.channels.indexOf(ch) < 0) throw new Error('请选择下单渠道');
    const items = (p.items || []).filter((i) => i && i.goodsId);
    if (!items.length) throw new Error('订单至少要有一件商品');

    const seen = {};
    const lines = items.map((i) => {
      const gid = Number(i.goodsId);
      if (seen[gid]) throw new Error('同一商品请合并成一行：' + goodsById(gid).name);
      seen[gid] = 1;
      const g = goodsById(gid);
      if (!g) throw new Error('商品不存在：' + gid);
      if (g.status !== 'on') throw new Error('「' + g.name + '」已下架，不能下单');
      const qty = Number(i.qty);
      if (!Number.isInteger(qty) || qty <= 0) throw new Error('「' + g.name + '」数量必须是大于 0 的整数');
      return { goods: g, qty };
    });

    /* 先整单校验库存，再统一扣减：不允许出现「扣了一半」的半成品订单 */
    lines.forEach((l) => {
      if (Number(l.goods.stock) < l.qty) {
        throw new Error('「' + l.goods.name + '」库存不足：当前库存 ' + l.goods.stock + ' 件，需要 ' + l.qty + ' 件');
      }
    });

    const created = nowISO();
    const order = {
      id: db.orders.length + 1,
      order_no: nextOrderNo(dayOf(created)),
      customer_id: cust.id, channel: ch, status: 'pending_pay',
      total_amount: 0, item_count: lines.length, remark: String(p.remark || ''),
      created_at: created,
      paid_at: null, shipped_at: null, done_at: null, canceled_at: null,
      express_company: '', express_no: '',
    };
    let total = 0;
    lines.forEach((l) => {
      const sub = Number(l.goods.price) * l.qty;
      total += sub;
      db.orderItems.push({
        id: ++seq.item, order_id: order.id, goods_id: l.goods.id, sku: l.goods.sku,
        title: l.goods.name, price: Number(l.goods.price), qty: l.qty, subtotal: sub,
      });
      stockDelta(l.goods, -l.qty, '下单扣减', order.order_no);
    });
    order.total_amount = total;
    db.orders.push(order);
    addLog(order.id, '创建订单', null, 'pending_pay', created, '演示：后台代客下单，库存已扣减');
    return { id: order.id, orderNo: order.order_no, total: total };
  }

  function orderPay(p) {
    const o = orderById(Number(p.id));
    if (!o) throw new Error('订单不存在');
    if (o.status !== 'pending_pay') throw new Error('只有「待付款」的订单可以收款');
    o.status = 'paid';
    o.paid_at = nowISO();
    addLog(o.id, '买家付款', 'pending_pay', 'paid', o.paid_at, '支付成功');
    return { id: o.id, status: o.status };
  }

  function orderCancel(p) {
    const o = orderById(Number(p.id));
    if (!o) throw new Error('订单不存在');
    if (o.status !== 'pending_pay' && o.status !== 'paid') {
      throw new Error('只有「待付款」或「待发货」的订单可以取消，当前状态：' + labelOf('orderStatus', o.status));
    }
    const fromStatus = o.status;
    itemsOf(o.id).forEach((it) => {
      const g = goodsById(it.goods_id);
      if (g) stockDelta(g, it.qty, '取消回补', o.order_no);
    });
    o.status = 'canceled';
    o.canceled_at = nowISO();
    addLog(o.id, '取消订单', fromStatus, 'canceled', o.canceled_at, '取消成功，库存已回补');
    return { id: o.id, status: o.status };
  }

  function orderShip(p) {
    const o = orderById(Number(p.id));
    if (!o) throw new Error('订单不存在');
    if (o.status !== 'paid') throw new Error('只有「待发货」的订单可以发货，当前状态：' + labelOf('orderStatus', o.status));
    const company = String(p.expressCompany || '').trim();
    const no = String(p.expressNo || '').trim();
    if (!company) throw new Error('请选择快递公司');
    if (!no) throw new Error('快递单号不能为空');
    if (no.length < 6) throw new Error('快递单号看起来不对（至少 6 位）');
    o.status = 'shipped';
    o.shipped_at = nowISO();
    o.express_company = company;
    o.express_no = no;
    addLog(o.id, '仓库发货', 'paid', 'shipped', o.shipped_at, company + ' ' + no);
    return { id: o.id, status: o.status, expressNo: no };
  }

  function orderComplete(p) {
    const o = orderById(Number(p.id));
    if (!o) throw new Error('订单不存在');
    if (o.status !== 'shipped') throw new Error('只有「已发货」的订单可以确认完成');
    o.status = 'done';
    o.done_at = nowISO();
    addLog(o.id, '买家确认收货', 'shipped', 'done', o.done_at, '订单完成');
    return { id: o.id, status: o.status };
  }

  /* ---------------- 售后 ---------------- */
  function labelOf(kind, v) {
    const d = DICT[kind].find((x) => x.value === v);
    return d ? d.label : v;
  }

  function aftersaleList(p) {
    const kw = String(p.keyword || '').trim().toLowerCase();
    const st = p.status || '';
    const rows = db.aftersales.map((a) => {
      const o = orderById(a.order_id);
      const c = o ? customerById(o.customer_id) : null;
      return {
        ...a,
        order_no: o ? o.order_no : '—',
        customer_name: c ? c.name : '—',
        amount: o ? o.total_amount : 0,
        type_label: labelOf('asTypes', a.type),
      };
    }).filter((a) => {
      if (st && a.status !== st) return false;
      if (kw) {
        const hay = (a.as_no + ' ' + a.order_no + ' ' + a.customer_name + ' ' + a.reason).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { rows, total: rows.length };
  }

  function aftersaleCreate(p) {
    const o = orderById(Number(p.orderId));
    if (!o) throw new Error('订单不存在');
    if (o.status !== 'done') throw new Error('只有「已完成」的订单可以申请售后，当前状态：' + labelOf('orderStatus', o.status));
    const type = p.type;
    if (DICT.asTypes.every((t) => t.value !== type)) throw new Error('请选择售后类型');
    const reason = String(p.reason || '').trim();
    if (!reason) throw new Error('请填写售后原因');
    if (asOf(o.id).some((a) => a.status === 'pending')) throw new Error('该订单已有待处理的售后单');
    const a = {
      id: db.aftersales.length + 1, as_no: nextAsNo(), order_id: o.id,
      type, reason, status: 'pending', created_at: nowISO(), handled_at: null, remark: '',
    };
    db.aftersales.push(a);
    o.status = 'aftersale';
    addLog(o.id, '买家申请售后', 'done', 'aftersale', a.created_at, labelOf('asTypes', type) + '：' + reason);
    return { id: a.id, asNo: a.as_no };
  }

  function aftersaleHandle(p) {
    const a = db.aftersales.find((x) => x.id === Number(p.id));
    if (!a) throw new Error('售后单不存在');
    if (a.status !== 'pending') throw new Error('该售后单已处理过，当前状态：' + labelOf('asStatus', a.status));
    const o = orderById(a.order_id);
    if (!o) throw new Error('关联订单不存在');
    const remark = String(p.remark || '').trim();
    const agree = p.agree === true || p.agree === 'true';

    if (agree) {
      a.status = 'agreed';
      a.handled_at = nowISO();
      a.remark = remark || '已同意';
      /* 退货退款 / 换货 要把货收回，库存回补；仅退款不动库存 */
      if (a.type === 'return_refund' || a.type === 'exchange') {
        itemsOf(o.id).forEach((it) => {
          const g = goodsById(it.goods_id);
          if (g) stockDelta(g, it.qty, '退货回补', a.as_no);
        });
      }
      o.status = 'refunded';
      addLog(o.id, '售后同意退款', 'aftersale', 'refunded', a.handled_at, a.remark);
    } else {
      if (!remark) throw new Error('拒绝售后必须填写原因');
      a.status = 'rejected';
      a.handled_at = nowISO();
      a.remark = remark;
      o.status = 'done';
      addLog(o.id, '售后被拒绝', 'aftersale', 'done', a.handled_at, remark);
    }
    return { id: a.id, status: a.status, orderStatus: o.status };
  }

  /* ---------------- 库存 / 发货 ---------------- */
  function stockList() {
    const goods = db.goods.map((g) => ({ ...g, is_low: Number(g.stock) <= Number(g.safety_stock) }));
    const pendingShip = db.orders.filter((o) => o.status === 'paid').map(orderRow)
      .sort((a, b) => String(a.paid_at || '').localeCompare(String(b.paid_at || '')));
    const logs = db.stockLogs.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 12);
    return { goods, pendingShip, logs };
  }

  /* ---------------- 客户 ---------------- */
  function customers() {
    return db.customers.map((c) => {
      const os = db.orders.filter((o) => o.customer_id === c.id);
      const paid = os.filter((o) => o.status !== 'canceled');
      return {
        ...c,
        order_count: os.length,
        paid_amount: paid.reduce((s, o) => s + Number(o.total_amount), 0),
        last_order_at: os.length ? os.map((o) => o.created_at).sort().slice(-1)[0] : null,
      };
    });
  }

  /* ---------------- 看板 ---------------- */
  function dashboard() {
    const today = dayOf(nowISO());
    const todayOrders = db.orders.filter((o) => dayOf(o.created_at) === today);
    const pendingShip = db.orders.filter((o) => o.status === 'paid');
    const asPending = db.aftersales.filter((a) => a.status === 'pending');

    const valid = db.orders.filter((o) => o.status !== 'canceled');
    const byDay = [];
    for (let i = 13; i >= 0; i -= 1) {
      const day = at(-i, 12, 0).slice(0, 10);
      const dayOrders = valid.filter((o) => dayOf(o.created_at) === day);
      byDay.push({
        date: day.slice(5),
        amount: Math.round(dayOrders.reduce((s, o) => s + Number(o.total_amount), 0) * 100) / 100,
        count: dayOrders.length,
      });
    }
    const sales14 = byDay.reduce((s, d) => s + d.amount, 0);

    const statusDist = DICT.orderStatus.map((s) => ({
      value: s.value, label: s.label,
      count: db.orders.filter((o) => o.status === s.value).length,
    }));

    const soldQty = {};
    db.orders.filter((o) => o.status !== 'canceled').forEach((o) => {
      itemsOf(o.id).forEach((it) => {
        soldQty[it.title] = (soldQty[it.title] || 0) + Number(it.qty);
      });
    });
    const topGoods = Object.keys(soldQty).map((k) => ({ title: k, qty: soldQty[k] }))
      .sort((a, b) => b.qty - a.qty).slice(0, 5);

    const lowStock = db.goods.filter((g) => Number(g.stock) <= Number(g.safety_stock))
      .map((g) => ({ ...g })).sort((a, b) => (a.stock / a.safety_stock) - (b.stock / b.safety_stock));

    const todoAftersale = asPending.map((a) => {
      const o = orderById(a.order_id);
      const c = o ? customerById(o.customer_id) : null;
      return {
        as_no: a.as_no, order_no: o ? o.order_no : '—', customer_name: c ? c.name : '—',
        type_label: labelOf('asTypes', a.type), amount: o ? o.total_amount : 0,
        created_at: a.created_at,
      };
    });

    return {
      cards: {
        todayOrders: todayOrders.length,
        todayAmount: Math.round(todayOrders.reduce((s, o) => s + Number(o.total_amount), 0) * 100) / 100,
        pendingShip: pendingShip.length,
        sales14: Math.round(sales14 * 100) / 100,
        asPending: asPending.length,
      },
      byDay, statusDist, topGoods, lowStock, todoAftersale,
    };
  }

  function info() {
    return {
      appName: '电商订单管理平台', version: 'v0.1.0', mode: '静态网页演示版',
      dataTime: nowISO(),
      counts: {
        goods: db.goods.length, orders: db.orders.length,
        customers: db.customers.length, aftersales: db.aftersales.length,
        items: db.orderItems.length, logs: db.orderLogs.length, stockLogs: db.stockLogs.length,
      },
    };
  }

  /* ---------------- 下单弹窗要用的基础数据 ---------------- */
  function orderFormData() {
    return {
      customers: db.customers.map((c) => ({ id: c.id, name: c.name, level: c.level })),
      goods: db.goods.filter((g) => g.status === 'on').map((g) => ({
        id: g.id, sku: g.sku, name: g.name, price: g.price, stock: g.stock, category: g.category,
      })),
      channels: DICT.channels.slice(),
      doneOrders: db.orders.filter((o) => o.status === 'done').map((o) => ({
        id: o.id, order_no: o.order_no, total_amount: o.total_amount,
        customer_name: (customerById(o.customer_id) || {}).name || '—',
      })),
    };
  }

  /* ---------------- 装配 ---------------- */
  seed();

  window.api = {
    login: wrap(login),
    dict: wrap(() => DICT),
    info: wrap(info),
    dashboard: wrap(dashboard),
    goodsList: wrap(goodsList),
    goodsCreate: wrap(goodsCreate),
    goodsToggle: wrap(goodsToggle),
    goodsRestock: wrap(goodsRestock),
    orderList: wrap(orderList),
    orderGet: wrap(orderGet),
    orderCreate: wrap(orderCreate),
    orderPay: wrap(orderPay),
    orderCancel: wrap(orderCancel),
    orderShip: wrap(orderShip),
    orderComplete: wrap(orderComplete),
    orderFormData: wrap(orderFormData),
    aftersaleList: wrap(aftersaleList),
    aftersaleCreate: wrap(aftersaleCreate),
    aftersaleHandle: wrap(aftersaleHandle),
    stockList: wrap(stockList),
    customers: wrap(customers),
  };

  /* 给验证脚本用的只读探针：查某个 SKU 的当前库存 */
  window.__mockProbe = {
    stockOf(sku) {
      const g = db.goods.find((x) => x.sku === sku);
      return g ? g.stock : null;
    },
    statusOfOrder(orderNo) {
      const o = db.orders.find((x) => x.order_no === orderNo);
      return o ? o.status : null;
    },
  };
}());
