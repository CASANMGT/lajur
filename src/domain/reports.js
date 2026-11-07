/**
 * Reporting — every figure is derived from the same records the screens use.
 * Nothing in this module stores a pre-computed total.
 *
 * Labels matter: `current` reports describe today's balance; `asOf` reports
 * replay movements up to a date and are labelled separately in the UI.
 */

import { MM_PER_M, daysBetween, todayJakarta, byId } from './core.js';
import { availableMm, isPhysical, isSellable } from './inventory.js';
import { invoiceOutstanding, receivablesAging, invoiceMargin } from './sales.js';
import { payablesAging } from './purchasing.js';
import { projectShortage, projectMaterialCost } from './projects.js';
import { depositBalance, sampleConversionRate } from './crm.js';
import { activeSessions } from './opname.js';

/* -------------------------------------------------------------------------- */
/* Inventory                                                                  */
/* -------------------------------------------------------------------------- */

export function inventoryValue(db, warehouseId = null) {
  const fabric = db.rolls
    .filter((r) => isPhysical(r) && (!warehouseId || r.warehouseId === warehouseId))
    .reduce((acc, r) => acc + Math.round((r.currentMm / MM_PER_M) * r.costPerM), 0);
  const transit = db.rolls
    .filter((r) => r.transit && (!warehouseId || r.transit.toWarehouseId === warehouseId))
    .reduce((acc, r) => acc + Math.round((r.currentMm / MM_PER_M) * r.costPerM), 0);
  const parts = db.partStock
    .filter((p) => !warehouseId || p.warehouseId === warehouseId)
    .reduce((acc, p) => {
      const part = byId(db.parts, p.partId);
      return acc + p.qty * (part?.buyPrice ?? 0);
    }, 0);
  return { fabric, transit, parts, total: fabric + parts, totalWithTransit: fabric + parts + transit };
}

export function fabricMetres(db, warehouseId = null) {
  const rows = db.rolls.filter((r) => isPhysical(r) && (!warehouseId || r.warehouseId === warehouseId));
  return rows.reduce((acc, r) => acc + r.currentMm, 0);
}

export function stockBySku(db, warehouseId = null) {
  const map = new Map();
  for (const sku of db.skus) {
    const rolls = db.rolls.filter((r) => r.skuId === sku.id && (!warehouseId || r.warehouseId === warehouseId));
    const physical = rolls.filter(isPhysical).reduce((a, r) => a + r.currentMm, 0);
    const available = rolls.reduce((a, r) => a + availableMm(r), 0);
    const reserved = rolls.filter((r) => !r.transit).reduce((a, r) => a + (r.reservedMm || 0), 0);
    const quarantine = rolls.filter((r) => r.status === 'quarantine' && !r.transit).reduce((a, r) => a + r.currentMm, 0);
    const transit = rolls.filter((r) => r.transit).reduce((a, r) => a + r.currentMm, 0);
    if (physical || reserved || quarantine || transit) {
      map.set(sku.id, { sku, rolls: rolls.length, physicalMm: physical, availableMm: available, reservedMm: reserved, quarantineMm: quarantine, transitMm: transit });
    }
  }
  return [...map.values()].sort((a, b) => b.physicalMm - a.physicalMm);
}

export function stockByWarehouse(db) {
  return db.warehouses.map((wh) => {
    const rolls = db.rolls.filter((r) => r.warehouseId === wh.id && !r.transit && isPhysical(r));
    const physical = rolls.reduce((a, r) => a + r.currentMm, 0);
    const available = db.rolls
      .filter((r) => r.warehouseId === wh.id && isSellable(r))
      .reduce((a, r) => a + availableMm(r), 0);
    const reserved = rolls.reduce((a, r) => a + (r.reservedMm || 0), 0);
    const quarantine = rolls.filter((r) => r.status === 'quarantine').reduce((a, r) => a + r.currentMm, 0);
    const incoming = db.rolls.filter((r) => r.transit?.toWarehouseId === wh.id).reduce((a, r) => a + r.currentMm, 0);
    const outgoing = db.rolls.filter((r) => r.transit?.fromWarehouseId === wh.id).reduce((a, r) => a + r.currentMm, 0);
    return {
      warehouse: wh,
      rolls: rolls.length,
      physicalMm: physical,
      availableMm: available,
      reservedMm: reserved,
      quarantineMm: quarantine,
      incomingMm: incoming,
      outgoingMm: outgoing,
      value: inventoryValue(db, wh.id).total,
    };
  });
}

export function slowMoving(db, { days = 90, today = todayJakarta() } = {}) {
  const lastSold = new Map();
  for (const inv of db.invoices.filter((i) => i.status === 'posted')) {
    for (const line of inv.lines) {
      const key = line.kind === 'part' ? line.partId : line.skuId;
      if (!lastSold.has(key) || inv.date > lastSold.get(key)) lastSold.set(key, inv.date);
    }
  }
  const fabric = [];
  for (const sku of db.skus) {
    const stockMm = db.rolls.filter((r) => r.skuId === sku.id && isPhysical(r)).reduce((a, r) => a + r.currentMm, 0);
    if (!stockMm) continue;
    const last = lastSold.get(sku.id) ?? null;
    const age = last ? daysBetween(last, today) : null;
    if (!last || age >= days) fabric.push({ kind: 'fabric', sku, stockMm, lastSold: last, daysSince: age });
  }
  const parts = [];
  for (const part of db.parts) {
    const qty = db.partStock.filter((p) => p.partId === part.id).reduce((a, p) => a + p.qty, 0);
    if (!qty) continue;
    const last = lastSold.get(part.id) ?? null;
    const age = last ? daysBetween(last, today) : null;
    if (!last || age >= days) parts.push({ kind: 'part', part, qty, lastSold: last, daysSince: age });
  }
  return { fabric, parts };
}

/* -------------------------------------------------------------------------- */
/* Sales                                                                      */
/* -------------------------------------------------------------------------- */

export function postedInvoices(db, { from = null, to = null } = {}) {
  return db.invoices.filter(
    (i) => i.status === 'posted' && (!from || i.date >= from) && (!to || i.date <= to),
  );
}

export function salesSummary(db, invoices = postedInvoices(db)) {
  let revenue = 0;
  let cost = 0;
  let fabricRevenue = 0;
  let partRevenue = 0;
  let serviceRevenue = 0;
  let metres = 0;
  let pieces = 0;
  for (const inv of invoices) {
    revenue += inv.total;
    for (const line of inv.lines) {
      const qty = line.kind === 'fabric' ? line.qtyMm / MM_PER_M : line.qtyPcs;
      cost += qty * line.unitCost;
      if (line.kind === 'fabric') { fabricRevenue += line.amount; metres += qty; }
      else if (line.kind === 'part') { partRevenue += line.amount; pieces += qty; }
      else serviceRevenue += line.amount;
    }
  }
  const cogs = Math.round(cost);
  return {
    invoices: invoices.length,
    revenue,
    cogs,
    margin: revenue - cogs,
    marginPct: revenue ? ((revenue - cogs) / revenue) * 100 : 0,
    fabricRevenue,
    partRevenue,
    serviceRevenue,
    metres: Math.round(metres),
    pieces,
  };
}

export function monthlySales(db, months = 6, today = todayJakarta()) {
  const base = new Date(`${today}T00:00:00+07:00`);
  const out = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const invoices = postedInvoices(db).filter((inv) => inv.date.slice(0, 7) === key);
    out.push({
      key,
      label: new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'Asia/Jakarta' }).format(d),
      revenue: invoices.reduce((a, inv) => a + inv.total, 0),
      invoices: invoices.length,
    });
  }
  return out;
}

export function productPerformance(db) {
  const rows = [];
  for (const sku of db.skus) {
    let revenue = 0;
    let cost = 0;
    let metres = 0;
    for (const inv of postedInvoices(db)) {
      for (const line of inv.lines.filter((l) => l.skuId === sku.id)) {
        revenue += line.amount;
        metres += line.qtyMm;
        cost += (line.qtyMm / MM_PER_M) * line.unitCost;
      }
    }
    if (metres || revenue) rows.push({ sku, revenue, cost: Math.round(cost), margin: Math.round(revenue - cost), metres: Math.round(metres) });
  }
  return rows.sort((a, b) => b.revenue - a.revenue);
}

/* -------------------------------------------------------------------------- */
/* Exceptions / dashboard                                                     */
/* -------------------------------------------------------------------------- */

export function exceptionFeed(db, today = todayJakarta()) {
  const items = [];
  for (const t of db.transfers.filter((x) => x.status === 'submitted')) {
    items.push({
      tone: 'warn', icon: 'approval', title: 'Permintaan gudang menunggu persetujuan',
      detail: `${t.id} · ${byId(db.warehouses, t.fromWarehouseId)?.code} → ${byId(db.warehouses, t.toWarehouseId)?.code}`,
      href: `#/transfer/${t.id}`, amount: null,
    });
  }
  for (const t of db.transfers.filter((x) => ['approved', 'dispatched'].includes(x.status) && x.neededBy < today)) {
    items.push({
      tone: 'danger', icon: 'clock', title: 'Transfer melewati tanggal butuh',
      detail: `${t.id} · butuh ${t.neededBy}`,
      href: `#/transfer/${t.id}`, amount: null,
    });
  }
  const ar = receivablesAging(db, today);
  for (const item of ar.items.filter((x) => x.daysLate > 0).slice(0, 3)) {
    items.push({
      tone: 'danger', icon: 'receivable', title: `Piutang lewat jatuh tempo ${item.daysLate} hari`,
      detail: `${item.invoice.id} · ${item.invoice.customerName}`,
      href: `#/penjualan/${item.invoice.id}`, amount: item.outstanding,
    });
  }
  const ap = payablesAging(db, today);
  if (ap.items.some((x) => x.daysLate > 0)) {
    const late = ap.items.filter((x) => x.daysLate > 0);
    items.push({
      tone: 'warn', icon: 'payable', title: `${late.length} tagihan pemasok lewat jatuh tempo`,
      detail: late.map((x) => x.bill.id).join(', '),
      href: '#/pembelian', amount: late.reduce((a, b) => a + b.outstanding, 0),
    });
  }
  for (const p of db.projects.filter((x) => ['draft', 'reserved'].includes(x.status))) {
    const short = projectShortage(db, p);
    if (short.length) {
      items.push({
        tone: 'warn', icon: 'shortage', title: `Kebutuhan proyek belum lengkap`,
        detail: `${p.id} · ${p.name}`,
        href: `#/proyek/${p.id}`, amount: null,
      });
    }
  }
  for (const s of activeSessions(db)) {
    items.push({
      tone: 'info', icon: 'opname', title: `Opname aktif di ${byId(db.warehouses, s.warehouseId)?.name}`,
      detail: `${s.id} · ${s.status === 'counting' ? 'penghitungan' : 'menunggu review'} · gudang dibekukan`,
      href: `#/opname/${s.id}`, amount: null,
    });
  }
  for (const po of db.purchaseOrders.filter((x) => ['approved', 'partial'].includes(x.status) && x.expectedDate < today)) {
    items.push({
      tone: 'warn', icon: 'po', title: 'PO pemasok terlambat',
      detail: `${po.id} · ${po.supplierName} · estimasi ${po.expectedDate}`,
      href: `#/pembelian/${po.id}`, amount: null,
    });
  }
  return items;
}

export function dashboardMetrics(db, { warehouseId = null } = {}) {
  const value = inventoryValue(db, warehouseId);
  const whStock = warehouseId
    ? stockByWarehouse(db).find((w) => w.warehouse.id === warehouseId)
    : null;
  const ar = receivablesAging(db);
  const ap = payablesAging(db);
  const thisMonth = todayJakarta().slice(0, 7);
  const monthInvoices = postedInvoices(db).filter((i) => i.date.slice(0, 7) === thisMonth);
  const sales = salesSummary(db, monthInvoices);
  const allSales = salesSummary(db);
  const depositsOpen = db.deposits.reduce((acc, d) => acc + depositBalance(d), 0);
  return {
    inventory: value,
    stock: whStock ?? {
      physicalMm: db.rolls.filter((r) => isPhysical(r)).reduce((a, r) => a + r.currentMm, 0),
      availableMm: db.rolls.reduce((a, r) => a + availableMm(r), 0),
      reservedMm: db.rolls.filter((r) => !r.transit).reduce((a, r) => a + (r.reservedMm || 0), 0),
      incomingMm: db.rolls.filter((r) => r.transit).reduce((a, r) => a + r.currentMm, 0),
    },
    receivables: ar.total,
    overdueReceivables: ar.items.filter((i) => i.daysLate > 0).reduce((a, b) => a + b.outstanding, 0),
    payables: ap.total,
    monthSales: sales.revenue,
    monthMargin: sales.margin,
    allSales,
    depositsOpen,
    exceptions: exceptionFeed(db),
  };
}

export function projectReport(db) {
  return db.projects.map((p) => {
    const short = projectShortage(db, p);
    return {
      project: p,
      customer: byId(db.customers, p.customerId),
      materialCost: projectMaterialCost(db, p),
      shortages: short,
      complete: short.length === 0,
      targetDate: p.targetDate,
      overdue: p.targetDate < todayJakarta() && !['handover', 'cancelled'].includes(p.status),
    };
  });
}

export function sampleReport(db) {
  const stats = sampleConversionRate(db);
  const rows = db.samples.map((s) => {
    const customer = byId(db.customers, s.customerId);
    const sku = byId(db.skus, s.skuId);
    const invoice = s.linkedInvoiceId ? db.invoices.find((i) => i.id === s.linkedInvoiceId) : null;
    return { sample: s, customer, sku, invoice };
  });
  return { ...stats, rows };
}

export function returnsReport(db) {
  const posted = db.returns.filter((r) => r.status === 'posted');
  return {
    count: posted.length,
    credit: posted.reduce((a, r) => a + (r.credit ?? 0), 0),
    rows: posted,
  };
}

export function depositReport(db) {
  return db.deposits.map((d) => ({
    deposit: d,
    customer: byId(db.customers, d.customerId),
    balance: depositBalance(d),
  }));
}

export function movementHistory(db, { skuId = null, rollId = null, warehouseId = null, limit = 100 } = {}) {
  return db.movements
    .filter((m) => (!skuId || m.skuId === skuId) && (!rollId || m.rollId === rollId || m.parentRollId === rollId))
    .filter((m) => (!warehouseId || m.warehouseId === warehouseId || m.warehouseToId === warehouseId))
    .slice(0, limit);
}

export function invoiceProfit(invoice) {
  return invoiceMargin(invoice);
}

export function salesByWarehouseNote() {
  return 'Laporan keuangan bersifat perusahaan. Laba per gudang memerlukan kebijakan atribusi eksplisit; transfer internal tidak menghasilkan laba.';
}
