/** Produksi WIP: cutting → sewing → QC per piece, payroll, capacity. */

import {
  esc, icon, fmt, badge, toast, openModal, field, confirmAction,
} from '../dom.js';
import { byId, parseM, todayJakarta } from '../../domain/core.js';
import {
  FLOW, ORDER_STATUS, STAGE, capacityLoad, cancelOrder, createProductionOrder, cutOrder, orderStats,
  payPayroll, productionStats, qcPiece, releaseOrder, requireOrder, reworkPiece, sewPiece,
} from '../../domain/production.js';
import { availableMm } from '../../domain/inventory.js';
import { attachmentMeta } from '../../domain/attachments.js';
import { pageHead, statCard, can, warehouseOf, warehouseOptions } from './common.js';

function progress(order, stats) {
  return `<div class="meter" aria-hidden="true"><i style="width:${stats.progress}%"></i></div>
    <div class="xs muted" style="margin-top:4px">${stats.done}/${stats.pieces} selesai · QC gagal ${stats.rejected}</div>`;
}

export function render(ctx) {
  if (ctx.route.id) return renderDetail(ctx);
  const { db, role, ui } = ctx;
  const wh = ui.warehouseId === 'all' ? null : ui.warehouseId;
  const orders = db.productionOrders
    .filter((o) => !wh || o.warehouseId === wh)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const stats = productionStats(db);
  const capacity = capacityLoad(db);

  return `
    ${pageHead({
      eyebrow: 'Produksi',
      title: 'WIP & produksi',
      sub: 'Setiap piece melewati potong → jahit → QC. Payroll dan kapasitas kerja dihitung dari piece yang sama.',
      actions: `${can(role, 'production.create') ? `<button class="btn btn-primary" type="button" data-act="new-wo">${icon('plus')} Order produksi</button>` : ''}`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Order aktif', value: String(stats.activeOrders), meta: `${stats.wipPieces} piece WIP`, tone: 'accent', iconName: 'needle' })}
      ${statCard({ label: 'Kain WIP', value: fmt.m(stats.wipMm), meta: 'Sudah dipotong, belum selesai', iconName: 'cut' })}
      ${statCard({ label: 'Payroll terbuka', value: fmt.money(stats.payrollOpen), meta: 'Borongan per piece', tone: 'warn', iconName: 'wallet' })}
      ${statCard({ label: 'QC gagal', value: String(stats.rejected), meta: `${stats.done} piece selesai` })}
    </div>

    <div class="grid grid-main">
      <section class="card">
        <div class="card-head"><div><h2>Order produksi</h2><p>Status per order dan potongan kain yang sudah menjadi WIP.</p></div><span class="badge no-dot">${orders.length}</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Order</th><th>Pelanggan</th><th>Target</th><th style="min-width:150px">Progres</th><th>Status</th><th class="num">Payroll</th></tr></thead>
          <tbody>${orders.map((o) => {
            const s = orderStats(db, o);
            const customer = byId(db.customers, o.customerId);
            return `<tr data-href="#/produksi/${o.id}" tabindex="0" role="link">
              <td><span class="mono strong">${esc(o.id)}</span><div class="xs muted">${esc(o.lines.length)} baris · ${esc(warehouseOf(db, o.warehouseId)?.code)}</div></td>
              <td>${esc(customer?.name ?? '—')}</td>
              <td>${esc(o.targetDate)}</td>
              <td>${progress(o, s)}</td>
              <td>${badge(ORDER_STATUS[o.status].label, ORDER_STATUS[o.status].tone)}</td>
              <td class="num">${fmt.money(s.payroll)}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="6"><div class="empty">${icon('needle')}<strong>Belum ada order produksi</strong><p>Buat order dari roll yang tersedia.</p></div></td></tr>`}</tbody>
        </table></div>
      </section>
      <section class="card card-pad">
        <h2>Kapasitas hari ini</h2>
        <p class="xs muted" style="margin-top:4px">Beban piece aktif dibanding kapasitas work center.</p>
        <div class="stack" style="margin-top:12px">
          ${capacity.map((c) => `<div>
            <div class="row-between"><span class="small strong">${esc(c.label)}</span><span class="xs muted">${c.load}/${c.capacity} piece · ${c.days} hari</span></div>
            <div class="meter" style="margin-top:4px"><i class="${c.utilPct > 100 ? 'danger' : c.utilPct > 70 ? 'warn' : ''}" style="width:${Math.min(100, c.utilPct)}%"></i></div>
            <div class="xs muted" style="margin-top:2px">Borongan ${fmt.money(c.rate)} / piece</div>
          </div>`).join('')}
        </div>
        <hr class="divider" />
        <p class="xs muted">Kapasitas adalah perkiraan demo: ${stats.wipPieces} piece aktif di lantai.</p>
      </section>
    </div>`;
}

function renderDetail(ctx) {
  const { db, role } = ctx;
  const order = requireOrder(db, ctx.route.id);
  const stats = orderStats(db, order);
  const pieces = db.productionPieces.filter((p) => p.orderId === order.id);
  const payroll = db.payrollEntries.filter((p) => p.orderId === order.id);
  const customer = byId(db.customers, order.customerId);
  const project = order.projectId ? db.projects.find((p) => p.id === order.projectId) : null;
  const actions = [];
  if (order.status === 'draft' && can(role, 'production.manage')) actions.push(`<button class="btn" data-act="release">${icon('arrow')} Rilis</button>`);
  if (['draft', 'released'].includes(order.status) && can(role, 'production.execute')) actions.push(`<button class="btn btn-primary" data-act="cut">${icon('cut')} Potong kain</button>`);
  if (['draft', 'released'].includes(order.status)) actions.push(`<button class="btn" data-act="cancel">Batalkan</button>`);
  if (stats.unpaid > 0 && can(role, 'production.manage')) actions.push(`<button class="btn" data-act="payroll">${icon('wallet')} Bayar payroll</button>`);

  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/produksi">← Semua produksi</a>
        <div class="row" style="margin-top:6px"><h1 class="mono">${esc(order.id)}</h1>${badge(ORDER_STATUS[order.status].label, ORDER_STATUS[order.status].tone)}</div>
        <p class="sub">${esc(customer?.name ?? 'Tanpa pelanggan')} · target ${esc(order.targetDate)} · ${esc(warehouseOf(db, order.warehouseId)?.name)}${project ? ` · ${esc(project.name)}` : ''}</p>
      </div>
      <div class="page-actions">${actions.join('')}</div>
    </div>

    <div class="flow" style="margin-bottom:16px">
      ${FLOW.map((stage, i) => `<div class="flow-step ${i < 3 && stats.byStage.done ? 'done' : ''} ${order.status === 'done' && i === 3 ? 'done' : ''}">
        <strong>${esc(STAGE[stage].label)}</strong>${i === 0 ? `${stats.byStage.cutting} antre` : i === 1 ? `${stats.byStage.sewing + stats.byStage.done + stats.byStage.rejected} piece` : i === 2 ? `${stats.byStage.sewing} menunggu` : `${stats.byStage.done} lulus`}
      </div>`).join('')}
    </div>

    ${stats.rejected ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('alert')}<div><strong>${stats.rejected} piece gagal QC.</strong> Perbaiki lewat “Jahit ulang” di tabel piece.</div></div>` : ''}

    <div class="grid grid-main">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Piece WIP</h2><p>Satu baris = satu piece fisik dengan roll dan lot sumber.</p></div><span class="badge no-dot">${pieces.length}</span></div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Piece</th><th>Roll / lot</th><th class="num">Ukuran</th><th>Tahap</th><th>Petugas</th><th><span class="sr-only">Aksi</span></th></tr></thead>
            <tbody>${pieces.map((p) => `<tr>
              <td class="mono strong">${esc(p.id)}<div class="xs muted">${esc(byId(db.skus, p.skuId)?.code ?? '')}</div></td>
              <td><a class="mono xs" href="#/stok/${p.rollId}">${esc(p.rollId)}</a><div class="xs muted">${esc(p.lot)}</div></td>
              <td class="num">${fmt.m(p.qtyMm)}</td>
              <td>${badge(STAGE[p.stage].label, STAGE[p.stage].tone)}${p.qcNote ? `<div class="xs muted">${esc(p.qcNote)}</div>` : ''}</td>
              <td class="small">${esc(byId(db.users, p.workerId)?.name ?? '—')}</td>
              <td class="right">${pieceActions(role, p)}</td>
            </tr>`).join('') || `<tr><td colspan="6"><div class="empty">${icon('cut')}<strong>Belum ada piece</strong><p>Potong kain untuk memulai WIP.</p></div></td></tr>`}</tbody>
          </table></div>
        </section>

        <section class="card">
          <div class="card-head"><div><h2>Payroll borongan</h2><p>Per piece per tahap. Ditandai lunas tanpa transfer bank nyata.</p></div><span class="badge no-dot">${fmt.money(stats.payroll)}</span></div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Piece</th><th>Tahap</th><th>Petugas</th><th class="num">Rate</th><th>Status</th></tr></thead>
            <tbody>${payroll.map((p) => `<tr>
              <td class="mono xs">${esc(p.pieceId)}</td><td>${esc(STAGE[p.stage]?.label ?? p.stage)}</td>
              <td class="small">${esc(byId(db.users, p.workerId)?.name ?? '—')}</td>
              <td class="num">${fmt.money(p.amount)}</td>
              <td>${p.paid ? badge('Lunas', 'ok') : badge('Terbuka', 'warn')}</td>
            </tr>`).join('') || '<tr><td colspan="5" class="muted">Belum ada payroll.</td></tr>'}</tbody>
          </table></div>
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad">
          <h2>Ringkasan order</h2>
          <div class="stack-sm" style="margin-top:8px">
            <div class="row-between"><span class="small muted">Baris material</span><span class="small">${order.lines.length}</span></div>
            <div class="row-between"><span class="small muted">Piece</span><span class="small">${stats.pieces}</span></div>
            <div class="row-between"><span class="small muted">Selesai</span><span class="small">${stats.done}</span></div>
            <div class="row-between"><span class="small muted">Payroll total</span><span class="small num">${fmt.money(stats.payroll)}</span></div>
            <div class="row-between"><span class="small muted">Belum dibayar</span><span class="small num">${fmt.money(stats.unpaid)}</span></div>
          </div>
          ${order.notes ? `<hr class="divider" /><p class="small muted">${esc(order.notes)}</p>` : ''}
        </section>
        <section class="card card-pad">
          <h2>Material</h2>
          <div class="stack-sm" style="margin-top:8px">
            ${order.lines.map((l) => `<div><div class="small strong">${esc(l.description)}</div><div class="xs muted">${fmt.m(l.qtyMm)} · ${esc(l.rollId)} · lot ${esc(l.lot)} · ${fmt.m(l.pieceLengthMm)}/piece</div></div>`).join('')}
          </div>
        </section>
        <section class="card card-pad">
          <h2>Catatan</h2>
          <p class="small muted" style="margin-top:6px">Cutting mengonsumsi kain dari roll sumber dan membuat piece WIP. QC lulus menutup piece; QC gagal dapat dijahit ulang. Faktur penjualan tetap terpisah.</p>
        </section>
      </div>
    </div>`;
}

function pieceActions(role, piece) {
  if (!can(role, 'production.execute')) return '';
  if (piece.stage === 'cutting') return `<button class="btn btn-sm" data-sew="${piece.id}">Jahit</button>`;
  if (piece.stage === 'sewing') return `<button class="btn btn-sm btn-primary" data-qc="${piece.id}">QC</button>`;
  if (piece.stage === 'rejected') return `<button class="btn btn-sm" data-rework="${piece.id}">Jahit ulang</button>`;
  return '';
}

/* -------------------------------------------------------------------------- */

function openCreate(ctx) {
  const { db } = ctx;
  const active = db.warehouses.filter((w) => w.active !== false);
  if (!active.length) {
    toast('Tidak ada gudang aktif.', { tone: 'error' });
    return;
  }
  const defaultWh = ctx.ui.warehouseId === 'all' ? active[0].id : ctx.ui.warehouseId;
  const rollOptions = (wh) => db.rolls
    .filter((r) => r.warehouseId === wh && !r.transit && r.status === 'available' && availableMm(r) > 0)
    .map((r) => `<option value="${r.id}">${esc(r.id)} · ${esc(r.lot)} · ${fmt.m(availableMm(r))}</option>`).join('');
  const customers = db.customers.filter((c) => c.stage !== 'dormant');
  const projects = db.projects.filter((p) => !['handover', 'cancelled'].includes(p.status));

  openModal({
    title: 'Order produksi baru',
    description: 'Potong kain menjadi piece WIP, lalu jahit dan QC per piece.',
    wide: true,
    submitLabel: 'Simpan & cadangkan kain',
    body: `<div class="form-grid">
      ${field('Pelanggan', `<select class="select" name="customer"><option value="">— Tanpa pelanggan —</option>${customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`)}
      ${field('Proyek', `<select class="select" name="project"><option value="">— Tanpa proyek —</option>${projects.map((p) => `<option value="${p.id}">${esc(p.id)} · ${esc(p.name)}</option>`).join('')}</select>`)}
      ${field('Gudang', `<select class="select" name="warehouse">${warehouseOptions(db, defaultWh)}</select>`)}
      ${field('Target selesai', `<input class="input" type="date" name="targetDate" value="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}" />`)}
      ${field('Catatan / instruksi', `<input class="input" name="notes" placeholder="Jahit keliling, arah motif, packing" />`, { full: true })}
    </div>
    <div class="section-title" style="margin:18px 0 6px"><h3>Material</h3><span class="xs muted">Satu baris = satu roll sumber</span></div>
    <div id="wo-lines">
      <div class="alloc-row" data-line style="grid-template-columns:1.5fr 110px 110px 34px">
        <select class="select wo-roll">${rollOptions(defaultWh)}</select>
        <input class="input wo-qty" inputmode="decimal" placeholder="total m" />
        <input class="input wo-piece" inputmode="decimal" value="2,4" placeholder="m/piece" />
        <button class="icon-btn" type="button" data-remove>${icon('x')}</button>
      </div>
    </div>
    <button class="btn btn-sm" type="button" data-add>${icon('plus')} Tambah roll</button>
    <div class="notice notice-warn" style="margin-top:12px">${icon('alert')}<div>Kain dicadangkan saat order dibuat. Cutting mengonsumsi cadangan dan membuat piece; faktur penjualan terpisah.</div></div>`,
    onMount(form) {
      const lines = form.querySelector('#wo-lines');
      const bind = (row) => {
        row.querySelector('[data-remove]').addEventListener('click', () => { if (lines.children.length > 1) row.remove(); });
      };
      form.querySelectorAll('[data-line]').forEach(bind);
      form.warehouse.addEventListener('change', () => {
        form.querySelectorAll('.wo-roll').forEach((sel) => { sel.innerHTML = rollOptions(form.warehouse.value); });
      });
      form.querySelector('[data-add]').addEventListener('click', () => {
        lines.insertAdjacentHTML('beforeend', `<div class="alloc-row" data-line style="grid-template-columns:1.5fr 110px 110px 34px">
          <select class="select wo-roll">${rollOptions(form.warehouse.value)}</select>
          <input class="input wo-qty" inputmode="decimal" placeholder="total m" />
          <input class="input wo-piece" inputmode="decimal" value="2,4" placeholder="m/piece" />
          <button class="icon-btn" type="button" data-remove>${icon('x')}</button>
        </div>`);
        bind(lines.lastElementChild);
      });
    },
    onSubmit(form, close) {
      const lines = [...form.querySelectorAll('[data-line]')].map((row) => ({
        rollId: row.querySelector('.wo-roll').value,
        qtyMm: parseM(row.querySelector('.wo-qty').value),
        pieceLengthMm: parseM(row.querySelector('.wo-piece').value),
      })).filter((l) => l.qtyMm > 0 && l.rollId);
      if (!lines.length) throw new Error('Isi minimal satu baris material.');
      const order = ctx.store.update((db) => createProductionOrder(db, {
        customerId: form.customer.value || null,
        projectId: form.project.value || null,
        warehouseId: form.warehouse.value,
        targetDate: form.targetDate.value,
        lines,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      window.location.hash = `#/produksi/${order.id}`;
      toast('Order produksi dibuat; kain dicadangkan.', { tone: 'success' });
    },
  });
}

function openQc(ctx, piece) {
  openModal({
    title: `QC ${piece.id}`,
    description: 'Lulus menutup piece; gagal dapat dijahit ulang.',
    submitLabel: 'Simpan hasil QC',
    body: `
      ${field('Hasil', `<select class="select" name="result"><option value="pass">Lulus QC</option><option value="fail">Gagal / perbaikan</option></select>`)}
      ${field('Catatan QC', `<input class="input" name="note" placeholder="Ukuran, jahitan, noda" />`)}
      ${field('Bukti fisik (opsional)', `<input class="input" type="file" name="proof" accept="image/*,.pdf" />`)}
    `,
    onSubmit(form, close) {
      const file = form.proof.files?.[0] ?? null;
      const attachment = attachmentMeta(file, { note: form.note.value });
      ctx.store.update((db) => qcPiece(db, {
        pieceId: piece.id,
        pass: form.result.value === 'pass',
        note: form.note.value,
        attachment,
        user: ctx.user,
      }));
      close();
      toast('Hasil QC disimpan.', { tone: 'success' });
    },
  });
}

/* -------------------------------------------------------------------------- */

export function mount(ctx) {
  if (ctx.route.id) {
    const order = requireOrder(ctx.db, ctx.route.id);
    document.querySelector('[data-act="release"]')?.addEventListener('click', () => {
      ctx.store.update((db) => releaseOrder(db, { id: order.id, user: ctx.user }));
      toast('Order dirilis.', { tone: 'success' });
    });
    document.querySelector('[data-act="cut"]')?.addEventListener('click', async () => {
      const ok = await confirmAction({ title: 'Potong kain sekarang?', message: 'Kain keluar dari roll dan menjadi piece WIP. Tindakan ini mengurangi stok tersedia.', confirmLabel: 'Potong' });
      if (!ok) return;
      try {
        ctx.store.update((db) => cutOrder(db, { id: order.id, user: ctx.user }));
        toast('Kain dipotong menjadi piece WIP.', { tone: 'success' });
      } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    document.querySelector('[data-act="cancel"]')?.addEventListener('click', async () => {
      const ok = await confirmAction({ title: 'Batalkan order?', message: 'Hanya order yang belum dipotong yang dapat dibatalkan.', confirmLabel: 'Batalkan', tone: 'danger' });
      if (!ok) return;
      try {
        ctx.store.update((db) => cancelOrder(db, { id: order.id, user: ctx.user }));
        toast('Order dibatalkan.', { tone: 'success' });
      } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    document.querySelector('[data-act="payroll"]')?.addEventListener('click', async () => {
      const ok = await confirmAction({ title: 'Tandai payroll lunas?', message: 'Demo mencatat pelunasan, bukan transfer bank.', confirmLabel: 'Tandai lunas' });
      if (!ok) return;
      ctx.store.update((db) => payPayroll(db, { orderId: order.id, user: ctx.user }));
      toast('Payroll ditandai lunas.', { tone: 'success' });
    });
    document.querySelectorAll('[data-sew]').forEach((btn) => btn.addEventListener('click', () => {
      ctx.store.update((db) => sewPiece(db, { pieceId: btn.dataset.sew, user: ctx.user }));
      toast('Piece masuk tahap jahit.', { tone: 'success' });
    }));
    document.querySelectorAll('[data-qc]').forEach((btn) => btn.addEventListener('click', () => {
      const piece = ctx.db.productionPieces.find((p) => p.id === btn.dataset.qc);
      if (piece) openQc(ctx, piece);
    }));
    document.querySelectorAll('[data-rework]').forEach((btn) => btn.addEventListener('click', () => {
      ctx.store.update((db) => reworkPiece(db, { pieceId: btn.dataset.rework, user: ctx.user }));
      toast('Piece dikembalikan ke jahit.', { tone: 'success' });
    }));
    document.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => {
      window.location.hash = tr.dataset.href.replace('#', '');
    }));
    return;
  }

  document.querySelector('[data-act="new-wo"]')?.addEventListener('click', () => openCreate(ctx));
  document.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => {
    window.location.hash = tr.dataset.href.replace('#', '');
  }));
}
