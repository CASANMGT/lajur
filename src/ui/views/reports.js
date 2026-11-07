/** Laporan: persediaan, penjualan, keuangan, kontrol. Semua dari record yang sama. */

import { esc, icon, fmt, badge, downloadFile, toCsv } from '../dom.js';
import { byId, todayJakarta } from '../../domain/core.js';
import {
  depositReport, inventoryValue, monthlySales, movementHistory, productPerformance, projectReport,
  returnsReport, salesSummary, sampleReport, slowMoving, stockBySku, stockByWarehouse,
  postedInvoices,
} from '../../domain/reports.js';
import { receivablesAging } from '../../domain/sales.js';
import { payablesAging } from '../../domain/purchasing.js';
import { pageHead, statCard, barChart, warehouseOf, movementRow } from './common.js';

let tab = 'persediaan';

const BUCKETS = [
  ['current', 'Belum jatuh tempo'],
  ['d1_30', '1â€“30 hari'],
  ['d31_60', '31â€“60 hari'],
  ['d61_90', '61â€“90 hari'],
  ['over90', '> 90 hari'],
];

export function render(ctx) {
  const { db, role } = ctx;
  const sales = salesSummary(db);
  const value = inventoryValue(db);
  const ar = receivablesAging(db);
  const ap = payablesAging(db);

  return `
    ${pageHead({
      eyebrow: 'Analitik',
      title: 'Laporan',
      sub: 'Saldo saat ini dihitung dari catatan yang sama dengan layar operasional. Bukan buku besar akuntansi.',
      actions: `<button class="btn" type="button" data-act="export-stock">${icon('download')} Ekspor stok</button>`,
    })}
    <div class="notice notice-info" style="margin-bottom:14px">${icon('alert')}<div><strong>Laporan keuangan bersifat perusahaan.</strong> Laba per gudang memerlukan kebijakan atribusi eksplisit; transfer internal tidak pernah menghasilkan laba. Angka di sini adalah ringkasan manajemen, bukan laporan pajak/akuntansi lengkap.</div></div>

    <div class="tabs" role="tablist">
      ${[['persediaan', 'Persediaan'], ['penjualan', 'Penjualan'], ['keuangan', 'Keuangan'], ['kontrol', 'Kontrol & audit']].map(([k, label]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${esc(label)}</button>`).join('')}
    </div>

    ${tab === 'persediaan' ? renderStock(ctx, value) : ''}
    ${tab === 'penjualan' ? renderSales(ctx, sales) : ''}
    ${tab === 'keuangan' ? renderFinance(ctx, ar, ap) : ''}
    ${tab === 'kontrol' ? renderControl(ctx) : ''}`;
}

function renderStock(ctx, value) {
  const { db } = ctx;
  const rows = stockByWarehouse(db);
  const skus = stockBySku(db);
  const slow = slowMoving(db, { days: 90 });
  return `
    <div class="grid grid-4" style="margin-bottom:16px">
      ${statCard({ label: 'Nilai kain', value: fmt.money(value.fabric), meta: 'Roll fisik, harga pokok' })}
      ${statCard({ label: 'Nilai spare part', value: fmt.money(value.parts), meta: 'Terpisah dari meter' })}
      ${statCard({ label: 'Nilai transit', value: fmt.money(value.transit), meta: 'Belum di gudang tujuan', tone: 'warn' })}
      ${statCard({ label: 'Total persediaan', value: fmt.money(value.total), meta: 'Tanpa transit' })}
    </div>

    <section class="card">
      <div class="card-head"><div><h2>Stok per gudang</h2><p>Saldo saat ini Â· ${esc(todayJakarta())}</p></div></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Gudang</th><th class="num">Roll</th><th class="num">Fisik</th><th class="num">Tersedia</th><th class="num">Terpesan</th><th class="num">Karantina</th><th class="num">Transit masuk</th><th class="num">Nilai</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td><strong>${esc(r.warehouse.code)}</strong> <span class="muted small">${esc(r.warehouse.name)}</span></td>
          <td class="num">${r.rolls}</td>
          <td class="num">${fmt.m(r.physicalMm)}</td>
          <td class="num">${fmt.m(r.availableMm)}</td>
          <td class="num">${fmt.m(r.reservedMm)}</td>
          <td class="num">${fmt.m(r.quarantineMm)}</td>
          <td class="num">${fmt.m(r.incomingMm)}</td>
          <td class="num">${fmt.money(r.value)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>

    <div class="section-title"><h2>Stok per produk & warna</h2><span class="small muted">Saldo saat ini</span></div>
    <section class="card">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>SKU</th><th>Koleksi / warna</th><th class="num">Roll</th><th class="num">Fisik</th><th class="num">Tersedia</th><th class="num">Terpesan</th><th class="num">Karantina</th></tr></thead>
        <tbody>${skus.map((r) => `<tr>
          <td class="mono">${esc(r.sku.code)}</td>
          <td>${esc(r.sku.collectionName)} ${esc(r.sku.colourName || r.sku.colourCode)}</td>
          <td class="num">${r.rolls}</td>
          <td class="num">${fmt.m(r.physicalMm)}</td>
          <td class="num">${fmt.m(r.availableMm)}</td>
          <td class="num">${fmt.m(r.reservedMm)}</td>
          <td class="num">${fmt.m(r.quarantineMm)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>

    <div class="grid grid-2" style="margin-top:16px">
      <section class="card">
        <div class="card-head"><div><h2>Slow-moving & dormant</h2><p>Tidak terjual â‰¥ 90 hari.</p></div></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Produk</th><th class="num">Stok</th><th>Terakhir jual</th></tr></thead>
          <tbody>${[...slow.fabric.map((s) => ({ label: `${s.sku.collectionName} ${s.sku.colourName || s.sku.colourCode}`, code: s.sku.code, qty: fmt.m(s.stockMm), last: s.lastSold })), ...slow.parts.map((s) => ({ label: s.part.name, code: s.part.sku, qty: `${fmt.pcs(s.qty)} pcs`, last: s.lastSold }))]
            .slice(0, 8).map((s) => `<tr><td><strong>${esc(s.label)}</strong><div class="xs muted mono">${esc(s.code)}</div></td><td class="num">${s.qty}</td><td>${s.last ? esc(s.last) : badge('Belum pernah', 'danger')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Tidak ada.</td></tr>'}</tbody>
        </table></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Riwayat mutasi</h2><p>30 entri terakhir Â· historis.</p></div></div>
        <div class="card-pad"><ul class="timeline">${movementHistory(db, { limit: 8 }).map((m) => movementRow(db, m)).join('')}</ul></div>
      </section>
    </div>`;
}

function renderSales(ctx, sales) {
  const { db } = ctx;
  const series = monthlySales(db, 6);
  const perf = productPerformance(db);
  const samples = sampleReport(db);
  const projects = projectReport(db);
  return `
    <div class="grid grid-4" style="margin-bottom:16px">
      ${statCard({ label: 'Omzet', value: fmt.money(sales.revenue), meta: `${sales.invoices} faktur terbit` })}
      ${statCard({ label: 'HPP', value: fmt.money(sales.cogs), meta: 'Snapshot harga pokok' })}
      ${statCard({ label: 'Margin kotor', value: fmt.money(sales.margin), meta: `${sales.marginPct.toFixed(1)}% dari omzet`, tone: 'accent' })}
      ${statCard({ label: 'Volume', value: `${(sales.metres / 1000).toFixed(0)} m`, meta: `${fmt.pcs(sales.pieces)} pcs part` })}
    </div>

    <div class="grid grid-main">
      <section class="card">
        <div class="card-head"><div><h2>Penjualan 6 bulan</h2><p>Faktur terbit, perusahaan.</p></div></div>
        <div class="card-pad">${barChart(series)}</div>
      </section>
      <section class="card card-pad">
        <h2>Konversi sample</h2>
        <div class="stat" style="border:0;padding:12px 0;box-shadow:none">
          <div class="value">${Math.round(samples.rate)}%</div>
          <div class="meta">${samples.converted} dari ${samples.total} sample berujung pembelian</div>
        </div>
        <div class="meter" style="margin:8px 0 12px"><i style="width:${Math.min(100, samples.rate)}%"></i></div>
        <a class="btn btn-sm btn-block" href="#/pelanggan">Lihat pelanggan</a>
      </section>
    </div>

    <div class="section-title"><h2>Performa produk</h2><span class="small muted">Omzet, HPP, margin</span></div>
    <section class="card">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Produk</th><th class="num">Terjual</th><th class="num">Omzet</th><th class="num">HPP</th><th class="num">Margin</th><th class="num">%</th></tr></thead>
        <tbody>${perf.map((r) => `<tr>
          <td><strong>${esc(r.sku.collectionName)} ${esc(r.sku.colourName || r.sku.colourCode)}</strong><div class="xs muted mono">${esc(r.sku.code)}</div></td>
          <td class="num">${fmt.m(r.metres)}</td>
          <td class="num">${fmt.money(r.revenue)}</td>
          <td class="num">${fmt.money(r.cost)}</td>
          <td class="num">${fmt.money(r.margin)}</td>
          <td class="num">${r.revenue ? Math.round((r.margin / r.revenue) * 100) : 0}%</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>

    <div class="section-title"><h2>Proyek & kekurangan</h2><a class="small" href="#/proyek">Buka proyek</a></div>
    <section class="card">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Proyek</th><th>Target</th><th>Status</th><th class="num">HPP material</th><th>Kekurangan</th></tr></thead>
        <tbody>${projects.map((p) => `<tr>
          <td><a href="#/proyek/${p.project.id}">${esc(p.project.name)}</a><div class="xs muted">${esc(p.customer?.name ?? '')}</div></td>
          <td class="${p.overdue ? 'strong' : ''}">${esc(p.targetDate)}</td>
          <td>${badge(p.project.status, 'muted')}</td>
          <td class="num">${fmt.money(p.materialCost)}</td>
          <td>${p.shortages.length ? badge(`${p.shortages.length} baris`, 'warn') : badge('Lengkap', 'ok')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
}

function renderFinance(ctx, ar, ap) {
  const { db } = ctx;
  const deposits = depositReport(db);
  const returns = returnsReport(db);
  return `
    <div class="grid grid-2">
      <section class="card">
        <div class="card-head"><div><h2>Piutang pelanggan</h2><p>Umur dari tanggal jatuh tempo Â· ${esc(todayJakarta())}</p></div><span class="badge badge-warn no-dot">${fmt.money(ar.total)}</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Faktur</th><th>Pelanggan</th><th class="num">Sisa</th><th class="num">Lewat</th></tr></thead>
          <tbody>${ar.items.slice(0, 8).map((i) => `<tr>
            <td class="mono"><a href="#/penjualan/${i.invoice.id}">${esc(i.invoice.id)}</a></td>
            <td>${esc(i.invoice.customerName)}</td>
            <td class="num">${fmt.money(i.outstanding)}</td>
            <td class="num">${i.daysLate ? `${i.daysLate} hr` : 'â€”'}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="muted">Tidak ada piutang.</td></tr>'}</tbody>
        </table></div>
        <div class="card-pad">
          <div class="grid grid-3">
            ${BUCKETS.slice(1).map(([key, label]) => `<div><div class="xs muted">${esc(label)}</div><div class="strong num">${fmt.money(ar.buckets[key])}</div></div>`).join('')}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Utang pemasok</h2><p>Umur tagihan Â· ${esc(todayJakarta())}</p></div><span class="badge badge-copper no-dot">${fmt.money(ap.total)}</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Tagihan</th><th>Pemasok</th><th class="num">Sisa</th><th class="num">Lewat</th></tr></thead>
          <tbody>${ap.items.slice(0, 8).map((i) => `<tr>
            <td class="mono">${esc(i.bill.id)}</td>
            <td>${esc(byId(db.suppliers, i.bill.supplierId)?.name ?? '')}</td>
            <td class="num">${fmt.money(i.outstanding)}</td>
            <td class="num">${i.daysLate ? `${i.daysLate} hr` : 'â€”'}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="muted">Tidak ada utang.</td></tr>'}</tbody>
        </table></div>
        <div class="card-pad"><div class="grid grid-3">
          ${BUCKETS.slice(1).map(([key, label]) => `<div><div class="xs muted">${esc(label)}</div><div class="strong num">${fmt.money(ap.buckets[key])}</div></div>`).join('')}
        </div></div>
      </section>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <section class="card">
        <div class="card-head"><div><h2>Deposit pelanggan</h2><p>Kewajiban, bukan pendapatan.</p></div></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Deposit</th><th>Pelanggan</th><th class="num">Saldo</th><th>Status</th></tr></thead>
          <tbody>${deposits.map((d) => `<tr>
            <td class="mono">${esc(d.deposit.id)}<div class="xs muted">${esc(d.deposit.kind)}</div></td>
            <td>${esc(d.customer?.name ?? '')}</td>
            <td class="num">${fmt.money(d.balance)}</td>
            <td>${badge(d.deposit.status, d.balance > 0 ? 'warn' : 'ok')}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Retur</h2><p>Kredit dan disposisi.</p></div><span class="badge no-dot">${fmt.money(returns.credit)}</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Retur</th><th>Jenis</th><th class="num">Kredit</th><th>Status</th></tr></thead>
          <tbody>${returns.rows.map((r) => `<tr>
            <td class="mono">${esc(r.id)}<div class="xs muted">${esc(r.reason)}</div></td>
            <td>${esc(r.type)}</td>
            <td class="num">${fmt.money(r.credit)}</td>
            <td>${badge(r.status, 'ok')}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="muted">Belum ada retur.</td></tr>'}</tbody>
        </table></div>
      </section>
    </div>`;
}

function renderControl(ctx) {
  const { db } = ctx;
  const adjustments = db.movements.filter((m) => m.type === 'adjust').slice(0, 10);
  const opnames = db.opnameSessions;
  return `
    <div class="grid grid-2">
      <section class="card">
        <div class="card-head"><div><h2>Penyesuaian stok</h2><p>Dari opname; alasan, pelaku, dan nilai.</p></div></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Roll</th><th class="num">Selisih</th><th class="num">Nilai</th><th>Referensi</th></tr></thead>
          <tbody>${adjustments.map((m) => `<tr>
            <td class="mono"><a href="#/stok/${m.rollId}">${esc(m.rollId)}</a></td>
            <td class="num">${fmt.m(m.qtyMm, { signed: true })}</td>
            <td class="num">${fmt.money(m.value)}</td>
            <td class="small muted">${esc(m.ref)} Â· ${esc(m.userName)}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="muted">Tidak ada penyesuaian.</td></tr>'}</tbody>
        </table></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Sesi opname</h2><p>Riwayat permanen, termasuk yang dibatalkan.</p></div></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Sesi</th><th>Gudang</th><th>Status</th><th class="num">Selisih</th></tr></thead>
          <tbody>${opnames.map((s) => `<tr>
            <td class="mono"><a href="#/opname/${s.id}">${esc(s.id)}</a></td>
            <td>${esc(warehouseOf(db, s.warehouseId)?.code)}</td>
            <td>${badge(s.status, s.status === 'posted' ? 'ok' : 'warn')}</td>
            <td class="num">${s.postedAt ? fmt.m(s.adjustments.reduce((a, x) => a + x.varianceMm, 0), { signed: true }) : 'â€”'}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="muted">Belum ada sesi.</td></tr>'}</tbody>
        </table></div>
      </section>
    </div>

    <div class="section-title"><h2>Jejak audit</h2><span class="small muted">20 terakhir</span></div>
    <section class="card"><div class="table-wrap"><table class="data">
      <thead><tr><th>Waktu</th><th>Aksi</th><th>Entitas</th><th>Pelaku</th><th>Detail</th></tr></thead>
      <tbody>${db.audit.slice(0, 20).map((a) => `<tr>
        <td class="small nowrap">${esc(new Date(a.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</td>
        <td class="small">${esc(a.action)}</td>
        <td class="mono">${esc(a.entity)} ${esc(a.entityId)}</td>
        <td class="small">${esc(a.userName)} <span class="xs muted">${esc(a.role)}</span></td>
        <td class="small muted">${esc(a.detail)}</td>
      </tr>`).join('')}</tbody>
    </table></div></section>

    <div class="notice notice-warn" style="margin-top:14px">${icon('alert')}<div><strong>Batas demo.</strong> Audit ini lokal dan dapat diubah lewat devtools. Produksi membutuhkan audit append-only di server, idempotensi posting, dan dokumen terbit yang imutabel.</div></div>`;
}

/* -------------------------------------------------------------------------- */

export function mount(ctx) {
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    tab = btn.dataset.tab;
    ctx.store.emit();
  }));
  document.querySelector('[data-act="export-stock"]')?.addEventListener('click', () => {
    const { db } = ctx;
    const rows = [['Gudang', 'Kode', 'Koleksi', 'Warna', 'Lot', 'Roll', 'Fisik (m)', 'Terpesan (m)', 'Tersedia (m)', 'Status']];
    for (const r of db.rolls) {
      const sku = byId(db.skus, r.skuId);
      rows.push([
        byId(db.warehouses, r.warehouseId)?.code ?? '', sku?.code ?? '', sku?.collectionName ?? '', sku?.colourName ?? sku?.colourCode ?? '',
        r.lot, r.id, (r.currentMm / 1000).toString().replace('.', ','), ((r.reservedMm || 0) / 1000).toString().replace('.', ','),
        (Math.max(0, r.currentMm - (r.reservedMm || 0)) / 1000).toString().replace('.', ','), r.transit ? 'transit' : r.status,
      ]);
    }
    downloadFile(`lajur-laporan-stok-${todayJakarta()}.csv`, toCsv(rows), 'text/csv');
  });
}
