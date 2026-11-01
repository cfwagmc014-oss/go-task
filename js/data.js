/* GO TASK — data layer
 * - Core: กติกาสิทธิ์ (ใช้แสดงผลบน UI; ใน Supabase mode การบังคับสิทธิ์จริงอยู่ที่ RLS/RPC ในฐานข้อมูล)
 * - Supabase adapter: เชื่อมต่อฐานข้อมูลจริง
 * - Demo adapter: ข้อมูลตัวอย่างในเบราว์เซอร์ (localStorage) ใช้ทดสอบทุกบทบาท — ไม่ใช่ข้อมูลจริง
 */
(function () {
  'use strict';
  const CFG = window.GOTASK_CONFIG || {};
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2) + Date.now());
  const nowISO = () => new Date().toISOString();
  const HOUR = 3600e3, DAY = 24 * HOUR;

  /* ---------------- Core: permissions & metrics ---------------- */
  const LEADS = ['admin', 'manager', 'supervisor'];
  const Core = {
    LEADS,
    isAdmin: (u) => !!u && u.role === 'admin',
    isLead: (u) => !!u && LEADS.includes(u.role),
    isManager: (u) => !!u && (u.role === 'admin' || u.role === 'manager'),
    manages(ctx, me, target) {
      if (!me) return false;
      if (me.role === 'admin') return true;
      if (!['manager', 'supervisor'].includes(me.role)) return false;
      return ctx.teamMembers.some((tt) => {
        if (tt.user_id !== target) return false;
        const team = ctx.teams.find((t) => t.id === tt.team_id);
        if (team && team.manager_id === me.id) return true;
        return ctx.teamMembers.some((tm) => tm.team_id === tt.team_id && tm.user_id === me.id && tm.member_role === 'supervisor');
      });
    },
    canView(ctx, me, t) {
      if (!me) return false;
      if (me.role === 'admin' || t.created_by === me.id || t.reviewer_id === me.id) return true;
      return t.assignees.some((a) => a.user_id === me.id || Core.manages(ctx, me, a.user_id));
    },
    canEdit(ctx, me, t) {
      if (!me) return false;
      return me.role === 'admin' || t.created_by === me.id || (['manager', 'supervisor'].includes(me.role) && Core.canView(ctx, me, t));
    },
    canReview(ctx, me, t, a) {
      if (!me || !a || a.status !== 'pending_approval' || me.id === a.user_id || !Core.isLead(me)) return false;
      return me.role === 'admin' || t.reviewer_id === me.id || t.created_by === me.id || Core.manages(ctx, me, a.user_id);
    },
    assignable(ctx, me) {
      return ctx.users.filter((u) => u.status !== 'suspended' && (me.role === 'admin' || u.id === me.id || Core.manages(ctx, me, u.id)));
    },
    isOverdue(t, a, now = Date.now()) {
      const st = a ? a.status : t.status;
      return st !== 'completed' && new Date(t.due_date).getTime() < now;
    },
    nextRecurrence(startISO, rec) {
      const d = new Date(startISO);
      if (rec === 'daily') d.setDate(d.getDate() + 1);
      else if (rec === 'weekly') d.setDate(d.getDate() + 7);
      else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
      else return null;
      return d.toISOString().slice(0, 10);
    },
    rollup(t) {
      const as = t.assignees, n = as.length;
      if (!n) return;
      const cnt = (s) => as.filter((a) => a.status === s).length;
      const c = cnt('completed'), b = cnt('blocked'), r = cnt('rework'), p = cnt('pending_approval'), ip = cnt('in_progress');
      t.progress = Math.round(as.reduce((s, a) => s + a.progress, 0) / n);
      t.status = c === n ? 'completed' : b ? 'blocked' : r ? 'rework' : c + p === n && p > 0 ? 'pending_approval' : ip + p + c > 0 ? 'in_progress' : 'todo';
      t.completed_at = t.status === 'completed' ? t.completed_at || nowISO() : null;
    },
  };

  /* ---------------- Supabase adapter ---------------- */
  function makeSupabase() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    const norm = (t) => ({ ...t, assignees: t.task_assignees || [], subtasks: (t.subtasks || []).sort((a, b) => a.sort - b.sort) });
    let me = null;
    return {
      mode: 'supabase',
      async init() { const { data } = await sb.auth.getSession(); return !!data.session; },
      onAuth(cb) { sb.auth.onAuthStateChange((e) => cb(e)); },
      async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
      async signUp(email, password, name) { return ok(await sb.auth.signUp({ email, password, options: { data: { full_name: name } } })); },
      async signInGoogle() { ok(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })); },
      async signOut() { await sb.auth.signOut(); me = null; },
      async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
      async updatePassword(pw) { ok(await sb.auth.updateUser({ password: pw })); },
      async myProfile() {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return null;
        const { data, error } = await sb.from('users').select('*').eq('auth_id', user.id).maybeSingle();
        if (error) throw new Error(error.message);
        me = data; return data;
      },
      async loadAll() {
        const q = await Promise.all([
          sb.from('user_directory').select('*'),
          sb.from('departments').select('*').order('name'),
          sb.from('teams').select('*').order('name'),
          sb.from('team_members').select('*'),
          sb.from('tasks').select('*, task_assignees(*), subtasks(*)').order('due_date'),
          sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
          sb.from('app_settings').select('*'),
        ]);
        const [users, departments, teams, teamMembers, tasks, notifications, st] = q.map(ok);
        const settings = {}; st.forEach((r) => (settings[r.key] = r.value));
        return { me, users, departments, teams, teamMembers, tasks: tasks.map(norm), notifications, settings };
      },
      async detail(id) {
        const g = (tb, extra) => { let r = sb.from(tb).select('*').eq('task_id', id); return extra ? extra(r) : r; };
        const [c, a, l, p] = await Promise.all([
          g('task_comments', (r) => r.order('created_at')), g('task_attachments', (r) => r.order('created_at')),
          g('task_activity_logs', (r) => r.order('created_at', { ascending: false })), g('task_approvals', (r) => r.order('created_at', { ascending: false })),
        ]);
        return { comments: ok(c), attachments: ok(a), activity: ok(l), approvals: ok(p) };
      },
      async createTask(t) {
        const row = { title: t.title, description: t.description, department_id: t.department_id || null, priority: t.priority,
          start_date: t.start_date, due_date: t.due_date, created_by: me.id, reviewer_id: t.reviewer_id || null,
          recurrence: t.recurrence, recurrence_next: t.recurrence !== 'none' ? Core.nextRecurrence(t.start_date, t.recurrence) : null };
        const task = ok(await sb.from('tasks').insert(row).select().single());
        if (t.assignees.length) ok(await sb.from('task_assignees').insert(t.assignees.map((u) => ({ task_id: task.id, user_id: u }))));
        if (t.subtasks.length) ok(await sb.from('subtasks').insert(t.subtasks.map((s, i) => ({ task_id: task.id, title: s, sort: i }))));
        for (const l of t.links || []) await this.addLink(task.id, l, l);
        return task.id;
      },
      async updateTask(id, t, oldAssignees) {
        ok(await sb.from('tasks').update({ title: t.title, description: t.description, department_id: t.department_id || null,
          priority: t.priority, start_date: t.start_date, due_date: t.due_date, reviewer_id: t.reviewer_id || null }).eq('id', id));
        const add = t.assignees.filter((u) => !oldAssignees.includes(u));
        const del = oldAssignees.filter((u) => !t.assignees.includes(u));
        if (add.length) ok(await sb.from('task_assignees').insert(add.map((u) => ({ task_id: id, user_id: u }))));
        for (const u of del) ok(await sb.from('task_assignees').delete().eq('task_id', id).eq('user_id', u));
      },
      async deleteTask(id) { ok(await sb.from('tasks').delete().eq('id', id)); },
      async setMyStatus(id, status, progress, note) {
        ok(await sb.rpc('rpc_update_my_progress', { p_task: id, p_status: status, p_progress: progress, p_note: note || null }));
      },
      async review(id, assignee, decision, note) {
        ok(await sb.rpc('rpc_review_task', { p_task: id, p_assignee: assignee, p_decision: decision, p_note: note || null }));
      },
      async escalate(id, note) { ok(await sb.rpc('rpc_escalate_task', { p_task: id, p_note: note || null })); },
      async addComment(id, body) { ok(await sb.from('task_comments').insert({ task_id: id, user_id: me.id, body })); },
      async addLink(id, name, url) { ok(await sb.from('task_attachments').insert({ task_id: id, user_id: me.id, kind: 'link', name, url })); },
      async addFile(id, file) {
        if (file.size > 10 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 10 MB');
        const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8);
        const path = `${id}/${uid()}.${ext}`;
        const up = await sb.storage.from('task-files').upload(path, file, { contentType: file.type || undefined });
        if (up.error) throw new Error(up.error.message);
        ok(await sb.from('task_attachments').insert({ task_id: id, user_id: me.id, kind: 'file', name: file.name, storage_path: path }));
      },
      async fileUrl(att) {
        if (att.kind === 'link') return att.url;
        return ok(await sb.storage.from('task-files').createSignedUrl(att.storage_path, 300)).signedUrl;
      },
      async deleteAttachment(att) {
        if (att.storage_path) await sb.storage.from('task-files').remove([att.storage_path]);
        ok(await sb.from('task_attachments').delete().eq('id', att.id));
      },
      async toggleSubtask(id, done) { ok(await sb.from('subtasks').update({ done, done_by: done ? me.id : null }).eq('id', id)); },
      async markRead(id) { ok(await sb.from('notifications').update({ read_at: nowISO() }).eq('id', id)); },
      async markAllRead() { ok(await sb.from('notifications').update({ read_at: nowISO() }).is('read_at', null).eq('user_id', me.id)); },
      async listUsers() { return ok(await sb.from('users').select('*').order('full_name')); },
      async saveUser(u) {
        const row = { email: u.email.toLowerCase().trim(), employee_id: u.employee_id || null, full_name: u.full_name, position: u.position || null,
          department_id: u.department_id || null, role: u.role, status: u.status, updated_at: nowISO() };
        if (u.id) ok(await sb.from('users').update(row).eq('id', u.id)); else ok(await sb.from('users').insert(row));
      },
      async saveDept(d) { if (d.id) ok(await sb.from('departments').update({ name: d.name }).eq('id', d.id)); else ok(await sb.from('departments').insert({ name: d.name })); },
      async saveTeam(t) {
        const row = { name: t.name, department_id: t.department_id || null, manager_id: t.manager_id || null };
        if (t.id) { ok(await sb.from('teams').update(row).eq('id', t.id)); return t.id; }
        return ok(await sb.from('teams').insert(row).select().single()).id;
      },
      async setTeamMembers(teamId, members) {
        ok(await sb.from('team_members').delete().eq('team_id', teamId));
        if (members.length) ok(await sb.from('team_members').insert(members.map((m) => ({ team_id: teamId, user_id: m.user_id, member_role: m.member_role }))));
      },
      async deleteTeam(id) { ok(await sb.from('teams').delete().eq('id', id)); },
      async saveSetting(key, value) { ok(await sb.from('app_settings').upsert({ key, value })); },
    };
  }

  /* ---------------- Demo adapter (ข้อมูลตัวอย่าง) ---------------- */
  function makeDemo() {
    const KEY = 'gotask_demo_v1', SKEY = 'gotask_demo_session';
    let db = null, meId = null;
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* เต็ม/ปิดใช้งาน */ } };
    const seed = () => {
      const D = (n) => ({ id: uid(), name: n });
      const depts = ['Fresh Food', 'Dry & Grocery', 'Butchery', 'Sales / B2B', 'Store Operations'].map(D);
      const dep = (n) => depts.find((d) => d.name === n).id;
      const U = (name, role, position, d, emp) => ({ id: uid(), email: emp.toLowerCase() + '@demo.gotask', employee_id: emp, full_name: name, position, department_id: dep(d), role, status: 'approved' });
      const admin = U('นภา ผู้ดูแลระบบ', 'admin', 'Branch Admin', 'Store Operations', 'D001');
      const mgr = U('สมชาย (ASGM)', 'manager', 'ASGM', 'Store Operations', 'D002');
      const sup1 = U('วิภา หัวหน้าทีมสด', 'supervisor', 'Supervisor Fresh', 'Fresh Food', 'D003');
      const sup2 = U('ประเสริฐ หัวหน้าทีมแห้ง', 'supervisor', 'Supervisor Dry', 'Dry & Grocery', 'D004');
      const s1 = U('อรทัย', 'staff', 'Staff Fresh', 'Fresh Food', 'D011');
      const s2 = U('ธนากร', 'staff', 'Staff Fresh', 'Fresh Food', 'D012');
      const s3 = U('กมลา', 'staff', 'Staff Butchery', 'Butchery', 'D013');
      const s4 = U('พิชัย', 'staff', 'Staff Dry', 'Dry & Grocery', 'D014');
      const s5 = U('สุดา', 'staff', 'Staff Dry', 'Dry & Grocery', 'D015');
      const users = [admin, mgr, sup1, sup2, s1, s2, s3, s4, s5];
      const t1 = { id: uid(), name: 'ทีม Fresh & Butchery', department_id: dep('Fresh Food'), manager_id: mgr.id };
      const t2 = { id: uid(), name: 'ทีม Dry & Grocery', department_id: dep('Dry & Grocery'), manager_id: mgr.id };
      const tm = (t, u, r = 'member') => ({ team_id: t.id, user_id: u.id, member_role: r });
      const teamMembers = [tm(t1, sup1, 'supervisor'), tm(t1, s1), tm(t1, s2), tm(t1, s3), tm(t2, sup2, 'supervisor'), tm(t2, s4), tm(t2, s5)];
      const now = Date.now(); let n = 0;
      const tasks = [], activity = [];
      const mk = (title, desc, d, prio, startD, dueH, by, reviewer, asg, subs = [], rec = 'none') => {
        n++;
        const t = { id: uid(), task_no: 'T-' + String(n).padStart(5, '0'), title, description: desc, department_id: dep(d), priority: prio,
          start_date: new Date(now + startD * DAY).toISOString(), due_date: new Date(now + dueH * HOUR).toISOString(),
          created_by: by.id, reviewer_id: reviewer ? reviewer.id : null, recurrence: rec, recurrence_next: null,
          status: 'todo', progress: 0, completed_at: null, created_at: new Date(now + startD * DAY).toISOString(), updated_at: nowISO(),
          assignees: asg.map(([u, status, progress]) => ({ task_id: null, user_id: u.id, status, progress,
            started_at: status !== 'todo' ? nowISO() : null, submitted_at: status === 'pending_approval' ? nowISO() : null,
            completed_at: status === 'completed' ? new Date(now + (dueH - 5) * HOUR).toISOString() : null, updated_at: nowISO() })),
          subtasks: subs.map(([s, done], i) => ({ id: uid(), task_id: null, title: s, done, sort: i })) };
        t.assignees.forEach((a) => (a.task_id = t.id)); t.subtasks.forEach((s) => (s.task_id = t.id));
        Core.rollup(t); tasks.push(t);
        activity.push({ id: uid(), task_id: t.id, actor_id: by.id, action: 'created', from_status: null, to_status: null, detail: null, created_at: t.created_at });
      };
      mk('จัดเรียงชั้นผักผลไม้ตาม Planogram', 'จัดเรียงตามแผนผังใหม่ ถ่ายรูปก่อน-หลัง', 'Fresh Food', 'high', -3, -20, mgr, sup1, [[s1, 'in_progress', 60], [s2, 'todo', 0]], [['ถ่ายรูปก่อนจัด', true], ['จัดเรียงโซนผัก', false], ['ถ่ายรูปหลังจัด', false]]);
      mk('ตรวจสอบวันหมดอายุสินค้าเนื้อสัตว์ประจำสัปดาห์', 'ตรวจ FEFO ทุกชั้น บันทึกรายการใกล้หมดอายุ', 'Butchery', 'critical', -2, -6, mgr, sup1, [[s3, 'todo', 0]], [], 'weekly');
      mk('นับสต็อกสินค้าแห้ง โซน A-C', 'นับและเทียบกับระบบ รายงานผลต่าง', 'Dry & Grocery', 'medium', -4, 30, sup2, sup2, [[s4, 'in_progress', 40], [s5, 'in_progress', 70]], [['โซน A', true], ['โซน B', false], ['โซน C', false]]);
      mk('ส่งรายงาน OOS ประจำวัน', 'สรุปรายการขาดสต็อกและสาเหตุ', 'Store Operations', 'high', -1, 3, mgr, mgr, [[s4, 'pending_approval', 100]], [], 'daily');
      mk('อัปเดตป้ายราคาโปรโมชันสัปดาห์นี้', 'เปลี่ยนป้ายตามรายการโปรโมชัน', 'Dry & Grocery', 'medium', -5, -48, sup2, sup2, [[s5, 'blocked', 30]], [['รับรายการโปรโมชัน', true], ['พิมพ์ป้าย', false]]);
      mk('ทำความสะอาดตู้แช่เย็นโซนอาหารสด', 'ทำความสะอาดและตรวจอุณหภูมิ', 'Fresh Food', 'low', -6, -72, sup1, sup1, [[s2, 'completed', 100]], [['ล้างตู้', true], ['บันทึกอุณหภูมิ', true]]);
      mk('ปรับปรุงการจัดวางสินค้า Own Brand หน้าชั้น', 'เพิ่ม Facing สินค้า Own Brand ตามแผน', 'Fresh Food', 'high', -1, 60, mgr, mgr, [[s1, 'rework', 55]], []);
      mk('สรุปยอดขายและกิจกรรมลูกค้า B2B รายสัปดาห์', 'รวบรวมสรุปส่งผู้บริหาร', 'Sales / B2B', 'medium', 0, 96, mgr, mgr, [[sup1, 'todo', 0], [sup2, 'in_progress', 20]], [['รวบรวมข้อมูล', false], ['จัดทำสไลด์', false]]);
      mk('อบรม 5ส ประจำเดือน', 'จัดอบรมพนักงานทุกแผนก', 'Store Operations', 'medium', 1, 120, mgr, mgr, [[sup1, 'todo', 0], [sup2, 'todo', 0]], [], 'monthly');
      mk('ตรวจสอบความสะอาดและความปลอดภัยพื้นที่ขาย', 'เดินตรวจตามเช็กลิสต์', 'Store Operations', 'critical', 0, 8, admin, mgr, [[mgr, 'in_progress', 50]], [['ตรวจทางหนีไฟ', true], ['ตรวจพื้นลื่น', false]]);
      const cfg = { reminder_hours_before: 24, escalate_supervisor_hours: 24, escalate_manager_hours: 48, email_enabled: false };
      return { users, departments: depts, teams: [t1, t2], teamMembers, tasks, comments: [], attachments: [], activity, approvals: [], notifications: [], settings: cfg, meta: { seededAt: nowISO() } };
    };
    const load = () => { try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; } if (!db) { db = seed(); save(); } };
    const me = () => db.users.find((u) => u.id === meId);
    const ctx = () => ({ users: db.users, teams: db.teams, teamMembers: db.teamMembers });
    const task = (id) => { const t = db.tasks.find((x) => x.id === id); if (!t) throw new Error('ไม่พบงาน'); return t; };
    const act = (tid, action, from, to, detail) => db.activity.push({ id: uid(), task_id: tid, actor_id: meId, action, from_status: from || null, to_status: to || null, detail: detail || null, created_at: nowISO() });
    const notify = (userId, type, title, body, taskId, key) => {
      if (key && db.notifications.some((n) => n.dedupe_key === key)) return;
      db.notifications.unshift({ id: uid(), user_id: userId, type, title, body, task_id: taskId, dedupe_key: key || null, read_at: null, email_sent_at: null, created_at: nowISO() });
    };
    const label = (t) => `${t.task_no} ${t.title}`;
    const checks = () => { // จำลอง run_deadline_checks
      const c = ctx(), now = Date.now(), S = db.settings;
      db.tasks.forEach((t) => {
        const due = new Date(t.due_date).getTime();
        t.assignees.filter((a) => a.status !== 'completed').forEach((a) => {
          const k = (p) => `${p}:${t.id}:${a.user_id}`;
          if (due > now && due <= now + S.reminder_hours_before * HOUR) notify(a.user_id, 'due_soon', 'ใกล้ถึงกำหนดส่ง', label(t), t.id, k('due_soon'));
          if (due <= now) notify(a.user_id, 'due_now', 'ครบกำหนดส่งแล้ว', label(t), t.id, k('due_now'));
          if (due <= now - HOUR) notify(a.user_id, 'overdue', 'งานเกินกำหนดส่ง', label(t), t.id, k('overdue') + ':' + new Date().toISOString().slice(0, 10));
          const who = db.users.find((u) => u.id === a.user_id);
          db.teamMembers.filter((m) => m.user_id === a.user_id).forEach((m) => {
            const team = db.teams.find((x) => x.id === m.team_id);
            if (due <= now - S.escalate_supervisor_hours * HOUR)
              db.teamMembers.filter((s) => s.team_id === m.team_id && s.member_role === 'supervisor' && s.user_id !== a.user_id)
                .forEach((s) => notify(s.user_id, 'escalation_supervisor', 'งานเกินกำหนด — แจ้ง Supervisor', `${label(t)} (ผู้รับผิดชอบ: ${who.full_name})`, t.id, k('esc_sup') + ':' + s.user_id));
            if (team && team.manager_id && team.manager_id !== a.user_id && due <= now - S.escalate_manager_hours * HOUR)
              notify(team.manager_id, 'escalation_manager', 'งานเกินกำหนด — แจ้ง Manager', `${label(t)} (ผู้รับผิดชอบ: ${who.full_name})`, t.id, k('esc_mgr') + ':' + team.manager_id);
          });
        });
      });
      void c; save();
    };
    const assertLead = () => { if (!Core.isLead(me())) throw new Error('ไม่มีสิทธิ์'); };
    const assertAdmin = () => { if (!Core.isAdmin(me())) throw new Error('เฉพาะ Admin'); };
    return {
      mode: 'demo',
      async init() { load(); meId = localStorage.getItem(SKEY); return !!(meId && me()); },
      onAuth() {},
      demoUsers() { load(); return db.users; },
      async demoLogin(id) { load(); meId = id; localStorage.setItem(SKEY, id); },
      async signOut() { meId = null; localStorage.removeItem(SKEY); },
      async signIn() { throw new Error('โหมดทดลองไม่ใช้รหัสผ่าน — เลือกผู้ใช้ตัวอย่างด้านล่าง'); },
      signUp: async () => { throw new Error('โหมดทดลองไม่รองรับการสมัคร'); },
      signInGoogle: async () => { throw new Error('โหมดทดลองไม่รองรับ Google Login'); },
      resetPassword: async () => { throw new Error('โหมดทดลองไม่รองรับการรีเซ็ตรหัสผ่าน'); },
      updatePassword: async () => { throw new Error('โหมดทดลองไม่รองรับการเปลี่ยนรหัสผ่าน'); },
      async myProfile() { load(); return me() || null; },
      async loadAll() {
        load(); checks();
        const m = me(), c = ctx();
        return { me: m, users: db.users.filter((u) => u.status === 'approved'), departments: db.departments, teams: db.teams, teamMembers: db.teamMembers,
          tasks: db.tasks.filter((t) => Core.canView(c, m, t)).map((t) => JSON.parse(JSON.stringify(t))),
          notifications: db.notifications.filter((n) => n.user_id === m.id).slice(0, 100), settings: db.settings };
      },
      async detail(id) {
        const t = task(id);
        if (!Core.canView(ctx(), me(), t)) throw new Error('ไม่มีสิทธิ์');
        const by = (a) => a.filter((x) => x.task_id === id);
        return { comments: by(db.comments).sort((a, b) => a.created_at.localeCompare(b.created_at)), attachments: by(db.attachments),
          activity: by(db.activity).sort((a, b) => b.created_at.localeCompare(a.created_at)), approvals: by(db.approvals).sort((a, b) => b.created_at.localeCompare(a.created_at)) };
      },
      async createTask(p) {
        assertLead();
        const seq = db.tasks.length + 1;
        const t = { id: uid(), task_no: 'T-' + String(seq + 1000).padStart(5, '0'), title: p.title, description: p.description, department_id: p.department_id || null,
          priority: p.priority, start_date: p.start_date, due_date: p.due_date, created_by: meId, reviewer_id: p.reviewer_id || null, recurrence: p.recurrence,
          recurrence_next: p.recurrence !== 'none' ? Core.nextRecurrence(p.start_date, p.recurrence) : null, status: 'todo', progress: 0, completed_at: null,
          created_at: nowISO(), updated_at: nowISO(), assignees: [], subtasks: [] };
        const c = ctx();
        p.assignees.forEach((u) => {
          if (!(Core.isAdmin(me()) || u === meId || Core.manages(c, me(), u))) throw new Error('มอบหมายได้เฉพาะพนักงานที่คุณดูแล');
          t.assignees.push({ task_id: t.id, user_id: u, status: 'todo', progress: 0, started_at: null, submitted_at: null, completed_at: null, updated_at: nowISO() });
          if (u !== meId) notify(u, 'assigned', 'ได้รับมอบหมายงานใหม่', label(t), t.id, `assigned:${t.id}:${u}`);
        });
        t.subtasks = p.subtasks.map((s, i) => ({ id: uid(), task_id: t.id, title: s, done: false, sort: i }));
        db.tasks.push(t); act(t.id, 'created');
        (p.links || []).forEach((l) => db.attachments.push({ id: uid(), task_id: t.id, user_id: meId, kind: 'link', name: l, url: l, created_at: nowISO() }));
        save(); return t.id;
      },
      async updateTask(id, p, old) {
        const t = task(id), c = ctx();
        if (!Core.canEdit(c, me(), t)) throw new Error('ไม่มีสิทธิ์แก้ไขงานนี้');
        Object.assign(t, { title: p.title, description: p.description, department_id: p.department_id || null, priority: p.priority, start_date: p.start_date, due_date: p.due_date, reviewer_id: p.reviewer_id || null, updated_at: nowISO() });
        p.assignees.filter((u) => !old.includes(u)).forEach((u) => {
          if (!(Core.isAdmin(me()) || u === meId || Core.manages(c, me(), u))) throw new Error('มอบหมายได้เฉพาะพนักงานที่คุณดูแล');
          t.assignees.push({ task_id: id, user_id: u, status: 'todo', progress: 0, started_at: null, submitted_at: null, completed_at: null, updated_at: nowISO() });
          notify(u, 'assigned', 'ได้รับมอบหมายงานใหม่', label(t), id, `assigned:${id}:${u}`);
        });
        t.assignees = t.assignees.filter((a) => p.assignees.includes(a.user_id));
        Core.rollup(t); act(id, 'edited'); save();
      },
      async deleteTask(id) {
        const t = task(id);
        if (!(Core.isAdmin(me()) || t.created_by === meId)) throw new Error('ไม่มีสิทธิ์ลบงาน');
        db.tasks = db.tasks.filter((x) => x.id !== id); save();
      },
      async setMyStatus(id, status, progress, note) {
        const t = task(id), a = t.assignees.find((x) => x.user_id === meId);
        if (!a) throw new Error('คุณไม่ใช่ผู้รับผิดชอบงานนี้');
        if (['completed', 'rework'].includes(status)) throw new Error('ผู้รับผิดชอบไม่สามารถอนุมัติหรือส่งกลับงานของตนเองได้');
        if (a.status === 'completed') throw new Error('งานนี้อนุมัติปิดแล้ว');
        const from = a.status;
        const prog = status === 'pending_approval' ? 100 : status === 'todo' ? 0 : progress == null ? a.progress : progress;
        Object.assign(a, { status, progress: Math.max(0, Math.min(100, prog)), updated_at: nowISO() });
        if (status !== 'todo' && !a.started_at) a.started_at = nowISO();
        if (status === 'pending_approval') { a.submitted_at = nowISO(); notify(t.reviewer_id || t.created_by, 'submitted', 'มีงานส่งรออนุมัติ', label(t), id, `submitted:${id}:${meId}:${Date.now()}`); }
        Core.rollup(t); t.updated_at = nowISO(); act(id, 'status_change', from, status, { progress: a.progress, note: note || null }); save();
      },
      async review(id, assignee, decision, note) {
        const t = task(id), a = t.assignees.find((x) => x.user_id === assignee);
        if (!a || !Core.canReview(ctx(), me(), t, a)) throw new Error('ไม่มีสิทธิ์ตรวจสอบงานนี้ (หรือไม่ได้อยู่ในสถานะรออนุมัติ / เป็นงานของตนเอง)');
        if (decision === 'approved') Object.assign(a, { status: 'completed', progress: 100, completed_at: nowISO(), updated_at: nowISO() });
        else Object.assign(a, { status: 'rework', progress: Math.min(a.progress, 90), updated_at: nowISO() });
        db.approvals.push({ id: uid(), task_id: id, assignee_id: assignee, reviewer_id: meId, decision, note: note || null, created_at: nowISO() });
        act(id, decision === 'approved' ? 'approved' : 'rejected', 'pending_approval', decision === 'approved' ? 'completed' : 'rework', { assignee, note: note || null });
        notify(assignee, decision === 'approved' ? 'approved' : 'rework', decision === 'approved' ? 'งานได้รับการอนุมัติปิดแล้ว' : 'งานถูกส่งกลับแก้ไข', label(t) + (note ? ' — ' + note : ''), id, `review:${id}:${assignee}:${Date.now()}`);
        Core.rollup(t); t.updated_at = nowISO(); save();
      },
      async escalate(id, note) {
        const t = task(id); assertLead();
        if (!Core.canView(ctx(), me(), t)) throw new Error('ไม่มีสิทธิ์');
        const ms = new Set();
        t.assignees.forEach((a) => db.teamMembers.filter((m) => m.user_id === a.user_id).forEach((m) => { const tg = db.teams.find((x) => x.id === m.team_id); if (tg && tg.manager_id && tg.manager_id !== meId) ms.add(tg.manager_id); }));
        if (!ms.size) throw new Error('ไม่พบ Manager ของทีมที่ต้องแจ้ง');
        ms.forEach((m) => notify(m, 'escalation_manual', 'ขอ Escalate งานที่มีปัญหา', label(t) + (note ? ' — ' + note : ''), id, `esc_manual:${id}:${m}:${Date.now()}`));
        act(id, 'escalated', null, null, { note: note || null, notified: ms.size }); save();
      },
      async addComment(id, body) { if (!Core.canView(ctx(), me(), task(id))) throw new Error('ไม่มีสิทธิ์'); db.comments.push({ id: uid(), task_id: id, user_id: meId, body, created_at: nowISO() }); save(); },
      async addLink(id, name, url) { db.attachments.push({ id: uid(), task_id: id, user_id: meId, kind: 'link', name, url, created_at: nowISO() }); save(); },
      async addFile(id, file) {
        if (file.size > 1.5 * 1024 * 1024) throw new Error('โหมดทดลองรองรับไฟล์ไม่เกิน 1.5 MB');
        const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        db.attachments.push({ id: uid(), task_id: id, user_id: meId, kind: 'file', name: file.name, url: null, storage_path: dataUrl, created_at: nowISO() }); save();
      },
      async fileUrl(att) { return att.kind === 'link' ? att.url : att.storage_path; },
      async deleteAttachment(att) { db.attachments = db.attachments.filter((x) => x.id !== att.id); save(); },
      async toggleSubtask(id, done) { db.tasks.forEach((t) => t.subtasks.forEach((s) => { if (s.id === id) { s.done = done; s.done_by = done ? meId : null; } })); save(); },
      async markRead(id) { const n = db.notifications.find((x) => x.id === id); if (n) n.read_at = nowISO(); save(); },
      async markAllRead() { db.notifications.forEach((n) => { if (n.user_id === meId && !n.read_at) n.read_at = nowISO(); }); save(); },
      async listUsers() { assertAdmin(); return db.users; },
      async saveUser(u) {
        assertAdmin();
        const row = { email: u.email.toLowerCase().trim(), employee_id: u.employee_id || null, full_name: u.full_name, position: u.position || null, department_id: u.department_id || null, role: u.role, status: u.status };
        if (u.id) Object.assign(db.users.find((x) => x.id === u.id), row); else db.users.push({ id: uid(), ...row });
        save();
      },
      async saveDept(d) { assertAdmin(); if (d.id) db.departments.find((x) => x.id === d.id).name = d.name; else db.departments.push({ id: uid(), name: d.name }); save(); },
      async saveTeam(t) {
        assertAdmin();
        const row = { name: t.name, department_id: t.department_id || null, manager_id: t.manager_id || null };
        if (t.id) { Object.assign(db.teams.find((x) => x.id === t.id), row); save(); return t.id; }
        const n = { id: uid(), ...row }; db.teams.push(n); save(); return n.id;
      },
      async setTeamMembers(teamId, members) { assertAdmin(); db.teamMembers = db.teamMembers.filter((m) => m.team_id !== teamId).concat(members.map((m) => ({ team_id: teamId, ...m }))); save(); },
      async deleteTeam(id) { assertAdmin(); db.teams = db.teams.filter((t) => t.id !== id); db.teamMembers = db.teamMembers.filter((m) => m.team_id !== id); save(); },
      async saveSetting(k, v) { assertAdmin(); db.settings[k] = v; save(); },
      async resetDemo() { db = seed(); save(); },
    };
  }

  /* ---------------- Apps Script adapter (Google Sheets backend + Google Sign-In) ---------------- */
  function makeGas() {
    const SK = 'gotask_gas_session';
    let session = null, me = null;
    try { session = localStorage.getItem(SK); } catch (e) { /* ignore */ }
    const call = async (action, params) => {
      let r;
      try { r = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify({ action, session, params: params || {} }), redirect: 'follow' }); }
      catch (e) { throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต หรือ URL ของ Apps Script'); }
      let j; try { j = await r.json(); } catch (e) { throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (ตรวจสอบว่า Deploy เป็น Web app แบบ Anyone)'); }
      if (!j.ok) { if (j.code === 'AUTH') { session = null; try { localStorage.removeItem(SK); } catch (e) { /* ignore */ } } throw new Error(j.error); }
      return j.data;
    };
    return {
      mode: 'gas',
      async init() { if (!session) return false; try { me = await call('me'); return true; } catch (e) { return false; } },
      onAuth() {},
      async googleLogin(idToken) {
        const r = await call('login', { idToken });
        me = r.profile; session = r.session;
        try { if (session) localStorage.setItem(SK, session); else localStorage.removeItem(SK); } catch (e) { /* ignore */ }
      },
      async signOut() { session = null; me = null; try { localStorage.removeItem(SK); } catch (e) { /* ignore */ } },
      signIn: async () => { throw new Error('ใช้ปุ่ม Sign in with Google'); },
      signUp: async () => { throw new Error('ใช้ปุ่ม Sign in with Google — บัญชีใหม่จะอยู่สถานะรอ Admin อนุมัติ'); },
      signInGoogle: async () => { throw new Error('ใช้ปุ่ม Sign in with Google'); },
      resetPassword: async () => { throw new Error('ระบบนี้ใช้บัญชี Google — ไม่มีรหัสผ่านของระบบ'); },
      updatePassword: async () => { throw new Error('ระบบนี้ใช้บัญชี Google — ไม่มีรหัสผ่านของระบบ'); },
      async myProfile() { return me; },
      async loadAll() { const d = await call('loadAll'); me = d.me; return d; },
      detail: (id) => call('detail', { id }),
      createTask: (t) => call('createTask', t),
      async updateTask(id, t) { await call('updateTask', { id, ...t }); },
      async deleteTask(id) { await call('deleteTask', { id }); },
      async setMyStatus(taskId, status, progress, note) { await call('setMyStatus', { taskId, status, progress, note }); },
      async review(taskId, assignee, decision, note) { await call('review', { taskId, assignee, decision, note }); },
      async escalate(id, note) { await call('escalate', { id, note }); },
      async addComment(taskId, body) { await call('addComment', { taskId, body }); },
      async addLink(taskId, name, url) { await call('addLink', { taskId, name, url }); },
      async addFile(taskId, file) {
        if (file.size > 5 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 5 MB');
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
        await call('addFile', { taskId, name: file.name, mime: file.type, b64 });
      },
      async fileUrl(att) {
        if (att.kind === 'link') return att.url;
        const d = await call('fileData', { id: att.id });
        const bin = atob(d.b64), arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([arr], { type: d.mime }));
      },
      async deleteAttachment(att) { await call('deleteAttachment', { id: att.id }); },
      async toggleSubtask(id, done) { await call('toggleSubtask', { id, done }); },
      async markRead(id) { await call('markRead', { id }); },
      async markAllRead() { await call('markAllRead'); },
      listUsers: () => call('listUsers'),
      async saveUser(u) { await call('saveUser', u); },
      async saveDept(d) { await call('saveDept', d); },
      saveTeam: (t) => call('saveTeam', t),
      async setTeamMembers(teamId, members) { await call('setTeamMembers', { teamId, members }); },
      async deleteTeam(id) { await call('deleteTeam', { id }); },
      async saveSetting(key, value) { await call('saveSetting', { key, value }); },
      lineBindCode: () => call('lineBindCode'),
      listDrafts: () => call('listDrafts'),
      saveDraft: (d) => call('saveDraft', d),
      async deleteDraft(id) { await call('deleteDraft', { id }); },
    };
  }

  /* แบบร่างเก็บในเบราว์เซอร์ (โหมดทดลอง / Supabase) — แบบ Apps Script เก็บในชีต Drafts */
  function localDrafts(api) {
    const key = async () => 'gotask_drafts_' + (((await api.myProfile()) || {}).id || 'x');
    const rd = async () => { try { return JSON.parse(localStorage.getItem(await key())) || []; } catch (e) { return []; } };
    const wr = async (a) => { try { localStorage.setItem(await key(), JSON.stringify(a)); } catch (e) { throw new Error('บันทึกแบบร่างในเบราว์เซอร์ไม่ได้'); } };
    return {
      async listDrafts() { return (await rd()).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); },
      async saveDraft(d) {
        const all = await rd(), now = new Date().toISOString(), title = String(d.title || '').trim().slice(0, 200) || '(ไม่มีชื่อ)';
        let x = d.id && all.find((r) => r.id === d.id);
        if (x) Object.assign(x, { title, payload: d.payload, updated_at: now });
        else { x = { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, payload: d.payload, updated_at: now }; all.push(x); }
        await wr(all); return x.id;
      },
      async deleteDraft(id) { await wr((await rd()).filter((r) => r.id !== id)); },
    };
  }

  const hasGas = !!CFG.GAS_URL;
  const hasSb = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const hasKeys = hasGas || hasSb;
  const wantDemo = new URLSearchParams(location.search).get('demo') === '1';
  const libMissing = !hasGas && hasSb && !window.supabase;
  const api = wantDemo || !hasKeys || libMissing ? makeDemo() : hasGas ? makeGas() : makeSupabase();
  if (!api.listDrafts) Object.assign(api, localDrafts(api));
  window.GT = { Core, api, configured: hasKeys, hasKeys, libMissing, canDemo: !hasKeys || CFG.ALLOW_DEMO !== false, googleClientId: CFG.GOOGLE_CLIENT_ID || '' };
})();
