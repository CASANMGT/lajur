/** Pesanan penjualan: konfirmasi dan konversi ke faktur (satu kali keluar stok). */

import { esc, icon, fmt, badge, toast, confirmAction, openModal } from '../dom.js';
import { byId } from '../../domain/core.js';
import {
  ORDER_STATUS, cancelOrder, confirmOrder, convertOrderToInvoice,
} from '../../domain/orders.js';
import { settingsOf } from '../../domain/settings.js';
import { pageHead, statCard, can } from './common.js';
import { openInvoice } from './sales.js';

let filter = 'all';

export function render(ctx) {
  const { db, role } = ctx;
  const enabled = settingsOf(db).salesOrderEnabled !== false;
  const orders = db.orders
    .filter((o) => filter === 'all' || o.status === filter)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const stats = {
    draft: db.orders.filter((o) => o.status === 'draft').length,
    confirmed: db.orders.filter((o) => o.status === 'confirmed').length,
    converted: db.orders.filter((o) => o.status === 'converted').length,
    value: db.orders.filter((o) => ['draft', 'confirmed'].includes(o.status)).reduce((a, o) => a + o.total, 0),
  };

  return `
    ${pageHead({
      eyebrow: 'Penjualan',
      title: 'Pesanan penjualan',
      sub: 'Pesanan tidak memotong stok. Konversi ke faktur adalah satu-satunya peristiwa pengeluaran stok.',
      actions: `${enabled && can(role, 'invoice.create') ? `<button class="btn btn-primary" type="button" data-act="new-order">${icon('plus')} Buat pesanan</button>` : ''}`,
    })}
    ${!enabled ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('alert')}<div>Pesanan penjualan dinonaktifkan di <a href="#/pengaturan">Pengaturan → Preferensi</a>.</div></div>` : ''}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Draf', value: String(stats.draft), meta: 'Belum dikonfirmasi' })}
      ${statCard({ label: 'Dikonfirmasi', value: String(stats.confirmed), meta: 'Siap difakturkan', tone: 'accent' })}
      ${statCard({ label: 'Menjadi faktur', value: String(stats.converted), meta: 'Stok sudah keluar' })}
      ${statCard({ label: 'Nilai pesanan aktif', value: fmt.money(stats.value), meta: 'Draf + dikonfirmasi', tone: 'warn' })}
    </div>
    <div class="row" style="margin-bottom:12px">
      ${[['all', 'Semua'], ['draft', 'Draf'], ['confirmed', 'Dikonfirmasi'], ['converted', 'Menjadi faktur'], ['cancelled', 'Dibatalkan']].map(([k, label]) => `<button class="chip" type="button" data-order-status="${k}" aria-pressed="${filter === k}">${label}</button>`).join('')}
    </div>

    <section class="card">
      <div class="table-wrap desktop-table"><table class="data">
        <thead><tr><th>Pesanan</th><th>Pelanggan</th><th>Tanggal</th><th class="num">Total</th><th>Status</th><th>Faktur</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${orders.map((o) => `<tr>
          <td class="mono strong">${esc(o.id)}<div class="xs muted">${o.lines.length} baris</div></td>
          <td><a class="small" href="#/pelanggan/${o.customerId}">${esc(o.customerName)}</a></td>
          <td>${esc(o.date)}</td>
          <td class="num">${fmt.money(o.total)}</td>
          <td>${badge(ORDER_STATUS[o.status].label, ORDER_STATUS[o.status].tone)}</td>
          <td>${o.invoiceId ? `<a class="mono xs" href="#/penjualan/${o.invoiceId}">${esc(o.invoiceId)}</a>` : '—'}</td>
          <td class="right"><div class="row" style="justify-content:flex-end">
            ${o.status === 'draft' ? `<button class="btn btn-sm" data-confirm="${o.id}">Konfirmasi</button>` : ''}
            ${['draft', 'confirmed'].includes(o.status) ? `<button class="btn btn-sm btn-primary" data-convert="${o.id}">Fakturkan</button>` : ''}
            ${['draft', 'confirmed'].includes(o.status) ? `<button class="btn btn-sm btn-ghost" data-cancel="${o.id}">Batal</button>` : ''}
          </div></td>
        </tr>`).join('') || `<tr><td colspan="7"><div class="empty">${icon('receipt')}<strong>Belum ada pesanan</strong><p>Buat pesanan dari pelanggan, lalu fakturkan saat siap.</p></div></td></tr>`}</tbody>
      </table></div>
      <div class="mobile-cards">
        ${orders.map((o) => `<div class="roll-card">
          <div class="top"><span class="id">${esc(o.id)}</span>${badge(ORDER_STATUS[o.status].label, ORDER_STATUS[o.status].tone)}</div>
          <div class="small strong">${esc(o.customerName)}</div>
          <div class="xs muted">${esc(o.date)} · ${o.lines.length} baris · ${fmt.money(o.total)}</div>
          <div class="row" style="margin-top:4px">${o.invoiceId ? `<a class="small mono" href="#/penjualan/${o.invoiceId}">${esc(o.invoiceId)}</a>` : ''}${o.status === 'draft' ? `<button class="btn btn-sm" data-confirm="${o.id}">Konfirmasi</button>` : ''}${['draft', 'confirmed'].includes(o.status) ? `<button class="btn btn-sm btn-primary" data-convert="${o.id}">Fakturkan</button>` : ''}</div>
        </div>`).join('')}
      </div>
    </section>`;
}

export function mount(ctx) {
  document.querySelectorAll('[data-order-status]').forEach((btn) => btn.addEventListener('click', () => {
    filter = btn.dataset.orderStatus;
    ctx.store.emit();
  }));
  document.querySelector('[data-act="new-order"]')?.addEventListener('click', () => openInvoice(ctx, null, 'order'));
  document.querySelectorAll('[data-confirm]').forEach((btn) => btn.addEventListener('click', () => {
    ctx.store.update((db) => confirmOrder(db, { id: btn.dataset.confirm, user: ctx.user }));
    toast('Pesanan dikonfirmasi. Stok belum keluar.', { tone: 'success' });
  }));
  document.querySelectorAll('[data-convert]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Fakturkan pesanan?',
      message: 'Faktur akan diterbitkan dan stok keluar satu kali. Pastikan roll masih tersedia.',
      confirmLabel: 'Terbitkan faktur',
    });
    if (!ok) return;
    try {
      const result = ctx.store.update((db) => convertOrderToInvoice(db, { id: btn.dataset.convert, user: ctx.user }));
      window.location.hash = `#/penjualan/${result.invoice.id}`;
      toast(`Faktur ${result.invoice.id} terbit. Stok keluar satu kali.`, { tone: 'success' });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }));
  document.querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Batalkan pesanan?', message: 'Pesanan tidak mengubah stok.', confirmLabel: 'Batalkan', tone: 'danger' });
    if (!ok) return;
    ctx.store.update((db) => cancelOrder(db, { id: btn.dataset.cancel, user: ctx.user }));
    toast('Pesanan dibatalkan.', { tone: 'success' });
  }));
}
