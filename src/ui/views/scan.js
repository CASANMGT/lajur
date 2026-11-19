/** Public QR scan page: stock status and roll cut history without the app shell. */

import store from '../../data/store.js';
import { esc, icon, badge, fmt } from '../dom.js';
import { byId, formatDateLong } from '../../domain/core.js';
import { availableMm } from '../../domain/inventory.js';

export function renderScan(app, route, user = null) {
  const db = store.db;
  const code = route.id ? decodeURIComponent(route.id) : '';
  const roll = db.rolls.find((r) => r.id === code || r.barcode === code) ?? null;
  const sku = roll ? byId(db.skus, roll.skuId) : null;
  const wh = roll ? byId(db.warehouses, roll.transit?.toWarehouseId ?? roll.warehouseId) : null;
  const cuts = roll
    ? db.movements
      .filter((m) => (m.rollId === roll.id || m.parentRollId === roll.id)
        && m.beforeMm != null && m.afterMm != null && m.afterMm < m.beforeMm)
      .slice()
      .sort((a, b) => String(b.at ?? b.date).localeCompare(String(a.at ?? a.date)))
    : [];
  const totalCut = cuts.reduce((a, m) => a + (Number(m.qtyMm) || 0), 0);
  const detailHref = roll ? `#/stok/${encodeURIComponent(roll.id)}` : '#/stok';
  app.innerHTML = `
    <div class="content" style="max-width:760px;margin:0 auto;padding:20px">
      <div class="row-between" style="margin-bottom:16px">
        <a class="brand" href="#/ringkasan" style="pointer-events:none">
          <span class="brand-word"><strong>lavishome</strong><span>Gudang tekstil</span></span>
        </a>
        ${badge('Scan stok', 'teal')}
      </div>
      ${roll ? `
        <section class="card card-pad">
          <div class="row-between" style="align-items:flex-start">
            <div>
              <div class="eyebrow">STATUS STOK ROLL</div>
              <h1 class="mono" style="font-size:1.7rem">${esc(roll.id)}</h1>
              <p class="sub" style="margin:4px 0 0">${esc(sku?.collectionName ?? '—')} · ${esc(sku?.motive || sku?.clothType || '')} · ${esc(sku?.colourName || sku?.colourCode || '')}</p>
            </div>
            ${badge(roll.transit ? 'Transit' : roll.status === 'available' ? 'Tersedia' : roll.status, roll.transit ? 'info' : roll.status === 'available' ? 'ok' : 'warn')}
          </div>
          <div class="grid grid-3" style="margin-top:16px">
            <div><div class="xs muted">Stok aktual</div><div class="strong num" style="font-size:1.35rem">${fmt.m(roll.currentMm)}</div></div>
            <div><div class="xs muted">Tersedia</div><div class="strong num">${fmt.m(availableMm(roll))}</div></div>
            <div><div class="xs muted">Total dipotong</div><div class="strong num">${fmt.m(totalCut)}</div></div>
            <div><div class="xs muted">Lokasi</div><div class="strong">${esc(wh?.code ?? '—')} · ${esc(roll.bin || '—')}</div></div>
            <div><div class="xs muted">Lot</div><div class="strong mono">${esc(roll.lot)}</div></div>
            <div><div class="xs muted">Lebar</div><div class="strong">${esc(sku?.widthCm ?? '—')} cm</div></div>
          </div>
          <div class="notice ${user ? 'notice-info' : 'notice-warn'}" style="margin-top:16px">
            ${icon('alert')}
            <div><strong>${user ? 'Buka detail lengkap' : 'Login diperlukan untuk aksi stok'}.</strong>
              ${user ? 'Anda sudah login; detail penuh tersedia.' : 'Halaman scan ini hanya menampilkan status. Login untuk membuka detail roll, mutasi, dan aksi gudang.'}
              <div style="margin-top:10px"><a class="btn btn-primary btn-sm" href="${detailHref}">${user ? 'Buka detail stok' : 'Login / buka detail'}</a></div>
            </div>
          </div>
        </section>
        <section class="card" style="margin-top:16px">
          <div class="card-head"><div><h2>Riwayat potong & sisa</h2><p>Setiap potongan dan sisa meter setelah potong.</p></div><span class="badge no-dot">${cuts.length} potong</span></div>
          <div class="card-pad">
            ${cuts.length ? `<div class="table-wrap"><table class="data">
              <thead><tr><th>Tanggal</th><th class="num">Potong</th><th class="num">Sebelum</th><th class="num">Sisa setelah</th><th>Referensi</th><th>Catatan</th></tr></thead>
              <tbody>${cuts.map((m) => `<tr>
                <td class="small">${esc(formatDateLong(m.date))}</td>
                <td class="num strong">${fmt.m(m.qtyMm)}</td>
                <td class="num">${fmt.m(m.beforeMm)}</td>
                <td class="num strong">${fmt.m(m.afterMm)}</td>
                <td class="small mono">${esc(m.ref || '—')}</td>
                <td class="small">${esc(m.note || m.type || '')}</td>
              </tr>`).join('')}</tbody>
            </table></div>` : `<div class="empty" style="padding:18px">${icon('cut')}<strong>Belum ada potongan</strong><p>Stok roll masih ${fmt.m(roll.currentMm)}.</p></div>`}
          </div>
        </section>
      ` : `
        <section class="card card-pad">
          <div class="empty">
            ${icon('search')}
            <strong>Roll tidak ditemukan di perangkat ini</strong>
            <p>Data demo tersimpan lokal. Login ke perangkat yang memiliki dataset Lajur, atau import backup untuk melihat stok roll ${esc(code || '')}.</p>
            <a class="btn btn-primary" href="#/stok">Login / buka stok</a>
          </div>
        </section>
      `}
      <p class="xs muted" style="text-align:center;margin-top:20px">QR ${esc(code || '—')} · Lavishome · data demo lokal</p>
    </div>`;
  document.title = roll ? `Scan ${roll.id} - Lavishome` : 'Scan stok - Lavishome';
}
