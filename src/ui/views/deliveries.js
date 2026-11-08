/** Pengiriman: surat jalan yang ditugaskan ke driver, status, dan konfirmasi. */

import { esc, icon, fmt, badge, toast, confirmAction, openModal, field, printDocument } from '../dom.js';
import { byId, todayJakarta } from '../../domain/core.js';
import {
  COURIERS, DELIVERY_STATUS, confirmDelivery, dispatchDelivery, markDelivered,
} from '../../domain/deliveries.js';
import { VEHICLE_TYPES } from '../../domain/master.js';
import { pageHead, statCard, can } from './common.js';
import { printDeliveryHtml } from './print.js';

let filter = 'active';

function driverForUser(db, user) {
  return (db.drivers ?? []).find((d) => d.userId === user.id) ?? null;
}

function statusFilter(delivery) {
  if (filter === 'today') return delivery.date === todayJakarta();
  if (filter === 'active') return ['draft', 'dispatched', 'delivered'].includes(delivery.status);
  if (filter === 'done') return delivery.status === 'confirmed';
  return true;
}

export function render(ctx) {
  const { db, role, user } = ctx;
  const driver = role === 'driver' ? driverForUser(db, user) : null;
  const all = (db.deliveries ?? [])
    .filter((d) => role !== 'driver' || d.driverId === driver?.id)
    .filter(statusFilter)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
  const today = todayJakarta();
  const schedule = role === 'driver' ? all.filter((d) => d.date === today) : (db.deliveries ?? []);
  const active = all.filter((d) => d.status !== 'confirmed' && d.status !== 'cancelled').length;
  const confirmed = all.filter((d) => d.status === 'confirmed').length;
  const todayCount = all.filter((d) => d.date === today).length;

  return `
    ${pageHead({
      eyebrow: role === 'driver' ? 'Driver' : 'Logistik',
      title: 'Pengiriman & surat jalan',
      sub: role === 'driver'
        ? 'Tugas pengiriman yang ditugaskan kepada Anda. Perbarui Kirim dan Tiba; penerima dikonfirmasi sales/manajer.'
        : 'Semua surat jalan, driver, tanggal, kurir, dan status penerimaan.',
      actions: `${can(role, 'invoice.create') ? `<a class="btn" href="#/penjualan">${icon('receipt')} Faktur</a>` : ''}`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Hari ini', value: String(todayCount), meta: today, tone: 'accent', iconName: 'truck' })}
      ${statCard({ label: 'Aktif', value: String(active), meta: 'Dibuat / dikirim / tiba' })}
      ${statCard({ label: 'Dikonfirmasi', value: String(confirmed), meta: 'Diterima pelanggan' })}
      ${statCard({ label: 'Driver', value: esc(driver?.name ?? (role === 'driver' ? 'Belum tertaut' : 'Semua')), meta: driver ? `${VEHICLE_TYPES[driver.vehicleType]?.label ?? ''} · ${driver.plateNumber}` : 'Master driver' })}
    </div>
    ${role === 'driver' && !driver ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('alert')}<div><strong>Akun driver belum tertaut.</strong> Minta manajer menautkan akun Anda ke driver di Master Data → Driver & transport.</div></div>` : ''}

    <div class="row" style="margin-bottom:12px">
      ${[['active', 'Aktif'], ['today', 'Hari ini'], ['done', 'Selesai'], ['all', 'Semua']].map(([k, label]) => `<button class="chip" type="button" data-delivery-filter="${k}" aria-pressed="${filter === k}">${label}</button>`).join('')}
    </div>

    <section class="card">
      <div class="table-wrap desktop-table"><table class="data">
        <thead><tr><th>Surat jalan</th><th>Pelanggan</th><th>Tanggal</th><th>Driver / kendaraan</th><th>Kurir</th><th>Status</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${all.map((d) => `<tr>
          <td class="mono strong">${esc(d.id)}<div class="xs muted">${esc(d.invoiceId)}</div></td>
          <td><strong class="small">${esc(d.customerName)}</strong><div class="xs muted">PIC ${esc(d.pic)}</div></td>
          <td>${esc(d.date)}</td>
          <td><strong class="small">${esc(d.driver || '—')}</strong><div class="xs muted">${esc(VEHICLE_TYPES[d.vehicleType]?.label ?? d.vehicleType ?? '—')}${d.plateNumber ? ` · ${esc(d.plateNumber)}` : ''}</div></td>
          <td class="small">${esc(COURIERS[d.courier]?.label ?? d.courier ?? 'Internal')}${d.trackingRef ? `<div class="xs muted">${esc(d.trackingRef)}</div>` : ''}</td>
          <td>${badge(DELIVERY_STATUS[d.status]?.label ?? d.status, DELIVERY_STATUS[d.status]?.tone ?? 'muted')}${d.receivedBy ? `<div class="xs muted">oleh ${esc(d.receivedBy)}</div>` : ''}</td>
          <td class="right"><div class="row" style="justify-content:flex-end;flex-wrap:wrap">
            <button class="btn btn-sm" data-print-delivery="${d.id}">${icon('printer')} Surat jalan</button>
            ${d.status === 'draft' && role !== 'operator' ? `<button class="btn btn-sm btn-primary" data-dispatch="${d.id}">Kirim</button>` : ''}
            ${d.status === 'dispatched' && role !== 'operator' ? `<button class="btn btn-sm btn-primary" data-arrive="${d.id}">Tiba</button>` : ''}
            ${d.status === 'delivered' && ['manager', 'sales'].includes(role) ? `<button class="btn btn-sm btn-primary" data-confirm="${d.id}">Konfirmasi terima</button>` : ''}
          </div></td>
        </tr>`).join('') || `<tr><td colspan="7"><div class="empty">${icon('truck')}<strong>Belum ada surat jalan</strong><p>Buat surat jalan dari faktur yang sudah terbit.</p></div></td></tr>`}</tbody>
      </table></div>
      <div class="mobile-cards">
        ${all.map((d) => `<div class="roll-card">
          <div class="top"><span class="id mono">${esc(d.id)}</span>${badge(DELIVERY_STATUS[d.status]?.label ?? d.status, DELIVERY_STATUS[d.status]?.tone ?? 'muted')}</div>
          <div class="small strong">${esc(d.customerName)}</div>
          <div class="xs muted">${esc(d.date)} · ${esc(d.driver || '—')} · ${esc(VEHICLE_TYPES[d.vehicleType]?.label ?? '')} ${esc(d.plateNumber || '')}</div>
          <div class="xs muted">${esc(COURIERS[d.courier]?.label ?? d.courier ?? 'Internal')} · ${esc(d.invoiceId)}</div>
          <div class="row" style="margin-top:4px;flex-wrap:wrap">
            <button class="btn btn-sm" data-print-delivery="${d.id}">Cetak</button>
            ${d.status === 'draft' && role !== 'operator' ? `<button class="btn btn-sm btn-primary" data-dispatch="${d.id}">Kirim</button>` : ''}
            ${d.status === 'dispatched' && role !== 'operator' ? `<button class="btn btn-sm btn-primary" data-arrive="${d.id}">Tiba</button>` : ''}
            ${d.status === 'delivered' && ['manager', 'sales'].includes(role) ? `<button class="btn btn-sm btn-primary" data-confirm="${d.id}">Konfirmasi</button>` : ''}
          </div>
        </div>`).join('') || `<div class="empty">${icon('truck')}<strong>Belum ada surat jalan</strong></div>`}
      </div>
    </section>`;
}

function openConfirm(ctx, delivery) {
  openModal({
    title: `Konfirmasi terima ${delivery.id}`,
    description: 'Konfirmasi dari PIC pelanggan. Stok tidak berubah lagi.',
    submitLabel: 'Konfirmasi diterima',
    body: `
      ${field('Nama PIC penerima', `<input class="input" name="receivedBy" value="${esc(delivery.receivedBy ?? '')}" required />`)}
      ${field('Catatan', `<input class="input" name="note" value="${esc(delivery.confirmationNote ?? '')}" />`, { full: true })}
    `,
    onSubmit(form, close) {
      ctx.store.update((db) => confirmDelivery(db, { id: delivery.id, receivedBy: form.receivedBy.value, note: form.note.value, user: ctx.user }));
      close();
      toast('Penerimaan dikonfirmasi.', { tone: 'success' });
    },
  });
}

export function mount(ctx) {
  document.querySelectorAll('[data-delivery-filter]').forEach((btn) => btn.addEventListener('click', () => {
    filter = btn.dataset.deliveryFilter;
    ctx.store.emit();
  }));
  document.querySelectorAll('[data-print-delivery]').forEach((btn) => btn.addEventListener('click', () => {
    const delivery = (ctx.db.deliveries ?? []).find((d) => d.id === btn.dataset.printDelivery);
    if (delivery) printDocument(`Surat jalan ${delivery.id}`, printDeliveryHtml(ctx.db, delivery));
  }));
  document.querySelectorAll('[data-dispatch]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Kirim barang?', message: 'Status menjadi Dikirim. Stok sudah keluar saat faktur terbit.', confirmLabel: 'Kirim' });
    if (!ok) return;
    ctx.store.update((db) => dispatchDelivery(db, { id: btn.dataset.dispatch, user: ctx.user }));
    toast('Surat jalan ditandai dikirim.', { tone: 'success' });
  }));
  document.querySelectorAll('[data-arrive]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Tandai tiba?', message: 'Barang sudah sampai di pelanggan.', confirmLabel: 'Tandai tiba' });
    if (!ok) return;
    ctx.store.update((db) => markDelivered(db, { id: btn.dataset.arrive, user: ctx.user }));
    toast('Barang ditandai tiba.', { tone: 'success' });
  }));
  document.querySelectorAll('[data-confirm]').forEach((btn) => btn.addEventListener('click', () => {
    const delivery = (ctx.db.deliveries ?? []).find((d) => d.id === btn.dataset.confirm);
    if (delivery) openConfirm(ctx, delivery);
  }));
}
