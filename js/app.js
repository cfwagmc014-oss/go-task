/* GO TASK — shell, router, events, boot */
(function () {
  'use strict';
  const UI = window.UI, { Core, api, S, P, esc } = UI, A = UI.acts;
  const $ = UI.$;

  const NAV = [
    { g: 'งานของฉัน', items: [['dashboard', '🏠', 'My Dashboard'], ['tasks', '✅', 'My Tasks']] },
    { g: 'ผู้จัดการ / หัวหน้างาน', test: Core.isLead, items: [['new', '➕', 'มอบหมายงาน'], ['team', '📊', 'Team Dashboard'], ['approvals', '🔎', 'Approval Center'], ['reports', '📈', 'Performance Reports']] },
    { g: 'ผู้ดูแลระบบ', test: Core.isAdmin, items: [['users', '👥', 'User Management']] },
    { g: 'ทั่วไป', items: [['settings', '⚙️', 'Settings']] },
  ];

  const notifHtml = () => {
    const ns = S.ctx.notifications;
    return `<div class="n" style="display:flex;justify-content:space-between"><b>การแจ้งเตือน</b><a href="#" data-act="read-all">อ่านทั้งหมด</a></div>` +
      (ns.length ? ns.map((n) => `<div class="n ${n.read_at ? '' : 'un'}" data-act="notif" data-id="${n.id}" data-t="${n.task_id || ''}"><b>${esc(n.title)}</b>${esc(n.body || '')}<br><small class="sub">${UI.fDT(n.created_at)}</small></div>`).join('') : '<div class="empty">ไม่มีการแจ้งเตือน</div>');
  };

  const draftMenuHtml = () => {
    const ds = S.drafts || [];
    return ds.length ? ds.map((x) => `<div class="n" data-act="draft-open" data-id="${x.id}"><span data-act="draft-del" data-id="${x.id}" title="ลบแบบร่าง" style="float:right;padding:0 4px">🗑</span><b>${esc(x.title)}</b><small class="sub">${UI.fDT(x.updated_at)}</small></div>`).join('') : '<div class="empty">ยังไม่มีแบบร่าง — กรอกฟอร์มมอบหมายงานแล้วกด “บันทึกแบบร่าง”</div>';
  };
  const draftBtnLabel = () => '📝 แบบร่าง' + ((S.drafts || []).length ? ' (' + S.drafts.length + ')' : '');
  UI.refreshDraftMenu = () => { const m = $('#draftmenu'), b = $('#draftbtn'); if (m) { m.innerHTML = draftMenuHtml(); m.hidden = !S.draftMenuOpen; } if (b) b.textContent = draftBtnLabel(); };

  UI.shell = (content) => {
    const me = S.me, unread = S.ctx.notifications.filter((n) => !n.read_at).length;
    const on = (k) => S.page === k || (k === 'tasks' && S.page === 'task') || (k === 'new' && S.page === 'form');
    const nav = NAV.filter((g) => !g.test || g.test(me)).map((g) => `<div class="sep">${g.g}</div>` + g.items.map(([k, ic, l]) => `<a href="#/${k}" class="${on(k) ? 'on' : ''}"><i>${ic}</i>${l}</a>`).join('')).join('');
    const banner = api.mode === 'demo' ? '<div class="banner"><b>โหมดทดลอง</b> — ข้อมูลทั้งหมดเป็นข้อมูลตัวอย่างในเบราว์เซอร์นี้ ไม่ได้เชื่อมต่อฐานข้อมูล การยืนยันตัวตน หรืออีเมลจริง</div>' : '';
    return `<div class="shell"><aside class="side" id="side"><div class="brand"><b>GO TASK</b><span>Go Wholesale ระยอง ST.14</span></div><nav class="nav">${nav}</nav>
      <div class="me"><b>${esc(me.full_name)}</b><br><span class="sub">${UI.ROLE[me.role]}</span><br><a href="#" data-act="logout">ออกจากระบบ</a></div></aside>
      <div class="main"><div class="top noprint"><button class="burger" data-act="nav-toggle">☰</button><input class="search" id="gsearch" placeholder="ค้นหางาน..." value="${esc(S.q)}"><div class="grow"></div>
        ${Core.isLead(me) ? `<button class="bell" id="draftbtn" data-act="draft-menu" style="margin-right:8px">${draftBtnLabel()}</button>` : ''}<button class="bell" data-act="bell">🔔${unread ? `<em id="bellcount">${unread}</em>` : '<em id="bellcount" hidden></em>'}</button></div>
        <div class="notif" id="notif" ${S.notifOpen ? '' : 'hidden'}>${notifHtml()}</div><div class="notif" id="draftmenu" style="right:84px" ${S.draftMenuOpen ? '' : 'hidden'}>${draftMenuHtml()}</div>${banner}<div class="page">${content}</div></div></div>`;
  };

  UI.render = () => {
    if (!S.me || !S.ctx) return;
    const focus = document.activeElement && document.activeElement.id === 'gsearch';
    UI.chartQueue = [];
    let html;
    try { html = (P[S.page] || P.dashboard)(S.arg); } catch (e) { console.error(e); html = `<div class="card empty">เกิดข้อผิดพลาดในการแสดงหน้านี้: ${esc(e.message)}</div>`; }
    document.getElementById('app').innerHTML = UI.shell(html);
    UI.drawCharts();
    if (focus) { const g = $('#gsearch'); g.focus(); g.setSelectionRange(g.value.length, g.value.length); }
  };

  UI.route = async () => {
    if (!S.me || !S.ctx) return;
    const m = (location.hash || '#/dashboard').match(/^#\/([a-z]+)(?:\/([^/?]+))?/) || [];
    let page = m[1] || 'dashboard', arg = m[2];
    if (page === 'new' || page === 'edit') page = 'form';
    if (!P[page]) page = 'dashboard';
    S.page = page; S.arg = arg;
    try {
      S.detail = null;
      if (page !== 'form') S.draft = null;
      if (page === 'task') S.detail = { id: arg, ...(await api.detail(arg)) };
      if (page === 'users' && Core.isAdmin(S.me)) S.adminUsers = await api.listUsers();
    } catch (e) { UI.toast(e.message, true); }
    UI.render();
    window.scrollTo(0, 0);
  };

  const reloadCtx = async () => { S.ctx = await api.loadAll(); S.me = S.ctx.me || S.me; };
  UI.refresh = async (onlyCtx) => { await reloadCtx(); if (!onlyCtx) { const y = window.scrollY; await UI.route(); window.scrollTo(0, y); } };

  let poll;
  UI.enter = async () => {
    try { S.me = await api.myProfile(); } catch (e) { return UI.renderLogin(e.message); }
    if (!S.me) { await api.signOut(); return UI.renderLogin('ไม่พบโปรไฟล์ผู้ใช้ กรุณาติดต่อ Admin'); }
    if (S.me.status !== 'approved') return UI.renderPending(S.me.status);
    try { await reloadCtx(); } catch (e) { return UI.renderLogin('โหลดข้อมูลไม่สำเร็จ: ' + e.message); }
    if (!location.hash || location.hash === '#') location.hash = '#/dashboard';
    if (Core.isLead(S.me)) api.listDrafts().then((d) => { S.drafts = d; UI.refreshDraftMenu(); }).catch(() => { /* ไม่ขัดการใช้งาน */ });
    await UI.route();
    clearInterval(poll);
    poll = setInterval(async () => {
      if (!S.me || document.hidden) return;
      try { const c = await api.loadAll(); S.ctx.notifications = c.notifications; const n = c.notifications.filter((x) => !x.read_at).length, b = $('#bellcount'); if (b) { b.textContent = n; b.hidden = !n; } const p = $('#notif'); if (p) p.innerHTML = notifHtml(); } catch (e) { /* เงียบ — ลองใหม่รอบถัดไป */ }
    }, 120000);
  };

  /* built-in actions */
  A.logout = async (el, ev) => { ev && ev.preventDefault(); clearInterval(poll); try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ } await api.signOut(); S.me = null; S.ctx = null; S.notifOpen = false; location.hash = ''; UI.loginTab = 'in'; UI.renderLogin(); };
  A['nav-toggle'] = () => $('#side').classList.toggle('open');
  A.bell = () => { S.notifOpen = !S.notifOpen; $('#notif').hidden = !S.notifOpen; };
  A['close-modal'] = () => UI.closeModal();
  A['read-all'] = async (el, ev) => { ev.preventDefault(); try { await api.markAllRead(); S.ctx.notifications.forEach((n) => (n.read_at = n.read_at || new Date().toISOString())); UI.render(); } catch (e) { UI.toast(e.message, true); } };
  A.notif = async (el) => {
    const n = S.ctx.notifications.find((x) => x.id === el.dataset.id);
    try { if (n && !n.read_at) { await api.markRead(n.id); n.read_at = new Date().toISOString(); } } catch (e) { /* ไม่ขัดการนำทาง */ }
    S.notifOpen = false;
    if (el.dataset.t) location.hash = '#/task/' + el.dataset.t; else UI.render();
  };
  A['recover-save'] = async () => { const p = document.getElementById('rp').value; if (p.length < 8) return UI.toast('รหัสผ่านอย่างน้อย 8 ตัวอักษร', true); try { await api.updatePassword(p); UI.closeModal(); UI.toast('ตั้งรหัสผ่านใหม่แล้ว'); } catch (e) { UI.toast(e.message, true); } };

  /* events */
  document.addEventListener('click', (e) => {
    if (e.target.id === 'modal') return UI.closeModal();
    if (e.target.closest('.nav a')) $('#side') && $('#side').classList.remove('open');
    if (S.draftMenuOpen && !e.target.closest('#draftmenu') && !e.target.closest('#draftbtn')) { S.draftMenuOpen = false; const m = $('#draftmenu'); if (m) m.hidden = true; }
    if (S.notifOpen && !e.target.closest('#notif') && !e.target.closest('.bell')) { S.notifOpen = false; const p = $('#notif'); if (p) p.hidden = true; }
    const a = e.target.closest('[data-act]');
    if (a && A[a.dataset.act]) A[a.dataset.act](a, e);
    const g = e.target.closest('[data-go]');
    if (g && !g.matches('a')) { const inner = e.target.closest('button,a,input,select,textarea'); if (!inner || inner === g) location.hash = g.dataset.go; }
  });
  const refreshList = () => { const el = $('#tasklist'); if (el) el.innerHTML = UI.taskListHtml(); };
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.flt) { S.f[el.dataset.flt] = el.value; refreshList(); }
    else if (el.dataset.rep) { S.rep[el.dataset.rep] = el.value; UI.render(); }
    else if (el.dataset.chg && UI.chg[el.dataset.chg]) UI.chg[el.dataset.chg](el);
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'gsearch') { S.q = el.value; if (S.page === 'tasks') refreshList(); else if (el.value.trim()) location.hash = '#/tasks'; }
    else if (el.dataset.chg === 'prog') UI.chg.prog(el);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') UI.closeModal(); if (e.key === 'Enter' && e.target.closest('.login') && e.target.tagName === 'INPUT') { const b = e.target.closest('.box').querySelector('[data-act$="-submit"]'); if (b) b.click(); } });
  window.addEventListener('hashchange', () => { S.notifOpen = false; S.draftMenuOpen = false; UI.route(); });

  /* boot */
  (async function boot() {
    if (window.GT.libMissing && !new URLSearchParams(location.search).get('demo')) {
      document.getElementById('app').innerHTML = '<div class="login"><div class="card box"><div class="logo">GO TASK</div><p class="late">โหลดไลบรารี Supabase ไม่สำเร็จ — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือการบล็อก CDN แล้วโหลดหน้าใหม่</p></div></div>';
      return;
    }
    try {
      const signed = await api.init();
      api.onAuth((ev) => {
        if (ev === 'PASSWORD_RECOVERY') UI.modal('<h3>ตั้งรหัสผ่านใหม่</h3><div class="fld"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input type="password" id="rp" autocomplete="new-password"></div><div class="row" style="justify-content:flex-end"><button class="btn pri" data-act="recover-save">บันทึก</button></div>');
        if (ev === 'SIGNED_OUT' && S.me) A.logout();
      });
      if (signed) await UI.enter(); else UI.renderLogin();
    } catch (e) { UI.renderLogin(e.message); }
  })();
})();
