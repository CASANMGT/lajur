/** Printable document fragments (used by printDocument). */

import { esc, fmt } from '../dom.js';
import qrcode from '../../vendor/qrcode.js';
import { byId } from '../../domain/core.js';
import { transferTotals, lineStats } from '../../domain/transfers.js';
import { invoiceOutstanding } from '../../domain/sales.js';
import { COURIERS, DELIVERY_STATUS, deliveryTrackingUrl } from '../../domain/deliveries.js';
import { VEHICLE_TYPES } from '../../domain/master.js';
import { PRIORITY, TASK_STATUS, TASK_TYPE } from '../../domain/tasks.js';

const whName = (db, id) => byId(db.warehouses, id)?.name ?? '—';

function qrSvg(value, { size = 132 } = {}) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(String(value ?? ''));
    qr.make();
    const count = qr.getModuleCount();
    const cells = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) cells.push(`<rect x="${col}" y="${row}" width="1" height="1"></rect>`);
      }
    }
    return `<svg viewBox="0 0 ${count} ${count}" role="img" aria-label="QR ${esc(value)}" shape-rendering="crispEdges" style="display:block;width:${size}px;height:${size}px;margin:0 auto;background:#fff"><rect width="${count}" height="${count}" fill="#fff"></rect><g fill="#172b3a">${cells.join('')}</g></svg>`;
  } catch {
    return `<div style="font-family:ui-monospace,monospace;font-size:12px;text-align:center">${esc(value)}</div>`;
  }
}

export function printLabelHtml(roll, sku, wh) {
  const barcode = roll.barcode || roll.id;
  const origin = typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('file:')
    ? window.location.origin
    : '';
  const qrValue = origin ? `${origin}/#/scan/${roll.id}` : barcode;
  return `
    <div style="border:2px solid #172b3a;border-radius:8px;padding:16px;max-width:420px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span class="brand">lavishome</span><span style="font-size:9px;letter-spacing:.14em;color:#62727c">TAG STOK / ROLL</span>
      </div>
      <div style="font-family:ui-monospace,monospace;font-size:26px;font-weight:700;letter-spacing:.02em;margin:10px 0 2px">${esc(roll.id)}</div>
      <div style="font-size:14px;font-weight:600">${esc(sku?.collectionName)} — ${esc(sku?.colourName || sku?.colourCode)}</div>
      <div style="font-size:11px;color:#62727c;margin-bottom:10px">${esc(sku?.motive || sku?.clothType || '')} · ${esc(sku?.code)} · Kode warna ${esc(sku?.colourCode)} · ${esc(sku?.widthCm)} cm</div>
      <table style="margin:0">
        <tr><td style="border:0;padding:2px 0;font-size:10px;color:#62727c">LOT</td><td style="border:0;padding:2px 0;font-size:12px;font-weight:700">${esc(roll.lot)}</td></tr>
        <tr><td style="border:0;padding:2px 0;font-size:10px;color:#62727c">PANJANG</td><td style="border:0;padding:2px 0;font-size:16px;font-weight:700">${fmt.m(roll.currentMm)}</td></tr>
        <tr><td style="border:0;padding:2px 0;font-size:10px;color:#62727c">LOKASI</td><td style="border:0;padding:2px 0;font-size:12px;font-weight:700">${esc(wh?.code ?? '—')} / ${esc(roll.bin || '—')}</td></tr>
        <tr><td style="border:0;padding:2px 0;font-size:10px;color:#62727c">DITERIMA</td><td style="border:0;padding:2px 0;font-size:11px">${esc(roll.receivedAt)} · ${esc(roll.receiptRef || '—')}</td></tr>
      </table>
      <div style="margin-top:12px;text-align:center">${qrSvg(qrValue)}</div>
      <div style="font-family:ui-monospace,monospace;font-size:13px;font-weight:700;letter-spacing:.12em;text-align:center;margin-top:5px">${esc(barcode)}</div>
      <div style="font-size:8px;color:#62727c;margin-top:4px">Scan QR dengan kamera ponsel untuk membuka roll dan lokasi ${esc(wh?.code ?? '')}/${esc(roll.bin || '—')}.</div>
    </div>`;
}

export function printStockTagsHtml(db, rolls, { copies = 1 } = {}) {
  const origin = typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('file:')
    ? window.location.origin
    : '';
  const cards = [];
  for (const roll of rolls) {
    const sku = byId(db.skus, roll.skuId);
    const wh = byId(db.warehouses, roll.transit?.toWarehouseId ?? roll.warehouseId);
    const barcode = roll.barcode || roll.id;
    const qrValue = origin ? `${origin}/#/scan/${roll.id}` : barcode;
    for (let copy = 0; copy < Math.max(1, Number(copies) || 1); copy += 1) {
      cards.push(`<div class="stock-tag-card">
        <div class="stock-tag-qr">${qrSvg(qrValue, { size: 104 })}<div class="stock-tag-code">${esc(barcode)}</div></div>
        <div class="stock-tag-info">
          <div class="stock-tag-brand">lavishome <span>TAG STOK</span></div>
          <div class="stock-tag-id">${esc(roll.id)}</div>
          <div class="stock-tag-name">${esc(sku?.collectionName ?? '—')} · ${esc(sku?.motive || sku?.clothType || '')}</div>
          <div class="stock-tag-line">${esc(sku?.colourName || sku?.colourCode || '—')} · ${esc(sku?.widthCm ?? '—')} cm</div>
          <div class="stock-tag-grid">
            <span>Lot<strong>${esc(roll.lot)}</strong></span>
            <span>Sisa<strong>${fmt.m(roll.currentMm)}</strong></span>
            <span>Lokasi<strong>${esc(wh?.code ?? '—')} / ${esc(roll.bin || '—')}</strong></span>
          </div>
        </div>
      </div>`);
    }
  }
  return `<style>
    .tag-sheet { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; }
    .stock-tag-card { border: 1.2pt solid #172b3a; border-radius: 3mm; padding: 3mm; height: 62mm; display: flex; gap: 3mm; overflow: hidden; page-break-inside: avoid; break-inside: avoid; background: #fff; }
    .stock-tag-qr { width: 31mm; flex: none; text-align: center; }
    .stock-tag-qr svg { width: 28mm !important; height: 28mm !important; }
    .stock-tag-code { font-family: ui-monospace, monospace; font-size: 7pt; margin-top: 1mm; letter-spacing: .06em; }
    .stock-tag-info { flex: 1; min-width: 0; }
    .stock-tag-brand { display: flex; justify-content: space-between; align-items: baseline; font-weight: 800; font-size: 11pt; }
    .stock-tag-brand span { font-size: 6.5pt; letter-spacing: .12em; color: #62727c; }
    .stock-tag-id { font-family: ui-monospace, monospace; font-size: 13pt; font-weight: 800; margin-top: 1mm; }
    .stock-tag-name { font-size: 9pt; font-weight: 700; margin-top: .5mm; }
    .stock-tag-line { font-size: 7.5pt; color: #62727c; }
    .stock-tag-grid { margin-top: 2mm; display: grid; gap: 1mm; }
    .stock-tag-grid span { font-size: 6.5pt; color: #62727c; display: flex; justify-content: space-between; gap: 2mm; }
    .stock-tag-grid strong { color: #172b3a; font-size: 8pt; }
  </style>
  <div class="tag-sheet">${cards.join('')}</div>`;
}

export function printTransferHtml(db, transfer, kind = 'permintaan') {
  const totals = transferTotals(transfer);
  const title = kind === 'surat-jalan' ? 'SURAT JALAN INTERNAL' : 'PERMINTAAN GUDANG / PO INTERNAL';
  return `
    <h1>${title}</h1>
    <p class="pill">${esc(transfer.id)} · ${esc(transfer.status)}</p>
    <div class="meta" style="margin-top:12px">
      <div><span>Dari</span><strong>${esc(whName(db, transfer.fromWarehouseId))}</strong></div>
      <div><span>Ke</span><strong>${esc(whName(db, transfer.toWarehouseId))}</strong></div>
      <div><span>Dibutuhkan</span><strong>${esc(transfer.neededBy)}</strong></div>
      <div><span>Diminta oleh</span><strong>${esc(transfer.requestedByName)}</strong></div>
      <div><span>Alasan / proyek</span><strong>${esc(transfer.reason || '—')}</strong></div>
      <div><span>Dibuat</span><strong>${esc(transfer.createdDate)}</strong></div>
    </div>
    <table>
      <thead><tr><th>Produk</th><th class="num">Diminta</th><th class="num">Dikirim</th><th class="num">Diterima</th><th class="num">Belum kirim</th><th class="num">Transit</th></tr></thead>
      <tbody>${transfer.lines.map((line) => {
        const sku = byId(db.skus, line.skuId);
        const s = lineStats(line);
        return `<tr>
          <td><strong>${esc(sku?.code)}</strong><br><small>${esc(sku?.collectionName)} ${esc(sku?.colourName || sku?.colourCode)}</small></td>
          <td class="num">${fmt.m(line.requestedMm)}</td>
          <td class="num">${fmt.m(line.dispatchedMm)}</td>
          <td class="num">${fmt.m(line.receivedMm)}</td>
          <td class="num">${fmt.m(s.outstandingMm)}</td>
          <td class="num">${fmt.m(s.inTransitMm)}</td>
        </tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td><strong>Total</strong></td><td class="num">${fmt.m(totals.requestedMm)}</td><td class="num">${fmt.m(totals.dispatchedMm)}</td><td class="num">${fmt.m(totals.receivedMm)}</td><td class="num">${fmt.m(totals.outstandingMm)}</td><td class="num">${fmt.m(totals.inTransitMm)}</td></tr></tfoot>
    </table>
    ${kind === 'surat-jalan' ? `<p class="note">Barang dalam perjalanan bukan stok gudang asal maupun tujuan sampai diterima. Dokumen ini tidak menimbulkan pendapatan, piutang, atau utang pemasok.</p>` : ''}
    <p class="note">Catatan: persetujuan tidak mereservasi stok; ketersediaan diperiksa ulang saat pengiriman.</p>`;
}

export function printInvoiceHtml(db, invoice) {
  const customer = byId(db.customers, invoice.customerId);
  const outstanding = invoiceOutstanding(invoice);
  const discountLabel = invoice.discountType === 'percent'
    ? `Diskon (${Number(invoice.discountValue ?? 0).toLocaleString('id-ID')}%)`
    : 'Diskon';
  return `
    <h1>FAKTUR</h1>
    <p class="pill">${esc(invoice.id)} · ${esc(invoice.status)}</p>
    <div class="meta" style="margin-top:12px">
      <div><span>Pelanggan</span><strong>${esc(customer?.name ?? invoice.customerName)}</strong></div>
      <div><span>Tanggal</span><strong>${esc(invoice.date)}</strong></div>
      <div><span>Jatuh tempo</span><strong>${esc(invoice.dueDate)}</strong></div>
      <div><span>Alamat</span><strong>${esc(customer?.address ?? '—')}</strong></div>
      <div><span>NPWP</span><strong>${esc(customer?.npwp ?? '—')}</strong></div>
      <div><span>Sales</span><strong>${esc(byId(db.users, invoice.salespersonId)?.name ?? '—')}</strong></div>
    </div>
    <table>
      <thead><tr><th>Deskripsi</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Jumlah</th></tr></thead>
      <tbody>${invoice.lines.map((l) => `<tr>
        <td>${esc(l.description)}${l.lot ? `<br><small>Lot ${esc(l.lot)} · ${esc(l.rollId)}</small>` : ''}</td>
        <td class="num">${l.kind === 'fabric' ? fmt.m(l.qtyMm) : l.kind === 'part' ? `${fmt.pcs(l.qtyPcs)} pcs` : '1 jasa'}</td>
        <td class="num">${fmt.money(l.unitPrice)}</td>
        <td class="num">${fmt.money(l.amount)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div style="margin-left:auto;max-width:300px">
      <div class="doc-total"><dt>Subtotal</dt><dd>${fmt.money(invoice.subtotal)}</dd></div>
      ${invoice.discount ? `<div class="doc-total"><dt>${esc(discountLabel)}</dt><dd>−${fmt.money(invoice.discount)}</dd></div>` : ''}
      <div class="doc-total"><dt>Total</dt><dd>${fmt.money(invoice.total)}</dd></div>
      ${invoice.depositApplied ? `<div class="doc-total"><dt>Deposit</dt><dd>−${fmt.money(invoice.depositApplied)}</dd></div>` : ''}
      ${invoice.credited ? `<div class="doc-total"><dt>Retur</dt><dd>−${fmt.money(invoice.credited)}</dd></div>` : ''}
      <div class="doc-total"><dt>Sisa tagihan</dt><dd>${fmt.money(outstanding)}</dd></div>
    </div>
    ${invoice.taxInvoice ? `<p class="note" style="margin-top:14px">Faktur pajak ${esc(invoice.taxInvoice.number)} · DPP ${fmt.money(invoice.taxInvoice.dpp)} · PPN ${fmt.money(invoice.taxInvoice.ppn)}</p>` : ''}
    ${invoice.notes ? `<p class="note" style="margin-top:16px">${esc(invoice.notes)}</p>` : ''}
    <p class="note" style="margin-top:10px">Demo — bukan e-faktur pajak dan bukan dokumen akuntansi resmi.</p>`;
}

export function printTaxInvoiceHtml(db, invoice) {
  const tax = invoice.taxInvoice;
  if (!tax) return '<p class="note">Faktur pajak belum diterbitkan.</p>';
  const customer = byId(db.customers, invoice.customerId);
  return `
    <h1>FAKTUR PAJAK</h1>
    <p class="pill">${esc(tax.number)} · ${esc(invoice.id)}</p>
    <div class="meta" style="margin-top:12px">
      <div><span>Pelanggan</span><strong>${esc(customer?.name ?? invoice.customerName)}</strong></div>
      <div><span>NPWP</span><strong>${esc(tax.npwp || customer?.npwp || '—')}</strong></div>
      <div><span>Tanggal faktur</span><strong>${esc(invoice.date)}</strong></div>
      <div><span>Alamat</span><strong>${esc(customer?.address ?? '—')}</strong></div>
      <div><span>Diterbitkan</span><strong>${esc(tax.issuedAt ? new Date(tax.issuedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '—')}</strong></div>
      <div><span>Oleh</span><strong>${esc(tax.issuedBy ?? '—')}</strong></div>
    </div>
    <table>
      <thead><tr><th>Deskripsi</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Jumlah</th></tr></thead>
      <tbody>${invoice.lines.map((l) => `<tr>
        <td>${esc(l.description)}</td>
        <td class="num">${l.kind === 'fabric' ? fmt.m(l.qtyMm) : l.kind === 'part' ? `${fmt.pcs(l.qtyPcs)} pcs` : '1 jasa'}</td>
        <td class="num">${fmt.money(l.unitPrice)}</td>
        <td class="num">${fmt.money(l.amount)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div style="margin-left:auto;max-width:320px">
      <div class="doc-total"><dt>Subtotal baris</dt><dd>${fmt.money(invoice.subtotal)}</dd></div>
      ${invoice.discount ? `<div class="doc-total"><dt>Diskon</dt><dd>−${fmt.money(invoice.discount)}</dd></div>` : ''}
      <div class="doc-total"><dt>DPP</dt><dd>${fmt.money(tax.dpp)}</dd></div>
      <div class="doc-total"><dt>PPN ${Number(tax.ratePercent).toLocaleString('id-ID')}%</dt><dd>${fmt.money(tax.ppn)}</dd></div>
      <div class="doc-total"><dt>Total termasuk PPN</dt><dd>${fmt.money(tax.total)}</dd></div>
    </div>
    <p class="note" style="margin-top:14px">Harga, DPP, dan PPN dihitung otomatis dari faktur; tidak ada input harga manual di dokumen ini.</p>
    <p class="note">Demo — bukan e-faktur pajak resmi. Nomor dan NPWP hanya contoh.</p>`;
}

export function printDeliveryHtml(db, delivery) {
  const customer = byId(db.customers, delivery.customerId);
  const courier = COURIERS[delivery.courier]?.label ?? delivery.courier ?? 'Internal';
  const recipient = delivery.recipientName || customer?.name || delivery.customerName;
  const recipientPhone = delivery.recipientPhone || customer?.phone || '—';
  const address = delivery.address || customer?.address || '—';
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #172b3a;padding-bottom:10px">
      <div>
        <div class="brand" style="font-size:24px">lavishome</div>
        <div style="font-size:10px;letter-spacing:.14em;color:#62727c">SURAT JALAN / CONSIGNMENT NOTE</div>
        <div style="margin-top:8px;font-size:16px;font-weight:800">${esc(courier)} · ${esc(delivery.service || 'REG')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:ui-monospace,monospace;font-size:13px;font-weight:700">${esc(delivery.id)}</div>
        <div style="font-size:10px;color:#62727c">${esc(delivery.date)}</div>
        <div style="margin-top:6px;font-family:ui-monospace,monospace;font-size:18px;font-weight:800;letter-spacing:.08em">${esc(delivery.trackingRef || 'NO-AWB')}</div>
        <div style="font-size:9px;color:#62727c">NO. RESI / AWB</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      <div style="border:1px solid #cfc6b6;border-radius:6px;padding:10px">
        <div style="font-size:9px;letter-spacing:.1em;color:#62727c">PENGIRIM</div>
        <div style="font-weight:700;margin-top:4px">PT Lavishome Tekstil Nusantara</div>
        <div style="font-size:11px">Gudang Jakarta / Bali</div>
        <div style="font-size:10px;color:#62727c;margin-top:4px">PIC: ${esc(delivery.pic)}</div>
      </div>
      <div style="border:1px solid #cfc6b6;border-radius:6px;padding:10px">
        <div style="font-size:9px;letter-spacing:.1em;color:#62727c">PENERIMA</div>
        <div style="font-weight:700;margin-top:4px">${esc(recipient)}</div>
        <div style="font-size:11px">${esc(recipientPhone)}</div>
        <div style="font-size:10px;color:#62727c;margin-top:4px">${esc(address)}</div>
      </div>
    </div>
    <div class="meta" style="margin-top:12px">
      <div><span>Faktur</span><strong>${esc(delivery.invoiceId)}</strong></div>
      <div><span>Estimasi tiba</span><strong>${esc(delivery.eta || '—')}</strong></div>
      ${deliveryTrackingUrl(delivery) ? `<div><span>Lacak paket</span><strong style="font-size:9px;word-break:break-all">${esc(deliveryTrackingUrl(delivery))}</strong></div>` : ''}
      <div><span>Berat / koli</span><strong>${delivery.weightKg ? `${delivery.weightKg} kg` : '—'} · ${delivery.pieces || '—'} koli</strong></div>
      <div><span>Ongkir / asuransi</span><strong>${fmt.money(delivery.shippingCost || 0)} / ${fmt.money(delivery.insurance || 0)}</strong></div>
      <div><span>COD</span><strong>${delivery.codAmount ? fmt.money(delivery.codAmount) : '—'}</strong></div>
      <div><span>Transport / armada</span><strong>${esc(delivery.transportName || '—')}</strong></div>
      <div><span>Driver / kendaraan</span><strong>${esc(delivery.driver || '—')}${delivery.vehicleName ? ` · ${esc(delivery.vehicleName)}` : delivery.vehicleType ? ` · ${esc(VEHICLE_TYPES[delivery.vehicleType]?.label ?? delivery.vehicleType)}` : ''}${delivery.plateNumber ? ` · ${esc(delivery.plateNumber)}` : ''}</strong></div>
      <div><span>Status</span><strong>${esc(DELIVERY_STATUS[delivery.status]?.label ?? delivery.status)}</strong></div>
    </div>
    <table>
      <thead><tr><th>Barang</th><th class="num">Qty</th><th>Catatan</th></tr></thead>
      <tbody>${delivery.lines.map((l) => `<tr>
        <td>${esc(l.description)}</td>
        <td class="num">${l.kind === 'fabric' ? fmt.m(l.qtyMm) : `${fmt.pcs(l.qtyPcs)} pcs`}</td>
        <td>${esc(l.note || '—')}</td>
      </tr>`).join('')}</tbody>
    </table>
    ${delivery.instructions ? `<p class="note">Instruksi: ${esc(delivery.instructions)}</p>` : ''}
    ${delivery.notes ? `<p class="note">${esc(delivery.notes)}</p>` : ''}
    <div style="margin-top:12px;display:flex;gap:2px" aria-hidden="true">
      ${Array.from({ length: 58 }, (_, i) => `<i style="display:inline-block;width:${i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1}px;height:34px;background:#172b3a"></i>`).join('')}
    </div>
    <div style="font-size:8px;color:#62727c;margin-top:3px">${esc(delivery.trackingRef || delivery.id)} · ${esc(courier)} · ${esc(delivery.service || 'REG')}</div>
    <div style="display:flex;gap:30px;margin-top:24px;font-size:10px">
      <div style="flex:1;border-top:1px solid #172b3a;padding-top:4px">PIC pengiriman<br><strong>${esc(delivery.pic)}</strong></div>
      <div style="flex:1;border-top:1px solid #172b3a;padding-top:4px">Penerima<br><strong>${delivery.receivedBy ? esc(delivery.receivedBy) : '&nbsp;'}</strong></div>
    </div>
    <p class="note" style="margin-top:14px">Barang sudah dikeluarkan dari stok saat faktur ${esc(delivery.invoiceId)} diterbitkan. Surat jalan ini bukan faktur dan tidak mengurangi stok lagi.</p>
    <p class="note">Faktur ${esc(delivery.invoiceId)} · status ${esc(DELIVERY_STATUS[delivery.status]?.label ?? delivery.status)} · dokumen pengiriman, bukan faktur.</p>`;
}

export function printSalesOrderHtml(db, order) {
  const customer = byId(db.customers, order.customerId);
  const creator = byId(db.users, order.userId);
  const project = order.projectId ? db.projects.find((p) => p.id === order.projectId) : null;
  return `
    <h1>PESANAN PENJUALAN</h1>
    <p class="pill">${esc(order.id)} · ${esc(order.status)}</p>
    <div class="meta" style="margin-top:12px">
      <div><span>Pelanggan</span><strong>${esc(customer?.name ?? order.customerName)}</strong></div>
      <div><span>Perusahaan</span><strong>${esc(customer?.company ?? '—')}</strong></div>
      <div><span>Alamat</span><strong>${esc(customer?.address ?? '—')}</strong></div>
      <div><span>Tanggal</span><strong>${esc(order.date)}</strong></div>
      <div><span>Dibuat oleh</span><strong>${esc(creator?.name ?? order.createdBy ?? 'Sistem')}</strong></div>
      <div><span>Proyek</span><strong>${esc(project?.name ?? order.projectId ?? '—')}</strong></div>
    </div>
    <table>
      <thead><tr><th>Deskripsi</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Jumlah</th></tr></thead>
      <tbody>${order.lines.map((l) => `<tr>
        <td>${esc(l.description)}${l.rollId ? `<br><small>Roll ${esc(l.rollId)} · Lot ${esc(l.lot ?? '')} · ${l.mode === 'whole' ? 'roll utuh' : 'potong'}</small>` : l.kind === 'part' ? `<br><small>Spare part · ${esc(byId(db.warehouses, l.warehouseId)?.name ?? '')}</small>` : ''}</td>
        <td class="num">${l.kind === 'fabric' ? fmt.m(l.qtyMm) : `${fmt.pcs(l.qtyPcs)} pcs`}</td>
        <td class="num">${fmt.money(l.unitPrice)}</td>
        <td class="num">${fmt.money(l.amount)}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3"><strong>Total pesanan</strong></td><td class="num"><strong>${fmt.money(order.total)}</strong></td></tr></tfoot>
    </table>
    ${order.notes ? `<p class="note">${esc(order.notes)}</p>` : ''}
    <div style="display:flex;gap:40px;margin-top:34px;font-size:11px">
      <div style="flex:1;border-top:1px solid #172b3a;padding-top:6px">Dibuat oleh<br><strong>${esc(creator?.name ?? order.createdBy ?? 'Sistem')}</strong></div>
      <div style="flex:1;border-top:1px solid #172b3a;padding-top:6px">Disetujui pelanggan<br><strong>&nbsp;</strong></div>
    </div>
    <p class="note" style="margin-top:14px">Dokumen pesanan — bukan faktur. Stok dicadangkan saat pesanan dibuat dan keluar satu kali saat faktur diterbitkan.</p>`;
}

export function printPoHtml(db, po) {
  const supplier = byId(db.suppliers, po.supplierId);
  return `
    <h1>PURCHASE ORDER</h1>
    <p class="pill">${esc(po.id)} · ${esc(po.status)}</p>
    <div class="meta" style="margin-top:12px">
      <div><span>Pemasok</span><strong>${esc(supplier?.name)}</strong></div>
      <div><span>Kontak</span><strong>${esc(supplier?.contact ?? '—')} · ${esc(supplier?.phone ?? '')}</strong></div>
      <div><span>Tanggal</span><strong>${esc(po.date)}</strong></div>
      <div><span>Estimasi tiba</span><strong>${esc(po.expectedDate)}</strong></div>
      <div><span>Termin</span><strong>${esc(po.termsDays)} hari</strong></div>
      <div><span>Total</span><strong>${po.currency && po.currency !== 'IDR' ? `${esc(po.currency)} ${po.totalForeign.toLocaleString('id-ID')} ≈ ${fmt.money(po.total)}` : fmt.money(po.total)}</strong></div>
    </div>
    <table>
      <thead><tr><th>Barang</th><th class="num">Dipesan</th><th class="num">Diterima</th><th class="num">Harga</th><th class="num">Jumlah</th></tr></thead>
      <tbody>${po.lines.map((l) => `<tr>
        <td>${esc(l.description)}</td>
        <td class="num">${l.kind === 'fabric' ? fmt.m(l.qtyMm) : `${fmt.pcs(l.qtyPcs)} pcs`}</td>
        <td class="num">${l.kind === 'fabric' ? fmt.m(l.receivedMm) : `${fmt.pcs(l.receivedPcs)} pcs`}</td>
        <td class="num">${l.unitPrice.toLocaleString('id-ID')}${po.currency !== 'IDR' ? ` ${esc(po.currency)}<br><small>${fmt.money(l.unitCostIdr ?? l.unitPrice)}</small>` : ''}</td>
        <td class="num">${po.currency !== 'IDR'
          ? `${esc(po.currency)} ${(((l.qtyMm ? l.qtyMm / 1000 : l.qtyPcs) * l.unitPrice)).toLocaleString('id-ID')}<br><small>${fmt.money(Math.round((l.qtyMm ? l.qtyMm / 1000 : l.qtyPcs) * (l.unitCostIdr ?? l.unitPrice)))}</small>`
          : fmt.money(Math.round((l.qtyMm ? l.qtyMm / 1000 : l.qtyPcs) * l.unitPrice))}</td>
      </tr>`).join('')}</tbody>
    </table>
    ${po.note ? `<p class="note">${esc(po.note)}</p>` : ''}`;
}

export function printTaskTicketsHtml(db, tasks) {
  return tasks.map((task, index) => {
    const type = TASK_TYPE[task.type] ?? { label: task.type };
    const warehouse = byId(db.warehouses, task.warehouseId);
    const assignee = task.assigneeId ? byId(db.users, task.assigneeId) : null;
    const roll = task.rollId ? db.rolls.find((r) => r.id === task.rollId) : null;
    const project = task.projectId ? db.projects.find((p) => p.id === task.projectId) : null;
    return `<div class="task-ticket" style="border:2px solid #172b3a;border-radius:8px;padding:16px;max-width:640px;${index < tasks.length - 1 ? 'page-break-after:always;margin-bottom:18px' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px">
        <div><div class="brand">lavishome</div><small style="color:#62727c">TIKET TUGAS OPERASI</small></div>
        <div style="text-align:right"><strong style="font-family:ui-monospace,monospace;font-size:18px">${esc(task.id)}</strong><div style="font-size:10px;color:#62727c">${esc(TASK_STATUS[task.status]?.label ?? task.status)}</div></div>
      </div>
      <h1 style="margin:10px 0 2px">${esc(task.title)}</h1>
      <p class="pill">${esc(type.label)} · ${esc(warehouse?.name ?? '—')}</p>
      <div class="meta" style="margin-top:12px">
        <div><span>Petugas</span><strong>${esc(assignee?.name ?? '________________')}</strong></div>
        <div><span>Jatuh tempo</span><strong>${esc(task.dueDate)}</strong></div>
        <div><span>Prioritas</span><strong>${esc(PRIORITY[task.priority]?.label ?? task.priority)}</strong></div>
        <div><span>Dibuat</span><strong>${esc(task.createdAt ? new Date(task.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '—')}</strong></div>
        <div><span>Cetakan</span><strong>${esc(task.printCount ?? 0)}×</strong></div>
        <div><span>Gudang</span><strong>${esc(warehouse?.code ?? '—')}</strong></div>
      </div>
      ${task.qtyMm || roll || project ? `<table style="margin-top:6px">
        <thead><tr><th>Target</th><th>Referensi</th></tr></thead>
        <tbody><tr>
          <td>${task.qtyMm ? fmt.m(task.qtyMm) : '—'}</td>
          <td>${roll ? `Roll ${esc(roll.id)} · lot ${esc(roll.lot)}` : ''}${project ? `<br>${esc(project.name)}` : ''}${!roll && !project ? '—' : ''}</td>
        </tr></tbody>
      </table>` : ''}
      ${task.notes ? `<p class="note">${esc(task.notes)}</p>` : ''}
      <div style="margin-top:12px;font-size:11px">
        <strong>Checklist manual</strong>
        <div style="margin-top:6px">☐ Terima tiket &amp; periksa barang/roll</div>
        <div>☐ Mulai kerja — update “Mulai” di aplikasi</div>
        <div>☐ Selesai — update “Selesai” + catatan di aplikasi</div>
      </div>
      <div style="margin-top:12px;display:flex;gap:2px" aria-hidden="true">
        ${Array.from({ length: 48 }, (_, i) => `<i style="display:inline-block;width:${i % 4 === 0 ? 3 : i % 3 === 0 ? 2 : 1}px;height:30px;background:#172b3a"></i>`).join('')}
      </div>
      <div style="font-size:8px;color:#62727c;margin-top:3px">${esc(task.id)} · ${esc(task.type)} · dicetak ${esc(task.printCount ?? 0)}×</div>
      <div style="display:flex;gap:30px;margin-top:26px;font-size:10px">
        <div style="flex:1;border-top:1px solid #172b3a;padding-top:4px">Petugas / tanda tangan</div>
        <div style="flex:1;border-top:1px solid #172b3a;padding-top:4px">Supervisor</div>
      </div>
    </div>`;
  }).join('');
}

export function printSampleBookHtml(db, book) {
  const customer = byId(db.customers, book.customerId);
  return `
    <h1>BUKU SAMPLE</h1>
    <p class="pill">${esc(book.id)} · ${esc(book.status === 'given' ? 'Sudah diberikan' : 'Siap diberikan')}</p>
    <div class="meta" style="margin-top:12px">
      <div><span>Nama buku</span><strong>${esc(book.name)}</strong></div>
      <div><span>Pelanggan / prospek</span><strong>${esc(customer?.name ?? book.customerName)}</strong></div>
      <div><span>Tanggal</span><strong>${esc(book.date)}</strong></div>
      <div><span>Diberikan kepada</span><strong>${esc(book.givenTo || '—')}</strong></div>
      <div><span>Jumlah sample</span><strong>${book.items.length}</strong></div>
      <div><span>Dibuat oleh</span><strong>${esc(book.createdBy ?? '—')}</strong></div>
    </div>
    <table>
      <thead><tr><th>Koleksi / warna</th><th>Kode</th><th class="num">Ukuran</th><th>Sumber</th><th>Catatan</th></tr></thead>
      <tbody>${book.items.map((item) => {
        const sku = byId(db.skus, item.skuId);
        const collection = byId(db.collections, item.collectionId ?? sku?.collectionId);
        const roll = db.rolls.find((r) => r.id === item.rollId);
        const sample = db.samples.find((s) => s.id === item.sampleId);
        return `<tr>
          <td><span style="display:inline-block;width:18px;height:18px;border-radius:4px;background:${esc(sku?.swatch || '#e4ded2')};border:1px solid #cfc6b6;vertical-align:middle;margin-right:6px"></span><strong>${esc(collection?.name ?? sku?.collectionName)}${item.pieces ? '' : ` ${esc(sku?.colourName || sku?.colourCode || '')}`}</strong></td>
          <td>${esc(item.stockId ? collection?.clothType ?? '' : sku?.code ?? '')}</td>
          <td class="num">${item.pieces ? `${item.pieces} pcs` : fmt.m(item.qtyMm)}</td>
          <td>${esc(item.stockId ? `Stok sample ${item.stockId}` : `${item.rollId ?? ''} · ${roll?.lot ?? ''}`)}</td>
          <td>${esc(sample?.notes ?? '')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    ${book.notes ? `<p class="note">${esc(book.notes)}</p>` : ''}
    <p class="note">Buku sample fisik berisi potongan kain dari roll di atas. Stok fisik sudah berkurang saat sample dibuat. Bukan faktur.</p>
    <div style="display:flex;gap:40px;margin-top:34px;font-size:10px">
      <div style="flex:1;border-top:1px solid #172b3a;padding-top:4px">Dibuat oleh<br><strong>${esc(book.createdBy ?? '')}</strong></div>
      <div style="flex:1;border-top:1px solid #172b3a;padding-top:4px">Diterima<br><strong>${book.givenTo ? esc(book.givenTo) : '&nbsp;'}</strong></div>
    </div>`;
}

export function printCatalogHtml(db, items) {
  const groups = (db.collections ?? []).filter((c) => items.some((s) => s.collectionId === c.id));
  return `
    <h1>KATALOG KOLEKSI</h1>
    <p class="pill">Lavishome · ${new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}</p>
    <p class="note" style="margin-top:10px">Harga per meter. Ketersediaan warna dan lot dapat berubah; konfirmasi stok sebelum order.</p>
    ${groups.map((collection) => `
      <h2>${esc(collection.name)}</h2>
      <table>
        <thead><tr><th>Warna</th><th>Kode</th><th class="num">Lebar</th><th class="num">Harga / m</th><th class="num">Tersedia</th></tr></thead>
        <tbody>${items.filter((s) => s.collectionId === collection.id).map((sku) => {
          const available = db.rolls
            .filter((r) => r.skuId === sku.id && r.status === 'available' && !r.transit)
            .reduce((a, r) => a + Math.max(0, r.currentMm - (r.reservedMm || 0)), 0);
          return `<tr>
            <td><span style="display:inline-block;width:22px;height:22px;border-radius:5px;background:${esc(sku.swatch || '#e4ded2')};border:1px solid #cfc6b6;vertical-align:middle;margin-right:8px"></span><strong>${esc(sku.colourName || sku.colourCode)}</strong></td>
            <td class="mono">${esc(sku.code)}</td>
            <td class="num">${sku.widthCm ? `${sku.widthCm} cm` : '—'}</td>
            <td class="num">${fmt.money(sku.sellPrice)}</td>
            <td class="num">${fmt.m(available)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`).join('')}
    <p class="note">Katalog demo - harga dan stok dapat berubah. Hubungi sales Lavishome untuk sample fisik dan penawaran.</p>`;
}

export function printInstructionsHtml(db, project) {
  const customer = byId(db.customers, project.customerId);
  return `
    <h1>INSTRUKSI POTONG & PACKING</h1>
    <p class="pill">${esc(project.id)} · ${esc(project.name)}</p>
    <div class="meta" style="margin-top:12px">
      <div><span>Pelanggan</span><strong>${esc(customer?.name)}</strong></div>
      <div><span>Lokasi</span><strong>${esc(project.location || '—')}</strong></div>
      <div><span>Target</span><strong>${esc(project.targetDate)}</strong></div>
    </div>
    <h2>Material</h2>
    <table>
      <thead><tr><th>Barang</th><th class="num">Jumlah</th><th>Roll / lot</th></tr></thead>
      <tbody>${project.requirements.map((req) => {
        const sku = req.kind === 'fabric' ? byId(db.skus, req.skuId) : null;
        const part = req.kind === 'part' ? byId(db.parts, req.partId) : null;
        return `<tr>
          <td>${esc(sku ? `${sku.collectionName} ${sku.colourName || sku.colourCode} (${sku.code})` : part?.name)}</td>
          <td class="num">${req.kind === 'fabric' ? fmt.m(req.qtyMm) : `${fmt.pcs(req.qtyPcs)} pcs`}</td>
          <td>${req.kind === 'fabric' ? req.allocations.map((a) => `${esc(a.rollId)} (${fmt.m(a.qtyMm)})`).join(', ') : esc(req.warehouseId)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    <h2>Instruksi</h2>
    <p class="note" style="white-space:pre-wrap">${esc(project.instructions || 'Tidak ada instruksi khusus.')}</p>
    <p class="note" style="margin-top:10px">Catatan proyek: ${esc(project.notes || '—')}</p>`;
}

export function printOpnameHtml(db, session) {
  return `
    <h1>BERITA ACARA STOCK OPNAME</h1>
    <p class="pill">${esc(session.id)} · ${esc(session.warehouseId)}</p>
    <div class="meta" style="margin-top:12px">
      <div><span>Gudang</span><strong>${esc(whName(db, session.warehouseId))}</strong></div>
      <div><span>Mulai</span><strong>${esc(session.startedDate)}</strong></div>
      <div><span>Diposting</span><strong>${esc(session.postedAt ? new Date(session.postedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '—')}</strong></div>
    </div>
    <table>
      <thead><tr><th>Roll</th><th class="num">Sistem</th><th class="num">Hitungan</th><th class="num">Selisih</th></tr></thead>
      <tbody>${session.lines.map((l) => `<tr>
        <td>${esc(l.rollId)}</td><td class="num">${fmt.m(l.expectedMm)}</td>
        <td class="num">${l.countedMm === null ? '—' : fmt.m(l.countedMm)}</td>
        <td class="num">${l.countedMm === null ? '—' : fmt.m(l.countedMm - l.expectedMm, { signed: true })}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="note">Alasan persetujuan: ${esc(session.approveReason || '—')}</p>`;
}
