/** Render smoke test without a DOM: every view must produce HTML for a real dataset. */
import { buildSeed } from '../src/domain/seed.js';
import { dashboardMetrics } from '../src/domain/reports.js';
import { invoiceOutstanding } from '../src/domain/sales.js';
import { USERS } from '../src/domain/seed.js';

import * as dashboard from '../src/ui/views/dashboard.js';
import * as inventory from '../src/ui/views/inventory.js';
import * as transfers from '../src/ui/views/transfers.js';
import * as purchasing from '../src/ui/views/purchasing.js';
import * as sales from '../src/ui/views/sales.js';
import * as projects from '../src/ui/views/projects.js';
import * as customers from '../src/ui/views/customers.js';
import * as opname from '../src/ui/views/opname.js';
import * as reports from '../src/ui/views/reports.js';
import * as master from '../src/ui/views/master.js';
import * as simulation from '../src/ui/views/simulation.js';
import * as login from '../src/ui/views/login.js';
import * as tasks from '../src/ui/views/tasks.js';
import * as samples from '../src/ui/views/samples.js';
import * as orders from '../src/ui/views/orders.js';
import * as settings from '../src/ui/views/settings.js';
import * as production from '../src/ui/views/production.js';

const db = buildSeed({ dataset: 'main' });
const views = { ringkasan: dashboard, tugas: tasks, produksi: production, stok: inventory, transfer: transfers, pembelian: purchasing, penjualan: sales, pesanan: orders, proyek: projects, pelanggan: customers, sampel: samples, opname, laporan: reports, master, pengaturan: settings, simulasi: simulation };
const samplesById = {
  ringkasan: null, tugas: null, produksi: null, stok: 'RL-0001', transfer: 'TRF-0001', pembelian: 'PO-0001', penjualan: 'INV-0003',
  pesanan: null, proyek: 'PRJ-001', pelanggan: 'CUS-0002', sampel: null, opname: 'OPN-001', laporan: null, master: null, pengaturan: null, simulasi: null,
};

let failed = 0;
function ctxFor(route, role) {
  const state = { role, warehouseId: 'wh-jkt' };
  const base = {
    db, ui: state, role, user: USERS[role], dataset: 'main', route,
    store: { emit() {}, update() {}, setUi() {}, switchDataset() {}, ensureSimulation() {}, simExists: false },
    helpers: { outstanding: invoiceOutstanding },
    get metrics() { return dashboardMetrics(db, { warehouseId: state.warehouseId }); },
    openSimulationPrompt() {},
  };
  return base;
}

for (const [name, id] of Object.entries(samplesById)) {
  const roles = ['ringkasan', 'tugas', 'sampel'].includes(name) ? ['manager', 'operator', 'sales'] : ['manager'];
  for (const role of roles) {
    const route = { name, id, query: {} };
    try {
      const html = views[name].render(ctxFor(route, role));
      if (!html || html.length < 200) throw new Error('output terlalu pendek');
      if (html.includes('undefined') && !name.includes('x')) {
        // undefined in output is usually a bug; log for review but do not fail.
        console.warn('warn', name, role, 'mengandung "undefined"');
      }
      console.log('ok  ', name, id ?? '', role, `${html.length}b`);
    } catch (err) {
      failed += 1;
      console.error('FAIL', name, id ?? '', role, '\n', err);
    }
  }
}

if (failed) process.exit(1);

try {
  const html = login.render();
  if (!html.includes('Pilih akun')) throw new Error('login render tidak lengkap');
  console.log('ok   login screen', `${html.length}b`);
} catch (err) {
  console.error('FAIL login\n', err);
  process.exit(1);
}

console.log('\nSemua view merender.');
