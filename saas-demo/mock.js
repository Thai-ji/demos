/* 多租户 SaaS 演示 · 数据层（纯前端 mock + localStorage 持久化，无后端、不联网） */
(function (global) {
  'use strict';

  var KEY = 'saas-demo-v1';

  function today(offsetDays) {
    var d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function seed() {
    return {
      seq: 100,
      tenants: [
        { id: 't1', name: '星河科技（演示）', plan: '专业版', quota: 50, storageUsed: 12.4, createdAt: '2025-03-11' },
        { id: 't2', name: '云栖数据（演示）', plan: '基础版', quota: 10, storageUsed: 3.1, createdAt: '2025-09-02' }
      ],
      accounts: [
        { email: 'demo@demo.com', pwd: 'demo123', name: '演示用户' },
        { email: 'li@demo.com', pwd: 'demo123', name: '李工' }
      ],
      memberships: [
        { id: 'm1', email: 'demo@demo.com', tenantId: 't1', role: 'owner' },
        { id: 'm2', email: 'demo@demo.com', tenantId: 't2', role: 'member' },
        { id: 'm3', email: 'li@demo.com', tenantId: 't1', role: 'admin' },
        { id: 'm4', email: 'wang@demo.com', tenantId: 't1', role: 'member' },
        { id: 'm5', email: 'zhao@demo.com', tenantId: 't1', role: 'member' },
        { id: 'm6', email: 'sun@demo.com', tenantId: 't2', role: 'owner' },
        { id: 'm7', email: 'qian@demo.com', tenantId: 't2', role: 'admin' }
      ],
      projects: [
        { id: 'p1', tenantId: 't1', code: 'XH-2041', name: '数据中台一期', status: '进行中', owner: '李工', updatedAt: today(-2) },
        { id: 'p2', tenantId: 't1', code: 'XH-2042', name: '客户画像标签体系', status: '进行中', owner: '王工', updatedAt: today(-5) },
        { id: 'p3', tenantId: 't1', code: 'XH-2043', name: '报表自动化改造', status: '已完成', owner: '赵工', updatedAt: today(-11) },
        { id: 'p4', tenantId: 't1', code: 'XH-2044', name: '接口网关升级', status: '待启动', owner: '李工', updatedAt: today(-1) },
        { id: 'p5', tenantId: 't1', code: 'XH-2045', name: '移动端灰度发布', status: '进行中', owner: '王工', updatedAt: today(-3) },
        { id: 'p6', tenantId: 't1', code: 'XH-2046', name: '数据质量巡检', status: '已完成', owner: '赵工', updatedAt: today(-20) },
        { id: 'p7', tenantId: 't2', code: 'YQ-3001', name: '仓储温控看板', status: '进行中', owner: '孙工', updatedAt: today(-4) },
        { id: 'p8', tenantId: 't2', code: 'YQ-3002', name: '供应商对账脚本', status: '已完成', owner: '钱工', updatedAt: today(-9) },
        { id: 'p9', tenantId: 't2', code: 'YQ-3003', name: '订单异常预警', status: '待启动', owner: '孙工', updatedAt: today(-1) }
      ],
      audit: [
        { id: 'a1', tenantId: 't1', who: '演示用户', role: 'owner', action: '登录系统', at: today(-1) + ' 09:12:04' },
        { id: 'a2', tenantId: 't1', who: '李工', role: 'admin', action: '新建项目 XH-2044 接口网关升级', at: today(-1) + ' 10:31:55' },
        { id: 'a3', tenantId: 't1', who: '王工', role: 'member', action: '更新项目 XH-2042 进度', at: today(-2) + ' 16:08:20' },
        { id: 'a4', tenantId: 't2', who: '演示用户', role: 'member', action: '查看项目 YQ-3001', at: today(-3) + ' 14:22:41' }
      ],
      sessions: { email: 'demo@demo.com', tenantId: 't1' }
    };
  }

  var db = null;

  function load() {
    if (db) return db;
    try {
      var raw = localStorage.getItem(KEY);
      db = raw ? JSON.parse(raw) : seed();
      if (!db || !db.tenants) db = seed();
    } catch (e) {
      db = seed();
    }
    return db;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 隐私模式忽略 */ }
  }
  function nextId(prefix) { db.seq += 1; return prefix + db.seq; }

  /* ---------- 权限 ---------- */
  var ROLE_LABEL = { owner: '所有者', admin: '管理员', member: '成员' };
  var ROLE_PERM = {
    owner: ['dashboard', 'projects', 'members', 'audit', 'settings'],
    admin: ['dashboard', 'projects', 'members', 'audit'],
    member: ['dashboard', 'projects']
  };
  var VIEW_LABEL = { dashboard: '总览', projects: '项目 / 工单', members: '成员管理', audit: '审计日志', settings: '租户设置' };

  function membership(email, tenantId) {
    return db.memberships.find(function (m) { return m.email === email && m.tenantId === tenantId; }) || null;
  }
  function myTenants(email) {
    return db.memberships
      .filter(function (m) { return m.email === email; })
      .map(function (m) {
        var t = db.tenants.find(function (x) { return x.id === m.tenantId; });
        return { id: m.tenantId, name: t ? t.name : m.tenantId, role: m.role, roleLabel: ROLE_LABEL[m.role], plan: t ? t.plan : '' };
      });
  }
  function current() {
    var s = db.sessions;
    if (!s || !s.email) return null;
    var m = membership(s.email, s.tenantId);
    if (!m) return null;
    var acc = db.accounts.find(function (a) { return a.email === s.email; });
    var t = db.tenants.find(function (x) { return x.id === s.tenantId; });
    return {
      email: s.email, name: acc ? acc.name : s.email, tenantId: s.tenantId,
      tenantName: t ? t.name : '', role: m.role, roleLabel: ROLE_LABEL[m.role],
      tenants: myTenants(s.email)
    };
  }
  function can(view) {
    var c = current();
    if (!c) return false;
    return (ROLE_PERM[c.role] || []).indexOf(view) >= 0;
  }
  function log(action) {
    var c = current();
    if (!c) return;
    db.audit.unshift({ id: nextId('a'), tenantId: c.tenantId, who: c.name, role: c.role, action: action, at: stamp() });
    if (db.audit.length > 60) db.audit.length = 60;
  }

  /* ---------- 对外 API ---------- */
  var api = {
    reset: function () {
      db = seed(); save();
      return { ok: true };
    },
    /** 登录：密码错 4 次以内友好提示（演示不锁号） */
    login: function (p) {
      load();
      var acc = db.accounts.find(function (a) { return a.email === String(p.email || '').trim().toLowerCase(); });
      if (!acc) return { ok: false, error: '该邮箱未注册，请先注册' };
      if (acc.pwd !== p.pwd) return { ok: false, error: '邮箱或密码不正确' };
      var mine = myTenants(acc.email);
      if (!mine.length) return { ok: false, error: '该账号还没有所属租户' };
      db.sessions = { email: acc.email, tenantId: mine[0].id };
      log('登录系统');
      save();
      return { ok: true, data: current() };
    },

    /** 注册：一台新租户 + 所有者身份 */
    register: function (p) {
      load();
      var email = String(p.email || '').trim().toLowerCase();
      if (!p.company || !p.company.trim()) return { ok: false, error: '公司名称不能为空' };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: '邮箱格式不正确' };
      if (!p.pwd || String(p.pwd).length < 6) return { ok: false, error: '密码至少 6 位' };
      if (db.accounts.some(function (a) { return a.email === email; })) {
        return { ok: false, error: '该邮箱已注册，请直接登录' };
      }
      var tid = nextId('t');
      db.tenants.push({
        id: tid, name: p.company.trim(), plan: '试用版', quota: 5, storageUsed: 0, createdAt: today(0)
      });
      db.accounts.push({ email: email, pwd: String(p.pwd), name: p.name && p.name.trim() ? p.name.trim() : '管理员' });
      db.memberships.push({ id: nextId('m'), email: email, tenantId: tid, role: 'owner' });
      db.sessions = { email: email, tenantId: tid };
      log('注册并创建租户「' + p.company.trim() + '」');
      save();
      return { ok: true, data: current() };
    },

    logout: function () {
      load();
      db.sessions = { email: '', tenantId: '' };
      save();
      return { ok: true };
    },

    me: function () { load(); return { ok: true, data: current() }; },

    switchTenant: function (tenantId) {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      if (!membership(c.email, tenantId)) return { ok: false, error: '你不在该租户内' };
      db.sessions.tenantId = tenantId;
      log('切换到租户 ' + (db.tenants.find(function (t) { return t.id === tenantId; }) || {}).name);
      save();
      return { ok: true, data: current() };
    },

    /** 总览：只统计当前租户，切租户后必须变 */
    dashboard: function () {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      var ms = db.memberships.filter(function (m) { return m.tenantId === c.tenantId; });
      var ps = db.projects.filter(function (x) { return x.tenantId === c.tenantId; });
      var t = db.tenants.find(function (x) { return x.id === c.tenantId; });
      var byStatus = [
        { name: '进行中', value: ps.filter(function (x) { return x.status === '进行中'; }).length },
        { name: '已完成', value: ps.filter(function (x) { return x.status === '已完成'; }).length },
        { name: '待启动', value: ps.filter(function (x) { return x.status === '待启动'; }).length }
      ];
      return {
        ok: true,
        data: {
          tenantName: c.tenantName, plan: t ? t.plan : '',
          memberCount: ms.length,
          projectCount: ps.length,
          activeCount: ps.filter(function (x) { return x.status === '进行中'; }).length,
          storageUsed: t ? t.storageUsed : 0,
          quota: t ? t.quota : 0,
          byStatus: byStatus,
          trend: { months: ['6月', '7月', '8月', '9月', '10月', '11月'], created: [2, 3, 1, 4, 3, ps.length] }
        }
      };
    },

    projects: function () {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      if (!can('projects')) return { ok: false, error: '无权限访问该项目' };
      return {
        ok: true,
        data: db.projects.filter(function (x) { return x.tenantId === c.tenantId; })
      };
    },

    createProject: function (p) {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      if (!can('projects')) return { ok: false, error: '无权限' };
      if (!p.name || !p.name.trim()) return { ok: false, error: '项目名称不能为空' };
      var code = (p.code && p.code.trim()) || ('PRJ-' + (db.seq + 1));
      if (db.projects.some(function (x) { return x.tenantId === c.tenantId && x.code === code; })) {
        return { ok: false, error: '项目编号在本租户内已存在：' + code };
      }
      db.projects.unshift({
        id: nextId('p'), tenantId: c.tenantId, code: code, name: p.name.trim(),
        status: p.status || '待启动', owner: c.name, updatedAt: today(0)
      });
      log('新建项目 ' + code + ' ' + p.name.trim());
      save();
      return { ok: true };
    },

    members: function () {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      if (!can('members')) return { ok: false, error: '当前角色（' + c.roleLabel + '）无权查看成员管理' };
      var ms = db.memberships.filter(function (m) { return m.tenantId === c.tenantId; });
      return {
        ok: true,
        data: ms.map(function (m) {
          var a = db.accounts.find(function (x) { return x.email === m.email; });
          return { id: m.id, email: m.email, name: a ? a.name : m.email, role: m.role, roleLabel: ROLE_LABEL[m.role] };
        })
      };
    },

    inviteMember: function (p) {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      if (!can('members')) return { ok: false, error: '无权限' };
      var email = String(p.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: '邮箱格式不正确' };
      if (db.memberships.some(function (m) { return m.tenantId === c.tenantId && m.email === email; })) {
        return { ok: false, error: '该成员已在当前租户中' };
      }
      var role = p.role || 'member';
      if (role === 'owner') return { ok: false, error: '不能直接邀请为所有者' };
      if (c.role === 'admin' && role === 'admin') return { ok: false, error: '管理员只能邀请成员，不能邀请管理员' };
      if (!db.accounts.some(function (a) { return a.email === email; })) {
        db.accounts.push({ email: email, pwd: 'demo123', name: email.split('@')[0] });
      }
      db.memberships.push({ id: nextId('m'), email: email, tenantId: c.tenantId, role: role });
      log('邀请成员 ' + email + '（' + ROLE_LABEL[role] + '）');
      save();
      return { ok: true };
    },

    changeRole: function (p) {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      if (c.role !== 'owner') return { ok: false, error: '只有所有者可以调整角色' };
      var m = db.memberships.find(function (x) { return x.id === p.id && x.tenantId === c.tenantId; });
      if (!m) return { ok: false, error: '成员不存在' };
      if (m.role === 'owner') return { ok: false, error: '不能修改所有者的角色' };
      if (['admin', 'member'].indexOf(p.role) < 0) return { ok: false, error: '角色不合法' };
      m.role = p.role;
      log('调整 ' + m.email + ' 的角色为 ' + ROLE_LABEL[p.role]);
      save();
      return { ok: true };
    },

    removeMember: function (p) {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      if (c.role !== 'owner') return { ok: false, error: '只有所有者可以移除成员' };
      var idx = db.memberships.findIndex(function (x) { return x.id === p.id && x.tenantId === c.tenantId; });
      if (idx < 0) return { ok: false, error: '成员不存在' };
      if (db.memberships[idx].role === 'owner') return { ok: false, error: '不能移除所有者' };
      var email = db.memberships[idx].email;
      db.memberships.splice(idx, 1);
      log('移除成员 ' + email);
      save();
      return { ok: true };
    },

    /** 租户设置：仅所有者 */
    settings: function () {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      if (!can('settings')) return { ok: false, error: '当前角色（' + c.roleLabel + '）无权查看租户设置' };
      var t = db.tenants.find(function (x) { return x.id === c.tenantId; });
      return { ok: true, data: { id: t.id, name: t.name, plan: t.plan, quota: t.quota, storageUsed: t.storageUsed, createdAt: t.createdAt } };
    },

    saveSettings: function (p) {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      if (!can('settings')) return { ok: false, error: '无权限' };
      if (!p.name || !p.name.trim()) return { ok: false, error: '租户名称不能为空' };
      var t = db.tenants.find(function (x) { return x.id === c.tenantId; });
      t.name = p.name.trim();
      log('修改租户名称为「' + t.name + '」');
      save();
      return { ok: true };
    },

    audit: function () {
      load();
      var c = current();
      if (!c) return { ok: false, error: '未登录' };
      if (!can('audit')) return { ok: false, error: '当前角色（' + c.roleLabel + '）无权查看审计日志' };
      return {
        ok: true,
        data: db.audit.filter(function (x) { return x.tenantId === c.tenantId; })
      };
    },

    /** 越权访问时记一条，证明拦截留下了痕迹 */
    denyLog: function (view) {
      load();
      log('尝试越权访问「' + (VIEW_LABEL[view] || view) + '」，已拦截');
      save();
      return { ok: true };
    },

    meta: function () {
      return { ok: true, data: { roleLabel: ROLE_LABEL, views: VIEW_LABEL, perms: ROLE_PERM } };
    }
  };

  global.api = api;
  load();
})(window);
