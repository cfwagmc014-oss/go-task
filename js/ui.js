/* GO TASK — UI helpers & shared state */
(function () {
  'use strict';
  const { Core, api } = window.GT;
  const UI = (window.UI = { Core, api, P: {}, S: { ctx: null, me: null, q: '', f: { status: '', prio: '', due: '' }, view: 'cards', charts: [], detail: null, notifOpen: false, usersTab: 'users', adminUsers: null, rep: null } });
  const S = UI.S;

  UI.$ = (s, r = document) => r.querySelector(s);
  UI.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  UI.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = UI.esc;
  UI.fD = (iso) => (iso ? new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-');
  UI.fDT = (iso) => (iso ? new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');
  UI.toLocalInput = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  UI.pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  UI.STL = { todo: 'To Do', in_progress: 'In Progress', blocked: 'Blocked', pending_approval: 'Pending Approval', completed: 'Completed', rework: 'Rework' };
  UI.STH = { todo: 'ยังไม่เริ่ม', in_progress: 'กำลังดำเนินการ', blocked: 'ติดปัญหา', pending_approval: 'รอตรวจสอบ', completed: 'อนุมัติปิดงานแล้ว', rework: 'ส่งกลับแก้ไข' };
  UI.SCOL = { todo: '#9ca3af', in_progress: '#2563eb', blocked: '#D71920', pending_approval: '#d97706', completed: '#16a34a', rework: '#7e22ce' };
  UI.PRI = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
  UI.ROLE = { admin: 'Admin', manager: 'Manager / ASGM', supervisor: 'Supervisor', staff: 'Staff' };
  UI.REC = { none: 'ไม่ทำซ้ำ', daily: 'รายวัน', weekly: 'รายสัปดาห์', monthly: 'รายเดือน' };

  /* lookups */
  UI.user = (id) => (S.ctx.users || []).find((u) => u.id === id);
  UI.uname = (id) => { const u = UI.user(id); return u ? u.full_name : '—'; };
  UI.dname = (id) => { const d = (S.ctx.departments || []).find((x) => x.id === id); return d ? d.name : '—'; };
  UI.cx = () => ({ users: S.ctx.users, teams: S.ctx.teams, teamMembers: S.ctx.teamMembers });

  /* rows = assignment-level (task × assignee) */
  UI.allRows = () => S.ctx.tasks.flatMap((t) => t.assignees.map((a) => ({ t, a })));
  UI.myRows = () => UI.allRows().filter((r) => r.a.user_id === S.me.id);

  UI.metrics = (rows) => {
    const now = Date.now();
    const m = { assigned: rows.length, todo: 0, in_progress: 0, blocked: 0, pending_approval: 0, completed: 0, rework: 0, overdue: 0, ontime: 0, durSum: 0, durN: 0, open: 0 };
    rows.forEach(({ t, a }) => {
      m[a.status]++;
      if (a.status !== 'completed') { m.open++; if (new Date(t.due_date).getTime() < now) m.overdue++; }
      else {
        const done = new Date(a.completed_at || t.completed_at || now).getTime();
        if (done <= new Date(t.due_date).getTime()) m.ontime++;
        m.durSum += (done - new Date(t.start_date).getTime()) / 86400e3; m.durN++;
      }
    });
    m.rate = UI.pct(m.completed, m.assigned);
    m.ontimeRate = UI.pct(m.ontime, m.completed);
    m.overduePct = UI.pct(m.overdue, m.assigned);
    m.avgDays = m.durN ? Math.round((m.durSum / m.durN) * 10) / 10 : 0;
    return m;
  };

  /* small components */
  UI.badge = (s) => `<span class="badge b-${s}" title="${esc(UI.STH[s])}">${UI.STL[s]}</span>`;
  UI.prio = (p) => `<span class="badge p-${p}">${UI.PRI[p]}</span>`;
  UI.bar = (v, late) => `<div class="bar ${late ? 'late' : ''}" title="${v}%"><i style="width:${v}%"></i></div>`;
  UI.dueCell = (t, st) => {
    const due = new Date(t.due_date).getTime(), now = Date.now();
    let rel = '', cls = '';
    if (st !== 'completed') {
      const d = due - now;
      if (d < 0) { const h = Math.floor(-d / 3600e3); rel = 'เกินกำหนด ' + (h >= 24 ? Math.floor(h / 24) + ' วัน' : h + ' ชม.'); cls = 'late'; }
      else if (d < 86400e3) { rel = 'อีก ' + Math.max(1, Math.floor(d / 3600e3)) + ' ชม.'; cls = 'soon'; }
    }
    return `<span class="${cls}">${UI.fDT(t.due_date)}</span>${rel ? `<div class="sub ${cls}">${rel}</div>` : ''}`;
  };
  UI.kpi = (label, value, cls = '') => `<div class="card kpi ${cls}"><div class="l">${label}</div><div class="v">${value}</div></div>`;

  UI.taskCard = ({ t, a }) => {
    const late = Core.isOverdue(t, a);
    return `<div class="card tcard" data-go="#/task/${t.id}">
      <div class="meta"><span>${esc(t.task_no)}</span>${UI.prio(t.priority)}<span style="margin-left:auto">${UI.badge(a.status)}</span></div>
      <div class="t">${esc(t.title)}</div>
      ${UI.bar(a.progress, late)}
      <div class="meta"><span>${a.progress}%</span><span>·</span><span>${UI.dueCell(t, a.status)}</span></div>
      <div class="meta"><span>มอบโดย ${esc(UI.uname(t.created_by))}</span><span>·</span><span>${esc(UI.dname(t.department_id))}</span></div>
    </div>`;
  };

  UI.taskTable = (rows, showAssignee) => {
    if (!rows.length) return '<div class="card empty">ไม่พบงานตามเงื่อนไข</div>';
    return `<div class="tbl-wrap"><table><thead><tr><th>Task ID</th><th>งาน</th>${showAssignee ? '<th>ผู้รับผิดชอบ</th>' : ''}<th>แผนก</th><th>ความสำคัญ</th><th>มอบโดย</th><th>กำหนดส่ง</th><th>สถานะ</th><th>คืบหน้า</th><th>อัปเดตล่าสุด</th></tr></thead><tbody>` +
      rows.map(({ t, a }) => `<tr class="click ${Core.isOverdue(t, a) ? 'hl' : ''}" data-go="#/task/${t.id}"><td>${esc(t.task_no)}</td><td><b>${esc(t.title)}</b></td>${showAssignee ? `<td>${esc(UI.uname(a.user_id))}</td>` : ''}<td>${esc(UI.dname(t.department_id))}</td><td>${UI.prio(t.priority)}</td><td>${esc(UI.uname(t.created_by))}</td><td>${UI.dueCell(t, a.status)}</td><td>${UI.badge(a.status)}</td><td style="min-width:110px">${UI.bar(a.progress, Core.isOverdue(t, a))}<small>${a.progress}%</small></td><td>${UI.fDT(a.updated_at || t.updated_at)}</td></tr>`).join('') + '</tbody></table></div>';
  };

  /* toast / modal */
  let tt;
  UI.toast = (msg, err) => { const el = UI.$('#toast'); el.textContent = msg; el.className = 'toast' + (err ? ' err' : ''); el.hidden = false; clearTimeout(tt); tt = setTimeout(() => (el.hidden = true), err ? 5000 : 2600); };
  UI.modal = (html) => { const m = UI.$('#modal'); m.innerHTML = `<div class="modal">${html}</div>`; m.hidden = false; };
  UI.closeModal = () => { const m = UI.$('#modal'); m.hidden = true; m.innerHTML = ''; };
  UI.askNote = (title, label, cb, required) => {
    UI.modal(`<h3>${esc(title)}</h3><div class="fld"><label>${esc(label)}</label><textarea id="note-in"></textarea></div><div class="row" style="justify-content:flex-end"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn pri" id="note-ok">ยืนยัน</button></div>`);
    UI.$('#note-ok').onclick = () => { const v = UI.$('#note-in').value.trim(); if (required && !v) return UI.toast('กรุณาระบุเหตุผล', true); UI.closeModal(); cb(v); };
    UI.$('#note-in').focus();
  };

  /* run an action → toast → refresh */
  UI.calUrl = (t) => {
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), due = new Date(t.due_date), st = new Date(due.getTime() - 30 * 60000);
    const link = location.origin + location.pathname + '#/task/' + t.id;
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('[GO TASK] ' + t.task_no + ' ' + t.title) + '&dates=' + f(st) + '/' + f(due) + '&details=' + encodeURIComponent((t.description ? t.description + '\n\n' : '') + link) + '&ctz=Asia%2FBangkok';
  };
  let busy = false;
  UI.run = async (fn, okMsg, noRefresh) => {
    if (busy) return UI.toast('กำลังดำเนินการอยู่ กรุณารอสักครู่...', true);
    busy = true;
    document.body.style.cursor = 'progress';
    try { await fn(); if (okMsg) UI.toast(okMsg); if (!noRefresh) await UI.refresh(); }
    catch (e) { UI.toast(e.message || String(e), true); }
    finally { busy = false; document.body.style.cursor = ''; }
  };

  /* charts */
  UI.chartQueue = [];
  UI.chart = (id, cfg) => { UI.chartQueue.push([id, cfg]); return `<div class="chartbox"><canvas id="${id}"></canvas></div>`; };
  UI.drawCharts = () => {
    S.charts.forEach((c) => c.destroy()); S.charts = [];
    UI.chartQueue.forEach(([id, cfg]) => { const el = document.getElementById(id); if (el && window.Chart) S.charts.push(new Chart(el, { ...cfg, options: { responsive: true, maintainAspectRatio: false, ...cfg.options } })); });
    UI.chartQueue = [];
  };
  UI.weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  UI.trend = (rows, unit, n) => { // created (distinct tasks) vs completed (assignments) per period
    const keyOf = (d) => { const x = new Date(d); return unit === 'month' ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` : UI.weekStart(x).toISOString().slice(0, 10); };
    const keys = [], now = new Date();
    for (let i = n - 1; i >= 0; i--) { const d = new Date(now); if (unit === 'month') d.setMonth(d.getMonth() - i); else d.setDate(d.getDate() - i * 7); keys.push(keyOf(d)); }
    const mk = () => Object.fromEntries(keys.map((k) => [k, 0]));
    const created = mk(), done = mk(), ontime = mk(), seen = new Set();
    rows.forEach(({ t, a }) => {
      if (!seen.has(t.id)) { seen.add(t.id); const k = keyOf(t.created_at || t.start_date); if (k in created) created[k]++; }
      if (a.status === 'completed' && a.completed_at) { const k = keyOf(a.completed_at); if (k in done) { done[k]++; if (new Date(a.completed_at) <= new Date(t.due_date)) ontime[k]++; } }
    });
    const lab = keys.map((k) => (unit === 'month' ? k : UI.fD(k)));
    return { lab, created: keys.map((k) => created[k]), done: keys.map((k) => done[k]), ontime: keys.map((k) => ontime[k]) };
  };
})();
