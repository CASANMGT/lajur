/**
 * Supplier pricing and FX snapshots.
 *
 * A supplier price record is the source of truth for "what would this cost if we
 * ordered today". The master product keeps a denormalised buyPrice for quick
 * display, but PO defaults and the price list always resolve through these
 * records. Import POs snapshot the latest CNY→IDR rate at buying time.
 */

import {
  assert, audit, byId, isoNow, money, nextId, todayJakarta,
} from './core.js';

const recordsFor = (db, { skuId = null, partId = null } = {}) => (db.supplierPrices ?? [])
  .filter((p) => (skuId ? p.skuId === skuId : true) && (partId ? p.partId === partId : true));

function sortNewestFirst(a, b) {
  const valid = String(b.validFrom ?? '').localeCompare(String(a.validFrom ?? ''));
  if (valid) return valid;
  return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
}

/** All suppliers that have ever quoted this product/part. */
export function suppliersOfItem(db, { skuId = null, partId = null } = {}) {
  const seen = new Map();
  for (const rec of recordsFor(db, { skuId, partId })) {
    const supplier = byId(db.suppliers, rec.supplierId);
    if (supplier && !seen.has(supplier.id)) seen.set(supplier.id, supplier);
  }
  return [...seen.values()];
}

export function supplierPriceHistory(db, { skuId = null, partId = null } = {}) {
  return recordsFor(db, { skuId, partId }).slice().sort(sortNewestFirst);
}

/**
 * Latest usable price for a supplier/product at a date.
 * Prefer records valid on that date; otherwise return the most recent known
 * price so the buyer still sees the last agreed number.
 */
export function latestSupplierPrice(db, {
  supplierId = null, skuId = null, partId = null, date = todayJakarta(),
} = {}) {
  let list = recordsFor(db, { skuId, partId });
  if (supplierId) list = list.filter((p) => p.supplierId === supplierId);
  if (!list.length) return null;
  const active = list.filter((p) => (!p.validFrom || p.validFrom <= date) && (!p.validTo || p.validTo >= date));
  return (active.length ? active : list).slice().sort(sortNewestFirst)[0] ?? null;
}

export function latestFxRate(db, currency = 'CNY', asOfDate = null) {
  if (!currency || currency === 'IDR') return { currency: 'IDR', rate: 1, asOf: todayJakarta(), source: 'Rupiah' };
  const list = (db.fxRates ?? []).filter((r) => r.currency === currency
    && (!asOfDate || !r.asOf || String(r.asOf).slice(0, 10) <= asOfDate));
  if (!list.length) return null;
  return list.slice().sort((a, b) => String(b.asOf ?? '').localeCompare(String(a.asOf ?? '')))[0] ?? null;
}

/** Record a new latest rate. Called when a PO locks a rate that differs. */
export function recordFxRate(db, {
  currency, rate, source = 'Kurs manual PO', asOf = isoNow(), poId = null, user,
}) {
  const value = Number(rate);
  assert(value > 0, 'INVALID_FX', 'Kurs harus lebih dari 0.');
  db.fxRates = db.fxRates ?? [];
  const record = {
    id: nextId(db, 'fxRate', 'FX', 4),
    currency,
    rate: value,
    asOf,
    source,
    poId,
    createdAt: isoNow(),
    createdBy: user?.name ?? 'Sistem',
  };
  db.fxRates.unshift(record);
  audit(db, user, 'catat_kurs', 'fxRate', record.id, `${currency} ${value} · ${source}`);
  return record;
}

export function rateOfRecord(db, record) {
  if (!record) return 1;
  if (record.currency === 'IDR' || !record.currency) return 1;
  return Number(record.rate ?? 0) || latestFxRate(db, record.currency)?.rate || 0;
}

/**
 * Save a new supplier price. Also refreshes the master buy price when this is
 * the newest quote, so master data always reflects the latest increase.
 */
export function saveSupplierPrice(db, {
  supplierId, skuId = null, partId = null, price, currency = null,
  moqMm = null, moqPcs = null, validFrom = todayJakarta(), validTo = null, notes = '', user,
}) {
  const supplier = byId(db.suppliers, supplierId);
  assert(supplier, 'SUPPLIER_NOT_FOUND', 'Pemasok tidak ditemukan.');
  const item = skuId ? byId(db.skus, skuId) : byId(db.parts, partId);
  assert(item, 'ITEM_NOT_FOUND', 'Produk atau spare part tidak ditemukan.');
  assert(Boolean(skuId) !== Boolean(partId), 'INVALID_ITEM', 'Pilih tepat satu produk atau spare part.');
  const value = Number(price);
  assert(Number.isFinite(value) && value > 0, 'INVALID_PRICE', 'Harga pemasok harus lebih dari 0.');
  const cur = currency ?? supplier.currency ?? 'IDR';
  const fx = cur === 'IDR' ? 1 : (latestFxRate(db, cur)?.rate ?? supplier.fxRate ?? 1);
  assert(fx > 0, 'INVALID_FX', 'Kurs untuk mata uang harga belum tersedia.');
  const idr = money(value * fx);

  db.supplierPrices = db.supplierPrices ?? [];
  const record = {
    id: nextId(db, 'supplierPrice', 'SP', 4),
    supplierId,
    skuId: skuId ?? null,
    partId: partId ?? null,
    price: cur === 'IDR' ? Math.round(value) : Math.round(value * 100) / 100,
    currency: cur,
    unit: skuId ? 'm' : 'pcs',
    moqMm: skuId && moqMm ? Math.round(Number(moqMm)) : null,
    moqPcs: partId && moqPcs ? Math.round(Number(moqPcs)) : null,
    validFrom,
    validTo: validTo || null,
    notes,
    priceIdr: idr,
    createdAt: isoNow(),
    createdBy: user?.name ?? 'Sistem',
  };
  db.supplierPrices.unshift(record);

  const latest = latestSupplierPrice(db, { supplierId, skuId, partId, date: validFrom || todayJakarta() });
  if (!latest || latest.id === record.id) {
    Object.assign(item, {
      buyPrice: idr,
      lastSupplierId: supplierId,
      lastPriceAt: record.validFrom,
      lastPriceForeign: record.price,
      lastPriceCurrency: cur,
      lastPriceIdr: idr,
      updatedAt: isoNow(),
    });
  }

  audit(db, user, 'perbarui_harga_pemasok', skuId ? 'sku' : 'part', item.id,
    `${supplier.name} · ${record.price} ${cur} → ${idr}`);
  return { record, item, priceIdr: idr };
}
