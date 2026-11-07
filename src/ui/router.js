/** Hash router + error boundary. */

import store, { storage } from '../data/store.js';
import { USERS } from '../domain/seed.js';
import { dashboardMetrics, exceptionFeed } from '../domain/reports.js';
import { invoiceOutstanding } from '../domain/sales.js';
import { renderShell, mountShell, ROUTE_META } from './shell.js';
import { icon, toast } from './dom.js';
import * as dashboard from './views/dashboard.js';
import * as inventory from './views/inventory.js';
import * as transfers from './views/transfers.js';
import * as purchasing from './views/purchasing.js';
import * as sales from './views/sales.js';
import * as projects from './views/projects.js';
import * as customers from './views/customers.js';
import * as opname from './views/opname.js';
import * as reports from './views/reports.js';
import * as master from './views/master.js';
import * as simulation from './views/simulation.js';

const VIEWS = {
  ringkasan: dashboard,
  stok: inventory,
  transfer: transfers,
  pembelian: purchasing,
  penjualan: sales,
  proyek: projects,
  pelanggan: customers,
  opname,
  laporan: reports,
  master,
  simulasi: simulation,
};

export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#\/?/, '') || 'ringkasan';
  const [path, search = ''] = raw.split('?');
  const [name, id = null] = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(search));
  return { name: VIEWS[name] ? name : 'ringkasan', id, query };
}

function ctxFor(route) {
  const state = store.state;
  const role = state.ui.role;
  const user = USERS[role] ?? USERS.manager;
  const db = store.db;
  return {
    db,
    ui: state.ui,
    role,
    user,
    dataset: state.dataset,
    route,
    store,
    helpers: {
      outstanding: invoiceOutstanding,
    },
    get metrics() {
      return dashboardMetrics(db, { warehouseId: state.ui.warehouseId });
    },
    openSimulationPrompt: () => simulation.openSimulationPrompt(ctxFor(route)),
  };
}

function errorPanel(err) {
  return `
    <div class="error-box" role="alert">
      <h3>Layar gagal dirender</h3>
      <p class="small">${err?.message ?? 'Kesalahan tidak dikenal.'}</p>
      <pre>${String(err?.stack ?? '').slice(0, 600)}</pre>
      <button class="btn btn-sm" type="button" data-action="reload-app" style="margin-top:12px">Muat ulang aplikasi</button>
    </div>`;
}

export function renderApp() {
  const route = parseHash();
  const ctx = ctxFor(route);
  const view = VIEWS[route.name];
  const app = document.getElementById('app');

  let content = '';
  try {
    content = view.render(ctx);
  } catch (err) {
    console.error(err);
    content = errorPanel(err);
  }

  try {
    app.innerHTML = renderShell(ctx, content);
    mountShell(ctx);
    if (!content.startsWith('<div class="error-box"')) view.mount?.(ctx);
    document.title = `${ROUTE_META[route.name]?.title ?? 'Lajur'} — Lajur`;
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="content">${errorPanel(err)}</div>`;
  }

  document.querySelector('[data-action="reload-app"]')?.addEventListener('click', () => window.location.reload());

  // Close any stale modal when the route changes.
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot && modalRoot.innerHTML && !document.querySelector('.modal-wrap [data-keep]')) {
    // Modals opened by a view re-open themselves on mount; leave those alone.
  }
}

export function go(hash) {
  if (window.location.hash === hash) {
    renderApp();
    return;
  }
  window.location.hash = hash;
}

export function start() {
  store.init();
  if (!window.location.hash) window.location.hash = '#/ringkasan';
  store.subscribe(() => renderApp());
  window.addEventListener('hashchange', () => {
    renderApp();
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  });
  renderApp();

  if (storage.lastError) {
    toast('Penyimpanan lokal penuh atau diblokir. Perubahan hanya bertahan selama tab terbuka.', { tone: 'error', title: 'Penyimpanan' });
  }
  if (!store.state.db.audit?.length) {
    toast('Dataset contoh dimuat. Gunakan Simulasi Data untuk mencoba siklus 60 → 10 → 50.', { title: 'Selamat datang di Lajur' });
  }
}

if (typeof window !== 'undefined' && document.getElementById('app')) {
  start();
}
