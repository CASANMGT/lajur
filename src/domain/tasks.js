/**
 * Operational tasks: receiving, picking, cutting, sewing, QC, transfer,
 * shipment and opname. Tasks coordinate work; they never post stock.
 * Stock still moves only through receipts, transfers, invoices and adjustments.
 */

import {
  DomainError, MM_PER_M, assert, audit, businessDate, byId, isoNow, nextId, todayJakarta,
} from './core.js';

export const TASK_TYPE = {
  receive: { label: 'Terima barang', icon: 'truck', group: 'inbound' },
  putaway: { label: 'Penempatan', icon: 'box', group: 'inbound' },
  picking: { label: 'Picking', icon: 'package', group: 'outbound' },
  cutting: { label: 'Potong kain', icon: 'cut', group: 'production' },
  sewing: { label: 'Jahit & finishing', icon: 'needle', group: 'production' },
  qc: { label: 'QC', icon: 'checkCircle', group: 'production' },
  transfer: { label: 'Transfer internal', icon: 'transfer', group: 'outbound' },
  shipment: { label: 'Pengiriman impor', icon: 'ship', group: 'inbound' },
  opname: { label: 'Opname', icon: 'clipboard', group: 'control' },
  sample: { label: 'Sample pelanggan', icon: 'spark', group: 'sales' },
};

export const TASK_STATUS = {
  open: { label: 'Baru', tone: 'muted' },
  in_progress: { label: 'Dikerjakan', tone: 'info' },
  blocked: { label: 'Terhambat', tone: 'warn' },
  done: { label: 'Selesai', tone: 'ok' },
  cancelled: { label: 'Dibatalkan', tone: 'danger' },
};

export const PRIORITY = {
  low: { label: 'Rendah', tone: 'muted', weight: 1 },
  normal: { label: 'Normal', tone: 'info', weight: 2 },
  high: { label: 'Tinggi', tone: 'warn', weight: 3 },
  urgent: { label: 'Mendesak', tone: 'danger', weight: 4 },
};

export const OPEN_TASK_STATUS = ['open', 'in_progress', 'blocked'];

export function getTask(db, id) {
  return db.tasks.find((t) => t.id === id) ?? null;
}

export function requireTask(db, id) {
  const task = getTask(db, id);
  if (!task) throw new DomainError('TASK_NOT_FOUND', 'Tugas tidak ditemukan.');
  return task;
}

export function createTask(db, {
  type, title = '', warehouseId, assigneeId = null, priority = 'normal', dueDate,
  projectId = null, rollId = null, qtyMm = null, notes = '', user,
}) {
  assert(TASK_TYPE[type], 'INVALID_TASK_TYPE', 'Jenis tugas tidak dikenal.');
  const warehouse = byId(db.warehouses, warehouseId);
  assert(warehouse, 'WAREHOUSE_NOT_FOUND', 'Gudang tugas tidak ditemukan.');
  assert(warehouse.active !== false, 'WAREHOUSE_INACTIVE', 'Gudang nonaktif tidak dapat menerima tugas.');
  if (assigneeId) assert(byId(db.users, assigneeId), 'USER_NOT_FOUND', 'Petugas tidak ditemukan.');
  if (projectId) assert(byId(db.projects, projectId), 'PROJECT_NOT_FOUND', 'Proyek tidak ditemukan.');
  if (rollId) {
    const roll = byId(db.rolls, rollId);
    assert(roll, 'ROLL_NOT_FOUND', 'Roll tidak ditemukan.');
    assert(!roll.transit && roll.warehouseId === warehouseId, 'ROLL_LOCATION', 'Roll harus berada di gudang tugas.');
  }
  const cleanTitle = String(title ?? '').trim() || TASK_TYPE[type].label;

  const task = {
    id: nextId(db, 'task', 'TSK', 4),
    type,
    title: cleanTitle,
    warehouseId,
    assigneeId,
    priority: PRIORITY[priority] ? priority : 'normal',
    status: 'open',
    dueDate: dueDate || todayJakarta(),
    projectId,
    rollId,
    qtyMm: qtyMm ? Math.round(qtyMm) : null,
    notes: String(notes ?? '').trim(),
    attachments: [],
    history: [{ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Tugas dibuat' }],
    createdBy: user?.id ?? 'system',
    createdAt: isoNow(),
    startedAt: null,
    completedAt: null,
    completionNote: '',
  };
  db.tasks.unshift(task);
  audit(db, user, 'buat_tugas', 'task', task.id, `${type} · ${cleanTitle}`);
  return task;
}

export function assignTask(db, { id, assigneeId, user }) {
  const task = requireTask(db, id);
  assert(OPEN_TASK_STATUS.includes(task.status), 'INVALID_STATUS', 'Tugas sudah selesai.');
  assert(byId(db.users, assigneeId), 'USER_NOT_FOUND', 'Petugas tidak ditemukan.');
  task.assigneeId = assigneeId;
  task.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: `Ditugaskan ke ${byId(db.users, assigneeId).name}` });
  audit(db, user, 'tugaskan_tugas', 'task', task.id, assigneeId);
  return task;
}

export function startTask(db, { id, user }) {
  const task = requireTask(db, id);
  assert(['open', 'blocked'].includes(task.status), 'INVALID_STATUS', 'Tugas tidak dapat dimulai.');
  task.status = 'in_progress';
  task.startedAt = isoNow();
  if (!task.assigneeId) task.assigneeId = user?.id ?? null;
  task.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Mulai dikerjakan' });
  audit(db, user, 'mulai_tugas', 'task', task.id, '');
  return task;
}

export function blockTask(db, { id, reason, user }) {
  const task = requireTask(db, id);
  assert(task.status === 'in_progress', 'INVALID_STATUS', 'Hanya tugas berjalan yang dapat dihambat.');
  assert(reason && reason.trim().length >= 3, 'REASON_REQUIRED', 'Alasan hambatan wajib diisi.');
  task.status = 'blocked';
  task.blockedReason = reason.trim();
  task.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Terhambat', note: reason.trim() });
  audit(db, user, 'hambat_tugas', 'task', task.id, reason.trim());
  return task;
}

export function resumeTask(db, { id, user }) {
  const task = requireTask(db, id);
  assert(task.status === 'blocked', 'INVALID_STATUS', 'Tugas tidak sedang terhambat.');
  task.status = 'in_progress';
  task.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Dilanjutkan' });
  audit(db, user, 'lanjut_tugas', 'task', task.id, '');
  return task;
}

export function completeTask(db, { id, note = '', attachment = null, user }) {
  const task = requireTask(db, id);
  assert(OPEN_TASK_STATUS.includes(task.status), 'INVALID_STATUS', 'Tugas sudah selesai.');
  const clean = String(note ?? '').trim();
  task.status = 'done';
  task.completedAt = isoNow();
  task.completionNote = clean;
  if (attachment) {
    task.attachments = task.attachments ?? [];
    task.attachments.push({
      ...attachment,
      note: clean,
      at: isoNow(),
      by: user?.name ?? 'Sistem',
    });
  }
  task.history.push({
    at: isoNow(),
    by: user?.name ?? 'Sistem',
    action: 'Selesai',
    note: clean || (attachment ? 'Dengan bukti fisik' : ''),
  });
  audit(db, user, 'selesai_tugas', 'task', task.id, clean);
  return task;
}

export function cancelTask(db, { id, reason = '', user }) {
  const task = requireTask(db, id);
  assert(!['done', 'cancelled'].includes(task.status), 'INVALID_STATUS', 'Tugas sudah ditutup.');
  task.status = 'cancelled';
  task.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Dibatalkan', note: reason });
  audit(db, user, 'batalkan_tugas', 'task', task.id, reason);
  return task;
}

export function isOverdue(task, today = todayJakarta()) {
  return OPEN_TASK_STATUS.includes(task.status) && Boolean(task.dueDate) && task.dueDate < today;
}

export function taskList(db, { warehouseId = null, assigneeId = null, status = 'open' } = {}) {
  return db.tasks
    .filter((t) => (!warehouseId || t.warehouseId === warehouseId))
    .filter((t) => (!assigneeId || t.assigneeId === assigneeId))
    .filter((t) => {
      if (status === 'open') return OPEN_TASK_STATUS.includes(t.status);
      if (status === 'all') return true;
      return t.status === status;
    })
    .sort((a, b) => {
      const pa = PRIORITY[a.priority]?.weight ?? 0;
      const pb = PRIORITY[b.priority]?.weight ?? 0;
      if (pa !== pb) return pb - pa;
      return String(a.dueDate).localeCompare(String(b.dueDate));
    });
}

export function taskStats(db, { warehouseId = null, assigneeId = null } = {}) {
  const today = todayJakarta();
  const tasks = db.tasks
    .filter((t) => (!warehouseId || t.warehouseId === warehouseId))
    .filter((t) => (!assigneeId || t.assigneeId === assigneeId || (!t.assigneeId && OPEN_TASK_STATUS.includes(t.status))));
  const open = tasks.filter((t) => t.status === 'open').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const overdue = tasks.filter((t) => isOverdue(t, today)).length;
  const dueToday = tasks.filter((t) => OPEN_TASK_STATUS.includes(t.status) && t.dueDate === today).length;
  const doneToday = tasks.filter((t) => t.status === 'done' && t.completedAt && businessDate(new Date(t.completedAt)) === today).length;
  const cutting = tasks.filter((t) => t.type === 'cutting' && OPEN_TASK_STATUS.includes(t.status)).length;
  return { total: tasks.length, open, inProgress, blocked, overdue, dueToday, doneToday, cutting, active: open + inProgress + blocked };
}

export function cuttingQueue(db) {
  return taskList(db, { status: 'open' })
    .filter((t) => t.type === 'cutting')
    .map((t) => ({
      task: t,
      roll: t.rollId ? db.rolls.find((r) => r.id === t.rollId) : null,
      project: t.projectId ? db.projects.find((p) => p.id === t.projectId) : null,
      assignee: t.assigneeId ? db.users.find((u) => u.id === t.assigneeId) : null,
    }));
}

export function taskAgeDays(task, today = todayJakarta()) {
  const start = task.createdAt?.slice(0, 10) ?? today;
  return Math.max(0, Math.round((new Date(`${today}T00:00:00+07:00`) - new Date(`${start}T00:00:00+07:00`)) / 86_400_000));
}

export function taskQtyLabel(task) {
  return task.qtyMm ? `${(task.qtyMm / MM_PER_M).toLocaleString('id-ID')} m` : '';
}
