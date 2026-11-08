/** Katalog produk: daftar warna, lebar, harga jual, dan ketersediaan. */

import { esc, icon, fmt, badge, toast, printDocument, swatch } from '../dom.js';
import { byId } from '../../domain/core.js';
import { availableMm } from '../../domain/inventory.js';
import { pageHead, statCard } from './common.js';
import { printCatalogHtml } from './print.js';

let collection = '';

function availableFor(db, skuId, warehouseId) {
  return db.rolls
    .filter((r) => r.skuId === skuId && r.status === 'available' && !r.transit && (warehouseId === 'all' || r.warehouseId === warehouseId))
    .reduce((acc, r) => acc + availableMm(r), 0);
}

export function render(ctx) {
  const { db, ui } = ctx;
  const collections = db.collections.filter((c) => db.skus.some((s) => s.collectionId === c.id));
  const skus = db.skus
    .filter((s) => s.active !== false && !s.dormant)
    .filter((s) => !collection || s.collectionId === collection)
    .sort((a, b) => String(a.collectionName).localeCompare(String(b.collectionName)) || String(a.code).localeCompare(String(b.code)));
  const totalAvailable = skus.reduce((acc, s) => acc + availableFor(db, s.id, ui.warehouseId), 0);

  return `
    ${pageHead({
      eyebrow: 'Komersial',
      title: 'Katalog koleksi',
      sub: 'Daftar warna, lebar, harga jual per meter, dan ketersediaan. Cetak atau unduh PDF untuk pelanggan.',
      actions: `<button class="btn btn-primary" type="button" data-act="print-catalog">${icon('printer')} Cetak / PDF</button>`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'SKU aktif', value: String(skus.length), meta: `${collections.length} koleksi`, tone: 'accent', iconName: 'layers' })}
      ${statCard({ label: 'Tersedia', value: fmt.m(totalAvailable), meta: 'Di gudang terpilih' })}
      ${statCard({ label: 'Koleksi', value: String(collections.length), meta: 'Warna dan seri kain' })}
      ${statCard({ label: 'Harga', value: 'IDR / m', meta: 'Harga jual master' })}
    </div>
    <div class="filterbar" style="grid-template-columns:1fr auto">
      <div class="field"><label for="catalog-collection">Koleksi</label>
        <select class="select" id="catalog-collection">
          <option value="">Semua koleksi</option>
          ${collections.map((c) => `<option value="${c.id}" ${collection === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="row" style="align-items:flex-end"><span class="xs muted">Ketersediaan mengikuti gudang aktif.</span></div>
    </div>
    <div class="grid grid-3">
      ${skus.map((sku) => {
        const available = availableFor(db, sku.id, ui.warehouseId);
        return `<article class="card card-pad">
          <div class="row-between" style="align-items:flex-start">
            <div class="row">${swatch(sku, 'lg')}<div><strong>${esc(sku.collectionName)}</strong><div class="small muted">${esc(sku.colourName || sku.colourCode)} · ${esc(sku.code)}</div></div></div>
            ${sku.swatch ? `<span class="xs mono muted">${esc(sku.swatch)}</span>` : ''}
          </div>
          <hr class="divider" />
          <div class="grid3">
            <div class="kv"><span>Lebar</span><strong>${sku.widthCm ? `${sku.widthCm} cm` : '—'}</strong></div>
            <div class="kv"><span>Harga / m</span><strong>${fmt.money(sku.sellPrice)}</strong></div>
            <div class="kv"><span>Tersedia</span><strong>${fmt.m(available)}</strong></div>
          </div>
          <div class="row" style="margin-top:10px">${available > 0 ? badge('Tersedia', 'ok') : badge('Cek stok', 'warn')}<a class="small strong" href="#/stok">Lihat stok</a></div>
        </article>`;
      }).join('') || `<div class="empty">${icon('layers')}<strong>Tidak ada produk</strong><p>Ubah filter koleksi.</p></div>`}
    </div>`;
}

export function mount(ctx) {
  document.getElementById('catalog-collection')?.addEventListener('change', (e) => {
    collection = e.target.value;
    ctx.store.emit();
  });
  document.querySelector('[data-act="print-catalog"]')?.addEventListener('click', () => {
    const skus = ctx.db.skus
      .filter((s) => s.active !== false && !s.dormant)
      .filter((s) => !collection || s.collectionId === collection);
    printDocument('Katalog Lajur', printCatalogHtml(ctx.db, skus));
    toast('Katalog dibuka: Cetak atau Unduh PDF.', { tone: 'success' });
  });
}
