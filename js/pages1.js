/* GO TASK — pages: login, dashboard, my tasks, task detail, create/edit */
(function () {
  'use strict';
  const UI = window.UI, { Core, api, S, P, esc } = UI;
  UI.acts = UI.acts || {};
  const A = UI.acts;
  const val = (id) => (document.getElementById(id) ? document.getElementById(id).value : '');

  /* ---------- LOGIN / PENDING ---------- */
  UI.loginTab = 'in';
  UI.renderLogin = (msg) => {
    const demo = api.mode === 'demo';
    const gas = api.mode === 'gas';
    let body;
    if (gas) {
      const inLine = /Line\//i.test(navigator.userAgent);
      body = `${inLine ? '<div class="banner" style="margin:0 0 10px;border-radius:8px;border:1px solid #f5d28a"><b>เปิดจากแอป LINE?</b> Google จะบล็อกการล็อกอินในเบราว์เซอร์ของ LINE — กด ⋯ แล้วเลือก “เปิดในเบราว์เซอร์” (Chrome / Safari) ก่อน</div>' : ''}
        <p class="sub" style="margin:0 0 10px">เข้าสู่ระบบด้วยบัญชี Google ของคุณ (อีเมลที่ Admin ลงทะเบียนไว้) บัญชีใหม่ที่ยังไม่ลงทะเบียนจะอยู่สถานะ “รออนุมัติ”</p>
        ${window.GT.googleClientId ? '<div id="g-btn" style="min-height:44px"></div>' : '<div class="late">ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID ใน config.js</div>'}`;
    } else if (demo) {
      const us = api.demoUsers();
      body = `<div class="demo-list"><p class="sub" style="margin:0 0 6px">เลือกผู้ใช้ตัวอย่างเพื่อทดสอบแต่ละบทบาท (ไม่ต้องใช้รหัสผ่าน)</p>` +
        us.map((u) => `<button class="btn" data-act="demo-login" data-id="${u.id}"><span>${esc(u.full_name)}</span><span class="sub">${UI.ROLE[u.role]}</span></button>`).join('') + '</div>';
    } else if (UI.loginTab === 'reset') {
      body = `<div class="fld"><label>อีเมล</label><input id="l-email" type="email" autocomplete="email"></div><button class="btn pri" style="width:100%" data-act="reset-submit">ส่งลิงก์รีเซ็ตรหัสผ่าน</button>
        <p class="sub"><a href="#" data-act="tab" data-t="in">กลับไปเข้าสู่ระบบ</a></p>`;
    } else {
      const up = UI.loginTab === 'up';
      body = `${up ? '<div class="fld"><label>ชื่อ-นามสกุล</label><input id="l-name" autocomplete="name"></div>' : ''}
        <div class="fld"><label>อีเมล</label><input id="l-email" type="email" autocomplete="email"></div>
        <div class="fld"><label>รหัสผ่าน</label><input id="l-pw" type="password" autocomplete="${up ? 'new-password' : 'current-password'}"></div>
        <button class="btn pri" style="width:100%" data-act="${up ? 'signup-submit' : 'login-submit'}">${up ? 'สมัครใช้งาน (รอ Admin อนุมัติ)' : 'เข้าสู่ระบบ'}</button>
        <button class="btn" style="width:100%;margin-top:8px" data-act="google">เข้าสู่ระบบด้วย Google</button>
        <p class="sub" style="margin-top:10px">${up ? '<a href="#" data-act="tab" data-t="in">มีบัญชีแล้ว? เข้าสู่ระบบ</a>' : '<a href="#" data-act="tab" data-t="up">สมัครใช้งาน</a> · <a href="#" data-act="tab" data-t="reset">ลืมรหัสผ่าน</a>'}</p>`;
    }
    const note = demo
      ? `<div class="banner" style="margin:12px 0;border-radius:8px;border:1px solid #f5d28a"><b>โหมดทดลอง</b> — ${window.GT.configured ? 'คุณเปิดด้วย ?demo=1' : 'ยังไม่ได้ตั้งค่า Supabase ใน config.js'} ข้อมูลทั้งหมดเป็นข้อมูลตัวอย่างที่เก็บในเบราว์เซอร์นี้ ไม่มีการยืนยันตัวตน ฐานข้อมูล หรืออีเมลจริง${window.GT.configured ? ' · <a href="' + location.pathname + '">กลับไประบบจริง</a>' : ''}</div>`
      : window.GT.canDemo ? `<p class="sub" style="margin-top:14px">ต้องการทดลองระบบ? <a href="?demo=1">เปิดโหมดทดลอง (ข้อมูลตัวอย่าง)</a></p>` : '';
    document.getElementById('app').innerHTML = `<div class="login"><div class="card box"><div class="logo">GO TASK</div><div class="sub">Smart Task Management · Go Wholesale ระยอง ST.14</div>${note}${msg ? `<div class="late" style="margin:8px 0">${esc(msg)}</div>` : ''}<div style="margin-top:10px">${body}</div></div></div>`;
    const first = document.getElementById('l-email'); if (first) first.focus();
    if (gas) UI.initGoogle();
  };
  UI.initGoogle = () => {
    const el = document.getElementById('g-btn'); if (!el) return;
    let tries = 0;
    const go = () => {
      if (!window.google || !window.google.accounts) { if (tries++ < 40) return setTimeout(go, 300); el.innerHTML = '<div class="late">โหลด Google Sign-In ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต</div>'; return; }
      google.accounts.id.initialize({ client_id: window.GT.googleClientId, callback: async (r) => { try { await api.googleLogin(r.credential); await UI.enter(); } catch (e) { UI.renderLogin(e.message); } } });
      google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', width: 300, locale: 'th' });
    };
    go();
  };
  UI.renderPending = (st) => {
    document.getElementById('app').innerHTML = `<div class="login"><div class="card box"><div class="logo">GO TASK</div><h3 style="margin-top:12px">${st === 'suspended' ? 'บัญชีนี้ถูกระงับการใช้งาน' : 'บัญชีของคุณรอ Admin อนุมัติ'}</h3><p class="sub">${st === 'suspended' ? 'กรุณาติดต่อผู้ดูแลระบบ' : 'หลัง Admin ผูกอีเมลกับรหัสพนักงาน แผนก และสิทธิ์แล้ว จึงจะเข้าใช้งานได้ — ลอง Login ใหม่อีกครั้งภายหลัง'}</p><button class="btn" data-act="logout">ออกจากระบบ</button></div></div>`;
  };
  A.tab = (el, ev) => { ev.preventDefault(); UI.loginTab = el.dataset.t; UI.renderLogin(); };
  A['login-submit'] = async () => { try { await api.signIn(val('l-email').trim(), val('l-pw')); await UI.enter(); } catch (e) { UI.renderLogin(e.message); } };
  A['signup-submit'] = async () => {
    const pw = val('l-pw'); if (pw.length < 8) return UI.toast('รหัสผ่านอย่างน้อย 8 ตัวอักษร', true);
    try { await api.signUp(val('l-email').trim(), pw, val('l-name').trim()); UI.loginTab = 'in'; UI.renderLogin('สมัครแล้ว — หากระบบกำหนดให้ยืนยันอีเมล กรุณายืนยันก่อน แล้วรอ Admin อนุมัติ'); } catch (e) { UI.toast(e.message, true); }
  };
  A['reset-submit'] = async () => { try { await api.resetPassword(val('l-email').trim()); UI.toast('ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว (ถ้าอีเมลนี้มีในระบบ)'); } catch (e) { UI.toast(e.message, true); } };
  A.google = async () => { try { await api.signInGoogle(); } catch (e) { UI.toast(e.message, true); } };
  A['demo-login'] = async (el) => { await api.demoLogin(el.dataset.id); await UI.enter(); };

  /* ---------- DASHBOARD ---------- */
  P.dashboard = () => {
    const rows = UI.myRows(), m = UI.metrics(rows), me = S.me;
    const open = rows.filter((r) => r.a.status !== 'completed').sort((a, b) => new Date(a.t.due_date) - new Date(b.t.due_date));
    const toReview = UI.allRows().filter((r) => Core.canReview(UI.cx(), me, r.t, r.a)).length;
    return `<div class="ph"><div><h1>สวัสดี ${esc(me.full_name)}</h1><div class="sub">${UI.ROLE[me.role]} · ${esc(UI.dname(me.department_id))}</div></div><div class="grow"></div>${Core.isLead(me) ? '<a class="btn pri" href="#/new">+ มอบหมายงานใหม่</a>' : ''}</div>
    <div class="grid kpis">
      ${UI.kpi('Total Assigned Tasks', m.assigned)}${UI.kpi('To Do', m.todo)}${UI.kpi('In Progress', m.in_progress, 'info')}
      ${UI.kpi('Pending Approval', m.pending_approval, 'warn')}${UI.kpi('Completed', m.completed, 'ok')}${UI.kpi('Overdue', m.overdue, 'red')}
      ${UI.kpi('Blocked / Rework', m.blocked + m.rework)}${UI.kpi('Completion Rate', m.rate + '%', 'ok')}
    </div>
    ${toReview ? `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--warn)"><b>มี ${toReview} งานรอคุณตรวจสอบ</b> · <a href="#/approvals">ไปที่ Approval Center</a></div>` : ''}
    <div class="ph"><h3>งานที่ต้องทำ (เรียงตามกำหนดส่ง)</h3><div class="grow"></div><a href="#/tasks">ดูทั้งหมด →</a></div>
    ${open.length ? `<div class="grid tcards">${open.slice(0, 6).map(UI.taskCard).join('')}</div>` : '<div class="card empty">ไม่มีงานค้าง 🎉</div>'}`;
  };

  /* ---------- MY TASKS ---------- */
  UI.filteredMyRows = () => {
    const f = S.f, q = S.q.trim().toLowerCase(), now = Date.now();
    return UI.myRows().filter(({ t, a }) => {
      if (f.status && a.status !== f.status) return false;
      if (f.prio && t.priority !== f.prio) return false;
      const due = new Date(t.due_date).getTime(), open = a.status !== 'completed';
      if (f.due === 'overdue' && !(open && due < now)) return false;
      if (f.due === 'today' && new Date(t.due_date).toDateString() !== new Date().toDateString()) return false;
      if (f.due === 'week' && !(open && due >= now && due <= now + 7 * 86400e3)) return false;
      if (q && !(t.title + ' ' + t.task_no + ' ' + (t.description || '')).toLowerCase().includes(q)) return false;
      return true;
    }).sort((x, y) => new Date(x.t.due_date) - new Date(y.t.due_date));
  };
  UI.taskListHtml = () => {
    const rows = UI.filteredMyRows();
    if (!rows.length) return '<div class="card empty">ไม่พบงานตามเงื่อนไข</div>';
    return S.view === 'cards' ? `<div class="grid tcards">${rows.map(UI.taskCard).join('')}</div>` : UI.taskTable(rows, false);
  };
  P.tasks = () => {
    const opt = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="ph"><h1>งานของฉัน</h1><div class="grow"></div><div class="seg"><button class="${S.view === 'cards' ? 'on' : ''}" data-act="view" data-v="cards">Card</button><button class="${S.view === 'table' ? 'on' : ''}" data-act="view" data-v="table">Table</button></div></div>
    <div class="filters">
      <select data-flt="status"><option value="">ทุกสถานะ</option>${opt(UI.STL, S.f.status)}</select>
      <select data-flt="prio"><option value="">ทุกระดับความสำคัญ</option>${opt(UI.PRI, S.f.prio)}</select>
      <select data-flt="due"><option value="">ทุกกำหนดส่ง</option>${opt({ overdue: 'เกินกำหนด', today: 'ครบกำหนดวันนี้', week: 'ภายใน 7 วัน' }, S.f.due)}</select>
      <button class="btn sm" data-act="clear-flt">ล้างตัวกรอง</button>
    </div><div id="tasklist">${UI.taskListHtml()}</div>`;
  };
  A.view = (el) => { S.view = el.dataset.v; UI.render(); };
  A['clear-flt'] = () => { S.f = { status: '', prio: '', due: '' }; S.q = ''; const g = document.getElementById('gsearch'); if (g) g.value = ''; UI.render(); };

  /* ---------- TASK DETAIL ---------- */
  const actTxt = (l) => {
    const who = esc(UI.uname(l.actor_id)), d = l.detail || {};
    switch (l.action) {
      case 'created': return `${who} สร้างงาน`;
      case 'edited': return `${who} แก้ไขรายละเอียดงาน`;
      case 'assigned': return `${who} มอบหมายงานให้ ${esc(UI.uname(d.assignee))}`;
      case 'status_change': return `${who} เปลี่ยนสถานะ ${UI.STL[l.from_status]} → <b>${UI.STL[l.to_status]}</b>${d.progress != null ? ` (${d.progress}%)` : ''}${d.note ? `<br><small>“${esc(d.note)}”</small>` : ''}`;
      case 'approved': return `${who} <b>อนุมัติปิดงาน</b> ของ ${esc(UI.uname(d.assignee))}${d.note ? `<br><small>“${esc(d.note)}”</small>` : ''}`;
      case 'rejected': return `${who} <b>ส่งกลับแก้ไข</b> งานของ ${esc(UI.uname(d.assignee))}${d.note ? `<br><small>“${esc(d.note)}”</small>` : ''}`;
      case 'escalated': return `${who} Escalate งานให้ Manager${d.note ? `<br><small>“${esc(d.note)}”</small>` : ''}`;
      default: return `${who} ${esc(l.action)}`;
    }
  };
  P.task = (id) => {
    const t = S.ctx.tasks.find((x) => x.id === id);
    if (!t) return '<div class="card empty">ไม่พบงานนี้ หรือคุณไม่มีสิทธิ์เข้าถึง · <a href="#/tasks">กลับ</a></div>';
    const D = S.detail && S.detail.id === id ? S.detail : { comments: [], attachments: [], activity: [], approvals: [] };
    const me = S.me, cx = UI.cx(), mine = t.assignees.find((a) => a.user_id === me.id), canEdit = Core.canEdit(cx, me, t);
    const late = Core.isOverdue(t, null);
    const canSub = (s) => !!mine || canEdit;
    let action = '';
    if (mine) {
      if (mine.status === 'completed') action = '<div class="card"><h3>งานของคุณ</h3><div class="sub">ผู้ตรวจสอบอนุมัติปิดงานแล้ว</div></div>';
      else if (mine.status === 'pending_approval') action = `<div class="card"><h3>งานของคุณ</h3><div class="sub">ส่งงานแล้ว รอผู้ตรวจสอบ</div><button class="btn sm" style="margin-top:8px" data-act="my-status" data-s="in_progress">ดึงกลับมาแก้ไข</button></div>`;
      else action = `<div class="card"><h3>อัปเดตงานของคุณ ${UI.badge(mine.status)}</h3>
        ${mine.status === 'rework' ? '<div class="late" style="margin-bottom:6px">งานถูกส่งกลับแก้ไข — ดูเหตุผลในประวัติด้านล่าง</div>' : ''}
        <div class="fld"><label>ความคืบหน้า: <span id="prog-out">${mine.progress}</span>%</label><input type="range" id="my-prog" min="0" max="100" step="5" value="${mine.progress}" data-chg="prog"></div>
        <div class="fld"><label>หมายเหตุ</label><textarea id="my-note" placeholder="รายงานความคืบหน้า / ปัญหาที่พบ"></textarea></div>
        <div class="chips"><button class="btn sm" data-act="my-status" data-s="in_progress">${mine.status === 'todo' ? 'เริ่มดำเนินการ' : 'บันทึกความคืบหน้า'}</button>
        <button class="btn sm" data-act="my-status" data-s="blocked">ติดปัญหา</button>
        <button class="btn sm ok" data-act="my-status" data-s="pending_approval">ส่งงานรออนุมัติ</button></div>
        <div class="sub" style="margin-top:6px">คุณไม่สามารถอนุมัติปิดงานของตนเองได้</div></div>`;
    }
    const asg = t.assignees.map((a) => `<tr><td>${esc(UI.uname(a.user_id))}</td><td>${UI.badge(a.status)}</td><td style="min-width:100px">${UI.bar(a.progress, Core.isOverdue(t, a))}<small>${a.progress}%</small></td><td>${UI.fDT(a.updated_at)}</td><td>${Core.canReview(cx, me, t, a) ? `<button class="btn sm ok" data-act="review" data-d="approved" data-u="${a.user_id}">อนุมัติ</button> <button class="btn sm" data-act="review" data-d="rejected" data-u="${a.user_id}">ส่งกลับ</button>` : ''}</td></tr>`).join('');
    const subs = t.subtasks.length ? t.subtasks.map((s) => `<label class="chk"><input type="checkbox" data-chg="sub" data-id="${s.id}" ${s.done ? 'checked' : ''} ${canSub(s) ? '' : 'disabled'}> <span style="${s.done ? 'text-decoration:line-through;color:var(--mute)' : ''}">${esc(s.title)}</span></label>`).join('') : '<div class="sub">ไม่มี Checklist</div>';
    const atts = D.attachments.length ? D.attachments.map((a) => `<div class="cmt"><b>${a.kind === 'link' ? '🔗' : '📎'} ${esc(a.name)}</b> <button class="btn sm" data-act="open-att" data-id="${a.id}">เปิด</button>${a.user_id === me.id || canEdit ? ` <button class="btn sm" data-act="del-att" data-id="${a.id}">ลบ</button>` : ''}<br><small>${esc(UI.uname(a.user_id))} · ${UI.fDT(a.created_at)}</small></div>`).join('') : '<div class="sub">ยังไม่มีไฟล์/ลิงก์หลักฐาน</div>';
    const cms = D.comments.length ? D.comments.map((c) => `<div class="cmt"><b>${esc(UI.uname(c.user_id))}</b> <small>${UI.fDT(c.created_at)}</small><div>${esc(c.body).replace(/\n/g, '<br>')}</div></div>`).join('') : '<div class="sub">ยังไม่มีความคิดเห็น</div>';
    const acts = D.activity.length ? `<ul class="tl">${D.activity.map((l) => `<li>${actTxt(l)}<br><small class="sub">${UI.fDT(l.created_at)}</small></li>`).join('')}</ul>` : '<div class="sub">ยังไม่มีประวัติ</div>';
    return `<div class="ph"><a href="#/tasks" class="btn sm">← กลับ</a><div class="grow"></div>
      ${Core.isLead(me) && (t.status === 'blocked' || late) ? '<button class="btn sm" data-act="escalate">Escalate ให้ Manager</button>' : ''}
      ${canEdit ? `<a class="btn sm" href="#/edit/${t.id}">แก้ไข</a>` : ''}${Core.isAdmin(me) || t.created_by === me.id ? '<button class="btn sm" data-act="del-task">ลบงาน</button>' : ''}</div>
    <div class="grid detail">
      <div class="grid" style="align-content:start">
        <div class="card"><div class="meta" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="sub">${esc(t.task_no)}</span>${UI.prio(t.priority)}${UI.badge(t.status)}</div>
          <h2 style="margin:8px 0 6px">${esc(t.title)}</h2><p style="white-space:pre-wrap;margin:0 0 12px">${esc(t.description || '—')}</p>
          <dl class="kv"><dt>มอบหมายโดย</dt><dd>${esc(UI.uname(t.created_by))}</dd><dt>ผู้ตรวจสอบ</dt><dd>${esc(UI.uname(t.reviewer_id))}</dd><dt>แผนก</dt><dd>${esc(UI.dname(t.department_id))}</dd>
          <dt>เริ่ม</dt><dd>${UI.fDT(t.start_date)}</dd><dt>กำหนดส่ง</dt><dd>${UI.dueCell(t, t.status)}</dd><dt>งานประจำ</dt><dd>${UI.REC[t.recurrence] || '-'}</dd>
          <dt>ความคืบหน้ารวม</dt><dd style="max-width:260px">${UI.bar(t.progress, late)}<small>${t.progress}%</small></dd><dt>อัปเดตล่าสุด</dt><dd>${UI.fDT(t.updated_at)}</dd></dl></div>
        <div class="card"><h3>ผู้รับผิดชอบ (สถานะรายบุคคล)</h3><div class="tbl-wrap"><table><thead><tr><th>ชื่อ</th><th>สถานะ</th><th>คืบหน้า</th><th>อัปเดต</th><th></th></tr></thead><tbody>${asg}</tbody></table></div></div>
        <div class="card"><h3>Checklist / Subtasks</h3>${subs}</div>
        <div class="card"><h3>ประวัติการดำเนินการ</h3>${acts}</div>
      </div>
      <div class="grid" style="align-content:start">${action}
        <div class="card"><h3>หลักฐาน / เอกสารแนบ</h3>${atts}
          <div class="fld" style="margin-top:10px"><label>แนบไฟล์ / รูปภาพ</label><input type="file" id="att-file" data-chg="file"></div>
          <div class="fld"><label>หรือแนบลิงก์</label><input id="att-url" placeholder="https://..."><button class="btn sm" style="margin-top:6px" data-act="add-link">เพิ่มลิงก์</button></div></div>
        <div class="card"><h3>ความคิดเห็น</h3>${cms}<div class="fld" style="margin-top:10px"><textarea id="cm-in" placeholder="พิมพ์ความคิดเห็น..."></textarea></div><button class="btn sm pri" data-act="add-comment">ส่ง</button></div>
      </div></div>`;
  };
  const tid = () => (location.hash.match(/#\/task\/([^/?]+)/) || [])[1];
  const reload = async () => { S.detail = { id: tid(), ...(await api.detail(tid())) }; };
  A['my-status'] = (el) => {
    const s = el.dataset.s, prog = +val('my-prog'), note = val('my-note').trim();
    if (s === 'blocked' && !note) return UI.toast('กรุณาระบุปัญหาในช่องหมายเหตุ', true);
    UI.run(() => api.setMyStatus(tid(), s, s === 'in_progress' ? prog : null, note), s === 'pending_approval' ? 'ส่งงานรออนุมัติแล้ว' : 'อัปเดตแล้ว');
  };
  A.review = (el) => {
    const d = el.dataset.d, u = el.dataset.u, id = tid();
    UI.askNote(d === 'approved' ? 'อนุมัติปิดงาน' : 'ส่งกลับแก้ไข', d === 'approved' ? 'หมายเหตุ (ถ้ามี)' : 'เหตุผลที่ส่งกลับ', (n) => UI.run(() => api.review(id, u, d, n), d === 'approved' ? 'อนุมัติปิดงานแล้ว' : 'ส่งกลับแก้ไขแล้ว'), d === 'rejected');
  };
  A.escalate = () => UI.askNote('Escalate ให้ Manager', 'รายละเอียดปัญหา', (n) => UI.run(() => api.escalate(tid(), n), 'ส่งแจ้ง Manager แล้ว'), true);
  A['del-task'] = () => { if (confirm('ลบงานนี้ถาวร? (ประวัติและไฟล์แนบจะถูกลบด้วย)')) UI.run(async () => { await api.deleteTask(tid()); location.hash = '#/tasks'; }, 'ลบงานแล้ว'); };
  A['add-comment'] = () => { const b = val('cm-in').trim(); if (b) UI.run(() => api.addComment(tid(), b), 'ส่งความคิดเห็นแล้ว'); };
  A['add-link'] = () => { const u = val('att-url').trim(); if (!/^https?:\/\//i.test(u)) return UI.toast('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://', true); UI.run(() => api.addLink(tid(), u, u), 'เพิ่มลิงก์แล้ว'); };
  A['open-att'] = async (el) => { try { const a = S.detail.attachments.find((x) => x.id === el.dataset.id); const url = await api.fileUrl(a); window.open(url, '_blank', 'noopener'); } catch (e) { UI.toast(e.message, true); } };
  A['del-att'] = (el) => { if (confirm('ลบไฟล์แนบนี้?')) UI.run(() => api.deleteAttachment(S.detail.attachments.find((x) => x.id === el.dataset.id)), 'ลบแล้ว'); };
  UI.chg = {
    prog: (el) => { document.getElementById('prog-out').textContent = el.value; },
    sub: (el) => UI.run(() => api.toggleSubtask(el.dataset.id, el.checked)),
    file: (el) => { if (el.files[0]) UI.run(() => api.addFile(tid(), el.files[0]), 'แนบไฟล์แล้ว'); },
  };

  /* ---------- CREATE / EDIT ---------- */
  P.form = (id) => {
    const t = id ? S.ctx.tasks.find((x) => x.id === id) : null, me = S.me;
    if (!Core.isLead(me)) return '<div class="card empty">เฉพาะ Admin / Manager / Supervisor เท่านั้นที่มอบหมายงานได้</div>';
    if (id && (!t || !Core.canEdit(UI.cx(), me, t))) return '<div class="card empty">ไม่พบงาน หรือไม่มีสิทธิ์แก้ไข</div>';
    const sel = t ? t.assignees.map((a) => a.user_id) : [], cands = Core.assignable(UI.cx(), me).sort((a, b) => a.full_name.localeCompare(b.full_name, 'th'));
    const leads = S.ctx.users.filter((u) => Core.isLead(u));
    const start = t ? t.start_date : new Date().toISOString(), due = t ? t.due_date : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(17, 0, 0, 0); return d.toISOString(); })();
    const o = (obj, v) => Object.entries(obj).map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="ph"><h1>${t ? 'แก้ไขงาน ' + esc(t.task_no) : 'สร้าง / มอบหมายงานใหม่'}</h1></div>
    <div class="card" style="max-width:820px">
      <div class="fld"><label>ชื่องาน *</label><input id="f-title" value="${esc(t ? t.title : '')}"></div>
      <div class="fld"><label>รายละเอียด</label><textarea id="f-desc">${esc(t ? t.description || '' : '')}</textarea></div>
      <div class="row"><div class="fld"><label>แผนก</label><select id="f-dept"><option value="">—</option>${S.ctx.departments.map((d) => `<option value="${d.id}" ${t && t.department_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
        <div class="fld"><label>ระดับความสำคัญ</label><select id="f-prio">${o(UI.PRI, t ? t.priority : 'medium')}</select></div></div>
      <div class="row"><div class="fld"><label>วัน-เวลาเริ่ม</label><input type="datetime-local" id="f-start" value="${UI.toLocalInput(start)}"></div>
        <div class="fld"><label>Deadline *</label><input type="datetime-local" id="f-due" value="${UI.toLocalInput(due)}"></div></div>
      <div class="row"><div class="fld"><label>ผู้ตรวจสอบงาน (อนุมัติปิดงาน)</label><select id="f-rev"><option value="">— ผู้สร้างงาน —</option>${leads.map((u) => `<option value="${u.id}" ${(t ? t.reviewer_id : me.id) === u.id ? 'selected' : ''}>${esc(u.full_name)} (${UI.ROLE[u.role]})</option>`).join('')}</select></div>
        ${t ? '' : `<div class="fld"><label>งานประจำ (สร้างซ้ำอัตโนมัติ)</label><select id="f-rec">${o(UI.REC, 'none')}</select></div>`}</div>
      <div class="fld"><label>ผู้รับผิดชอบ * (เลือกได้หลายคน — แต่ละคนมีสถานะแยกกัน)</label>
        <div style="max-height:240px;overflow:auto">${cands.map((u) => `<label class="chk"><input type="checkbox" name="f-asg" value="${u.id}" ${sel.includes(u.id) ? 'checked' : ''}> <span>${esc(u.full_name)} <span class="sub">· ${UI.ROLE[u.role]} · ${esc(UI.dname(u.department_id))}</span></span></label>`).join('') || '<div class="sub">ไม่มีพนักงานในความดูแลของคุณ — ให้ Admin กำหนดทีมก่อน</div>'}</div></div>
      ${t ? '' : `<div class="fld"><label>Checklist / Subtasks (บรรทัดละ 1 รายการ)</label><textarea id="f-subs"></textarea></div>
      <div class="fld"><label>ลิงก์เอกสารอ้างอิง (บรรทัดละ 1 ลิงก์ ขึ้นต้น http)</label><textarea id="f-links"></textarea></div>
      <div class="fld"><label>แนบไฟล์ / รูปภาพ (เลือกได้หลายไฟล์ ไม่เกิน 5 MB ต่อไฟล์)</label><input type="file" id="f-files" multiple></div>`}
      <div class="row" style="justify-content:flex-end"><a class="btn" href="${t ? '#/task/' + t.id : '#/dashboard'}">ยกเลิก</a><button class="btn pri" data-act="save-task" data-id="${t ? t.id : ''}">${t ? 'บันทึก' : 'สร้างและมอบหมายงาน'}</button></div>
    </div>`;
  };
  A['save-task'] = (el) => {
    const id = el.dataset.id, title = val('f-title').trim();
    const asg = UI.$$('input[name=f-asg]:checked').map((x) => x.value);
    if (!title) return UI.toast('กรุณาระบุชื่องาน', true);
    if (!val('f-due')) return UI.toast('กรุณาระบุ Deadline', true);
    const start = new Date(val('f-start') || Date.now()), due = new Date(val('f-due'));
    if (due <= start) return UI.toast('Deadline ต้องหลังวันเริ่ม', true);
    if (!asg.length) return UI.toast('กรุณาเลือกผู้รับผิดชอบอย่างน้อย 1 คน', true);
    const p = { title, description: val('f-desc').trim(), department_id: val('f-dept'), priority: val('f-prio'), start_date: start.toISOString(), due_date: due.toISOString(), reviewer_id: val('f-rev') || S.me.id, assignees: asg };
    if (id) UI.run(async () => { const old = S.ctx.tasks.find((x) => x.id === id).assignees.map((a) => a.user_id); await api.updateTask(id, p, old); location.hash = '#/task/' + id; }, 'บันทึกแล้ว');
    else {
      p.recurrence = val('f-rec') || 'none';
      p.subtasks = val('f-subs').split('\n').map((s) => s.trim()).filter(Boolean);
      p.links = val('f-links').split('\n').map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
      const files = Array.from((document.getElementById('f-files') || {}).files || []);
      if (files.some((f) => f.size > 5 * 1024 * 1024)) return UI.toast('มีไฟล์ใหญ่เกิน 5 MB', true);
      UI.run(async () => {
        const nid = await api.createTask(p);
        const failed = [];
        for (const f of files) { try { await api.addFile(nid, f); } catch (e) { failed.push(f.name); } }
        if (failed.length) UI.toast('สร้างงานแล้ว แต่แนบไฟล์ไม่สำเร็จ: ' + failed.join(', ') + ' (แนบใหม่ที่หน้างาน)', true);
        await UI.refresh(true); location.hash = '#/task/' + nid;
      }, files.length ? 'สร้างงานและแนบไฟล์แล้ว' : 'สร้างและมอบหมายงานแล้ว', true);
    }
  };
})();
