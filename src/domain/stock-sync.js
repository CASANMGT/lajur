/**
 * One-time stock synchronization from the 13 Nov 2026 Excel stock list.
 *
 * The plan is bundled as JSON and applied by a manager-only action. Old demo
 * rolls are archived (void) so invoice/movement history stays valid; old
 * fabric SKUs are made inactive. Imported sample rows go to Buku Sample stock,
 * never to sellable rolls.
 */

import { DomainError, assert, audit, byId, isoNow, nextId } from './core.js';
import { createRoll, recordMovement } from './inventory.js';
import { saveSku } from './master.js';
import { sampleStockForCollection } from './crm.js';

export const STOCK_SYNC_KEY = 'excel-2026-11-13';
export const STOCK_SYNC_META = {
  key: STOCK_SYNC_KEY,
  source: '13 NOVEMBER 2026 STOK BARANG .xlsx',
  date: '2026-11-13',
  collections: 47,
  skus: 257,
  rolls: 2175,
  metres: 144590.62,
  samples: 40,
  sampleMetres: 3076,
};

const slug = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

export function stockPlanUrl() {
  return new URL('../data/stock-13nov2026.json', import.meta.url);
}

export function stockSyncSummary(db, plan = STOCK_SYNC_META) {
  const available = (db.rolls ?? []).filter((roll) => ['available', 'quarantine'].includes(roll.status));
  const { collections, skus, samples, ...meta } = plan;
  return {
    ...meta,
    collections: Array.isArray(collections) ? collections.length : collections,
    skus: Array.isArray(skus) ? skus.length : skus,
    rolls: Array.isArray(skus)
      ? skus.reduce((total, item) => total + (item.rolls ?? []).reduce((sum, group) => sum + Number(group.count || 0), 0), 0)
      : plan.rolls,
    metres: Array.isArray(skus)
      ? Math.round(skus.reduce((total, item) => total + (item.rolls ?? []).reduce((sum, group) => sum + Number(group.count || 0) * Number(group.lengthM || 0), 0), 0) * 100) / 100
      : plan.metres,
    samples: Array.isArray(samples) ? samples.reduce((total, item) => total + Number(item.qty || 0), 0) : samples,
    sampleMetres: Array.isArray(samples) ? Math.round(samples.reduce((total, item) => total + Number(item.metres || 0), 0) * 100) / 100 : plan.sampleMetres,
    alreadySynced: db.meta?.stockSync?.key === plan.key,
    currentRolls: available.length,
    warehouse: byId(db.warehouses, plan.warehouseId)?.name ?? plan.warehouseId,
  };
}

export function syncImportedStock(db, {
  plan,
  warehouseId = plan?.warehouseId ?? 'wh-jkt',
  user,
  archive = true,
} = {}) {
  assert(plan?.key && Array.isArray(plan.collections) && Array.isArray(plan.skus), 'INVALID_STOCK_PLAN', 'Rencana stok tidak valid.');
  if (db.meta?.stockSync?.key === plan.key) {
    throw new DomainError('STOCK_ALREADY_SYNCED', `Stok ${plan.date} sudah pernah disinkronkan.`);
  }
  const warehouse = byId(db.warehouses, warehouseId);
  assert(warehouse, 'WAREHOUSE_NOT_FOUND', 'Gudang tujuan sinkron tidak ditemukan.');

  let category = (db.categories ?? []).find((c) => String(c.name).toLowerCase() === String(plan.categoryName ?? 'Kain').toLowerCase());
  if (!category) {
    category = { id: `cat-${slug(plan.categoryName ?? 'Kain').toLowerCase()}`, name: plan.categoryName ?? 'Kain' };
    db.categories = db.categories ?? [];
    db.categories.push(category);
  }

  const collections = new Map();
  for (const item of plan.collections) {
    let collection = (db.collections ?? []).find((c) => String(c.name).toLowerCase() === String(item.name).toLowerCase());
    if (!collection) {
      collection = {
        id: `col-imp-${slug(item.key).toLowerCase()}`,
        name: item.name,
        categoryId: category.id,
        description: `Impor stok ${plan.date}`,
        clothType: 'Kain',
        motive: item.name,
        motivePrice: 0,
        defaultRollLengthM: 60,
        defaultWidthCm: Number(item.widthCm) || 280,
        samplePrice: 0,
        sampleDeposit: 0,
        sampleMin: 0,
      };
      db.collections.push(collection);
    }
    collections.set(item.key, collection);
  }

  const importedCodes = new Set(plan.skus.map((item) => String(item.code).toUpperCase()));
  const archivedRolls = [];
  if (archive) {
    for (const roll of db.rolls ?? []) {
      if (!['available', 'quarantine'].includes(roll.status)) continue;
      roll.status = 'void';
      roll.notes = [roll.notes, `Diarsipkan: diganti stok ${plan.date}`].filter(Boolean).join(' · ');
      archivedRolls.push(roll);
      recordMovement(db, {
        type: 'void',
        ref: `SYNC-${plan.key}`,
        warehouseId: roll.warehouseId,
        skuId: roll.skuId,
        rollId: roll.id,
        qtyMm: roll.currentMm,
        beforeMm: roll.currentMm,
        afterMm: 0,
        date: plan.date,
        user,
        note: `Arsip roll lama · sinkron stok ${plan.date}`,
      });
    }
    for (const sku of db.skus ?? []) {
      if (sku.unit !== 'm' || importedCodes.has(String(sku.code).toUpperCase())) continue;
      sku.active = false;
      sku.dormant = true;
      sku.updatedAt = isoNow();
    }
    for (const stock of db.sampleStocks ?? []) {
      if (!stock.qty) continue;
      stock.qty = 0;
      stock.updatedAt = isoNow();
      stock.history = stock.history ?? [];
      stock.history.unshift({
        at: isoNow(), action: `Reset sinkron stok ${plan.date}`, qty: 0, by: user?.name ?? 'Sistem',
        note: 'Stok sample diganti dengan data Excel 13 Nov 2026.',
      });
    }
  }

  let createdSkus = 0;
  let createdRolls = 0;
  let totalMm = 0;
  for (const item of plan.skus) {
    const collection = collections.get(item.collectionKey);
    assert(collection, 'COLLECTION_NOT_FOUND', `Koleksi ${item.collectionKey} tidak ditemukan.`);
    let sku = (db.skus ?? []).find((s) => String(s.code).toUpperCase() === String(item.code).toUpperCase());
    if (!sku) {
      sku = saveSku(db, {
        collectionId: collection.id,
        code: item.code,
        colourCode: item.colourCode,
        colourName: item.colourName,
        widthCm: item.widthCm,
        buyPrice: Number(item.buyPrice) || 0,
        sellPrice: Number(item.sellPrice) || 0,
        active: true,
        notes: `Impor stok ${plan.date} · baris ${item.row}`,
        user,
      });
      if (item.id && !db.skus.some((other) => other.id === item.id && other !== sku)) sku.id = item.id;
      createdSkus += 1;
    } else {
      sku.active = true;
      sku.dormant = false;
      sku.updatedAt = isoNow();
    }
    for (const group of item.rolls ?? []) {
      const lengthMm = Math.round(Number(group.lengthM) * 1000);
      if (lengthMm <= 0) continue;
      for (let index = 0; index < Number(group.count || 0); index += 1) {
        const roll = createRoll(db, {
          skuId: sku.id,
          currentMm: lengthMm,
          originalMm: lengthMm,
          warehouseId,
          bin: '',
          lot: `STOK-13NOV2026`,
          receivedAt: plan.date,
          receiptRef: 'STOK-13NOV2026',
          status: 'available',
          costPerM: 0,
          notes: `Impor Excel ${plan.date} · baris ${item.row}`,
          user,
        });
        roll.importedKey = plan.key;
        recordMovement(db, {
          type: 'opening',
          ref: `SYNC-${plan.key}`,
          warehouseId,
          skuId: sku.id,
          rollId: roll.id,
          qtyMm: lengthMm,
          beforeMm: 0,
          afterMm: lengthMm,
          unitCost: 0,
          value: 0,
          date: plan.date,
          user,
          note: `Impor stok ${plan.date} · ${item.code}`,
        });
        createdRolls += 1;
        totalMm += lengthMm;
      }
    }
  }

  let samplePieces = 0;
  let sampleMetres = 0;
  for (const sample of plan.samples ?? []) {
    const collection = collections.get(sample.collectionKey);
    if (!collection) continue;
    let stock = sampleStockForCollection(db, collection.id);
    if (!stock) {
      stock = {
        id: `SS-IMP-${slug(sample.collectionKey).toLowerCase()}`,
        collectionId: collection.id,
        skuId: null,
        qty: 0,
        minQty: 0,
        samplePrice: 0,
        sampleDeposit: 0,
        unitCost: 0,
        warehouseId,
        location: 'Showroom Jakarta',
        photo: '',
        procurements: [],
        history: [],
        updatedAt: isoNow(),
      };
      db.sampleStocks = db.sampleStocks ?? [];
      db.sampleStocks.push(stock);
    }
    stock.qty = (Number(stock.qty) || 0) + Number(sample.qty || 0);
    stock.warehouseId = warehouseId;
    stock.location = stock.location || 'Showroom Jakarta';
    stock.updatedAt = isoNow();
    stock.procurements = stock.procurements ?? [];
    stock.procurements.unshift({
      id: nextId(db, 'sampleProcurement', 'SPR', 4),
      qty: Number(sample.qty) || 0,
      unitCost: 0,
      totalCost: 0,
      supplierId: null,
      date: plan.date,
      notes: `Impor sample ${plan.date}: ${(sample.names ?? []).join(', ')} (${sample.metres ?? 0} m)`,
      photo: '',
      createdAt: isoNow(),
      createdBy: user?.name ?? 'Sistem',
    });
    stock.history = stock.history ?? [];
    stock.history.unshift({
      at: isoNow(), action: `Impor sample ${plan.date}`, qty: Number(sample.qty) || 0,
      by: user?.name ?? 'Sistem', note: `${(sample.names ?? []).join(', ')} · ${sample.metres ?? 0} m`,
    });
    samplePieces += Number(sample.qty) || 0;
    sampleMetres += Number(sample.metres) || 0;
  }

  const summary = {
    key: plan.key,
    source: plan.source,
    date: plan.date,
    warehouseId,
    collections: plan.collections.length,
    skus: plan.skus.length,
    createdSkus,
    rolls: createdRolls,
    metres: Math.round((totalMm / 1000) * 100) / 100,
    samples: samplePieces,
    sampleMetres: Math.round(sampleMetres * 100) / 100,
    archivedRolls: archivedRolls.length,
    at: isoNow(),
    by: user?.name ?? 'Sistem',
  };
  db.meta = db.meta ?? {};
  db.meta.stockSync = summary;
  audit(db, user, 'sinkron_stok', 'dataset', 'main',
    `${summary.rolls} roll · ${summary.metres} m · ${summary.samples} sample · ${summary.archivedRolls} arsip`);
  return summary;
}
