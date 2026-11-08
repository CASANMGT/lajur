/** Application shell: sidebar, topbar, simulation banner, mobile drawer. */

import { esc, icon, toast, openModal, field, closeModal } from './dom.js';
import { activeSessions } from '../domain/opname.js';
import { lateTransfers, pendingApprovals } from '../domain/transfers.js';
import { byId } from '../domain/core.js';
import { activeWarehouses } from '../domain/master.js';
import { changePin, logout, sessionRemainingMs } from '../data/auth.js';
import { APP_VERSION } from '../version.js';
import { saveSettings, settingsOf } from '../domain/settings.js';
import { ADVANCED_VIEWS, isAdvancedMode, modeLabel } from '../domain/features.js';

export const NAV = [
  {
    group: 'Operasi gudang',
    items: [
      { id: 'ringkasan', label: 'Ringkasan', icon: 'home' },
      { id: 'tugas', label: 'Tugas Operasi', icon: 'listCheck' },
      { id: 'produksi', label: 'Produksi WIP', icon: 'needle' },
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
      { id: 'pesanan', label: 'Pesanan', icon: 'clipboard' },
      { id: 'proyek', label: 'Proyek', icon: 'layers' },
      { id: 'pelanggan', label: 'Pelanggan', icon: 'users' },
      { id: 'sampel', label: 'Sample & Deposit', icon: 'spark' },
    ],
  },
  {
    group: 'Analitik & sistem',
    items: [
      { id: 'laporan', label: 'Laporan', icon: 'chart' },
      { id: 'master', label: 'Master Data', icon: 'settings' },
      { id: 'pengaturan', label: 'Pengaturan', icon: 'userCheck' },
      { id: 'simulasi', label: 'Simulasi Data', icon: 'flask' },
    ],
  },
];

const ACCESS = {
  manager: null,
  operator: new Set(['ringkasan', 'tugas', 'produksi', 'stok', 'transfer', 'pembelian', 'opname', 'simulasi']),
  sales: new Set(['ringkasan', 'tugas', 'stok', 'penjualan', 'pesanan', 'proyek', 'pelanggan', 'sampel', 'simulasi']),
};

export function canAccess(role, view) {
  const set = ACCESS[role];
  return set === null || set === undefined ? true : set.has(view);
}

export const ROUTE_META = {
  ringkasan: { title: 'Ringkasan', sub: 'Kondisi operasi hari ini' },
  tugas: { title: 'Tugas Operasi', sub: 'Antrean potong, terima, picking, QC, dan kirim' },
  produksi: { title: 'Produksi WIP', sub: 'Potong → jahit → QC per piece, payroll, dan kapasitas' },
  stok: { title: 'Stok & Roll', sub: 'Fisik, terpesan, tersedia, karantina, dan transit' },
  transfer: { title: 'Permintaan Gudang', sub: 'PO internal antar gudang — tanpa pemasok' },
  pembelian: { title: 'Pembelian', sub: 'PO pemasok, penerimaan, dan utang' },
  penjualan: { title: 'Penjualan', sub: 'Faktur, pembayaran, dan retur' },
  pesanan: { title: 'Pesanan Penjualan', sub: 'Pesanan sebelum menjadi faktur — stok belum keluar' },
  proyek: { title: 'Proyek', sub: 'Reservasi material sampai serah terima' },
  pelanggan: { title: 'Pelanggan', sub: 'CRM, sample, deposit, dan riwayat' },
  sampel: { title: 'Sample & Deposit', sub: 'Sample pelanggan, konversi, dan saldo deposit' },
  opname: { title: 'Stock Opname', sub: 'Hitung buta, review, dan penyesuaian' },
  laporan: { title: 'Laporan', sub: 'Saldo saat ini dan riwayat — bukan buku besar' },
  master: { title: 'Master Data', sub: 'Produk, kategori, pemasok, dan cadangan data' },
  pengaturan: { title: 'Pengaturan', sub: 'Akun, PIN, pengguna, peran, dan preferensi' },
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
  const prefs = settingsOf(db);
  const advanced = isAdvancedMode(db);
  const counts = countsFor(db);
  const activeWh = ui.warehouseId === 'all' ? null : byId(db.warehouses, ui.warehouseId);
  const navHtml = NAV.map((group) => `
    <nav class="nav-group" aria-label="${esc(group.group)}">
      <span class="nav-label">${esc(group.group)}</span>
      ${group.items.filter((item) => canAccess(role, item.id))
        .filter((item) => !ADVANCED_VIEWS.has(item.id) || advanced)
        .filter((item) => item.id !== 'pesanan' || prefs.salesOrderEnabled)
        .filter((item) => item.id !== 'produksi' || prefs.productionEnabled)
        .map((item) => {
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
        ${advanced ? `<a class="btn btn-sm" href="#/simulasi">Panel simulasi</a>` : ''}
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
          <p class="xs" style="margin-top:6px">v${esc(APP_VERSION)} · ${esc(ROLE_LABEL[role])} · Mode ${esc(modeLabel(db))}</p>
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
            <div class="warehouse-pick" title="Gudang aktif">
              ${icon('pin')}
              <label class="sr-only" for="warehouse-select">Gudang aktif</label>
              <select id="warehouse-select" data-action="warehouse-select">
                ${activeWarehouses(db).map((w) => `<option value="${w.id}" ${ui.warehouseId === w.id ? 'selected' : ''}>${esc(w.code)} · ${esc(w.name.replace('Gudang ', ''))}</option>`).join('')}
                <option value="all" ${ui.warehouseId === 'all' ? 'selected' : ''}>Semua gudang</option>
              </select>
            </div>
            ${role === 'manager' ? `<button class="btn ${advanced ? 'btn-copper' : 'btn-ghost'} btn-sm hide-sm" type="button" data-action="toggle-mode" title="Ganti mode operasi">${icon('layers')} Mode ${esc(modeLabel(db))}</button>` : ''}
            ${advanced ? `<button class="btn ${dataset === 'sim' ? 'btn-copper' : 'btn-navy'} btn-sm hide-sm" type="button" data-action="open-sim">
              ${icon('flask')} ${dataset === 'sim' ? 'Simulasi aktif' : 'Simulasi Data'}
            </button>` : ''}
            <button class="account-btn" type="button" data-action="account" title="Akun ${esc(ctx.user.name)}">
              <span class="avatar">${esc(ctx.user.name.split(' ').slice(0, 2).map((n) => n[0]).join(''))}</span>
              <span class="hide-sm">${esc(ctx.user.name.split(' ')[0])}</span>
            </button>
          </div>
        </header>
        ${banner}
        <main id="main" class="content" tabindex="-1">
          ${contentHtml}
        </main>
        <nav class="bottom-nav" aria-label="Navigasi cepat">
          <a href="#/ringkasan" ${ctx.route.name === 'ringkasan' ? 'aria-current="page"' : ''}>${icon('home')}<span>Beranda</span></a>
          <a href="#/tugas" ${ctx.route.name === 'tugas' ? 'aria-current="page"' : ''}>${icon('listCheck')}<span>Tugas</span></a>
          <a href="#/stok" ${ctx.route.name === 'stok' ? 'aria-current="page"' : ''}>${icon('box')}<span>Stok</span></a>
          <button type="button" data-action="account">${icon('users')}<span>Akun</span></button>
        </nav>
      </div>
    </div>`;
}

function openAccount(ctx) {
  const user = ctx.user;
  const mins = Math.max(0, Math.round(sessionRemainingMs() / 60000));
  openModal({
    title: 'Akun & keamanan',
    description: 'PIN membatasi peran di demo ini. Otorisasi produksi tetap harus di server.',
    submitLabel: 'Simpan PIN baru',
    body: `
      <div class="account-meta">
        <div class="row-between"><span>Nama</span><strong>${esc(user.name)}</strong></div>
        <div class="row-between"><span>Peran</span><strong>${esc(ROLE_LABEL[user.role])}</strong></div>
        <div class="row-between"><span>Sesi berakhir</span><span>${mins} menit lagi</span></div>
      </div>
      <hr class="divider" />
      <h3>Ganti PIN</h3>
      <div class="form-grid" style="margin-top:8px">
        ${field('PIN saat ini', `<input class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" name="pinCurrent" />`)}
        ${field('PIN baru', `<input class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" name="pinNext" />`)}
        ${field('Ulangi PIN baru', `<input class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" name="pinRepeat" />`)}
      </div>
      <p class="xs muted" style="margin-top:8px">4–6 angka. Hindari 1234, 0000, atau angka berulang.</p>
    `,
    extraFooter: `<button class="btn btn-danger" type="button" data-logout>${icon('logout')} Keluar</button>`,
    onMount(form) {
      form.querySelector('[data-logout]')?.addEventListener('click', () => {
        closeModal();
        logout();
        goToLogin();
      });
    },
    onSubmit: async (form, close) => {
      if (form.pinNext.value !== form.pinRepeat.value) throw new Error('Ulangi PIN baru dengan benar.');
      await changePin(user.id, form.pinCurrent.value, form.pinNext.value);
      close();
      toast('PIN diperbarui. Gunakan PIN baru pada login berikutnya.', { tone: 'success' });
    },
  });
}

function goToLogin() {
  const target = '#/login';
  if (window.location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = target;
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
  if (window.__lajurNavKey) document.removeEventListener('keydown', window.__lajurNavKey);
  window.__lajurNavKey = (e) => {
    if (e.key === 'Escape' && sidebar?.classList.contains('open')) setNav(false);
  };
  document.addEventListener('keydown', window.__lajurNavKey);

  document.querySelector('[data-action="warehouse-select"]')?.addEventListener('change', (e) => {
    ctx.store.setUi({ warehouseId: e.target.value });
  });
  document.querySelectorAll('[data-action="toggle-mode"]').forEach((btn) => btn.addEventListener('click', () => {
    const next = isAdvancedMode(ctx.db) ? 'simple' : 'advanced';
    ctx.store.update((db) => saveSettings(db, { uiMode: next }, ctx.user));
    toast(next === 'advanced'
      ? 'Mode Lanjutan aktif: laporan, master data, dokumen pajak/pengiriman, impor, WIP/Pesanan tersedia bila diaktifkan.'
      : 'Mode Sederhana aktif: hanya operasi dasar yang ditampilkan.',
    { tone: 'success' });
  }));
  document.querySelectorAll('[data-action="account"]').forEach((btn) => btn.addEventListener('click', () => openAccount(ctx)));
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
