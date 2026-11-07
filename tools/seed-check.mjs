import { buildSeed } from '../src/domain/seed.js';
import { stockSummary, partQty } from '../src/domain/inventory.js';
import { transferTotals } from '../src/domain/transfers.js';
import { invoiceOutstanding } from '../src/domain/sales.js';
import { dashboardMetrics } from '../src/domain/reports.js';

const db = buildSeed();
console.log('rolls', db.rolls.length, 'invoices', db.invoices.length, 'transfers', db.transfers.length);
const jkt = stockSummary(db, { warehouseId: 'wh-jkt' });
console.log('JKT', (jkt.physicalMm / 1000).toFixed(1), 'm fisik,', (jkt.availableMm / 1000).toFixed(1), 'm tersedia,', (jkt.reservedMm / 1000).toFixed(1), 'm terpesan');
const t = db.transfers.find((x) => x.id === db.meta.seedRefs.criticalTransfer);
console.log('transfer', t.id, t.status, transferTotals(t));
console.log('invoices', db.invoices.map((i) => `${i.id}:${i.total}:${invoiceOutstanding(i)}`).join(' '));
const m = dashboardMetrics(db);
console.log('value', m.inventory.total, 'AR', m.receivables, 'AP', m.payables, 'exceptions', m.exceptions.length);
console.log('parts JKT rel3', partQty(db, 'part-rel-3', 'wh-jkt'));
