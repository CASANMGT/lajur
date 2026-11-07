/**
 * Projects: draft → material reservation → invoice/stock issue → handover.
 *
 * The invoice posting is the one authoritative stock-issue event. Handover
 * only closes the project; it never deducts inventory a second time.
 *
 * Partial project fulfilment is intentionally out of demo scope: a project is
 * issued as one document, and the shortage list must be empty before issue.
 */

import {
  DomainError, MM_PER_M, assert, audit, byId, isoNow, nextId, todayJakarta,
} from './core.js';
import {
  availableMm, partStockRow, recordMovement, releaseAllReservations, requireRoll, reserveRoll,
} from './inventory.js';
import { createInvoice, postInvoice } from './sales.js';

export const PROJECT_STATUS = {
  draft: { label: 'Draf', tone: 'muted' },
  reserved: { label: 'Materi terpesan', tone: 'info' },
  issued: { label: 'Faktur & stok keluar', tone: 'ok' },
  handover: { label: 'Serah terima', tone: 'teal' },
  cancelled: { label: 'Dibatalkan', tone: 'danger' },
};

export function getProject(db, id) {
  return db.projects.find((p) => p.id === id) ?? null;
}

export function requireProject(db, id) {
  const p = getProject(db, id);
  if (!p) throw new DomainError('PROJECT_NOT_FOUND', 'Proyek tidak ditemukan.');
  return p;
}

export function createProject(db, { customerId, name, location, targetDate, notes = '', instructions = '', requirements = [], user }) {
  assert(byId(db.customers, customerId), 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.');
  assert(name && name.trim(), 'NAME_REQUIRED', 'Nama proyek wajib diisi.');
  const project = {
    id: nextId(db, 'project', 'PRJ', 3),
    customerId,
    name: name.trim(),
    location: location ?? '',
    targetDate: targetDate || todayJakarta(),
    status: 'draft',
    notes,
    instructions,
    attachments: [],
    requirements: requirements.map((r) => normalizeRequirement(db, r)),
    invoiceId: null,
    reservedAt: null,
    issuedAt: null,
    handoverAt: null,
    createdAt: isoNow(),
    createdBy: user?.id ?? 'system',
    history: [{ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Proyek dibuat' }],
  };
  db.projects.unshift(project);
  audit(db, user, 'buat_proyek', 'project', project.id, name);
  return project;
}

function normalizeRequirement(db, r) {
  const isPart = r.kind === 'part';
  return {
    id: nextId(db, 'requirement', 'RQ', 5),
    kind: isPart ? 'part' : 'fabric',
    skuId: isPart ? null : r.skuId,
    partId: isPart ? r.partId : null,
    qtyMm: isPart ? null : Math.round(Number(r.qtyMm) || 0),
    qtyPcs: isPart ? Math.round(Number(r.qtyPcs) || 0) : null,
    allocations: (r.allocations ?? []).map((a) => ({
      rollId: a.rollId,
      qtyMm: Math.round(Number(a.qtyMm) || 0),
    })),
    warehouseId: r.warehouseId ?? null,
    note: r.note ?? '',
  };
}

export function addRequirement(db, { projectId, requirement, user }) {
  const p = requireProject(db, projectId);
  assert(['draft', 'reserved'].includes(p.status), 'INVALID_STATUS', 'Kebutuhan tidak dapat diubah setelah stok keluar.');
  const req = normalizeRequirement(db, requirement);
  p.requirements.push(req);
  if (p.status === 'reserved') reserveRequirement(db, p, req, user);
  audit(db, user, 'tambah_kebutuhan', 'project', p.id, req.id);
  return req;
}

/**
 * Allocate fabric FIFO from a warehouse without reserving it yet. Parts inherit
 * the chosen warehouse. The shortage list decides whether reservation is safe.
 */
export function autoAllocateProject(db, { id, warehouseId, user }) {
  const p = requireProject(db, id);
  assert(p.status === 'draft', 'INVALID_STATUS', 'Alokasi otomatis hanya untuk draf proyek.');
  let allocatedM = 0;
  for (const req of p.requirements) {
    if (req.kind === 'part') {
      req.warehouseId = warehouseId;
      continue;
    }
    let need = req.qtyMm - req.allocations.reduce((a, x) => a + x.qtyMm, 0);
    if (need <= 0) continue;
    const rolls = db.rolls
      .filter((r) => r.skuId === req.skuId && r.warehouseId === warehouseId && !r.transit && r.status === 'available')
      .sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)) || a.id.localeCompare(b.id));
    for (const roll of rolls) {
      if (need <= 0) break;
      const take = Math.min(need, availableMm(roll));
      if (take <= 0) continue;
      req.allocations.push({ rollId: roll.id, qtyMm: take });
      need -= take;
      allocatedM += take;
    }
  }
  audit(db, user, 'alokasi_otomatis_proyek', 'project', p.id, `${allocatedM / 1000} m dari ${warehouseId}`);
  return p;
}/* -------------------------------------------------------------------------- */
/* Shortage                                                                   */
/* -------------------------------------------------------------------------- */

export function requirementAllocated(req) {
  return req.kind === 'fabric'
    ? req.allocations.reduce((acc, a) => acc + a.qtyMm, 0)
    : req.qtyPcs;
}

export function projectShortage(db, project) {
  return project.requirements
    .map((req) => {
      if (req.kind === 'part') {
        const available = req.warehouseId
          ? (partStockRow(db, req.partId, req.warehouseId)?.qty ?? 0) - (partStockRow(db, req.partId, req.warehouseId)?.reserved ?? 0)
          : 0;
        return {
          req,
          required: req.qtyPcs,
          allocated: req.qtyPcs,
          short: available < req.qtyPcs ? req.qtyPcs - available : 0,
          available,
        };
      }
      const allocated = req.allocations.reduce((acc, a) => acc + a.qtyMm, 0);
      const short = Math.max(0, req.qtyMm - allocated);
      return { req, required: req.qtyMm, allocated, short, available: allocated };
    })
    .filter((x) => x.short > 0 || x.req.kind === 'fabric' && x.req.allocations.length === 0);
}

export function projectMaterialCost(db, project) {
  let cost = 0;
  for (const req of project.requirements) {
    if (req.kind === 'fabric') {
      for (const a of req.allocations) {
        const roll = db.rolls.find((r) => r.id === a.rollId);
        cost += ((a.qtyMm ?? 0) / MM_PER_M) * (roll?.costPerM ?? 0);
      }
    } else {
      const part = byId(db.parts, req.partId);
      cost += req.qtyPcs * (part?.buyPrice ?? 0);
    }
  }
  return Math.round(cost);
}

/* -------------------------------------------------------------------------- */
/* Reserve                                                                    */
/* -------------------------------------------------------------------------- */

function reserveRequirement(db, project, req, user) {
  if (req.kind === 'part') {
    const row = partStockRow(db, req.partId, req.warehouseId);
    assert(row && row.qty - (row.reserved || 0) >= req.qtyPcs, 'INSUFFICIENT_PART', 'Stok spare part tidak cukup untuk reservasi proyek.');
    row.reserved = (row.reserved || 0) + req.qtyPcs;
    return;
  }
  const perRoll = new Map();
  for (const a of req.allocations) {
    perRoll.set(a.rollId, (perRoll.get(a.rollId) || 0) + a.qtyMm);
  }
  for (const [rollId, qty] of perRoll) {
    reserveRoll(db, { rollId, qtyMm: qty, ref: project.id, user, note: project.name });
  }
}

export function reserveProject(db, { id, user }) {
  const p = requireProject(db, id);
  assert(p.status === 'draft', 'INVALID_STATUS', 'Hanya draf proyek yang dapat direservasi.');
  const shortages = projectShortage(db, p);
  assert(shortages.length === 0, 'SHORTAGE', 'Masih ada kebutuhan yang belum dialokasikan atau kurang.');
  for (const req of p.requirements) reserveRequirement(db, p, req, user);
  p.status = 'reserved';
  p.reservedAt = isoNow();
  p.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Materi direservasi' });
  audit(db, user, 'reservasi_proyek', 'project', p.id, '');
  return p;
}

function releaseProjectPartReservations(db, project) {
  for (const req of project.requirements.filter((r) => r.kind === 'part')) {
    const row = partStockRow(db, req.partId, req.warehouseId);
    if (row) row.reserved = Math.max(0, (row.reserved || 0) - req.qtyPcs);
  }
}

export function cancelProject(db, { id, user, note = '' }) {
  const p = requireProject(db, id);
  assert(['draft', 'reserved'].includes(p.status), 'INVALID_STATUS', 'Proyek yang sudah difakturkan tidak dapat dibatalkan.');
  if (p.status === 'reserved') {
    releaseAllReservations(db, p.id, user, `Batal ${p.name}`);
    releaseProjectPartReservations(db, p);
  }
  p.status = 'cancelled';
  p.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Dibatalkan', note });
  audit(db, user, 'batalkan_proyek', 'project', p.id, note);
  return p;
}

/* -------------------------------------------------------------------------- */
/* Issue (invoice posting is the single stock event)                          */
/* -------------------------------------------------------------------------- */

export function issueProject(db, { id, user, discount = 0, dueDays = 14, notes = '' }) {
  const p = requireProject(db, id);
  assert(p.status === 'reserved' || p.status === 'draft', 'INVALID_STATUS', 'Proyek sudah difakturkan atau dibatalkan.');
  if (p.status === 'draft') reserveProject(db, { id, user });
  const shortages = projectShortage(db, p);
  assert(shortages.length === 0, 'SHORTAGE', 'Kebutuhan proyek belum lengkap; perbaiki alokasi terlebih dahulu.');

  const lines = [];
  for (const req of p.requirements) {
    if (req.kind === 'fabric') {
      const sku = byId(db.skus, req.skuId);
      for (const a of req.allocations) {
        const roll = requireRoll(db, a.rollId);
        lines.push({
          kind: 'fabric',
          rollId: roll.id,
          qtyMm: a.qtyMm,
          mode: 'cut',
          unitPrice: a.unitPrice ?? sku.sellPrice,
          warehouseId: roll.warehouseId,
          note: `Proyek ${p.name}`,
        });
      }
    } else {
      lines.push({
        kind: 'part',
        partId: req.partId,
        qtyPcs: req.qtyPcs,
        unitPrice: req.unitPrice,
        warehouseId: req.warehouseId,
      });
    }
  }
  assert(lines.length > 0, 'EMPTY_LINES', 'Tidak ada material untuk difakturkan.');

  const inv = createInvoice(db, {
    customerId: p.customerId,
    projectId: p.id,
    lines,
    discount,
    dueDays,
    notes: notes || `Material proyek ${p.name}`,
    user,
    reservationRef: p.id,
  });
  postInvoice(db, { id: inv.id, user, reservationRef: p.id });
  releaseAllReservations(db, p.id, user, 'Reservasi dikonsumsi proyek');
  releaseProjectPartReservations(db, p);
  p.status = 'issued';
  p.invoiceId = inv.id;
  p.issuedAt = isoNow();
  p.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: `Faktur ${inv.id} diterbitkan; stok keluar` });
  audit(db, user, 'keluarkan_material_proyek', 'project', p.id, inv.id);
  return { project: p, invoice: inv };
}

export function handoverProject(db, { id, user, note = '' }) {
  const p = requireProject(db, id);
  assert(p.status === 'issued', 'INVALID_STATUS', 'Serah terima hanya setelah stok keluar.');
  p.status = 'handover';
  p.handoverAt = isoNow();
  p.handoverNote = note;
  p.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Serah terima dicatat' });
  audit(db, user, 'serah_terima_proyek', 'project', p.id, note);
  return p;
}

export function projectAvailabilityNotes(db, project) {
  const notes = [];
  for (const req of project.requirements.filter((r) => r.kind === 'fabric')) {
    const sku = byId(db.skus, req.skuId);
    for (const wh of db.warehouses) {
      const alt = db.rolls
        .filter((r) => r.skuId === req.skuId && r.warehouseId === wh.id && !r.transit && r.status === 'available')
        .reduce((acc, r) => acc + availableMm(r), 0);
      if (alt > 0) notes.push({ sku, wh, availableMm: alt });
    }
  }
  return notes;
}

export function projectProgress(project) {
  const steps = ['draft', 'reserved', 'issued', 'handover'];
  return steps.map((s) => ({
    key: s,
    label: PROJECT_STATUS[s].label,
    state: s === project.status ? 'current' : steps.indexOf(s) < steps.indexOf(project.status) ? 'done' : 'todo',
  }));
}

export function projectsWithShortage(db) {
  return db.projects.filter((p) => ['draft', 'reserved'].includes(p.status) && projectShortage(db, p).length > 0);
}
