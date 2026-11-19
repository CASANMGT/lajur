/** Pengiriman: surat jalan yang ditugaskan ke driver, status, dan konfirmasi. */

import { esc, icon, fmt, badge, toast, confirmAction, openModal, field, copyText } from '../dom.js';
import { byId, todayJakarta, weekdayName } from '../../domain/core.js';
import {
  COURIERS, DELIVERY_STATUS, confirmDelivery, deliveryTrackingUrl, dispatchDelivery,
  invoicesWithoutDelivery, markDelivered, trackingLabel, trackingShareText,
} from '../../domain/deliveries.js';
import { VEHICLE_TYPES } from '../../domain/master.js';
import { courierMark, pageHead, statCard, can } from './common.js';
import { openDeliveryPrint } from './delivery-print.js';
import { openEditDelivery } from './sales.js';
import { enableArrivalNotifications, notifyArrival } from '../notify.js';

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
  const arrived = all.filter((d) => d.status === 'delivered');
  const missing = role === 'driver' ? [] : invoicesWithoutDelivery(db);

  return `
    ${pageHead({
      eyebrow: role === 'driver' ? 'Driver' : 'Logistik',
      title: 'Pengiriman & surat jalan',
      sub: role === 'driver'
        ? 'Tugas pengiriman yang ditugaskan kepada Anda. Perbarui Kirim dan Tiba; penerima dikonfirmasi sales/manajer.'
        : 'Semua surat jalan, driver, tanggal, kurir, dan status penerimaan.',
      actions: `${can(role, 'invoice.create') ? `<a class="btn" href="#/penjualan">${icon('receipt')} Faktur</a>` : ''}<button class="btn" type="button" data-act="enable-arrival-notify">${icon('bell')} Notifikasi tiba</button>`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Hari ini', value: String(todayCount), meta: today, tone: 'accent', iconName: 'truck' })}
      ${statCard({ label: 'Aktif', value: String(active), meta: 'Dibuat / dikirim / tiba' })}
      ${statCard({ label: 'Dikonfirmasi', value: String(confirmed), meta: 'Diterima pelanggan' })}
      ${statCard({ label: 'Driver', value: esc(driver?.name ?? (role === 'driver' ? 'Belum tertaut' : 'Semua')), meta: driver ? `${VEHICLE_TYPES[driver.vehicleType]?.label ?? ''} · ${driver.plateNumber}` : 'Master driver' })}
    </div>
    ${role === 'driver' && !driver ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('alert')}<div><strong>Akun driver belum tertaut.</strong> Minta manajer menautkan akun Anda ke driver di Master Data → Driver & transport.</div></div>` : ''}
    ${arrived.length ? `<div class="notice notice-info" style="margin-bottom:14px">${icon('bell')}<div><strong>${arrived.length} paket tiba.</strong> Menunggu konfirmasi penerimaan dari PIC pelanggan. Aktifkan notifikasi browser agar tidak terlewat.</div></div>` : ''}
    ${missing.length ? `<section class="card card-pad" style="margin-bottom:16px">
      <div class="row-between"><div><h2>Faktur belum ada surat jalan</h2><p class="xs muted">Surat jalan wajib dibuat untuk setiap faktur yang sudah terbit.</p></div><span class="badge no-dot">${missing.length}</span></div>
      <div class="table-wrap" style="margin-top:10px"><table class="data">
        <thead><tr><th>Faktur</th><th>Pelanggan</th><th>Tanggal</th><th class="num">Total</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${missing.map((inv) => `<tr>
          <td class="mono strong">${esc(inv.id)}</td>
          <td>${esc(inv.customerName)}</td>
          <td>${esc(inv.date)}</td>
          <td class="num">${fmt.money(inv.total)}</td>
          <td class="right"><a class="btn btn-sm btn-primary" href="#/penjualan/${inv.id}">Buat surat jalan</a></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>` : ''}

    <div class="row" style="margin-bottom:12px">
      ${[['active', 'Aktif'], ['today', 'Hari ini'], ['done', 'Selesai'], ['all', 'Semua']].map(([k, label]) => `<button class="chip" type="button" data-delivery-filter="${k}" aria-pressed="${filter === k}">${label}</button>`).join('')}
    </div>

    <section class="card">
      <div class="table-wrap desktop-table"><table class="data">
        <thead><tr><th>Surat jalan</th><th>Pelanggan</th><th>Hari</th><th>Driver / kendaraan</th><th>Kurir</th><th>Status</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${all.map((d) => `<tr>
          <td class="mono strong">${esc(d.id)}<div class="xs muted">${esc(d.invoiceId)}</div></td>
          <td><strong class="small">${esc(d.customerName)}</strong><div class="xs muted">PIC ${esc(d.pic)} · ${esc(d.recipientName || '—')}</div></td>
          <td>${esc(weekdayName(d.date))}${d.eta ? `<div class="xs muted">ETA ${esc(d.eta)}</div>` : ''}</td>
          <td><strong class="small">${esc(d.driver || '—')}</strong><div class="xs muted">${esc(d.vehicleName || VEHICLE_TYPES[d.vehicleType]?.label || d.vehicleType || '—')}${d.plateNumber ? ` · ${esc(d.plateNumber)}` : ''}</div><div class="xs muted">${esc(d.transportName || '—')}</div></td>
          <td class="small">${courierMark(d.courier, { small: true })} ${esc(COURIERS[d.courier]?.label ?? d.courier ?? 'Internal')} · ${esc(d.service || 'REG')}${d.trackingRef ? `<div class="row" style="gap:4px"><span class="xs muted mono">${esc(d.trackingRef)}</span><button class="btn btn-sm btn-ghost" type="button" data-copy-tracking="${d.id}" title="Salin link lacak">${icon('copy')}</button></div>` : d.courier === 'internal' ? `<div class="xs muted mono">No. SJ ${esc(d.id)}</div>` : ''}<div class="xs muted">${d.weightKg ? `${d.weightKg} kg` : '—'} · ${d.pieces || '—'} koli</div></td>
          <td>${badge(DELIVERY_STATUS[d.status]?.label ?? d.status, DELIVERY_STATUS[d.status]?.tone ?? 'muted')}${d.receivedBy ? `<div class="xs muted">oleh ${esc(d.receivedBy)}</div>` : ''}</td>
          <td class="right"><div class="row" style="justify-content:flex-end;flex-wrap:wrap">
            <button class="btn btn-sm" data-print-delivery="${d.id}">${icon('printer')} Surat jalan</button>
            ${deliveryTrackingUrl(d) ? `<a class="btn btn-sm" href="${esc(deliveryTrackingUrl(d))}" target="_blank" rel="noopener" title="${esc(trackingLabel(d))}">${icon('link')} Lacak</a>` : ''}
            ${d.status !== 'confirmed' && ['manager', 'sales'].includes(role) ? `<button class="btn btn-sm" data-edit-delivery="${d.id}">Edit</button>` : ''}
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
          <div class="xs muted">Hari ${esc(weekdayName(d.date))} · ${esc(d.driver || '—')} · ${esc(VEHICLE_TYPES[d.vehicleType]?.label ?? '')} ${esc(d.plateNumber || '')}</div>
          <div class="xs muted">${courierMark(d.courier, { small: true })} ${esc(COURIERS[d.courier]?.label ?? d.courier ?? 'Internal')} · ${esc(d.invoiceId)}${d.trackingRef ? ` · <span class="mono">${esc(d.trackingRef)}</span> <button class="btn btn-sm btn-ghost" type="button" data-copy-tracking="${d.id}">${icon('copy')}</button>` : ''}</div>
          <div class="row" style="margin-top:4px;flex-wrap:wrap">
            <button class="btn btn-sm" data-print-delivery="${d.id}">Cetak</button>
            ${deliveryTrackingUrl(d) ? `<a class="btn btn-sm" href="${esc(deliveryTrackingUrl(d))}" target="_blank" rel="noopener">${icon('link')} Lacak</a>${!d.trackingRef ? `<button class="btn btn-sm btn-ghost" type="button" data-copy-tracking="${d.id}">${icon('copy')} Salin</button>` : ''}` : ''}
            ${d.status !== 'confirmed' && ['manager', 'sales'].includes(role) ? `<button class="btn btn-sm" data-edit-delivery="${d.id}">Edit</button>` : ''}
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
    if (delivery) openDeliveryPrint(ctx.db, delivery);
  }));
  document.querySelectorAll('[data-edit-delivery]').forEach((btn) => btn.addEventListener('click', () => {
    const delivery = (ctx.db.deliveries ?? []).find((d) => d.id === btn.dataset.editDelivery);
    if (delivery) openEditDelivery(ctx, delivery);
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
    const updated = ctx.store.update((db) => markDelivered(db, { id: btn.dataset.arrive, user: ctx.user }));
    notifyArrival(updated);
    toast('Barang ditandai tiba.', { tone: 'success' });
  }));
  document.querySelector('[data-act="enable-arrival-notify"]')?.addEventListener('click', async () => {
    try {
      await enableArrivalNotifications();
      toast('Notifikasi tiba aktif di browser ini.', { tone: 'success' });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  });
  document.querySelectorAll('[data-copy-tracking]').forEach((btn) => btn.addEventListener('click', async () => {
    const delivery = (ctx.db.deliveries ?? []).find((d) => d.id === btn.dataset.copyTracking);
    const text = trackingShareText(delivery);
    if (!text) {
      toast('Belum ada link lacak untuk surat jalan ini.', { tone: 'error' });
      return;
    }
    try {
      await copyText(text);
      toast('Link lacak disalin. Tempel ke WhatsApp atau browser.', { tone: 'success' });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }));
  document.querySelectorAll('[data-confirm]').forEach((btn) => btn.addEventListener('click', () => {
    const delivery = (ctx.db.deliveries ?? []).find((d) => d.id === btn.dataset.confirm);
    if (delivery) openConfirm(ctx, delivery);
  }));
}
