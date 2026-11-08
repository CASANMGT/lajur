/** Penjualan: faktur multi-baris, pembayaran, deposit, retur. */

import {
  esc, icon, fmt, badge, swatch, toast, openModal, field, printDocument, amountCell, confirmAction,
} from '../dom.js';
import { MM_PER_M, byId, daysBetween, parseM, todayJakarta } from '../../domain/core.js';
import {
  INVOICE_STATUS, createCustomerReturn, createInvoice, invoiceMargin, invoiceOutstanding,
  invoiceStatusLabel, issueTaxInvoice, postCustomerReturn, postInvoice, recordPayment, returnedQty,
  taxBreakdown,
} from '../../domain/sales.js';
import {
  DELIVERY_STATUS, confirmDelivery, createDelivery, deliveryForInvoice, dispatchDelivery,
  markDelivered, updateDelivery,
} from '../../domain/deliveries.js';
import { applyDepositToInvoice, depositBalance } from '../../domain/crm.js';
import { createSalesOrder } from '../../domain/orders.js';
import { settingsOf } from '../../domain/settings.js';
import { availableMm, partAvailable, sellableRolls, totalParts } from '../../domain/inventory.js';
import { pageHead, statCard, warehouseOf, can, roleHint, warehouseOptions } from './common.js';
import { printDeliveryHtml, printInvoiceHtml, printTaxInvoiceHtml } from './print.js';

let statusFilter = 'all';

export function render(ctx) {
  if (ctx.route.id) return renderDetail(ctx);

  const { db, ui, role } = ctx;
  const invoices = db.invoices
    .filter((i) => statusFilter === 'all' || (statusFilter === 'outstanding' ? i.status === 'posted' && invoiceOutstanding(i) > 0 : i.status === statusFilter))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const posted = db.invoices.filter((i) => i.status === 'posted');
  const outstanding = posted.reduce((a, i) => a + invoiceOutstanding(i), 0);
  const overdue = posted.reduce((a, i) => {
    const days = daysBetween(i.dueDate, todayJakarta());
    return a + (days > 0 ? invoiceOutstanding(i) : 0);
  }, 0);
  const month = todayJakarta().slice(0, 7);
  const monthTotal = posted.filter((i) => i.date.slice(0, 7) === month).reduce((a, i) => a + i.total, 0);

  return `
    ${pageHead({
      eyebrow: 'Penjualan',
      title: 'Faktur & pembayaran',
      sub: 'Kain dipotong dari roll tertentu; spare part memakai pcs. Stok keluar satu kali saat faktur diterbitkan.',
      actions: `${settingsOf(db).salesOrderEnabled !== false ? `<a class="btn" href="#/pesanan">${icon('clipboard')} Pesanan</a>` : ''}
        ${can(role, 'invoice.create') ? `<button class="btn btn-primary" type="button" data-act="new-invoice">${icon('plus')} Buat faktur</button>` : ''}`,
    })}
    ${roleHint(role, 'invoice.create', 'Membuat faktur adalah wewenang sales/CS atau manajer.')}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Piutang', value: fmt.money(outstanding), meta: `${posted.filter((i) => invoiceOutstanding(i) > 0).length} faktur terbuka`, tone: 'warn', iconName: 'wallet' })}
      ${statCard({ label: 'Lewat jatuh tempo', value: fmt.money(overdue), meta: 'Perlu tindakan penagihan', tone: 'warn' })}
      ${statCard({ label: 'Penjualan bulan ini', value: fmt.money(monthTotal), meta: 'Faktur terbit' })}
      ${statCard({ label: 'Draf', value: String(db.invoices.filter((i) => i.status === 'draft').length), meta: 'Belum mengeluarkan stok' })}
    </div>

    <div class="row" style="margin-bottom:12px">
      ${['all', 'outstanding', 'draft', 'posted'].map((s) => `<button class="chip" type="button" data-status="${s}" aria-pressed="${statusFilter === s}">${
        s === 'all' ? 'Semua' : s === 'outstanding' ? 'Belum lunas' : s === 'draft' ? 'Draf' : 'Terbit'
      }</button>`).join('')}
    </div>

    <section class="card">
      <div class="table-wrap desktop-table">
        <table class="data">
          <thead><tr><th>Faktur</th><th>Pelanggan</th><th class="hide-sm">Tanggal</th><th class="num">Total</th><th class="num">Sisa</th><th>Status</th></tr></thead>
          <tbody>${invoices.map((inv) => {
            const out = invoiceOutstanding(inv);
            const days = daysBetween(inv.dueDate, todayJakarta());
            const delivery = deliveryForInvoice(db, inv.id);
            return `<tr data-href="#/penjualan/${inv.id}" tabindex="0" role="link">
              <td><span class="mono strong">${esc(inv.id)}</span>${inv.projectId ? `<div class="xs muted">${esc(inv.projectId)}</div>` : ''}${delivery ? `<div class="xs muted">${esc(delivery.id)} · ${esc(DELIVERY_STATUS[delivery.status]?.label ?? delivery.status)}</div>` : ''}</td>
              <td>${esc(inv.customerName)}</td>
              <td class="hide-sm">${esc(inv.date)}<div class="xs muted">due ${esc(inv.dueDate)}</div></td>
              <td class="num">${fmt.money(inv.total)}</td>
              <td class="num ${out ? 'strong' : 'muted'}">${out ? fmt.money(out) : 'Lunas'}</td>
              <td>${badge(invoiceStatusLabel(inv), inv.status === 'void' ? 'danger' : out ? (days > 0 ? 'danger' : 'warn') : 'ok')}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="6"><div class="empty">${icon('receipt')}<strong>Belum ada faktur</strong><p>Buat faktur pertama dari roll atau spare part.</p></div></td></tr>`}</tbody>
        </table>
      </div>
      <div class="mobile-cards">
        ${invoices.map((inv) => `<a class="roll-card" href="#/penjualan/${inv.id}" style="color:inherit;text-decoration:none">
          <div class="top"><span class="id">${esc(inv.id)}</span>${badge(invoiceStatusLabel(inv), invoiceOutstanding(inv) ? 'warn' : 'ok')}</div>
          <div class="small strong">${esc(inv.customerName)}</div>
          <div class="xs muted">${esc(inv.date)} · jatuh tempo ${esc(inv.dueDate)}</div>
          ${deliveryForInvoice(db, inv.id) ? `<div class="xs muted">${esc(deliveryForInvoice(db, inv.id).id)} · ${esc(DELIVERY_STATUS[deliveryForInvoice(db, inv.id).status]?.label ?? '')}</div>` : ''}
          <div class="grid3">
            <div class="kv"><span>Total</span><strong>${fmt.money(inv.total)}</strong></div>
            <div class="kv"><span>Sisa</span><strong>${fmt.money(invoiceOutstanding(inv))}</strong></div>
            <div class="kv"><span>Baris</span><strong>${inv.lines.length}</strong></div>
          </div>
        </a>`).join('')}
      </div>
    </section>`;
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                     */
/* -------------------------------------------------------------------------- */

function renderDetail(ctx) {
  const { db, role, route } = ctx;
  const inv = db.invoices.find((i) => i.id === route.id);
  if (!inv) return `${pageHead({ title: 'Tidak ditemukan' })}<div class="notice notice-danger">${icon('alert')}<div>Faktur ${esc(route.id)} tidak ada.</div></div>`;
  const out = invoiceOutstanding(inv);
  const customer = byId(db.customers, inv.customerId);
  const margin = invoiceMargin(inv);
  const delivery = deliveryForInvoice(db, inv.id);
  const tax = inv.taxInvoice;
  const taxPreview = taxBreakdown(inv);
  const deposits = db.deposits.filter((d) => d.customerId === inv.customerId && depositBalance(d) > 0);
  const applicableDeposits = deposits.filter((d) => d.kind === 'indent');
  const days = daysBetween(inv.dueDate, todayJakarta());

  const actions = [];
  if (inv.status === 'draft' && can(role, 'invoice.post')) actions.push(`<button class="btn btn-primary" data-act="post">${icon('check')} Terbitkan & keluarkan stok</button>`);
  if (inv.status === 'posted' && out > 0 && can(role, 'invoice.pay')) actions.push(`<button class="btn btn-primary" data-act="pay">${icon('wallet')} Terima pembayaran</button>`);
  if (inv.status === 'posted' && out > 0 && applicableDeposits.length && can(role, 'deposit.apply')) actions.push(`<button class="btn" data-act="apply-deposit">${icon('layers')} Pakai deposit</button>`);
  if (inv.status === 'posted' && can(role, 'return.create')) actions.push(`<button class="btn" data-act="return">${icon('refresh')} Retur</button>`);
  if (inv.status === 'posted' && !delivery && can(role, 'invoice.create')) actions.push(`<button class="btn" data-act="new-delivery">${icon('truck')} Surat jalan</button>`);
  actions.push(`<button class="btn" data-act="print">${icon('printer')} Cetak</button>`);

  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/penjualan">← Semua faktur</a>
        <div class="row" style="margin-top:6px">
          <h1 class="mono">${esc(inv.id)}</h1>
          ${badge(invoiceStatusLabel(inv), inv.status === 'void' ? 'danger' : out ? (days > 0 ? 'danger' : 'warn') : 'ok')}
          ${inv.status === 'draft' ? badge('Stok belum keluar', 'muted') : ''}
        </div>
        <p class="sub">${esc(customer?.name ?? inv.customerName)} · ${esc(inv.date)} · jatuh tempo ${esc(inv.dueDate)}</p>
      </div>
      <div class="page-actions">${actions.join('')}</div>
    </div>
    ${inv.status === 'draft' ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('clock')}<div><strong>Draf.</strong> Stok belum berkurang. Penerbitan faktur adalah satu-satunya peristiwa pengeluaran stok.</div></div>` : ''}
    ${inv.status === 'posted' && days > 0 && out > 0 ? `<div class="notice notice-danger" style="margin-bottom:14px">${icon('alert')}<div><strong>${days} hari lewat jatuh tempo.</strong> Sisa ${fmt.money(out)}.</div></div>` : ''}

    <div class="grid grid-main">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Baris faktur</h2><p>Deskripsi, harga, dan harga pokok dibekukan saat terbit.</p></div></div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Deskripsi</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Jumlah</th></tr></thead>
              <tbody>${inv.lines.map((l) => `<tr>
                <td>
                  <strong>${esc(l.description)}</strong>
                  ${l.lot ? `<div class="xs muted">Lot ${esc(l.lot)} · <a class="mono" href="#/stok/${l.rollId}">${esc(l.rollId)}</a> · ${l.mode === 'whole' ? 'roll utuh' : 'potongan'}</div>` : ''}
                </td>
                <td class="num">${l.kind === 'fabric' ? fmt.m(l.qtyMm) : l.kind === 'part' ? `${fmt.pcs(l.qtyPcs)} pcs` : '1 jasa'}</td>
                <td class="num">${fmt.money(l.unitPrice)}</td>
                <td class="num">${fmt.money(l.amount)}</td>
              </tr>`).join('')}</tbody>
            </table>
          </div>
          <dl class="card-pad" style="margin:0">
            <div class="doc-total"><dt>Subtotal</dt><dd>${fmt.money(inv.subtotal)}</dd></div>
            ${inv.discount ? `<div class="doc-total"><dt>${inv.discountType === 'percent' ? `Diskon (${Number(inv.discountValue ?? 0).toLocaleString('id-ID')}%)` : 'Diskon'}</dt><dd>−${fmt.money(inv.discount)}</dd></div>` : ''}
            <div class="doc-total"><dt>Total</dt><dd>${fmt.money(inv.total)}</dd></div>
            ${inv.depositApplied ? `<div class="doc-total"><dt>Deposit</dt><dd>−${fmt.money(inv.depositApplied)}</dd></div>` : ''}
            ${inv.credited ? `<div class="doc-total"><dt>Retur</dt><dd>−${fmt.money(inv.credited)}</dd></div>` : ''}
            <div class="doc-total"><dt>Dibayar</dt><dd>${fmt.money(inv.payments?.reduce((a, p) => a + p.amount, 0) ?? 0)}</dd></div>
            <div class="doc-total" style="font-size:15px"><dt class="strong">Sisa tagihan</dt><dd>${fmt.money(out)}</dd></div>
          </dl>
        </section>

        <section class="card card-pad">
          <div class="row-between">
            <div><h2>Faktur pajak</h2><p class="xs muted">PPN 11% dihitung dari total faktur; harga tidak diinput ulang.</p></div>
            ${tax ? badge('Terbit', 'ok') : badge('Belum terbit', 'muted')}
          </div>
          ${inv.status !== 'posted' ? `<p class="small muted" style="margin-top:8px">Faktur pajak dapat diterbitkan setelah faktur diposting.</p>` : tax ? `
            <div class="stack-sm" style="margin-top:10px">
              <div class="row-between"><span class="small muted">Nomor</span><span class="small mono">${esc(tax.number)}</span></div>
              <div class="row-between"><span class="small muted">NPWP</span><span class="small mono">${esc(tax.npwp || '—')}</span></div>
              <div class="row-between"><span class="small muted">DPP</span><span class="small num">${fmt.money(tax.dpp)}</span></div>
              <div class="row-between"><span class="small muted">PPN ${Number(tax.ratePercent).toLocaleString('id-ID')}%</span><span class="small num">${fmt.money(tax.ppn)}</span></div>
              <div class="row-between"><span class="small muted">Total termasuk PPN</span><span class="small num strong">${fmt.money(tax.total)}</span></div>
            </div>
            <button class="btn btn-sm btn-block" style="margin-top:10px" data-act="print-tax">${icon('printer')} Cetak faktur pajak</button>` : `
            <div class="stack-sm" style="margin-top:10px">
              <div class="row-between"><span class="small muted">DPP (dari total)</span><span class="small num">${fmt.money(taxPreview.dpp)}</span></div>
              <div class="row-between"><span class="small muted">PPN ${Number(taxPreview.ratePercent).toLocaleString('id-ID')}%</span><span class="small num">${fmt.money(taxPreview.ppn)}</span></div>
              <div class="row-between"><span class="small muted">Total termasuk PPN</span><span class="small num strong">${fmt.money(taxPreview.total)}</span></div>
            </div>
            ${can(role, 'invoice.create') ? `<button class="btn btn-sm btn-primary btn-block" style="margin-top:10px" data-act="issue-tax">${icon('receipt')} Terbitkan faktur pajak</button>` : ''}`}
        </section>

        <section class="card">
          <div class="card-head"><div><h2>Pembayaran</h2><p>Sebagian diterima; tidak ada aksi bank nyata di demo.</p></div></div>
          ${inv.payments?.length ? `<div class="table-wrap"><table class="data">
            <thead><tr><th>ID</th><th>Tanggal</th><th>Metode</th><th>Referensi</th><th class="num">Nominal</th></tr></thead>
            <tbody>${inv.payments.map((p) => `<tr><td class="mono">${esc(p.id)}</td><td>${esc(p.date)}</td><td>${esc(p.method)}</td><td>${esc(p.reference || '—')}</td><td class="num">${fmt.money(p.amount)}</td></tr>`).join('')}</tbody>
          </table></div>` : `<div class="empty" style="padding:24px">${icon('wallet')}<strong>Belum ada pembayaran</strong><p>Terima pembayaran sebagian atau penuh.</p></div>`}
        </section>

        <section class="card card-pad">
          <h2>Retur pelanggan</h2>
          ${db.returns.filter((r) => r.type === 'customer' && r.invoiceId === inv.id).length
            ? `<div class="stack-sm" style="margin-top:10px">${db.returns.filter((r) => r.type === 'customer' && r.invoiceId === inv.id).map((r) => `<div class="row-between">
                <div><strong class="small">${esc(r.id)}</strong><div class="xs muted">${esc(r.reason)}</div></div>
                <div class="right"><div class="small num">−${fmt.money(r.credit)}</div>${badge(r.status === 'posted' ? 'Diposting' : r.status, r.status === 'posted' ? 'ok' : 'warn')}</div>
              </div>`).join('')}</div>`
            : '<p class="small muted" style="margin-top:8px">Belum ada retur untuk faktur ini.</p>'}
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad">
          <h2>Ringkasan</h2>
          <div class="stack-sm" style="margin-top:10px">
            <div class="row-between"><span class="small muted">Pelanggan</span><a class="small" href="#/pelanggan/${inv.customerId}">${esc(inv.customerName)}</a></div>
            <div class="row-between"><span class="small muted">Proyek</span><span class="small">${inv.projectId ? `<a href="#/proyek/${inv.projectId}">${esc(inv.projectId)}</a>` : '—'}</span></div>
            <div class="row-between"><span class="small muted">Sales</span><span class="small">${esc(byId(db.users, inv.salespersonId)?.name ?? '—')}</span></div>
            <div class="row-between"><span class="small muted">Margin kotor</span><span class="small num">${fmt.money(margin.margin)}</span></div>
            <div class="row-between"><span class="small muted">HPP</span><span class="small num">${fmt.money(margin.cost)}</span></div>
          </div>
          ${inv.notes ? `<hr class="divider" /><div class="xs muted">Catatan</div><p class="small" style="margin-top:4px">${esc(inv.notes)}</p>` : ''}
          <div class="notice notice-info" style="margin-top:12px">${icon('alert')}<div>Margin dihitung dari snapshot harga pokok; bukan laba per gudang.</div></div>
        </section>

        <section class="card card-pad">
          <div class="row-between">
            <div><h2>Pengiriman & surat jalan</h2><p class="xs muted">Status logistik setelah faktur; tidak mengubah stok lagi.</p></div>
            ${delivery ? badge(DELIVERY_STATUS[delivery.status].label, DELIVERY_STATUS[delivery.status].tone) : ''}
          </div>
          ${!delivery ? `
            <p class="small muted" style="margin-top:8px">${inv.status === 'posted' ? 'Belum ada surat jalan untuk faktur ini.' : 'Surat jalan dibuat setelah faktur terbit.'}</p>
            ${inv.status === 'posted' && can(role, 'invoice.create') ? `<button class="btn btn-sm btn-primary btn-block" style="margin-top:10px" data-act="new-delivery">${icon('truck')} Buat surat jalan</button>` : ''}
          ` : `
            <div class="stack-sm" style="margin-top:10px">
              <div class="row-between"><span class="small muted">Surat jalan</span><span class="small mono">${esc(delivery.id)}</span></div>
              <div class="row-between"><span class="small muted">PIC pengiriman</span><span class="small">${esc(delivery.pic)}</span></div>
              <div class="row-between"><span class="small muted">Pengemudi / kendaraan</span><span class="small">${esc(delivery.driver || '—')}${delivery.vehicle ? ` · ${esc(delivery.vehicle)}` : ''}</span></div>
              <div class="row-between"><span class="small muted">Alamat</span><span class="small right">${esc(delivery.address || '—')}</span></div>
              ${delivery.receivedBy ? `<div class="row-between"><span class="small muted">Diterima oleh</span><span class="small">${esc(delivery.receivedBy)}</span></div>` : ''}
            </div>
            <div class="row" style="margin-top:10px;flex-wrap:wrap">
              <button class="btn btn-sm" data-act="print-delivery">${icon('printer')} Surat jalan</button>
              ${delivery.status === 'draft' && can(role, 'invoice.create') ? `<button class="btn btn-sm" data-act="edit-delivery">Edit PIC</button><button class="btn btn-sm btn-primary" data-act="dispatch-delivery">Kirim</button>` : ''}
              ${delivery.status === 'dispatched' && can(role, 'invoice.create') ? `<button class="btn btn-sm btn-primary" data-act="deliver-delivery">Tandai tiba</button>` : ''}
              ${delivery.status === 'delivered' && can(role, 'invoice.create') ? `<button class="btn btn-sm btn-primary" data-act="confirm-delivery">Konfirmasi terima</button>` : ''}
            </div>
            ${delivery.history?.length ? `<hr class="divider" /><ul class="timeline">${delivery.history.slice(0, 3).map((h) => `<li><div class="t-head"><strong>${esc(h.action)}</strong><time>${esc(new Date(h.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}</time></div><div class="t-body">${esc(h.by)}${h.note ? ` · ${esc(h.note)}` : ''}</div></li>`).join('')}</ul>` : ''}
          `}
        </section>

        <section class="card card-pad">
          <h2>Deposit pelanggan</h2>
          ${deposits.length ? `<div class="stack-sm" style="margin-top:10px">${deposits.map((d) => `<div class="row-between">
            <div><strong class="small">${esc(d.id)}</strong><div class="xs muted">${d.kind} · ${esc(d.note)}</div></div>
            <span class="small num">${fmt.money(depositBalance(d))}</span>
          </div>`).join('')}</div>` : '<p class="small muted" style="margin-top:8px">Tidak ada saldo deposit terbuka.</p>'}
          <a class="btn btn-sm btn-block" style="margin-top:10px" href="#/pelanggan/${inv.customerId}">${icon('users')} Profil pelanggan</a>
        </section>
      </div>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Create invoice                                                             */
/* -------------------------------------------------------------------------- */

export function openInvoice(ctx, presetRollId = null, docType = 'invoice') {
  const isOrder = docType === 'order';
  const { db } = ctx;
  const presetRoll = presetRollId ? db.rolls.find((r) => r.id === presetRollId) : null;
  const defaultWh = presetRoll?.warehouseId ?? (ctx.ui.warehouseId === 'all' ? 'wh-jkt' : ctx.ui.warehouseId);
  const rolls = db.rolls
    .filter((r) => r.status === 'available' && !r.transit && availableMm(r) > 0 && (!presetRollId || true))
    .filter((r) => defaultWh === 'all' || r.warehouseId === defaultWh)
    .sort((a, b) => a.id.localeCompare(b.id));
  const sku = presetRollId ? byId(db.skus, db.rolls.find((r) => r.id === presetRollId)?.skuId) : null;

  const rollOptions = rolls.map((r) => {
    const s = byId(db.skus, r.skuId);
    const whole = (r.reservedMm || 0) === 0;
    return `<option value="${r.id}" data-price="${s?.sellPrice ?? 0}" data-current="${r.currentMm}" data-avail="${availableMm(r)}" data-reserved="${r.reservedMm || 0}" ${presetRollId === r.id ? 'selected' : ''}>${esc(r.id)} · ${esc(s?.code)} · ${esc(r.lot)} · ${fmt.m(availableMm(r))} tersedia</option>`;
  }).join('');

  const partOptions = db.parts
    .filter((p) => partAvailable(db, p.id, defaultWh) > 0)
    .map((p) => `<option value="${p.id}" data-price="${p.sellPrice}" data-avail="${partAvailable(db, p.id, defaultWh)}">${esc(p.sku)} · ${esc(p.name)} · ${fmt.pcs(partAvailable(db, p.id, defaultWh))} pcs</option>`)
    .join('');

  const fabricRow = (selected = '') => `<div class="alloc-row" data-fab style="grid-template-columns:1.5fr .7fr .6fr .8fr 34px">
    <select class="select fab-roll" aria-label="Roll kain">${rollOptions}</select>
    <select class="select fab-mode" aria-label="Mode"><option value="cut">Potong</option><option value="whole">Roll utuh</option></select>
    <input class="input fab-qty" inputmode="decimal" placeholder="meter" aria-label="Panjang" />
    <input class="input fab-price" inputmode="numeric" placeholder="harga/m" aria-label="Harga per meter" />
    <button class="icon-btn" type="button" data-remove aria-label="Hapus baris">${icon('x')}</button>
  </div>`;

  const partRow = () => `<div class="alloc-row" data-part style="grid-template-columns:1.6fr .6fr .8fr 34px">
    <select class="select part-id" aria-label="Spare part">${partOptions}</select>
    <input class="input part-qty" inputmode="numeric" placeholder="pcs" aria-label="Jumlah pcs" />
    <input class="input part-price" inputmode="numeric" placeholder="harga" aria-label="Harga satuan" />
    <button class="icon-btn" type="button" data-remove aria-label="Hapus baris">${icon('x')}</button>
  </div>`;

  const customerOptions = db.customers
    .filter((c) => c.stage !== 'dormant')
    .map((c) => `<option value="${c.id}" ${sku && c.id === 'CUS-0002' ? 'selected' : ''}>${esc(c.name)}${c.company ? ` — ${esc(c.company)}` : ''}</option>`)
    .join('');

  const modal = openModal({
    title: isOrder ? 'Buat pesanan penjualan' : 'Buat faktur',
    description: isOrder
      ? 'Pesanan tidak mengeluarkan stok. Stok keluar saat pesanan dikonversi menjadi faktur.'
      : 'Kain dipotong dari roll tertentu; spare part memakai pcs. Total dihitung dari baris yang sama dengan stok.',
    wide: true,
    submitLabel: isOrder ? 'Simpan pesanan' : 'Terbitkan faktur',
    extraFooter: isOrder ? '' : `<button class="btn" type="button" data-draft>Simpan draf</button>`,
    body: `
      <div class="form-grid">
        ${field('Pelanggan', `<select class="select" name="customer">${customerOptions}</select>`)}
        ${field('Gudang pengeluaran part', `<select class="select" name="warehouse">${warehouseOptions(db, defaultWh)}</select>`)}
        ${!isOrder ? field('Jatuh tempo (hari)', `<input class="input" type="number" name="dueDays" min="0" max="120" value="14" />`) : ''}
        ${!isOrder ? field('Tipe diskon', `<select class="select" name="discountType"><option value="amount">Nominal (Rp)</option><option value="percent">Persentase (%)</option></select>`) : ''}
        ${!isOrder ? field('Diskon', `<input class="input" name="discountValue" inputmode="decimal" value="0" />`, { hint: 'Nominal rupiah atau persen dari subtotal.' }) : ''}
        ${field('Catatan', `<input class="input" name="notes" placeholder="Referensi proyek / instruksi" />`, { full: true })}
      </div>
      <div class="section-title" style="margin:18px 0 6px"><h3>Kain</h3><span class="xs muted">${rolls.length} roll tersedia di gudang ini</span></div>
      <div id="fab-rows">${rolls.length ? fabricRow() : `<p class="small muted">Tidak ada roll tersedia untuk gudang ini.</p>`}</div>
      <button class="btn btn-sm" type="button" data-add-fab ${rolls.length ? '' : 'disabled'}>${icon('plus')} Tambah kain</button>
      <div class="section-title" style="margin:18px 0 6px"><h3>Spare part</h3><span class="xs muted">Satuan pcs</span></div>
      <div id="part-rows"></div>
      <button class="btn btn-sm" type="button" data-add-part ${partOptions ? '' : 'disabled'}>${icon('plus')} Tambah spare part</button>
      <div class="card card-pad" style="margin-top:16px;background:#fbf8f1">
        <div class="row-between"><span class="small muted">Subtotal</span><strong id="inv-subtotal" class="num">Rp 0</strong></div>
        <div class="row-between" style="margin-top:4px"><span class="small muted">Total setelah diskon</span><strong id="inv-total" class="num" style="font-size:1.1rem">Rp 0</strong></div>
      </div>
      <div class="notice notice-info" style="margin-top:12px">${icon('alert')}<div>${isOrder ? 'Pesanan tidak mengeluarkan stok. Konversi ke faktur adalah satu-satunya peristiwa pengeluaran stok.' : 'Faktur terbit mengeluarkan stok satu kali. Roll utuh hanya bisa dipilih jika tidak ada reservasi.'}</div></div>
    `,
    onMount(form, close) {
      const fabRows = form.querySelector('#fab-rows');
      const partRows = form.querySelector('#part-rows');

      const recalc = () => {
        let subtotal = 0;
        form.querySelectorAll('[data-fab]').forEach((row) => {
          const sel = row.querySelector('.fab-roll');
          const opt = sel.selectedOptions[0];
          const mode = row.querySelector('.fab-mode').value;
          const qty = mode === 'whole' ? Number(opt?.dataset.current ?? 0) : parseM(row.querySelector('.fab-qty').value);
          const price = Number(row.querySelector('.fab-price').value || opt?.dataset.price || 0);
          if (mode === 'whole') row.querySelector('.fab-qty').value = String(qty / 1000).replace('.', ',');
          subtotal += Math.round((qty / 1000) * price);
        });
        form.querySelectorAll('[data-part]').forEach((row) => {
          const opt = row.querySelector('.part-id').selectedOptions[0];
          const qty = Number(row.querySelector('.part-qty').value || 0);
          const price = Number(row.querySelector('.part-price').value || opt?.dataset.price || 0);
          subtotal += Math.round(qty * price);
        });
        const discType = form.discountType?.value ?? 'amount';
        const discRaw = String(form.discountValue?.value ?? '');
        const discValue = discType === 'percent'
          ? Number(discRaw.replace(',', '.')) || 0
          : Number(discRaw.replace(/\D/g, '')) || 0;
        const disc = discType === 'percent'
          ? Math.round(subtotal * Math.min(discValue, 100) / 100)
          : Math.min(Math.round(discValue), subtotal);
        document.getElementById('inv-subtotal').textContent = fmt.money(subtotal);
        document.getElementById('inv-total').textContent = fmt.money(Math.max(0, subtotal - disc));
      };

      const applyDefaultPrice = (row) => {
        const product = row.querySelector('.fab-roll, .part-id');
        const price = row.querySelector('.fab-price, .part-price');
        if (product && price && !price.value) price.value = product.selectedOptions[0]?.dataset.price ?? '';
      };

      const bindRow = (row) => {
        row.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', recalc));
        row.querySelector('.fab-mode')?.addEventListener('change', () => {
          const whole = row.querySelector('.fab-mode').value === 'whole';
          row.querySelector('.fab-qty').disabled = whole;
          recalc();
        });
        row.querySelector('.fab-roll, .part-id')?.addEventListener('change', () => {
          const product = row.querySelector('.fab-roll, .part-id');
          row.querySelector('.fab-price, .part-price').value = product.selectedOptions[0]?.dataset.price ?? '';
          recalc();
        });
        row.querySelector('[data-remove]')?.addEventListener('click', () => { row.remove(); recalc(); });
        applyDefaultPrice(row);
      };
      form.querySelectorAll('[data-fab], [data-part]').forEach(bindRow);
      form.discountType?.addEventListener('change', recalc);
      form.discountValue?.addEventListener('input', recalc);

      form.querySelector('[data-add-fab]')?.addEventListener('click', () => {
        fabRows.insertAdjacentHTML('beforeend', fabricRow());
        bindRow(fabRows.lastElementChild);
        recalc();
      });
      form.querySelector('[data-add-part]')?.addEventListener('click', () => {
        partRows.insertAdjacentHTML('beforeend', partRow());
        bindRow(partRows.lastElementChild);
        recalc();
      });

      // Sensible default price on first row.
      const firstRoll = form.querySelector('.fab-roll');
      if (firstRoll) form.querySelector('.fab-price').value = firstRoll.selectedOptions[0]?.dataset.price ?? '';
      recalc();

      const collect = () => {
        const lines = [];
        form.querySelectorAll('[data-fab]').forEach((row) => {
          const rollId = row.querySelector('.fab-roll').value;
          const mode = row.querySelector('.fab-mode').value;
          const qtyMm = mode === 'whole' ? null : parseM(row.querySelector('.fab-qty').value);
          const price = Number(row.querySelector('.fab-price').value || row.querySelector('.fab-roll').selectedOptions[0]?.dataset.price || 0);
          if (mode === 'whole' || qtyMm > 0) {
            lines.push({ kind: 'fabric', rollId, mode, qtyMm: qtyMm ?? 0, unitPrice: price || undefined });
          }
        });
        form.querySelectorAll('[data-part]').forEach((row) => {
          const qtyPcs = Number(row.querySelector('.part-qty').value || 0);
          if (!Number.isInteger(qtyPcs) || qtyPcs <= 0) {
            if (row.querySelector('.part-qty').value) throw new Error('Jumlah spare part harus bilangan bulat.');
            return;
          }
          const price = Number(row.querySelector('.part-price').value || row.querySelector('.part-id').selectedOptions[0]?.dataset.price || 0);
          lines.push({
            kind: 'part',
            partId: row.querySelector('.part-id').value,
            qtyPcs,
            unitPrice: price || undefined,
            warehouseId: form.warehouse.value,
          });
        });
        if (!lines.length) throw new Error('Tambahkan minimal satu baris kain atau spare part.');
        return lines;
      };

      const save = (post) => {
        try {
          const lines = collect();
          const discountType = form.discountType?.value ?? 'amount';
          const discRaw = String(form.discountValue?.value ?? '');
          const discountValue = discountType === 'percent'
            ? Number(discRaw.replace(',', '.')) || 0
            : Number(discRaw.replace(/\D/g, '')) || 0;
          if (isOrder) {
            const order = ctx.store.update((db) => createSalesOrder(db, {
              customerId: form.customer.value,
              lines,
              notes: form.notes.value,
              user: ctx.user,
            }));
            close();
            window.location.hash = '#/pesanan';
            toast(`Pesanan ${order.id} disimpan. Stok belum keluar.`, { tone: 'success' });
            return;
          }
          const created = ctx.store.update((db) => {
            const inv = createInvoice(db, {
              customerId: form.customer.value,
              lines,
              discountType,
              discountValue,
              dueDays: Number(form.dueDays.value || 14),
              notes: form.notes.value,
              user: ctx.user,
            });
            if (post) postInvoice(db, { id: inv.id, user: ctx.user });
            return inv;
          });
          close();
          window.location.hash = `#/penjualan/${created.id}`;
          toast(post ? 'Faktur diterbitkan. Stok sudah keluar.' : 'Draf faktur disimpan; stok belum berubah.', { tone: 'success' });
        } catch (err) {
          const box = document.querySelector('[data-modal-error]');
          if (box) {
            box.innerHTML = `${icon('alert')}<div><strong>${esc(err.message)}</strong></div>`;
            box.hidden = false;
          }
        }
      };

      form.querySelector('[data-draft]')?.addEventListener('click', () => save(false));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        save(isOrder ? false : true);
      });
    },
    onSubmit: null,
  });
  return modal;
}

/* -------------------------------------------------------------------------- */
/* Payments, returns, deposits                                                */
/* -------------------------------------------------------------------------- */

function openPayment(ctx, inv) {
  const out = invoiceOutstanding(inv);
  openModal({
    title: 'Terima pembayaran',
    description: `Sisa tagihan ${fmt.money(out)}.`,
    submitLabel: 'Catat pembayaran',
    body: `
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" value="${String(out)}" />`, { hint: 'Tidak boleh melebihi sisa tagihan.' })}
      ${field('Metode', `<select class="select" name="method"><option value="transfer">Transfer bank</option><option value="tunai">Tunai</option><option value="qris">QRIS</option><option value="giro">Giro</option></select>`)}
      ${field('Tanggal', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      ${field('Referensi', `<input class="input" name="reference" placeholder="No. transfer / bukti" />`)}
    `,
    onSubmit(form, close) {
      const amount = Number(String(form.amount.value).replace(/\D/g, ''));
      ctx.store.update((db) => recordPayment(db, {
        invoiceId: inv.id,
        amount,
        method: form.method.value,
        reference: form.reference.value,
        date: form.date.value,
        user: ctx.user,
      }));
      close();
      toast('Pembayaran dicatat. Ini simulasi — tidak ada transaksi bank nyata.', { tone: 'success' });
    },
  });
}

function openReturn(ctx, inv) {
  const lines = inv.lines.filter((l) => l.kind !== 'service');
  const rows = lines.map((l) => {
    const sold = l.kind === 'fabric' ? l.qtyMm : l.qtyPcs;
    const already = returnedQty(ctx.db, inv.id, l.id);
    const remaining = sold - already;
    return `<tr>
      <td>${esc(l.description)}<div class="xs muted">Sisa dapat diretur: ${l.kind === 'fabric' ? fmt.m(remaining) : `${fmt.pcs(remaining)} pcs`}</div></td>
      <td class="num" style="width:130px"><input class="input ret-qty" data-line="${l.id}" data-kind="${l.kind}" inputmode="decimal" placeholder="0" ${remaining <= 0 ? 'disabled' : ''} /></td>
      <td><select class="select ret-cond" data-line="${l.id}" style="min-height:38px"><option value="good">Baik</option><option value="damaged">Rusak</option></select></td>
    </tr>`;
  }).join('');

  openModal({
    title: `Retur ${inv.id}`,
    description: 'Retur mengurangi kredit pelanggan dan menambah stok karantina. Tidak boleh melebihi jumlah terjual.',
    wide: true,
    submitLabel: 'Posting retur',
    body: `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Baris</th><th class="num">Qty retur</th><th>Kondisi</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${field('Alasan retur', `<input class="input" name="reason" placeholder="Contoh: kelebihan potong / salah warna" />`)}
      ${field('Disposisi', `<select class="select" name="disposition"><option value="quarantine">Karantina (periksa dulu)</option><option value="good">Langsung tersedia</option></select>`, { hint: 'Barang rusak tetap masuk karantina untuk pemeriksaan.' })}
    `,
    onSubmit(form, close) {
      const retLines = [...form.querySelectorAll('.ret-qty')]
        .map((input) => {
          const raw = input.value.trim();
          if (!raw) return null;
          const kind = input.dataset.kind;
          return {
            lineId: input.dataset.line,
            [`${kind === 'fabric' ? 'qtyMm' : 'qtyPcs'}`]: kind === 'fabric' ? parseM(raw) : Number(raw),
            condition: form.querySelector(`.ret-cond[data-line="${input.dataset.line}"]`).value,
          };
        })
        .filter(Boolean);
      if (!retLines.length) throw new Error('Isi minimal satu jumlah retur.');
      ctx.store.update((db) => {
        const ret = createCustomerReturn(db, {
          invoiceId: inv.id,
          lines: retLines,
          reason: form.reason.value,
          user: ctx.user,
          date: todayJakarta(),
        });
        postCustomerReturn(db, { id: ret.id, user: ctx.user, disposition: form.disposition.value });
      });
      close();
      toast('Retur diposting. Kredit pelanggan dan stok karantina diperbarui.', { tone: 'success' });
    },
  });
}

function openApplyDeposit(ctx, inv) {
  const deposits = ctx.db.deposits.filter((d) => d.customerId === inv.customerId && d.kind === 'indent' && depositBalance(d) > 0);
  if (!deposits.length) return;
  openModal({
    title: 'Pakai deposit',
    description: 'Deposit hanya dapat dialokasikan sekali dan tidak boleh sekaligus direfund.',
    submitLabel: 'Alokasikan',
    body: `
      ${field('Deposit', `<select class="select" name="deposit">${deposits.map((d) => `<option value="${d.id}">${esc(d.id)} · ${d.kind} · saldo ${fmt.money(depositBalance(d))}</option>`).join('')}</select>`)}
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" value="${String(Math.min(depositBalance(deposits[0]), invoiceOutstanding(inv)))}" />`, { hint: `Sisa tagihan ${fmt.money(invoiceOutstanding(inv))}.` })}
    `,
    onSubmit(form, close) {
      const amount = Number(String(form.amount.value).replace(/\D/g, ''));
      ctx.store.update((db) => applyDepositToInvoice(db, {
        depositId: form.deposit.value,
        invoiceId: inv.id,
        amount,
        user: ctx.user,
      }));
      close();
      toast('Deposit dialokasikan ke faktur.', { tone: 'success' });
    },
  });
}

function openIssueTax(ctx, inv) {
  const customer = byId(ctx.db.customers, inv.customerId);
  const preview = taxBreakdown(inv);
  openModal({
    title: `Faktur pajak ${inv.id}`,
    description: 'Nilai DPP dan PPN dihitung otomatis dari total faktur. Tidak ada input harga manual.',
    submitLabel: 'Terbitkan faktur pajak',
    body: `
      <div class="table-wrap" style="margin-bottom:14px"><table class="data">
        <tbody>
          <tr><td>DPP</td><td class="num strong">${fmt.money(preview.dpp)}</td></tr>
          <tr><td>PPN ${Number(preview.ratePercent).toLocaleString('id-ID')}%</td><td class="num strong">${fmt.money(preview.ppn)}</td></tr>
          <tr><td>Total termasuk PPN</td><td class="num strong">${fmt.money(preview.total)}</td></tr>
        </tbody>
      </table></div>
      ${field('Nomor faktur pajak', `<input class="input" name="number" placeholder="FP-${esc(inv.id.replace('INV-', ''))}/${esc(inv.date.slice(0, 4))}" />`, { hint: 'Kosongkan untuk nomor otomatis.' })}
      ${field('NPWP pelanggan', `<input class="input" name="npwp" value="${esc(customer?.npwp ?? '')}" placeholder="00.000.000.0-000.000" />`)}
      <div class="notice notice-info">${icon('alert')}<div>Demo — bukan e-faktur pajak resmi. PPN memakai tarif 11% dan tidak mengubah total tagihan faktur.</div></div>
    `,
    onSubmit(form, close) {
      ctx.store.update((db) => issueTaxInvoice(db, {
        id: inv.id,
        number: form.number.value,
        npwp: form.npwp.value,
        ratePercent: 11,
        user: ctx.user,
      }));
      close();
      toast('Faktur pajak diterbitkan; DPP/PPN dihitung dari total faktur.', { tone: 'success' });
    },
  });
}

function openCreateDelivery(ctx, inv) {
  const customer = byId(ctx.db.customers, inv.customerId);
  openModal({
    title: `Surat jalan ${inv.id}`,
    description: 'Catat PIC pengiriman dan alamat. Stok sudah keluar saat faktur terbit; surat jalan tidak mengurangi stok lagi.',
    submitLabel: 'Buat surat jalan',
    body: `
      ${field('PIC pengiriman', `<input class="input" name="pic" value="${esc(ctx.user.name)}" required />`, { hint: 'Penanggung jawab pengiriman dari gudang.' })}
      ${field('Tanggal kirim', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      ${field('Pengemudi', `<input class="input" name="driver" placeholder="Nama pengemudi" />`)}
      ${field('Kendaraan', `<input class="input" name="vehicle" placeholder="Nomor polisi / jenis" />`)}
      ${field('Alamat kirim', `<input class="input" name="address" value="${esc(customer?.address ?? '')}" />`, { full: true })}
      ${field('Catatan', `<input class="input" name="notes" placeholder="Instruksi bongkar / kontak penerima" />`, { full: true })}
    `,
    onSubmit(form, close) {
      ctx.store.update((db) => createDelivery(db, {
        invoiceId: inv.id,
        pic: form.pic.value,
        date: form.date.value,
        driver: form.driver.value,
        vehicle: form.vehicle.value,
        address: form.address.value,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast('Surat jalan dibuat. Kirim barang, tandai tiba, lalu konfirmasi penerimaan.', { tone: 'success' });
    },
  });
}

function openEditDelivery(ctx, delivery) {
  openModal({
    title: `Edit PIC ${delivery.id}`,
    description: 'PIC dan data pengiriman dapat diubah sebelum barang dikirim.',
    submitLabel: 'Simpan',
    body: `
      ${field('PIC pengiriman', `<input class="input" name="pic" value="${esc(delivery.pic)}" required />`)}
      ${field('Tanggal kirim', `<input class="input" type="date" name="date" value="${esc(delivery.date)}" />`)}
      ${field('Pengemudi', `<input class="input" name="driver" value="${esc(delivery.driver)}" />`)}
      ${field('Kendaraan', `<input class="input" name="vehicle" value="${esc(delivery.vehicle)}" />`)}
      ${field('Alamat kirim', `<input class="input" name="address" value="${esc(delivery.address)}" />`, { full: true })}
      ${field('Catatan', `<input class="input" name="notes" value="${esc(delivery.notes)}" />`, { full: true })}
    `,
    onSubmit(form, close) {
      ctx.store.update((db) => updateDelivery(db, {
        id: delivery.id,
        pic: form.pic.value,
        date: form.date.value,
        driver: form.driver.value,
        vehicle: form.vehicle.value,
        address: form.address.value,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast('Data surat jalan diperbarui.', { tone: 'success' });
    },
  });
}

function openConfirmDelivery(ctx, delivery) {
  openModal({
    title: `Konfirmasi terima ${delivery.id}`,
    description: 'Konfirmasi penerimaan oleh PIC pelanggan. Tidak ada pergerakan stok baru.',
    submitLabel: 'Konfirmasi diterima',
    body: `
      ${field('Nama PIC penerima', `<input class="input" name="receivedBy" placeholder="Nama penerima di lokasi" required />`)}
      ${field('Catatan penerimaan', `<input class="input" name="note" placeholder="Jumlah sesuai, kondisi baik, dsb." />`, { full: true })}
    `,
    onSubmit(form, close) {
      ctx.store.update((db) => confirmDelivery(db, {
        id: delivery.id,
        receivedBy: form.receivedBy.value,
        note: form.note.value,
        user: ctx.user,
      }));
      close();
      toast('Penerimaan dikonfirmasi oleh PIC pelanggan.', { tone: 'success' });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Mount                                                                      */
/* -------------------------------------------------------------------------- */

export function mount(ctx) {
  if (ctx.route.id) {
    const inv = ctx.db.invoices.find((i) => i.id === ctx.route.id);
    if (!inv) return;
    const on = (name, fn) => document.querySelector(`[data-act="${name}"]`)?.addEventListener('click', fn);
    on('post', () => {
      try {
        ctx.store.update((db) => postInvoice(db, { id: inv.id, user: ctx.user }));
        toast('Faktur terbit; stok berkurang satu kali.', { tone: 'success' });
      } catch (err) {
        toast(err.message, { tone: 'error' });
      }
    });
    on('pay', () => openPayment(ctx, inv));
    on('return', () => openReturn(ctx, inv));
    on('apply-deposit', () => openApplyDeposit(ctx, inv));
    on('print', () => printDocument(`Faktur ${inv.id}`, printInvoiceHtml(ctx.db, inv)));
    on('issue-tax', () => openIssueTax(ctx, inv));
    on('print-tax', () => {
      if (inv.taxInvoice) printDocument(`Faktur pajak ${inv.taxInvoice.number}`, printTaxInvoiceHtml(ctx.db, inv));
    });
    on('new-delivery', () => openCreateDelivery(ctx, inv));
    on('print-delivery', () => {
      const delivery = deliveryForInvoice(ctx.db, inv.id);
      if (delivery) printDocument(`Surat jalan ${delivery.id}`, printDeliveryHtml(ctx.db, delivery));
    });
    on('edit-delivery', () => {
      const delivery = deliveryForInvoice(ctx.db, inv.id);
      if (delivery) openEditDelivery(ctx, delivery);
    });
    on('dispatch-delivery', async () => {
      const delivery = deliveryForInvoice(ctx.db, inv.id);
      if (!delivery) return;
      const ok = await confirmAction({ title: 'Kirim barang?', message: `Surat jalan ${delivery.id} akan ditandai dikirim. Stok tidak berubah lagi.`, confirmLabel: 'Kirim' });
      if (!ok) return;
      ctx.store.update((db) => dispatchDelivery(db, { id: delivery.id, user: ctx.user }));
      toast('Surat jalan ditandai dikirim.', { tone: 'success' });
    });
    on('deliver-delivery', async () => {
      const delivery = deliveryForInvoice(ctx.db, inv.id);
      if (!delivery) return;
      const ok = await confirmAction({ title: 'Tandai barang tiba?', message: 'Barang sudah sampai di alamat pelanggan; menunggu konfirmasi PIC penerima.', confirmLabel: 'Tandai tiba' });
      if (!ok) return;
      ctx.store.update((db) => markDelivered(db, { id: delivery.id, user: ctx.user }));
      toast('Barang ditandai tiba.', { tone: 'success' });
    });
    on('confirm-delivery', () => {
      const delivery = deliveryForInvoice(ctx.db, inv.id);
      if (delivery) openConfirmDelivery(ctx, delivery);
    });
    document.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => {
      window.location.hash = tr.dataset.href.replace('#', '');
    }));
    return;
  }

  document.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', () => {
    statusFilter = btn.dataset.status;
    ctx.store.emit();
  }));
  document.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => {
    window.location.hash = tr.dataset.href.replace('#', '');
  }));
  document.querySelector('[data-act="new-invoice"]')?.addEventListener('click', () => openInvoice(ctx));

  if (ctx.route.query?.new) {
    const roll = ctx.route.query.roll ?? null;
    history.replaceState(null, '', '#/penjualan');
    openInvoice(ctx, roll);
  }
}
