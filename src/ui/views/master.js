/** Master data, kategori, gudang, cadangan data, dan matriks peran. */

import {
  esc, icon, fmt, badge, swatch, toast, openModal, field, confirmAction, downloadFile,
} from '../dom.js';
import { byId, uid, todayJakarta } from '../../domain/core.js';
import { pageHead, statCard, can } from './common.js';

let tab = 'produk';

export function render(ctx) {
  const { db, role } = ctx;
  return `
    ${pageHead({
      eyebrow: 'Pengaturan',
      title: 'Master data',
      sub: 'ID internal stabil; kode tampilan boleh berubah tanpa memutus riwayat transaksi.',
      actions: `${role === 'manager' ? `<button class="btn btn-primary" type="button" data-act="new-product">${icon('plus')} Produk kain</button>` : ''}`,
    })}
    <div class="tabs" role="tablist">
      ${[['produk', 'Produk kain'], ['part', 'Spare part'], ['kategori', 'Kategori & koleksi'], ['gudang', 'Gudang'], ['data', 'Data & peran']].map(([k, label]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${esc(label)}</button>`).join('')}
    </div>
    ${tab === 'produk' ? renderProducts(ctx) : ''}
    ${tab === 'part' ? renderParts(ctx) : ''}
    ${tab === 'kategori' ? renderCategories(ctx) : ''}
    ${tab === 'gudang' ? renderWarehouses(ctx) : ''}
    ${tab === 'data' ? renderData(ctx) : ''}`;
}

function renderProducts(ctx) {
  const { db, role } = ctx;
  return `<section class="card">
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Kode</th><th>Koleksi</th><th>Warna</th><th class="num">Lebar</th><th class="num">Beli / m</th><th class="num">Jual / m</th><th>Status</th><th></th></tr></thead>
      <tbody>${db.skus.map((s) => `<tr>
        <td class="mono strong">${esc(s.code)}<div class="xs muted">${esc(s.id)}</div></td>
        <td>${esc(s.collectionName)}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">${swatch(s)}<span>${esc(s.colourName || '—')} <span class="muted xs">(${esc(s.colourCode)})</span></span></div></td>
        <td class="num">${s.widthCm ? `${s.widthCm} cm` : '—'}</td>
        <td class="num">${fmt.money(s.buyPrice)}</td>
        <td class="num">${fmt.money(s.sellPrice)}</td>
        <td>${s.active === false ? badge('Nonaktif / dormant', 'danger') : badge('Aktif', 'ok')}</td>
        <td class="right">${role === 'manager' ? `<button class="btn btn-sm" data-edit-sku="${s.id}">Edit</button>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="card-pad"><p class="xs muted">Swatch tidak pernah diturunkan dari kode warna. Bila belum diset, tampil pola netral dan operator mencocokkan kode + lot secara fisik.</p></div>
  </section>`;
}

function renderParts(ctx) {
  const { db, role } = ctx;
  return `<section class="card">
    <div class="table-wrap"><table class="data">
      <thead><tr><th>SKU</th><th>Nama</th><th>Kategori</th><th>Satuan</th><th class="num">Beli</th><th class="num">Jual</th><th class="num">Stok total</th><th></th></tr></thead>
      <tbody>${db.parts.map((p) => {
        const qty = db.partStock.filter((s) => s.partId === p.id).reduce((a, s) => a + s.qty, 0);
        return `<tr>
          <td class="mono">${esc(p.sku)}<div class="xs muted">${esc(p.id)}</div></td>
          <td>${esc(p.name)}</td>
          <td>${esc(byId(db.categories, p.categoryId)?.name ?? '—')}</td>
          <td>${esc(p.unit)}</td>
          <td class="num">${fmt.money(p.buyPrice)}</td>
          <td class="num">${fmt.money(p.sellPrice)}</td>
          <td class="num">${fmt.pcs(qty)} pcs</td>
          <td class="right">${role === 'manager' ? `<button class="btn btn-sm" data-edit-part="${p.id}">Edit</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="card-pad"><p class="xs muted">Spare part selalu bilangan bulat pcs; tidak pernah diubah menjadi roll atau meter.</p></div>
  </section>`;
}

function renderCategories(ctx) {
  const { db, role } = ctx;
  return `<div class="grid grid-2">
    <section class="card">
      <div class="card-head"><div><h2>Kategori</h2><p>Nama dapat diubah; ID tetap.</p></div>${role === 'manager' ? `<button class="btn btn-sm" data-act="new-category">Tambah</button>` : ''}</div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>ID</th><th>Nama</th><th class="num">Produk</th><th></th></tr></thead>
        <tbody>${db.categories.map((c) => {
          const count = db.skus.filter((s) => db.collections.find((x) => x.id === s.collectionId)?.categoryId === c.id).length
            + db.parts.filter((p) => p.categoryId === c.id).length;
          return `<tr><td class="mono">${esc(c.id)}</td><td>${esc(c.name)}</td><td class="num">${count}</td>
            <td class="right">${role === 'manager' ? `<button class="btn btn-sm" data-rename-category="${c.id}">Ubah</button>` : ''}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>
    <section class="card">
      <div class="card-head"><div><h2>Koleksi</h2><p>Grup warna dalam satu seri kain.</p></div></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Koleksi</th><th>Kategori</th><th class="num">Warna</th></tr></thead>
        <tbody>${db.collections.map((c) => `<tr>
          <td><strong>${esc(c.name)}</strong><div class="xs muted">${esc(c.description)}</div></td>
          <td>${esc(byId(db.categories, c.categoryId)?.name ?? '—')}</td>
          <td class="num">${db.skus.filter((s) => s.collectionId === c.id).length}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>
  </div>`;
}

function renderWarehouses(ctx) {
  const { db } = ctx;
  return `<div class="grid grid-3">
    ${db.warehouses.map((w) => `<section class="card card-pad">
      <div class="row-between"><h2>${esc(w.name)}</h2><span class="badge badge-teal no-dot">${esc(w.code)}</span></div>
      <p class="small muted" style="margin-top:6px">${esc(w.address)}</p>
      <hr class="divider" />
      <div class="stack-sm">
        <div class="row-between"><span class="small muted">Prefiks rak</span><span class="small mono">${esc(w.binPrefix)}</span></div>
        <div class="row-between"><span class="small muted">Telepon</span><span class="small">${esc(w.phone)}</span></div>
        <div class="row-between"><span class="small muted">Roll fisik</span><span class="small">${db.rolls.filter((r) => r.warehouseId === w.id && !r.transit).length}</span></div>
      </div>
      <p class="xs muted" style="margin-top:10px">Format lokasi: ${esc(w.binPrefix)}-01-02 (gudang → zona → rak → posisi).</p>
    </section>`).join('')}
  </div>`;
}

function renderData(ctx) {
  const { db, role, storage } = ctx;
  return `<div class="grid grid-2">
    <section class="card card-pad">
      <h2>Cadangan & pemulihan</h2>
      <p class="small muted" style="margin-top:6px">Ekspor seluruh dataset aktif ke JSON. Restore memvalidasi referensi sebelum mengganti data.</p>
      <div class="row" style="margin-top:12px">
        <button class="btn" type="button" data-act="export-json">${icon('download')} Ekspor JSON</button>
        <label class="btn" style="cursor:pointer">${icon('upload')} Impor JSON<input type="file" accept="application/json,.json" data-import hidden /></label>
      </div>
      <div class="notice notice-info" style="margin-top:12px">${icon('alert')}<div>Penyimpanan: ${storage.available ? 'localStorage perangkat ini' : 'memori sementara (localStorage diblokir)'}. Tidak ada sinkronisasi antar pengguna.</div></div>
      <hr class="divider" />
      <h3>Reset dataset</h3>
      <p class="xs muted" style="margin:4px 0 10px">Hanya untuk demo. Data operasional nyata tidak boleh dimasukkan.</p>
      <div class="row">
        <button class="btn btn-danger" type="button" data-act="reset-main">Reset data utama</button>
        <button class="btn btn-danger" type="button" data-act="reset-sim">Reset simulasi</button>
      </div>
    </section>

    <section class="card card-pad">
      <h2>Matriks peran (demo)</h2>
      <div class="table-wrap" style="margin-top:10px"><table class="data">
        <thead><tr><th>Aksi</th><th>Operator</th><th>Sales</th><th>Manajer</th></tr></thead>
        <tbody>${[
          ['Lihat stok & roll', true, true, true],
          ['Buat permintaan gudang', true, false, true],
          ['Kirim / terima transfer', true, false, true],
          ['Setujui transfer & opname', false, false, true],
          ['Hitung opname', true, false, true],
          ['Buat faktur & pembayaran', false, true, true],
          ['Buat proyek & sample', false, true, true],
          ['Refund deposit indent', false, false, true],
          ['Edit master & pemasok', false, false, true],
        ].map(([label, a, b, c]) => `<tr><td>${esc(label)}</td><td>${a ? '✓' : '—'}</td><td>${b ? '✓' : '—'}</td><td>${c ? '✓' : '—'}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="notice notice-warn" style="margin-top:10px">${icon('alert')}<div><strong>Hiding a button is not authorization.</strong> Produksi wajib menegakkan izin di server untuk setiap mutasi, bukan hanya di UI.</div></div>
    </section>

    <section class="card card-pad">
      <h2>Informasi dataset</h2>
      <div class="stack-sm" style="margin-top:10px">
        <div class="row-between"><span class="small muted">Dataset</span><span class="small">${esc(db.meta.label)}</span></div>
        <div class="row-between"><span class="small muted">Versi</span><span class="small">v${db.meta.version}</span></div>
        <div class="row-between"><span class="small muted">Perusahaan</span><span class="small">${esc(db.meta.company)}</span></div>
        <div class="row-between"><span class="small muted">Zona waktu</span><span class="small">${esc(db.meta.timezone)}</span></div>
        <div class="row-between"><span class="small muted">Roll / faktur / mutasi</span><span class="small">${db.rolls.length} / ${db.invoices.length} / ${db.movements.length}</span></div>
        <div class="row-between"><span class="small muted">Seed</span><span class="small">${esc(db.meta.seededAt?.slice(0, 16).replace('T', ' ') ?? '—')}</span></div>
      </div>
      <p class="xs muted" style="margin-top:10px">Backup memuat ${Object.keys(db).length} koleksi. Restore yang rusak ditolak dengan daftar referensi yang hilang.</p>
    </section>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

function openSku(ctx, sku = null) {
  const { db } = ctx;
  const isNew = !sku;
  const collections = db.collections.filter((c) => c.id !== 'col-rel' && c.id !== 'col-motor');
  const setSwatch = Boolean(sku?.swatch);
  openModal({
    title: isNew ? 'Produk kain baru' : `Edit ${sku.code}`,
    description: 'ID internal dibuat sekali dan tidak berubah saat kode tampilan diedit.',
    wide: true,
    submitLabel: isNew ? 'Buat produk' : 'Simpan',
    body: `<div class="form-grid">
      ${field('Koleksi', `<select class="select" name="collection">${collections.map((c) => `<option value="${c.id}" ${sku?.collectionId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
      ${field('Kode tampilan', `<input class="input" name="code" value="${esc(sku?.code ?? '')}" placeholder="Luna-03" required />`)}
      ${field('Kode warna', `<input class="input" name="colourCode" value="${esc(sku?.colourCode ?? '')}" placeholder="03" required />`)}
      ${field('Nama warna (opsional)', `<input class="input" name="colourName" value="${esc(sku?.colourName ?? '')}" placeholder="Dibiarkan kosong bila belum pasti" />`)}
      ${field('Lebar kain (cm)', `<input class="input" type="number" name="widthCm" value="${sku?.widthCm ?? 280}" min="0" />`)}
      ${field('Harga beli / m', `<input class="input" name="buyPrice" inputmode="numeric" value="${sku?.buyPrice ?? ''}" />`)}
      ${field('Harga jual / m', `<input class="input" name="sellPrice" inputmode="numeric" value="${sku?.sellPrice ?? ''}" />`)}
      ${field('Status', `<select class="select" name="active"><option value="1" ${sku?.active !== false ? 'selected' : ''}>Aktif</option><option value="0" ${sku?.active === false ? 'selected' : ''}>Nonaktif / dormant</option></select>`)}
      <div class="span-2">
        <label class="checkline"><input type="checkbox" name="useSwatch" ${setSwatch ? 'checked' : ''} /> Set swatch visual</label>
        <div class="row" style="margin-top:8px">
          <input type="color" name="swatch" value="${esc(sku?.swatch ?? '#C9B79C')}" aria-label="Warna swatch" />
          <span class="xs muted">Swatch hanya referensi tampilan. Jangan menurunkan warna dari kode angka.</span>
        </div>
      </div>
    </div>`,
    onMount(form) {
      const checkbox = form.useSwatch;
      const color = form.swatch;
      const sync = () => { color.disabled = !checkbox.checked; };
      checkbox.addEventListener('change', sync);
      sync();
    },
    onSubmit(form, close) {
      const useSwatch = form.useSwatch.checked;
      const patch = {
        collectionId: form.collection.value,
        collectionName: byId(db.collections, form.collection.value)?.name ?? '',
        code: form.code.value.trim(),
        colourCode: form.colourCode.value.trim(),
        colourName: form.colourName.value.trim() || null,
        swatch: useSwatch ? form.swatch.value : null,
        widthCm: Number(form.widthCm.value || 0),
        buyPrice: Number(String(form.buyPrice.value).replace(/\D/g, '')) || 0,
        sellPrice: Number(String(form.sellPrice.value).replace(/\D/g, '')) || 0,
        active: form.active.value === '1',
        dormant: form.active.value !== '1',
      };
      if (!patch.code || !patch.colourCode) throw new Error('Kode dan kode warna wajib diisi.');
      ctx.store.update((d) => {
        if (isNew) {
          d.skus.push({ id: uid('sku'), unit: 'm', ...patch });
        } else {
          const target = d.skus.find((s) => s.id === sku.id);
          Object.assign(target, patch);
        }
      });
      close();
      toast(isNew ? 'Produk kain dibuat.' : 'Produk diperbarui; riwayat tetap memakai ID yang sama.', { tone: 'success' });
    },
  });
}

function openPart(ctx, part) {
  openModal({
    title: `Edit ${part.name}`,
    submitLabel: 'Simpan',
    body: `<div class="form-grid">
      ${field('SKU', `<input class="input" name="sku" value="${esc(part.sku)}" />`)}
      ${field('Nama', `<input class="input" name="name" value="${esc(part.name)}" />`)}
      ${field('Harga beli', `<input class="input" name="buyPrice" inputmode="numeric" value="${part.buyPrice}" />`)}
      ${field('Harga jual', `<input class="input" name="sellPrice" inputmode="numeric" value="${part.sellPrice}" />`)}
    </div>`,
    onSubmit(form, close) {
      ctx.store.update((db) => {
        const p = db.parts.find((x) => x.id === part.id);
        Object.assign(p, {
          sku: form.sku.value.trim(),
          name: form.name.value.trim(),
          buyPrice: Number(String(form.buyPrice.value).replace(/\D/g, '')) || 0,
          sellPrice: Number(String(form.sellPrice.value).replace(/\D/g, '')) || 0,
        });
      });
      close();
      toast('Spare part diperbarui.', { tone: 'success' });
    },
  });
}

function openCategory(ctx) {
  openModal({
    title: 'Kategori baru',
    submitLabel: 'Buat',
    body: field('Nama kategori', `<input class="input" name="name" required />`),
    onSubmit(form, close) {
      ctx.store.update((db) => {
        db.categories.push({ id: uid('cat'), name: form.name.value.trim() });
      });
      close();
      toast('Kategori dibuat.', { tone: 'success' });
    },
  });
}

function openRenameCategory(ctx, category) {
  openModal({
    title: 'Ubah nama kategori',
    description: `ID ${category.id} tetap.`,
    submitLabel: 'Simpan',
    body: field('Nama', `<input class="input" name="name" value="${esc(category.name)}" required />`),
    onSubmit(form, close) {
      ctx.store.update((db) => {
        const c = db.categories.find((x) => x.id === category.id);
        c.name = form.name.value.trim();
      });
      close();
      toast('Nama kategori diperbarui; referensi tidak berubah.', { tone: 'success' });
    },
  });
}

export function mount(ctx) {
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    tab = btn.dataset.tab;
    ctx.store.emit();
  }));
  document.querySelector('[data-act="new-product"]')?.addEventListener('click', () => openSku(ctx));
  document.querySelectorAll('[data-edit-sku]').forEach((btn) => btn.addEventListener('click', () => {
    const sku = ctx.db.skus.find((s) => s.id === btn.dataset.editSku);
    if (sku) openSku(ctx, sku);
  }));
  document.querySelectorAll('[data-edit-part]').forEach((btn) => btn.addEventListener('click', () => {
    const part = ctx.db.parts.find((p) => p.id === btn.dataset.editPart);
    if (part) openPart(ctx, part);
  }));
  document.querySelector('[data-act="new-category"]')?.addEventListener('click', () => openCategory(ctx));
  document.querySelectorAll('[data-rename-category]').forEach((btn) => btn.addEventListener('click', () => {
    const cat = ctx.db.categories.find((c) => c.id === btn.dataset.renameCategory);
    if (cat) openRenameCategory(ctx, cat);
  }));

  document.querySelector('[data-act="export-json"]')?.addEventListener('click', () => {
    const backup = ctx.store.exportCurrent();
    downloadFile(`lajur-backup-${backup.dataset}-${todayJakarta()}.json`, JSON.stringify(backup, null, 2));
  });
  document.querySelector('[data-import]')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const dataset = ctx.store.restore(payload);
      toast(`Backup dipulihkan ke dataset ${dataset}. Referensi valid.`, { tone: 'success' });
    } catch (err) {
      toast(err.message ?? 'Berkas backup tidak valid.', { tone: 'error' });
    }
  });
  document.querySelector('[data-act="reset-main"]')?.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Reset data utama?', message: 'Semua perubahan lokal pada dataset utama akan hilang dan diganti data contoh.', confirmLabel: 'Reset', tone: 'danger' });
    if (!ok) return;
    ctx.store.resetMain();
    toast('Data utama direset ke contoh.', { tone: 'success' });
  });
  document.querySelector('[data-act="reset-sim"]')?.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Reset simulasi?', message: 'Dataset simulasi akan dibuat ulang. Data utama tidak berubah.', confirmLabel: 'Reset simulasi', tone: 'danger' });
    if (!ok) return;
    ctx.store.resetSimulation();
    toast('Simulasi direset.', { tone: 'success' });
  });
}
