/** Master data, kategori, gudang, cadangan data, dan matriks peran. */

import {
  esc, icon, fmt, badge, swatch, toast, openModal, field, confirmAction, downloadFile, imageToDataUrl,
} from '../dom.js';
import { byId, uid, todayJakarta } from '../../domain/core.js';
import {
  activeWarehouses, auditTrail, createCollection, renameCollection, saveDriver, savePart, saveSku,
  saveTransport, saveWarehouse, TRANSPORT_TYPES, VEHICLE_TYPES,
} from '../../domain/master.js';
import {
  latestSupplierPrice, saveSupplierPrice, supplierPriceHistory, suppliersOfItem,
} from '../../domain/pricing.js';
import { APP_VERSION, SCHEMA_VERSION } from '../../version.js';
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
      ${[['produk', 'Produk kain'], ['part', 'Spare part'], ['driver', 'Driver & transport'], ['kategori', 'Kategori & koleksi'], ['gudang', 'Gudang'], ['data', 'Data & peran']].map(([k, label]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${esc(label)}</button>`).join('')}
    </div>
    ${tab === 'produk' ? renderProducts(ctx) : ''}
    ${tab === 'part' ? renderParts(ctx) : ''}
    ${tab === 'driver' ? renderDrivers(ctx) : ''}
    ${tab === 'kategori' ? renderCategories(ctx) : ''}
    ${tab === 'gudang' ? renderWarehouses(ctx) : ''}
    ${tab === 'data' ? renderData(ctx) : ''}`;
}

function supplierNames(db, item) {
  const list = suppliersOfItem(db, item);
  if (!list.length) return '<span class="muted">—</span>';
  return list.slice(0, 3).map((s) => `<div class="small">${esc(s.code)} · ${esc(s.name)}</div>`).join('')
    + (list.length > 3 ? `<div class="xs muted">+${list.length - 3} pemasok</div>` : '');
}

function latestPriceNote(db, item) {
  const latest = latestSupplierPrice(db, item);
  if (!latest) return '';
  const supplier = byId(db.suppliers, latest.supplierId);
  return `<div class="xs muted">${esc(supplier?.code ?? '')} · ${esc(latest.currency ?? 'IDR')} ${Number(latest.price).toLocaleString('id-ID')} · ${esc(latest.validFrom ?? '')}</div>`;
}

function renderProducts(ctx) {
  const { db, role } = ctx;
  return `<div class="row-between" style="margin-bottom:12px">
      <div><h2>Produk kain</h2><p class="xs muted">Gambar, swatch, pemasok, harga terbaru, dan status. ID internal tetap.</p></div>
      ${role === 'manager' ? `<button class="btn btn-primary" type="button" data-act="new-product">${icon('plus')} Produk kain</button>` : ''}
    </div>
    <section class="card">
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Kode</th><th>Koleksi</th><th>Warna</th><th class="hide-sm">Pemasok</th><th class="num">Lebar</th><th class="num">Beli / m</th><th class="num">Jual / m</th><th>Status</th><th><span class="sr-only">Aksi</span></th></tr></thead>
      <tbody>${db.skus.map((s) => `<tr>
        <td><div class="cell-main">${s.image ? `<img src="${esc(s.image)}" alt="Foto ${esc(s.code)}" class="thumb zoomable" data-zoom="${esc(s.image)}" data-zoom-title="Foto ${esc(s.code)}" role="button" tabindex="0" aria-label="Perbesar foto ${esc(s.code)}" />` : `<span class="thumb thumb-empty">${swatch(s)}</span>`}<div class="txt"><strong class="mono">${esc(s.code)}</strong><span>${esc(s.id)}</span></div></div></td>
        <td>${esc(s.collectionName)}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">${swatch(s)}<span>${esc(s.colourName || '—')} <span class="muted xs">(${esc(s.colourCode)})</span><div class="xs mono">${s.swatch ? esc(s.swatch) : 'hex belum diset'}</div></span></div></td>
        <td class="hide-sm">${supplierNames(db, { skuId: s.id })}</td>
        <td class="num">${s.widthCm ? `${s.widthCm} cm` : '—'}</td>
        <td class="num">${fmt.money(s.buyPrice)}${latestPriceNote(db, { skuId: s.id })}</td>
        <td class="num">${fmt.money(s.sellPrice)}</td>
        <td>${s.active === false ? badge('Nonaktif / dormant', 'danger') : badge('Aktif', 'ok')}</td>
        <td class="right"><div class="row" style="justify-content:flex-end">${role === 'manager' ? `<button class="btn btn-sm btn-ghost" data-price-sku="${s.id}">Harga</button><button class="btn btn-sm" data-edit-sku="${s.id}">Edit</button>` : ''}</div></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="card-pad"><p class="xs muted">Harga beli master mengikuti harga pemasok terbaru. Swatch tidak pernah diturunkan dari kode warna; bila belum diset, operator mencocokkan kode + lot secara fisik.</p></div>
  </section>`;
}

function renderParts(ctx) {
  const { db, role } = ctx;
  return `<div class="row-between" style="margin-bottom:12px">
      <div><h2>Spare part</h2><p class="xs muted">Brand, gambar, pemasok, harga terbaru, dan status aktif. Stok selalu pcs.</p></div>
      ${role === 'manager' ? `<button class="btn btn-primary" type="button" data-act="new-part">${icon('plus')} Tambah spare part</button>` : ''}
    </div>
    <section class="card">
    <div class="table-wrap"><table class="data">
      <thead><tr><th>SKU / brand</th><th>Nama</th><th class="hide-sm">Pemasok</th><th>Kategori</th><th class="num">Beli</th><th class="num">Jual</th><th class="num">Stok</th><th>Status</th><th><span class="sr-only">Aksi</span></th></tr></thead>
      <tbody>${db.parts.map((p) => {
        const qty = db.partStock.filter((s) => s.partId === p.id).reduce((a, s) => a + s.qty, 0);
        return `<tr>
          <td><div class="cell-main">${p.image ? `<img src="${esc(p.image)}" alt="Foto ${esc(p.name)}" class="thumb zoomable" data-zoom="${esc(p.image)}" data-zoom-title="${esc(p.sku)} · ${esc(p.name)}" role="button" tabindex="0" aria-label="Perbesar foto ${esc(p.name)}" />` : `<span class="thumb thumb-empty">${icon('box')}</span>`}<div class="txt"><strong class="mono">${esc(p.sku)}</strong><span>${esc(p.brand || 'Tanpa brand')}</span></div></div></td>
          <td>${esc(p.name)}<div class="xs muted">${esc(p.id)}${p.parentPartId ? ` · induk ${esc(byId(db.parts, p.parentPartId)?.sku ?? p.parentPartId)}` : ''}</div></td>
          <td class="hide-sm">${supplierNames(db, { partId: p.id })}</td>
          <td>${esc(byId(db.categories, p.categoryId)?.name ?? '—')}</td>
          <td class="num">${fmt.money(p.buyPrice)}${latestPriceNote(db, { partId: p.id })}</td>
          <td class="num">${fmt.money(p.sellPrice)}</td>
          <td class="num">${fmt.pcs(qty)} pcs</td>
          <td>${p.active === false ? badge('Nonaktif', 'danger') : badge('Aktif', 'ok')}</td>
          <td class="right"><div class="row" style="justify-content:flex-end">${role === 'manager' ? `<button class="btn btn-sm btn-ghost" data-price-part="${p.id}">Harga</button><button class="btn btn-sm" data-edit-part="${p.id}">Edit</button>` : ''}</div></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="card-pad"><p class="xs muted">Harga beli master mengikuti harga pemasok terbaru. Spare part selalu bilangan bulat pcs; tidak pernah diubah menjadi roll atau meter.</p></div>
  </section>`;
}

function renderDrivers(ctx) {
  const { db, role } = ctx;
  const drivers = db.drivers ?? [];
  const transports = db.transportCompanies ?? [];
  return `<div class="row-between" style="margin-bottom:12px">
      <div><h2>Driver & transport</h2><p class="xs muted">Driver punya akun pengguna dan terhubung ke transport internal/pihak ketiga.</p></div>
      ${role === 'manager' ? `<div class="row"><button class="btn btn-primary" type="button" data-act="new-driver">${icon('plus')} Driver</button><button class="btn" type="button" data-act="new-transport">${icon('plus')} Transport</button></div>` : ''}
    </div>
    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><div><h2>Driver</h2><p>Nama, akun pengguna, telepon, kendaraan, nomor polisi.</p></div><span class="badge no-dot">${drivers.length}</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Driver</th><th>Akun</th><th>Telepon</th><th>Transport</th><th>Kendaraan</th><th>Status</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${drivers.map((d) => {
          const user = byId(db.users, d.userId);
          const transport = byId(db.transportCompanies, d.transportId);
          return `<tr>
            <td><strong>${esc(d.name)}</strong><div class="xs muted">${esc(d.id)}</div></td>
            <td class="small">${user ? `${esc(user.name)}<div class="xs muted">${esc(user.role)}</div>` : '<span class="muted">Belum tertaut</span>'}</td>
            <td>${esc(d.phone || '—')}</td>
            <td class="small">${esc(transport?.name ?? '—')}</td>
            <td>${esc(VEHICLE_TYPES[d.vehicleType]?.label ?? d.vehicleType)}<div class="xs muted mono">${esc(d.plateNumber || '—')}</div></td>
            <td>${d.active === false ? badge('Nonaktif', 'danger') : badge('Aktif', 'ok')}</td>
            <td class="right">${role === 'manager' ? `<button class="btn btn-sm" data-edit-driver="${d.id}">Edit</button>` : ''}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="7" class="muted">Belum ada driver.</td></tr>'}</tbody>
      </table></div>
    </section>
    <section class="card">
      <div class="card-head"><div><h2>Transport perusahaan</h2><p>Internal, Lalamove, GoSend, kargo Bali, dan vendor lain.</p></div><span class="badge no-dot">${transports.length}</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Transport</th><th>Jenis</th><th>Kontak</th><th>Telepon</th><th>Alamat</th><th>Status</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${transports.map((t) => `<tr>
          <td><strong>${esc(t.name)}</strong><div class="xs muted mono">${esc(t.code)} · ${esc(t.id)}</div></td>
          <td>${badge(TRANSPORT_TYPES[t.type]?.label ?? t.type, t.type === 'internal' ? 'teal' : 'copper')}</td>
          <td>${esc(t.contact || '—')}</td>
          <td>${esc(t.phone || '—')}</td>
          <td class="small muted">${esc(t.address || '—')}</td>
          <td>${t.active === false ? badge('Nonaktif', 'danger') : badge('Aktif', 'ok')}</td>
          <td class="right">${role === 'manager' ? `<button class="btn btn-sm" data-edit-transport="${t.id}">Edit</button>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="muted">Belum ada transport.</td></tr>'}</tbody>
      </table></div>
      <div class="card-pad"><p class="xs muted">Transport nonaktif tidak muncul pada pilihan driver/surat jalan baru. Driver tetap menyimpan snapshot nama dan kendaraannya.</p></div>
    </section>`;
}

function renderCategories(ctx) {
  const { db, role } = ctx;
  return `<div class="grid grid-2">
    <section class="card">
      <div class="card-head"><div><h2>Kategori</h2><p>Nama dapat diubah; ID tetap.</p></div>${role === 'manager' ? `<button class="btn btn-sm" data-act="new-category">Tambah</button>` : ''}</div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>ID</th><th>Nama</th><th class="num">Produk</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${db.categories.map((c) => {
          const count = db.skus.filter((s) => db.collections.find((x) => x.id === s.collectionId)?.categoryId === c.id).length
            + db.parts.filter((p) => p.categoryId === c.id).length;
          return `<tr><td class="mono">${esc(c.id)}</td><td>${esc(c.name)}</td><td class="num">${count}</td>
            <td class="right">${role === 'manager' ? `<button class="btn btn-sm" data-rename-category="${c.id}">Ubah</button>` : ''}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>
    <section class="card">
      <div class="card-head"><div><h2>Koleksi</h2><p>Grup warna dalam satu seri kain. Nama dapat diubah; ID dan riwayat tetap.</p></div>${role === 'manager' ? `<button class="btn btn-sm" data-act="new-collection">Tambah</button>` : ''}</div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Koleksi</th><th>Kategori</th><th class="num">Warna</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${db.collections.map((c) => `<tr>
          <td><strong>${esc(c.name)}</strong><div class="xs muted">${esc(c.description)}</div></td>
          <td>${esc(byId(db.categories, c.categoryId)?.name ?? '—')}</td>
          <td class="num">${db.skus.filter((s) => s.collectionId === c.id).length}</td>
          <td class="right">${role === 'manager' ? `<button class="btn btn-sm" data-edit-collection="${c.id}">Ubah</button>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>
  </div>`;
}

function renderWarehouses(ctx) {
  const { db, role } = ctx;
  if (role !== 'manager') {
    return `<div class="notice notice-info">${icon('alert')}<div>Hanya manajer yang dapat menambah atau mengubah gudang.</div></div>
      <div class="grid grid-3" style="margin-top:12px">${db.warehouses.map((w) => warehouseCard(ctx, w, false)).join('')}</div>`;
  }
  return `<div class="row-between" style="margin-bottom:12px">
      <div><h2>Gudang & lokasi</h2><p class="xs muted">Gudang nonaktif tetap menyimpan riwayat, tetapi tidak muncul di pemilih operasional.</p></div>
      <button class="btn btn-primary" type="button" data-act="new-warehouse">${icon('plus')} Tambah gudang</button>
    </div>
    <div class="grid grid-3">${db.warehouses.map((w) => warehouseCard(ctx, w, true)).join('')}</div>`;
}

function warehouseCard(ctx, w, editable) {
  const { db } = ctx;
  const active = w.active !== false;
  return `<section class="card card-pad" ${active ? '' : 'style="opacity:.82"'}>
    <div class="row-between">
      <h2>${esc(w.name)}</h2>
      ${active ? badge(w.code, 'teal') : badge('Nonaktif', 'muted')}
    </div>
    <p class="small muted" style="margin-top:6px">${esc(w.address || 'Alamat belum diisi')}</p>
    <hr class="divider" />
    <div class="stack-sm">
      <div class="row-between"><span class="small muted">Kode gudang</span><span class="small mono">${esc(w.code)}</span></div>
      <div class="row-between"><span class="small muted">Prefiks rak</span><span class="small mono">${esc(w.binPrefix)}</span></div>
      <div class="row-between"><span class="small muted">Telepon</span><span class="small">${esc(w.phone || '—')}</span></div>
      <div class="row-between"><span class="small muted">Roll fisik</span><span class="small">${db.rolls.filter((r) => r.warehouseId === w.id && !r.transit && ['available', 'quarantine'].includes(r.status)).length}</span></div>
    </div>
    <p class="xs muted" style="margin-top:10px">Format lokasi: ${esc(w.binPrefix)}-01-02 (gudang → zona → rak → posisi).</p>
    ${editable ? `<div class="row" style="margin-top:10px"><button class="btn btn-sm" type="button" data-edit-warehouse="${w.id}">${icon('settings')} Edit</button></div>` : ''}
  </section>`;
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
        <div class="row-between"><span class="small muted">Aplikasi</span><span class="small">v${esc(APP_VERSION)}</span></div>
        <div class="row-between"><span class="small muted">Skema data</span><span class="small">v${esc(SCHEMA_VERSION)}</span></div>
        <div class="row-between"><span class="small muted">Dataset</span><span class="small">${esc(db.meta.label)}</span></div>
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
  const trail = sku ? auditTrail(db, 'sku', sku.id, 6) : [];
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
      <div class="span-2">
        <div class="row-between"><span class="field-label">Foto produk (opsional)</span><img data-image-preview src="${esc(sku?.image ?? '')}" alt="" class="thumb-lg" ${sku?.image ? '' : 'hidden'} /></div>
        <input class="input" type="file" name="imageFile" accept="image/*" style="margin-top:6px" />
        <input type="hidden" name="image" value="${esc(sku?.image ?? '')}" />
        <span class="hint">Gambar disimpan sebagai data URL kecil di perangkat ini (maks. 250 KB).</span>
      </div>
      ${field('Catatan produk', `<textarea class="textarea" name="notes" placeholder="Komposisi, instruksi cuci, atau catatan QC.">${esc(sku?.notes ?? '')}</textarea>`, { full: true })}
    </div>
    ${trail.length ? `<hr class="divider" /><div class="xs muted">Riwayat perubahan</div><ul class="timeline" style="margin-top:8px">${trail.map((a) => `<li><div class="t-head"><strong>${esc(a.action)}</strong><time>${esc(new Date(a.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</time></div><div class="t-body">${esc(a.userName)} · ${esc(a.detail)}</div></li>`).join('')}</ul>` : ''}`,
    onMount(form) {
      const checkbox = form.useSwatch;
      const color = form.swatch;
      const sync = () => { color.disabled = !checkbox.checked; };
      checkbox.addEventListener('change', sync);
      sync();
      form.imageFile.addEventListener('change', async () => {
        try {
          const data = await imageToDataUrl(form.imageFile.files?.[0]);
          if (data) {
            form.image.value = data;
            form.querySelector('[data-image-preview]').src = data;
            form.querySelector('[data-image-preview]').hidden = false;
          }
        } catch (err) {
          toast(err.message, { tone: 'error' });
        }
      });
    },
    onSubmit(form, close) {
      const useSwatch = form.useSwatch.checked;
      ctx.store.update((d) => saveSku(d, {
        id: sku?.id ?? null,
        collectionId: form.collection.value,
        code: form.code.value,
        colourCode: form.colourCode.value,
        colourName: form.colourName.value,
        swatch: useSwatch ? form.swatch.value : null,
        widthCm: Number(form.widthCm.value || 0),
        buyPrice: Number(String(form.buyPrice.value).replace(/\D/g, '')) || 0,
        sellPrice: Number(String(form.sellPrice.value).replace(/\D/g, '')) || 0,
        active: form.active.value === '1',
        image: form.image.value,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast(isNew ? 'Produk kain dibuat.' : 'Produk diperbarui; ID dan riwayat tetap.', { tone: 'success' });
    },
  });
}

function openPart(ctx, part = null) {
  const isNew = !part;
  const trail = part ? auditTrail(ctx.db, 'part', part.id, 6) : [];
  openModal({
    title: isNew ? 'Spare part baru' : `Edit ${part.name}`,
    description: 'Brand, gambar, harga, dan status aktif. SKU adalah identitas tampilan; ID internal tetap.',
    wide: true,
    submitLabel: isNew ? 'Buat spare part' : 'Simpan',
    body: `<div class="form-grid">
      ${field('SKU', `<input class="input" name="sku" value="${esc(part?.sku ?? '')}" placeholder="REL-300" required />`)}
      ${field('Nama', `<input class="input" name="name" value="${esc(part?.name ?? '')}" required />`)}
      ${field('Brand', `<input class="input" name="brand" value="${esc(part?.brand ?? '')}" placeholder="Contoh: Somfy / lokal" />`)}
      ${field('Kategori', `<select class="select" name="category">${ctx.db.categories.map((c) => `<option value="${c.id}" ${part?.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
      ${field('Part induk (opsional)', `<select class="select" name="parent"><option value="">— Tanpa induk —</option>${ctx.db.parts.filter((p) => p.id !== part?.id).map((p) => `<option value="${p.id}" ${part?.parentPartId === p.id ? 'selected' : ''}>${esc(p.sku)} · ${esc(p.name)} — ${esc(byId(ctx.db.categories, p.categoryId)?.name ?? '')}</option>`).join('')}</select>`, { hint: 'Child harus satu kategori dengan induk.' })}
      ${field('Harga beli / pcs', `<input class="input" name="buyPrice" inputmode="numeric" value="${part?.buyPrice ?? ''}" />`)}
      ${field('Harga jual / pcs', `<input class="input" name="sellPrice" inputmode="numeric" value="${part?.sellPrice ?? ''}" />`)}
      ${field('Status', `<select class="select" name="active"><option value="1" ${part?.active !== false ? 'selected' : ''}>Aktif</option><option value="0" ${part?.active === false ? 'selected' : ''}>Nonaktif</option></select>`)}
      <div class="span-2">
        <div class="row-between"><span class="field-label">Foto part (opsional)</span><img data-image-preview src="${esc(part?.image ?? '')}" alt="" class="thumb-lg" ${part?.image ? '' : 'hidden'} /></div>
        <input class="input" type="file" name="imageFile" accept="image/*" style="margin-top:6px" />
        <input type="hidden" name="image" value="${esc(part?.image ?? '')}" />
      </div>
      ${field('Catatan teknis', `<textarea class="textarea" name="notes" placeholder="Material, ukuran, kompatibilitas rel/motor.">${esc(part?.notes ?? '')}</textarea>`, { full: true })}
    </div>
    ${trail.length ? `<hr class="divider" /><div class="xs muted">Riwayat perubahan</div><ul class="timeline" style="margin-top:8px">${trail.map((a) => `<li><div class="t-head"><strong>${esc(a.action)}</strong><time>${esc(new Date(a.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</time></div><div class="t-body">${esc(a.userName)} · ${esc(a.detail)}</div></li>`).join('')}</ul>` : ''}`,
    onMount(form) {
      form.imageFile.addEventListener('change', async () => {
        try {
          const data = await imageToDataUrl(form.imageFile.files?.[0]);
          if (data) {
            form.image.value = data;
            form.querySelector('[data-image-preview]').src = data;
            form.querySelector('[data-image-preview]').hidden = false;
          }
        } catch (err) {
          toast(err.message, { tone: 'error' });
        }
      });
    },
    onSubmit(form, close) {
      ctx.store.update((db) => savePart(db, {
        id: part?.id ?? null,
        sku: form.sku.value,
        name: form.name.value,
        brand: form.brand.value,
        categoryId: form.category.value,
        parentPartId: form.parent.value || null,
        buyPrice: Number(String(form.buyPrice.value).replace(/\D/g, '')) || 0,
        sellPrice: Number(String(form.sellPrice.value).replace(/\D/g, '')) || 0,
        active: form.active.value === '1',
        image: form.image.value,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast(isNew ? 'Spare part dibuat.' : 'Spare part diperbarui.', { tone: 'success' });
    },
  });
}

function openPriceModal(ctx, { kind, item }) {
  const { db } = ctx;
  const isFabric = kind === 'sku';
  const filter = isFabric ? { skuId: item.id } : { partId: item.id };
  const history = supplierPriceHistory(db, filter);
  const latest = latestSupplierPrice(db, filter);
  const defaultSupplier = latest?.supplierId ?? db.suppliers[0]?.id ?? '';
  const label = isFabric ? `${item.code}` : `${item.sku} · ${item.name}`;

  openModal({
    title: `Harga pemasok · ${label}`,
    description: 'Harga baru langsung dipakai sebagai default saat membuat PO dan memperbarui harga beli master.',
    wide: true,
    submitLabel: 'Simpan harga',
    body: `
      <div class="notice notice-info" style="margin-bottom:12px">${icon('wallet')}<div><strong>Harga beli master saat ini ${fmt.money(item.buyPrice)}.</strong> ${latest ? `Terakhir dari ${esc(byId(db.suppliers, latest.supplierId)?.name ?? '—')} · ${esc(latest.currency ?? 'IDR')} ${Number(latest.price).toLocaleString('id-ID')} · berlaku ${esc(latest.validFrom)}.` : 'Belum ada harga pemasok tercatat.'}</div></div>
      <div class="table-wrap" style="margin-bottom:14px"><table class="data">
        <thead><tr><th>Pemasok</th><th class="num">Harga</th><th class="num">IDR</th><th>MOQ</th><th>Berlaku</th></tr></thead>
        <tbody>${history.map((r) => `<tr>
          <td>${esc(byId(db.suppliers, r.supplierId)?.name ?? r.supplierId)}</td>
          <td class="num">${esc(r.currency ?? 'IDR')} ${Number(r.price).toLocaleString('id-ID')}</td>
          <td class="num">${fmt.money(r.priceIdr ?? r.price)}</td>
          <td class="num">${isFabric ? (r.moqMm ? fmt.m(r.moqMm) : '—') : (r.moqPcs ? `${r.moqPcs} pcs` : '—')}</td>
          <td class="small">${esc(r.validFrom ?? '—')}${r.validTo ? ` → ${esc(r.validTo)}` : ''}</td>
        </tr>`).join('') || `<tr><td colspan="5" class="muted">Belum ada riwayat harga.</td></tr>`}</tbody>
      </table></div>
      <div class="form-grid">
        ${field('Pemasok', `<select class="select" name="supplier">${db.suppliers.map((s) => `<option value="${s.id}" data-currency="${esc(s.currency ?? 'IDR')}" ${s.id === defaultSupplier ? 'selected' : ''}>${esc(s.name)} · ${esc(s.currency ?? 'IDR')}</option>`).join('')}</select>`)}
        ${field(isFabric ? 'Harga / m' : 'Harga / pcs', `<input class="input" name="price" inputmode="decimal" placeholder="${isFabric ? '69500' : '90000'}" required />`, { hint: 'Masukkan dalam mata uang pemasok.' })}
        ${field(isFabric ? 'MOQ (m)' : 'MOQ (pcs)', `<input class="input" name="moq" inputmode="numeric" placeholder="${isFabric ? '60' : '12'}" />`)}
        ${field('Berlaku dari', `<input class="input" type="date" name="validFrom" value="${todayJakarta()}" />`)}
        ${field('Berlaku sampai', `<input class="input" type="date" name="validTo" />`)}
        ${field('Catatan', `<input class="input" name="notes" placeholder="Kenaikan harga, promosi, syarat kirim" />`, { full: true })}
      </div>
      <div class="notice" data-currency-hint>${icon('globe')}<div>Harga disimpan dalam mata uang pemasok dan dikonversi ke IDR dengan kurs terbaru.</div></div>
    `,
    onMount(form) {
      const hint = form.querySelector('[data-currency-hint]');
      const sync = () => {
        const sup = db.suppliers.find((s) => s.id === form.supplier.value);
        hint.innerHTML = `${icon('globe')}<div>Harga dalam <strong>${esc(sup?.currency ?? 'IDR')}</strong>. ${sup?.currency === 'IDR' ? 'Tanpa konversi kurs.' : 'Dikonversi ke IDR memakai kurs CNY terbaru saat disimpan.'}</div>`;
      };
      form.supplier.addEventListener('change', sync);
      sync();
    },
    onSubmit(form, close) {
      const supplier = db.suppliers.find((s) => s.id === form.supplier.value);
      const raw = String(form.price.value ?? '').trim();
      const price = supplier?.currency === 'IDR'
        ? Number(raw.replace(/\D/g, ''))
        : Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, ''));
      const moq = Number(String(form.moq.value ?? '').replace(/\D/g, '')) || 0;
      const saved = ctx.store.update((db2) => saveSupplierPrice(db2, {
        supplierId: form.supplier.value,
        skuId: isFabric ? item.id : null,
        partId: isFabric ? null : item.id,
        price,
        moqMm: isFabric ? moq * 1000 : null,
        moqPcs: isFabric ? null : moq,
        validFrom: form.validFrom.value,
        validTo: form.validTo.value || null,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast(`Harga ${label} diperbarui: ${saved.record.currency} ${Number(saved.record.price).toLocaleString('id-ID')} → ${fmt.money(saved.priceIdr)}.`, { tone: 'success' });
    },
  });
}

function openDriver(ctx, driver = null) {
  const editing = Boolean(driver);
  openModal({
    title: editing ? `Edit driver ${driver.name}` : 'Driver baru',
    description: 'Data ini muncul pada surat jalan dan menyimpan nama driver serta kendaraannya.',
    submitLabel: editing ? 'Simpan driver' : 'Buat driver',
    body: `<div class="form-grid">
      ${field('Nama driver', `<input class="input" name="name" value="${esc(driver?.name ?? '')}" required />`)}
      ${field('Telepon', `<input class="input" name="phone" value="${esc(driver?.phone ?? '')}" />`)}
      ${field('Jenis kendaraan', `<select class="select" name="vehicleType">${Object.entries(VEHICLE_TYPES).map(([k, v]) => `<option value="${k}" ${driver?.vehicleType === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`)}
      ${field('Nomor polisi', `<input class="input" name="plateNumber" value="${esc(driver?.plateNumber ?? '')}" placeholder="B 1234 CD" />`)}
      ${field('Transport', `<select class="select" name="transport"><option value="">— Tanpa transport —</option>${(ctx.db.transportCompanies ?? []).map((t) => `<option value="${t.id}" ${driver?.transportId === t.id ? 'selected' : ''}>${esc(t.name)} · ${esc(TRANSPORT_TYPES[t.type]?.label ?? t.type)}</option>`).join('')}</select>`, { hint: 'Internal atau pihak ketiga.' })}
      ${editing ? `<label class="checkline span-2"><input type="checkbox" name="active" ${driver.active !== false ? 'checked' : ''} /> Driver aktif dan dapat dipilih</label>` : ''}
      ${field('Catatan', `<input class="input" name="notes" value="${esc(driver?.notes ?? '')}" placeholder="Area, kapasitas, atau catatan" />`, { full: true })}
    </div>`,
    onSubmit(form, close) {
      ctx.store.update((db) => saveDriver(db, {
        id: driver?.id ?? null,
        name: form.name.value,
        phone: form.phone.value,
        vehicleType: form.vehicleType.value,
        plateNumber: form.plateNumber.value,
        transportId: form.transport.value || null,
        active: editing ? form.active.checked : true,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast(editing ? 'Driver diperbarui.' : 'Driver dibuat.', { tone: 'success' });
    },
  });
}

function openTransport(ctx, transport = null) {
  const editing = Boolean(transport);
  openModal({
    title: editing ? `Edit ${transport.name}` : 'Transport baru',
    description: 'Transport internal atau pihak ketiga. Data ini dipakai pada driver dan surat jalan.',
    submitLabel: editing ? 'Simpan transport' : 'Buat transport',
    body: `<div class="form-grid">
      ${field('Kode', `<input class="input" name="code" value="${esc(transport?.code ?? '')}" placeholder="bali-kargo" required />`)}
      ${field('Nama', `<input class="input" name="name" value="${esc(transport?.name ?? '')}" required />`)}
      ${field('Jenis', `<select class="select" name="type">${Object.entries(TRANSPORT_TYPES).map(([k, v]) => `<option value="${k}" ${transport?.type === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`)}
      ${field('Kontak', `<input class="input" name="contact" value="${esc(transport?.contact ?? '')}" />`)}
      ${field('Telepon', `<input class="input" name="phone" value="${esc(transport?.phone ?? '')}" />`)}
      ${field('Alamat', `<input class="input" name="address" value="${esc(transport?.address ?? '')}" />`)}
      ${editing ? `<label class="checkline span-2"><input type="checkbox" name="active" ${transport.active !== false ? 'checked' : ''} /> Transport aktif</label>` : ''}
      ${field('Catatan', `<input class="input" name="notes" value="${esc(transport?.notes ?? '')}" />`, { full: true })}
    </div>`,
    onSubmit(form, close) {
      ctx.store.update((db) => saveTransport(db, {
        id: transport?.id ?? null,
        code: form.code.value,
        name: form.name.value,
        type: form.type.value,
        contact: form.contact.value,
        phone: form.phone.value,
        address: form.address.value,
        active: editing ? form.active.checked : true,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast(editing ? 'Transport diperbarui.' : 'Transport dibuat.', { tone: 'success' });
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

function openWarehouse(ctx, warehouse = null) {
  const editing = Boolean(warehouse);
  openModal({
    title: editing ? `Edit ${warehouse.name}` : 'Gudang baru',
    description: 'Kode tampilan boleh berubah; ID internal dan riwayat tetap. Nonaktifkan hanya jika stok sudah kosong.',
    sub: undefined,
    submitLabel: editing ? 'Simpan gudang' : 'Buat gudang',
    body: `<div class="form-grid">
      ${field('Kode gudang', `<input class="input" name="code" maxlength="6" value="${esc(warehouse?.code ?? '')}" placeholder="JKT" required />`, { hint: '2–6 huruf/angka, unik.' })}
      ${field('Nama gudang', `<input class="input" name="name" value="${esc(warehouse?.name ?? '')}" placeholder="Gudang Pusat Jakarta" required />`)}
      ${field('Prefiks rak', `<input class="input" name="binPrefix" maxlength="3" value="${esc(warehouse?.binPrefix ?? '')}" placeholder="A" required />`, { hint: 'Dipakai label lokasi, mis. A-01-02.' })}
      ${field('Telepon', `<input class="input" name="phone" value="${esc(warehouse?.phone ?? '')}" />`)}
      ${field('Alamat', `<input class="input" name="address" value="${esc(warehouse?.address ?? '')}" />`, { full: true })}
      ${editing ? `<label class="checkline span-2"><input type="checkbox" name="active" ${warehouse.active !== false ? 'checked' : ''} /> Gudang aktif dan dapat dipilih untuk transaksi</label>` : ''}
    </div>`,
    onSubmit(form, close) {
      const saved = ctx.store.update((db) => saveWarehouse(db, {
        id: warehouse?.id ?? null,
        code: form.code.value,
        name: form.name.value,
        binPrefix: form.binPrefix.value,
        phone: form.phone.value,
        address: form.address.value,
        active: editing ? form.active.checked : true,
        user: ctx.user,
      }));
      close();
      if (ctx.ui.warehouseId === saved.id && saved.active === false) {
        const next = activeWarehouses(ctx.store.db).find((w) => w.id !== saved.id);
        if (next) ctx.store.setUi({ warehouseId: next.id });
      }
      toast(editing ? 'Gudang diperbarui.' : 'Gudang baru dibuat.', { tone: 'success' });
    },
  });
}

function openCollection(ctx, collection = null) {
  const editing = Boolean(collection);
  openModal({
    title: editing ? `Edit ${collection.name}` : 'Koleksi baru',
    submitLabel: editing ? 'Simpan' : 'Buat koleksi',
    body: `<div class="form-grid">
      ${field('Nama koleksi', `<input class="input" name="name" value="${esc(collection?.name ?? '')}" required />`)}
      ${field('Kategori', `<select class="select" name="category">${ctx.db.categories.map((c) => `<option value="${c.id}" ${collection?.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
      ${field('Deskripsi', `<input class="input" name="description" value="${esc(collection?.description ?? '')}" />`, { full: true })}
    </div>`,
    onSubmit(form, close) {
      ctx.store.update((db) => {
        if (editing) {
          renameCollection(db, { id: collection.id, name: form.name.value, description: form.description.value, user: ctx.user });
        } else {
          createCollection(db, { name: form.name.value, categoryId: form.category.value, description: form.description.value, user: ctx.user });
        }
      });
      close();
      toast(editing ? 'Koleksi diperbarui; label SKU ikut menyesuaikan.' : 'Koleksi dibuat.', { tone: 'success' });
    },
  });
}

export function mount(ctx) {
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    tab = btn.dataset.tab;
    ctx.store.emit();
  }));
  document.querySelector('[data-act="new-product"]')?.addEventListener('click', () => openSku(ctx));
  document.querySelector('[data-act="new-part"]')?.addEventListener('click', () => openPart(ctx));
  document.querySelectorAll('[data-edit-sku]').forEach((btn) => btn.addEventListener('click', () => {
    const sku = ctx.db.skus.find((s) => s.id === btn.dataset.editSku);
    if (sku) openSku(ctx, sku);
  }));
  document.querySelectorAll('[data-edit-part]').forEach((btn) => btn.addEventListener('click', () => {
    const part = ctx.db.parts.find((p) => p.id === btn.dataset.editPart);
    if (part) openPart(ctx, part);
  }));
  document.querySelectorAll('[data-price-sku]').forEach((btn) => btn.addEventListener('click', () => {
    const sku = ctx.db.skus.find((s) => s.id === btn.dataset.priceSku);
    if (sku) openPriceModal(ctx, { kind: 'sku', item: sku });
  }));
  document.querySelectorAll('[data-price-part]').forEach((btn) => btn.addEventListener('click', () => {
    const part = ctx.db.parts.find((p) => p.id === btn.dataset.pricePart);
    if (part) openPriceModal(ctx, { kind: 'part', item: part });
  }));
  document.querySelector('[data-act="new-category"]')?.addEventListener('click', () => openCategory(ctx));
  document.querySelector('[data-act="new-driver"]')?.addEventListener('click', () => openDriver(ctx));
  document.querySelector('[data-act="new-transport"]')?.addEventListener('click', () => openTransport(ctx));
  document.querySelectorAll('[data-edit-driver]').forEach((btn) => btn.addEventListener('click', () => {
    const driver = (ctx.db.drivers ?? []).find((d) => d.id === btn.dataset.editDriver);
    if (driver) openDriver(ctx, driver);
  }));
  document.querySelectorAll('[data-edit-transport]').forEach((btn) => btn.addEventListener('click', () => {
    const transport = (ctx.db.transportCompanies ?? []).find((t) => t.id === btn.dataset.editTransport);
    if (transport) openTransport(ctx, transport);
  }));
  document.querySelector('[data-act="new-warehouse"]')?.addEventListener('click', () => openWarehouse(ctx));
  document.querySelectorAll('[data-edit-warehouse]').forEach((btn) => btn.addEventListener('click', () => {
    const wh = ctx.db.warehouses.find((w) => w.id === btn.dataset.editWarehouse);
    if (wh) openWarehouse(ctx, wh);
  }));
  document.querySelector('[data-act="new-collection"]')?.addEventListener('click', () => openCollection(ctx));
  document.querySelectorAll('[data-edit-collection]').forEach((btn) => btn.addEventListener('click', () => {
    const col = ctx.db.collections.find((c) => c.id === btn.dataset.editCollection);
    if (col) openCollection(ctx, col);
  }));
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
