/* 多租户 SaaS 演示 · 应用逻辑 */
(function () {
  'use strict';

  var ElMessage = ElementPlus.ElMessage;

  var VIEWS = [
    { key: 'dashboard', label: '总览', icon: '◧' },
    { key: 'projects', label: '项目 / 工单', icon: '▤' },
    { key: 'members', label: '成员管理', icon: '☰' },
    { key: 'audit', label: '审计日志', icon: '◷' },
    { key: 'settings', label: '租户设置', icon: '⚙' }
  ];

  var app = Vue.createApp({
    data: function () {
      return {
        mode: 'login',          // login | register
        session: null,
        view: 'dashboard',
        deniedView: '',
        deniedLabel: '',
        loading: false,

        loginForm: { email: 'demo@demo.com', pwd: 'demo123' },
        regForm: { company: '', name: '', email: '', pwd: '' },

        dash: null,
        projects: [],
        members: [],
        audits: [],
        settingsData: null,

        dlgProject: false,
        projectForm: { code: '', name: '', status: '待启动' },
        dlgInvite: false,
        inviteForm: { email: '', role: 'member' },
        settingsForm: { name: '' }
      };
    },

    computed: {
      allowedViews: function () {
        if (!this.session) return [];
        var perms = { owner: ['dashboard', 'projects', 'members', 'audit', 'settings'],
                      admin: ['dashboard', 'projects', 'members', 'audit'],
                      member: ['dashboard', 'projects'] };
        var list = perms[this.session.role] || [];
        return VIEWS.filter(function (v) { return list.indexOf(v.key) >= 0; });
      },
      currentViewLabel: function () {
        var v = VIEWS.filter(function (x) { return x.key === this.view; }, this)[0];
        return v ? v.label : '';
      }
    },

    methods: {
      /* ---------- 会话 ---------- */
      async boot() {
        var r = await window.api.me();
        if (r.ok && r.data) {
          this.session = r.data;
          this.route();
        }
      },
      async doLogin() {
        if (this.loading) return;
        this.loading = true;
        try {
          var r = await window.api.login(this.loginForm);
          if (!r.ok) { ElMessage.error(r.error); return; }
          this.session = r.data;
          this.view = 'dashboard';
          if (location.hash !== '#/dashboard') location.hash = '#/dashboard';
          await this.loadAll();
        } finally { this.loading = false; }
      },
      async doRegister() {
        if (this.loading) return;
        this.loading = true;
        try {
          var r = await window.api.register(this.regForm);
          if (!r.ok) { ElMessage.error(r.error); return; }
          ElMessage.success('租户已创建，你以「所有者」身份进入');
          this.session = r.data;
          this.view = 'dashboard';
          if (location.hash !== '#/dashboard') location.hash = '#/dashboard';
          await this.loadAll();
        } finally { this.loading = false; }
      },
      async logout() {
        await window.api.logout();
        this.session = null;
        this.mode = 'login';
        this.dash = null; this.projects = []; this.members = []; this.audits = []; this.settingsData = null;
      },
      async switchTenant(id) {
        if (id === this.session.tenantId) return;
        var r = await window.api.switchTenant(id);
        if (!r.ok) { ElMessage.error(r.error); return; }
        this.session = r.data;
        ElMessage.success('已切换到「' + r.data.tenantName + '」，当前身份：' + r.data.roleLabel);
        // 切租户后如果当前页面无权限，退回总览
        var allowed = this.allowedViews.map(function (v) { return v.key; });
        if (allowed.indexOf(this.view) < 0) { location.hash = '#/dashboard'; this.view = 'dashboard'; }
        await this.loadAll();
      },

      /* ---------- 路由（含越权拦截） ---------- */
      route() {
        var raw = (location.hash || '').replace(/^#\/?/, '') || 'dashboard';
        if (!this.session) return;
        var allowed = this.allowedViews.map(function (v) { return v.key; });
        if (allowed.indexOf(raw) < 0) {
          this.deniedView = raw;
          var hit = VIEWS.filter(function (v) { return v.key === raw; })[0];
          this.deniedLabel = hit ? hit.label : raw;
          this.view = 'denied';
          window.api.denyLog(raw);
          return;
        }
        this.deniedView = '';
        this.view = raw;
        this.loadView(raw);
      },
      go(key) {
        if (location.hash === '#/' + key) { this.loadView(key); }
        else { location.hash = '#/' + key; }
      },

      /* ---------- 数据 ---------- */
      async loadView(key) {
        if (key === 'dashboard') await this.loadDashboard();
        else if (key === 'projects') await this.loadProjects();
        else if (key === 'members') await this.loadMembers();
        else if (key === 'audit') await this.loadAudits();
        else if (key === 'settings') await this.loadSettings();
      },
      async loadAll() {
        await this.loadDashboard();
        await this.loadProjects();
        if (this.session.role !== 'member') { await this.loadMembers(); await this.loadAudits(); }
        if (this.session.role === 'owner') await this.loadSettings();
      },
      async loadDashboard() {
        var r = await window.api.dashboard();
        if (r.ok) { this.dash = r.data; await this.$nextTick(); this.drawCharts(); }
      },
      async loadProjects() {
        var r = await window.api.projects();
        if (r.ok) this.projects = r.data;
      },
      async loadMembers() {
        var r = await window.api.members();
        if (r.ok) this.members = r.data;
      },
      async loadAudits() {
        var r = await window.api.audit();
        if (r.ok) this.audits = r.data;
      },
      async loadSettings() {
        var r = await window.api.settings();
        if (r.ok) { this.settingsData = r.data; this.settingsForm.name = r.data.name; }
      },

      /* ---------- 写操作 ---------- */
      async createProject() {
        var r = await window.api.createProject(this.projectForm);
        if (!r.ok) { ElMessage.error(r.error); return; }
        ElMessage.success('项目已创建');
        this.dlgProject = false;
        this.projectForm = { code: '', name: '', status: '待启动' };
        await this.loadProjects(); await this.loadDashboard();
      },
      async inviteMember() {
        var r = await window.api.inviteMember(this.inviteForm);
        if (!r.ok) { ElMessage.error(r.error); return; }
        ElMessage.success('已邀请');
        this.dlgInvite = false;
        this.inviteForm = { email: '', role: 'member' };
        await this.loadMembers(); await this.loadDashboard();
      },
      async changeRole(row, role) {
        var r = await window.api.changeRole({ id: row.id, role: role });
        if (!r.ok) { ElMessage.error(r.error); return; }
        ElMessage.success('角色已调整为 ' + (role === 'admin' ? '管理员' : '成员'));
        await this.loadMembers();
      },
      async removeMember(row) {
        var r = await window.api.removeMember({ id: row.id });
        if (!r.ok) { ElMessage.error(r.error); return; }
        ElMessage.success('已移除');
        await this.loadMembers(); await this.loadDashboard();
      },
      async saveSettings() {
        var r = await window.api.saveSettings({ name: this.settingsForm.name });
        if (!r.ok) { ElMessage.error(r.error); return; }
        ElMessage.success('已保存');
        await this.loadSettings();
        var me = await window.api.me();
        if (me.ok) this.session = me.data;
      },
      async resetDemo() {
        await window.api.reset();
        ElMessage.success('演示数据已重置');
        location.hash = '#/dashboard';
        location.reload();
      },

      /* ---------- 图表 ---------- */
      drawCharts() {
        if (!this.dash || !window.echarts) return;
        var elBar = document.getElementById('chart-trend');
        var elPie = document.getElementById('chart-status');
        if (elBar) {
          if (this._bar) this._bar.dispose();
          this._bar = echarts.init(elBar);
          this._bar.setOption({
            grid: { left: 40, right: 18, top: 24, bottom: 30 },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: this.dash.trend.months, axisLine: { lineStyle: { color: '#2a3d55' } }, axisLabel: { color: '#8ba3bf' } },
            yAxis: { type: 'value', splitLine: { lineStyle: { color: '#1a2839' } }, axisLabel: { color: '#8ba3bf' } },
            series: [{
              type: 'line', smooth: true, symbolSize: 7,
              data: this.dash.trend.created,
              itemStyle: { color: '#38bdf8' },
              areaStyle: { color: 'rgba(56,189,248,.16)' }
            }]
          });
        }
        if (elPie) {
          if (this._pie) this._pie.dispose();
          this._pie = echarts.init(elPie);
          this._pie.setOption({
            tooltip: { trigger: 'item' },
            legend: { bottom: 0, textStyle: { color: '#8ba3bf' }, itemWidth: 10, itemHeight: 10 },
            color: ['#38bdf8', '#34d399', '#64748b'],
            series: [{
              type: 'pie', radius: ['48%', '70%'], center: ['50%', '44%'],
              avoidLabelOverlap: true,
              itemStyle: { borderColor: '#0b1420', borderWidth: 3 },
              label: { color: '#cfe0f2', formatter: '{b}\n{c}' },
              data: this.dash.byStatus
            }]
          });
        }
      }
    },

    async mounted() {
      var self = this;
      window.__saasApp = this;   // 演示/自测钩子：便于自动化脚本驱动真实流程
      window.addEventListener('hashchange', function () { self.route(); });
      window.addEventListener('resize', function () {
        if (self._bar) self._bar.resize();
        if (self._pie) self._pie.resize();
      });
      await this.boot();
    }
  });

  app.use(ElementPlus, { locale: (typeof ElementPlusLocaleZhCn !== 'undefined') ? ElementPlusLocaleZhCn : undefined });
  app.mount('#app');
})();
