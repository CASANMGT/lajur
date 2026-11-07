/** Hash router + error boundary. */

import store, { storage } from '../data/store.js';
import { ROLE_HOME, ensureAccounts, sessionUser } from '../data/auth.js';
import { dashboardMetrics } from '../domain/reports.js';
import { invoiceOutstanding } from '../domain/sales.js';
import { renderShell, mountShell, ROUTE_META } from './shell.js';
import { icon, toast, closeModal } from './dom.js';
import * as login from './views/login.js';
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

function ctxFor(route, user = sessionUser()) {
  const state = store.state;
  const role = user.role;
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
    openSimulationPrompt: () => simulation.openSimulationPrompt(ctxFor(route, user)),
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
  const app = document.getElementById('app');
  const user = sessionUser();

  if (!user) {
    closeModal();
    try {
      app.innerHTML = login.render();
      login.mount({
        onAuthenticated: (u) => {
          store.setUi({ role: u.role }, { rerender: false });
          const home = ROLE_HOME[u.role] ?? '#/ringkasan';
          if (window.location.hash === home) renderApp();
          else window.location.hash = home;
        },
      });
      document.title = 'Masuk — Lajur';
    } catch (err) {
      console.error(err);
      app.innerHTML = `<div class="content">${errorPanel(err)}</div>`;
    }
    return;
  }

  const route = parseHash();
  const activeWh = store.db.warehouses.filter((w) => w.active !== false);
  if (store.ui.warehouseId !== 'all' && !activeWh.some((w) => w.id === store.ui.warehouseId)) {
    store.setUi({ warehouseId: activeWh[0]?.id ?? 'all' }, { rerender: false });
  }
  const ctx = ctxFor(route, user);
  const view = VIEWS[route.name];

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
}

export function go(hash) {
  if (window.location.hash === hash) {
    renderApp();
    return;
  }
  window.location.hash = hash;
}

export async function start() {
  store.init();
  await ensureAccounts();
  if (!window.location.hash) window.location.hash = '#/ringkasan';
  const user = sessionUser();
  if (user) store.setUi({ role: user.role }, { rerender: false });
  store.subscribe(() => renderApp());
  window.addEventListener('hashchange', () => {
    renderApp();
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
  window.setInterval(() => {
    if (!sessionUser() && !document.querySelector('.auth-screen')) renderApp();
  }, 60_000);
  renderApp();

  if (storage.lastError) {
    toast('Penyimpanan lokal penuh atau diblokir. Perubahan hanya bertahan selama tab terbuka.', { tone: 'error', title: 'Penyimpanan' });
  }
  if (!store.state.db.audit?.length && user) {
    toast('Dataset contoh dimuat. Gunakan Simulasi Data untuk mencoba siklus 60 → 10 → 50.', { title: 'Selamat datang di Lajur' });
  }
}

if (typeof window !== 'undefined' && document.getElementById('app')) {
  start();
}
