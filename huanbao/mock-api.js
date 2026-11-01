/* ============================================================
 * mock-api.js — 网页演示版的数据层
 * ------------------------------------------------------------
 * 桌面骨架版的数据来自 Electron 主进程 + SQLite；
 * 网页演示版没有后端，这里用一份内存数据模拟同样的接口，
 * 方法名、返回结构（{ ok, data, error }）与桌面版完全一致，
 * 所以 app.js 一行都不用改就能跑起来。
 *
 * 数据全部是示例数据，页面刷新后恢复初始状态，不写入任何存储。
 * ============================================================ */
(function () {
  'use strict';

  const ROLE_LABEL = { admin: '系统管理员', manager: '运维主管', staff: '运维工程师' };
  const MAX_FAILED = 5;
  const LOCK_MINUTES = 5;
  const DEMO_USER = { id: 1, username: 'admin', display_name: '演示管理员', role: 'admin', password: 'admin123' };

  const DICT = {
    equipmentStatus: [
      { value: 'running', label: '运行中', type: 'success' },
      { value: 'pending_repair', label: '待维修', type: 'warning' },
      { value: 'stopped', label: '已停用', type: 'info' },
    ],
    equipmentCategory: ['反渗透', '超滤', '软化', '加药', '消毒', '其他'],
    maintenanceType: [
      { value: 'routine', label: '例行保养' },
      { value: 'repair', label: '故障维修' },
      { value: 'install', label: '安装调试' },
      { value: 'inspection', label: '巡检' },
    ],
    maintenanceStatus: [
      { value: 'open', label: '未完成' },
      { value: 'done', label: '已完成' },
      { value: 'cancelled', label: '已作废' },
    ],
    cooperationLevel: [
      { value: 'key', label: '重点' },
      { value: 'normal', label: '普通' },
      { value: 'potential', label: '潜在' },
    ],
  };

  /* ---------------- 时间工具（与桌面版 nowISO 同格式） ---------------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoAt(ms) {
    const d = new Date(ms);
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
           `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  }
  const nowISO = () => isoAt(Date.now());
  const dayShift = (days) => isoAt(Date.now() + days * 86400000).slice(0, 10);

  /* ---------------- 初始示例数据（与桌面演示库一致） ---------------- */
  function seed() {
    const now = nowISO();
    const customers = [
      { id: 1, name: '示例客户A（印染厂）', short_name: '示例客户A', contact_person: '张伟', phone: '13800000001', address: '江苏省苏州市', region: '江苏', industry: '印染', cooperation_level: 'key', first_deal_date: '2021-03-15', status: 1, created_at: now, updated_at: now },
      { id: 2, name: '示例客户B（食品厂）', short_name: '示例客户B', contact_person: '李娜', phone: '13800000002', address: '山东省潍坊市', region: '山东', industry: '食品', cooperation_level: 'normal', first_deal_date: '2022-07-08', status: 1, created_at: now, updated_at: now },
      { id: 3, name: '示例客户C（污水厂）', short_name: '示例客户C', contact_person: '王强', phone: '13800000003', address: '河南省新乡市', region: '河南', industry: '市政', cooperation_level: 'key', first_deal_date: '2020-11-20', status: 1, created_at: now, updated_at: now },
    ];

    const eqRaw = [
      [1, 'DX-2021-0001', 'RO-10T', '10t/h 反渗透主机', '反渗透', 1, '江苏厂区一号车间', '2021-04-02', '10 t/h', 'running', '2024-04-01'],
      [2, 'DX-2021-0002', 'RO-10T', '10t/h 反渗透主机', '反渗透', 1, '江苏厂区一号车间', '2021-04-02', '10 t/h', 'running', '2024-04-01'],
      [3, 'DX-2022-0017', 'UF-20T', '20t/h 超滤装置', '超滤', 1, '江苏厂区二号车间', '2022-05-11', '20 t/h', 'pending_repair', '2025-05-10'],
      [4, 'DX-2022-0031', 'SF-8T', '8t/h 软化水设备', '软化', 2, '山东厂区锅炉房', '2022-08-19', '8 t/h', 'running', '2025-08-18'],
      [5, 'DX-2022-0032', 'DZ-500', '加药装置 500L', '加药', 2, '山东厂区加药间', '2022-08-19', '500 L', 'running', '2025-08-18'],
      [6, 'DX-2020-0008', 'RO-30T', '30t/h 反渗透系统', '反渗透', 3, '河南厂区一级处理段', '2020-12-05', '30 t/h', 'running', '2023-12-04'],
      [7, 'DX-2020-0009', 'XD-200', '紫外线消毒器 200W', '消毒', 3, '河南厂区出水口', '2020-12-05', '200 W', 'stopped', '2023-12-04'],
      [8, 'DX-2023-0044', 'RO-5T', '5t/h 反渗透主机', '反渗透', 2, '山东厂区化验室', '2023-03-27', '5 t/h', 'running', '2026-03-26'],
    ];
    const equipments = eqRaw.map((r) => ({
      id: r[0], equipment_no: r[1], model: r[2], name: r[3], category: r[4], customer_id: r[5],
      install_address: r[6], install_date: r[7], capacity: r[8], status: r[9], warranty_end: r[10],
      created_at: now, updated_at: now,
    }));

    const spares = [
      { id: 1, part_no: 'BJ-001', name: '反渗透膜元件', spec: '8040-400GPD', unit: '支', stock_qty: 22, safety_qty: 10, unit_price: 1850, location: 'A架-1层' },
      { id: 2, part_no: 'BJ-002', name: '超滤膜组件', spec: 'UF-2860', unit: '支', stock_qty: 6, safety_qty: 4, unit_price: 2400, location: 'A架-1层' },
      { id: 3, part_no: 'BJ-003', name: '保安过滤器滤芯', spec: '5μm-40寸', unit: '支', stock_qty: 48, safety_qty: 20, unit_price: 85, location: 'A架-2层' },
      { id: 4, part_no: 'BJ-004', name: '加药计量泵', spec: 'GM-500', unit: '台', stock_qty: 2, safety_qty: 2, unit_price: 3200, location: 'B架-1层' },
      { id: 5, part_no: 'BJ-005', name: '石英砂滤料', spec: '0.8-1.2mm', unit: '公斤', stock_qty: 800, safety_qty: 300, unit_price: 6.5, location: 'C区-散装' },
      { id: 6, part_no: 'BJ-006', name: '活性炭滤料', spec: '椰壳 1.5mm', unit: '公斤', stock_qty: 150, safety_qty: 300, unit_price: 12, location: 'C区-散装' },
    ];

    const mRaw = [
      ['2026-07-14', 2, '一段进水浊度偏高，保安过滤器压差上升至 0.09MPa', '更换保安滤芯 4 支（BJ-003），压差恢复正常', 300, 'routine', '2026-10-14'],
      ['2026-08-20', 6, '一级 RO 产水量下降 8%，段间压差 0.15MPa', '低压冲洗 + 阻垢剂加药量上调 20%，产水量恢复', 500, 'inspection', '2026-11-20'],
      ['2026-09-17', 4, '软化器出水硬度 0.05mmol/L，接近上限', '再生程序重设，盐箱补盐 50kg；复测 0.02mmol/L', 400, 'routine', '2026-11-12'],
      ['2026-10-08', 3, 'UF-20T 超滤产水量下降至 12t/h，跨膜压差 0.12MPa', '化学清洗（柠檬酸 2% + NaClO 500ppm），清洗后恢复至 19t/h；建议 11 月复查', 800, 'routine', '2027-01-08'],
      ['2026-10-15', 1, '一段高压泵出口压力波动，产水电导率上升至 8μS/cm', '更换一段膜元件 2 支（BJ-001），产水电导率降至 3μS/cm', 1200, 'repair', null],
      ['2026-10-21', 4, '软化器再生后出水硬度 0.06mmol/L，超标', '更换树脂 50L，调整再生周期由 24h 改为 36h', 600, 'routine', '2026-12-21'],
      ['2026-10-26', 5, '加药泵流量不稳，计量偏差 ±15%', '更换泵头密封件，校准流量计；观察 3 天稳定', 400, 'repair', null],
      ['2026-10-29', 6, '一级 RO 段间压差 0.18MPa，接近报警值', '低压冲洗，压差降至 0.09MPa；建议更换保安滤芯', 300, 'inspection', '2026-12-29'],
    ];
    const maintenances = [];
    const maintenanceParts = [];
    mRaw.forEach((r, i) => {
      const [day, eqId, fault, sol, labor, type, nextDue] = r;
      const eq = equipments.find((e) => e.id === eqId);
      const id = i + 1;
      maintenances.push({
        id, record_no: `WH-${day.replace(/-/g, '')}-${String(id).padStart(3, '0')}`,
        equipment_id: eqId, customer_id: eq.customer_id, type,
        occurred_at: `${day}T09:30:00+08:00`, finished_at: `${day}T16:00:00+08:00`,
        fault_desc: fault, solution: sol, cost_labor: labor, cost_part: 0,
        status: 'done', next_due_date: nextDue, operator_id: DEMO_USER.id,
        created_at: now, updated_at: now,
      });
      // 2026-10-15 那条记录用了 2 支反渗透膜元件（与桌面演示库一致）
      if (id === 5) {
        maintenanceParts.push({ id: 1, maintenance_id: id, part_id: 1, qty: 2, unit_price: 1850, note: '一段膜元件更换' });
        maintenances[4].cost_part = 3700;
      }
    });

    const statusLogs = [
      { id: 1, equipment_id: 3, from_status: 'running', to_status: 'pending_repair', reason: '超滤产水量下降至 12t/h，跨膜压差超标，待更换膜组件', source: 'maintenance', operator_id: 1, changed_at: '2026-10-08T10:20:00+08:00' },
      { id: 2, equipment_id: 1, from_status: 'running', to_status: 'pending_repair', reason: '一段高压泵运行有异响，产水电导率上升，停机待查', source: 'manual', operator_id: 1, changed_at: '2026-09-30T14:05:00+08:00' },
      { id: 3, equipment_id: 1, from_status: 'pending_repair', to_status: 'running', reason: '更换一段膜元件 2 支并冲洗，产水电导率 3μS/cm，复机', source: 'maintenance', operator_id: 1, changed_at: '2026-10-15T16:10:00+08:00' },
      { id: 4, equipment_id: 7, from_status: 'running', to_status: 'stopped', reason: '客户该工段停产，紫外线消毒器断电停用', source: 'manual', operator_id: 1, changed_at: '2026-06-30T09:00:00+08:00' },
    ];

    const settings = [
      { key: 'auto_backup_keep', value: '30', updated_at: now },
      { key: 'company_name', value: '环保运营管理平台（示例）', updated_at: now },
      { key: 'language', value: 'zh-CN', updated_at: now },
      { key: 'theme', value: 'light', updated_at: now },
    ];

    return {
      customers, equipments, spares, maintenances, maintenanceParts, statusLogs, settings,
      user: { failed_count: 0, locked_until: null, last_login_at: null },
      seq: { equipment: 8, maintenance: maintenances.length, log: statusLogs.length },
    };
  }

  const DB = seed();

  /* ---------------- 统一返回包装（与桌面版 IPC 约定一致） ---------------- */
  const ok = (data) => Promise.resolve({ ok: true, data });
  const fail = (msg) => Promise.resolve({ ok: false, error: msg });
  function guard(fn) {
    return function (payload) {
      try { return ok(fn(payload || {})); } catch (e) { return fail(e.message || String(e)); }
    };
  }
  function must(v, name) {
    if (v === undefined || v === null || String(v).trim() === '') throw new Error(`${name}不能为空`);
    return String(v).trim();
  }
  const eqById = (id) => DB.equipments.find((e) => e.id === Number(id));
  const custById = (id) => DB.customers.find((c) => c.id === Number(id));
  const partById = (id) => DB.spares.find((p) => p.id === Number(id));
  const operatorName = () => DEMO_USER.display_name;
  const isLow = (p) => (p.safety_qty > 0 && p.stock_qty <= p.safety_qty ? 1 : 0);

  /* ---------------- 接口实现 ---------------- */
  const api = {
    /* 登录：演示账号 admin / admin123，失败计数与锁定逻辑与桌面版一致 */
    login: guard((p) => {
      const username = must(p.username, '用户名');
      const password = must(p.password, '密码');
      const u = DB.user;
      if (username !== DEMO_USER.username) throw new Error('用户名或密码不正确');
      const now = nowISO();
      if (u.locked_until && u.locked_until > now) {
        throw new Error(`密码错误次数过多，账号锁定至 ${u.locked_until.slice(11, 16)}`);
      }
      if (password !== DEMO_USER.password) {
        u.failed_count += 1;
        if (u.failed_count >= MAX_FAILED) {
          u.locked_until = isoAt(Date.now() + LOCK_MINUTES * 60000);
          throw new Error(`密码连续错误 ${u.failed_count} 次，账号锁定 ${LOCK_MINUTES} 分钟`);
        }
        throw new Error(`用户名或密码不正确（还可尝试 ${MAX_FAILED - u.failed_count} 次）`);
      }
      u.failed_count = 0;
      u.locked_until = null;
      u.last_login_at = now;
      return {
        id: DEMO_USER.id, username: DEMO_USER.username, displayName: DEMO_USER.display_name,
        role: DEMO_USER.role, roleLabel: ROLE_LABEL[DEMO_USER.role], lastLoginAt: now,
      };
    }),

    dict: guard(() => DICT),

    customers: guard(() => DB.customers.map((c) => ({
      ...c, equipment_count: DB.equipments.filter((e) => e.customer_id === c.id).length,
    }))),

    spares: guard(() => DB.spares.map((p) => ({ ...p, is_low: isLow(p) }))),

    info: guard(() => ({
      version: '0.1.0-web-demo',
      dbPath: '浏览器内存（示例数据，刷新即恢复）',
      dataDir: '网页演示版不读写本地文件',
      isDemo: true,
    })),

    /* 首页统计 */
    dashboard: guard(() => {
      const eq = DB.equipments;
      const done = DB.maintenances.filter((m) => m.status === 'done');
      const limit = dayShift(30);
      const byMonthMap = {};
      DB.maintenances.forEach((m) => {
        const ym = String(m.occurred_at).slice(0, 7);
        byMonthMap[ym] = (byMonthMap[ym] || 0) + 1;
      });
      const byTypeMap = {};
      DB.maintenances.forEach((m) => { byTypeMap[m.type] = (byTypeMap[m.type] || 0) + 1; });
      return {
        equipment: {
          total: eq.length,
          running: eq.filter((e) => e.status === 'running').length,
          pending: eq.filter((e) => e.status === 'pending_repair').length,
          stopped: eq.filter((e) => e.status === 'stopped').length,
        },
        maintenance: {
          count: done.length,
          amount: done.reduce((s, m) => s + Number(m.cost_labor || 0) + Number(m.cost_part || 0), 0),
        },
        lowStock: DB.spares.filter((p) => isLow(p)).map((p) => ({
          id: p.id, part_no: p.part_no, name: p.name, spec: p.spec, unit: p.unit,
          stock_qty: p.stock_qty, safety_qty: p.safety_qty,
        })).sort((a, b) => a.stock_qty - b.stock_qty),
        dueSoon: DB.maintenances
          .filter((m) => m.next_due_date && m.next_due_date <= limit)
          .sort((a, b) => (a.next_due_date < b.next_due_date ? -1 : 1))
          .slice(0, 10)
          .map((m) => {
            const e = eqById(m.equipment_id) || {};
            const c = custById(m.customer_id) || {};
            return {
              id: m.id, record_no: m.record_no, next_due_date: m.next_due_date,
              equipment_no: e.equipment_no, eq_name: e.name, customer: c.short_name,
            };
          }),
        byMonth: Object.keys(byMonthMap).sort().map((ym) => ({ ym, c: byMonthMap[ym] })),
        byType: Object.keys(byTypeMap).map((t) => ({ type: t, c: byTypeMap[t] })),
      };
    }),

    /* 设备列表（关键词 / 状态 / 客户 + 分页） */
    equipmentList: guard((p) => {
      const kw = String(p.keyword || '').trim();
      const rows = DB.equipments
        .map((e) => {
          const c = custById(e.customer_id) || {};
          const mains = DB.maintenances.filter((m) => m.equipment_id === e.id);
          return {
            ...e, customer_name: c.short_name,
            maintenance_count: mains.length,
            last_maintenance: mains.length ? mains.map((m) => m.occurred_at).sort().pop() : null,
          };
        })
        .filter((r) => {
          if (kw) {
            const hit = [r.equipment_no, r.model, r.name, r.customer_name]
              .some((v) => String(v || '').toLowerCase().includes(kw.toLowerCase()));
            if (!hit) return false;
          }
          if (p.status && r.status !== p.status) return false;
          if (p.customerId && Number(r.customer_id) !== Number(p.customerId)) return false;
          return true;
        })
        .sort((a, b) => a.id - b.id);
      const pageSize = Number(p.pageSize) || 20;
      const page = Math.max(1, Number(p.page) || 1);
      return {
        rows: rows.slice((page - 1) * pageSize, page * pageSize),
        total: rows.length, page, pageSize,
      };
    }),

    equipmentGet: guard((p) => {
      const e = eqById(p.id);
      if (!e) throw new Error('设备不存在');
      const c = custById(e.customer_id) || {};
      return {
        equipment: {
          ...e, customer_full: c.name, customer_name: c.short_name,
          contact_person: c.contact_person, phone: c.phone,
        },
        logs: DB.statusLogs.filter((l) => l.equipment_id === e.id)
          .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1))
          .map((l) => ({ ...l, operator: operatorName() })),
        maintenances: DB.maintenances.filter((m) => m.equipment_id === e.id)
          .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
          .map((m) => ({ ...m, operator: operatorName() })),
      };
    }),

    equipmentCreate: guard((p) => {
      const equipmentNo = must(p.equipmentNo, '设备编号');
      const model = must(p.model, '型号');
      if (!p.customerId) throw new Error('必须选择归属客户');
      if (DB.equipments.some((e) => e.equipment_no === equipmentNo)) {
        throw new Error(`设备编号已存在：${equipmentNo}`);
      }
      const now = nowISO();
      DB.seq.equipment += 1;
      DB.equipments.push({
        id: DB.seq.equipment, equipment_no: equipmentNo, model, name: String(p.name || '').trim() || model,
        category: p.category || '其他', customer_id: Number(p.customerId),
        install_address: p.installAddress || '', install_date: p.installDate || dayShift(0),
        capacity: p.capacity || '', status: p.status || 'running', warranty_end: p.warrantyEnd || null,
        created_at: now, updated_at: now,
      });
      return { id: DB.seq.equipment, equipment_no: equipmentNo };
    }),

    equipmentChangeStatus: guard((p) => {
      const e = eqById(p.id);
      if (!e) throw new Error('设备不存在');
      const to = must(p.toStatus, '目标状态');
      const reason = must(p.reason, '变更原因');
      if (to === e.status) throw new Error('目标状态与当前状态相同');
      if (!DICT.equipmentStatus.some((s) => s.value === to)) throw new Error('目标状态不合法');
      const from = e.status;
      e.status = to;
      e.updated_at = nowISO();
      DB.seq.log += 1;
      DB.statusLogs.push({
        id: DB.seq.log, equipment_id: e.id, from_status: from, to_status: to,
        reason, source: 'manual', operator_id: DEMO_USER.id, changed_at: nowISO(),
      });
      return { id: e.id, from, to };
    }),

    /* 维护记录列表 */
    maintenanceList: guard((p) => {
      const kw = String(p.keyword || '').trim();
      const rows = DB.maintenances
        .map((m) => {
          const e = eqById(m.equipment_id) || {};
          const c = custById(m.customer_id) || {};
          return {
            ...m, equipment_no: e.equipment_no, eq_name: e.name, model: e.model,
            customer_name: c.short_name, operator: operatorName(),
            part_count: DB.maintenanceParts.filter((x) => x.maintenance_id === m.id).length,
          };
        })
        .filter((r) => {
          if (kw) {
            const hit = [r.record_no, r.equipment_no, r.eq_name, r.customer_name, r.fault_desc]
              .some((v) => String(v || '').toLowerCase().includes(kw.toLowerCase()));
            if (!hit) return false;
          }
          if (p.type && r.type !== p.type) return false;
          if (p.equipmentId && Number(r.equipment_id) !== Number(p.equipmentId)) return false;
          return true;
        })
        .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id));
      const pageSize = Number(p.pageSize) || 20;
      const page = Math.max(1, Number(p.page) || 1);
      return {
        rows: rows.slice((page - 1) * pageSize, page * pageSize),
        total: rows.length, page, pageSize,
      };
    }),

    maintenanceGet: guard((p) => {
      const m = DB.maintenances.find((x) => x.id === Number(p.id));
      if (!m) throw new Error('维护记录不存在');
      const e = eqById(m.equipment_id) || {};
      const c = custById(m.customer_id) || {};
      return {
        record: {
          ...m, equipment_no: e.equipment_no, model: e.model, eq_name: e.name,
          install_address: e.install_address, customer_full: c.name,
          customer_name: c.short_name, operator: operatorName(),
        },
        parts: DB.maintenanceParts.filter((x) => x.maintenance_id === m.id).map((x) => {
          const pt = partById(x.part_id) || {};
          return { ...x, part_no: pt.part_no, name: pt.name, spec: pt.spec, unit: pt.unit };
        }),
      };
    }),

    /* 新增维护记录：领用备件按用量扣库存（与桌面版同一套规则） */
    maintenanceCreate: guard((p) => {
      if (!p.equipmentId) throw new Error('必须选择设备');
      const type = must(p.type, '维护类型');
      const occurredAt = must(p.occurredAt, '发生时间');
      const e = eqById(p.equipmentId);
      if (!e) throw new Error('设备不存在');
      const costLabor = Number(p.costLabor || 0);
      if (!(costLabor >= 0)) throw new Error('人工费必须 ≥ 0');
      const items = Array.isArray(p.parts) ? p.parts : [];

      // 先整体校验库存，再统一扣减（避免扣一半失败）
      const plan = [];
      for (const it of items) {
        const pt = partById(it.partId);
        if (!pt) throw new Error('备件不存在');
        const qty = Number(it.qty);
        if (!(qty > 0)) throw new Error('备件用量必须 > 0');
        if (qty > Number(pt.stock_qty)) {
          throw new Error(`「${pt.name}」库存不足：当前库存 ${pt.stock_qty}${pt.unit}，需要 ${qty}${pt.unit}`);
        }
        plan.push({ part: pt, qty });
      }

      const day = String(occurredAt).slice(0, 10).replace(/-/g, '');
      const sameDay = DB.maintenances.filter((m) => m.record_no.includes(day)).length;
      const recordNo = `WH-${day}-${String(sameDay + 1).padStart(3, '0')}`;
      const now = nowISO();
      DB.seq.maintenance += 1;
      const id = DB.seq.maintenance;
      const costPart = plan.reduce((s, x) => s + Number(x.part.unit_price) * x.qty, 0);

      DB.maintenances.push({
        id, record_no: recordNo, equipment_id: e.id, customer_id: e.customer_id, type,
        occurred_at: occurredAt, finished_at: now, fault_desc: p.faultDesc || '',
        solution: p.solution || '', cost_labor: costLabor, cost_part: costPart,
        status: 'done', next_due_date: p.nextDueDate || null, operator_id: DEMO_USER.id,
        created_at: now, updated_at: now,
      });
      plan.forEach((x) => {
        x.part.stock_qty = Number(x.part.stock_qty) - x.qty;
        DB.maintenanceParts.push({
          id: DB.maintenanceParts.length + 1, maintenance_id: id, part_id: x.part.id,
          qty: x.qty, unit_price: x.part.unit_price, note: '',
        });
      });
      return { id, recordNo, costPart };
    }),

    users: guard(() => [{
      id: DEMO_USER.id, username: DEMO_USER.username, display_name: DEMO_USER.display_name,
      role: DEMO_USER.role, status: 1, last_login_at: DB.user.last_login_at,
      failed_count: DB.user.failed_count,
    }]),

    settings: guard(() => DB.settings.map((s) => ({ ...s }))),

    /* 网页版没有本地数据目录，给一句诚实的提示 */
    openDataDir: guard(() => ({ message: '网页演示版的数据在浏览器内存里，没有本地数据目录；桌面版才有。' })),
  };

  window.api = api;
  // 供调试用：控制台里 __demo 可以直接跳页面（与桌面版截图脚本同名）
  window.__demoDB = DB;
})();
