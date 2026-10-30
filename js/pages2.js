/* GO TASK — pages: team dashboard, approvals, reports, user management, settings */
(function () {
  'use strict';
  const UI = window.UI, { Core, api, S, P, esc } = UI, A = UI.acts;
  const val = (id) => (document.getElementById(id) ? document.getElementById(id).value : '');
  const noAccess = '<div class="card empty">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>';
  const group = (rows, keyFn) => { const m = new Map(); rows.forEach((r) => { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
  const BUSY = 5; // งานค้างตั้งแต่ N งาน ถือว่า "งานค้างมาก"

  /* ---------- TEAM / CONTROL TOWER ---------- */
  P.team = () => {
    if (!Core.isLead(S.me)) return noAccess;
    const tasks = S.ctx.tasks, rows = UI.allRows(), m = UI.metrics(rows), now = Date.now();
    const done = tasks.filter((t) => t.status === 'completed').length;
    const overdueT = tasks.filter((t) => Core.isOverdue(t, null)).length;
    const crit = tasks.filter((t) => t.priority === 'critical' && t.status !== 'completed').length;
    const byDept = group(tasks, (t) => UI.dname(t.department_id));
    const byEmp = [...group(rows, (r) => r.a.user_id)].map(([u, rs]) => ({ u, rs, m: UI.metrics(rs) })).sort((a, b) => b.m.open - a.m.open);
    const tr = UI.trend(rows, 'week', 8);
    const c1 = UI.chart('ch-dept', { type: 'bar', data: { labels: [...byDept.keys()], datasets: [{ label: 'จำนวนงาน', data: [...byDept.values()].map((x) => x.length), backgroundColor: '#D71920' }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    const c2 = UI.chart('ch-emp', { type: 'bar', data: { labels: byEmp.map((e) => UI.uname(e.u)), datasets: Object.keys(UI.STL).map((s) => ({ label: UI.STL[s], data: byEmp.map((e) => e.m[s]), backgroundColor: UI.SCOL[s] })) }, options: { indexAxis: 'y', scales: { x: { stacked: true, ticks: { precision: 0 } }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' } } } });
    const c3 = UI.chart('ch-load', { type: 'doughnut', data: { labels: byEmp.filter((e) => e.m.open).map((e) => UI.uname(e.u)), datasets: [{ data: byEmp.filter((e) => e.m.open).map((e) => e.m.open), backgroundColor: ['#D71920', '#2563eb', '#d97706', '#16a34a', '#7e22ce', '#0891b2', '#db2777', '#65a30d', '#9ca3af'] }] }, options: { plugins: { legend: { position: 'right' } } } });
    const c4 = UI.chart('ch-trend', { type: 'line', data: { labels: tr.lab, datasets: [{ label: 'งานที่สร้าง', data: tr.created, borderColor: '#2563eb', tension: .3 }, { label: 'งานที่ปิดแล้ว', data: tr.done, borderColor: '#16a34a', tension: .3 }, { label: 'ปิดทันเวลา', data: tr.ontime, borderColor: '#D71920', borderDash: [5, 4], tension: .3 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    const overdueRows = rows.filter((r) => Core.isOverdue(r.t, r.a)).sort((a, b) => new Date(a.t.due_date) - new Date(b.t.due_date));
    const critTodo = rows.filter((r) => ['critical', 'high'].includes(r.t.priority) && r.a.status === 'todo');
    const li = (r) => `<div class="cmt" style="cursor:pointer" data-go="#/task/${r.t.id}"><b>${esc(r.t.title)}</b><br><small>${esc(UI.uname(r.a.user_id))} · ${UI.prio(r.t.priority)} · ${UI.fDT(r.t.due_date)}</small></div>`;
    const busy = byEmp.filter((e) => e.m.open >= BUSY);
    return `<div class="ph"><h1>Manager Control Tower</h1><div class="sub">ขอบเขต: งานที่คุณมีสิทธิ์เห็น (${tasks.length} งาน · ${rows.length} การมอบหมาย)</div><div class="grow"></div><a class="btn pri" href="#/new">+ มอบหมายงานใหม่</a></div>
    <div class="grid kpis">${UI.kpi('Total Tasks', tasks.length)}${UI.kpi('Completion Rate', UI.pct(done, tasks.length) + '%', 'ok')}${UI.kpi('On-Time Completion', m.ontimeRate + '%', 'ok')}
      ${UI.kpi('Overdue Tasks', overdueT, 'red')}${UI.kpi('Critical Tasks (เปิดอยู่)', crit, 'red')}${UI.kpi('Pending Approval', m.pending_approval, 'warn')}</div>
    <div class="grid g2" style="margin-bottom:14px">
      <div class="card"><h3>งานเกินกำหนด (${overdueRows.length})</h3>${overdueRows.slice(0, 6).map(li).join('') || '<div class="sub">ไม่มี</div>'}</div>
      <div class="card"><h3>งานสำคัญที่ยังไม่เริ่ม (${critTodo.length})</h3>${critTodo.slice(0, 6).map(li).join('') || '<div class="sub">ไม่มี</div>'}</div>
      <div class="card"><h3>พนักงานงานค้างมาก (≥ ${BUSY} งาน)</h3>${busy.map((e) => `<div class="cmt"><b>${esc(UI.uname(e.u))}</b> · ค้าง ${e.m.open} งาน · เกินกำหนด ${e.m.overdue}</div>`).join('') || '<div class="sub">ไม่มี</div>'}</div>
    </div>
    <div class="grid g2" style="margin-bottom:14px">
      <div class="card"><h3>Tasks by Department</h3>${c1}</div><div class="card"><h3>Tasks by Employee</h3>${c2}</div>
      <div class="card"><h3>Workload Distribution (งานค้าง)</h3>${c3}</div><div class="card"><h3>Weekly Performance Trend</h3>${c4}</div>
    </div>
    <div class="card"><h3>ติดตามรายบุคคล (คลิกเพื่อ Drill-down)</h3><div class="tbl-wrap"><table><thead><tr><th>พนักงาน</th><th>ตำแหน่ง</th><th class="num">ทั้งหมด</th><th class="num">ค้าง</th><th class="num">เกินกำหนด</th><th class="num">รออนุมัติ</th><th class="num">เสร็จ</th><th class="num">Completion</th><th class="num">On-Time</th><th></th></tr></thead><tbody>
    ${byEmp.map((e) => { const u = UI.user(e.u) || {}; return `<tr class="click ${e.m.overdue ? 'hl' : ''}" data-act="drill" data-u="${e.u}"><td><b>${esc(UI.uname(e.u))}</b></td><td>${esc(u.position || UI.ROLE[u.role] || '')}</td><td class="num">${e.m.assigned}</td><td class="num">${e.m.open}</td><td class="num ${e.m.overdue ? 'late' : ''}">${e.m.overdue}</td><td class="num">${e.m.pending_approval}</td><td class="num">${e.m.completed}</td><td class="num">${e.m.rate}%</td><td class="num">${e.m.completed ? e.m.ontimeRate + '%' : '-'}</td><td>${e.m.open >= BUSY ? '<span class="badge b-blocked">งานค้างมาก</span>' : ''}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
  };
  A.drill = async (el) => {
    const u = el.dataset.u, rows = UI.allRows().filter((r) => r.a.user_id === u).sort((a, b) => new Date(b.t.due_date) - new Date(a.t.due_date));
    let logs = [];
    try { const ds = await Promise.all(rows.slice(0, 10).map((r) => api.detail(r.t.id).then((d) => d.activity.filter((l) => l.actor_id === u || (l.detail && l.detail.assignee === u)).map((l) => ({ ...l, t: r.t }))))); logs = ds.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12); } catch (e) { /* แสดงเฉพาะรายการงาน */ }
    const m = UI.metrics(rows);
    UI.modal(`<h3>${esc(UI.uname(u))}</h3><div class="chips" style="margin-bottom:10px"><span class="badge b-in_progress">ค้าง ${m.open}</span><span class="badge b-blocked">เกินกำหนด ${m.overdue}</span><span class="badge b-completed">เสร็จ ${m.completed}</span><span class="badge b-todo">Completion ${m.rate}%</span></div>
      <b>งานทั้งหมด</b>${rows.map((r) => `<div class="cmt" style="cursor:pointer" data-go="#/task/${r.t.id}" data-act="close-modal">${UI.badge(r.a.status)} <b>${esc(r.t.title)}</b><br><small>กำหนด ${UI.fDT(r.t.due_date)} · ${r.a.progress}%</small></div>`).join('') || '<div class="sub">ไม่มีงาน</div>'}
      <b style="display:block;margin-top:12px">ประวัติการทำงานล่าสุด</b>${logs.map((l) => `<div class="cmt"><small>${UI.fDT(l.created_at)}</small> · ${esc(l.t.task_no)} · ${l.action === 'status_change' ? UI.STL[l.from_status] + ' → ' + UI.STL[l.to_status] : esc(l.action)}</div>`).join('') || '<div class="sub">ไม่มีประวัติ</div>'}
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="close-modal">ปิด</button></div>`);
  };

  /* ---------- APPROVAL CENTER ---------- */
  P.approvals = () => {
    if (!Core.isLead(S.me)) return noAccess;
    const rows = UI.allRows(), cx = UI.cx();
    const pend = rows.filter((r) => Core.canReview(cx, S.me, r.t, r.a));
    const wait = rows.filter((r) => r.a.status === 'pending_approval' && !Core.canReview(cx, S.me, r.t, r.a));
    const rework = rows.filter((r) => r.a.status === 'rework'), blocked = rows.filter((r) => r.a.status === 'blocked');
    const tbl = (rs, act) => rs.length ? `<div class="tbl-wrap"><table><thead><tr><th>งาน</th><th>ผู้รับผิดชอบ</th><th>กำหนดส่ง</th><th>ส่งเมื่อ</th><th></th></tr></thead><tbody>${rs.map((r) => `<tr><td><a href="#/task/${r.t.id}"><b>${esc(r.t.title)}</b></a><br><small>${esc(r.t.task_no)}</small></td><td>${esc(UI.uname(r.a.user_id))}</td><td>${UI.dueCell(r.t, r.a.status)}</td><td>${UI.fDT(r.a.submitted_at || r.a.updated_at)}</td><td style="white-space:nowrap">${act ? `<button class="btn sm ok" data-act="q-review" data-t="${r.t.id}" data-u="${r.a.user_id}" data-d="approved">อนุมัติ</button> <button class="btn sm" data-act="q-review" data-t="${r.t.id}" data-u="${r.a.user_id}" data-d="rejected">ส่งกลับ</button>` : `<a class="btn sm" href="#/task/${r.t.id}">เปิด</a>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">ไม่มีรายการ</div>';
    return `<div class="ph"><h1>Approval Center</h1></div>
      <h3 style="margin:0 0 8px">รอคุณตรวจสอบ (${pend.length})</h3>${tbl(pend, true)}
      ${wait.length ? `<h3 style="margin:18px 0 8px">รออนุมัติ — ผู้ตรวจสอบคนอื่น (${wait.length})</h3>${tbl(wait, false)}` : ''}
      <h3 style="margin:18px 0 8px">ส่งกลับแก้ไข (${rework.length})</h3>${tbl(rework, false)}
      <h3 style="margin:18px 0 8px">ติดปัญหา (${blocked.length}) — เปิดงานเพื่อ Escalate ให้ Manager</h3>${tbl(blocked, false)}`;
  };
  A['q-review'] = (el) => {
    const { t, u, d } = el.dataset;
    UI.askNote(d === 'approved' ? 'อนุมัติปิดงาน' : 'ส่งกลับแก้ไข', d === 'approved' ? 'หมายเหตุ (ถ้ามี)' : 'เหตุผลที่ส่งกลับ', (n) => UI.run(() => api.review(t, u, d, n), d === 'approved' ? 'อนุมัติปิดงานแล้ว' : 'ส่งกลับแก้ไขแล้ว'), d === 'rejected');
  };

  /* ---------- REPORTS ---------- */
  const dstr = (d) => d.toISOString().slice(0, 10);
  UI.repInit = () => { if (!S.rep) { const a = new Date(), b = new Date(); a.setDate(a.getDate() - 90); b.setDate(b.getDate() + 30); S.rep = { from: dstr(a), to: dstr(b), team: '', user: '', unit: 'week' }; } };
  UI.repData = () => {
    UI.repInit(); const r = S.rep, from = new Date(r.from + 'T00:00:00').getTime(), to = new Date(r.to + 'T23:59:59').getTime();
    const members = r.team ? S.ctx.teamMembers.filter((m) => m.team_id === r.team).map((m) => m.user_id) : null;
    const rows = UI.allRows().filter(({ t, a }) => { const d = new Date(t.due_date).getTime(); return d >= from && d <= to && (!members || members.includes(a.user_id)) && (!r.user || a.user_id === r.user); });
    const emp = [...group(rows, (x) => x.a.user_id)].map(([u, rs]) => ({ name: UI.uname(u), m: UI.metrics(rs) })).sort((a, b) => a.name.localeCompare(b.name, 'th'));
    const dep = [...group(rows, (x) => UI.dname(x.t.department_id))].map(([n, rs]) => ({ name: n, m: UI.metrics(rs) }));
    const aging = [0, 0, 0, 0], now = Date.now();
    rows.filter((x) => x.a.status !== 'completed').forEach(({ t }) => { const d = (now - new Date(t.start_date)) / 86400e3; aging[d <= 3 ? 0 : d <= 7 ? 1 : d <= 14 ? 2 : 3]++; });
    return { rows, emp, dep, aging, m: UI.metrics(rows), tr: UI.trend(rows, r.unit, r.unit === 'month' ? 6 : 8) };
  };
  P.reports = () => {
    if (!Core.isLead(S.me)) return noAccess;
    const R = UI.repData(), r = S.rep, teams = S.ctx.teams;
    const users = [...new Set(UI.allRows().map((x) => x.a.user_id))];
    const mrow = (n, m) => `<tr><td><b>${esc(n)}</b></td><td class="num">${m.assigned}</td><td class="num">${m.completed}</td><td class="num">${m.rate}%</td><td class="num">${m.completed ? m.ontimeRate + '%' : '-'}</td><td class="num ${m.overdue ? 'late' : ''}">${m.overdue} (${m.overduePct}%)</td><td class="num">${m.completed ? m.avgDays + ' วัน' : '-'}</td></tr>`;
    const head = '<thead><tr><th>ชื่อ</th><th class="num">งานทั้งหมด</th><th class="num">เสร็จ</th><th class="num">Completion</th><th class="num">On-Time</th><th class="num">Overdue</th><th class="num">เวลาเฉลี่ย</th></tr></thead>';
    const c1 = UI.chart('rp-emp', { type: 'bar', data: { labels: R.emp.map((e) => e.name), datasets: [{ label: 'Completion %', data: R.emp.map((e) => e.m.rate), backgroundColor: '#16a34a' }, { label: 'On-Time %', data: R.emp.map((e) => e.m.ontimeRate), backgroundColor: '#2563eb' }] }, options: { scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { position: 'bottom' } } } });
    const c2 = UI.chart('rp-age', { type: 'bar', data: { labels: ['0–3 วัน', '4–7 วัน', '8–14 วัน', '>14 วัน'], datasets: [{ label: 'งานค้าง', data: R.aging, backgroundColor: ['#16a34a', '#d97706', '#ea580c', '#D71920'] }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    const c3 = UI.chart('rp-trend', { type: 'line', data: { labels: R.tr.lab, datasets: [{ label: 'งานที่สร้าง', data: R.tr.created, borderColor: '#2563eb', tension: .3 }, { label: 'ปิดแล้ว', data: R.tr.done, borderColor: '#16a34a', tension: .3 }, { label: 'ปิดทันเวลา', data: R.tr.ontime, borderColor: '#D71920', borderDash: [5, 4], tension: .3 }] }, options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    return `<div class="ph"><h1>Performance Reports</h1><div class="sub">หน่วยนับ = การมอบหมายต่อคน (task × ผู้รับผิดชอบ) กรองตามกำหนดส่ง</div><div class="grow"></div><div class="noprint row"><button class="btn" data-act="export-xlsx">Export Excel</button><button class="btn pri" data-act="export-pdf">Export PDF</button></div></div>
    <div class="filters noprint"><label class="sub">จาก <input type="date" data-rep="from" value="${r.from}"></label><label class="sub">ถึง <input type="date" data-rep="to" value="${r.to}"></label>
      <select data-rep="team"><option value="">ทุกทีม</option>${teams.map((t) => `<option value="${t.id}" ${r.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <select data-rep="user"><option value="">ทุกคน</option>${users.map((u) => `<option value="${u}" ${r.user === u ? 'selected' : ''}>${esc(UI.uname(u))}</option>`).join('')}</select>
      <select data-rep="unit"><option value="week" ${r.unit === 'week' ? 'selected' : ''}>แนวโน้มรายสัปดาห์</option><option value="month" ${r.unit === 'month' ? 'selected' : ''}>แนวโน้มรายเดือน</option></select></div>
    <div class="grid kpis">${UI.kpi('งานทั้งหมด', R.m.assigned)}${UI.kpi('Completion Rate', R.m.rate + '%', 'ok')}${UI.kpi('On-Time Delivery', R.m.completed ? R.m.ontimeRate + '%' : '-', 'ok')}${UI.kpi('Overdue Task %', R.m.overduePct + '%', 'red')}${UI.kpi('เวลาเฉลี่ยปิดงาน', R.m.completed ? R.m.avgDays + ' วัน' : '-')}</div>
    <div class="grid g2" style="margin-bottom:14px"><div class="card"><h3>Completion / On-Time by Employee</h3>${c1}</div><div class="card"><h3>Task Aging (งานค้างตามอายุ)</h3>${c2}</div></div>
    <div class="card" style="margin-bottom:14px"><h3>${r.unit === 'month' ? 'Monthly' : 'Weekly'} Trend</h3>${c3}</div>
    <div class="card" style="margin-bottom:14px"><h3>รายบุคคล</h3><div class="tbl-wrap"><table>${head}<tbody>${R.emp.map((e) => mrow(e.name, e.m)).join('') || '<tr><td colspan="7" class="empty">ไม่มีข้อมูลในช่วงเวลาที่เลือก</td></tr>'}</tbody></table></div></div>
    <div class="card"><h3>Department Performance</h3><div class="tbl-wrap"><table>${head}<tbody>${R.dep.map((e) => mrow(e.name, e.m)).join('') || '<tr><td colspan="7" class="empty">ไม่มีข้อมูล</td></tr>'}</tbody></table></div></div>`;
  };
  A['export-pdf'] = () => { UI.toast('เลือก “Save as PDF / บันทึกเป็น PDF” ในหน้าต่างพิมพ์'); setTimeout(() => window.print(), 400); };
  A['export-xlsx'] = () => {
    if (!window.XLSX) return UI.toast('ไม่สามารถโหลดไลบรารี Excel ได้ (ตรวจสอบอินเทอร์เน็ต)', true);
    const R = UI.repData(), r = S.rep;
    const mrow = (n, m) => ({ ชื่อ: n, งานทั้งหมด: m.assigned, เสร็จ: m.completed, 'Completion %': m.rate, 'On-Time %': m.completed ? m.ontimeRate : null, 'Overdue (งาน)': m.overdue, 'Overdue %': m.overduePct, 'เวลาเฉลี่ยปิดงาน (วัน)': m.completed ? m.avgDays : null });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['GO TASK — Performance Report'], ['ช่วงกำหนดส่ง', r.from + ' ถึง ' + r.to], ['ทีม', r.team ? (S.ctx.teams.find((t) => t.id === r.team) || {}).name : 'ทั้งหมด'], ['ผู้รับผิดชอบ', r.user ? UI.uname(r.user) : 'ทั้งหมด'], ['สร้างเมื่อ', new Date().toLocaleString('th-TH')], [], ['งานทั้งหมด', R.m.assigned], ['Completion %', R.m.rate], ['On-Time %', R.m.completed ? R.m.ontimeRate : '-'], ['Overdue %', R.m.overduePct], ['เวลาเฉลี่ยปิดงาน (วัน)', R.m.completed ? R.m.avgDays : '-']]), 'สรุป');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(R.emp.map((e) => mrow(e.name, e.m))), 'รายบุคคล');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(R.dep.map((e) => mrow(e.name, e.m))), 'แผนก');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ ช่วง: '0–3 วัน', งานค้าง: R.aging[0] }, { ช่วง: '4–7 วัน', งานค้าง: R.aging[1] }, { ช่วง: '8–14 วัน', งานค้าง: R.aging[2] }, { ช่วง: '>14 วัน', งานค้าง: R.aging[3] }]), 'Task Aging');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(R.tr.lab.map((l, i) => ({ ช่วง: l, งานที่สร้าง: R.tr.created[i], ปิดแล้ว: R.tr.done[i], ปิดทันเวลา: R.tr.ontime[i] }))), 'Trend');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(R.rows.map(({ t, a }) => ({ 'Task ID': t.task_no, งาน: t.title, ผู้รับผิดชอบ: UI.uname(a.user_id), แผนก: UI.dname(t.department_id), ความสำคัญ: UI.PRI[t.priority], มอบโดย: UI.uname(t.created_by), เริ่ม: UI.fDT(t.start_date), กำหนดส่ง: UI.fDT(t.due_date), สถานะ: UI.STL[a.status], 'ความคืบหน้า %': a.progress, ปิดเมื่อ: a.completed_at ? UI.fDT(a.completed_at) : '' }))), 'รายการงาน');
    XLSX.writeFile(wb, `GO-TASK-report-${dstr(new Date())}.xlsx`);
  };

  /* ---------- USER MANAGEMENT (Admin) ---------- */
  const STU = { pending: 'รออนุมัติ', approved: 'ใช้งาน', suspended: 'ระงับ' };
  P.users = () => {
    if (!Core.isAdmin(S.me)) return noAccess;
    const tab = S.usersTab, tabs = [['users', 'ผู้ใช้งาน'], ['depts', 'แผนก'], ['teams', 'ทีม']];
    const head = `<div class="ph"><h1>จัดการผู้ใช้งาน</h1><div class="grow"></div><div class="seg">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="utab" data-t="${k}">${l}</button>`).join('')}</div></div>`;
    if (tab === 'depts') return head + `<div class="card" style="max-width:560px"><div class="row"><input class="inp" id="d-new" placeholder="ชื่อแผนกใหม่" style="flex:1"><button class="btn pri" data-act="dept-add">เพิ่ม</button></div><div style="margin-top:10px">${S.ctx.departments.map((d) => `<div class="cmt"><b>${esc(d.name)}</b> <button class="btn sm" data-act="dept-rename" data-id="${d.id}">เปลี่ยนชื่อ</button></div>`).join('')}</div></div>`;
    if (tab === 'teams') return head + `<div class="row" style="margin-bottom:12px"><button class="btn pri" data-act="team-edit" data-id="">+ สร้างทีม</button></div>` + (S.ctx.teams.length ? `<div class="tbl-wrap"><table><thead><tr><th>ทีม</th><th>แผนก</th><th>Manager</th><th>สมาชิก</th><th></th></tr></thead><tbody>${S.ctx.teams.map((t) => { const ms = S.ctx.teamMembers.filter((m) => m.team_id === t.id); return `<tr><td><b>${esc(t.name)}</b></td><td>${esc(UI.dname(t.department_id))}</td><td>${esc(UI.uname(t.manager_id))}</td><td>${ms.map((m) => esc(UI.uname(m.user_id)) + (m.member_role === 'supervisor' ? ' (SV)' : '')).join(', ') || '—'}</td><td><button class="btn sm" data-act="team-edit" data-id="${t.id}">แก้ไข</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="card empty">ยังไม่มีทีม — สร้างทีมเพื่อกำหนดว่า Manager/Supervisor ดูแลใคร</div>');
    const us = (S.adminUsers || []).slice().sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || a.full_name.localeCompare(b.full_name, 'th'));
    return head + `<div class="row" style="margin-bottom:12px"><button class="btn pri" data-act="user-edit" data-id="">+ เพิ่มผู้ใช้ (ลงทะเบียนอีเมลล่วงหน้า)</button><span class="sub">พนักงานสมัคร/Login ด้วยอีเมลที่ลงทะเบียน ระบบจะผูกบัญชีอัตโนมัติ · ผู้ที่สมัครเองจะอยู่สถานะ “รออนุมัติ”</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>อีเมล</th><th>ตำแหน่ง</th><th>แผนก</th><th>สิทธิ์</th><th>สถานะ</th><th></th></tr></thead><tbody>${us.map((u) => `<tr class="${u.status === 'pending' ? 'hl' : ''}"><td>${esc(u.employee_id || '-')}</td><td><b>${esc(u.full_name)}</b></td><td>${esc(u.email)}</td><td>${esc(u.position || '')}</td><td>${esc(UI.dname(u.department_id))}</td><td>${UI.ROLE[u.role]}</td><td><span class="badge ${u.status === 'approved' ? 'b-completed' : u.status === 'pending' ? 'b-pending_approval' : 'b-blocked'}">${STU[u.status]}</span></td><td style="white-space:nowrap">${u.status === 'pending' ? `<button class="btn sm ok" data-act="user-edit" data-id="${u.id}" data-approve="1">ตรวจสอบ/อนุมัติ</button>` : `<button class="btn sm" data-act="user-edit" data-id="${u.id}">แก้ไข</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  };
  A.utab = (el) => { S.usersTab = el.dataset.t; UI.render(); };
  A['user-edit'] = (el) => {
    const u = (S.adminUsers || []).find((x) => x.id === el.dataset.id) || { role: 'staff', status: 'approved' };
    const st = el.dataset.approve ? 'approved' : u.status;
    const o = (obj, v) => Object.entries(obj).map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('');
    UI.modal(`<h3>${u.id ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</h3><input type="hidden" id="u-id" value="${u.id || ''}">
      <div class="fld"><label>อีเมล *</label><input id="u-email" type="email" value="${esc(u.email || '')}" ${u.auth_id ? 'readonly title="บัญชีผูกกับ Auth แล้ว"' : ''}></div>
      <div class="row"><div class="fld"><label>รหัสพนักงาน</label><input id="u-emp" value="${esc(u.employee_id || '')}"></div><div class="fld"><label>ชื่อ-นามสกุล *</label><input id="u-name" value="${esc(u.full_name || '')}"></div></div>
      <div class="row"><div class="fld"><label>ตำแหน่ง</label><input id="u-pos" value="${esc(u.position || '')}"></div><div class="fld"><label>แผนก</label><select id="u-dept"><option value="">—</option>${S.ctx.departments.map((d) => `<option value="${d.id}" ${u.department_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div></div>
      <div class="row"><div class="fld"><label>สิทธิ์</label><select id="u-role">${o(UI.ROLE, u.role)}</select></div><div class="fld"><label>สถานะ</label><select id="u-status">${o(STU, st)}</select></div></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn pri" data-act="user-save">บันทึก</button></div>`);
  };
  A['user-save'] = () => {
    const u = { id: val('u-id') || null, email: val('u-email').trim(), employee_id: val('u-emp').trim(), full_name: val('u-name').trim(), position: val('u-pos').trim(), department_id: val('u-dept'), role: val('u-role'), status: val('u-status') };
    if (!u.email || !u.full_name) return UI.toast('กรุณากรอกอีเมลและชื่อ', true);
    if (u.id === S.me.id && (u.role !== 'admin' || u.status !== 'approved')) return UI.toast('ไม่สามารถลดสิทธิ์/ระงับบัญชี Admin ของตนเองได้', true);
    UI.closeModal(); UI.run(() => api.saveUser(u), 'บันทึกผู้ใช้แล้ว');
  };
  A['dept-add'] = () => { const n = val('d-new').trim(); if (n) UI.run(() => api.saveDept({ name: n }), 'เพิ่มแผนกแล้ว'); };
  A['dept-rename'] = (el) => { const d = S.ctx.departments.find((x) => x.id === el.dataset.id), n = prompt('ชื่อแผนกใหม่', d.name); if (n && n.trim()) UI.run(() => api.saveDept({ id: d.id, name: n.trim() }), 'บันทึกแล้ว'); };
  A['team-edit'] = (el) => {
    const t = S.ctx.teams.find((x) => x.id === el.dataset.id) || {}, ms = S.ctx.teamMembers.filter((m) => m.team_id === t.id);
    const mgrs = S.ctx.users.filter((u) => ['admin', 'manager', 'supervisor'].includes(u.role));
    UI.modal(`<h3>${t.id ? 'แก้ไขทีม' : 'สร้างทีม'}</h3><input type="hidden" id="t-id" value="${t.id || ''}">
      <div class="fld"><label>ชื่อทีม *</label><input id="t-name" value="${esc(t.name || '')}"></div>
      <div class="row"><div class="fld"><label>แผนก</label><select id="t-dept"><option value="">—</option>${S.ctx.departments.map((d) => `<option value="${d.id}" ${t.department_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="fld"><label>Manager / ASGM ผู้ดูแลทีม</label><select id="t-mgr"><option value="">—</option>${mgrs.map((u) => `<option value="${u.id}" ${t.manager_id === u.id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select></div></div>
      <div class="fld"><label>สมาชิก (ติ๊ก SV = Supervisor ของทีม)</label><div style="max-height:260px;overflow:auto">${S.ctx.users.map((u) => { const m = ms.find((x) => x.user_id === u.id); return `<div class="chk"><input type="checkbox" class="tm-in" data-u="${u.id}" ${m ? 'checked' : ''}> <span style="flex:1">${esc(u.full_name)} <span class="sub">· ${UI.ROLE[u.role]}</span></span><label class="sub"><input type="checkbox" class="tm-sv" data-u="${u.id}" ${m && m.member_role === 'supervisor' ? 'checked' : ''}> SV</label></div>`; }).join('')}</div></div>
      <div class="row" style="justify-content:space-between">${t.id ? '<button class="btn" data-act="team-del">ลบทีม</button>' : '<span></span>'}<span class="row"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn pri" data-act="team-save">บันทึก</button></span></div>`);
  };
  A['team-save'] = () => {
    const name = val('t-name').trim(); if (!name) return UI.toast('กรุณาระบุชื่อทีม', true);
    const members = UI.$$('.tm-in:checked').map((c) => ({ user_id: c.dataset.u, member_role: UI.$(`.tm-sv[data-u="${c.dataset.u}"]`).checked ? 'supervisor' : 'member' }));
    UI.closeModal();
    UI.run(async () => { const id = await api.saveTeam({ id: val('t-id') || null, name, department_id: val('t-dept'), manager_id: val('t-mgr') }); await api.setTeamMembers(id, members); }, 'บันทึกทีมแล้ว');
  };
  A['team-del'] = () => { if (confirm('ลบทีมนี้? (งานและผู้ใช้จะไม่ถูกลบ)')) { const id = val('t-id'); UI.closeModal(); UI.run(() => api.deleteTeam(id), 'ลบทีมแล้ว'); } };

  /* ---------- SETTINGS ---------- */
  P.settings = () => {
    const me = S.me, st = S.ctx.settings || {}, demo = api.mode === 'demo', gas = api.mode === 'gas', sb = api.mode === 'supabase';
    const TYPES = [['assigned', 'ได้รับมอบหมายงานใหม่'], ['due_soon', 'ก่อนถึงกำหนดส่ง'], ['due_now', 'ครบกำหนดส่ง'], ['overdue', 'เกินกำหนดส่ง (แจ้งซ้ำวันละครั้ง)'], ['submitted', 'มีงานส่งรออนุมัติ'], ['rework', 'ถูกส่งกลับแก้ไข'], ['approved', 'อนุมัติปิดงาน'], ['escalation_supervisor', 'Escalation → Supervisor'], ['escalation_manager', 'Escalation → Manager'], ['escalation_manual', 'Escalate ด้วยมือ → Manager']];
    const DEF = { assigned: [1, 0], due_soon: [1, 0], due_now: [1, 0], overdue: [1, 1], submitted: [1, 0], rework: [1, 0], approved: [1, 0], escalation_supervisor: [1, 1], escalation_manager: [1, 1], escalation_manual: [1, 1] };
    const chv = (t, k) => { const o = (st.channels || {})[t]; return o && o[k] !== undefined ? !!o[k] : !!DEF[t][k === 'line' ? 0 : 1]; };
    const matrix = gas ? `<h3 style="margin-top:16px">ช่องทางแจ้งเตือนแต่ละชนิด <span class="sub">(แจ้งเตือนในแอปส่งเสมอ)</span></h3><div class="tbl-wrap"><table><thead><tr><th>ชนิด</th><th>LINE</th><th>อีเมล</th></tr></thead><tbody>${TYPES.map(([t, l]) => `<tr><td>${l}</td><td><input type="checkbox" class="ch-in" data-t="${t}" data-k="line" ${chv(t, 'line') ? 'checked' : ''}></td><td><input type="checkbox" class="ch-in" data-t="${t}" data-k="email" ${chv(t, 'email') ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:10px"><label class="chk"><input type="checkbox" id="s-line" ${st.line_enabled !== false ? 'checked' : ''}> เปิดส่งทาง LINE</label></div>
      <div class="row"><div class="fld"><label>LINE Group ID — กลุ่ม Supervisor (Escalation)</label><input id="s-gsup" value="${esc(st.line_group_supervisor || '')}" placeholder="Cxxxxxxxx..."></div><div class="fld"><label>LINE Group ID — กลุ่ม Manager (Escalation)</label><input id="s-gmgr" value="${esc(st.line_group_manager || '')}" placeholder="Cxxxxxxxx..."></div></div>
      <p class="sub">หา Group ID: เชิญบอท LINE OA เข้ากลุ่ม แล้วพิมพ์ “groupid” ในกลุ่ม บอทจะตอบกลับ ID</p>` : '';
    const rules = Core.isAdmin(me) ? `<div class="card" style="grid-column:1/-1"><h3>กฎการแจ้งเตือนและ Escalation (Admin)</h3>
      <div class="row"><div class="fld"><label>เตือนก่อนถึงกำหนด (ชั่วโมง)</label><input type="number" min="1" id="s-rem" value="${st.reminder_hours_before ?? 24}"></div>
      <div class="fld"><label>เกินกำหนด → แจ้ง Supervisor (ชั่วโมง)</label><input type="number" min="1" id="s-sup" value="${st.escalate_supervisor_hours ?? 24}"></div>
      <div class="fld"><label>เกินกำหนด → แจ้ง Manager (ชั่วโมง)</label><input type="number" min="1" id="s-mgr" value="${st.escalate_manager_hours ?? 48}"></div></div>
      <label class="chk" style="max-width:360px"><input type="checkbox" id="s-mail" ${st.email_enabled !== false ? 'checked' : ''}> เปิดการส่งอีเมลแจ้งเตือน</label>
      ${matrix}
      <p class="sub">${demo ? 'โหมดทดลองจำลองเฉพาะการแจ้งเตือนในแอป' : gas ? 'ตรวจกำหนดส่ง/Escalation ทุก 15 นาที โดย Time-driven trigger ของ Apps Script' : 'ตรวจกำหนดส่ง/Escalation โดย pg_cron บนฐานข้อมูล'}</p>
      <button class="btn pri" data-act="save-rules">บันทึก</button></div>` : '';
    const lineCard = gas ? `<div class="card"><h3>ผูกบัญชี LINE ของฉัน</h3>${me.line_linked ? '<p><span class="badge b-completed">ผูกแล้ว</span> คุณจะได้รับแจ้งเตือนทาง LINE ตามที่ Admin กำหนด</p>' : '<p><span class="badge b-todo">ยังไม่ผูก</span></p>'}
      <p class="sub">1) กดสร้างรหัส 2) เพิ่มเพื่อน LINE OA ของสาขา 3) พิมพ์รหัส 6 หลักในแชต (รหัสอยู่ได้ 10 นาที)</p><button class="btn" data-act="line-code">สร้างรหัสผูก LINE</button><div id="line-code" style="font-size:28px;font-weight:700;margin-top:8px;letter-spacing:4px"></div></div>` : '';
    const statusCard = demo ? '<p><span class="badge b-pending_approval">โหมดทดลอง</span> ข้อมูลเป็นข้อมูลตัวอย่างในเบราว์เซอร์นี้เท่านั้น ไม่มี Authentication / ฐานข้อมูล / อีเมล / LINE จริง</p><button class="btn" data-act="reset-demo">รีเซ็ตข้อมูลตัวอย่าง</button>'
      : gas ? '<p><span class="badge b-completed">เชื่อมต่อ Apps Script</span> ล็อกอินด้วย Google และตรวจสิทธิ์ที่เซิร์ฟเวอร์ทุกคำสั่ง</p><p class="sub">การส่ง LINE/อีเมลจะสำเร็จได้ก็ต่อเมื่อตั้งค่า LINE_CHANNEL_TOKEN และผูกบัญชี LINE ของผู้รับแล้ว (หน้านี้ตรวจสอบแทนไม่ได้) · แจ้งเตือนในแอปทำงานเสมอ</p>'
      : '<p><span class="badge b-completed">เชื่อมต่อ Supabase</span> สิทธิ์ถูกบังคับที่ฐานข้อมูลด้วย RLS</p><p class="sub">อีเมลแจ้งเตือนจะส่งได้ก็ต่อเมื่อติดตั้ง Edge Function send-email + Database Webhook ตามคู่มือแล้ว</p>';
    return `<div class="ph"><h1>ตั้งค่า</h1></div><div class="grid g2" style="align-items:start">
      <div class="card"><h3>โปรไฟล์</h3><dl class="kv"><dt>ชื่อ</dt><dd>${esc(me.full_name)}</dd><dt>อีเมล</dt><dd>${esc(me.email || '—')}</dd><dt>รหัสพนักงาน</dt><dd>${esc(me.employee_id || '—')}</dd><dt>ตำแหน่ง</dt><dd>${esc(me.position || '—')}</dd><dt>แผนก</dt><dd>${esc(UI.dname(me.department_id))}</dd><dt>สิทธิ์</dt><dd>${UI.ROLE[me.role]}</dd></dl><p class="sub">ข้อมูลโปรไฟล์แก้ไขโดย Admin</p></div>
      <div class="card"><h3>สถานะระบบ</h3>${statusCard}</div>
      ${lineCard}
      ${sb ? `<div class="card"><h3>เปลี่ยนรหัสผ่าน</h3><div class="fld"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input type="password" id="pw-new" autocomplete="new-password"></div><button class="btn" data-act="change-pw">เปลี่ยนรหัสผ่าน</button></div>` : ''}
      ${rules}</div>`;
  };
  A['line-code'] = async () => { try { const r = await api.lineBindCode(); document.getElementById('line-code').textContent = r.code; UI.toast('พิมพ์รหัสนี้ในแชต LINE OA ภายใน ' + r.expires_minutes + ' นาที'); } catch (e) { UI.toast(e.message, true); } };
  A['save-rules'] = () => {
    const n = (id) => Math.max(1, parseInt(val(id), 10) || 24);
    UI.run(async () => {
      await api.saveSetting('reminder_hours_before', n('s-rem')); await api.saveSetting('escalate_supervisor_hours', n('s-sup')); await api.saveSetting('escalate_manager_hours', n('s-mgr'));
      await api.saveSetting('email_enabled', document.getElementById('s-mail').checked);
      if (api.mode === 'gas') {
        const channels = {}; UI.$$('.ch-in').forEach((c) => { (channels[c.dataset.t] = channels[c.dataset.t] || {})[c.dataset.k] = c.checked; });
        await api.saveSetting('channels', channels); await api.saveSetting('line_enabled', document.getElementById('s-line').checked);
        await api.saveSetting('line_group_supervisor', val('s-gsup').trim()); await api.saveSetting('line_group_manager', val('s-gmgr').trim());
      }
    }, 'บันทึกการตั้งค่าแล้ว');
  };
  A['change-pw'] = () => { const p = val('pw-new'); if (p.length < 8) return UI.toast('รหัสผ่านอย่างน้อย 8 ตัวอักษร', true); UI.run(() => api.updatePassword(p), 'เปลี่ยนรหัสผ่านแล้ว', true); };
  A['reset-demo'] = () => { if (confirm('รีเซ็ตข้อมูลตัวอย่างทั้งหมด?')) UI.run(() => api.resetDemo(), 'รีเซ็ตแล้ว'); };
})();
