/**
 * Bali-initiated internal purchase orders to Jakarta.
 *
 * Buyer creates a PO from the seller's stock at the internal price. Seller
 * approves and ships, which creates and posts the internal invoice and moves
 * stock to the buyer warehouse. Buyer then confirms receipt.
 */

import {
  MM_PER_M, assert, audit, byId, isoNow, money, nextId, todayJakarta,
} from './core.js';
import { availableMm, partStockRow, requireRoll } from './inventory.js';
import { settingsOf } from './settings.js';
import { createInternalPurchase, postInvoice } from './sales.js';

export const IPO_STATUS = {
  requested: { label: 'Diminta', tone: 'warn' },
  shipped: { label: 'Dikirim', tone: 'info' },
  received: { label: 'Diterima', tone: 'ok' },
  cancelled: { label: 'Dibatalkan', tone: 'danger' },
};

export function internalPriceOf(db, listPrice) {
  const pct = Math.min(50, Math.max(0, Number(settingsOf(db).internalDiscountPct) || 0));
  return money(Number(listPrice || 0) * (1 - pct / 100));
}

export function internalPOsForCompany(db, companyId) {
  if (!companyId) return [...(db.internalPOs ?? [])];
  return (db.internalPOs ?? []).filter((po) => po.buyerCompanyId === companyId || po.sellerCompanyId === companyId);
}

export function requireInternalPO(db, id) {
  const po = (db.internalPOs ?? []).find((row) => row.id === id);
  assert(po, 'IPO_NOT_FOUND', 'PO internal tidak ditemukan.');
  return po;
}

export function createInternalPO(db, {
  buyerCompanyId,
  sellerCompanyId,
  lines,
  date = todayJakarta(),
  expectedDate = '',
  notes = '',
  user,
}) {
  assert(buyerCompanyId && sellerCompanyId && buyerCompanyId !== sellerCompanyId, 'INVALID_COMPANY', 'PT pembeli dan penjual harus berbeda.');
  assert(Array.isArray(lines) && lines.length, 'EMPTY_LINES', 'PO internal harus memiliki minimal satu baris.');
  const buyer = byId(db.companies, buyerCompanyId);
  const seller = byId(db.companies, sellerCompanyId);
  assert(buyer && seller, 'COMPANY_NOT_FOUND', 'PT tidak ditemukan.');
  const warehouseIds = new Set((db.warehouses ?? [])
    .filter((w) => (w.companyId ?? 'co-jkt') === sellerCompanyId)
    .map((w) => w.id));

  const built = lines.map((line) => {
    if (line.kind === 'part') {
      const part = byId(db.parts, line.partId);
      assert(part, 'PART_NOT_FOUND', 'Spare part tidak ditemukan.');
      const qtyPcs = Math.max(0, Math.round(Number(line.qtyPcs) || 0));
      assert(qtyPcs > 0, 'INVALID_QTY', 'Jumlah part harus lebih dari 0.');
      const warehouseId = line.warehouseId && warehouseIds.has(line.warehouseId)
        ? line.warehouseId
        : [...warehouseIds][0];
      const row = partStockRow(db, part.id, warehouseId);
      assert(row && row.qty - (row.reserved || 0) >= qtyPcs, 'INSUFFICIENT_PART', `Stok ${part.name} tidak cukup di ${seller.name}.`);
      const listPrice = Number(part.sellPrice || 0);
      const unitPrice = internalPriceOf(db, listPrice);
      return {
        kind: 'part',
        partId: part.id,
        warehouseId,
        qtyPcs,
        description: `${part.sku} · ${part.name}`,
        listPrice,
        unitPrice,
        amount: money(unitPrice * qtyPcs),
      };
    }
    const roll = requireRoll(db, line.rollId);
    assert(warehouseIds.has(roll.warehouseId), 'WRONG_WAREHOUSE', `Roll ${roll.id} bukan milik ${seller.name}.`);
    assert(roll.status === 'available' && !roll.transit, 'ROLL_NOT_AVAILABLE', `Roll ${roll.id} tidak tersedia.`);
    const sku = byId(db.skus, roll.skuId);
    assert(sku && sku.active !== false && !sku.dormant, 'DORMANT_PRODUCT', 'SKU tidak aktif.');
    const mode = line.mode === 'whole' ? 'whole' : 'cut';
    const qtyMm = mode === 'whole' ? roll.currentMm : Math.round(Number(line.qtyMm) || 0);
    assert(qtyMm > 0, 'INVALID_QTY', 'Panjang potong harus lebih dari 0.');
    if (mode === 'whole') assert((roll.reservedMm || 0) === 0, 'ROLL_RESERVED', `Roll ${roll.id} terpesan.`);
    else assert(qtyMm <= availableMm(roll), 'INSUFFICIENT_AVAILABLE', `Roll ${roll.id} tersedia ${availableMm(roll) / MM_PER_M} m.`);
    const listPrice = Number(sku.sellPrice || 0);
    const unitPrice = internalPriceOf(db, listPrice);
    return {
      kind: 'fabric',
      rollId: roll.id,
      warehouseId: roll.warehouseId,
      mode,
      qtyMm,
      lot: roll.lot,
      description: `${sku.collectionName ?? sku.code} ${sku.colourName ?? sku.colourCode ?? ''} · ${roll.id}`.trim(),
      listPrice,
      unitPrice,
      amount: money(unitPrice * (qtyMm / MM_PER_M)),
    };
  });

  const total = money(built.reduce((sum, line) => sum + line.amount, 0));
  db.internalPOs = db.internalPOs ?? [];
  const po = {
    id: nextId(db, 'internalPO', 'IPO', 4),
    buyerCompanyId,
    sellerCompanyId,
    buyerName: buyer.name,
    sellerName: seller.name,
    date,
    expectedDate: expectedDate || date,
    status: 'requested',
    lines: built,
    total,
    discountPct: Number(settingsOf(db).internalDiscountPct) || 0,
    notes: String(notes ?? '').trim(),
    requestedBy: user?.id ?? null,
    requestedByName: user?.name ?? 'Sistem',
    invoiceId: null,
    trackingRef: '',
    createdAt: isoNow(),
    shippedAt: null,
    receivedAt: null,
    history: [{ at: isoNow(), action: 'PO internal dibuat', by: user?.name ?? 'Sistem', note: '' }],
  };
  db.internalPOs.unshift(po);
  audit(db, user, 'buat_po_internal', 'internalPO', po.id, `${buyer.name} ← ${seller.name} · ${total}`);
  return po;
}

/** Seller accepts and ships: creates + posts the internal invoice, moving stock. */
export function shipInternalPO(db, { id, user, trackingRef = '', note = '' }) {
  const po = requireInternalPO(db, id);
  assert(po.status === 'requested', 'INVALID_STATUS', 'PO ini sudah diproses.');
  assert(!user?.companyId || user.companyId === po.sellerCompanyId, 'INTERNAL_SELLER_ONLY',
    'Hanya PT penjual yang dapat menyetujui PO internal.');
  const invoice = createInternalPurchase(db, {
    buyerCompanyId: po.buyerCompanyId,
    sourceCompanyId: po.sellerCompanyId,
    lines: po.lines.map((line) => line.kind === 'part'
      ? { kind: 'part', partId: line.partId, qtyPcs: line.qtyPcs, unitPrice: line.unitPrice, warehouseId: line.warehouseId }
      : { kind: 'fabric', rollId: line.rollId, mode: line.mode, qtyMm: line.qtyMm, unitPrice: line.unitPrice }),
    date: todayJakarta(),
    notes: `PO internal ${po.id}${po.notes ? ` · ${po.notes}` : ''}`,
    user,
  });
  postInvoice(db, { id: invoice.id, user });
  invoice.internalPOId = po.id;
  po.invoiceId = invoice.id;
  po.status = 'shipped';
  po.trackingRef = String(trackingRef ?? '').trim() || po.id;
  po.shippedAt = isoNow();
  po.history.push({
    at: po.shippedAt,
    action: 'Disetujui & dikirim',
    by: user?.name ?? 'Sistem',
    note: `Faktur ${invoice.id}${po.trackingRef ? ` · ${po.trackingRef}` : ''}${note ? ` · ${note}` : ''}`,
  });
  audit(db, user, 'kirim_po_internal', 'internalPO', po.id, `${invoice.id} · ${po.trackingRef}`);
  return po;
}

export function receiveInternalPO(db, { id, user, note = '' }) {
  const po = requireInternalPO(db, id);
  assert(po.status === 'shipped', 'INVALID_STATUS', 'PO belum dikirim.');
  assert(!user?.companyId || user.companyId === po.buyerCompanyId, 'INTERNAL_BUYER_ONLY',
    'Hanya PT pembeli yang dapat mengonfirmasi penerimaan.');
  po.status = 'received';
  po.receivedAt = isoNow();
  po.history.push({ at: po.receivedAt, action: 'Diterima', by: user?.name ?? 'Sistem', note: String(note ?? '') });
  audit(db, user, 'terima_po_internal', 'internalPO', po.id, note);
  return po;
}

export function cancelInternalPO(db, { id, user, note = '' }) {
  const po = requireInternalPO(db, id);
  assert(po.status === 'requested', 'INVALID_STATUS', 'PO yang sudah dikirim tidak dapat dibatalkan.');
  po.status = 'cancelled';
  po.history.push({ at: isoNow(), action: 'Dibatalkan', by: user?.name ?? 'Sistem', note: String(note ?? '') });
  audit(db, user, 'batal_po_internal', 'internalPO', po.id, note);
  return po;
}
