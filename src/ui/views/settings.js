/** Pengaturan: akun, pengguna & peran, preferensi, audit, data. */

import {
  esc, icon, fmt, badge, toast, openModal, field, confirmAction, downloadFile,
} from '../dom.js';
import { byId, uid, todayJakarta } from '../../domain/core.js';
import { auditTrail, saveUser } from '../../domain/master.js';
import { saveSettings, settingsOf } from '../../domain/settings.js';
import { adminSetPin, changePin, createAccount, pinStatus } from '../../data/auth.js';
import { pageHead } from './common.js';

let tab = 'akun';

const ROLE_LABEL = { manager: 'Manajer', operator: 'Operator', sales: 'Sales/CS' };
const ROLE_TONE = { manager: 'navy', operator: 'teal', sales: 'copper' };

export function render(ctx) {
  const { db, user, role } = ctx;
  if (role !== 'manager') {
    return `${pageHead({ title: 'Pengaturan' })}<div class="notice notice-danger">${icon('alert')}<div>Hanya manajer yang dapat membuka pengaturan akun dan sistem.</div></div>`;
  }

  return `
    ${pageHead({
      eyebrow: 'Sistem',
      title: 'Pengaturan',
      sub: 'Akun, PIN, pengguna dan peran, preferensi operasional, audit, serta cadangan data.',
      actions: `<a class="btn" href="#/master">${icon('settings')} Master data</a>`,
    })}
    <div class="tabs" role="tablist">
      ${[['akun', 'Akun saya'], ['pengguna', 'Pengguna & peran'], ['preferensi', 'Preferensi'], ['audit', 'Audit'], ['data', 'Data']].map(([k, label]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${esc(label)}</button>`).join('')}
    </div>
    ${tab === 'akun' ? renderAccount(ctx) : tab === 'pengguna' ? renderUsers(ctx) : tab === 'preferensi' ? renderPreferences(ctx) : tab === 'audit' ? renderAudit(ctx) : renderData(ctx)}`;
}

function renderAccount(ctx) {
  const { user } = ctx;
  return `<div class="grid grid-2">
    <section class="card card-pad">
      <div class="row"><span class="avatar avatar-lg">${esc(user.name.split(' ').slice(0, 2).map((n) => n[0]).join(''))}</span>
        <div><h2>${esc(user.name)}</h2><div class="small muted">${esc(ROLE_LABEL[user.role] ?? user.role)}</div></div>
      </div>
      <hr class="divider" />
      <div class="stack-sm">
        <div class="row-between"><span class="small muted">ID pengguna</span><span class="mono small">${esc(user.id)}</span></div>
        <div class="row-between"><span class="small muted">Sesi</span><span class="small">${user.expiresAt ? `Berakhir ${esc(new Date(user.expiresAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }))}` : '—'}</span></div>
        <div class="row-between"><span class="small muted">Status PIN</span><span class="small">${pinStatus(user.id).defaultPin ? 'PIN demo' : 'Sudah diubah'}</span></div>
      </div>
      <div class="notice notice-info" style="margin-top:12px">${icon('alert')}<div>Ganti PIN dari menu akun di kanan atas, atau gunakan formulir di samping.</div></div>
    </section>
    <section class="card card-pad">
      <h2>Ganti PIN saya</h2>
      <form data-pin-form class="stack-sm" style="margin-top:10px">
        <div data-pin-error class="notice notice-danger" hidden></div>
        ${field('PIN saat ini', `<input class="input" type="password" inputmode="numeric" maxlength="6" name="current" autocomplete="current-password" />`)}
        ${field('PIN baru', `<input class="input" type="password" inputmode="numeric" maxlength="6" name="next" autocomplete="new-password" />`)}
        ${field('Ulangi PIN baru', `<input class="input" type="password" inputmode="numeric" maxlength="6" name="repeat" autocomplete="new-password" />`)}
        <button class="btn btn-primary" type="submit">Simpan PIN</button>
      </form>
    </section>
  </div>`;
}

function renderUsers(ctx) {
  const { db, user } = ctx;
  return `<div class="row-between" style="margin-bottom:12px">
      <div><h2>Pengguna & peran</h2><p class="xs muted">Peran menentukan menu dan aksi. Menonaktifkan akun langsung memutus sesi berikutnya.</p></div>
      <button class="btn btn-primary" type="button" data-act="new-user">${icon('plus')} Tambah pengguna</button>
    </div>
    <section class="card">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Nama</th><th>Peran</th><th>Status</th><th>PIN</th><th>Dibuat</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${db.users.map((u) => {
          const pin = pinStatus(u.id);
          return `<tr>
            <td><strong>${esc(u.name)}</strong><div class="xs muted mono">${esc(u.id)}</div></td>
            <td>${badge(ROLE_LABEL[u.role] ?? u.role, ROLE_TONE[u.role] ?? 'muted')}</td>
            <td>${u.active === false ? badge('Nonaktif', 'danger') : badge('Aktif', 'ok')}</td>
            <td>${pin.defaultPin ? badge('PIN demo', 'warn') : badge('PIN diatur', 'muted')}</td>
            <td class="small">${esc(u.createdAt?.slice(0, 10) ?? '—')}</td>
            <td class="right"><div class="row" style="justify-content:flex-end"><button class="btn btn-sm" data-edit-user="${u.id}">Edit</button><button class="btn btn-sm" data-reset-pin="${u.id}">Reset PIN</button></div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>
    <div class="notice notice-warn" style="margin-top:14px">${icon('alert')}<div><strong>${db.users.filter((u) => u.active !== false).length} akun aktif.</strong> Minimal satu manajer aktif harus tersisa. PIN tidak pernah ditampilkan setelah disimpan.</div></div>`;
}

function renderPreferences(ctx) {
  const s = settingsOf(ctx.db);
  const advanced = s.uiMode === 'advanced';
  return `<div class="grid grid-main">
    <section class="card card-pad">
      <h2>Preferensi operasional</h2>
      <p class="small muted" style="margin-top:4px">Berlaku untuk dataset ini. Mode menentukan fitur yang ditampilkan; opsi lanjutan hanya muncul pada mode Lanjutan.</p>
      <form data-pref-form class="stack" style="margin-top:14px">
        <div class="form-grid">
          ${field('Mode tampilan', `<select class="select" name="uiMode"><option value="simple" ${!advanced ? 'selected' : ''}>Sederhana — operasi dasar</option><option value="advanced" ${advanced ? 'selected' : ''}>Lanjutan — analitik, master, dokumen</option></select>`, { full: true, hint: 'Sederhana: stok, tugas, transfer, pembelian, faktur, pelanggan, proyek, sample, opname. Lanjutan menambah laporan, master, simulasi, WIP/Pesanan, faktur pajak, surat jalan, dan impor.' })}
          ${field('Ambang stok rendah (m)', `<input class="input" name="lowStockM" inputmode="decimal" value="${(s.lowStockMm / 1000).toString().replace('.', ',')}" />`, { hint: 'Dipakai untuk penanda stok menipis.' })}
          ${field('Tenggat tugas default (hari)', `<input class="input" type="number" name="taskDueDays" min="0" max="30" value="${s.taskDueDays}" />`)}
        </div>
        <label class="checkline"><input type="checkbox" name="requireProof" ${s.requireProofOnReceipt ? 'checked' : ''} /> Wajibkan bukti fisik saat menerima barang</label>
        ${advanced ? `
          <div class="notice notice-info">${icon('layers')}<div><strong>Opsi lanjutan.</strong> Aktifkan modul dan biaya hanya jika operasi membutuhkannya.</div></div>
          <label class="checkline"><input type="checkbox" name="salesOrder" ${s.salesOrderEnabled ? 'checked' : ''} /> Aktifkan pesanan penjualan (sales order / pesanan)</label>
          <label class="checkline"><input type="checkbox" name="production" ${s.productionEnabled ? 'checked' : ''} /> Aktifkan produksi WIP (potong → jahit → QC)</label>
          <label class="checkline"><input type="checkbox" name="operatorCosts" ${s.operatorCanSeeCosts ? 'checked' : ''} /> Operator boleh melihat harga pokok / nilai stok</label>
          <label class="checkline"><input type="checkbox" name="sampleDeposit" ${s.sampleDepositRequired ? 'checked' : ''} /> Sample berbayar/deposit wajib nominal</label>
        ` : `<p class="small muted">Mode Sederhana menyembunyikan laporan, master data, simulasi, WIP/Pesanan, faktur pajak, surat jalan, dan tab impor. Pilih <strong>Lanjutan</strong> lalu simpan untuk membuka opsi tersebut.</p>`}
        <div class="row"><button class="btn btn-primary" type="submit">Simpan preferensi</button></div>
      </form>
    </section>
    <section class="card card-pad">
      <h2>Efek opsi</h2>
      <ul class="small muted" style="padding-left:16px;margin-top:8px;line-height:1.7">
        <li><strong>Mode Sederhana</strong> — menu inti gudang, pembelian, penjualan, proyek, pelanggan dan sample.</li>
        <li><strong>Mode Lanjutan</strong> — menambah laporan, master data, simulasi, dokumen pajak/pengiriman, impor, WIP dan Pesanan.</li>
        <li><strong>Stok rendah</strong> — penanda pada ringkasan stok (rencana: notifikasi).</li>
        <li><strong>Tenggat tugas</strong> — tanggal default saat membuat tugas baru.</li>
        <li><strong>Bukti fisik</strong> — form penerimaan menolak tanpa lampiran.</li>
        <li><strong>Sales order</strong> — menu Pesanan, tombol di Penjualan, dan laporan pesanan muncul kembali. Nonaktif secara default; faktur draf tetap tersedia.</li>
        <li><strong>Produksi WIP</strong> — menu Produksi, tautan dashboard, dan laporan produksi muncul kembali. Nonaktif secara default.</li>
        <li><strong>Harga pokok</strong> — operator melihat/menyembunyikan biaya.</li>
      </ul>
    </section>
  </div>`;
}

function renderAudit(ctx) {
  const { db } = ctx;
  const rows = db.audit.filter((a) => ['user', 'sku', 'part', 'supplier', 'settings', 'warehouse'].includes(a.entity)).slice(0, 30);
  return `<section class="card">
    <div class="card-head"><div><h2>Jejak audit master & akun</h2><p>Perubahan produk, part, pemasok, pengguna, gudang, dan pengaturan.</p></div></div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Waktu</th><th>Aksi</th><th>Entitas</th><th>Pelaku</th><th>Detail</th></tr></thead>
      <tbody>${rows.map((a) => `<tr>
        <td class="small nowrap">${esc(new Date(a.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</td>
        <td class="small">${esc(a.action)}</td>
        <td class="mono small">${esc(a.entity)} ${esc(a.entityId)}</td>
        <td class="small">${esc(a.userName)} <span class="xs muted">${esc(a.role)}</span></td>
        <td class="small muted">${esc(a.detail)}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">Belum ada perubahan.</td></tr>'}</tbody>
    </table></div>
  </section>`;
}

function renderData(ctx) {
  return `<div class="grid grid-2">
    <section class="card card-pad">
      <h2>Cadangan & pemulihan</h2>
      <p class="small muted" style="margin-top:6px">Ekspor seluruh dataset aktif ke JSON. Restore memvalidasi referensi sebelum mengganti data.</p>
      <div class="row" style="margin-top:12px">
        <button class="btn" type="button" data-act="export-json">${icon('download')} Ekspor JSON</button>
        <label class="btn" style="cursor:pointer">${icon('upload')} Impor JSON<input type="file" accept="application/json,.json" data-import hidden /></label>
      </div>
      <div class="notice notice-info" style="margin-top:12px">${icon('alert')}<div>File JSON memuat data operasional dan pengaturan, tetapi <strong>tidak</strong> memuat hash PIN.</div></div>
    </section>
    <section class="card card-pad">
      <h2>Reset dataset</h2>
      <p class="small muted" style="margin-top:6px">Hanya untuk demo. Menghapus perubahan lokal.</p>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-danger" type="button" data-act="reset-main">Reset data utama</button>
        <button class="btn btn-danger" type="button" data-act="reset-sim">Reset simulasi</button>
      </div>
      <div class="notice notice-warn" style="margin-top:12px">${icon('alert')}<div>Reset tidak mengubah PIN akun. Gunakan reset PIN per pengguna bila perlu.</div></div>
    </section>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

function openUser(ctx, existing = null) {
  const editing = Boolean(existing);
  openModal({
    title: editing ? `Edit ${existing.name}` : 'Tambah pengguna',
    description: editing ? 'Peran dan status berlaku pada login berikutnya.' : 'Buat akun dan PIN awal. Sampaikan PIN secara langsung, bukan lewat chat.',
    submitLabel: editing ? 'Simpan pengguna' : 'Buat pengguna',
    body: `<div class="form-grid">
      ${field('Nama lengkap', `<input class="input" name="name" value="${esc(existing?.name ?? '')}" required />`)}
      ${field('Peran', `<select class="select" name="role">${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${existing?.role === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`)}
      ${editing ? `<label class="checkline"><input type="checkbox" name="active" ${existing.active !== false ? 'checked' : ''} ${existing.id === ctx.user.id ? 'disabled' : ''} /> Akun aktif</label>` : field('PIN awal (4-6 angka)', `<input class="input" type="password" inputmode="numeric" maxlength="6" name="pin" required />`)}
    </div>
    ${editing ? `<p class="xs muted" style="margin-top:10px">PIN tidak diubah di sini. Gunakan “Reset PIN”.</p>` : ''}`,
    onSubmit: async (form, close) => {
      const name = form.name.value.trim();
      const role = form.role.value;
      const active = editing ? (form.active ? form.active.checked : true) : true;
      if (editing) {
        ctx.store.update((db) => saveUser(db, { id: existing.id, name, role, active, user: ctx.user }));
        close();
        toast('Pengguna diperbarui.', { tone: 'success' });
        return;
      }
      const pin = form.pin.value.trim();
      if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN awal harus 4-6 angka.');
      const id = uid('u');
      await createAccount(id, pin, { defaultPin: false });
      ctx.store.update((db) => saveUser(db, { id, name, role, active: true, user: ctx.user }));
      close();
      toast('Pengguna dibuat. Sampaikan PIN awal secara langsung.', { tone: 'success' });
    },
  });
}

function openResetPin(ctx, user) {
  openModal({
    title: `Reset PIN ${user.name}`,
    description: 'Manajer dapat mengatur PIN baru tanpa PIN lama. Sesi aktif pengguna tetap berjalan sampai logout.',
    submitLabel: 'Reset PIN',
    body: `<div class="form-grid">
      ${field('PIN baru', `<input class="input" type="password" inputmode="numeric" maxlength="6" name="pin" />`)}
      ${field('Ulangi PIN', `<input class="input" type="password" inputmode="numeric" maxlength="6" name="repeat" />`)}
    </div>`,
    onSubmit: async (form, close) => {
      const pin = form.pin.value.trim();
      if (pin !== form.repeat.value.trim()) throw new Error('Ulangi PIN dengan benar.');
      if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN harus 4-6 angka.');
      await adminSetPin(user.id, pin);
      close();
      toast('PIN pengguna direset. Sampaikan PIN baru secara langsung.', { tone: 'success' });
    },
  });
}

/* -------------------------------------------------------------------------- */

export function mount(ctx) {
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    tab = btn.dataset.tab;
    ctx.store.emit();
  }));

  const pinForm = document.querySelector('[data-pin-form]');
  pinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = pinForm.querySelector('[data-pin-error]');
    err.hidden = true;
    try {
      if (pinForm.next.value !== pinForm.repeat.value) throw new Error('Ulangi PIN baru dengan benar.');
      await changePin(ctx.user.id, pinForm.current.value, pinForm.next.value);
      pinForm.reset();
      toast('PIN diperbarui.', { tone: 'success' });
    } catch (error) {
      err.innerHTML = `${icon('alert')}<div>${esc(error.message)}</div>`;
      err.hidden = false;
    }
  });

  document.querySelector('[data-act="new-user"]')?.addEventListener('click', () => openUser(ctx));
  document.querySelectorAll('[data-edit-user]').forEach((btn) => btn.addEventListener('click', () => {
    const user = ctx.db.users.find((u) => u.id === btn.dataset.editUser);
    if (user) openUser(ctx, user);
  }));
  document.querySelectorAll('[data-reset-pin]').forEach((btn) => btn.addEventListener('click', () => {
    const user = ctx.db.users.find((u) => u.id === btn.dataset.resetPin);
    if (user) openResetPin(ctx, user);
  }));

  const pref = document.querySelector('[data-pref-form]');
  pref?.addEventListener('submit', (e) => {
    e.preventDefault();
    const current = settingsOf(ctx.db);
    ctx.store.update((db) => saveSettings(db, {
      lowStockMm: Math.round(Number(String(pref.lowStockM.value).replace(',', '.')) * 1000) || 0,
      taskDueDays: Math.max(0, Number(pref.taskDueDays.value) || 0),
      requireProofOnReceipt: pref.requireProof.checked,
      uiMode: pref.uiMode.value,
      salesOrderEnabled: pref.salesOrder ? pref.salesOrder.checked : current.salesOrderEnabled,
      productionEnabled: pref.production ? pref.production.checked : current.productionEnabled,
      operatorCanSeeCosts: pref.operatorCosts ? pref.operatorCosts.checked : current.operatorCanSeeCosts,
      sampleDepositRequired: pref.sampleDeposit ? pref.sampleDeposit.checked : current.sampleDepositRequired,
    }, ctx.user));
    toast('Preferensi disimpan.', { tone: 'success' });
  });

  document.querySelector('[data-act="export-json"]')?.addEventListener('click', () => {
    const backup = ctx.store.exportCurrent();
    downloadFile(`lajur-backup-${backup.dataset}-${todayJakarta()}.json`, JSON.stringify(backup, null, 2));
  });
  document.querySelector('[data-import]')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const dataset = ctx.store.restore(payload);
      toast(`Backup dipulihkan ke dataset ${dataset}.`, { tone: 'success' });
    } catch (error) {
      toast(error.message ?? 'Backup tidak valid.', { tone: 'error' });
    }
  });
  document.querySelector('[data-act="reset-main"]')?.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Reset data utama?', message: 'Perubahan lokal pada data utama akan hilang.', confirmLabel: 'Reset', tone: 'danger' });
    if (!ok) return;
    ctx.store.resetMain();
    toast('Data utama direset.', { tone: 'success' });
  });
  document.querySelector('[data-act="reset-sim"]')?.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Reset simulasi?', message: 'Dataset simulasi dibuat ulang; data utama tetap.', confirmLabel: 'Reset simulasi', tone: 'danger' });
    if (!ok) return;
    ctx.store.resetSimulation();
    toast('Simulasi direset.', { tone: 'success' });
  });
}
