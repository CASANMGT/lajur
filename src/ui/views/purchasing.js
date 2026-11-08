/** Pembelian: PO pemasok, penerimaan, tagihan, pemasok. */

import {
  esc, icon, fmt, badge, toast, openModal, field, printDocument,
} from '../dom.js';
import { byId, daysBetween, parseM, todayJakarta } from '../../domain/core.js';
import {
  PO_STATUS, approvePO, createPO, createSupplierReturn, paySupplierInvoice, payablesAging, poLineOpen,
  receivePO, saveSupplier, supplierPerformance,
} from '../../domain/purchasing.js';
import {
  SHIPMENT_MODE, SHIPMENT_STATUS, activeShipmentForPO, createShipment, landedAddPerUnit,
  shipmentProgress, shipmentStats, shipmentsForPO, updateShipmentStatus,
} from '../../domain/shipments.js';
import { attachmentMeta } from '../../domain/attachments.js';
import { settingsOf } from '../../domain/settings.js';
import { auditTrail } from '../../domain/master.js';
import { pageHead, statCard, warehouseOf, can, warehouseOptions, roleHint } from './common.js';
import { latestFxRate, latestSupplierPrice } from '../../domain/pricing.js';
import { printPoHtml } from './print.js';

let tab = 'po';

export function render(ctx) {
  if (ctx.route.id) return renderPoDetail(ctx);

  const { db, role } = ctx;
  const ap = payablesAging(db);
  const open = ap.items.length;
  const late = ap.items.filter((i) => i.daysLate > 0).length;
  const ship = shipmentStats(db);
  const showFinance = role === 'manager';
  const tabs = [
    ['po', 'Purchase order'], ['penerimaan', 'Penerimaan'], ['pengiriman', 'Pengiriman impor'],
    ...(showFinance ? [['tagihan', 'Tagihan & pembayaran'], ['pemasok', 'Pemasok']] : []),
  ];
  if (!tabs.some(([k]) => k === tab)) tab = 'po';

  return `
    ${pageHead({
      eyebrow: 'Pembelian',
      title: 'Pemasok & penerimaan',
      sub: 'PO eksternal terpisah dari permintaan gudang. Penerimaan menolak nomor ganda dan kelebihan kirim.',
      actions: `${can(role, 'po.create') ? `<button class="btn btn-primary" type="button" data-act="new-po">${icon('plus')} Buat PO</button>` : ''}`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${showFinance ? statCard({ label: 'Utang pemasok', value: fmt.money(ap.total), meta: `${open} tagihan terbuka`, tone: 'warn', iconName: 'truck' }) : ''}
      ${showFinance ? statCard({ label: 'Lewat jatuh tempo', value: String(late), meta: 'Tagihan perlu dibayar', tone: 'warn' }) : ''}
      ${statCard({ label: 'PO berjalan', value: String(db.purchaseOrders.filter((p) => ['approved', 'partial'].includes(p.status)).length), meta: 'Belum diterima lengkap' })}
      ${statCard({ label: 'Pengiriman aktif', value: String(ship.active), meta: `${ship.late} lewat ETA · ${ship.customs} di bea cukai`, tone: ship.late ? 'warn' : '' })}
      ${showFinance ? '' : statCard({ label: 'Penerimaan', value: String(db.goodsReceipts.length), meta: 'Dokumen GR tersimpan' })}
    </div>

    <div class="tabs" role="tablist">
      ${tabs.map(([k, label]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${esc(label)}</button>`).join('')}
    </div>

    ${tab === 'po' ? renderPoTab(ctx) : tab === 'penerimaan' ? renderReceiptTab(ctx) : tab === 'pengiriman' ? renderShipmentTab(ctx) : tab === 'tagihan' ? renderBillTab(ctx) : renderSupplierTab(ctx)}`;
}

function renderPoTab(ctx) {
  const { db } = ctx;
  const showMoney = ctx.role === 'manager';
  const rows = [...db.purchaseOrders].sort((a, b) => (a.date < b.date ? 1 : -1));
  return `<section class="card">
    <div class="table-wrap desktop-table">
      <table class="data">
        <thead><tr><th>PO</th><th>Pemasok</th><th class="hide-sm">Estimasi</th><th style="min-width:150px">Diterima</th>${showMoney ? '<th class="num">Total</th>' : ''}<th>Status</th></tr></thead>
        <tbody>${rows.map((po) => {
          const lines = po.lines;
          const ordered = lines.reduce((a, l) => a + (l.qtyMm ?? 0) + (l.qtyPcs ?? 0), 0);
          const received = lines.reduce((a, l) => a + (l.receivedMm ?? 0) + (l.receivedPcs ?? 0), 0);
          const pct = ordered ? Math.round((received / ordered) * 100) : 0;
          return `<tr data-href="#/pembelian/${po.id}" tabindex="0" role="link">
            <td><span class="mono strong">${esc(po.id)}</span><div class="xs muted">${esc(po.date)}</div></td>
            <td>${esc(po.supplierName)}</td>
            <td class="hide-sm">${esc(po.expectedDate)}${po.expectedDate < todayJakarta() && ['approved', 'partial'].includes(po.status) ? ' <span class="badge badge-warn no-dot">lewat</span>' : ''}</td>
            <td><div class="meter"><i style="width:${pct}%" class="${pct < 100 ? 'warn' : ''}"></i></div><div class="xs muted">${pct}%</div></td>
            ${showMoney ? `<td class="num">${fmt.money(po.total)}</td>` : ''}
            <td>${badge(PO_STATUS[po.status].label, PO_STATUS[po.status].tone)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    <div class="mobile-cards">
      ${rows.map((po) => `<a class="roll-card" href="#/pembelian/${po.id}" style="color:inherit;text-decoration:none">
        <div class="top"><span class="id">${esc(po.id)}</span>${badge(PO_STATUS[po.status].label, PO_STATUS[po.status].tone)}</div>
        <div class="small strong">${esc(po.supplierName)}</div>
        <div class="xs muted">Estimasi ${esc(po.expectedDate)} · ${esc(po.note || '')}</div>
        <div class="grid3">${showMoney ? `<div class="kv"><span>Total</span><strong>${fmt.money(po.total)}</strong></div>` : ''}<div class="kv"><span>Baris</span><strong>${po.lines.length}</strong></div><div class="kv"><span>Status</span><strong>${esc(PO_STATUS[po.status].label)}</strong></div></div>
      </a>`).join('')}
    </div>
  </section>`;
}

function renderReceiptTab(ctx) {
  const { db } = ctx;
  const rows = [...db.goodsReceipts].sort((a, b) => (a.date < b.date ? 1 : -1));
  return `<div class="notice notice-info" style="margin-bottom:12px">${icon('box')}<div>Semua penerimaan barang — dari PO maupun <strong>Tambah stok</strong> langsung. Penerimaan langsung tidak membuat utang pemasok.</div></div>
    <section class="card">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Dokumen</th><th>Jenis</th><th>Asal</th><th class="hide-sm">Gudang</th><th class="hide-sm">Tanggal</th><th class="num">Nilai</th></tr></thead>
        <tbody>${rows.map((r) => {
          const adhoc = r.kind === 'adhoc';
          const po = r.poId ? db.purchaseOrders.find((p) => p.id === r.poId) : null;
          return `<tr>
            <td class="mono">${esc(r.id)}<div class="xs muted">${esc(r.ref)}</div></td>
            <td>${adhoc ? badge('Tambah stok', 'copper') : badge('PO pemasok', 'teal')}</td>
            <td>${adhoc ? `<span class="small muted">${esc(r.note)}</span>` : `${po ? `<a class="small" href="#/pembelian/${po.id}">${esc(po.id)}</a> · ` : ''}${esc(byId(db.suppliers, r.supplierId)?.name ?? '—')}`}</td>
            <td class="hide-sm">${esc(warehouseOf(db, r.warehouseId)?.code ?? '—')}</td>
            <td class="hide-sm">${esc(r.date)}</td>
            <td class="num">${fmt.money(r.total)}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="6"><div class="empty">${icon('box')}<strong>Belum ada penerimaan</strong></div></td></tr>`}</tbody>
      </table></div>
    </section>`;
}

function renderShipmentTab(ctx) {
  const { db } = ctx;
  const rows = [...db.shipments].sort((a, b) => (a.eta < b.eta ? -1 : 1));
  return `<div class="notice notice-info" style="margin-bottom:12px">${icon('globe')}<div><strong>Impor & kurs.</strong> Nilai PO dalam mata uang pemasok; HPP roll memakai kurs saat PO + landed cost pengiriman. Pembayaran pemasok impor dicatat dalam CNY.</div></div>
    <section class="card">
      <div class="table-wrap desktop-table"><table class="data">
        <thead><tr><th>Pengiriman</th><th>PO / Pemasok</th><th>Moda</th><th>ETD → ETA</th><th class="num">Nilai PO</th><th class="num">Landed</th><th>Status</th></tr></thead>
        <tbody>${rows.map((s) => {
          const po = db.purchaseOrders.find((p) => p.id === s.poId);
          const supplier = byId(db.suppliers, s.supplierId);
          const late = s.eta < todayJakarta() && !['received', 'cancelled'].includes(s.status);
          return `<tr>
            <td><span class="mono strong">${esc(s.reference)}</span><div class="xs muted">${esc(s.id)} · ${esc(s.container || '—')}</div></td>
            <td><a class="mono small" href="#/pembelian/${s.poId}">${esc(s.poId)}</a><div class="xs muted">${esc(supplier?.name ?? '')}</div></td>
            <td>${esc(SHIPMENT_MODE[s.mode]?.label ?? s.mode)}</td>
            <td>${esc(s.etd)} → <span class="${late ? 'strong' : ''}">${esc(s.eta)}</span>${late ? ' ' + badge('lewat', 'danger') : ''}</td>
            <td class="num">${po ? fmt.money(po.total) : '—'}</td>
            <td class="num">${fmt.money(s.landedCostIdr)}</td>
            <td>${badge(SHIPMENT_STATUS[s.status].label, SHIPMENT_STATUS[s.status].tone)}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="7"><div class="empty">${icon('ship')}<strong>Belum ada pengiriman</strong><p>Buat dari PO impor.</p></div></td></tr>`}</tbody>
      </table></div>
      <div class="mobile-cards">
        ${rows.map((s) => `<a class="roll-card" href="#/pembelian/${s.poId}" style="color:inherit;text-decoration:none">
          <div class="top"><span class="id">${esc(s.reference)}</span>${badge(SHIPMENT_STATUS[s.status].label, SHIPMENT_STATUS[s.status].tone)}</div>
          <div class="small strong">${esc(s.poId)} · ${esc(byId(db.suppliers, s.supplierId)?.name ?? '')}</div>
          <div class="xs muted">${esc(s.etd)} → ${esc(s.eta)} · ${esc(SHIPMENT_MODE[s.mode]?.label ?? s.mode)}</div>
          <div class="grid3"><div class="kv"><span>Landed</span><strong>${fmt.money(s.landedCostIdr)}</strong></div><div class="kv"><span>Kontainer</span><strong class="xs">${esc(s.container || '—')}</strong></div><div class="kv"><span>ETA</span><strong class="xs">${esc(s.eta)}</strong></div></div>
        </a>`).join('')}
      </div>
    </section>`;
}

function renderBillTab(ctx) {  const { db, role } = ctx;
  const ap = payablesAging(db);
  const bills = [...db.supplierInvoices].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  return `<div class="notice notice-info" style="margin-bottom:12px">${icon('alert')}<div><strong>Demo menggabungkan penerimaan dan tagihan.</strong> Produksi harus memisahkan GR dan supplier invoice, lalu merekonsiliasi sebelum utang diposting.</div></div>
    <section class="card">
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Tagihan</th><th>Pemasok</th><th class="hide-sm">Jatuh tempo</th><th class="num">Nilai</th><th class="num">Dibayar</th><th class="num">Sisa</th><th><span class="sr-only">Aksi</span></th></tr></thead>
          <tbody>${bills.map((b) => {
            const out = b.amount - b.paid;
            const late = daysBetween(b.dueDate, todayJakarta());
            return `<tr>
              <td class="mono">${esc(b.id)}<div class="xs muted">${esc(b.poId ?? '')}</div></td>
              <td>${esc(byId(db.suppliers, b.supplierId)?.name ?? b.supplierId)}</td>
              <td class="hide-sm">${esc(b.dueDate)}${late > 0 ? ` <span class="badge badge-danger no-dot">${late} hr</span>` : ''}</td>
              <td class="num">${fmt.money(b.amount)}${b.currency !== 'IDR' ? `<div class="xs muted">${esc(b.currency)} ${b.amountForeign.toLocaleString('id-ID')} @ ${fmt.money(b.fxRate)}</div>` : ''}</td>
              <td class="num">${fmt.money(b.paid)}${b.currency !== 'IDR' ? `<div class="xs muted">${esc(b.currency)} ${(b.paidForeign ?? 0).toLocaleString('id-ID')}</div>` : ''}</td>
              <td class="num ${out ? 'strong' : 'muted'}">${fmt.money(out)}</td>
              <td class="right">${out > 0 && role === 'manager' ? `<button class="btn btn-sm" data-pay="${b.id}">Bayar</button>` : ''}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="7"><div class="empty">${icon('wallet')}<strong>Belum ada tagihan</strong></div></td></tr>`}</tbody>
        </table>
      </div>
    </section>`;
}

function renderSupplierTab(ctx) {
  const { db, role, metrics } = ctx;
  return `<div class="row-between" style="margin-bottom:12px">
      <div><h2>Pemasok lokal & impor</h2><p class="xs muted">Kurs dan mata uang memengaruhi PO, tagihan, pembayaran, dan HPP.</p></div>
      ${role === 'manager' ? `<button class="btn btn-primary" type="button" data-act="new-supplier">${icon('plus')} Tambah pemasok</button>` : ''}
    </div>
    <div class="grid grid-2">
    ${db.suppliers.map((s) => {
      const perf = supplierPerformance(db).find((p) => p.supplier.id === s.id);
      const prices = db.supplierPrices.filter((p) => p.supplierId === s.id);
      return `<section class="card card-pad">
        <div class="row-between"><div><h2>${esc(s.name)}</h2><div class="xs muted">${esc(s.code)} · ${esc(s.address)}</div></div>${role === 'manager' ? `<button class="btn btn-sm" data-edit-supplier="${s.id}">Edit</button>` : ''}</div>
        <div class="row" style="margin-top:8px">${s.origin === 'import' ? badge('Impor · ' + (s.country ?? 'CN'), 'copper') : badge('Lokal', 'teal')} ${badge(s.currency === 'CNY' ? 'Bayar CNY' : 'Bayar IDR', s.currency === 'CNY' ? 'copper' : 'muted')}</div>
        <div class="stack-sm" style="margin-top:10px">
          <div class="row-between"><span class="small muted">Kontak</span><span class="small">${esc(s.contact)} · ${esc(s.phone)}</span></div>
          <div class="row-between"><span class="small muted">Termin</span><span class="small">${esc(s.termsDays)} hari · lead ${esc(s.leadTimeDays)} hari</span></div>
          ${s.origin === 'import' ? `<div class="row-between"><span class="small muted">Kurs / incoterm</span><span class="small">1 ${esc(s.currency)} = ${fmt.money(s.fxRate)} · ${esc(s.incoterm || '—')}</span></div>
          <div class="row-between"><span class="small muted">Pelabuhan</span><span class="small">${esc(s.port || '—')}</span></div>` : ''}
          <div class="row-between"><span class="small muted">Performa</span><span class="small">${perf?.receiptCount ?? 0} penerimaan · ${perf?.lateReceipts ?? 0} terlambat</span></div>
        </div>
        <hr class="divider" />
        <div class="xs muted">Harga pemasok</div>
        <div class="stack-sm" style="margin-top:6px">
          ${prices.map((p) => {
            const sku = p.skuId ? byId(db.skus, p.skuId) : null;
            const part = p.partId ? byId(db.parts, p.partId) : null;
            const foreign = s.currency && s.currency !== 'IDR';
            return `<div class="row-between"><span class="small">${esc(sku ? `${sku.code} — ${sku.colourName || sku.colourCode}` : part?.name ?? '')}</span><span class="small num">${foreign ? `${esc(s.currency)} ${p.price.toLocaleString('id-ID')}` : fmt.money(p.price)} / ${esc(p.unit)}${foreign ? ` <span class="xs muted">≈ ${fmt.money(p.price * s.fxRate)}</span>` : ''}</span></div>`;
          }).join('') || '<span class="small muted">Belum ada daftar harga.</span>'}
        </div>
      </section>`;
    }).join('')}
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Detail PO                                                                  */
/* -------------------------------------------------------------------------- */

function renderPoDetail(ctx) {
  const { db, role, route } = ctx;
  const po = db.purchaseOrders.find((p) => p.id === route.id);
  if (!po) return `${pageHead({ title: 'Tidak ditemukan' })}<div class="notice notice-danger">${icon('alert')}<div>PO ${esc(route.id)} tidak ada.</div></div>`;
  const supplier = byId(db.suppliers, po.supplierId);
  const receipts = db.goodsReceipts.filter((r) => r.poId === po.id);
  const bill = db.supplierInvoices.find((b) => b.poId === po.id);
  const shipment = activeShipmentForPO(db, po.id);
  const landed = landedAddPerUnit(db, po.id);
  const showMoney = role === 'manager';
  const actions = [];
  if (po.status === 'draft' && role === 'manager') actions.push(`<button class="btn btn-primary" data-act="approve">${icon('check')} Setujui PO</button>`);
  if (['approved', 'partial'].includes(po.status) && can(role, 'po.receive')) actions.push(`<button class="btn btn-primary" data-act="receive">${icon('truck')} Terima barang</button>`);
  if (['approved', 'partial'].includes(po.status) && !shipment && po.currency !== 'IDR' && can(role, 'shipment.create')) actions.push(`<button class="btn btn-copper" data-act="new-shipment">${icon('ship')} Buat pengiriman</button>`);
  if (shipment && !['received', 'cancelled'].includes(shipment.status) && can(role, 'shipment.update')) actions.push(`<button class="btn" data-act="shipment-status">${icon('route')} Update pengiriman</button>`);
  actions.push(`<button class="btn" data-act="print">${icon('printer')} Cetak PO</button>`);

  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/pembelian">← Semua pembelian</a>
        <div class="row" style="margin-top:6px"><h1 class="mono">${esc(po.id)}</h1>${badge(PO_STATUS[po.status].label, PO_STATUS[po.status].tone)} ${po.currency !== 'IDR' ? badge(`Impor ${po.currency}`, 'copper') : ''}</div>
        <p class="sub">${esc(supplier?.name)} · estimasi ${esc(po.expectedDate)} · termin ${esc(po.termsDays)} hari ${showMoney ? `· ${po.currency !== 'IDR' ? `${esc(po.currency)} ${po.totalForeign.toLocaleString('id-ID')} @ ${fmt.money(po.fxRate)} ≈ ${fmt.money(po.total)}` : fmt.money(po.total)}` : ''}</p>
      </div>
      <div class="page-actions">${actions.join('')}</div>
    </div>

    <div class="grid grid-main">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Baris pesanan</h2><p>Kelebihan terima ditolak per baris.</p></div>${showMoney ? `<span class="badge no-dot">${po.currency !== 'IDR' ? `${po.currency} ${po.totalForeign.toLocaleString('id-ID')} · ${fmt.money(po.total)}` : fmt.money(po.total)}</span>` : ''}</div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Barang</th><th class="num">Dipesan</th><th class="num">Diterima</th><th class="num">Sisa</th>${showMoney ? '<th class="num">Harga</th>' : ''}</tr></thead>
              <tbody>${po.lines.map((l) => {
                const open = poLineOpen(l);
                return `<tr>
                  <td><strong>${esc(l.description)}</strong></td>
                  <td class="num">${l.kind === 'fabric' ? fmt.m(l.qtyMm) : `${fmt.pcs(l.qtyPcs)} pcs`}</td>
                  <td class="num">${l.kind === 'fabric' ? fmt.m(l.receivedMm) : `${fmt.pcs(l.receivedPcs)} pcs`}</td>
                  <td class="num ${open ? 'strong' : 'muted'}">${l.kind === 'fabric' ? fmt.m(open) : `${fmt.pcs(open)} pcs`}</td>
                  ${showMoney ? `<td class="num">${po.currency !== 'IDR' ? `${esc(po.currency)} ${l.unitPrice.toLocaleString('id-ID')}<div class="xs muted">${fmt.money(l.unitCostIdr ?? l.unitPrice)} / ${esc(l.unit)}</div>` : fmt.money(l.unitPrice)}</td>` : ''}
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </section>

        ${shipment ? `<section class="card">
          <div class="card-head"><div><h2>Pengiriman impor</h2><p>${esc(shipment.reference)} · ${esc(SHIPMENT_MODE[shipment.mode]?.label ?? shipment.mode)}</p></div>${badge(SHIPMENT_STATUS[shipment.status].label, SHIPMENT_STATUS[shipment.status].tone)}</div>
          <div class="card-pad">
            <div class="flow" style="grid-template-columns:repeat(5,minmax(0,1fr))">
              ${shipmentProgress(shipment).map((s) => `<div class="flow-step ${s.state === 'done' ? 'done' : s.state === 'current' ? 'current' : ''}"><strong>${esc(s.label)}</strong>${s.state === 'done' ? 'Selesai' : s.state === 'current' ? 'Sekarang' : 'Menunggu'}</div>`).join('')}
            </div>
            <div class="grid grid-3" style="margin-top:10px">
              <div><div class="xs muted">ETD / ETA</div><div class="small">${esc(shipment.etd)} → ${esc(shipment.eta)}</div></div>
              <div><div class="xs muted">Kontainer</div><div class="small mono">${esc(shipment.container || '—')}</div></div>
              ${showMoney ? `<div><div class="xs muted">Landed cost</div><div class="small strong">${fmt.money(shipment.landedCostIdr)}</div></div>` : ''}
            </div>
            ${showMoney ? `<div class="grid grid-4" style="margin-top:10px">
              <div><div class="xs muted">Freight</div><div class="small num">${fmt.money(shipment.costs.freightIdr)}</div></div>
              <div><div class="xs muted">Asuransi</div><div class="small num">${fmt.money(shipment.costs.insuranceIdr)}</div></div>
              <div><div class="xs muted">Bea masuk</div><div class="small num">${fmt.money(shipment.costs.dutyIdr)}</div></div>
              <div><div class="xs muted">Lain-lain</div><div class="small num">${fmt.money(shipment.costs.otherIdr)}</div></div>
            </div>` : ''}
            ${landed ? `<div class="notice notice-teal" style="margin-top:10px">${icon('box')}<div><strong>Landed cost dialokasikan ke HPP.</strong> Penerimaan berikutnya memakai harga pokok termasuk freight/duty per unit.</div></div>` : ''}
            ${shipment.attachments?.length ? `<div class="row" style="margin-top:8px">${shipment.attachments.map((a) => badge(`${a.name}`, 'muted')).join('')}</div>` : ''}
            <div class="row" style="margin-top:10px"><a class="btn btn-sm" href="#/pembelian?tab=pengiriman">${icon('ship')} Semua pengiriman</a></div>
          </div>
        </section>` : po.currency !== 'IDR' ? `<div class="notice notice-info">${icon('ship')}<div><strong>Belum ada pengiriman.</strong> Buat pengiriman untuk melacak BL/container, ETD/ETA, bea cukai, dan landed cost.</div></div>` : ''}

        <section class="card">
          <div class="card-head"><div><h2>Penerimaan</h2><p>Setiap baris menyimpan roll dan lot sendiri.</p></div><span class="badge no-dot">${receipts.length}</span></div>
          ${receipts.length ? `<div class="table-wrap"><table class="data">
            <thead><tr><th>Dokumen</th><th>Tanggal</th><th>Gudang</th>${showMoney ? '<th class="num">Nilai</th><th>Tagihan</th>' : ''}</tr></thead>
            <tbody>${receipts.map((r) => `<tr>
              <td class="mono">${esc(r.id)}<div class="xs muted">${esc(r.ref)}</div></td>
              <td>${esc(r.date)}</td>
              <td>${esc(warehouseOf(db, r.warehouseId)?.code)}</td>
              ${showMoney ? `<td class="num">${fmt.money(r.total)}</td>
              <td>${r.supplierInvoiceId ? `<a class="mono xs" href="#/pembelian?tab=tagihan">${esc(r.supplierInvoiceId)}</a>` : '—'}</td>` : ''}
            </tr>`).join('')}</tbody>
          </table></div>` : `<div class="empty" style="padding:24px">${icon('truck')}<strong>Belum diterima</strong><p>Terima sebagian atau lengkap saat barang tiba.</p></div>`}
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad">
          <h2>Ringkasan</h2>
          <div class="stack-sm" style="margin-top:10px">
            <div class="row-between"><span class="small muted">Pemasok</span><span class="small">${esc(supplier?.name)}</span></div>
            <div class="row-between"><span class="small muted">Kontak</span><span class="small">${esc(supplier?.contact)}</span></div>
            <div class="row-between"><span class="small muted">Dibuat</span><span class="small">${esc(po.date)}</span></div>
            <div class="row-between"><span class="small muted">Disetujui</span><span class="small">${esc(po.approvedBy || '—')}</span></div>
            ${showMoney && po.currency !== 'IDR' ? `<div class="row-between"><span class="small muted">Kurs terkunci</span><span class="small">${fmt.money(po.fxRate)} / ${esc(po.currency)}</span></div>
            <div class="row-between"><span class="small muted">Kurs dicatat</span><span class="small">${esc(po.fxAsOf ?? po.date)}<div class="xs muted">${esc(po.fxSource ?? '—')}</div></span></div>` : ''}
            <div class="row-between"><span class="small muted">Tagihan</span><span class="small">${bill ? `${esc(bill.id)}` : '—'}</span></div>
          </div>
          ${po.note ? `<hr class="divider" /><p class="small muted">${esc(po.note)}</p>` : ''}
        </section>
        <section class="card card-pad">
          <h2>Kebijakan</h2>
          <ul class="small muted" style="padding-left:16px;margin:8px 0 0;line-height:1.6">
            <li>Nomor penerimaan tidak boleh ganda.</li>
            <li>Penerimaan melebihi sisa PO ditolak.</li>
            <li>Demo membuat tagihan otomatis; produksi memisahkan GR dan bill.</li>
          </ul>
        </section>
      </div>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

export function openCreatePo(ctx) {
  const { db } = ctx;
  const skuOptions = db.skus.filter((s) => s.active).map((s) => `<option value="${s.id}">${esc(s.collectionName)} ${esc(s.colourName || s.colourCode)} — ${esc(s.code)}</option>`).join('');
  const partOptions = db.parts.map((p) => `<option value="${p.id}">${esc(p.sku)} · ${esc(p.name)}</option>`).join('');
  const row = () => `<div class="alloc-row" data-line style="grid-template-columns:1fr 1.3fr 90px 110px 34px">
    <select class="select l-kind"><option value="fabric">Kain</option><option value="part">Part</option></select>
    <select class="select l-product">${skuOptions}</select>
    <input class="input l-qty" inputmode="decimal" placeholder="m" />
    <input class="input l-price" inputmode="decimal" placeholder="harga" />
    <button class="icon-btn" type="button" data-remove aria-label="Hapus baris">${icon('x')}</button>
  </div>`;

  const parsePrice = (raw, currency) => {
    const text = String(raw ?? '').trim();
    if (!text) return 0;
    if (currency === 'IDR') return Number(text.replace(/\D/g, '')) || 0;
    return Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')) || 0;
  };

  const priceList = (supplierId, date) => {
    const supplier = byId(db.suppliers, supplierId);
    if (!supplier) return '<p class="small muted">Pilih pemasok.</p>';
    const keys = new Map();
    for (const rec of db.supplierPrices.filter((p) => p.supplierId === supplierId)) {
      const key = rec.skuId ? `s:${rec.skuId}` : `p:${rec.partId}`;
      if (!keys.has(key)) keys.set(key, { kind: rec.skuId ? 'fabric' : 'part', id: rec.skuId ?? rec.partId });
    }
    const rowsHtml = [...keys.values()].map((item) => {
      const rec = latestSupplierPrice(db, {
        supplierId, skuId: item.kind === 'fabric' ? item.id : null,
        partId: item.kind === 'part' ? item.id : null, date,
      });
      if (!rec) return '';
      const sku = item.kind === 'fabric' ? byId(db.skus, item.id) : null;
      const part = item.kind === 'part' ? byId(db.parts, item.id) : null;
      const name = sku ? `${sku.collectionName} ${sku.colourName || sku.colourCode} · ${sku.code}` : `${part.sku} · ${part.name}`;
      const recCurrency = rec.currency ?? supplier.currency ?? 'IDR';
      const recRate = recCurrency === 'IDR' ? 1 : (latestFxRate(db, recCurrency)?.rate ?? supplier.fxRate ?? 1);
      const idr = Math.round(Number(rec.price) * recRate);
      const moq = item.kind === 'fabric'
        ? (rec.moqMm ? fmt.m(rec.moqMm) : '—')
        : (rec.moqPcs ? `${fmt.pcs(rec.moqPcs)} pcs` : '—');
      return `<tr>
        <td><span class="small strong">${esc(name)}</span><div class="xs muted">${item.kind === 'fabric' ? 'Kain / m' : 'Part / pcs'}</div></td>
        <td class="num">${esc(recCurrency)} ${Number(rec.price).toLocaleString('id-ID')}</td>
        <td class="num">${fmt.money(idr)}</td>
        <td class="num">${moq}</td>
        <td class="small">${esc(rec.validFrom ?? '—')}${rec.validTo ? ` → ${esc(rec.validTo)}` : ''}</td>
        <td class="right"><button class="btn btn-sm" type="button" data-use-price data-kind="${item.kind}" data-id="${esc(item.id)}" data-price="${esc(rec.price)}">Tambah</button></td>
      </tr>`;
    }).filter(Boolean);
    if (!rowsHtml.length) return '<p class="small muted">Belum ada harga tercatat untuk pemasok ini. Harga master akan dipakai sebagai default.</p>';
    return `<div class="table-wrap"><table class="data">
      <thead><tr><th>Barang</th><th class="num">Harga</th><th class="num">Setara IDR</th><th class="num">MOQ</th><th>Berlaku</th><th><span class="sr-only">Aksi</span></th></tr></thead>
      <tbody>${rowsHtml.join('')}</tbody>
    </table></div>`;
  };

  openModal({
    title: 'Buat purchase order',
    description: 'PO eksternal ke pemasok. Harga tersedia dan kurs terbaru ditampilkan sebelum disimpan.',
    wide: true,
    submitLabel: 'Simpan PO',
    body: `
      <div class="form-grid">
        ${field('Pemasok', `<select class="select" name="supplier">${db.suppliers.map((s) => `<option value="${s.id}" data-currency="${esc(s.currency ?? 'IDR')}" data-fx="${s.fxRate ?? 1}" data-origin="${esc(s.origin ?? 'local')}">${esc(s.name)}${s.origin === 'import' ? ' (impor)' : ''}</option>`).join('')}</select>`)}
        ${field('Mata uang beli', `<select class="select" name="currency"><option value="IDR">IDR</option><option value="CNY">CNY (yuan)</option></select>`, { hint: 'Pilih CNY untuk pembelian impor.' })}
        ${field('Kurs ke IDR', `<input class="input" name="fxRate" inputmode="decimal" value="1" />`)}
        ${field('Tanggal PO', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
        ${field('Estimasi tiba', `<input class="input" type="date" name="expectedDate" value="${new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)}" />`)}
        ${field('Termin (hari)', `<input class="input" type="number" name="terms" value="30" min="0" max="180" />`)}
        ${field('Catatan', `<input class="input" name="note" placeholder="Instruksi kirim / lot" />`, { full: true })}
      </div>
      <div class="section-title" style="margin:18px 0 6px"><h3>Baris PO</h3><span class="xs muted">Harga default diambil dari harga pemasok terbaru</span></div>
      <div id="po-rows">${row()}</div>
      <button class="btn btn-sm" type="button" data-add>${icon('plus')} Tambah baris</button>
      <div class="section-title" style="margin:18px 0 6px"><h3>Daftar harga tersedia</h3><span class="xs muted">Klik “Tambah” untuk memakai harga ini</span></div>
      <div data-price-list>${priceList(db.suppliers[0]?.id, todayJakarta())}</div>
      <div class="notice notice-info" style="margin-top:12px" data-fx-hint>${icon('alert')}<div>Harga diisi dalam mata uang pemasok. Pemasok impor memakai CNY dan kurs yang dikunci saat PO.</div></div>
    `,
    onMount(form) {
      const rows = form.querySelector('#po-rows');
      const supplierOf = () => byId(db.suppliers, form.supplier.value);
      const parseFx = () => Number(String(form.fxRate.value ?? '').replace(',', '.')) || 1;

      const syncCurrency = () => {
        const s = supplierOf();
        form.currency.value = s?.currency ?? 'IDR';
        if (form.currency.value === 'IDR') form.fxRate.value = '1';
        else form.fxRate.value = String(latestFxRate(db, form.currency.value)?.rate ?? s?.fxRate ?? 1);
        form.fxRate.disabled = form.currency.value === 'IDR';
        delete form.fxRate.dataset.manual;
      };

      const updateHint = () => {
        const currency = form.currency.value;
        const hint = form.querySelector('[data-fx-hint]');
        const latest = latestFxRate(db, currency);
        if (currency === 'CNY') {
          hint.innerHTML = `${icon('globe')}<div><strong>Pembelian CNY.</strong> Kurs PO <strong>${fmt.money(parseFx())}</strong> / CNY. ${latest ? `Kurs terbaru ${fmt.money(latest.rate)} · ${esc(latest.asOf)} · ${esc(latest.source)}.` : 'Belum ada kurs tercatat.'}<div class="xs">Kurs yang dipakai dicatat ke PO saat disimpan.</div></div>`;
        } else {
          hint.innerHTML = `${icon('alert')}<div>Harga dalam IDR. PO lokal tidak memakai kurs.</div>`;
        }
      };

      const updatePriceList = () => {
        const panel = form.querySelector('[data-price-list]');
        panel.innerHTML = priceList(form.supplier.value, form.date.value);
      };

      const reprice = () => {
        const currency = form.currency.value;
        const fx = currency === 'IDR' ? 1 : parseFx();
        const supplier = supplierOf();
        rows.querySelectorAll('[data-line]').forEach((r) => {
          const kind = r.querySelector('.l-kind').value;
          const id = r.querySelector('.l-product').value;
          const item = kind === 'fabric' ? byId(db.skus, id) : byId(db.parts, id);
          if (!item) return;
          const rec = latestSupplierPrice(db, {
            supplierId: supplier?.id, skuId: kind === 'fabric' ? id : null,
            partId: kind === 'part' ? id : null, date: form.date.value,
          });
          let value;
          if (rec) {
            const recCurrency = rec.currency ?? supplier?.currency ?? 'IDR';
            const recRate = recCurrency === 'IDR' ? 1 : (latestFxRate(db, recCurrency)?.rate ?? supplier?.fxRate ?? fx);
            const idr = Number(rec.price) * recRate;
            value = currency === 'IDR' ? idr : idr / fx;
          } else {
            value = currency === 'IDR' ? item.buyPrice : item.buyPrice / fx;
          }
          r.querySelector('.l-price').value = String(Math.round(value * 100) / 100);
        });
      };

      const bind = (r) => {
        r.querySelector('.l-kind').addEventListener('change', (e) => {
          r.querySelector('.l-product').innerHTML = e.target.value === 'fabric' ? skuOptions : partOptions;
          r.querySelector('.l-qty').placeholder = e.target.value === 'fabric' ? 'm' : 'pcs';
          reprice();
        });
        r.querySelector('[data-remove]').addEventListener('click', () => { if (rows.children.length > 1) r.remove(); });
        r.querySelector('.l-product').addEventListener('change', () => reprice());
        r.querySelector('.l-price').addEventListener('input', () => { r.dataset.manualPrice = '1'; });
      };

      const addRow = ({ kind = 'fabric', id = null, price = null } = {}) => {
        rows.insertAdjacentHTML('beforeend', row());
        const r = rows.lastElementChild;
        bind(r);
        const kindSel = r.querySelector('.l-kind');
        kindSel.value = kind;
        kindSel.dispatchEvent(new Event('change', { bubbles: true }));
        if (id) r.querySelector('.l-product').value = id;
        if (price !== null) r.querySelector('.l-price').value = String(price);
        r.querySelector('.l-qty').focus();
      };

      form.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-use-price]');
        if (!btn) return;
        addRow({ kind: btn.dataset.kind, id: btn.dataset.id, price: btn.dataset.price });
      });

      form.supplier.addEventListener('change', () => { syncCurrency(); updateHint(); updatePriceList(); reprice(); });
      form.currency.addEventListener('change', () => {
        form.fxRate.disabled = form.currency.value === 'IDR';
        if (form.currency.value === 'IDR') form.fxRate.value = '1';
        else form.fxRate.value = String(latestFxRate(db, form.currency.value)?.rate ?? supplierOf()?.fxRate ?? 1);
        delete form.fxRate.dataset.manual;
        updateHint();
        reprice();
      });
      form.fxRate.addEventListener('input', () => { form.fxRate.dataset.manual = '1'; updateHint(); reprice(); });
      form.date.addEventListener('change', () => { updatePriceList(); reprice(); });
      syncCurrency();
      updateHint();
      updatePriceList();
      form.querySelectorAll('[data-line]').forEach(bind);
      form.querySelector('[data-add]').addEventListener('click', () => { addRow(); reprice(); });
      reprice();
    },
    onSubmit(form, close) {
      const currency = form.currency.value;
      const lines = [...form.querySelectorAll('[data-line]')].map((row) => {
        const kind = row.querySelector('.l-kind').value;
        const raw = row.querySelector('.l-qty').value;
        const price = parsePrice(row.querySelector('.l-price').value, currency);
        return kind === 'fabric'
          ? { kind, skuId: row.querySelector('.l-product').value, qtyMm: parseM(raw), unitPrice: price || undefined }
          : { kind, partId: row.querySelector('.l-product').value, qtyPcs: Number(raw), unitPrice: price || undefined };
      }).filter((l) => (l.qtyMm ?? l.qtyPcs) > 0);
      if (!lines.length) throw new Error('Tambahkan minimal satu baris PO.');
      const fxRate = currency === 'IDR' ? 1 : Number(String(form.fxRate.value).replace(',', '.')) || 0;
      if (currency !== 'IDR' && !(fxRate > 0)) throw new Error('Isi kurs ke IDR untuk pembelian impor.');
      const po = ctx.store.update((db) => createPO(db, {
        supplierId: form.supplier.value,
        currency,
        fxRate,
        fxSource: form.fxRate.dataset.manual ? 'Kurs manual PO' : latestFxRate(db, currency)?.source,
        date: form.date.value,
        expectedDate: form.expectedDate.value,
        termsDays: Number(form.terms.value || 30),
        lines,
        note: form.note.value,
        user: ctx.user,
      }));
      close();
      window.location.hash = `#/pembelian/${po.id}`;
      toast(`PO ${po.id} dibuat. ${currency !== 'IDR' ? `Kurs ${fmt.money(po.fxRate)} / ${currency} terkunci.` : ''}`, { tone: 'success' });
    },
  });
}

function openReceive(ctx, po) {
  const openLines = po.lines.filter((l) => poLineOpen(l) > 0);
  const rows = openLines.map((l) => `<div class="card card-pad" style="margin-bottom:10px;background:#fbf8f1" data-rec-line data-id="${l.id}" data-kind="${l.kind}">
    <div class="row-between"><strong class="small">${esc(l.description)}</strong><span class="badge no-dot">sisa ${l.kind === 'fabric' ? fmt.m(poLineOpen(l)) : `${poLineOpen(l)} pcs`}</span></div>
    ${l.kind === 'fabric' ? `
      <div class="form-grid" style="margin-top:8px">
        ${field('Lot / dye lot', `<input class="input rec-lot" placeholder="LOT-XXXX" />`)}
        ${field('Panjang roll (m, pisah koma)', `<input class="input rec-lengths" inputmode="decimal" placeholder="Contoh: 20, 20" />`, { hint: 'Setiap panjang menjadi roll baru.' })}
      </div>` : `
      <div class="form-grid" style="margin-top:8px">${field('Jumlah diterima (pcs)', `<input class="input rec-pcs" inputmode="numeric" placeholder="0" />`)}</div>`}
  </div>`).join('');

  openModal({
    title: `Terima ${po.id}`,
    description: 'Penerimaan boleh sebagian. Nomor dokumen harus unik.',
    wide: true,
    submitLabel: 'Posting penerimaan',
    body: `
      <div class="form-grid">
        ${field('Nomor penerimaan', `<input class="input" name="ref" placeholder="GR-2026-015" required />`, { hint: 'Nomor ganda akan ditolak.' })}
        ${field('Tanggal terima', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
        ${field('Gudang tujuan', `<select class="select" name="warehouse">${warehouseOptions(ctx.db, ctx.ui.warehouseId === 'all' ? 'wh-jkt' : ctx.ui.warehouseId)}</select>`)}
      </div>
      <div class="section-title" style="margin:16px 0 8px"><h3>Baris diterima</h3><span class="xs muted">Kosongkan yang belum datang</span></div>
      ${rows}
      <label class="checkline"><input type="checkbox" name="createBill" checked /> Buat tagihan pemasok otomatis (simplifikasi demo)</label>
      ${field('Bukti fisik (opsional)', `<input class="input" type="file" name="proof" accept="image/*,.pdf" />`, { hint: settingsOf(ctx.db).requireProofOnReceipt ? 'Wajib menurut Pengaturan.' : 'Foto surat jalan / kondisi barang. Demo menyimpan metadata saja.' })}
    `,
    onSubmit(form, close) {
      const lines = [...form.querySelectorAll('[data-rec-line]')].map((row) => {
        const kind = row.dataset.kind;
        if (kind === 'fabric') {
          const lot = row.querySelector('.rec-lot').value.trim() || 'TANPA-LOT';
          const lengths = row.querySelector('.rec-lengths').value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => parseM(s));
          return lengths.some((n) => n > 0) ? { poLineId: row.dataset.id, lots: [{ lot, lengthsMm: lengths.filter((n) => n > 0) }] } : null;
        }
        const qty = Number(row.querySelector('.rec-pcs').value || 0);
        return qty > 0 ? { poLineId: row.dataset.id, qtyPcs: qty } : null;
      }).filter(Boolean);
      if (!lines.length) throw new Error('Isi minimal satu baris penerimaan.');
      const proof = form.proof.files?.[0] ? attachmentMeta(form.proof.files[0], { note: 'Bukti penerimaan' }) : null;
      if (settingsOf(ctx.db).requireProofOnReceipt && !proof) throw new Error('Bukti fisik wajib pada penerimaan sesuai Pengaturan.');
      const result = ctx.store.update((db) => {
        const received = receivePO(db, {
          poId: po.id,
          ref: form.ref.value,
          date: form.date.value,
          warehouseId: form.warehouse.value,
          lines,
          user: ctx.user,
          createBill: form.createBill.checked,
        });
        if (proof) {
          const rec = db.goodsReceipts.find((r) => r.id === received.receipt.id);
          rec.attachments = rec.attachments ?? [];
          rec.attachments.push({ ...proof, at: new Date().toISOString(), by: ctx.user.name });
        }
        return received;
      });
      close();
      toast(`Penerimaan ${result.receipt.ref} diposting. Roll baru dan tagihan dibuat.`, { tone: 'success' });
    },
  });
}

function openShipment(ctx, po) {
  openModal({
    title: `Pengiriman ${po.id}`,
    description: `PO ${po.id} · ${po.currency} ${po.totalForeign.toLocaleString('id-ID')} ≈ ${fmt.money(po.total)}`,
    wide: true,
    submitLabel: 'Buat pengiriman',
    body: `<div class="form-grid">
      ${field('Moda', `<select class="select" name="mode">${Object.entries(SHIPMENT_MODE).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>`)}
      ${field('No. BL / AWB / referensi', `<input class="input" name="reference" placeholder="MSCU-7788123" required />`)}
      ${field('Kontainer', `<input class="input" name="container" placeholder="MSCU 1234567" />`)}
      ${field('ETD', `<input class="input" type="date" name="etd" value="${todayJakarta()}" />`)}
      ${field('ETA', `<input class="input" type="date" name="eta" value="${new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10)}" />`)}
      ${field('Catatan', `<input class="input" name="notes" placeholder="Pelabuhan, syarat, dokumen" />`, { full: true })}
      ${field('Freight (Rp)', `<input class="input" name="freight" inputmode="numeric" placeholder="0" />`)}
      ${field('Asuransi (Rp)', `<input class="input" name="insurance" inputmode="numeric" placeholder="0" />`)}
      ${field('Bea masuk (Rp)', `<input class="input" name="duty" inputmode="numeric" placeholder="0" />`)}
      ${field('Lain-lain (Rp)', `<input class="input" name="other" inputmode="numeric" placeholder="0" />`)}
      ${field('Dokumen / bukti (opsional)', `<input class="input" type="file" name="proof" accept="image/*,.pdf" />`, { full: true, hint: 'BL, invoice, packing list. Demo menyimpan metadata saja.' })}
    </div>
    <div class="notice notice-info" style="margin-top:12px">${icon('globe')}<div>Landed cost = freight + asuransi + bea masuk + lain-lain, dialokasikan proporsional ke HPP saat penerimaan.</div></div>`,
    onSubmit(form, close) {
      const proof = form.proof.files?.[0] ? attachmentMeta(form.proof.files[0], { note: 'Dokumen pengiriman' }) : null;
      const shipment = ctx.store.update((db) => createShipment(db, {
        poId: po.id,
        mode: form.mode.value,
        reference: form.reference.value,
        container: form.container.value,
        etd: form.etd.value,
        eta: form.eta.value,
        costs: {
          freightIdr: Number(String(form.freight.value).replace(/\D/g, '')),
          insuranceIdr: Number(String(form.insurance.value).replace(/\D/g, '')),
          dutyIdr: Number(String(form.duty.value).replace(/\D/g, '')),
          otherIdr: Number(String(form.other.value).replace(/\D/g, '')),
        },
        notes: form.notes.value,
        attachment: proof,
        user: ctx.user,
      }));
      close();
      toast(`Pengiriman ${shipment.reference} dibuat.`, { tone: 'success' });
    },
  });
}

function openShipmentStatus(ctx, shipment) {
  openModal({
    title: `Update ${shipment.reference}`,
    description: `Status sekarang: ${SHIPMENT_STATUS[shipment.status].label}`,
    submitLabel: 'Simpan status',
    body: `<div class="form-grid">
      ${field('Status', `<select class="select" name="status">${Object.entries(SHIPMENT_STATUS).map(([k, v]) => `<option value="${k}" ${shipment.status === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`)}
      ${field('Tanggal', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      ${field('Lokasi', `<input class="input" name="location" placeholder="Tanjung Priok / gudang" />`)}
      ${field('Catatan', `<input class="input" name="note" placeholder="Kondisi, dokumen, kendala" />`, { full: true })}
    </div>`,
    onSubmit(form, close) {
      ctx.store.update((db) => updateShipmentStatus(db, {
        id: shipment.id,
        status: form.status.value,
        date: form.date.value,
        location: form.location.value,
        note: form.note.value,
        user: ctx.user,
      }));
      close();
      toast('Status pengiriman diperbarui.', { tone: 'success' });
    },
  });
}

function openPayBill(ctx, bill) {
  const out = bill.amount - bill.paid;
  const foreign = bill.currency && bill.currency !== 'IDR';
  const fx = bill.fxRate || 1;
  const outForeign = Math.round((out / fx) * 100) / 100;
  openModal({
    title: `Bayar ${bill.id}`,
    description: foreign ? `Sisa ${bill.currency} ${outForeign.toLocaleString('id-ID')} ≈ ${fmt.money(out)} · kurs ${fmt.money(fx)}` : `Sisa ${fmt.money(out)}.`,
    body: `
      ${foreign
        ? `${field(`Nominal (${bill.currency})`, `<input class="input" name="amountForeign" inputmode="decimal" value="${String(outForeign)}" />`, { hint: `Dikonversi ke IDR pada kurs ${fmt.money(fx)} / ${bill.currency}.` })}
           ${field('Nominal IDR (otomatis)', `<input class="input" name="amountIdrPreview" value="${out}" readonly />`)}`
        : field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" value="${String(out)}" />`)}
      ${field('Tanggal', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      ${field('Metode', `<select class="select" name="method"><option value="transfer">Transfer / TT</option><option value="giro">Giro</option><option value="tunai">Tunai</option></select>`)}
      ${field('Catatan / referensi TT', `<input class="input" name="note" />`)}
    `,
    onMount(form) {
      if (!foreign) return;
      form.amountForeign.addEventListener('input', () => {
        const value = Number(String(form.amountForeign.value).replace(',', '.')) || 0;
        form.amountIdrPreview.value = String(Math.round(value * fx));
      });
    },
    onSubmit(form, close) {
      let amount = 0;
      let amountForeign = null;
      if (foreign) {
        amountForeign = Number(String(form.amountForeign.value).replace(',', '.')) || 0;
        amount = Math.round(amountForeign * fx);
      } else {
        amount = Number(String(form.amount.value).replace(/\D/g, ''));
      }
      ctx.store.update((db) => paySupplierInvoice(db, {
        id: bill.id, amount, amountForeign, date: form.date.value, method: form.method.value,
        note: form.note.value, user: ctx.user,
      }));
      close();
      toast(foreign ? 'Pembayaran CNY dicatat dengan kurs tagihan.' : 'Pembayaran pemasok dicatat (simulasi).', { tone: 'success' });
    },
  });
}

function openSupplier(ctx, supplier = null) {
  const isNew = !supplier;
  const trail = supplier ? auditTrail(ctx.db, 'supplier', supplier.id, 6) : [];
  openModal({
    title: isNew ? 'Pemasok baru' : `Edit ${supplier.name}`,
    description: 'Lokal memakai IDR. Impor memakai mata uang asing, kurs, incoterm, dan pelabuhan.',
    wide: true,
    submitLabel: isNew ? 'Buat pemasok' : 'Simpan',
    body: `<div class="form-grid">
      ${field('Kode', `<input class="input" name="code" value="${esc(supplier?.code ?? '')}" placeholder="SINAR" required />`)}
      ${field('Nama', `<input class="input" name="name" value="${esc(supplier?.name ?? '')}" required />`)}
      ${field('Kontak', `<input class="input" name="contact" value="${esc(supplier?.contact ?? '')}" />`)}
      ${field('Telepon', `<input class="input" name="phone" value="${esc(supplier?.phone ?? '')}" />`)}
      ${field('Email', `<input class="input" name="email" value="${esc(supplier?.email ?? '')}" />`)}
      ${field('Asal', `<select class="select" name="origin"><option value="local" ${supplier?.origin !== 'import' ? 'selected' : ''}>Lokal (ID)</option><option value="import" ${supplier?.origin === 'import' ? 'selected' : ''}>Impor</option></select>`)}
      ${field('Negara', `<input class="input" name="country" value="${esc(supplier?.country ?? 'ID')}" />`)}
      ${field('Mata uang', `<select class="select" name="currency"><option value="IDR" ${supplier?.currency !== 'CNY' ? 'selected' : ''}>IDR</option><option value="CNY" ${supplier?.currency === 'CNY' ? 'selected' : ''}>CNY (yuan)</option></select>`)}
      ${field('Kurs ke IDR', `<input class="input" name="fxRate" inputmode="decimal" value="${supplier?.fxRate ?? 1}" />`)}
      ${field('Incoterm', `<input class="input" name="incoterm" value="${esc(supplier?.incoterm ?? '')}" placeholder="FOB Ningbo" />`)}
      ${field('Pelabuhan', `<input class="input" name="port" value="${esc(supplier?.port ?? '')}" placeholder="Ningbo → Tanjung Priok" />`)}
      ${field('Termin (hari)', `<input class="input" type="number" name="termsDays" value="${supplier?.termsDays ?? 30}" />`)}
      ${field('Lead time (hari)', `<input class="input" type="number" name="leadTimeDays" value="${supplier?.leadTimeDays ?? 7}" />`)}
      ${field('Alamat', `<input class="input" name="address" value="${esc(supplier?.address ?? '')}" />`, { full: true })}
      ${field('Catatan', `<input class="input" name="notes" value="${esc(supplier?.notes ?? '')}" />`, { full: true })}
    </div>
    ${trail.length ? `<hr class="divider" /><div class="xs muted">Riwayat perubahan</div><ul class="timeline" style="margin-top:8px">${trail.map((a) => `<li><div class="t-head"><strong>${esc(a.action)}</strong><time>${esc(new Date(a.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</time></div><div class="t-body">${esc(a.userName)} · ${esc(a.detail)}</div></li>`).join('')}</ul>` : ''}`,
    onSubmit(form, close) {
      ctx.store.update((db) => saveSupplier(db, {
        id: supplier?.id ?? null,
        code: form.code.value,
        name: form.name.value,
        contact: form.contact.value,
        phone: form.phone.value,
        email: form.email.value,
        address: form.address.value,
        origin: form.origin.value,
        country: form.country.value,
        currency: form.currency.value,
        fxRate: Number(String(form.fxRate.value).replace(',', '.')),
        incoterm: form.incoterm.value,
        port: form.port.value,
        termsDays: Number(form.termsDays.value || 0),
        leadTimeDays: Number(form.leadTimeDays.value || 0),
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast(isNew ? 'Pemasok dibuat.' : 'Data pemasok diperbarui.', { tone: 'success' });
    },
  });
}

/* -------------------------------------------------------------------------- */

export function mount(ctx) {
  if (ctx.route.id) {
    const po = ctx.db.purchaseOrders.find((p) => p.id === ctx.route.id);
    if (!po) return;
    document.querySelector('[data-act="approve"]')?.addEventListener('click', () => {
      try {
        ctx.store.update((db) => approvePO(db, { id: po.id, user: ctx.user }));
        toast('PO disetujui.', { tone: 'success' });
      } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    document.querySelector('[data-act="receive"]')?.addEventListener('click', () => openReceive(ctx, po));
    document.querySelector('[data-act="new-shipment"]')?.addEventListener('click', () => openShipment(ctx, po));
    document.querySelector('[data-act="shipment-status"]')?.addEventListener('click', () => {
      const shipment = activeShipmentForPO(ctx.db, po.id);
      if (shipment) openShipmentStatus(ctx, shipment);
    });
    document.querySelector('[data-act="print"]')?.addEventListener('click', () => printDocument(`PO ${po.id}`, printPoHtml(ctx.db, po)));
    return;
  }

  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    tab = btn.dataset.tab;
    ctx.store.emit();
  }));
  document.querySelector('[data-act="new-po"]')?.addEventListener('click', () => openCreatePo(ctx));
  document.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => {
    window.location.hash = tr.dataset.href.replace('#', '');
  }));
  document.querySelectorAll('[data-pay]').forEach((btn) => btn.addEventListener('click', () => {
    const bill = ctx.db.supplierInvoices.find((b) => b.id === btn.dataset.pay);
    if (bill) openPayBill(ctx, bill);
  }));
  document.querySelectorAll('[data-edit-supplier]').forEach((btn) => btn.addEventListener('click', () => {
    const supplier = ctx.db.suppliers.find((s) => s.id === btn.dataset.editSupplier);
    if (supplier) openSupplier(ctx, supplier);
  }));
  document.querySelector('[data-act="new-supplier"]')?.addEventListener('click', () => openSupplier(ctx));

  if (ctx.route.query?.tab) {
    const allowed = ['po', 'penerimaan', 'pengiriman', 'tagihan', 'pemasok'];
    if (allowed.includes(ctx.route.query.tab)) tab = ctx.route.query.tab;
    history.replaceState(null, '', '#/pembelian');
    ctx.store.emit();
  }
}
