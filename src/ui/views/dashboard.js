/** Ringkasan — role-specific dashboard. All metrics derive from records. */

import { esc, icon, fmt, badge } from '../dom.js';
import { byId, daysBetween, formatDateLong, todayJakarta } from '../../domain/core.js';
import {
  dashboardMetrics, monthlySales, stockByWarehouse, projectReport, sampleReport, postedInvoices,
} from '../../domain/reports.js';
import { depositBalance } from '../../domain/crm.js';
import { activeSessions } from '../../domain/opname.js';
import { cuttingQueue, isOverdue, taskList, taskStats, TASK_TYPE } from '../../domain/tasks.js';
import { productionStats } from '../../domain/production.js';
import { settingsOf } from '../../domain/settings.js';
import { isAdvancedMode } from '../../domain/features.js';
import { pageHead, statCard, barChart, movementRow, warehouseOf } from './common.js';

const ICON_BY_NAME = {
  approval: 'clock', clock: 'clock', receivable: 'wallet', payable: 'truck', shortage: 'alert',
  opname: 'clipboard', po: 'truck',
};

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date()));
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

function exceptionList(ctx, limit = 6) {
  const { db, metrics } = ctx;
  if (!metrics.exceptions.length) {
    return `<div class="empty" style="padding:28px 16px">${icon('check')}<strong>Tidak ada keputusan tertunda</strong><p>Semua persetujuan, tagihan, dan kebutuhan proyek terkendali.</p></div>`;
  }
  return `<ul class="exc-list">${metrics.exceptions.slice(0, limit).map((ex) => `
    <li class="exc-item">
      <span class="exc-icon ${ex.tone}">${icon(ICON_BY_NAME[ex.icon] ?? 'alert')}</span>
      <div class="exc-body">
        <strong>${esc(ex.title)}</strong>
        <span>${esc(ex.detail)}</span>
      </div>
      <div class="right">
        ${ex.amount ? `<div class="amount strong num">${fmt.money(ex.amount)}</div>` : ''}
        <a class="small strong" href="${esc(ex.href)}">Tinjau →</a>
      </div>
    </li>`).join('')}</ul>`;
}

function warehouseTable(db, activeId) {
  const rows = stockByWarehouse(db);
  return `<div class="table-wrap">
    <table class="data">
      <thead><tr><th>Gudang</th><th class="num">Fisik</th><th class="num">Tersedia</th><th class="num">Terpesan</th><th class="num">Transit masuk</th><th class="num">Nilai</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td><strong>${esc(r.warehouse.code)}</strong> <span class="muted small">${esc(r.warehouse.name)}</span>${r.warehouse.id === activeId ? ' <span class="badge badge-teal no-dot">aktif</span>' : ''}</td>
          <td class="num">${fmt.m(r.physicalMm)}</td>
          <td class="num">${fmt.m(r.availableMm)}</td>
          <td class="num">${fmt.m(r.reservedMm)}</td>
          <td class="num">${r.incomingMm ? fmt.m(r.incomingMm) : '—'}</td>
          <td class="num">${fmt.money(r.value)}</td>
        </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

function operatorQueue(ctx) {
  const { db, ui } = ctx;
  const dispatches = db.transfers.filter((t) => t.status === 'approved' && t.fromWarehouseId === ui.warehouseId);
  const receipts = db.transfers.filter((t) => ['dispatched', 'partially_received'].includes(t.status) && t.toWarehouseId === ui.warehouseId);
  const poReady = db.purchaseOrders.filter((p) => p.status === 'approved' || p.status === 'partial');
  const opnames = activeSessions(db).filter((s) => s.warehouseId === ui.warehouseId);
  const items = [
    ...opnames.map((s) => ({ href: `#/opname/${s.id}`, icon: 'clipboard', title: `Opname ${s.id} berjalan`, detail: 'Gudang dibekukan sampai review selesai.' })),
    ...receipts.map((t) => ({ href: `#/transfer/${t.id}`, icon: 'truck', title: `Terima kiriman ${t.id}`, detail: `${warehouseOf(db, t.fromWarehouseId)?.code} → ${warehouseOf(db, t.toWarehouseId)?.code} · sebagian sudah di jalan.` })),
    ...dispatches.map((t) => ({ href: `#/transfer/${t.id}`, icon: 'transfer', title: `Siapkan kiriman ${t.id}`, detail: `Untuk ${warehouseOf(db, t.toWarehouseId)?.name}.` })),
    ...poReady.map((p) => ({ href: `#/pembelian/${p.id}`, icon: 'truck', title: `PO ${p.id} siap diterima`, detail: `${p.supplierName} · estimasi ${p.expectedDate}.` })),
  ];
  if (!items.length) {
    return `<div class="empty" style="padding:24px 16px">${icon('check')}<strong>Antrean bersih</strong><p>Belum ada pekerjaan gudang yang menunggu.</p></div>`;
  }
  return `<ul class="exc-list">${items.map((i) => `
    <li class="exc-item">
      <span class="exc-icon info">${icon(i.icon)}</span>
      <div class="exc-body"><strong>${esc(i.title)}</strong><span>${esc(i.detail)}</span></div>
      <a class="small strong" href="${i.href}">Buka →</a>
    </li>`).join('')}</ul>`;
}

function followUps(ctx) {
  const today = todayJakarta();
  const customers = ctx.db.customers
    .filter((c) => c.followUpDate)
    .map((c) => ({ c, days: daysBetween(today, c.followUpDate) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);
  if (!customers.length) {
    return `<div class="empty" style="padding:24px 16px">${icon('users')}<strong>Belum ada follow-up</strong><p>Tambahkan aksi berikutnya pada profil pelanggan.</p></div>`;
  }
  return `<ul class="exc-list">${customers.map(({ c, days }) => `
    <li class="exc-item">
      <span class="exc-icon ${days < 0 ? 'danger' : 'info'}">${icon('clock')}</span>
      <div class="exc-body">
        <strong>${esc(c.name)}</strong>
        <span>${esc(c.nextAction || 'Tanpa aksi berikutnya')} · ${esc(c.followUpDate)}</span>
      </div>
      <div class="right">
        ${days < 0 ? badge(`${Math.abs(days)} hari lewat`, 'danger') : badge(`${days} hari`, 'muted')}
      </div>
    </li>`).join('')}</ul>`;
}

export function render(ctx) {
  const { db, ui, role, metrics } = ctx;
  const wh = ui.warehouseId === 'all' ? null : warehouseOf(db, ui.warehouseId);
  const firstName = ctx.user.name.split(' ')[0];
  const dateLabel = formatDateLong(todayJakarta());
  const salesSeries = monthlySales(db, 6);
  const recent = db.movements.filter((m) => !wh || m.warehouseId === wh.id || m.warehouseToId === wh.id).slice(0, 6);
  const ops = taskStats(db, { warehouseId: wh?.id ?? null });
  const myTasks = taskList(db, {
    warehouseId: wh?.id ?? null,
    assigneeId: role === 'operator' ? ctx.user.id : null,
    status: 'open',
  }).slice(0, 4);
  const cutting = cuttingQueue(db).filter((c) => !wh || c.task.warehouseId === wh.id).slice(0, 3);
  const prod = productionStats(db);

  if (role === 'operator') {
    return `
      ${pageHead({ eyebrow: 'Operator gudang', title: `${greeting()}, ${firstName}`, sub: `${wh?.name ?? 'Semua gudang'} · ${dateLabel}` })}
      <div class="kpi-strip">
        ${statCard({ label: 'Stok fisik', value: fmt.m(metrics.stock.physicalMm), meta: 'Roll tersedia & karantina', tone: 'accent', iconName: 'box' })}
        ${statCard({ label: 'Tersedia', value: fmt.m(metrics.stock.availableMm), meta: 'Fisik dikurangi reservasi' })}
        ${statCard({ label: 'Terpesan', value: fmt.m(metrics.stock.reservedMm), meta: 'Proyek & alokasi aktif' })}
        ${statCard({ label: 'Transit masuk', value: fmt.m(metrics.stock.incomingMm), meta: 'Belum dihitung sebagai stok gudang', tone: 'warn' })}
      </div>

      <div class="task-tiles" style="margin-top:12px" aria-label="Tugas cepat">
        <a class="task-tile" href="#/pembelian">${icon('truck')}<strong>Terima Barang</strong><span>${db.purchaseOrders.filter((p) => ['approved', 'partial'].includes(p.status)).length} PO siap</span></a>
        <a class="task-tile" href="#/transfer">${icon('package')}<strong>Picking</strong><span>${db.transfers.filter((t) => ['approved', 'dispatched'].includes(t.status)).length} permintaan</span></a>
        <a class="task-tile" href="#/tugas">${icon('cut')}<strong>Potong Kain</strong><span>${ops.cutting} antrean</span></a>
        <a class="task-tile" href="#/opname?new=1">${icon('clipboard')}<strong>Opname</strong><span>${activeSessions(db).length ? 'Sesi aktif' : 'Mulai hitung'}</span></a>
      </div>

      <div class="grid grid-main" style="margin-top:16px">
        <section class="card">
          <div class="card-head"><div><h2>Antrean kerja</h2><p>Aksi yang paling dekat dengan lantai gudang.</p></div><span class="badge badge-teal no-dot">${esc(wh?.code ?? 'ALL')}</span></div>
          ${operatorQueue(ctx)}
        </section>
        <section class="card card-pad stack-sm">
          <h2>Aksi cepat</h2>
          <a class="btn btn-primary btn-block" href="#/transfer?new=1">${icon('plus')} Buat permintaan gudang</a>
          <a class="btn btn-block" href="#/opname?new=1">${icon('clipboard')} Mulai stock opname</a>
          ${isAdvancedMode(db) && settingsOf(db).productionEnabled ? `<a class="btn btn-block" href="#/produksi">${icon('needle')} Produksi WIP</a>` : ''}
          <a class="btn btn-block" href="#/stok?add=1">${icon('plus')} Tambah stok manual</a>
          <a class="btn btn-block" href="#/stok">${icon('search')} Cari roll / lot</a>
          <a class="btn btn-block" href="#/pembelian">${icon('truck')} Terima barang pemasok</a>
          <p class="xs muted" style="margin-top:4px">Peran demo membatasi tombol; otorisasi produksi harus dicek di server.</p>
        </section>
      </div>
      <div class="section-title"><h2>Tugas saya</h2><a href="#/tugas">Semua tugas</a></div>
      <section class="card">
        <div class="task-list">
          ${myTasks.map((t) => `<a class="task-card" href="#/tugas">
            <span class="task-ico">${icon(TASK_TYPE[t.type]?.icon ?? 'listCheck')}</span>
            <span class="task-main"><span class="task-top"><strong>${esc(t.title)}</strong>${badge(t.status === 'in_progress' ? 'Dikerjakan' : 'Baru', t.status === 'in_progress' ? 'info' : 'muted')}</span>
            <span class="task-meta">${esc(TASK_TYPE[t.type]?.label ?? t.type)} · ${esc(t.dueDate)}${t.qtyMm ? ` · ${fmt.m(t.qtyMm)}` : ''}</span></span>
          </a>`).join('') || `<div class="empty" style="padding:20px">${icon('checkCircle')}<strong>Tidak ada tugas aktif</strong><p>Antrean bersih.</p></div>`}
        </div>
      </section>
      <div class="section-title"><h2>Aktivitas terakhir</h2><a href="#/stok">Lihat stok</a></div>
      <section class="card card-pad">
        <ul class="timeline">${recent.map((m) => movementRow(db, m)).join('') || '<li class="muted">Belum ada mutasi.</li>'}</ul>
      </section>`;
  }

  if (role === 'sales') {
    const samples = sampleReport(db);
    const activeSamples = samples.rows.filter((r) => r.sample.status === 'active').length;
    const openDeposits = db.deposits.reduce((a, d) => a + depositBalance(d), 0);
    const invoices = postedInvoices(db).slice(0, 5);
    return `
      ${pageHead({ eyebrow: 'Sales & customer service', title: `${greeting()}, ${firstName}`, sub: `${dateLabel} · angka penjualan bersifat perusahaan` })}
      <div class="kpi-strip">
        ${statCard({ label: 'Piutang berjalan', value: fmt.money(metrics.receivables), meta: `${fmt.money(metrics.overdueReceivables)} lewat jatuh tempo`, tone: 'warn', iconName: 'wallet' })}
        ${statCard({ label: 'Penjualan bulan ini', value: fmt.money(metrics.monthSales), meta: 'Faktur terbit, bukan pesanan' })}
        ${statCard({ label: 'Sample aktif', value: String(activeSamples), meta: `${samples.converted}/${samples.total} terkonversi (${Math.round(samples.rate)}%)` })}
        ${statCard({ label: 'Deposit terbuka', value: fmt.money(openDeposits), meta: 'Kewajiban, bukan pendapatan' })}
      </div>
      <div class="grid grid-main" style="margin-top:16px">
        <section class="card">
          <div class="card-head"><div><h2>Follow-up pelanggan</h2><p>Aksi berikutnya dan tanggal janji.</p></div><a class="small strong" href="#/pelanggan">Semua pelanggan</a></div>
          ${followUps(ctx)}
        </section>
        <section class="card">
          <div class="card-head"><div><h2>Penjualan 6 bulan</h2><p>Faktur terbit per bulan.</p></div></div>
          <div class="card-pad">${barChart(salesSeries)}<div class="legend" style="margin-top:8px"><span><i style="background:var(--teal)"></i>Total faktur</span></div></div>
        </section>
      </div>
      <div class="section-title"><h2>Faktur terbaru</h2><a href="#/penjualan">Semua faktur</a></div>
      <section class="card">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Faktur</th><th>Pelanggan</th><th>Tanggal</th><th class="num">Total</th><th class="num">Sisa</th><th>Status</th></tr></thead>
            <tbody>${invoices.map((inv) => `
              <tr data-href="#/penjualan/${inv.id}">
                <td class="mono">${esc(inv.id)}</td>
                <td>${esc(inv.customerName)}</td>
                <td>${esc(inv.date)}</td>
                <td class="num">${fmt.money(inv.total)}</td>
                <td class="num">${fmt.money(ctx.helpers.outstanding(inv))}</td>
                <td>${badge(inv.status === 'posted' ? 'Terbit' : inv.status, 'ok')}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
      </section>`;
  }

  // Manager
  const warehouseRows = stockByWarehouse(db);
  const projects = projectReport(db);
  const shortProjects = projects.filter((p) => p.shortages.length && !['handover', 'cancelled'].includes(p.project.status));
  return `
    ${pageHead({
      eyebrow: 'Ringkasan manajer',
      title: `${greeting()}, ${firstName}`,
      sub: `${dateLabel} · ${db.meta.company}`,
      actions: `<a class="btn" href="#/laporan">${icon('chart')} Buka laporan</a><a class="btn btn-primary" href="#/transfer?new=1">${icon('plus')} Permintaan gudang</a>`,
    })}
    <div class="kpi-strip">
      ${statCard({ label: 'Nilai persediaan', value: fmt.money(metrics.inventory.total), meta: `Fisik ${fmt.money(metrics.inventory.fabric)} + part ${fmt.money(metrics.inventory.parts)}`, tone: 'accent', iconName: 'box' })}
      ${statCard({ label: 'Piutang', value: fmt.money(metrics.receivables), meta: `${fmt.money(metrics.overdueReceivables)} lewat jatuh tempo`, tone: 'warn', iconName: 'wallet' })}
      ${statCard({ label: 'Penjualan bulan ini', value: fmt.money(metrics.monthSales), meta: `Margin kotor ${fmt.money(metrics.monthMargin)}` })}
      ${statCard({ label: 'Utang pemasok', value: fmt.money(metrics.payables), meta: `${db.purchaseOrders.filter((p) => ['approved', 'partial'].includes(p.status)).length} PO berjalan`, iconName: 'truck' })}
    </div>
    <div class="grid grid-main" style="margin-top:16px">
      <section class="card">
        <div class="card-head"><div><h2>Perlu keputusan</h2><p>Persetujuan, keterlambatan, dan kekurangan material.</p></div><span class="badge badge-copper no-dot">${metrics.exceptions.length} item</span></div>
        ${exceptionList(ctx, 7)}
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Penjualan 6 bulan</h2><p>Faktur terbit per bulan, perusahaan.</p></div></div>
        <div class="card-pad">${barChart(salesSeries)}
          <div class="legend" style="margin-top:8px"><span><i style="background:var(--teal)"></i>Total faktur</span><span class="muted">Puncak: ${fmt.money(Math.max(...salesSeries.map((s) => s.revenue), 0))}</span></div>
        </div>
      </section>
    </div>
    <div class="section-title"><h2>Stok per gudang</h2><a href="#/stok">Detail roll</a></div>
    <section class="card">${warehouseTable(db, ui.warehouseId)}</section>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card">
        <div class="card-head"><div><h2>Proyek berisiko</h2><p>Kekurangan material atau target terlewat.</p></div><a class="small strong" href="#/proyek">Semua</a></div>
        ${shortProjects.length || projects.some((p) => p.overdue)
          ? `<ul class="exc-list">${projects.filter((p) => p.shortages.length || p.overdue).slice(0, 5).map((p) => `
              <li class="exc-item">
                <span class="exc-icon ${p.overdue ? 'danger' : 'warn'}">${icon(p.overdue ? 'clock' : 'alert')}</span>
                <div class="exc-body"><strong>${esc(p.project.name)}</strong><span>${esc(p.customer?.name ?? '')} · target ${esc(p.project.targetDate)}${p.shortages.length ? ` · ${p.shortages.length} kebutuhan kurang` : ''}</span></div>
                <a class="small strong" href="#/proyek/${p.project.id}">Buka →</a>
              </li>`).join('')}</ul>`
          : `<div class="empty" style="padding:24px">${icon('check')}<strong>Semua proyek siap</strong><p>Tidak ada kekurangan material.</p></div>`}
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Operasi gudang</h2><p>Antrean potong, tugas terlambat, dan beban kerja.</p></div><a class="small strong" href="#/tugas">Semua tugas</a></div>
        <div class="card-pad">
          <div class="grid grid-3" style="gap:8px">
            <div><div class="xs muted">Aktif</div><div class="strong num">${ops.active}</div></div>
            <div><div class="xs muted">Terlambat</div><div class="strong num">${ops.overdue}</div></div>
            <div><div class="xs muted">Potong kain</div><div class="strong num">${ops.cutting}</div></div>
          </div>
          <hr class="divider" />
          ${isAdvancedMode(db) && settingsOf(db).productionEnabled ? `<div class="row" style="margin-bottom:8px"><a class="small strong" href="#/produksi">Produksi WIP: ${prod.wipPieces} piece · ${fmt.money(prod.payrollOpen)} payroll</a></div>` : ''}
          ${cutting.length ? `<div class="stack-sm">${cutting.map((c) => `<div class="row-between">
            <div><strong class="small">${esc(c.task.title)}</strong><div class="xs muted">${esc(c.roll?.id ?? '')} · ${fmt.m(c.task.qtyMm ?? 0)} · ${esc(c.assignee?.name ?? 'Belum ditugaskan')}</div></div>
            ${isOverdue(c.task) ? badge('Lewat', 'danger') : badge(c.task.dueDate, 'muted')}
          </div>`).join('')}</div>` : `<p class="small muted">Tidak ada antrean potong.</p>`}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Aktivitas gudang terakhir</h2><p>Dari buku mutasi yang sama dengan stok.</p></div></div>
        <div class="card-pad"><ul class="timeline">${recent.slice(0, 5).map((m) => movementRow(db, m)).join('')}</ul></div>
      </section>
    </div>`;
}

export function mount() {
  // Table row navigation
  document.querySelectorAll('tr[data-href]').forEach((tr) => {
    tr.addEventListener('click', () => { window.location.hash = tr.dataset.href.replace('#', ''); });
  });
}
