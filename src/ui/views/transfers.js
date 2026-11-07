/** Permintaan Gudang / PO Internal — list, detail, approval, dispatch, receipt. */

import {
  esc, icon, fmt, badge, toast, openModal, field, printDocument, promptText,
} from '../dom.js';
import { byId, formatDateLong, parseM } from '../../domain/core.js';
import {
  TRANSFER_STATUS, approveTransfer, cancelTransfer, createTransfer, dispatchLine,
  eligibleRolls, getTransfer, lineStats, receiveLine, rejectTransfer, submitTransfer, transitRollsFor,
  transferTotals,
} from '../../domain/transfers.js';
import { pageHead, statCard, warehouseOf, can, warehouseOptions } from './common.js';
import { printTransferHtml } from './print.js';

let statusFilter = 'all';

const STATUS_ORDER = ['submitted', 'approved', 'dispatched', 'partially_received', 'draft', 'received', 'rejected', 'cancelled'];

function progressLine(db, t) {
  const totals = transferTotals(t);
  return `<div class="meter" aria-hidden="true">
    <i class="done" style="width:${totals.requestedMm ? (totals.dispatchedMm / totals.requestedMm) * 100 : 0}%"></i>
  </div>
  <div class="xs muted" style="margin-top:4px">${fmt.m(totals.dispatchedMm)} dikirim · ${fmt.m(totals.receivedMm)} diterima · ${fmt.m(totals.inTransitMm)} transit</div>`;
}

export function render(ctx) {
  if (ctx.route.id) return renderDetail(ctx);

  const { db, ui, role } = ctx;
  const list = db.transfers
    .filter((t) => statusFilter === 'all' || t.status === statusFilter)
    .filter((t) => ui.warehouseId === 'all' || t.fromWarehouseId === ui.warehouseId || t.toWarehouseId === ui.warehouseId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = db.transfers.filter((t) => t.status === s).length;
    return acc;
  }, {});

  return `
    ${pageHead({
      eyebrow: 'Antar gudang',
      title: 'Permintaan Gudang',
      sub: 'PO internal tanpa pemasok. Persetujuan tidak mereservasi stok; ketersediaan diperiksa ulang saat kirim.',
      actions: `${can(role, 'transfer.create') ? `<a class="btn btn-primary" href="#/transfer?new=1">${icon('plus')} Buat permintaan</a>` : ''}`,
    })}
    <div class="notice notice-teal" style="margin-bottom:14px">${icon('transfer')}<div><strong>Transfer internal tidak menciptakan pendapatan, piutang, atau utang.</strong> Barang dalam perjalanan disimpan terpisah sampai diterima, dan total meter serta harga pokok tetap.</div></div>

    <div class="row" style="margin-bottom:14px;gap:6px">
      <button class="chip" type="button" data-status="all" aria-pressed="${statusFilter === 'all'}">Semua <span class="muted">${db.transfers.length}</span></button>
      ${STATUS_ORDER.filter((s) => counts[s]).map((s) => `<button class="chip" type="button" data-status="${s}" aria-pressed="${statusFilter === s}">${esc(TRANSFER_STATUS[s].label)} <span class="muted">${counts[s]}</span></button>`).join('')}
    </div>

    <section class="card">
      <div class="table-wrap desktop-table">
        <table class="data">
          <thead><tr><th>Permintaan</th><th>Rute</th><th class="hide-sm">Butuh</th><th style="min-width:190px">Progres</th><th class="num">Diminta</th><th>Status</th></tr></thead>
          <tbody>
            ${list.map((t) => {
              const totals = transferTotals(t);
              return `<tr data-href="#/transfer/${t.id}" tabindex="0" role="link">
                <td><span class="mono strong">${esc(t.id)}</span><div class="xs muted">${esc(t.reason).slice(0, 42)}</div></td>
                <td>${esc(warehouseOf(db, t.fromWarehouseId)?.code)} → ${esc(warehouseOf(db, t.toWarehouseId)?.code)}</td>
                <td class="hide-sm">${esc(t.neededBy)}</td>
                <td>${progressLine(db, t)}</td>
                <td class="num">${fmt.m(totals.requestedMm)}</td>
                <td>${badge(TRANSFER_STATUS[t.status].label, TRANSFER_STATUS[t.status].tone)}</td>
              </tr>`;
            }).join('') || `<tr><td colspan="6"><div class="empty">${icon('transfer')}<strong>Belum ada permintaan</strong><p>Buat permintaan internal pertama antar gudang.</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="mobile-cards">
        ${list.map((t) => {
          const totals = transferTotals(t);
          return `<a class="roll-card" href="#/transfer/${t.id}" style="color:inherit;text-decoration:none">
            <div class="top"><span class="id">${esc(t.id)}</span>${badge(TRANSFER_STATUS[t.status].label, TRANSFER_STATUS[t.status].tone)}</div>
            <div class="small strong">${esc(warehouseOf(db, t.fromWarehouseId)?.code)} → ${esc(warehouseOf(db, t.toWarehouseId)?.code)}</div>
            <div class="xs muted">Butuh ${esc(t.neededBy)} · ${esc(t.reason).slice(0, 46)}</div>
            ${progressLine(db, t)}
            <div class="grid3">
              <div class="kv"><span>Diminta</span><strong>${fmt.m(totals.requestedMm)}</strong></div>
              <div class="kv"><span>Dikirim</span><strong>${fmt.m(totals.dispatchedMm)}</strong></div>
              <div class="kv"><span>Transit</span><strong>${fmt.m(totals.inTransitMm)}</strong></div>
            </div>
          </a>`;
        }).join('') || `<div class="empty">${icon('transfer')}<strong>Belum ada permintaan</strong></div>`}
      </div>
    </section>`;
}

function renderDetail(ctx) {
  const { db, role, route } = ctx;
  const t = getTransfer(db, route.id);
  if (!t) return `${pageHead({ title: 'Tidak ditemukan' })}<div class="notice notice-danger">${icon('alert')}<div>Permintaan ${esc(route.id)} tidak ada.</div></div>`;

  const totals = transferTotals(t);
  const from = warehouseOf(db, t.fromWarehouseId);
  const to = warehouseOf(db, t.toWarehouseId);
  const project = t.projectId ? db.projects.find((p) => p.id === t.projectId) : null;
  const transit = transitRollsFor(db, t.id);
  const steps = [
    { key: 'submitted', label: 'Diajukan', done: !['draft', 'cancelled'].includes(t.status) },
    { key: 'approved', label: 'Disetujui', done: ['approved', 'dispatched', 'partially_received', 'received'].includes(t.status) },
    { key: 'dispatched', label: 'Dikirim', done: ['dispatched', 'partially_received', 'received'].includes(t.status) },
    { key: 'received', label: 'Diterima', done: t.status === 'received' },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);

  const actions = [];
  if (t.status === 'draft' && can(role, 'transfer.submit')) actions.push(`<button class="btn btn-primary" data-act="submit">${icon('arrow')} Ajukan</button>`);
  if (t.status === 'submitted' && can(role, 'approve')) {
    actions.push(`<button class="btn btn-primary" data-act="approve">${icon('check')} Setujui</button>`);
    actions.push(`<button class="btn btn-danger" data-act="reject">Tolak</button>`);
  }
  if (['approved', 'dispatched', 'partially_received'].includes(t.status) && can(role, 'transfer.dispatch') && totals.outstandingMm > 0) {
    actions.push(`<button class="btn btn-primary" data-act="dispatch">${icon('truck')} Kirim barang</button>`);
  }
  if (['dispatched', 'partially_received'].includes(t.status) && can(role, 'transfer.receive')) {
    actions.push(`<button class="btn" data-act="receive">${icon('box')} Terima barang</button>`);
  }
  if (['draft', 'submitted', 'approved', 'rejected'].includes(t.status) && totals.dispatchedMm === 0) {
    actions.push(`<button class="btn btn-ghost" data-act="cancel">Batalkan</button>`);
  }
  actions.push(`<button class="btn" data-act="print-request">${icon('printer')} Cetak permintaan</button>`);
  if (totals.dispatchedMm > 0) {
    actions.push(`<button class="btn" data-act="print-road">${icon('printer')} Surat jalan</button>`);
  }
  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/transfer">← Semua permintaan</a>
        <div class="row" style="margin-top:6px">
          <h1 class="mono">${esc(t.id)}</h1>
          ${badge(TRANSFER_STATUS[t.status].label, TRANSFER_STATUS[t.status].tone)}
        </div>
        <p class="sub">${esc(from?.name)} → ${esc(to?.name)} · dibutuhkan ${esc(formatDateLong(t.neededBy))}</p>
      </div>
      <div class="page-actions">${actions.join('')}</div>
    </div>

    <div class="grid grid-main">
      <div class="stack">
        <section class="card card-pad">
          <div class="flow" aria-label="Alur permintaan">
            ${steps.map((s, i) => `<div class="flow-step ${s.done ? 'done' : i === currentIdx ? 'current' : ''}">
              <strong>${esc(s.label)}</strong>
              ${s.done ? 'Selesai' : i === currentIdx ? 'Sekarang' : 'Menunggu'}
            </div>`).join('')}
          </div>
          ${t.status === 'rejected' ? `<div class="notice notice-danger">${icon('alert')}<div><strong>Ditolak.</strong> ${esc(t.rejectionNote)}</div></div>` : ''}
          ${t.status === 'cancelled' ? `<div class="notice notice-warn">${icon('alert')}<div>Dibatalkan sebelum pengiriman.</div></div>` : ''}
          <div class="grid grid-4" style="margin-top:12px">
            ${statCard({ label: 'Diminta', value: fmt.m(totals.requestedMm) })}
            ${statCard({ label: 'Dikirim', value: fmt.m(totals.dispatchedMm) })}
            ${statCard({ label: 'Diterima', value: fmt.m(totals.receivedMm), tone: 'accent' })}
            ${statCard({ label: 'Belum kirim', value: fmt.m(totals.outstandingMm), meta: `${fmt.m(totals.inTransitMm)} masih transit`, tone: 'warn' })}
          </div>
          <p class="xs muted" style="margin-top:10px">Belum kirim = diminta − dikirim (bukan dari jumlah diterima). Transit = dikirim − diterima. Ini mencegah pengiriman ganda.</p>
        </section>

        <section class="card">
          <div class="card-head"><div><h2>Baris material</h2><p>Roll sumber dan sisa per baris.</p></div></div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Produk</th><th class="num">Diminta</th><th class="num">Dikirim</th><th class="num">Diterima</th><th class="num">Belum kirim</th><th class="num">Transit</th><th><span class="sr-only">Aksi</span></th></tr></thead>
              <tbody>${t.lines.map((line) => {
                const sku = byId(db.skus, line.skuId);
                const s = lineStats(line);
                const canDispatch = ['approved', 'dispatched', 'partially_received'].includes(t.status) && s.outstandingMm > 0 && can(role, 'transfer.dispatch');
                return `<tr>
                  <td><div class="cell-main"><div class="txt"><strong>${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode)}</strong><span>${esc(sku?.code)}</span></div></div>
                    ${line.allocations.length ? `<div class="xs muted" style="margin-top:4px">${line.allocations.map((a) => `<a class="mono" href="#/stok/${a.rollId}">${esc(a.rollId)}</a> ${fmt.m(a.dispatchedMm)}`).join(' · ')}</div>` : ''}
                  </td>
                  <td class="num">${fmt.m(line.requestedMm)}</td>
                  <td class="num">${fmt.m(line.dispatchedMm)}</td>
                  <td class="num">${fmt.m(line.receivedMm)}</td>
                  <td class="num strong">${fmt.m(s.outstandingMm)}</td>
                  <td class="num">${fmt.m(s.inTransitMm)}</td>
                  <td class="right">${canDispatch ? `<button class="btn btn-sm" data-act="dispatch" data-line="${line.id}">Kirim</button>` : ''}${['dispatched', 'partially_received'].includes(t.status) && s.inTransitMm > 0 && can(role, 'transfer.receive') ? `<button class="btn btn-sm" data-act="receive" data-line="${line.id}">Terima</button>` : ''}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </section>

        <section class="card card-pad">
          <h2>Jejak dokumen</h2>
          <ul class="timeline" style="margin-top:10px">
            ${(t.history ?? []).map((h) => `<li><div class="t-head"><strong>${esc(h.action)}</strong><time>${esc(new Date(h.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</time></div><div class="t-body">${esc(h.by ?? '')}${h.note ? ` · ${esc(h.note)}` : ''}</div></li>`).join('')}
          </ul>
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad">
          <h2>Informasi</h2>
          <div class="stack-sm" style="margin-top:10px">
            <div class="row-between"><span class="small muted">Diminta oleh</span><span class="small">${esc(t.requestedByName)}</span></div>
            <div class="row-between"><span class="small muted">Dibuat</span><span class="small">${esc(t.createdDate)}</span></div>
            <div class="row-between"><span class="small muted">Disetujui</span><span class="small">${esc(t.approvedBy || '—')}</span></div>
            <div class="row-between"><span class="small muted">Proyek</span><span class="small">${project ? `<a href="#/proyek/${project.id}">${esc(project.name)}</a>` : '—'}</span></div>
          </div>
          <hr class="divider" />
          <div class="xs muted">Alasan</div>
          <p class="small" style="margin-top:4px">${esc(t.reason || '—')}</p>
        </section>

        <section class="card card-pad">
          <h2>Barang dalam perjalanan</h2>
          <p class="xs muted" style="margin:4px 0 10px">Fisik berada di kendaraan, bukan di gudang asal maupun tujuan.</p>
          ${transit.length ? `<div class="stack-sm">${transit.map((r) => `<div class="row-between">
            <a class="mono small" href="#/stok/${r.id}">${esc(r.id)}</a>
            <span class="small">${fmt.m(r.currentMm)} · lot ${esc(r.lot)}</span>
          </div>`).join('')}</div>` : '<p class="small muted">Tidak ada barang transit.</p>'}
        </section>

        <section class="card card-pad">
          <h2>Kebijakan</h2>
          <ul class="small muted" style="padding-left:16px;margin:8px 0 0;line-height:1.6">
            <li>Persetujuan tidak memesan stok; cek ulang saat kirim.</li>
            <li>Pembatalan hanya sebelum ada pengiriman.</li>
            <li>Barang rusak/hilang di transit butuh alur terpisah (belum tersedia).</li>
          </ul>
        </section>
      </div>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

function openDispatch(ctx, lineId = null) {
  const t = getTransfer(ctx.db, ctx.route.id);
  const line = lineId ? t.lines.find((l) => l.id === lineId) : t.lines.find((l) => lineStats(l).outstandingMm > 0);
  if (!line) return;
  const rolls = eligibleRolls(ctx.db, t.id, line);
  const sku = byId(ctx.db.skus, line.skuId);
  const s = lineStats(line);

  openModal({
    title: `Kirim ${sku?.code ?? ''}`,
    description: `Sisa yang belum dikirim ${fmt.m(s.outstandingMm)}. Pilih roll sumber; stok tersedia dicek ulang saat disimpan.`,
    wide: true,
    submitLabel: 'Kirim ke transit',
    body: `
      <div class="notice notice-info" style="margin-bottom:12px">${icon('alert')}<div>Pengiriman memindahkan meter ke <strong>transit</strong>. Stok gudang asal berkurang, gudang tujuan belum bertambah sampai diterima.</div></div>
      ${rolls.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>Roll</th><th>Lot</th><th>Rak</th><th class="num">Tersedia</th><th class="num" style="width:120px">Kirim (m)</th></tr></thead>
        <tbody>${rolls.map((r) => `<tr>
          <td class="mono">${esc(r.id)}</td>
          <td>${esc(r.lot)}</td>
          <td>${esc(r.bin || '—')}</td>
          <td class="num">${fmt.m(availableMmOf(r))}</td>
          <td><input class="input" style="min-height:36px;text-align:right" inputmode="decimal" name="roll:${r.id}" placeholder="0" aria-label="Kirim dari ${esc(r.id)}" /></td>
        </tr>`).join('')}</tbody>
      </table></div>` : `<div class="notice notice-danger">${icon('alert')}<div>Tidak ada roll tersedia di gudang sumber. Selesaikan reservasi atau pilih gudang lain.</div></div>`}
      ${field('Catatan pengiriman', `<input class="input" name="note" placeholder="Contoh: kirim bertahap, roll dipotong 5 m" />`)}
    `,
    onMount(form) {
      const inputs = [...form.querySelectorAll('input[name^="roll:"]')];
      inputs[0]?.focus();
    },
    onSubmit(form, close) {
      const allocations = [];
      form.querySelectorAll('input[name^="roll:"]').forEach((input) => {
        const qty = parseM(input.value);
        if (qty > 0) allocations.push({ rollId: input.name.slice(5), qtyMm: qty });
      });
      if (!allocations.length) throw new Error('Isi jumlah kirim pada minimal satu roll.');
      ctx.store.update((db) => {
        dispatchLine(db, {
          transferId: t.id,
          lineId: line.id,
          allocations,
          user: ctx.user,
          note: form.note?.value ?? '',
        });
      });
      close();
      toast('Barang dikirim ke transit. Gudang tujuan belum menerima.', { tone: 'success' });
    },
  });
}

function availableMmOf(roll) {
  return Math.max(0, roll.currentMm - (roll.reservedMm || 0));
}

function openReceive(ctx, lineId = null) {
  const t = getTransfer(ctx.db, ctx.route.id);
  const line = lineId ? t.lines.find((l) => l.id === lineId) : t.lines.find((l) => lineStats(l).inTransitMm > 0);
  if (!line) return;
  const s = lineStats(line);
  const sku = byId(ctx.db.skus, line.skuId);
  openModal({
    title: `Terima ${sku?.code ?? ''}`,
    description: `Barang dalam perjalanan: ${fmt.m(s.inTransitMm)}. Penerimaan boleh sebagian.`,
    submitLabel: 'Catat penerimaan',
    body: `
      ${field('Jumlah diterima (m)', `<input class="input" name="qty" inputmode="decimal" value="${(s.inTransitMm / 1000).toLocaleString('id-ID')}" aria-describedby="receive-hint" />`, { hint: `Maksimum ${fmt.m(s.inTransitMm)}. Sisa tetap tercatat sebagai transit.` })}
      ${field('Rak tujuan (opsional)', `<input class="input" name="bin" placeholder="Contoh: B-01-03" />`)}
      ${field('Catatan', `<input class="input" name="note" placeholder="Kondisi barang, jumlah roll, dsb." />`)}
      <div class="notice notice-info" style="margin-top:12px">${icon('box')}<div>Penerimaan tidak mengubah jumlah diminta. Outstanding pengiriman tetap dihitung dari jumlah diminta − dikirim.</div></div>
    `,
    onSubmit(form, close) {
      const qty = parseM(form.qty.value);
      if (!qty) throw new Error('Jumlah terima wajib diisi.');
      ctx.store.update((db) => {
        receiveLine(db, {
          transferId: t.id,
          lineId: line.id,
          qtyMm: qty,
          user: ctx.user,
          bin: form.bin?.value ?? '',
          note: form.note?.value ?? '',
        });
      });
      close();
      toast('Penerimaan dicatat. Stok fisik bertambah di gudang tujuan.', { tone: 'success' });
    },
  });
}

export function openCreate(ctx) {
  const { db, role } = ctx;
  const active = db.warehouses.filter((w) => w.active !== false);
  if (!active.length) {
    toast('Tidak ada gudang aktif. Aktifkan gudang di Master Data.', { tone: 'error' });
    return;
  }
  const defaultFrom = ctx.ui.warehouseId === 'all' || !active.some((w) => w.id === ctx.ui.warehouseId)
    ? active[0].id
    : ctx.ui.warehouseId;
  const defaultTo = active.find((w) => w.id !== defaultFrom)?.id ?? active[1]?.id ?? defaultFrom;
  const skuOptions = db.skus.filter((s) => s.active).map((s) => `<option value="${s.id}">${esc(s.collectionName)} ${esc(s.colourName || s.colourCode)} — ${esc(s.code)}</option>`).join('');
  const projectOptions = db.projects.filter((p) => ['draft', 'reserved'].includes(p.status)).map((p) => `<option value="${p.id}">${esc(p.id)} · ${esc(p.name)}</option>`).join('');

  const lineRow = () => `<div class="alloc-row" data-line-row style="grid-template-columns:1fr 110px 36px">
    <select class="select tl-sku" aria-label="Produk">${skuOptions}</select>
    <input class="input tl-qty" inputmode="decimal" placeholder="m" aria-label="Jumlah meter" />
    <button class="icon-btn" type="button" data-remove-row aria-label="Hapus baris">${icon('x')}</button>
  </div>`;

  openModal({
    title: 'Buat permintaan gudang',
    description: 'PO internal tanpa pemasok. Gudang penerima mengajukan; manajer menyetujui.',
    wide: true,
    submitLabel: 'Buat & ajukan',
    body: `
      <div class="form-grid">
        ${field('Gudang sumber', `<select class="select" name="from" required>${warehouseOptions(db, defaultFrom)}</select>`)}
        ${field('Gudang tujuan', `<select class="select" name="to" required>${warehouseOptions(db, defaultTo)}</select>`)}
        ${field('Dibutuhkan tanggal', `<input class="input" type="date" name="neededBy" value="${new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)}" />`)}
        ${field('Proyek (opsional)', `<select class="select" name="projectId"><option value="">— Tanpa proyek —</option>${projectOptions}</select>`)}
        ${field('Alasan / referensi', `<input class="input" name="reason" placeholder="Contoh: permintaan customer Bandung" />`, { full: true })}
      </div>
      <div class="section-title" style="margin:20px 0 8px"><h3>Material</h3><span class="xs muted">Satuan meter</span></div>
      <div id="line-rows">${lineRow()}</div>
      <button class="btn btn-sm" type="button" data-add-row>${icon('plus')} Tambah baris</button>
      <div class="notice notice-info" style="margin-top:14px">${icon('alert')}<div>Permintaan tidak memesan stok. Saat menyetujui, manajer hanya menyetujui kebutuhan; ketersediaan dicek ulang saat pengiriman.</div></div>
    `,
    onMount(form) {
      const rows = form.querySelector('#line-rows');
      form.querySelector('[data-add-row]').addEventListener('click', () => {
        rows.insertAdjacentHTML('beforeend', `<div class="alloc-row" data-line-row style="grid-template-columns:1fr 110px 36px">
          <select class="select tl-sku" aria-label="Produk">${skuOptions}</select>
          <input class="input tl-qty" inputmode="decimal" placeholder="m" aria-label="Jumlah meter" />
          <button class="icon-btn" type="button" data-remove-row aria-label="Hapus baris">${icon('x')}</button>
        </div>`);
      });
      rows.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-row]');
        if (btn && rows.children.length > 1) btn.closest('[data-line-row]').remove();
      });
    },
    onSubmit(form, close) {
      const from = form.from.value;
      const to = form.to.value;
      if (from === to) throw new Error('Gudang sumber dan tujuan harus berbeda.');
      const lines = [...form.querySelectorAll('[data-line-row]')]
        .map((row) => ({ skuId: row.querySelector('.tl-sku').value, requestedMm: parseM(row.querySelector('.tl-qty').value) }))
        .filter((l) => l.requestedMm > 0);
      if (!lines.length) throw new Error('Isi minimal satu baris material.');
      const created = ctx.store.update((db) => {
        const t = createTransfer(db, {
          fromWarehouseId: from,
          toWarehouseId: to,
          neededBy: form.neededBy.value,
          reason: form.reason.value,
          projectId: form.projectId.value || null,
          lines,
          user: ctx.user,
        });
        submitTransfer(db, { id: t.id, user: ctx.user });
        return t;
      });
      close();
      window.location.hash = `#/transfer/${created.id}`;
      toast('Permintaan dibuat dan diajukan untuk persetujuan.', { tone: 'success' });
    },
  });
}

export function mount(ctx) {
  if (ctx.route.id) {
    const t = getTransfer(ctx.db, ctx.route.id);
    if (!t) return;
    const act = (name) => document.querySelectorAll(`[data-act="${name}"]`).forEach((btn) => btn.addEventListener('click', async () => {
      try {
        if (name === 'submit') {
          ctx.store.update((db) => submitTransfer(db, { id: t.id, user: ctx.user }));
          toast('Permintaan diajukan. Menunggu persetujuan manajer.', { tone: 'success' });
        } else if (name === 'approve') {
          ctx.store.update((db) => approveTransfer(db, { id: t.id, user: ctx.user, note: 'Disetujui dari demo.' }));
          toast('Permintaan disetujui. Stok belum dipesan; cek saat kirim.', { tone: 'success' });
        } else if (name === 'reject') {
          const note = await promptText({ title: 'Tolak permintaan', label: 'Alasan penolakan', hint: 'Alasan terlihat oleh gudang peminta.', submitLabel: 'Tolak permintaan', tone: 'danger' });
          if (!note) return;
          ctx.store.update((db) => rejectTransfer(db, { id: t.id, user: ctx.user, note }));
          toast('Permintaan ditolak.', { tone: 'success' });
        } else if (name === 'cancel') {
          ctx.store.update((db) => cancelTransfer(db, { id: t.id, user: ctx.user, note: 'Dibatalkan dari demo.' }));
          toast('Permintaan dibatalkan sebelum pengiriman.', { tone: 'success' });
        } else if (name === 'dispatch') {
          openDispatch(ctx, btn.dataset.line ?? null);
        } else if (name === 'receive') {
          openReceive(ctx, btn.dataset.line ?? null);
        } else if (name === 'print-request') {
          printDocument(`Permintaan ${t.id}`, printTransferHtml(ctx.db, t, 'permintaan'));
        } else if (name === 'print-road') {
          printDocument(`Surat jalan ${t.id}`, printTransferHtml(ctx.db, t, 'surat-jalan'));
        }
      } catch (err) {
        toast(err.message, { tone: 'error' });
      }
    }));
    ['submit', 'approve', 'reject', 'cancel', 'dispatch', 'receive', 'print-request', 'print-road'].forEach(act);
    return;
  }

  document.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', () => {
    statusFilter = btn.dataset.status;
    ctx.store.emit();
  }));
  document.querySelectorAll('tr[data-href]').forEach((tr) => {
    tr.addEventListener('click', () => { window.location.hash = tr.dataset.href.replace('#', ''); });
  });
  if (ctx.route.query?.new) {
    history.replaceState(null, '', '#/transfer');
    openCreate(ctx);
  }
}
