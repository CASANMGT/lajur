/**
 * Seed data — realistic, linked, and built by running the same domain
 * operations the UI uses. Opening stock is therefore consistent with movement
 * history by construction.
 *
 * Opening stock for Luna:
 *   colour 01: 60 / 61.2 / 63 / 70 / 70 m
 *   colour 02: 70 / 70 / 63 / 50.3 / 80 m
 * Each length is a separate physical roll.
 */

import { MM_PER_M, todayJakarta } from './core.js';
import { createRoll, recordMovement } from './inventory.js';
import { applyDepositToInvoice, createCustomer, createDeposit, createSample, linkSampleToInvoice, refundDeposit } from './crm.js';
import { createInvoice, createCustomerReturn, postCustomerReturn, postInvoice, recordPayment } from './sales.js';
import { createProject, issueProject, handoverProject, reserveProject } from './projects.js';
import { approveTransfer, createTransfer, dispatchLine, receiveLine, submitTransfer } from './transfers.js';
import { approvePO, createPO, createSupplierInvoice, paySupplierInvoice, receivePO } from './purchasing.js';
import { approveOpname, saveCounts, startOpname, submitOpname } from './opname.js';
import { createShipment, updateShipmentStatus } from './shipments.js';
import { completeTask, createTask, startTask } from './tasks.js';
import { confirmOrder, createSalesOrder } from './orders.js';
import { createProductionOrder, cutOrder, qcPiece, releaseOrder, sewPiece } from './production.js';

export const USERS = {
  operator: { id: 'u-op', name: 'Rani Pratama', role: 'operator' },
  sales: { id: 'u-sales', name: 'Dimas Anggara', role: 'sales' },
  manager: { id: 'u-mgr', name: 'Arif Wibowo', role: 'manager' },
};

export const MASTER = {
  warehouses: [
    { id: 'wh-jkt', code: 'JKT', name: 'Gudang Pusat Jakarta', binPrefix: 'A', active: true, address: 'Jl. Industri Raya 12, Cakung, Jakarta Timur', phone: '021-555-0101' },
    { id: 'wh-bdg', code: 'BDG', name: 'Gudang Bandung', binPrefix: 'B', active: true, address: 'Jl. Soekarno-Hatta 288, Bandung', phone: '022-555-0202' },
    { id: 'wh-sby', code: 'SBY', name: 'Gudang Surabaya', binPrefix: 'C', active: true, address: 'Jl. Rungkut Industri 8, Surabaya', phone: '031-555-0303' },
  ],
  categories: [
    { id: 'cat-blackout', name: 'Blackout' },
    { id: 'cat-sheer', name: 'Sheer' },
    { id: 'cat-dimout', name: 'Dimout' },
    { id: 'cat-part', name: 'Rel & Aksesori' },
    { id: 'cat-motor', name: 'Motor & Otomasi' },
  ],
  collections: [
    { id: 'col-luna', name: 'Luna', categoryId: 'cat-blackout', description: 'Blackout tebal, jatuh vertikal rapi.' },
    { id: 'col-aria', name: 'Aria', categoryId: 'cat-sheer', description: 'Sheer ringan untuk lapis kedua.' },
    { id: 'col-nova', name: 'Nova', categoryId: 'cat-dimout', description: 'Dimout ekonomis untuk unit hunian.' },
    { id: 'col-rel', name: 'Rel & Track', categoryId: 'cat-part', description: 'Rel aluminium dan aksesori.' },
    { id: 'col-motor', name: 'Motor & Otomasi', categoryId: 'cat-motor', description: 'Motor, remote, dan kontrol.' },
  ],
  skus: [
    { id: 'sku-luna-01', collectionId: 'col-luna', collectionName: 'Luna', code: 'Luna-01', colourCode: '01', colourName: null, swatch: null, unit: 'm', widthCm: 280, sellPrice: 125000, buyPrice: 69500, active: true, dormant: false },
    { id: 'sku-luna-02', collectionId: 'col-luna', collectionName: 'Luna', code: 'Luna-02', colourCode: '02', colourName: 'Sand', swatch: '#C9B79C', unit: 'm', widthCm: 280, sellPrice: 125000, buyPrice: 70000, active: true, dormant: false },
    { id: 'sku-aria-01', collectionId: 'col-aria', collectionName: 'Aria', code: 'Aria-01', colourCode: '01', colourName: 'Putih', swatch: '#F1EEE4', unit: 'm', widthCm: 300, sellPrice: 99000, buyPrice: 55000, active: true, dormant: false },
    { id: 'sku-aria-02', collectionId: 'col-aria', collectionName: 'Aria', code: 'Aria-02', colourCode: '02', colourName: 'Greige', swatch: '#C9C2B4', unit: 'm', widthCm: 300, sellPrice: 99000, buyPrice: 55000, active: true, dormant: false },
    { id: 'sku-nova-01', collectionId: 'col-nova', collectionName: 'Nova', code: 'Nova-01', colourCode: '01', colourName: 'Charcoal', swatch: '#3D444B', unit: 'm', widthCm: 280, sellPrice: 149000, buyPrice: 82000, active: true, dormant: false },
    { id: 'sku-nova-02', collectionId: 'col-nova', collectionName: 'Nova', code: 'Nova-02', colourCode: '02', colourName: 'Terracotta', swatch: '#A85F45', unit: 'm', widthCm: 280, sellPrice: 149000, buyPrice: 82000, active: false, dormant: true, dormantSince: '2026-01-15' },
  ],
  parts: [
    { id: 'part-rel-3', sku: 'REL-300', name: 'Rel gorden 3 m', categoryId: 'cat-part', brand: 'Alumindo', unit: 'pcs', sellPrice: 85000, buyPrice: 52000, image: '/assets/parts/rail.svg', active: true },
    { id: 'part-rel-4', sku: 'REL-400', name: 'Rel gorden 4 m', categoryId: 'cat-part', brand: 'Alumindo', unit: 'pcs', sellPrice: 105000, buyPrice: 64000, image: '/assets/parts/rail.svg', active: true, parentPartId: 'part-rel-3' },
    { id: 'part-runner', sku: 'RUN-01', name: 'Runner rel', categoryId: 'cat-part', brand: 'Lajur', unit: 'pcs', sellPrice: 12000, buyPrice: 6500, image: '/assets/parts/rail.svg', active: true },
    { id: 'part-bracket', sku: 'BRK-01', name: 'Bracket dinding', categoryId: 'cat-part', brand: 'Lajur', unit: 'pcs', sellPrice: 25000, buyPrice: 14000, image: '/assets/parts/bracket.svg', active: true },
    { id: 'part-bracket-set', sku: 'BRK-04', name: 'Bracket set 4 pcs', categoryId: 'cat-part', brand: 'Lajur', unit: 'pcs', sellPrice: 140000, buyPrice: 90000, image: '/assets/parts/bracket.svg', active: true, notes: 'Set 4 bracket + sekrup.', parentPartId: 'part-bracket' },
    { id: 'part-hook', sku: 'HK-01', name: 'Hook gorden', categoryId: 'cat-part', brand: 'Lajur', unit: 'pcs', sellPrice: 3500, buyPrice: 1500, image: '/assets/parts/rail.svg', active: true },
    { id: 'part-ring', sku: 'RNG-01', name: 'Ring gorden', categoryId: 'cat-part', brand: 'Lajur', unit: 'pcs', sellPrice: 5000, buyPrice: 2200, image: '/assets/parts/rail.svg', active: true },
    { id: 'part-endcap', sku: 'END-01', name: 'End cap rel', categoryId: 'cat-part', brand: 'Lajur', unit: 'pcs', sellPrice: 4500, buyPrice: 2000, image: '/assets/parts/rail.svg', active: true },
    { id: 'part-motor', sku: 'MTR-01', name: 'Motor gorden', categoryId: 'cat-motor', brand: 'Somfy', unit: 'pcs', sellPrice: 1850000, buyPrice: 1250000, image: '/assets/parts/motor.svg', active: true },
    { id: 'part-remote', sku: 'RMT-01', name: 'Remote motor', categoryId: 'cat-motor', brand: 'Somfy', unit: 'pcs', sellPrice: 350000, buyPrice: 210000, image: '/assets/parts/remote.svg', active: true, parentPartId: 'part-motor' },
  ],
};

function skeleton(dataset) {
  return {
    meta: {
      version: 8,
      dataset,
      label: dataset === 'sim' ? 'Simulasi' : 'Data utama',
      seededAt: new Date().toISOString(),
      company: 'PT Lajur Tekstil Nusantara',
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
    },
    users: Object.values(USERS).map((u) => ({ ...u, active: true })),
    warehouses: MASTER.warehouses.map((w) => ({ ...w })),
    categories: MASTER.categories.map((c) => ({ ...c })),
    collections: MASTER.collections.map((c) => ({ ...c })),
    skus: MASTER.skus.map((s) => ({ ...s })),
    parts: MASTER.parts.map((p) => ({ ...p })),
    partStock: [],
    rolls: [],
    movements: [],
    customers: [],
    suppliers: [],
    supplierPrices: [],
    fxRates: [],
    projects: [],
    invoices: [],
    payments: [],
    samples: [],
    deposits: [],
    transfers: [],
    purchaseOrders: [],
    goodsReceipts: [],
    supplierInvoices: [],
    shipments: [],
    tasks: [],
    orders: [],
    productionOrders: [],
    productionPieces: [],
    payrollEntries: [],
    workCenters: [
      { id: 'wc-cut', stage: 'cutting', name: 'Meja potong', capacityPerDay: 40, ratePerPiece: 5000 },
      { id: 'wc-sew', stage: 'sewing', name: 'Meja jahit', capacityPerDay: 25, ratePerPiece: 12000 },
      { id: 'wc-qc', stage: 'qc', name: 'QC & packing', capacityPerDay: 35, ratePerPiece: 3000 },
    ],
    returns: [],
    opnameSessions: [],
    audit: [],
    settings: {
      lowStockMm: 10000,
      taskDueDays: 1,
      requireProofOnReceipt: false,
      salesOrderEnabled: false,
      productionEnabled: false,
      operatorCanSeeCosts: false,
      sampleDepositRequired: false,
    },
    sequences: {},
  };
}

function addRoll(db, { skuId, warehouseId, lot, receivedAt, receiptRef, lenM, bin, costPerM, condition = 'good' }) {
  const roll = createRoll(db, {
    skuId,
    lot,
    receivedAt,
    receiptRef,
    originalMm: Math.round(lenM * MM_PER_M),
    currentMm: Math.round(lenM * MM_PER_M),
    warehouseId,
    bin,
    costPerM,
    condition,
  });
  recordMovement(db, {
    type: 'receive',
    ref: receiptRef,
    date: receivedAt,
    warehouseId,
    skuId,
    rollId: roll.id,
    qtyMm: roll.currentMm,
    beforeMm: 0,
    afterMm: roll.currentMm,
    unitCost: costPerM,
    value: Math.round(lenM * costPerM),
    user: USERS.operator,
    note: `Saldo awal lot ${lot}`,
  });
  return roll;
}

function addParts(db, partId, warehouseId, qty) {
  db.partStock.push({ partId, warehouseId, qty, reserved: 0 });
}

export function buildSeed({ dataset = 'main' } = {}) {
  const db = skeleton(dataset);
  const op = USERS.operator;
  const sales = USERS.sales;
  const mgr = USERS.manager;

  /* ---------------------------------------------------------------- master */
  db.suppliers.push(
    { id: 'SUP-001', code: 'SINAR', name: 'PT Sinar Tekstil', contact: 'Budiman', phone: '021-777-1001', email: 'sales@sinartekstil.co.id', address: 'Jl. Mangga Dua Raya 40, Jakarta', country: 'ID', origin: 'local', currency: 'IDR', fxRate: 1, incoterm: '', port: '', termsDays: 30, leadTimeDays: 14, notes: 'Pemasok blackout utama.' },
    { id: 'SUP-002', code: 'MEGA', name: 'CV Mega Aksen', contact: 'Lestari', phone: '021-777-2002', email: 'order@megaaksen.co.id', address: 'Jl. Gajah Mada 88, Jakarta', country: 'ID', origin: 'local', currency: 'IDR', fxRate: 1, incoterm: '', port: '', termsDays: 30, leadTimeDays: 7, notes: 'Rel, aksesori, motor.' },
    { id: 'SUP-003', code: 'KILAU', name: 'PT Kilau Sheer', contact: 'Yosef', phone: '022-777-3003', email: 'yosef@kilausheer.co.id', address: 'Jl. Cigondewah 12, Bandung', country: 'ID', origin: 'local', currency: 'IDR', fxRate: 1, incoterm: '', port: '', termsDays: 21, leadTimeDays: 10, notes: 'Sheer dan dimout.' },
    { id: 'SUP-004', code: 'NINGBO', name: 'Ningbo Lajur Textiles Co.', contact: 'Chen Wei', phone: '+86 574 8888 1000', email: 'export@ningbolajur.cn', address: 'No. 88 Textile Road, Ningbo, Zhejiang', country: 'CN', origin: 'import', currency: 'CNY', fxRate: 2250, incoterm: 'FOB Ningbo', port: 'Ningbo → Tanjung Priok', termsDays: 45, leadTimeDays: 40, notes: 'Pemasok impor. Pembayaran CNY via TT; kurs dikunci saat PO.' },
  );

  db.supplierPrices.push(
    { id: 'SP-001', supplierId: 'SUP-001', skuId: 'sku-luna-01', price: 68000, currency: 'IDR', unit: 'm', moqMm: 60000, validFrom: '2026-07-01', validTo: '2026-12-31' },
    { id: 'SP-002', supplierId: 'SUP-001', skuId: 'sku-luna-02', price: 68500, currency: 'IDR', unit: 'm', moqMm: 60000, validFrom: '2026-07-01', validTo: '2026-12-31' },
    { id: 'SP-003', supplierId: 'SUP-003', skuId: 'sku-aria-01', price: 55000, currency: 'IDR', unit: 'm', moqMm: 45000, validFrom: '2026-08-01', validTo: '2026-11-30' },
    { id: 'SP-004', supplierId: 'SUP-003', skuId: 'sku-aria-02', price: 56000, currency: 'IDR', unit: 'm', moqMm: 45000, validFrom: '2026-09-01', validTo: '2027-01-31' },
    { id: 'SP-005', supplierId: 'SUP-002', partId: 'part-rel-3', price: 52000, currency: 'IDR', unit: 'pcs', moqPcs: 20, validFrom: '2026-06-01', validTo: '2026-12-31' },
    { id: 'SP-006', supplierId: 'SUP-002', partId: 'part-motor', price: 1250000, currency: 'IDR', unit: 'pcs', moqPcs: 5, validFrom: '2026-01-01', validTo: '2026-12-31' },
    { id: 'SP-007', supplierId: 'SUP-004', skuId: 'sku-luna-01', price: 27, currency: 'CNY', unit: 'm', moqMm: 300000, validFrom: '2026-10-01', validTo: '2027-03-31' },
    { id: 'SP-008', supplierId: 'SUP-004', skuId: 'sku-luna-02', price: 27.5, currency: 'CNY', unit: 'm', moqMm: 300000, validFrom: '2026-10-01', validTo: '2027-03-31' },
    { id: 'SP-009', supplierId: 'SUP-002', partId: 'part-rel-4', price: 64000, currency: 'IDR', unit: 'pcs', moqPcs: 20, validFrom: '2026-06-01', validTo: '2026-12-31' },
    { id: 'SP-010', supplierId: 'SUP-002', partId: 'part-runner', price: 6500, currency: 'IDR', unit: 'pcs', moqPcs: 50, validFrom: '2026-06-01', validTo: '2026-12-31' },
    { id: 'SP-011', supplierId: 'SUP-002', partId: 'part-bracket', price: 14000, currency: 'IDR', unit: 'pcs', moqPcs: 24, validFrom: '2026-06-01', validTo: '2026-12-31' },
    { id: 'SP-012', supplierId: 'SUP-002', partId: 'part-bracket-set', price: 90000, currency: 'IDR', unit: 'pcs', moqPcs: 12, validFrom: '2026-09-01', validTo: '2027-01-31' },
    { id: 'SP-013', supplierId: 'SUP-002', partId: 'part-hook', price: 1500, currency: 'IDR', unit: 'pcs', moqPcs: 100, validFrom: '2026-06-01', validTo: '2026-12-31' },
    { id: 'SP-014', supplierId: 'SUP-002', partId: 'part-ring', price: 2200, currency: 'IDR', unit: 'pcs', moqPcs: 100, validFrom: '2026-06-01', validTo: '2026-12-31' },
    { id: 'SP-015', supplierId: 'SUP-002', partId: 'part-endcap', price: 2000, currency: 'IDR', unit: 'pcs', moqPcs: 50, validFrom: '2026-06-01', validTo: '2026-12-31' },
    { id: 'SP-016', supplierId: 'SUP-002', partId: 'part-remote', price: 210000, currency: 'IDR', unit: 'pcs', moqPcs: 6, validFrom: '2026-06-01', validTo: '2026-12-31' },
    { id: 'SP-017', supplierId: 'SUP-003', skuId: 'sku-nova-01', price: 82000, currency: 'IDR', unit: 'm', moqMm: 30000, validFrom: '2026-08-01', validTo: '2027-02-28' },
    { id: 'SP-018', supplierId: 'SUP-003', skuId: 'sku-nova-02', price: 82000, currency: 'IDR', unit: 'm', moqMm: 30000, validFrom: '2026-08-01', validTo: '2027-02-28' },
    { id: 'SP-019', supplierId: 'SUP-001', skuId: 'sku-luna-01', price: 69500, currency: 'IDR', unit: 'm', moqMm: 60000, validFrom: '2026-10-15', validTo: '2027-03-31', notes: 'Kenaikan harga Oktober.' },
    { id: 'SP-020', supplierId: 'SUP-001', skuId: 'sku-luna-02', price: 70000, currency: 'IDR', unit: 'm', moqMm: 60000, validFrom: '2026-10-15', validTo: '2027-03-31', notes: 'Kenaikan harga Oktober.' },
  );

  db.fxRates.push(
    { id: 'FX-0003', currency: 'CNY', rate: 2238, asOf: '2026-09-01T09:00:00+07:00', source: 'Bank Indonesia (demo)', createdAt: '2026-09-01T09:00:00+07:00', createdBy: 'Sistem' },
    { id: 'FX-0002', currency: 'CNY', rate: 2250, asOf: '2026-10-30T09:00:00+07:00', source: 'Bank Indonesia (demo)', createdAt: '2026-10-30T09:00:00+07:00', createdBy: 'Sistem' },
    { id: 'FX-0001', currency: 'CNY', rate: 2250, asOf: '2026-11-06T09:00:00+07:00', source: 'Bank Indonesia (demo)', createdAt: '2026-11-06T09:00:00+07:00', createdBy: 'Sistem' },
  );
  db.sequences.supplierPrice = db.supplierPrices.length;
  db.sequences.fxRate = db.fxRates.length;

  /* ------------------------------------------------------------- customers */
  const c1 = createCustomer(db, { name: 'Hotel Arunika', company: 'PT Arunika Hospitality', phone: '0812-1000-2001', email: 'procurement@arunika.co.id', address: 'Jl. Sudirman 210', city: 'Jakarta', stage: 'negosiasi', nextAction: 'Konfirmasi warna final 24 kamar', followUpDate: '2026-11-10', notes: 'Proyek renovasi sayap timur.' }, sales);
  const c2 = createCustomer(db, { name: 'Sari Wijaya', company: 'Rumah pribadi', phone: '0813-2000-3002', email: 'sari.wijaya@mail.id', address: 'Jl. Kemang Selatan 8', city: 'Jakarta', stage: 'pelanggan', nextAction: 'Jadwalkan survei ukur', followUpDate: '2026-11-08', notes: 'Preferensi warna netral.' }, sales);
  const c3 = createCustomer(db, { name: 'Graha Nusantara', company: 'PT Graha Nusantara', phone: '021-3000-4003', email: 'facility@grahanusantara.co.id', address: 'Jl. Gatot Subroto 55', city: 'Jakarta', stage: 'pelanggan', nextAction: 'Kirim sample Aria-02', followUpDate: '2026-11-12' }, sales);
  const c4 = createCustomer(db, { name: 'Klinik Sehat Bersama', company: 'Yayasan Sehat Bersama', phone: '0821-4000-5004', email: 'admin@sehatbersama.id', address: 'Jl. Raya Bogor 77', city: 'Depok', stage: 'sample', nextAction: 'Tunggu keputusan sample Nova', followUpDate: '2026-11-14' }, sales);
  const c5 = createCustomer(db, { name: 'Butik Melati', company: 'Butik Melati', phone: '0857-5000-6005', email: 'hello@butikmelati.id', address: 'Jl. Braga 20', city: 'Bandung', stage: 'dormant', nextAction: 'Reaktivasi Q1 2027', followUpDate: '2027-01-15', notes: 'Terakhir beli Februari 2026.' }, sales);

  /* ----------------------------------------------------------- parts stock */
  addParts(db, 'part-rel-3', 'wh-jkt', 40);
  addParts(db, 'part-hook', 'wh-jkt', 200);
  addParts(db, 'part-remote', 'wh-jkt', 6);
  addParts(db, 'part-bracket', 'wh-jkt', 30);
  addParts(db, 'part-bracket-set', 'wh-jkt', 15);
  addParts(db, 'part-runner', 'wh-jkt', 60);
  addParts(db, 'part-rel-4', 'wh-jkt', 6);
  addParts(db, 'part-motor', 'wh-jkt', 2);
  addParts(db, 'part-ring', 'wh-jkt', 120);
  addParts(db, 'part-endcap', 'wh-jkt', 30);
  addParts(db, 'part-rel-3', 'wh-bdg', 12);
  addParts(db, 'part-runner', 'wh-bdg', 20);
  addParts(db, 'part-rel-4', 'wh-sby', 10);
  addParts(db, 'part-motor', 'wh-sby', 3);
  addParts(db, 'part-remote', 'wh-sby', 4);

  /* -------------------------------------------------------- opening rolls */
  addRoll(db, { skuId: 'sku-luna-01', warehouseId: 'wh-jkt', lot: 'LOT-2608-A', receivedAt: '2026-08-12', receiptRef: 'GR-AWAL-01', lenM: 60, bin: 'A-01-01', costPerM: 68000 });
  addRoll(db, { skuId: 'sku-luna-01', warehouseId: 'wh-jkt', lot: 'LOT-2608-A', receivedAt: '2026-08-12', receiptRef: 'GR-AWAL-01', lenM: 61.2, bin: 'A-01-02', costPerM: 68000 });
  addRoll(db, { skuId: 'sku-luna-01', warehouseId: 'wh-jkt', lot: 'LOT-2610-B', receivedAt: '2026-10-03', receiptRef: 'GR-AWAL-03', lenM: 63, bin: 'A-02-01', costPerM: 68500 });
  addRoll(db, { skuId: 'sku-luna-01', warehouseId: 'wh-bdg', lot: 'LOT-2609-C', receivedAt: '2026-09-19', receiptRef: 'GR-AWAL-02', lenM: 70, bin: 'B-01-01', costPerM: 68000 });
  addRoll(db, { skuId: 'sku-luna-01', warehouseId: 'wh-sby', lot: 'LOT-2609-D', receivedAt: '2026-09-22', receiptRef: 'GR-AWAL-04', lenM: 70, bin: 'C-01-01', costPerM: 68000 });
  addRoll(db, { skuId: 'sku-luna-02', warehouseId: 'wh-jkt', lot: 'LOT-2608-A', receivedAt: '2026-08-12', receiptRef: 'GR-AWAL-01', lenM: 70, bin: 'A-01-03', costPerM: 68500 });
  addRoll(db, { skuId: 'sku-luna-02', warehouseId: 'wh-jkt', lot: 'LOT-2610-B', receivedAt: '2026-10-03', receiptRef: 'GR-AWAL-03', lenM: 70, bin: 'A-01-04', costPerM: 68500 });
  addRoll(db, { skuId: 'sku-luna-02', warehouseId: 'wh-jkt', lot: 'LOT-2610-B', receivedAt: '2026-10-03', receiptRef: 'GR-AWAL-03', lenM: 63, bin: 'A-02-02', costPerM: 68500 });
  addRoll(db, { skuId: 'sku-luna-02', warehouseId: 'wh-bdg', lot: 'LOT-2609-C', receivedAt: '2026-09-19', receiptRef: 'GR-AWAL-02', lenM: 50.3, bin: 'B-01-02', costPerM: 68500 });
  addRoll(db, { skuId: 'sku-luna-02', warehouseId: 'wh-sby', lot: 'LOT-2609-D', receivedAt: '2026-09-22', receiptRef: 'GR-AWAL-04', lenM: 80, bin: 'C-01-02', costPerM: 68500 });
  addRoll(db, { skuId: 'sku-aria-01', warehouseId: 'wh-jkt', lot: 'LOT-2609-E', receivedAt: '2026-09-25', receiptRef: 'GR-AWAL-05', lenM: 80, bin: 'A-03-01', costPerM: 55000 });
  addRoll(db, { skuId: 'sku-aria-01', warehouseId: 'wh-bdg', lot: 'LOT-2609-E', receivedAt: '2026-09-25', receiptRef: 'GR-AWAL-05', lenM: 45, bin: 'B-02-01', costPerM: 55000 });
  addRoll(db, { skuId: 'sku-aria-02', warehouseId: 'wh-jkt', lot: 'LOT-2610-F', receivedAt: '2026-10-06', receiptRef: 'GR-AWAL-06', lenM: 90, bin: 'A-03-02', costPerM: 56000 });
  addRoll(db, { skuId: 'sku-nova-01', warehouseId: 'wh-jkt', lot: 'LOT-2608-G', receivedAt: '2026-08-20', receiptRef: 'GR-AWAL-07', lenM: 55, bin: 'A-04-01', costPerM: 82000 });
  addRoll(db, { skuId: 'sku-nova-01', warehouseId: 'wh-sby', lot: 'LOT-2608-G', receivedAt: '2026-08-20', receiptRef: 'GR-AWAL-07', lenM: 40, bin: 'C-02-01', costPerM: 82000 });
  addRoll(db, { skuId: 'sku-nova-02', warehouseId: 'wh-sby', lot: 'LOT-2602-H', receivedAt: '2026-02-11', receiptRef: 'GR-AWAL-08', lenM: 25, bin: 'C-02-02', costPerM: 82000, condition: 'minor_defect' });

  const roll = (n) => `RL-${String(n).padStart(4, '0')}`;

  /* ------------------------------------------------------------- projects */
  const p1 = createProject(db, {
    customerId: c1.id,
    name: 'Hotel Arunika — 24 kamar',
    location: 'Jakarta, Sudirman',
    targetDate: '2026-11-20',
    notes: 'Warna final menunggu approval interior.',
    instructions: 'Potong kelipatan 2,4 m. Beri label per kamar 101–124.',
    user: sales,
    requirements: [
      { kind: 'fabric', skuId: 'sku-luna-01', qtyMm: 12000, allocations: [{ rollId: roll(2), qtyMm: 12000 }] },
      { kind: 'part', partId: 'part-rel-3', qtyPcs: 6, warehouseId: 'wh-jkt' },
      { kind: 'part', partId: 'part-hook', qtyPcs: 24, warehouseId: 'wh-jkt' },
    ],
  });
  reserveProject(db, { id: p1.id, user: sales });

  const p2 = createProject(db, {
    customerId: c2.id,
    name: 'Rumah Sari Wijaya — ruang tamu',
    location: 'Jakarta, Kemang',
    targetDate: '2026-11-15',
    notes: 'Butuh 25 m Luna-02; alokasi baru 10 m dari RL-0006.',
    instructions: 'Lipat 2,5x. Packing gulung, jangan dilipat.',
    user: sales,
    requirements: [
      { kind: 'fabric', skuId: 'sku-luna-02', qtyMm: 25000, allocations: [{ rollId: roll(6), qtyMm: 10000 }] },
      { kind: 'part', partId: 'part-ring', qtyPcs: 10, warehouseId: 'wh-jkt' },
    ],
  });

  const p3 = createProject(db, {
    customerId: c3.id,
    name: 'Kantor Graha Nusantara — lantai 5',
    location: 'Jakarta, Gatot Subroto',
    targetDate: '2026-10-30',
    notes: 'Sudah difakturkan dan diserahterimakan.',
    user: sales,
    requirements: [
      { kind: 'fabric', skuId: 'sku-aria-01', qtyMm: 20000, allocations: [{ rollId: roll(11), qtyMm: 20000 }] },
      { kind: 'part', partId: 'part-bracket', qtyPcs: 8, warehouseId: 'wh-jkt' },
    ],
  });
  reserveProject(db, { id: p3.id, user: sales });

  /* ------------------------------------------------------------- invoices */
  const invNova = createInvoice(db, {
    customerId: c4.id,
    date: '2026-09-25',
    dueDays: 14,
    lines: [
      { kind: 'fabric', rollId: roll(14), qtyMm: 8000, unitPrice: 149000 },
      { kind: 'part', partId: 'part-runner', qtyPcs: 10, warehouseId: 'wh-jkt' },
    ],
    user: sales,
    notes: 'Ruang tunggu dan loket.',
  });
  postInvoice(db, { id: invNova.id, user: sales });
  recordPayment(db, { invoiceId: invNova.id, amount: 500000, method: 'transfer', reference: 'MDR-2509', date: '2026-10-02', user: sales });

  const invGraha = createInvoice(db, {
    customerId: c3.id,
    date: '2026-10-05',
    dueDays: 14,
    lines: [
      { kind: 'fabric', rollId: roll(11), qtyMm: 12000, unitPrice: 99000 },
      { kind: 'part', partId: 'part-remote', qtyPcs: 1, warehouseId: 'wh-jkt' },
    ],
    user: sales,
    notes: 'Pilot lantai 5.',
  });
  postInvoice(db, { id: invGraha.id, user: sales });

  const invRumah = createInvoice(db, {
    customerId: c2.id,
    date: '2026-10-20',
    dueDays: 14,
    lines: [
      { kind: 'fabric', rollId: roll(6), qtyMm: 18000, unitPrice: 125000 },
      { kind: 'part', partId: 'part-rel-3', qtyPcs: 4, warehouseId: 'wh-jkt' },
      { kind: 'part', partId: 'part-hook', qtyPcs: 12, warehouseId: 'wh-jkt' },
    ],
    user: sales,
    notes: 'Ruang tamu dan kamar utama.',
  });
  postInvoice(db, { id: invRumah.id, user: sales });
  recordPayment(db, { invoiceId: invRumah.id, amount: 1000000, method: 'transfer', reference: 'BCA-2010', date: '2026-10-28', user: sales });

  // Project issue is the single stock event; handover is status-only.
  issueProject(db, { id: p3.id, user: sales, dueDays: 14 });
  handoverProject(db, { id: p3.id, user: op, note: 'Diserahkan ke PIC gedung, tanda terima terlampir.' });

  /* ------------------------------------------------------- samples & DP */
  const smp1 = createSample(db, { customerId: c2.id, skuId: 'sku-luna-02', rollId: roll(6), qtyMm: 500, mode: 'free', date: '2026-10-08', user: sales, notes: 'Sample untuk ruang tamu.' });
  const smp2 = createSample(db, { customerId: c3.id, skuId: 'sku-aria-01', rollId: roll(11), qtyMm: 500, mode: 'deposit', amount: 300000, date: '2026-10-01', user: sales, notes: 'Sample deposit, refund setelah pembelian.' });
  createSample(db, { customerId: c4.id, skuId: 'sku-nova-01', rollId: roll(14), qtyMm: 500, mode: 'free', date: '2026-10-12', user: sales });
  createSample(db, { customerId: c1.id, skuId: 'sku-luna-02', rollId: roll(7), qtyMm: 500, mode: 'free', date: '2026-10-25', user: sales });

  linkSampleToInvoice(db, { sampleId: smp1.id, invoiceId: invRumah.id, user: sales });
  linkSampleToInvoice(db, { sampleId: smp2.id, invoiceId: invGraha.id, user: sales });
  const sampleDeposit = db.deposits.find((d) => d.sampleId === smp2.id);
  if (sampleDeposit) {
    refundDeposit(db, {
      depositId: sampleDeposit.id,
      amount: 300000,
      reason: 'Pembelian Aria-01 terkonfirmasi (INV terkait).',
      user: mgr,
      date: '2026-10-20',
    });
  }

  const indent = createDeposit(db, { customerId: c1.id, kind: 'indent', amount: 5000000, date: '2026-10-30', note: 'DP indent Luna-02 untuk 24 kamar.', user: sales });
  const deposit2 = createDeposit(db, { customerId: c3.id, kind: 'indent', amount: 2000000, date: '2026-09-28', note: 'Deposit proyek lantai 5.', user: sales });

  // Apply half of Graha's deposit to the pilot invoice, pay the rest.
  applyDepositToInvoice(db, { depositId: deposit2.id, invoiceId: invGraha.id, amount: 1000000, user: mgr });
  const remaining = invGraha.total - 1000000;
  if (remaining > 0) {
    recordPayment(db, { invoiceId: invGraha.id, amount: remaining, method: 'transfer', reference: 'BNI-0510', date: '2026-10-10', user: sales });
  }

  /* --------------------------------------------------------- sales orders */
  createSalesOrder(db, {
    customerId: c1.id,
    date: '2026-11-06',
    lines: [{ kind: 'fabric', rollId: roll(7), qtyMm: 20000, unitPrice: 125000 }],
    notes: 'Menunggu konfirmasi warna final 24 kamar.',
    user: sales,
  });
  const so2 = createSalesOrder(db, {
    customerId: c4.id,
    date: '2026-11-07',
    lines: [
      { kind: 'fabric', rollId: roll(14), qtyMm: 10000, unitPrice: 149000 },
      { kind: 'part', partId: 'part-runner', qtyPcs: 6, unitPrice: 12000, warehouseId: 'wh-jkt' },
    ],
    notes: 'Pesanan ruang tunggu; siap difakturkan.',
    user: sales,
  });
  confirmOrder(db, { id: so2.id, user: sales });

  /* ------------------------------------------------------------ transfers */
  const t1 = createTransfer(db, {
    fromWarehouseId: 'wh-jkt',
    toWarehouseId: 'wh-bdg',
    neededBy: '2026-11-09',
    reason: 'Permintaan customer Bandung — Luna-01 untuk 6 jendela.',
    lines: [{ skuId: 'sku-luna-01', requestedMm: 15000 }],
    user: op,
  });
  submitTransfer(db, { id: t1.id, user: op });
  approveTransfer(db, { id: t1.id, user: mgr, note: 'Disetujui, cek warna saat kirim.' });
  dispatchLine(db, {
    transferId: t1.id,
    lineId: t1.lines[0].id,
    allocations: [{ rollId: roll(3), qtyMm: 5000 }],
    user: op,
    note: 'Kirim bertahap 5 m dari RL-0003.',
  });
  receiveLine(db, { transferId: t1.id, lineId: t1.lines[0].id, qtyMm: 2000, user: op, note: 'Diterima 2 m; 3 m masih di jalan.' });

  const t2 = createTransfer(db, {
    fromWarehouseId: 'wh-bdg',
    toWarehouseId: 'wh-jkt',
    neededBy: '2026-11-10',
    reason: 'Restock Jakarta untuk indent Hotel Arunika.',
    lines: [{ skuId: 'sku-luna-02', requestedMm: 30000 }],
    user: op,
  });
  submitTransfer(db, { id: t2.id, user: op });

  const t3 = createTransfer(db, {
    fromWarehouseId: 'wh-jkt',
    toWarehouseId: 'wh-sby',
    neededBy: '2026-10-22',
    reason: 'Proyek Graha Nusantara — kebutuhan Surabaya.',
    lines: [{ skuId: 'sku-aria-01', requestedMm: 20000 }],
    user: op,
  });
  submitTransfer(db, { id: t3.id, user: op });
  approveTransfer(db, { id: t3.id, user: mgr });
  dispatchLine(db, { transferId: t3.id, lineId: t3.lines[0].id, allocations: [{ rollId: roll(11), qtyMm: 20000 }], user: op });
  receiveLine(db, { transferId: t3.id, lineId: t3.lines[0].id, qtyMm: 20000, user: op });

  const t4 = createTransfer(db, {
    fromWarehouseId: 'wh-sby',
    toWarehouseId: 'wh-jkt',
    neededBy: '2026-11-12',
    reason: 'Rotasi stok Luna-02 untuk permintaan Jakarta.',
    lines: [{ skuId: 'sku-luna-02', requestedMm: 10000 }],
    user: op,
  });
  submitTransfer(db, { id: t4.id, user: op });
  approveTransfer(db, { id: t4.id, user: mgr });

  /* ----------------------------------------------------------- purchasing */
  const po1 = createPO(db, {
    supplierId: 'SUP-001',
    date: '2026-10-20',
    expectedDate: '2026-11-05',
    termsDays: 30,
    lines: [{ kind: 'fabric', skuId: 'sku-luna-01', qtyMm: 60000, unitPrice: 68000 }],
    note: 'Restock Luna-01, kirim 2 roll.',
    user: op,
  });
  approvePO(db, { id: po1.id, user: mgr });

  const po2 = createPO(db, {
    supplierId: 'SUP-002',
    date: '2026-10-15',
    expectedDate: '2026-10-25',
    termsDays: 30,
    lines: [
      { kind: 'fabric', skuId: 'sku-aria-02', qtyMm: 45000, unitPrice: 56000 },
      { kind: 'part', partId: 'part-ring', qtyPcs: 50, unitPrice: 2200 },
    ],
    note: 'Aria-02 untuk Graha, plus ring.',
    user: op,
  });
  approvePO(db, { id: po2.id, user: mgr });
  receivePO(db, {
    poId: po2.id,
    ref: 'GR-2026-014',
    date: '2026-10-28',
    warehouseId: 'wh-jkt',
    lines: [
      { poLineId: po2.lines[0].id, lots: [{ lot: 'LOT-2610-F2', lengthsMm: [30000, 15000] }] },
      { poLineId: po2.lines[1].id, qtyPcs: 50 },
    ],
    user: op,
    note: 'Diterima lengkap, roll utuh.',
  });

  createPO(db, {
    supplierId: 'SUP-003',
    date: '2026-11-03',
    expectedDate: '2026-11-17',
    lines: [{ kind: 'fabric', skuId: 'sku-nova-01', qtyMm: 30000, unitPrice: 82000 }],
    note: 'Draf restock Nova-01.',
    user: sales,
  });

  const bill = db.supplierInvoices[0];
  if (bill) paySupplierInvoice(db, { id: bill.id, amount: 1000000, method: 'transfer', reference: 'BCA-2810', user: mgr });

  /* -------------------------------------------------------- import supplier */
  const poCn = createPO(db, {
    supplierId: 'SUP-004',
    date: '2026-10-10',
    expectedDate: '2026-11-25',
    termsDays: 45,
    lines: [
      { kind: 'fabric', skuId: 'sku-luna-01', qtyMm: 300000, unitPrice: 27 },
      { kind: 'fabric', skuId: 'sku-luna-02', qtyMm: 120000, unitPrice: 27.5 },
    ],
    note: 'Impor Luna dari Ningbo — FOB, kurs 2.250.',
    user: op,
  });
  approvePO(db, { id: poCn.id, user: mgr });
  const ship1 = createShipment(db, {
    poId: poCn.id,
    mode: 'sea',
    reference: 'MSCU-7788123',
    container: 'MSCU 1234567',
    etd: '2026-10-18',
    eta: '2026-11-25',
    costs: { freightIdr: 4500000, insuranceIdr: 600000, dutyIdr: 1800000, otherIdr: 300000 },
    notes: 'FOB Ningbo, 1×40HC. Dokumen BL/CI/PL menyusul.',
    user: op,
  });
  updateShipmentStatus(db, { id: ship1.id, status: 'in_transit', date: '2026-10-18', note: 'Berangkat dari Ningbo.', location: 'Laut China Selatan', user: op });

  const poCn2 = createPO(db, {
    supplierId: 'SUP-004',
    date: '2026-09-01',
    expectedDate: '2026-10-15',
    termsDays: 45,
    lines: [{ kind: 'fabric', skuId: 'sku-luna-02', qtyMm: 100000, unitPrice: 27.5 }],
    note: 'Impor contoh yang sudah diterima — untuk landed COGS.',
    user: op,
  });
  approvePO(db, { id: poCn2.id, user: mgr });
  const ship2 = createShipment(db, {
    poId: poCn2.id,
    mode: 'sea',
    reference: 'COSU-5511900',
    container: 'COSU 9988776',
    etd: '2026-09-12',
    eta: '2026-10-18',
    costs: { freightIdr: 800000, insuranceIdr: 100000, dutyIdr: 100000, otherIdr: 0 },
    notes: 'Landed cost dialokasikan ke harga pokok roll.',
    user: op,
  });
  updateShipmentStatus(db, { id: ship2.id, status: 'received', date: '2026-10-18', note: 'Diterima di Gudang Jakarta.', location: 'Tanjung Priok', user: op });
  const { receipt: cnReceipt } = receivePO(db, {
    poId: poCn2.id,
    ref: 'GR-IMP-001',
    date: '2026-10-20',
    warehouseId: 'wh-jkt',
    lines: [{ poLineId: poCn2.lines[0].id, lots: [{ lot: 'LOT-CN-01', lengthsMm: [50000, 50000] }] }],
    user: op,
    note: 'Impor diterima; landed cost masuk HPP.',
  });
  const cnBill = db.supplierInvoices.find((b) => b.poId === poCn2.id);
  if (cnBill) paySupplierInvoice(db, { id: cnBill.id, amount: 2250000, amountForeign: 1000, method: 'transfer', reference: 'TT-CNY-1000', user: mgr });

  /* --------------------------------------------------------------- tasks */
  const taskCut = createTask(db, {
    type: 'cutting', title: 'Potong 10 m Luna-01 untuk ruang tamu', warehouseId: 'wh-jkt',
    assigneeId: 'u-op', priority: 'high', dueDate: '2026-11-08', projectId: p2.id, rollId: roll(1), qtyMm: 10000,
    notes: 'Cek lot dan arah motif sebelum potong. Sisa roll 50 m.', user: sales,
  });
  startTask(db, { id: taskCut.id, user: op });

  createTask(db, {
    type: 'receive', title: 'Terima PO-0001 — Luna-01 60 m', warehouseId: 'wh-jkt',
    assigneeId: 'u-op', priority: 'normal', dueDate: '2026-11-09', notes: 'Periksa dua roll dan lot.', user: mgr,
  });
  createTask(db, {
    type: 'picking', title: 'Siapkan kiriman TRF-0001 ke Bandung', warehouseId: 'wh-jkt',
    assigneeId: 'u-op', priority: 'urgent', dueDate: '2026-11-08', notes: 'Sisa 10 m belum dikirim.', user: mgr,
  });
  const shipTask = createTask(db, {
    type: 'shipment', title: 'Pantau impor MSCU-7788123', warehouseId: 'wh-jkt',
    assigneeId: 'u-op', priority: 'high', dueDate: '2026-11-25', notes: 'ETA 25 Nov; siapkan bea cukai.', user: mgr,
  });
  startTask(db, { id: shipTask.id, user: op });
  createTask(db, {
    type: 'sample', title: 'Kirim sample Nova ke Klinik Sehat', warehouseId: 'wh-jkt',
    assigneeId: 'u-sales', priority: 'normal', dueDate: '2026-11-10', notes: '0,5 m dari RL-0014.', user: sales,
  });
  const qc = createTask(db, {
    type: 'qc', title: 'QC hasil potong Aria-01', warehouseId: 'wh-jkt',
    assigneeId: 'u-op', priority: 'normal', dueDate: '2026-11-05', notes: 'Periksa tepi dan panjang.', user: mgr,
  });
  startTask(db, { id: qc.id, user: op });
  completeTask(db, { id: qc.id, note: 'Lolos QC; tepi rapi.', user: op });

  /* ------------------------------------------------------------ production */
  const wo1 = createProductionOrder(db, {
    customerId: c4.id,
    warehouseId: 'wh-jkt',
    targetDate: '2026-11-15',
    notes: 'Panel jendela ruang tunggu, jahit keliling.',
    lines: [{ rollId: roll(13), qtyMm: 12000, pieceLengthMm: 2400 }],
    user: sales,
  });
  releaseOrder(db, { id: wo1.id, user: op });
  cutOrder(db, { id: wo1.id, user: op });
  const wo1Pieces = db.productionPieces.filter((p) => p.orderId === wo1.id);
  wo1Pieces.slice(0, 3).forEach((piece) => sewPiece(db, { pieceId: piece.id, workerId: 'u-op', user: op }));
  qcPiece(db, { pieceId: wo1Pieces[0].id, pass: true, note: 'Jahitan rapi, ukuran sesuai.', user: op });
  qcPiece(db, { pieceId: wo1Pieces[1].id, pass: false, note: 'Sisi kiri melengkung 5 mm.', user: op });

  createProductionOrder(db, {
    customerId: c4.id,
    warehouseId: 'wh-jkt',
    targetDate: '2026-11-20',
    notes: 'Panel blackout tambahan, menunggu rilis.',
    lines: [{ rollId: roll(14), qtyMm: 8000, pieceLengthMm: 2000 }],
    user: sales,
  });

  /* ------------------------------------------------------ customer return */
  const invRumahLine = invRumah.lines.find((l) => l.kind === 'fabric');
  const ret = createCustomerReturn(db, {
    invoiceId: invRumah.id,
    lines: [{ lineId: invRumahLine.id, qtyMm: 2000, condition: 'good' }],
    reason: 'Kelebihan potong 2 m, dikembalikan ke gudang.',
    user: sales,
    date: '2026-11-01',
  });
  postCustomerReturn(db, { id: ret.id, user: mgr, disposition: 'quarantine' });

  /* ------------------------------------------------ historical stock opname */
  const session = startOpname(db, { warehouseId: 'wh-sby', user: op, note: 'Opname bulanan Oktober.' });
  const counts = session.lines.map((l) => ({
    rollId: l.rollId,
    countedMm: l.rollId === roll(15) ? l.expectedMm - 500 : l.expectedMm,
  }));
  saveCounts(db, { sessionId: session.id, counts, user: op });
  submitOpname(db, { sessionId: session.id, user: op });
  approveOpname(db, { sessionId: session.id, user: mgr, reason: 'Selisih 0,5 m pada RL-0015; kain sobek saat handling, disetujui.' });

  c1.stage = 'negosiasi';
  c3.stage = 'pelanggan';
  c4.stage = 'sample';

  db.meta.today = todayJakarta();
  db.meta.seedRefs = {
    criticalTransfer: t1.id,
    reservedProject: p1.id,
    issuedProject: p3.id,
    indentDeposit: indent.id,
  };
  return db;
}

export default buildSeed;
