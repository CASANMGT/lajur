/**
 * Turn the rows of a stock Excel sheet into a dated stock-sync plan.
 * Expected columns (found by header): NAMA WARNA and STOK_PER_ROLL. TTL_SATUAN
 * is used as a fallback when the per-roll string is missing.
 */

import { assert } from './core.js';

const slug = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
const widthOf = (name) => {
  const match = String(name).match(/(\d{2,3})\s*CM\b/i);
  return match ? Number(match[1]) : 280;
};
const parseRolls = (text) => {
  const entries = [];
  for (const match of String(text ?? '').matchAll(/\((\d+)\)\s*([\d.,]+)/g)) {
    const count = Number(match[1]);
    const lengthM = Number(match[2].replace(',', '.'));
    if (count > 0 && lengthM > 0) entries.push({ count, lengthM: Math.round(lengthM * 1000) / 1000 });
  }
  return entries;
};

export function buildStockPlanFromRows(rows, { date, source = 'Upload Excel', key = null } = {}) {
  assert(Array.isArray(rows) && rows.length > 1, 'EMPTY_EXCEL', 'File Excel tidak memiliki baris data.');
  const cleanDate = String(date ?? '').trim();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(cleanDate), 'INVALID_DATE', 'Tanggal stok harus YYYY-MM-DD.');
  let headerIndex = -1;
  for (let index = 0; index < Math.min(12, rows.length); index += 1) {
    const cells = (rows[index] ?? []).map((value) => String(value ?? '').trim().toUpperCase());
    if (cells.some((value) => value.includes('NAMA WARNA') || value === 'NAMA') && cells.some((value) => value.includes('STOK_PER_ROLL'))) {
      headerIndex = index;
      break;
    }
  }
  assert(headerIndex >= 0, 'INVALID_EXCEL', 'Header NAMA WARNA / STOK_PER_ROLL tidak ditemukan.');
  const header = (rows[headerIndex] ?? []).map((value) => String(value ?? '').trim().toUpperCase());
  const nameIndex = header.findIndex((value) => value.includes('NAMA WARNA') || value === 'NAMA');
  const perRollIndex = header.findIndex((value) => value.includes('STOK_PER_ROLL'));
  const totalIndex = header.findIndex((value) => value.includes('TTL_SATUAN'));
  assert(nameIndex >= 0 && perRollIndex >= 0, 'INVALID_EXCEL', 'Kolom NAMA WARNA dan STOK_PER_ROLL wajib ada.');

  const normal = [];
  const samples = [];
  const usedCodes = new Map();
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const name = String(row[nameIndex] ?? '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    if (/^\d+(?:[.,]\d+)?$/.test(name)) continue;
    if (/^PENYESUAIAN/i.test(name) || /^(BIAYA|FOLDER)\b/i.test(name)) continue;
    const entries = parseRolls(row[perRollIndex]);
    const totalM = Number(String(row[totalIndex] ?? '').replace(',', '.')) || 0;
    const effectiveEntries = entries.length ? entries : (totalM > 0 ? [{ count: 1, lengthM: totalM }] : []);
    const derivedM = Math.round(effectiveEntries.reduce((sum, group) => sum + group.count * group.lengthM, 0) * 100) / 100;
    if (!effectiveEntries.length || derivedM <= 0) continue;
    const collectionKey = name.split(/\s+/)[0];
    const suffix = name.slice(collectionKey.length).trim() || name;
    let code = slug(name);
    if (usedCodes.has(code)) {
      const count = usedCodes.get(code) + 1;
      usedCodes.set(code, count);
      code = `${code}-${count}`;
    } else {
      usedCodes.set(code, 1);
    }
    const item = {
      row: index + 1,
      name,
      collectionKey,
      suffix,
      widthCm: widthOf(name),
      code,
      entries: effectiveEntries,
      derivedM,
    };
    if (/SAMPLE/i.test(name)) samples.push(item);
    else normal.push(item);
  }
  assert(normal.length || samples.length, 'EMPTY_EXCEL', 'Tidak ada baris stok yang dapat dibaca.');

  const collectionMap = new Map();
  for (const item of [...normal, ...samples]) {
    if (!collectionMap.has(item.collectionKey)) {
      collectionMap.set(item.collectionKey, {
        key: item.collectionKey,
        name: item.collectionKey === 'LUNA' ? 'Luna' : item.collectionKey,
        widthCm: item.widthCm || 280,
        sampleOnly: !normal.some((row) => row.collectionKey === item.collectionKey),
      });
    }
  }
  const skus = normal.map((item) => ({
    id: `sku-imp-${item.code.toLowerCase().slice(0, 56)}`,
    row: item.row,
    collectionKey: item.collectionKey,
    code: item.code,
    colourCode: item.suffix.slice(0, 60),
    colourName: item.suffix,
    widthCm: item.widthCm,
    buyPrice: 0,
    sellPrice: 0,
    rolls: item.entries,
  }));
  const sampleMap = new Map();
  for (const item of samples) {
    const entry = sampleMap.get(item.collectionKey) ?? {
      collectionKey: item.collectionKey, qty: 0, metres: 0, names: [], widthCm: item.widthCm,
    };
    entry.qty += 1;
    entry.metres = Math.round((entry.metres + item.derivedM) * 100) / 100;
    entry.names.push(item.name);
    sampleMap.set(item.collectionKey, entry);
  }
  return {
    key: key ?? `excel-${cleanDate}`,
    source,
    date: cleanDate,
    warehouseId: 'wh-jkt',
    categoryName: 'Kain',
    collections: [...collectionMap.values()],
    skus,
    samples: [...sampleMap.values()],
  };
}
