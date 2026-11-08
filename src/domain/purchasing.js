/**
 * External purchasing: suppliers, purchase orders, receiving, payables.
 *
 * Kept strictly separate from internal warehouse requests. Receiving rejects
 * duplicate document references and any over-receipt against the PO line.
 *
 * Demo simplification: goods receipt and supplier bill are created together.
 * Production must model GR and supplier invoice separately and reconcile them
 * before posting payables (documented in PRD §7).
 */

import {
  DomainError, MM_PER_M, assert, audit, byId, daysBetween, isoNow, money, nextId, todayJakarta,
} from './core.js';
import {
  assertWarehouseOpen, createRoll, receiveParts, recordMovement, requireRoll,
} from './inventory.js';
import { landedAddPerUnit } from './shipments.js';
import { latestFxRate, latestSupplierPrice, recordFxRate } from './pricing.js';

export const PO_STATUS = {
  draft: { label: 'Draf', tone: 'muted' },
  approved: { label: 'Disetujui', tone: 'info' },
  partial: { label: 'Diterima sebagian', tone: 'copper' },
  received: { label: 'Diterima lengkap', tone: 'ok' },
  cancelled: { label: 'Dibatalkan', tone: 'danger' },
};

export function getPO(db, id) {
  return db.purchaseOrders.find((p) => p.id === id) ?? null;
}

export function requirePO(db, id) {
  const po = getPO(db, id);
  if (!po) throw new DomainError('PO_NOT_FOUND', 'Purchase order tidak ditemukan.');
  return po;
}

export function poLineOpen(line) {
  return line.kind === 'fabric'
    ? Math.max(0, line.qtyMm - line.receivedMm)
    : Math.max(0, line.qtyPcs - line.receivedPcs);
}

export function createPO(db, { supplierId, date = todayJakarta(), expectedDate, lines, note = '', termsDays = 30, currency: currencyInput = null, fxRate: fxInput = null, fxSource: fxSourceInput = null, fxAsOf: fxAsOfInput = null, recordRate = true, user }) {
  const supplier = byId(db.suppliers, supplierId);
  assert(supplier, 'SUPPLIER_NOT_FOUND', 'Pemasok tidak ditemukan.');
  const currency = currencyInput ?? supplier.currency ?? 'IDR';
  const fxRate = currency === 'IDR' ? 1 : Number(fxInput ?? 0);
  assert(fxRate > 0, 'INVALID_FX', 'Kurs ke IDR wajib diisi untuk pembelian mata uang asing. Kurs tidak diisi otomatis.');
  assert(Array.isArray(lines) && lines.length > 0, 'EMPTY_LINES', 'PO harus memiliki minimal satu baris.');

  const supplierPrice = (skuId, partId) => latestSupplierPrice(db, {
    supplierId, skuId, partId, date,
  });
  const priceInCurrency = (record, fallbackIdr) => {
    if (!record) return currency === 'IDR' ? fallbackIdr : fallbackIdr / fxRate;
    const recCurrency = record.currency ?? supplier.currency ?? 'IDR';
    const recRate = recCurrency === 'IDR' ? 1 : (latestFxRate(db, recCurrency, date)?.rate ?? supplier.fxRate ?? fxRate);
    const idr = Number(record.price) * recRate;
    return currency === 'IDR' ? idr : idr / fxRate;
  };

  const built = lines.map((l) => {
    if (l.kind === 'part') {
      const part = byId(db.parts, l.partId);
      assert(part, 'PART_NOT_FOUND', 'Spare part tidak ditemukan.');
      const qty = Math.round(Number(l.qtyPcs));
      assert(qty > 0, 'INVALID_QTY', 'Jumlah harus lebih dari 0.');
      const rawPrice = l.unitPrice ?? priceInCurrency(supplierPrice(null, part.id), part.buyPrice);
      const unitPrice = Math.round(Number(rawPrice) * 100) / 100;
      return {
        id: nextId(db, 'poLine', 'PL', 5), kind: 'part', partId: part.id, skuId: null,
        description: part.name, qtyPcs: qty, qtyMm: null, receivedPcs: 0, receivedMm: 0,
        unitPrice, unitCostIdr: money(unitPrice * fxRate), unit: 'pcs', currency,
      };
    }
    const sku = byId(db.skus, l.skuId);
    assert(sku, 'SKU_NOT_FOUND', 'SKU kain tidak ditemukan.');
    const qtyMm = Math.round(Number(l.qtyMm));
    assert(qtyMm > 0, 'INVALID_LENGTH', 'Jumlah kain harus lebih dari 0 m.');
    const rawPrice = l.unitPrice ?? priceInCurrency(supplierPrice(sku.id, null), sku.buyPrice);
    const unitPrice = Math.round(Number(rawPrice) * 100) / 100;
    return {
      id: nextId(db, 'poLine', 'PL', 5), kind: 'fabric', skuId: sku.id, partId: null,
      description: `${sku.collectionName ?? sku.code} — ${sku.colourName || sku.colourCode} (${sku.code})`,
      qtyMm, qtyPcs: null, receivedMm: 0, receivedPcs: 0,
      unitPrice, unitCostIdr: money(unitPrice * fxRate), unit: 'm', currency,
    };
  });
  const totalForeign = built.reduce((acc, l) => acc + (l.qtyMm ? l.qtyMm / MM_PER_M : l.qtyPcs) * l.unitPrice, 0);
  const fxAsOf = currency === 'IDR' ? date : (fxAsOfInput ?? isoNow());
  const fxSource = currency === 'IDR' ? 'Rupiah' : (fxSourceInput ?? 'Kurs manual PO');
  const po = {
    id: nextId(db, 'po', 'PO', 4),
    supplierId,
    supplierName: supplier.name,
    currency,
    fxRate,
    fxAsOf,
    fxSource,
    date,
    expectedDate: expectedDate || date,
    termsDays,
    status: 'draft',
    lines: built,
    note,
    createdAt: isoNow(),
    createdBy: user?.id ?? 'system',
    approvedBy: null,
    approvedAt: null,
    receipts: [],
    totalForeign: Math.round(totalForeign * 100) / 100,
    total: money(totalForeign * fxRate),
  };
  db.purchaseOrders.unshift(po);
  if (currency !== 'IDR' && recordRate) {
    recordFxRate(db, { currency, rate: fxRate, source: fxSource, asOf: fxAsOf, poId: po.id, user });
  }
  audit(db, user, 'buat_po', 'po', po.id, `${supplier.name} · ${currency}`);
  return po;
}

export function saveSupplier(db, {
  id = null, code, name, contact = '', phone = '', email = '', address = '',
  country = 'ID', origin = 'local', currency = 'IDR', fxRate = 1,
  incoterm = '', port = '', termsDays = 30, leadTimeDays = 7, notes = '', user,
}) {
  const cleanCode = String(code ?? '').trim().toUpperCase();
  const cleanName = String(name ?? '').trim();
  assert(cleanCode.length >= 2, 'INVALID_CODE', 'Kode pemasok minimal 2 karakter.');
  assert(cleanName.length >= 2, 'INVALID_NAME', 'Nama pemasok minimal 2 karakter.');
  assert(['local', 'import'].includes(origin), 'INVALID_ORIGIN', 'Asal pemasok tidak dikenal.');
  assert(['IDR', 'CNY', 'USD'].includes(currency), 'INVALID_CURRENCY', 'Mata uang tidak dikenal.');
  const rate = currency === 'IDR' ? 1 : Number(fxRate);
  assert(rate > 0, 'INVALID_FX', 'Kurs harus lebih dari 0.');
  assert(!db.suppliers.some((s) => s.id !== id && s.code.toUpperCase() === cleanCode), 'DUPLICATE_CODE', `Kode ${cleanCode} sudah dipakai.`);

  const patch = {
    code: cleanCode, name: cleanName, contact, phone, email, address,
    country: origin === 'import' ? country || 'CN' : 'ID',
    origin, currency, fxRate: rate, incoterm, port,
    termsDays: Number(termsDays) || 0,
    leadTimeDays: Number(leadTimeDays) || 0,
    notes,
    updatedAt: isoNow(),
  };
  if (id) {
    const supplier = byId(db.suppliers, id);
    assert(supplier, 'SUPPLIER_NOT_FOUND', 'Pemasok tidak ditemukan.');
    Object.assign(supplier, patch);
    audit(db, user, 'ubah_pemasok', 'supplier', id, `${cleanCode} · ${currency}`);
    return supplier;
  }
  const supplier = { id: `SUP-${String(db.suppliers.length + 1).padStart(3, '0')}`, ...patch, createdAt: isoNow() };
  db.suppliers.push(supplier);
  audit(db, user, 'buat_pemasok', 'supplier', supplier.id, `${cleanCode} · ${currency}`);
  return supplier;
}

export function approvePO(db, { id, user }) {
  const po = requirePO(db, id);
  assert(user?.role === 'manager', 'FORBIDDEN', 'Hanya manajer yang dapat menyetujui PO.');
  assert(po.status === 'draft', 'INVALID_STATUS', 'PO sudah diproses.');
  po.status = 'approved';
  po.approvedBy = user.name;
  po.approvedAt = isoNow();
  audit(db, user, 'setujui_po', 'po', po.id, '');
  return po;
}

/* -------------------------------------------------------------------------- */
/* Receiving                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * @param lines [{ poLineId, lots: [{ lot, lengthsMm: [] }], qtyPcs }]
 */
export function receivePO(db, { poId, ref, date = todayJakarta(), warehouseId, lines, user, createBill = true, note = '' }) {
  const po = requirePO(db, poId);
  assert(['approved', 'partial'].includes(po.status), 'INVALID_STATUS', 'PO belum disetujui atau sudah selesai.');
  assert(ref && ref.trim(), 'REF_REQUIRED', 'Nomor dokumen penerimaan wajib diisi.');
  assertWarehouseOpen(db, warehouseId, 'Penerimaan pemasok');
  const duplicate = db.goodsReceipts.find((r) => r.ref.toLowerCase() === ref.trim().toLowerCase());
  assert(!duplicate, 'DUPLICATE_RECEIPT', `Nomor penerimaan ${ref} sudah pernah dipakai (${duplicate?.id ?? ''}).`);

  const receiptLines = [];
  let total = 0;
  let totalForeign = 0;
  const fxRate = po.fxRate ?? 1;
  const landed = landedAddPerUnit(db, po.id);
  const costOf = (line) => {
    const base = line.unitCostIdr ?? money(line.unitPrice * fxRate);
    const add = landed?.totals.get(line.id) ?? 0;
    return { base, add, cost: Math.round(base + add) };
  };

  for (const input of lines) {
    const line = po.lines.find((l) => l.id === input.poLineId);
    assert(line, 'LINE_NOT_FOUND', 'Baris PO tidak ditemukan.');
    if (line.kind === 'fabric') {
      const costs = costOf(line);
      const lengths = (input.lots ?? []).flatMap((lot) => (lot.lengthsMm ?? []).map((len) => ({ lot: lot.lot, len: Math.round(len) })));
      const receivedMm = lengths.reduce((acc, l) => acc + l.len, 0);
      assert(receivedMm > 0, 'EMPTY_RECEIPT', 'Tidak ada panjang roll yang dicatat.');
      assert(receivedMm <= poLineOpen(line), 'OVER_RECEIPT',
        `${line.description}: menerima ${receivedMm / MM_PER_M} m dari sisa ${poLineOpen(line) / MM_PER_M} m.`);
      const byLot = new Map();
      for (const item of lengths) {
        if (!byLot.has(item.lot)) byLot.set(item.lot, []);
        byLot.get(item.lot).push(item.len);
      }
      const rollIds = [];
      for (const [lot, lens] of byLot) {
        const rolls = lens.map((len, idx) => {
          const roll = createRoll(db, {
            skuId: line.skuId,
            lot,
            receivedAt: date,
            receiptRef: ref.trim(),
            originalMm: len,
            currentMm: len,
            warehouseId,
            bin: `${byId(db.warehouses, warehouseId)?.binPrefix ?? 'A'}-${String(db.rolls.length + 1).padStart(2, '0')}`,
            costPerM: costs.cost,
            user,
            notes: `PO ${po.id}${landed ? ` · landed ${landed.shipmentId}` : ''}`,
          });
          recordMovement(db, {
            type: 'receive_po', ref: ref.trim(), warehouseId, skuId: line.skuId, rollId: roll.id,
            qtyMm: len, beforeMm: 0, afterMm: len, unitCost: costs.cost,
            value: Math.round((len / MM_PER_M) * costs.cost), user, note: `Penerimaan ${po.id} lot ${lot}`,
          });
          return roll;
        });
        rollIds.push(...rolls.map((r) => r.id));
      }
      line.receivedMm += receivedMm;
      total += Math.round((receivedMm / MM_PER_M) * costs.cost);
      totalForeign += (receivedMm / MM_PER_M) * line.unitPrice;
      receiptLines.push({
        poLineId: line.id,
        kind: 'fabric',
        skuId: line.skuId,
        description: line.description,
        lot: [...byLot.keys()].join(', '),
        lengthsMm: lengths.map((l) => l.len),
        rollIds,
        qtyMm: receivedMm,
        unitCost: costs.cost,
        unitPriceForeign: line.unitPrice,
        landedPerUnit: Math.round(costs.add),
        currency: po.currency ?? 'IDR',
      });
    } else {
      const costs = costOf(line);
      const qty = Math.round(Number(input.qtyPcs));
      assert(qty > 0, 'EMPTY_RECEIPT', 'Jumlah spare part harus lebih dari 0.');
      assert(qty <= poLineOpen(line), 'OVER_RECEIPT',
        `${line.description}: menerima ${qty} dari sisa ${poLineOpen(line)} pcs.`);
      receiveParts(db, { partId: line.partId, warehouseId, qty, user, ref: ref.trim(), unitCost: costs.cost });
      line.receivedPcs += qty;
      total += qty * costs.cost;
      totalForeign += qty * line.unitPrice;
      receiptLines.push({
        poLineId: line.id, kind: 'part', partId: line.partId, description: line.description,
        qtyPcs: qty, unitCost: costs.cost, unitPriceForeign: line.unitPrice,
        landedPerUnit: Math.round(costs.add), currency: po.currency ?? 'IDR',
      });
    }
  }

  assert(receiptLines.length > 0, 'EMPTY_RECEIPT', 'Tidak ada baris penerimaan valid.');

  const receipt = {
    id: nextId(db, 'goodsReceipt', 'GR', 4),
    ref: ref.trim(),
    kind: 'po',
    poId: po.id,
    supplierId: po.supplierId,
    date,
    warehouseId,
    currency: po.currency ?? 'IDR',
    fxRate,
    amountForeign: Math.round(totalForeign * 100) / 100,
    landedCostIdr: landed?.landedCostIdr ?? 0,
    lines: receiptLines,
    total,
    note,
    supplierInvoiceId: null,
    createdAt: isoNow(),
    createdBy: user?.name ?? 'Sistem',
  };
  db.goodsReceipts.unshift(receipt);
  po.receipts.push(receipt.id);

  const complete = po.lines.every((l) => poLineOpen(l) === 0);
  const any = po.lines.some((l) => (l.kind === 'fabric' ? l.receivedMm : l.receivedPcs) > 0);
  po.status = complete ? 'received' : any ? 'partial' : po.status;

  if (createBill && total > 0) {
    const bill = createSupplierInvoice(db, {
      supplierId: po.supplierId,
      poId: po.id,
      receiptId: receipt.id,
      date,
      dueDate: addDaysLocal(date, po.termsDays ?? 30),
      amount: total,
      currency: po.currency ?? 'IDR',
      fxRate,
      amountForeign: Math.round(totalForeign * 100) / 100,
      note: `Gabungan penerimaan ${receipt.id} (demo)`,
      user,
    });
    receipt.supplierInvoiceId = bill.id;
  }

  audit(db, user, 'terima_po', 'po', po.id, `${receipt.id} · ${total}`);
  return { po, receipt };
}

function addDaysLocal(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Supplier invoices & payables                                               */
/* -------------------------------------------------------------------------- */

export function createSupplierInvoice(db, {
  supplierId, poId = null, receiptId = null, date = todayJakarta(), dueDate, amount,
  currency = 'IDR', fxRate = 1, amountForeign = null, note = '', user,
}) {
  const rate = currency === 'IDR' ? 1 : Number(fxRate || 1);
  const idr = money(amount);
  const bill = {
    id: nextId(db, 'supplierInvoice', 'SINV', 4),
    supplierId,
    poId,
    receiptId,
    currency,
    fxRate: rate,
    amount: idr,
    amountForeign: amountForeign ?? Math.round((idr / rate) * 100) / 100,
    paid: 0,
    paidForeign: 0,
    payments: [],
    note,
    status: 'open',
    createdAt: isoNow(),
  };
  db.supplierInvoices.unshift(bill);
  return bill;
}

export function paySupplierInvoice(db, { id, amount, amountForeign = null, date = todayJakarta(), method = 'transfer', user, note = '' }) {
  const bill = db.supplierInvoices.find((b) => b.id === id);
  assert(bill, 'BILL_NOT_FOUND', 'Tagihan pemasok tidak ditemukan.');
  const value = money(amount);
  const outstanding = bill.amount - bill.paid;
  assert(value > 0, 'INVALID_AMOUNT', 'Nominal pembayaran harus lebih dari 0.');
  assert(value <= outstanding, 'OVERPAYMENT', `Pembayaran melebihi sisa tagihan (${outstanding}).`);
  const rate = bill.fxRate || 1;
  const foreign = amountForeign ?? Math.round((value / rate) * 100) / 100;
  bill.paid += value;
  bill.paidForeign = Math.round(((bill.paidForeign ?? 0) + foreign) * 100) / 100;
  const payment = {
    id: nextId(db, 'supplierPayment', 'SPAY', 4), date, amount: value, amountForeign: foreign,
    currency: bill.currency ?? 'IDR', fxRate: rate, method, note, at: isoNow(), by: user?.name ?? 'Sistem',
  };
  bill.payments.push(payment);
  bill.status = bill.paid >= bill.amount ? 'paid' : 'partial';
  audit(db, user, 'bayar_pemasok', 'supplierInvoice', bill.id, `${value}${bill.currency !== 'IDR' ? ` · ${foreign} ${bill.currency}` : ''}`);
  return payment;
}

export function payablesAging(db, today = todayJakarta()) {
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0 };
  const items = [];
  for (const bill of db.supplierInvoices) {
    const outstanding = bill.amount - bill.paid;
    if (outstanding <= 0) continue;
    const age = Math.max(0, daysBetween(bill.dueDate, today));
    const bucket = age === 0 ? 'current' : age <= 30 ? 'd1_30' : age <= 60 ? 'd31_60' : age <= 90 ? 'd61_90' : 'over90';
    buckets[bucket] += outstanding;
    items.push({ bill, outstanding, daysLate: age, bucket });
  }
  return { buckets, items, total: items.reduce((a, b) => a + b.outstanding, 0) };
}

/* -------------------------------------------------------------------------- */
/* Supplier returns                                                           */
/* -------------------------------------------------------------------------- */

export function createSupplierReturn(db, { receiptId, rollIds = [], partLines = [], reason, user, date = todayJakarta() }) {
  const receipt = db.goodsReceipts.find((r) => r.id === receiptId) ?? db.goodsReceipts.find((r) => r.ref === receiptId);
  assert(receipt, 'RECEIPT_NOT_FOUND', 'Dokumen penerimaan tidak ditemukan.');
  assertWarehouseOpen(db, receipt.warehouseId, 'Retur pemasok');
  assert(reason && reason.trim().length >= 3, 'REASON_REQUIRED', 'Alasan retur pemasok wajib diisi.');
  assert(rollIds.length > 0 || partLines.length > 0, 'EMPTY_LINES', 'Pilih barang yang diretur.');

  let credit = 0;
  const lines = [];
  for (const rollId of rollIds) {
    const roll = requireRoll(db, rollId);
    assert(roll.receiptRef === receipt.ref, 'NOT_IN_RECEIPT', `Roll ${roll.id} bukan bagian dari ${receipt.ref}.`);
    assert(['available', 'quarantine'].includes(roll.status) && !roll.transit, 'ROLL_NOT_RETURNABLE', `Roll ${roll.id} tidak dapat diretur.`);
    assert((roll.reservedMm || 0) === 0, 'ROLL_RESERVED', `Roll ${roll.id} terpesan.`);
    roll.status = 'void';
    roll.notes = `${roll.notes} · Retur pemasok ${reason}`.trim();
    credit += Math.round((roll.currentMm / MM_PER_M) * roll.costPerM);
    recordMovement(db, {
      type: 'supplier_return', ref: `SRET-${receipt.id}`, warehouseId: roll.warehouseId, skuId: roll.skuId,
      rollId: roll.id, qtyMm: roll.currentMm, unitCost: roll.costPerM, user, note: reason,
    });
    lines.push({ kind: 'fabric', rollId: roll.id, description: roll.id, qtyMm: roll.currentMm, credit: Math.round((roll.currentMm / MM_PER_M) * roll.costPerM) });
  }
  for (const pl of partLines) {
    const part = byId(db.parts, pl.partId);
    assert(part, 'PART_NOT_FOUND', 'Spare part tidak ditemukan.');
    const qty = Math.round(Number(pl.qtyPcs));
    const row = db.partStock.find((p) => p.partId === pl.partId && p.warehouseId === receipt.warehouseId);
    assert(row && row.qty >= qty && qty > 0, 'INSUFFICIENT_PART', 'Stok spare part tidak cukup untuk retur.');
    row.qty -= qty;
    credit += qty * part.buyPrice;
    lines.push({ kind: 'part', partId: part.id, description: part.name, qtyPcs: qty, credit: qty * part.buyPrice });
    recordMovement(db, {
      type: 'supplier_return', ref: `SRET-${receipt.id}`, warehouseId: receipt.warehouseId, partId: part.id,
      qtyPcs: qty, unitCost: part.buyPrice, user, note: reason,
    });
  }

  const ret = {
    id: nextId(db, 'supplierReturn', 'SRET', 4),
    type: 'supplier',
    receiptId: receipt.id,
    supplierId: receipt.supplierId,
    date,
    reason: reason.trim(),
    lines,
    credit,
    status: 'posted',
    createdAt: isoNow(),
    postedBy: user?.name ?? 'Sistem',
  };
  db.returns.unshift(ret);

  // Reduce the linked supplier bill, never below zero.
  const bill = receipt.supplierInvoiceId ? db.supplierInvoices.find((b) => b.id === receipt.supplierInvoiceId) : null;
  if (bill) {
    bill.amount = Math.max(0, bill.amount - credit);
    if (bill.paid > bill.amount) bill.paid = bill.amount;
    bill.status = bill.paid >= bill.amount ? 'paid' : bill.paid > 0 ? 'partial' : 'open';
  }
  audit(db, user, 'retur_pemasok', 'supplierReturn', ret.id, `${credit}`);
  return ret;
}

export function supplierPerformance(db) {
  return db.suppliers.map((s) => {
    const pos = db.purchaseOrders.filter((p) => p.supplierId === s.id);
    const receipts = db.goodsReceipts.filter((r) => r.supplierId === s.id);
    const lateReceipts = receipts.filter((r) => {
      const po = pos.find((p) => p.id === r.poId);
      return po && r.date > po.expectedDate;
    });
    return { supplier: s, poCount: pos.length, receiptCount: receipts.length, lateReceipts: lateReceipts.length };
  });
}
