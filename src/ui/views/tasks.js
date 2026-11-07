/** Tugas operasi: antrean kerja operator dan monitoring manajer. */

import {
  esc, icon, fmt, badge, toast, openModal, field, confirmAction, promptText,
} from '../dom.js';
import { byId, parseM, todayJakarta } from '../../domain/core.js';
import { settingsOf } from '../../domain/settings.js';
import {
  PRIORITY, TASK_STATUS, TASK_TYPE, assignTask, blockTask, cancelTask, completeTask, createTask, isOverdue,
  resumeTask, startTask, taskAgeDays, taskList, taskQtyLabel, taskStats,
} from '../../domain/tasks.js';
import { warehouseOf, can, warehouseOptions, pageHead, statCard } from './common.js';
import { attachmentMeta } from '../../domain/attachments.js';

let filter = { status: 'open', mine: null, type: 'all' };
let lastRole = null;

function taskCard(ctx, task) {
  const type = TASK_TYPE[task.type] ?? { label: task.type, icon: 'listCheck' };
  const status = TASK_STATUS[task.status];
  const assignee = task.assigneeId ? byId(ctx.db.users, task.assigneeId) : null;
  const overdue = isOverdue(task);
  return `<button class="task-card ${task.status === 'done' ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''}" type="button" data-task="${task.id}">
    <span class="task-ico">${icon(type.icon)}</span>
    <span class="task-main">
      <span class="task-top">
        <strong>${esc(task.title)}</strong>
        ${badge(status.label, status.tone)}
      </span>
      <span class="task-meta">
        ${esc(type.label)} · ${esc(warehouseOf(ctx.db, task.warehouseId)?.code ?? '—')}
        ${task.qtyMm ? ` · ${esc(taskQtyLabel(task))}` : ''}
        ${task.rollId ? ` · <span class="mono">${esc(task.rollId)}</span>` : ''}
      </span>
      <span class="task-foot">
        <span>${assignee ? esc(assignee.name) : 'Belum ditugaskan'}</span>
        <span class="${overdue ? 'strong' : ''}">${overdue ? 'Lewat ' : 'Jatuh '}${esc(task.dueDate)}</span>
        <span>${esc(PRIORITY[task.priority]?.label ?? task.priority)}</span>
        ${task.attachments?.length ? `<span class="task-proof">${icon('camera')} ${task.attachments.length}</span>` : ''}
      </span>
    </span>
  </button>`;
}

export function render(ctx) {
  const { db, role, ui, user } = ctx;
  const mineDefault = role === 'operator';
  if (lastRole !== role) {
    filter.mine = mineDefault;
    lastRole = role;
  }
  const assigneeId = filter.mine ? user.id : null;
  const warehouseId = ui.warehouseId === 'all' ? null : ui.warehouseId;
  const stats = taskStats(db, { warehouseId, assigneeId });
  const tasks = taskList(db, { warehouseId, assigneeId, status: filter.status })
    .filter((t) => filter.type === 'all' || t.type === filter.type);

  const cutting = db.tasks.filter((t) => t.type === 'cutting' && ['open', 'in_progress', 'blocked'].includes(t.status));

  return `
    ${pageHead({
      eyebrow: 'Operasi gudang',
      title: 'Tugas operasi',
      sub: 'Terima barang, picking, potong kain, jahit, QC, transfer, opname, sample dan pengiriman impor — satu antrean.',
      actions: `${can(role, 'task.create') ? `<button class="btn btn-primary" type="button" data-act="new-task">${icon('plus')} Buat tugas</button>` : ''}`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Aktif', value: String(stats.active), meta: `${stats.dueToday} jatuh tempo hari ini`, tone: 'accent', iconName: 'listCheck' })}
      ${statCard({ label: 'Dikerjakan', value: String(stats.inProgress), meta: `${stats.blocked} terhambat` })}
      ${statCard({ label: 'Lewat jatuh tempo', value: String(stats.overdue), meta: 'Perlu keputusan', tone: 'warn', iconName: 'clock' })}
      ${statCard({ label: 'Potong kain', value: String(stats.cutting), meta: `Selesai hari ini ${stats.doneToday}`, iconName: 'cut' })}
    </div>

    ${cutting.length ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('cut')}<div><strong>${cutting.length} tugas potong kain aktif.</strong> Periksa roll, lot, dan sisa sebelum memotong. Tugas tidak mengubah stok; potongan dicatat lewat faktur/proyek.</div></div>` : ''}

    <div class="filterbar" style="grid-template-columns:auto 1fr 1.4fr auto">
      <div class="row" style="gap:6px">
        ${[['open', 'Aktif'], ['done', 'Selesai'], ['all', 'Semua']].map(([k, label]) => `<button class="chip" type="button" data-status="${k}" aria-pressed="${filter.status === k}">${label}</button>`).join('')}
      </div>
      <select class="select" id="task-type" aria-label="Jenis tugas">
        <option value="all">Semua jenis</option>
        ${Object.entries(TASK_TYPE).map(([k, v]) => `<option value="${k}" ${filter.type === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
      </select>
      <label class="checkline"><input type="checkbox" id="task-mine" ${filter.mine ? 'checked' : ''} /> Hanya tugas saya</label>
      <span class="badge no-dot">${esc(warehouseOf(db, ui.warehouseId)?.code ?? 'Semua')}</span>
    </div>

    <section class="card">
      <div class="card-head"><div><h2>${filter.status === 'done' ? 'Tugas selesai' : 'Antrean tugas'}</h2><p>${tasks.length} tugas · urut prioritas dan tanggal.</p></div></div>
      <div class="task-list">
        ${tasks.map((t) => taskCard(ctx, t)).join('') || `<div class="empty">${icon('checkCircle')}<strong>Tidak ada tugas</strong><p>Antrean bersih untuk filter ini.</p></div>`}
      </div>
    </section>

    <div class="grid grid-2" style="margin-top:16px">
      <section class="card card-pad">
        <h2>Alur operasi</h2>
        <div class="flow" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-top:12px">
          ${['receive', 'cutting', 'sewing', 'qc'].map((k, i) => `<div class="flow-step ${i === 0 ? 'current' : ''}"><strong>${esc(TASK_TYPE[k].label)}</strong>${i === 0 ? 'Hari ini' : 'Berikutnya'}</div>`).join('')}
        </div>
        <div class="flow" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          ${['transfer', 'shipment', 'opname'].map((k) => `<div class="flow-step"><strong>${esc(TASK_TYPE[k].label)}</strong>Terjadwal</div>`).join('')}
        </div>
      </section>
      <section class="card card-pad">
        <h2>Aturan tugas</h2>
        <ul class="small muted" style="padding-left:16px;margin:8px 0 0;line-height:1.7">
          <li>Tugas hanya koordinasi; stok berubah lewat penerimaan, transfer, faktur, atau opname.</li>
          <li>Bukti fisik (foto/dokumen) bersifat opsional dan disimpan sebagai metadata.</li>
          <li>Operator melihat tugas gudang aktif; manajer melihat semua dan dapat menugaskan ulang.</li>
        </ul>
      </section>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Detail & actions                                                           */
/* -------------------------------------------------------------------------- */

function openTask(ctx, task) {
  const type = TASK_TYPE[task.type];
  const assignee = task.assigneeId ? byId(ctx.db.users, task.assigneeId) : null;
  const roll = task.rollId ? ctx.db.rolls.find((r) => r.id === task.rollId) : null;
  const project = task.projectId ? ctx.db.projects.find((p) => p.id === task.projectId) : null;
  const open = ['open', 'in_progress', 'blocked'].includes(task.status);
  const canWork = can(ctx.role, 'task.complete');
  const actions = [];
  if (open && task.status !== 'in_progress' && canWork) actions.push(`<button class="btn btn-primary" type="button" data-task-act="start">${icon('play')} Mulai</button>`);
  if (task.status === 'blocked' && canWork) actions.push(`<button class="btn" type="button" data-task-act="resume">${icon('refresh')} Lanjutkan</button>`);
  if (task.status === 'in_progress' && canWork) actions.push(`<button class="btn" type="button" data-task-act="block">${icon('alert')} Terhambat</button>`);
  if (open && canWork) actions.push(`<button class="btn btn-primary" type="button" data-task-act="done">${icon('check')} Selesai</button>`);
  if (open && ctx.role === 'manager') {
    actions.push(`<button class="btn" type="button" data-task-act="assign">${icon('userCheck')} Tugaskan</button>`);
    actions.push(`<button class="btn btn-ghost" type="button" data-task-act="cancel">Batalkan</button>`);
  }

  openModal({
    title: task.title,
    description: `${type?.label ?? task.type} · ${warehouseOf(ctx.db, task.warehouseId)?.name ?? ''}`,
    submitLabel: 'Tutup',
    wide: true,
    body: `
      <div class="row" style="margin-bottom:12px">${badge(TASK_STATUS[task.status].label, TASK_STATUS[task.status].tone)} ${badge(PRIORITY[task.priority]?.label ?? task.priority, PRIORITY[task.priority]?.tone ?? 'muted')} ${isOverdue(task) ? badge('Lewat jatuh tempo', 'danger') : ''}</div>
      <div class="grid grid-3">
        <div><div class="xs muted">Petugas</div><div class="small strong">${esc(assignee?.name ?? 'Belum ditugaskan')}</div></div>
        <div><div class="xs muted">Jatuh tempo</div><div class="small ${isOverdue(task) ? 'strong' : ''}">${esc(task.dueDate)}</div></div>
        <div><div class="xs muted">Umur tugas</div><div class="small">${taskAgeDays(task)} hari</div></div>
        ${task.qtyMm ? `<div><div class="xs muted">Target potong</div><div class="small strong">${fmt.m(task.qtyMm)}</div></div>` : ''}
        ${roll ? `<div><div class="xs muted">Roll</div><a class="small mono" href="#/stok/${roll.id}">${esc(roll.id)}</a></div>` : ''}
        ${project ? `<div><div class="xs muted">Proyek</div><a class="small" href="#/proyek/${project.id}">${esc(project.name)}</a></div>` : ''}
      </div>
      ${task.notes ? `<div class="notice notice-info" style="margin-top:12px">${icon('alert')}<div>${esc(task.notes)}</div></div>` : ''}
      ${task.status === 'blocked' && task.blockedReason ? `<div class="notice notice-warn" style="margin-top:12px">${icon('alert')}<div><strong>Terhambat:</strong> ${esc(task.blockedReason)}</div></div>` : ''}
      ${task.completionNote ? `<div class="notice notice-teal" style="margin-top:12px">${icon('checkCircle')}<div><strong>Selesai:</strong> ${esc(task.completionNote)}</div></div>` : ''}
      ${task.attachments?.length ? `<div style="margin-top:12px"><div class="xs muted">Bukti fisik</div>${task.attachments.map((a) => `<div class="row-between small"><span>${icon('camera')} ${esc(a.name)}</span><span class="xs muted">${esc(a.by)}</span></div>`).join('')}</div>` : ''}
      <hr class="divider" />
      <div class="xs muted" style="margin-bottom:6px">Riwayat</div>
      <ul class="timeline">${(task.history ?? []).map((h) => `<li><div class="t-head"><strong>${esc(h.action)}</strong><time>${esc(new Date(h.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</time></div><div class="t-body">${esc(h.by ?? '')}${h.note ? ` · ${esc(h.note)}` : ''}</div></li>`).join('')}</ul>
      ${actions.length ? `<div class="row" style="margin-top:14px">${actions.join('')}</div>` : ''}
    `,
    onSubmit: (form, close) => close(),
    onMount(form, close) {
      form.querySelector('[data-task-act="start"]')?.addEventListener('click', () => {
        ctx.store.update((db) => startTask(db, { id: task.id, user: ctx.user }));
        close();
        toast('Tugas dimulai.', { tone: 'success' });
      });
      form.querySelector('[data-task-act="resume"]')?.addEventListener('click', () => {
        ctx.store.update((db) => resumeTask(db, { id: task.id, user: ctx.user }));
        close();
        toast('Tugas dilanjutkan.', { tone: 'success' });
      });
      form.querySelector('[data-task-act="block"]')?.addEventListener('click', async () => {
        const reason = await promptText({ title: 'Tandai terhambat', label: 'Alasan hambatan', submitLabel: 'Simpan', tone: 'danger' });
        if (!reason) return;
        ctx.store.update((db) => blockTask(db, { id: task.id, reason, user: ctx.user }));
        close();
        toast('Tugas ditandai terhambat.', { tone: 'success' });
      });
      form.querySelector('[data-task-act="done"]')?.addEventListener('click', () => openComplete(ctx, task, close));
      form.querySelector('[data-task-act="assign"]')?.addEventListener('click', () => {
        openModal({
          title: 'Tugaskan ulang',
          body: field('Petugas', `<select class="select" name="assignee">${ctx.db.users.map((u) => `<option value="${u.id}" ${task.assigneeId === u.id ? 'selected' : ''}>${esc(u.name)} · ${esc(u.role)}</option>`).join('')}</select>`),
          onSubmit(f, c) {
            ctx.store.update((db) => assignTask(db, { id: task.id, assigneeId: f.assignee.value, user: ctx.user }));
            c();
            close();
            toast('Tugas ditugaskan ulang.', { tone: 'success' });
          },
        });
      });
      form.querySelector('[data-task-act="cancel"]')?.addEventListener('click', async () => {
        const ok = await confirmAction({ title: 'Batalkan tugas?', message: 'Riwayat tetap tersimpan.', confirmLabel: 'Batalkan', tone: 'danger' });
        if (!ok) return;
        ctx.store.update((db) => cancelTask(db, { id: task.id, user: ctx.user, reason: 'Dibatalkan manajer' }));
        close();
        toast('Tugas dibatalkan.', { tone: 'success' });
      });
    },
  });
}

function openComplete(ctx, task, parentClose) {
  openModal({
    title: 'Selesaikan tugas',
    description: task.title,
    submitLabel: 'Tandai selesai',
    body: `
      ${field('Catatan hasil', `<textarea class="textarea" name="note" placeholder="Contoh: 10 m dipotong, sisa 50 m, tepi rapi."></textarea>`)}
      ${field('Bukti fisik (opsional)', `<input class="input" type="file" name="proof" accept="image/*,.pdf" />`, { hint: 'Demo menyimpan nama/ukuran berkas saja, bukan isinya.' })}
    `,
    onSubmit(form, close) {
      const file = form.proof.files?.[0] ?? null;
      const attachment = attachmentMeta(file, { note: form.note.value });
      ctx.store.update((db) => completeTask(db, { id: task.id, note: form.note.value, attachment, user: ctx.user }));
      close();
      parentClose?.();
      toast('Tugas selesai.', { tone: 'success' });
    },
  });
}

function openCreate(ctx) {
  const { db } = ctx;
  const active = db.warehouses.filter((w) => w.active !== false);
  if (!active.length) {
    toast('Tidak ada gudang aktif.', { tone: 'error' });
    return;
  }
  const defaultWh = ctx.ui.warehouseId === 'all' ? active[0].id : ctx.ui.warehouseId;
  const rollOptionsFor = (wh) => db.rolls
    .filter((r) => r.warehouseId === wh && !r.transit && ['available', 'quarantine'].includes(r.status))
    .map((r) => `<option value="${r.id}">${esc(r.id)} · ${esc(r.lot)} · ${fmt.m(r.currentMm)}</option>`).join('');
  const rollOptions = rollOptionsFor(defaultWh);
  const projectOptions = db.projects.filter((p) => !['cancelled'].includes(p.status))
    .map((p) => `<option value="${p.id}">${esc(p.id)} · ${esc(p.name)}</option>`).join('');
  const assignees = db.users.map((u) => `<option value="${u.id}">${esc(u.name)} · ${esc(u.role)}</option>`).join('');

  openModal({
    title: 'Buat tugas operasi',
    description: 'Tugas mengoordinasikan pekerjaan; stok tetap hanya berubah lewat dokumen stok.',
    wide: true,
    submitLabel: 'Buat tugas',
    body: `<div class="form-grid">
      ${field('Jenis', `<select class="select" name="type">${Object.entries(TASK_TYPE).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>`)}
      ${field('Gudang', `<select class="select" name="warehouse">${warehouseOptions(db, defaultWh)}</select>`)}
      ${field('Judul', `<input class="input" name="title" placeholder="Contoh: Potong 10 m Luna-01 untuk proyek Sari" />`, { full: true })}
      ${field('Petugas', `<select class="select" name="assignee">${assignees}</select>`)}
      ${field('Prioritas', `<select class="select" name="priority">${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`)}
      ${field('Jatuh tempo', `<input class="input" type="date" name="dueDate" value="${new Date(Date.now() + (settingsOf(db).taskDueDays ?? 1) * 86400000).toISOString().slice(0, 10)}" />`)}
      ${field('Target (m)', `<input class="input" name="qty" inputmode="decimal" placeholder="0" />`, { hint: 'Opsional, untuk potong kain.' })}
      ${field('Roll', `<select class="select" name="roll"><option value="">— Tanpa roll —</option>${rollOptions}</select>`)}
      ${field('Proyek', `<select class="select" name="project"><option value="">— Tanpa proyek —</option>${projectOptions}</select>`)}
      ${field('Catatan / instruksi', `<textarea class="textarea" name="notes" placeholder="Langkah kerja, lokasi, atau syarat QC."></textarea>`, { full: true })}
    </div>`,
    onMount(form) {
      form.warehouse.addEventListener('change', () => {
        form.roll.innerHTML = `<option value="">— Tanpa roll —</option>${rollOptionsFor(form.warehouse.value)}`;
      });
    },
    onSubmit(form, close) {
      const task = ctx.store.update((db) => createTask(db, {
        type: form.type.value,
        title: form.title.value,
        warehouseId: form.warehouse.value,
        assigneeId: form.assignee.value || null,
        priority: form.priority.value,
        dueDate: form.dueDate.value,
        projectId: form.project.value || null,
        rollId: form.roll.value || null,
        qtyMm: form.qty.value ? parseM(form.qty.value) : null,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast(`${TASK_TYPE[task.type].label} dibuat untuk ${warehouseOf(ctx.db, task.warehouseId)?.code}.`, { tone: 'success' });
    },
  });
}

/* -------------------------------------------------------------------------- */

export function mount(ctx) {
  document.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', () => {
    filter.status = btn.dataset.status;
    ctx.store.emit();
  }));
  document.getElementById('task-type')?.addEventListener('change', (e) => {
    filter.type = e.target.value;
    ctx.store.emit();
  });
  document.getElementById('task-mine')?.addEventListener('change', (e) => {
    filter.mine = e.target.checked;
    ctx.store.emit();
  });
  document.querySelector('[data-act="new-task"]')?.addEventListener('click', () => openCreate(ctx));
  document.querySelectorAll('[data-task]').forEach((btn) => btn.addEventListener('click', () => {
    const task = ctx.db.tasks.find((t) => t.id === btn.dataset.task);
    if (task) openTask(ctx, task);
  }));
}
