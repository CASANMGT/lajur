/** Application shell: sidebar, topbar, simulation banner, mobile drawer. */

import { esc, icon, toast } from './dom.js';
import { activeSessions } from '../domain/opname.js';
import { lateTransfers, pendingApprovals } from '../domain/transfers.js';
import { byId } from '../domain/core.js';
import { USERS } from '../domain/seed.js';

export const NAV = [
  {
    group: 'Operasi gudang',
    items: [
      { id: 'ringkasan', label: 'Ringkasan', icon: 'home' },
      { id: 'stok', label: 'Stok & Roll', icon: 'box' },
      { id: 'transfer', label: 'Permintaan Gudang', icon: 'transfer' },
      { id: 'pembelian', label: 'Pembelian', icon: 'truck' },
      { id: 'opname', label: 'Stock Opname', icon: 'clipboard' },
    ],
  },
  {
    group: 'Komersial',
    items: [
      { id: 'penjualan', label: 'Penjualan', icon: 'receipt' },
      { id: 'proyek', label: 'Proyek', icon: 'layers' },
      { id: 'pelanggan', label: 'Pelanggan', icon: 'users' },
    ],
  },
  {
    group: 'Analitik & sistem',
    items: [
      { id: 'laporan', label: 'Laporan', icon: 'chart' },
      { id: 'master', label: 'Master Data', icon: 'settings' },
      { id: 'simulasi', label: 'Simulasi Data', icon: 'flask' },
    ],
  },
];

export const ROUTE_META = {
  ringkasan: { title: 'Ringkasan', sub: 'Kondisi operasi hari ini' },
  stok: { title: 'Stok & Roll', sub: 'Fisik, terpesan, tersedia, karantina, dan transit' },
  transfer: { title: 'Permintaan Gudang', sub: 'PO internal antar gudang — tanpa pemasok' },
  pembelian: { title: 'Pembelian', sub: 'PO pemasok, penerimaan, dan utang' },
  penjualan: { title: 'Penjualan', sub: 'Faktur, pembayaran, dan retur' },
  proyek: { title: 'Proyek', sub: 'Reservasi material sampai serah terima' },
  pelanggan: { title: 'Pelanggan', sub: 'CRM, sample, deposit, dan riwayat' },
  opname: { title: 'Stock Opname', sub: 'Hitung buta, review, dan penyesuaian' },
  laporan: { title: 'Laporan', sub: 'Saldo saat ini dan riwayat — bukan buku besar' },
  master: { title: 'Master Data', sub: 'Produk, kategori, pemasok, dan cadangan data' },
  simulasi: { title: 'Simulasi Data', sub: 'Dataset terpisah untuk uji alur' },
};

const ROLE_LABEL = {
  manager: 'Manajer',
  operator: 'Operator Gudang',
  sales: 'Sales / CS',
};

export function countsFor(db) {
  return {
    transfer: pendingApprovals(db).length + lateTransfers(db).length,
    opname: activeSessions(db).length,
  };
}

export function renderShell(ctx, contentHtml) {
  const { db, ui, role, dataset, simulation } = ctx;
  const counts = countsFor(db);
  const activeWh = ui.warehouseId === 'all' ? null : byId(db.warehouses, ui.warehouseId);
  const navHtml = NAV.map((group) => `
    <nav class="nav-group" aria-label="${esc(group.group)}">
      <span class="nav-label">${esc(group.group)}</span>
      ${group.items.map((item) => {
        const active = ctx.route.name === item.id;
        const count = item.id === 'transfer' ? counts.transfer : item.id === 'opname' ? counts.opname : 0;
        return `<a class="nav-link" href="#/${item.id}" ${active ? 'aria-current="page"' : ''}>
          ${icon(item.icon)}
          <span>${esc(item.label)}</span>
          ${count ? `<span class="nav-count">${count}</span>` : ''}
        </a>`;
      }).join('')}
    </nav>`).join('');

  const banner = dataset === 'sim' ? `
    <div class="sim-banner" role="status">
      ${icon('flask')}
      <div><strong>MODE SIMULASI</strong> — data terpisah; data utama tidak berubah.</div>
      <div class="row">
        <a class="btn btn-sm" href="#/simulasi">Panel simulasi</a>
        <button class="btn btn-sm" type="button" data-action="exit-sim">Kembali ke data utama</button>
      </div>
    </div>` : '';

  return `
    <div class="layout">
      <aside class="sidebar" id="sidebar" aria-label="Navigasi utama">
        <a class="brand" href="#/ringkasan">
          <img src="/assets/lajur-mark.svg" alt="" width="38" height="38" />
          <span class="brand-word"><strong>lajur</strong><span>Gudang tekstil</span></span>
        </a>
        ${navHtml}
        <div class="sidebar-foot">
          <strong>${esc(db.meta.company)}</strong>
          <p>${dataset === 'sim' ? 'Dataset simulasi — aman untuk dicoba.' : 'Demo lokal. Data tersimpan di perangkat ini.'}</p>
        </div>
      </aside>

      <div class="drawer-scrim" id="nav-scrim" hidden></div>

      <div class="main">
        <header class="topbar">
          <button class="hamburger" type="button" data-action="toggle-nav" aria-label="Buka navigasi" aria-expanded="false" aria-controls="sidebar">
            ${icon('menu')}
          </button>
          <div class="topbar-title">
            <strong>${esc(ROUTE_META[ctx.route.name]?.title ?? 'Lajur')}</strong>
            <span>${esc(ROUTE_META[ctx.route.name]?.sub ?? '')}</span>
          </div>
          <div class="topbar-actions">
            <label class="warehouse-pick" title="Gudang aktif">
              ${icon('pin')}
              <select data-action="warehouse-select" aria-label="Pilih gudang">
                ${db.warehouses.map((w) => `<option value="${w.id}" ${ui.warehouseId === w.id ? 'selected' : ''}>${esc(w.code)} · ${esc(w.name.replace('Gudang ', ''))}</option>`).join('')}
                <option value="all" ${ui.warehouseId === 'all' ? 'selected' : ''}>Semua gudang</option>
              </select>
            </label>
            <label class="sr-only" for="role-select">Peran demo</label>
            <select class="role-select" id="role-select" data-action="role-select" title="Peran demo (bukan otorisasi server)">
              ${Object.entries(ROLE_LABEL).map(([key, label]) => `<option value="${key}" ${role === key ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
            <button class="btn ${dataset === 'sim' ? 'btn-copper' : 'btn-navy'} btn-sm hide-sm" type="button" data-action="open-sim">
              ${icon('flask')} ${dataset === 'sim' ? 'Simulasi aktif' : 'Simulasi Data'}
            </button>
            <span class="badge badge-navy no-dot hide-sm" title="Peran demo: ${esc(ROLE_LABEL[role])}">${esc((USERS[role]?.name ?? 'Demo').split(' ')[0])}</span>
          </div>
        </header>
        ${banner}
        <main id="main" class="content" tabindex="-1">
          ${contentHtml}
        </main>
      </div>
    </div>`;
}

export function mountShell(ctx) {
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('nav-scrim');
  const toggle = document.querySelector('[data-action="toggle-nav"]');

  const setNav = (open) => {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    if (scrim) scrim.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) sidebar.querySelector('a, button')?.focus();
    else toggle?.focus();
  };

  toggle?.addEventListener('click', () => setNav(!sidebar.classList.contains('open')));
  scrim?.addEventListener('click', () => setNav(false));
  sidebar?.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => setNav(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar?.classList.contains('open')) setNav(false);
  });

  document.querySelector('[data-action="warehouse-select"]')?.addEventListener('change', (e) => {
    ctx.store.setUi({ warehouseId: e.target.value });
  });
  document.querySelector('[data-action="role-select"]')?.addEventListener('change', (e) => {
    const role = e.target.value;
    ctx.store.setUi({ role });
    toast(`Peran demo: ${ROLE_LABEL[role]}. Tombol mengikuti peran; otorisasi sebenarnya harus di server.`);
  });
  document.querySelectorAll('[data-action="open-sim"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (ctx.dataset === 'sim') window.location.hash = '#/simulasi';
      else ctx.openSimulationPrompt();
    }),
  );
  document.querySelectorAll('[data-action="exit-sim"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      ctx.store.switchDataset('main');
      toast('Kembali ke data utama. Dataset simulasi tetap tersimpan.', { tone: 'success' });
    }),
  );
}
