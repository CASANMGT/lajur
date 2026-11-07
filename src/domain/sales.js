/**
 * Sales: invoices, stock issue, payments, customer returns.
 *
 * Posting the invoice is the single authoritative stock-issue event. Nothing
 * else (handover, delivery note, project close) deducts inventory again.
 *
 * Lines snapshot description, quantity, unit price and unit cost so later
 * master-data edits never rewrite posted history. Fabric and parts can share
 * one invoice while metres and pieces remain separate quantities.
 */

import {
  DomainError, MM_PER_M, assert, audit, byId, daysBetween, isoNow, money, nextId, todayJakarta,
} from './core.js';
import {
  assertWarehouseOpen, availableMm, consumeReservation, createRoll, issueParts, partStockRow,
  recordMovement, requireRoll, sellWholeRoll,
} from './inventory.js';

export function reservedFor(roll, ref) {
  if (!ref) return 0;
  return (roll.reservations || []).filter((r) => r.ref === ref).reduce((acc, r) => acc + r.qtyMm, 0);
}

export const INVOICE_STATUS = {
  draft: { label: 'Draf', tone: 'muted' },
  posted: { label: 'Terbit', tone: 'ok' },
  void: { label: 'Dibatalkan', tone: 'danger' },
};

export function getInvoice(db, id) {
  return db.invoices.find((i) => i.id === id) ?? null;
}

export function requireInvoice(db, id) {
  const inv = getInvoice(db, id);
  if (!inv) throw new DomainError('INVOICE_NOT_FOUND', 'Faktur tidak ditemukan.');
  return inv;
}

export function invoicePaid(invoice) {
  return invoice.payments?.reduce((acc, p) => acc + p.amount, 0) ?? 0;
}

export function invoiceOutstanding(invoice) {
  const credited = invoice.credited ?? 0;
  return Math.max(0, invoice.total - (invoice.depositApplied ?? 0) - invoicePaid(invoice) - credited);
}

export function invoiceStatusLabel(invoice) {
  if (invoice.status !== 'posted') return INVOICE_STATUS[invoice.status].label;
  if (invoiceOutstanding(invoice) <= 0) return 'Lunas';
  if (invoicePaid(invoice) > 0 || invoice.depositApplied) return 'Dibayar sebagian';
  return 'Belum dibayar';
}

/* -------------------------------------------------------------------------- */
/* Draft                                                                      */
/* -------------------------------------------------------------------------- */

function buildFabricLine(db, input) {
  const roll = requireRoll(db, input.rollId);
  const sku = byId(db.skus, roll.skuId);
  assert(sku, 'SKU_NOT_FOUND', 'SKU kain tidak ditemukan.');
  assert(sku.active !== false && !sku.dormant, 'DORMANT_PRODUCT',
    `${sku.code} dormant/tidak aktif. Penjualan baru diblokir; aktifkan produk terlebih dahulu.`);
  const whole = input.mode === 'whole';
  let qtyMm;
  if (whole) {
    assert((roll.reservedMm || 0) === 0, 'ROLL_RESERVED', `Roll ${roll.id} memiliki reservasi aktif dan tidak dapat dijual utuh.`);
    qtyMm = roll.currentMm;
  } else {
    qtyMm = Math.round(Number(input.qtyMm));
    assert(qtyMm > 0, 'INVALID_LENGTH', 'Panjang potong harus lebih dari 0 m.');
    assert(qtyMm <= availableMm(roll), 'INSUFFICIENT_AVAILABLE',
      `Tersedia hanya ${availableMm(roll) / MM_PER_M} m pada ${roll.id}.`);
  }
  const unitPrice = input.unitPrice != null ? money(input.unitPrice) : sku.sellPrice;
  return {
    id: nextId(db, 'invoiceLine', 'IL', 5),
    kind: 'fabric',
    skuId: roll.skuId,
    rollId: roll.id,
    lot: roll.lot,
    mode: whole ? 'whole' : 'cut',
    description: `${sku.collectionName ?? sku.code} — ${sku.colourName || sku.colourCode} (${sku.code})`,
    unit: 'm',
    qtyMm,
    qtyPcs: null,
    unitPrice,
    unitCost: roll.costPerM,
    amount: money((qtyMm / MM_PER_M) * unitPrice),
    warehouseId: roll.warehouseId,
    note: input.note ?? '',
  };
}

function buildPartLine(db, input) {
  const part = byId(db.parts, input.partId);
  assert(part, 'PART_NOT_FOUND', 'Spare part tidak ditemukan.');
  const raw = Number(input.qtyPcs);
  assert(Number.isInteger(raw) && raw > 0, 'INVALID_QTY', 'Jumlah spare part harus bilangan bulat lebih dari 0.');
  const qtyPcs = raw;
  const unitPrice = input.unitPrice != null ? money(input.unitPrice) : part.sellPrice;
  return {
    id: nextId(db, 'invoiceLine', 'IL', 5),
    kind: 'part',
    partId: part.id,
    description: part.name,
    unit: 'pcs',
    qtyMm: null,
    qtyPcs,
    unitPrice,
    unitCost: part.buyPrice,
    amount: money(qtyPcs * unitPrice),
    warehouseId: input.warehouseId,
    note: input.note ?? '',
  };
}

/** A service line (e.g. a paid sample) carries revenue but no stock movement. */
function buildServiceLine(db, input) {
  const unitPrice = money(input.unitPrice);
  assert(unitPrice > 0, 'INVALID_AMOUNT', 'Harga layanan harus lebih dari 0.');
  return {
    id: nextId(db, 'invoiceLine', 'IL', 5),
    kind: 'service',
    description: input.description || 'Layanan',
    unit: 'jasa',
    qtyMm: null,
    qtyPcs: 1,
    unitPrice,
    unitCost: 0,
    amount: unitPrice,
    warehouseId: null,
    note: input.note ?? '',
  };
}

export function createInvoice(db, { customerId, projectId = null, lines, discount = 0, date = todayJakarta(), dueDays = 14, notes = '', user, salespersonId = null }) {
  const customer = byId(db.customers, customerId);
  assert(customer, 'CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.');
  assert(Array.isArray(lines) && lines.length > 0, 'EMPTY_LINES', 'Faktur harus memiliki minimal satu baris.');
  const built = lines.map((l) => {
    if (l.kind === 'part') return buildPartLine(db, l);
    if (l.kind === 'service') return buildServiceLine(db, l);
    return buildFabricLine(db, l);
  });
  const subtotal = built.reduce((acc, l) => acc + l.amount, 0);
  const disc = Math.min(money(discount), subtotal);
  const invoice = {
    id: nextId(db, 'invoice', 'INV', 4),
    customerId,
    projectId,
    customerName: customer.name,
    date,
    dueDate: addBusinessDays(date, dueDays),
    status: 'draft',
    lines: built,
    subtotal,
    discount: disc,
    total: subtotal - disc,
    depositApplied: 0,
    credited: 0,
    payments: [],
    notes,
    salespersonId: salespersonId ?? customer.salespersonId ?? null,
    createdAt: isoNow(),
    createdBy: user?.id ?? 'system',
    postedAt: null,
    postedBy: null,
  };
  db.invoices.unshift(invoice);
  audit(db, user, 'buat_faktur_draf', 'invoice', invoice.id, `total ${invoice.total}`);
  return invoice;
}

export function addBusinessDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Posting                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Post the invoice: validates every line, issues stock exactly once, snapshots
 * costs, and freezes the document. Partial issue is not allowed.
 */
export function postInvoice(db, { id, user, warehouseId = null, reservationRef = null }) {
  const inv = requireInvoice(db, id);
  assert(inv.status === 'draft', 'INVALID_STATUS', 'Hanya draf faktur yang dapat diterbitkan.');
  assert(inv.lines.length > 0, 'EMPTY_LINES', 'Faktur tanpa baris.');
  assert(new Set(inv.lines.map((l) => l.id)).size === inv.lines.length, 'DUPLICATE_LINE', 'Baris faktur duplikat.');

  // Validate before mutating anything.
  for (const line of inv.lines) {
    if (line.kind === 'service') continue;
    if (line.kind === 'fabric') {
      const roll = requireRoll(db, line.rollId);
      assert(roll.warehouseId === line.warehouseId, 'ROLL_MOVED', `Roll ${roll.id} sudah berpindah gudang.`);
      assertWarehouseOpen(db, roll.warehouseId, 'Penjualan');
      const sku = byId(db.skus, roll.skuId);
      assert(sku && sku.active !== false && !sku.dormant, 'DORMANT_PRODUCT',
        `${sku?.code ?? roll.skuId} dormant/tidak aktif; penjualan baru diblokir.`);
      if (line.mode === 'whole') {
        assert((roll.reservedMm || 0) === 0, 'ROLL_RESERVED', `Roll ${roll.id} terpesan untuk dokumen lain.`);
        assert(roll.status === 'available', 'ROLL_NOT_AVAILABLE', `Roll ${roll.id} tidak tersedia.`);
      } else {
        const held = reservedFor(roll, reservationRef);
        assert(line.qtyMm <= availableMm(roll) + held, 'INSUFFICIENT_AVAILABLE',
          `Roll ${roll.id}: tersedia ${availableMm(roll) / MM_PER_M} m, diminta ${line.qtyMm / MM_PER_M} m.`);
        if (reservationRef) {
          assert(held >= line.qtyMm, 'RESERVATION_SHORT',
            `Reservasi proyek pada ${roll.id} tidak mencukupi (${held / MM_PER_M} m).`);
        }
      }
    } else {
      const wh = line.warehouseId ?? warehouseId;
      assertWarehouseOpen(db, wh, 'Penjualan');
      const row = partStockRow(db, line.partId, wh);
      assert(row && row.qty - (row.reserved || 0) >= line.qtyPcs, 'INSUFFICIENT_PART',
        `Stok ${line.description} tidak cukup di gudang ini.`);
    }
  }

  // Issue.
  for (const line of inv.lines) {
    if (line.kind === 'service') continue;
    if (line.kind === 'fabric') {
      const roll = requireRoll(db, line.rollId);
      if (line.mode === 'whole') {
        sellWholeRoll(db, { rollId: roll.id, user, ref: inv.id, invoiceId: inv.id, note: line.description });
      } else {
        const before = roll.currentMm;
        const held = reservedFor(roll, reservationRef);
        if (reservationRef && held) consumeReservation(roll, reservationRef, line.qtyMm);
        assert(line.qtyMm <= before - (roll.reservedMm || 0), 'INSUFFICIENT_AVAILABLE', 'Potongan menabrak reservasi.');
        roll.currentMm = before - line.qtyMm;
        const piece = createRoll(db, {
          skuId: roll.skuId,
          lot: roll.lot,
          receivedAt: roll.receivedAt,
          receiptRef: roll.receiptRef,
          originalMm: line.qtyMm,
          currentMm: line.qtyMm,
          warehouseId: roll.warehouseId,
          bin: roll.bin,
          status: 'sold',
          condition: roll.condition,
          costPerM: roll.costPerM,
          parentRollId: roll.id,
          rootRollId: roll.rootRollId || roll.id,
          user,
        });
        recordMovement(db, {
          type: 'sale',
          ref: inv.id,
          warehouseId: roll.warehouseId,
          skuId: roll.skuId,
          rollId: piece.id,
          parentRollId: roll.id,
          qtyMm: line.qtyMm,
          beforeMm: before,
          afterMm: roll.currentMm,
          unitCost: roll.costPerM,
          value: line.unitCost * (line.qtyMm / MM_PER_M),
          user,
          note: `${inv.id} · ${line.description}`,
        });
      }
    } else {
      issueParts(db, {
        partId: line.partId,
        warehouseId: line.warehouseId,
        qty: line.qtyPcs,
        user,
        ref: inv.id,
        note: `${inv.id} · ${line.description}`,
      });
    }
  }

  inv.status = 'posted';
  inv.postedAt = isoNow();
  inv.postedBy = user?.name ?? 'Sistem';
  inv.paidAmount = 0;
  inv.payments = [];
  audit(db, user, 'terbitkan_faktur', 'invoice', inv.id, `total ${inv.total}`);
  return inv;
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export function recordPayment(db, { invoiceId, amount, method = 'transfer', reference = '', date = todayJakarta(), user, note = '' }) {
  const inv = requireInvoice(db, invoiceId);
  assert(inv.status === 'posted', 'INVALID_STATUS', 'Pembayaran hanya untuk faktur terbit.');
  const value = money(amount);
  assert(value > 0, 'INVALID_AMOUNT', 'Nominal pembayaran harus lebih dari 0.');
  const outstanding = invoiceOutstanding(inv);
  assert(value <= outstanding, 'OVERPAYMENT', `Pembayaran melebihi sisa tagihan (${outstanding}).`);

  const payment = {
    id: nextId(db, 'payment', 'PAY', 4),
    invoiceId,
    customerId: inv.customerId,
    date,
    amount: value,
    method,
    reference,
    note,
    at: isoNow(),
    by: user?.name ?? 'Sistem',
  };
  inv.payments.push(payment);
  db.payments.unshift(payment);
  audit(db, user, 'terima_pembayaran', 'invoice', inv.id, `${value} via ${method}`);
  return payment;
}

export function invoiceMargin(invoice) {
  const cost = invoice.lines.reduce((acc, l) => {
    const qty = l.kind === 'fabric' ? l.qtyMm / MM_PER_M : l.qtyPcs;
    return acc + qty * l.unitCost;
  }, 0);
  return { revenue: invoice.total, cost: Math.round(cost), margin: invoice.total - Math.round(cost) };
}

/* -------------------------------------------------------------------------- */
/* Customer returns                                                           */
/* -------------------------------------------------------------------------- */

export function returnedQty(db, invoiceId, lineId) {
  return db.returns
    .filter((r) => r.type === 'customer' && r.invoiceId === invoiceId && r.status === 'posted')
    .flatMap((r) => r.lines)
    .filter((l) => l.lineId === lineId)
    .reduce((acc, l) => acc + (l.qtyMm ?? l.qtyPcs ?? 0), 0);
}

export function createCustomerReturn(db, { invoiceId, lines, reason, user, date = todayJakarta(), inspect = true }) {
  const inv = requireInvoice(db, invoiceId);
  assert(inv.status === 'posted', 'INVALID_STATUS', 'Retur hanya terhadap faktur terbit.');
  assert(Array.isArray(lines) && lines.length > 0, 'EMPTY_LINES', 'Pilih minimal satu baris retur.');
  assert(reason && reason.trim().length >= 3, 'REASON_REQUIRED', 'Alasan retur wajib diisi.');

  const built = lines.map((input) => {
    const line = inv.lines.find((l) => l.id === input.lineId);
    assert(line, 'LINE_NOT_FOUND', 'Baris faktur tidak ditemukan.');
    const already = returnedQty(db, invoiceId, line.id);
    const sold = line.kind === 'fabric' ? line.qtyMm : line.qtyPcs;
    const qty = line.kind === 'fabric' ? Math.round(Number(input.qtyMm)) : Math.round(Number(input.qtyPcs));
    assert(qty > 0, 'INVALID_QTY', 'Jumlah retur harus lebih dari 0.');
    assert(already + qty <= sold, 'EXCESS_RETURN', `Retur melebihi jumlah terjual pada ${line.description}.`);
    return {
      lineId: line.id,
      kind: line.kind,
      skuId: line.skuId ?? null,
      partId: line.partId ?? null,
      rollId: line.rollId ?? null,
      description: line.description,
      unit: line.unit,
      qtyMm: line.kind === 'fabric' ? qty : null,
      qtyPcs: line.kind === 'part' ? qty : null,
      unitPrice: line.unitPrice,
      condition: input.condition ?? 'good',
      credit: money(line.kind === 'fabric' ? (qty / MM_PER_M) * line.unitPrice : qty * line.unitPrice),
    };
  });

  const ret = {
    id: nextId(db, 'return', 'RET', 4),
    type: 'customer',
    invoiceId,
    customerId: inv.customerId,
    date,
    reason: reason.trim(),
    status: inspect ? 'inspected' : 'draft',
    lines: built,
    credit: built.reduce((acc, l) => acc + l.credit, 0),
    warehouseId: inv.lines[0]?.warehouseId ?? null,
    createdAt: isoNow(),
    postedAt: null,
    postedBy: null,
  };
  db.returns.unshift(ret);
  audit(db, user, 'buat_retur_pelanggan', 'return', ret.id, `${ret.credit}`);
  return ret;
}

export function postCustomerReturn(db, { id, user, disposition = 'quarantine' }) {
  const ret = db.returns.find((r) => r.id === id);
  assert(ret, 'RETURN_NOT_FOUND', 'Retur tidak ditemukan.');
  assert(ret.type === 'customer', 'INVALID_TYPE', 'Bukan retur pelanggan.');
  assert(['draft', 'inspected'].includes(ret.status), 'INVALID_STATUS', 'Retur sudah diposting.');
  const inv = requireInvoice(db, ret.invoiceId);

  for (const line of ret.lines) {
    if (line.kind === 'fabric') {
      const source = db.rolls.find((r) => r.id === line.rollId);
      const skuId = line.skuId ?? source?.skuId;
      assert(skuId, 'SKU_NOT_FOUND', 'SKU retur tidak ditemukan.');
      const wh = ret.warehouseId ?? db.warehouses[0].id;
      assertWarehouseOpen(db, wh, 'Retur');
      const roll = createRoll(db, {
        skuId,
        lot: source?.lot ?? 'RETUR',
        receivedAt: ret.date,
        receiptRef: ret.id,
        originalMm: line.qtyMm,
        currentMm: line.qtyMm,
        warehouseId: wh,
        bin: 'RET-01',
        status: disposition === 'good' ? 'available' : 'quarantine',
        condition: line.condition === 'damaged' ? 'damaged' : 'good',
        costPerM: source?.costPerM ?? 0,
        user,
        notes: `Retur ${ret.id}`,
      });
      recordMovement(db, {
        type: 'return_in',
        ref: ret.id,
        warehouseId: wh,
        skuId,
        rollId: roll.id,
        qtyMm: line.qtyMm,
        beforeMm: 0,
        afterMm: line.qtyMm,
        unitCost: roll.costPerM,
        user,
        note: `Retur pelanggan (${disposition})`,
      });
    } else if (disposition === 'good') {
      const row = partStockRow(db, line.partId, ret.warehouseId);
      if (row) row.qty += line.qtyPcs;
      else db.partStock.push({ partId: line.partId, warehouseId: ret.warehouseId, qty: line.qtyPcs, reserved: 0 });
      recordMovement(db, {
        type: 'return_in',
        ref: ret.id,
        warehouseId: ret.warehouseId,
        partId: line.partId,
        qtyPcs: line.qtyPcs,
        user,
        note: 'Retur spare part',
      });
    }
  }

  ret.status = 'posted';
  ret.postedAt = isoNow();
  ret.postedBy = user?.name ?? 'Sistem';
  inv.credited = (inv.credited ?? 0) + ret.credit;
  audit(db, user, 'posting_retur_pelanggan', 'return', ret.id, `kredit ${ret.credit}`);
  return ret;
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export function receivablesAging(db, today = todayJakarta()) {
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0 };
  const items = [];
  for (const inv of db.invoices.filter((i) => i.status === 'posted')) {
    const outstanding = invoiceOutstanding(inv);
    if (outstanding <= 0) continue;
    const age = Math.max(0, daysBetween(inv.dueDate, today));
    const bucket = age === 0 ? 'current' : age <= 30 ? 'd1_30' : age <= 60 ? 'd31_60' : age <= 90 ? 'd61_90' : 'over90';
    buckets[bucket] += outstanding;
    items.push({ invoice: inv, outstanding, daysLate: age, bucket });
  }
  return { buckets, items, total: items.reduce((a, b) => a + b.outstanding, 0) };
}

export function salesBetween(db, from, to) {
  return db.invoices.filter((i) => i.status === 'posted' && i.date >= from && i.date <= to);
}
