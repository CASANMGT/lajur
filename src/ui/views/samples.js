/** Sample & Deposit — dedicated customer-sample and deposit workspace. */

import {
  esc, icon, fmt, badge, toast, openModal, field, imageToDataUrl, confirmAction,
} from '../dom.js';
import { byId, todayJakarta } from '../../domain/core.js';
import {
  SAMPLE_MODE, createSample, createSampleRequest, decideSampleRequest, deleteSampleStock, depositBalance,
  linkSampleToInvoice, procureSampleStock, refundDeposit, sampleCollectionStats, sampleCustomerStats,
  updateSampleStock,
} from '../../domain/crm.js';
import { settingsOf } from '../../domain/settings.js';
import { pageHead, statCard, can, warehouseOf, warehouseOptions } from './common.js';


let filter = { history: 'all', stock: 'all' };

export function render(ctx) {
  const { db, role, user } = ctx;
  const samples = db.samples
    .filter((s) => filter.history === 'all'
      || (filter.history === 'converted' && s.linkedInvoiceId)
      || (filter.history === 'unconverted' && !s.linkedInvoiceId))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const active = db.samples.filter((s) => s.status === 'active').length;
  const converted = db.samples.filter((s) => s.status === 'converted').length;
  const rate = db.samples.length ? Math.round((converted / db.samples.length) * 100) : 0;
  const deposits = db.deposits.filter((d) => d.kind === 'sample' || d.kind === 'indent');
  const openDeposit = deposits.reduce((a, d) => a + depositBalance(d), 0);
  const collectionStats = sampleCollectionStats(db);
  const customerStats = sampleCustomerStats(db).filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total || String(b.lastDate).localeCompare(String(a.lastDate)));
  const stocks = (db.sampleStocks ?? []).filter((s) => s.active !== false);
  const filteredStocks = stocks.filter((s) => filter.stock === 'all'
    || (filter.stock === 'available' && s.qty > 0)
    || (filter.stock === 'unavailable' && s.qty <= 0));
  const stockTotal = stocks.reduce((a, s) => a + (Number(s.qty) || 0), 0);
  const requests = (db.sampleRequests ?? [])
    .filter((r) => r.fromCompanyId === ctx.companyId || r.toCompanyId === ctx.companyId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return `
    ${pageHead({
      eyebrow: 'CRM',
      title: 'Buku Sample & Deposit',
      sub: 'Stok buku sample dari pabrik per koleksi. Deposit adalah kewajiban, bukan omzet.',
      actions: `${can(role, 'sample.create') ? `<button class="btn" type="button" data-act="procure-sample">${icon('plus')} Buku sample pabrik</button>` : ''}`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Buku sample aktif', value: String(active), meta: `${db.samples.length} total buku sample`, tone: 'accent', iconName: 'spark' })}
      ${statCard({ label: 'Konversi', value: `${rate}%`, meta: `${converted} berujung pembelian` })}
      ${statCard({ label: 'Stok buku sample', value: String(stockTotal), meta: `${stocks.length} koleksi siap`, iconName: 'layers' })}
      ${statCard({ label: 'Deposit terbuka', value: fmt.money(openDeposit), meta: `${deposits.filter((d) => depositBalance(d) > 0).length} saldo aktif`, tone: 'warn', iconName: 'wallet' })}
      ${statCard({ label: 'Refund tercatat', value: fmt.money(deposits.reduce((a, d) => a + d.refunded, 0)), meta: 'Tidak boleh melebihi saldo' })}
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><div><h2>Katalog & stok buku sample</h2><p>Buku sample diprocure dari pabrik per koleksi, bukan dipotong dari roll. Harga, deposit, dan jumlah stok tersedia untuk pelanggan.</p></div><span class="badge no-dot">${stockTotal} pcs</span></div>
      <div class="card-pad" style="padding-top:0">
        <div class="row" style="margin-bottom:10px">
          ${[['all', 'Semua stok'], ['available', 'Tersedia'], ['unavailable', 'Habis / tidak tersedia']].map(([k, label]) => `<button class="chip" type="button" data-stock-filter="${k}" aria-pressed="${filter.stock === k}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Koleksi / tipe</th><th class="num">Harga buku sample</th><th class="num">Deposit</th><th class="num">Stok</th><th class="num">Minimum</th><th>Lokasi</th><th>Status</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${filteredStocks.map((s) => {
          const collection = byId(db.collections, s.collectionId);
          const warehouse = warehouseOf(db, s.warehouseId);
          const stockCompany = byId(db.companies, s.companyId ?? warehouse?.companyId);
          return `<tr>
            <td><div class="cell-main">
              ${s.photo
                ? `<img src="${esc(s.photo)}" alt="Foto buku sample ${esc(collection?.name ?? '')}" class="thumb zoomable" data-zoom="${esc(s.photo)}" data-zoom-title="Buku sample ${esc(collection?.name ?? '')}" role="button" tabindex="0" aria-label="Perbesar foto buku sample ${esc(collection?.name ?? '')}" />`
                : `<span class="thumb thumb-empty">${icon('package')}</span>`}
              <div class="txt"><strong class="small">${esc(collection?.name ?? '—')}</strong><div class="xs muted">${esc(collection?.motive || collection?.clothType || '—')} · ${esc(collection?.defaultRollLengthM ?? 60)} m × ${esc(collection?.defaultWidthCm ?? 300)} cm</div></div>
            </div></td>
            <td class="num">${fmt.money(s.samplePrice ?? collection?.samplePrice ?? 0)}</td>
            <td class="num">${fmt.money(s.sampleDeposit ?? collection?.sampleDeposit ?? 0)}<div class="xs muted">refundable</div></td>
            <td class="num strong">${s.qty}</td>
            <td class="num">${s.minQty ?? 1}</td>
            <td class="small">${esc(warehouse?.name ?? s.location ?? '—')}<div class="xs muted">${esc(stockCompany?.name ?? '—')} · ${esc(s.location || '')}</div></td>
            <td>${s.qty <= 0 ? badge('Habis', 'danger') : s.qty <= (s.minQty ?? 1) ? badge('Menipis', 'warn') : badge('Tersedia', 'ok')}</td>
            <td class="right"><div class="row" style="justify-content:flex-end;flex-wrap:wrap">
              ${s.qty > 0 && can(role, 'sample.create') && (s.companyId ?? warehouse?.companyId) !== ctx.companyId ? `<button class="btn btn-sm" type="button" data-request-sample="${s.id}">${icon('transfer')} Minta sample</button>` : ''}
              ${s.qty > 0 && can(role, 'sample.create') ? `<button class="btn btn-sm btn-primary" type="button" data-give-stock="${s.id}">Beri buku sample</button>` : ''}
              ${role === 'manager' ? `<button class="btn btn-sm" type="button" data-edit-stock="${s.id}">Edit</button><button class="btn btn-sm btn-danger" type="button" data-delete-stock="${s.id}">Hapus</button>` : ''}
              <button class="btn btn-sm" type="button" data-procurement="${s.id}">Riwayat</button>
            </div></td>
          </tr>`;
        }).join('') || `<tr><td colspan="8"><div class="empty">${icon('layers')}<strong>Belum ada stok buku sample</strong><p>Tambah buku sample koleksi dari pabrik.</p></div></td></tr>`}</tbody>
      </table></div>
    </section>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><div><h2>Permintaan sample antar-PT</h2><p>Bali dapat meminta stok sample Jakarta, gratis atau berbayar. PT pemilik menyetujui, lalu stok berpindah ke Bali.</p></div><span class="badge no-dot">${requests.length}</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Tanggal</th><th>Dari</th><th>Ke</th><th>Koleksi</th><th class="num">Qty</th><th>Harga</th><th>Status</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${requests.map((r) => {
          const from = byId(db.companies, r.fromCompanyId);
          const to = byId(db.companies, r.toCompanyId);
          const collection = byId(db.collections, r.collectionId);
          return `<tr>
            <td class="small">${esc(r.date)}<div class="xs muted">${esc(r.requestedByName || '')}</div></td>
            <td class="small">${esc(from?.name ?? r.fromCompanyId)}</td>
            <td class="small">${esc(to?.name ?? r.toCompanyId)}</td>
            <td class="small">${esc(collection?.name ?? r.collectionId)}</td>
            <td class="num">${r.qty} pcs</td>
            <td class="small">${r.pricing === 'paid' ? fmt.money(r.amount) : 'Gratis'}</td>
            <td>${badge(r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu', r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'danger' : 'warn')}</td>
            <td class="right">${r.status === 'requested' && r.fromCompanyId === ctx.companyId && role === 'manager' ? `<div class="row" style="justify-content:flex-end"><button class="btn btn-sm btn-primary" data-approve-sample="${r.id}">Setujui</button><button class="btn btn-sm btn-danger" data-reject-sample="${r.id}">Tolak</button></div>` : ''}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="8"><div class="empty">${icon('transfer')}<strong>Belum ada permintaan sample</strong><p>Gunakan tombol Minta sample pada stok PT lain.</p></div></td></tr>`}</tbody>
      </table></div>
    </section>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head"><div><h2>Ringkasan buku sample pelanggan</h2><p>Berapa buku sample yang diambil, berapa yang berujung pembelian, dan total pembelian pelanggan.</p></div><span class="badge no-dot">${customerStats.length}</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Pelanggan</th><th class="num">Buku sample</th><th class="num">Belum beli</th><th class="num">Konversi</th><th class="num">Pembelian</th><th>Terakhir</th></tr></thead>
        <tbody>${customerStats.map((s) => `<tr data-href="#/pelanggan/${s.customer.id}" tabindex="0" role="link">
          <td><strong class="small">${esc(s.customer.name)}</strong><div class="xs muted">${esc(s.customer.company || s.customer.city || '')}</div></td>
          <td class="num">${s.total}<div class="xs muted">${s.pieces ? `${s.pieces} pcs` : fmt.m(s.qtyMm)}</div></td>
          <td class="num">${s.active}</td>
          <td class="num">${s.converted}</td>
          <td class="num">${fmt.money(s.purchases)}<div class="xs muted">${s.invoices} faktur</div></td>
          <td class="small">${esc(s.lastDate || '—')}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada distribusi buku sample.</td></tr>'}</tbody>
      </table></div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Riwayat distribusi buku sample</h2><p>Koleksi, pelanggan, jenis, nomor stok, dan hasil konversi.</p></div><span class="badge no-dot">${samples.length}</span></div>
      <div class="card-pad" style="padding-top:0">
        <div class="row" style="margin-bottom:10px">
          ${[['all', 'Semua'], ['converted', 'Terkonversi'], ['unconverted', 'Belum konversi']].map(([k, label]) => `<button class="chip" type="button" data-history-filter="${k}" aria-pressed="${filter.history === k}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="table-wrap desktop-table">
        <table class="data">
          <thead><tr><th>Buku sample</th><th>Pelanggan</th><th>Koleksi</th><th class="num">Qty</th><th>Stok / sumber</th><th>Jenis</th><th>Hasil</th><th><span class="sr-only">Aksi</span></th></tr></thead>
          <tbody>${samples.map((s) => {
            const sku = byId(db.skus, s.skuId);
            const collection = byId(db.collections, s.collectionId ?? sku?.collectionId);
            const customer = byId(db.customers, s.customerId);
            const roll = db.rolls.find((r) => r.id === s.rollId);
            return `<tr>
              <td class="mono">${esc(s.id)}<div class="xs muted">${esc(s.date)}</div></td>
              <td><a class="small" href="#/pelanggan/${s.customerId}">${esc(customer?.name ?? '—')}</a></td>
              <td><strong class="small">${esc(collection?.name ?? sku?.collectionName)} ${s.stockId ? '· buku sample koleksi' : esc(sku?.colourName || sku?.colourCode || '')}</strong><div class="xs muted">${esc(collection?.clothType ?? sku?.clothType ?? '')}${s.stockId ? '' : ` · ${esc(sku?.code ?? '')}`}</div></td>
              <td class="num">${s.stockId ? '1 pcs' : fmt.m(s.qtyMm)}</td>
              <td>${s.rollId ? `<a class="mono xs" href="#/stok/${s.rollId}">${esc(s.rollId)}</a>` : `<span class="mono xs">${esc(s.stockId ?? '—')}</span>`}<div class="xs muted">${esc(roll?.lot ?? (s.stockId ? 'stok buku sample pabrik' : 'stok buku sample'))}</div></td>
              <td>${badge(SAMPLE_MODE[s.mode].label, SAMPLE_MODE[s.mode].tone)}</td>
              <td>${s.linkedInvoiceId ? `<a class="xs strong" href="#/penjualan/${s.linkedInvoiceId}">${esc(s.linkedInvoiceId)}</a>` : badge('Belum beli', 'muted')}</td>
              <td class="right">${!s.linkedInvoiceId && can(role, 'sample.create') ? `<button class="btn btn-sm" type="button" data-link="${s.id}">Kaitkan</button>` : ''}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="8"><div class="empty">${icon('spark')}<strong>Belum ada buku sample</strong></div></td></tr>`}</tbody>
        </table>
      </div>
      <div class="mobile-cards">
        ${samples.map((s) => {
          const sku = byId(db.skus, s.skuId);
          const collection = byId(db.collections, s.collectionId ?? sku?.collectionId);
          const customer = byId(db.customers, s.customerId);
          return `<div class="roll-card">
            <div class="top"><span class="id">${esc(s.id)}</span>${badge(SAMPLE_MODE[s.mode].label, SAMPLE_MODE[s.mode].tone)}</div>
            <div class="small strong">${esc(customer?.name ?? '')}</div>
            <div class="xs muted">${esc(collection?.name ?? sku?.collectionName)} · ${s.stockId ? '1 pcs' : fmt.m(s.qtyMm)} · ${esc(s.stockId || s.rollId || '—')}</div>
            <div class="row" style="margin-top:4px">${s.linkedInvoiceId ? badge(`Terkonversi ${s.linkedInvoiceId}`, 'ok') : badge('Belum beli', 'muted')} ${!s.linkedInvoiceId && can(role, 'sample.create') ? `<button class="btn btn-sm" type="button" data-link="${s.id}">Kaitkan</button>` : ''}</div>
          </div>`;
        }).join('') || `<div class="empty">${icon('spark')}<strong>Belum ada buku sample</strong></div>`}
      </div>
    </section>

    <div class="section-title"><h2>Deposit pelanggan</h2><span class="small muted">Saldo = nominal − dipakai − direfund</span></div>
    <section class="card">
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Deposit</th><th>Pelanggan</th><th>Jenis</th><th class="num">Nominal</th><th class="num">Saldo</th><th>Ledger</th><th><span class="sr-only">Aksi</span></th></tr></thead>
          <tbody>${deposits.map((d) => {
            const customer = byId(db.customers, d.customerId);
            const balance = depositBalance(d);
            return `<tr>
              <td class="mono">${esc(d.id)}<div class="xs muted">${esc(d.receivedAt)}</div></td>
              <td><a class="small" href="#/pelanggan/${d.customerId}">${esc(customer?.name ?? '—')}</a></td>
              <td>${badge(d.kind === 'sample' ? 'Buku sample' : 'Indent', d.kind === 'sample' ? 'copper' : 'info')}</td>
              <td class="num">${fmt.money(d.amount)}</td>
              <td class="num ${balance ? 'strong' : 'muted'}">${fmt.money(balance)}</td>
              <td class="xs muted">${d.ledger.map((l) => `${l.type} ${fmt.money(l.amount)}`).join(' · ')}</td>
              <td class="right">${balance > 0 && (d.kind === 'sample' ? can(role, 'deposit.create') : role === 'manager') ? `<button class="btn btn-sm" type="button" data-refund="${d.id}">Refund</button>` : ''}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="7"><div class="empty">${icon('wallet')}<strong>Belum ada deposit</strong></div></td></tr>`}</tbody>
        </table>
      </div>
    </section>

    <div class="notice notice-info" style="margin-top:14px">${icon('alert')}<div><strong>Aturan.</strong> Buku sample adalah stok pabrik per koleksi dan tidak memotong roll. Deposit buku sample hanya dapat direfund setelah ada pembelian terkait. Deposit indent memerlukan persetujuan manajer.</div></div>`;
}

/* -------------------------------------------------------------------------- */

function openLink(ctx, sample) {
  const invoices = ctx.db.invoices.filter((i) => i.customerId === sample.customerId && i.status === 'posted' && i.date >= sample.date);
  if (!invoices.length) {
    toast('Belum ada faktur terbit setelah tanggal buku sample.', { tone: 'error' });
    return;
  }
  openModal({
    title: `Kaitkan ${sample.id}`,
    body: field('Faktur', `<select class="select" name="invoice">${invoices.map((i) => `<option value="${i.id}">${esc(i.id)} · ${fmt.money(i.total)} · ${esc(i.date)}</option>`).join('')}</select>`),
    onSubmit(form, close) {
      ctx.store.update((db) => linkSampleToInvoice(db, { sampleId: sample.id, invoiceId: form.invoice.value, user: ctx.user }));
      close();
      toast('Buku sample dikaitkan ke pembelian.', { tone: 'success' });
    },
  });
}

function openRefund(ctx, deposit) {
  const balance = depositBalance(deposit);
  openModal({
    title: `Refund ${deposit.id}`,
    description: `Saldo ${fmt.money(balance)} · ${deposit.kind}`,
    submitLabel: 'Proses refund',
    body: `
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" value="${balance}" />`)}
      ${field('Alasan', `<input class="input" name="reason" placeholder="Wajib diisi" />`)}
      ${deposit.kind === 'sample' ? `<div class="notice notice-warn" style="margin-top:10px">${icon('alert')}<div>Refund buku sample memerlukan pembelian yang sudah dikaitkan.</div></div>` : ''}
    `,
    onSubmit(form, close) {
      ctx.store.update((db) => refundDeposit(db, {
        depositId: deposit.id,
        amount: Number(String(form.amount.value).replace(/\D/g, '')),
        reason: form.reason.value,
        user: ctx.user,
      }));
      close();
      toast('Refund dicatat pada ledger deposit.', { tone: 'success' });
    },
  });
}

function openProcureSample(ctx) {
  const collections = ctx.db.collections.filter((c) => ctx.db.skus.some((s) => s.collectionId === c.id));
  if (!collections.length) {
    toast('Belum ada koleksi kain.', { tone: 'error' });
    return;
  }
  const suppliers = ctx.db.suppliers ?? [];
  openModal({
    title: 'Buku sample dari pabrik',
    description: 'Catat procurement buku sample koleksi dari pabrik. Buku sample masuk stok showroom; tidak memotong roll jual.',
    submitLabel: 'Simpan procurement',
    body: `<div class="form-grid">
      ${field('Koleksi', `<select class="select" name="collection">${collections.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.clothType)} · harga ${fmt.money(c.samplePrice || 0)} / deposit ${fmt.money(c.sampleDeposit || 0)}</option>`).join('')}</select>`, { full: true })}
      ${field('Jumlah buku sample (pcs)', `<input class="input" name="qty" inputmode="numeric" value="1" />`)}
      ${field('Harga pokok / buku sample (Rp)', `<input class="input" name="unitCost" inputmode="numeric" placeholder="0" />`)}
      ${field('Pemasok / pabrik', `<select class="select" name="supplier"><option value="">— Tanpa pemasok —</option>${suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>`)}
      ${field('Tanggal terima', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      ${field('Gudang lokasi', `<select class="select" name="warehouse">${warehouseOptions(ctx.db, ctx.db.warehouses.find((w) => w.active !== false)?.id)}</select>`)}
      ${field('Detail lokasi / showroom', `<input class="input" name="location" placeholder="Showroom Jakarta" />`)}
      ${field('Catatan', `<input class="input" name="notes" placeholder="Nomor pengiriman, warna, batch pabrik" />`, { full: true })}
      ${field('Foto buku sample', `<input class="input" type="file" name="photo" accept="image/*" />`, { full: true, hint: 'Foto sampul/buku sample agar mudah dikenali. Maksimal 800 KB.' })}
    </div>`,
    async onSubmit(form, close) {
      const qty = Number(form.qty.value || 0);
      if (!(qty > 0)) throw new Error('Jumlah buku sample harus lebih dari 0 pcs.');
      const file = form.photo?.files?.[0];
      const photo = file ? await imageToDataUrl(file, { maxBytes: 800_000 }) : '';
      ctx.store.update((db) => procureSampleStock(db, {
        collectionId: form.collection.value,
        qty,
        unitCost: Number(String(form.unitCost.value).replace(/\D/g, '')) || 0,
        supplierId: form.supplier.value || null,
        date: form.date.value,
        notes: form.notes.value,
        warehouseId: form.warehouse.value,
        location: form.location.value,
        photo,
        user: ctx.user,
      }));
      close();
      toast('Procurement buku sample pabrik dicatat; stok buku sample koleksi bertambah.', { tone: 'success' });
    },
  });
}

function openProcurementHistory(ctx, stock) {
  const collection = byId(ctx.db.collections, stock.collectionId);
  const history = (stock.procurements ?? []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  openModal({
    title: `Riwayat procurement ${collection?.name ?? stock.collectionId}`,
    description: 'Semua buku sample koleksi ini berasal dari pabrik, bukan potongan roll.',
    submitLabel: 'Tutup',
    wide: true,
    body: `<div class="table-wrap"><table class="data">
      <thead><tr><th>Tanggal</th><th class="num">Qty</th><th class="num">Harga / pcs</th><th class="num">Total</th><th>Pemasok</th><th>Catatan</th></tr></thead>
      <tbody>${history.map((p) => `<tr>
        <td>${esc(p.date)}</td>
        <td class="num">${p.qty}</td>
        <td class="num">${fmt.money(p.unitCost)}</td>
        <td class="num">${fmt.money(p.totalCost)}</td>
        <td class="small">${esc(byId(ctx.db.suppliers, p.supplierId)?.name ?? '—')}</td>
        <td class="small">${esc(p.notes || '—')}<div class="xs muted">${esc(p.createdBy ?? '')}</div></td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada procurement.</td></tr>'}</tbody>
    </table></div>`,
    onSubmit(form, close) { close(); },
  });
}

function openEditStock(ctx, stock) {
  const collection = byId(ctx.db.collections, stock.collectionId);
  const warehouses = ctx.db.warehouses.filter((w) => w.active !== false);
  openModal({
    title: `Edit buku sample ${collection?.name ?? ''}`,
    description: 'Koreksi stok, harga, deposit, minimum, dan lokasi gudang buku sample.',
    submitLabel: 'Simpan buku sample',
    body: `<div class="form-grid">
      ${field('Jumlah stok (pcs)', `<input class="input" name="qty" inputmode="numeric" value="${stock.qty}" />`)}
      ${field('Harga buku sample / pcs', `<input class="input" name="samplePrice" inputmode="numeric" value="${stock.samplePrice ?? collection?.samplePrice ?? 0}" />`)}
      ${field('Deposit refundable / pcs', `<input class="input" name="sampleDeposit" inputmode="numeric" value="${stock.sampleDeposit ?? collection?.sampleDeposit ?? 0}" />`)}
      ${field('Minimum stok', `<input class="input" name="sampleMin" inputmode="numeric" value="${stock.minQty ?? collection?.sampleMin ?? 1}" />`)}
      ${field('Gudang lokasi', `<select class="select" name="warehouse">${warehouseOptions(ctx.db, stock.warehouseId || warehouses[0]?.id)}</select>`)}
      ${field('Detail lokasi / showroom', `<input class="input" name="location" value="${esc(stock.location ?? '')}" placeholder="Showroom Jakarta" />`)}
      ${field('Foto buku sample (ganti)', `<input class="input" type="file" name="photo" accept="image/*" />`, { full: true, hint: 'Maksimal 800 KB. Foto saat ini tetap dipakai jika tidak memilih file baru.' })}
      ${stock.photo ? `<div class="span-2 row" style="align-items:center;gap:10px"><img src="${esc(stock.photo)}" alt="Foto buku sample" class="thumb" data-zoom="${esc(stock.photo)}" data-zoom-title="Foto buku sample" role="button" tabindex="0" /><label class="checkline"><input type="checkbox" name="removePhoto" /> Hapus foto buku sample</label></div>` : ''}
    </div>`,
    async onSubmit(form, close) {
      const qty = Number(form.qty.value || 0);
      if (qty < 0) throw new Error('Stok tidak boleh negatif.');
      const file = form.photo?.files?.[0];
      const photo = file ? await imageToDataUrl(file, { maxBytes: 800_000 }) : '';
      ctx.store.update((db) => updateSampleStock(db, {
        id: stock.id,
        qty,
        samplePrice: Number(String(form.samplePrice.value).replace(/\D/g, '')) || 0,
        sampleDeposit: Number(String(form.sampleDeposit.value).replace(/\D/g, '')) || 0,
        minQty: Number(String(form.sampleMin.value).replace(/\D/g, '')) || 0,
        warehouseId: form.warehouse.value,
        location: form.location.value,
        photo,
        removePhoto: Boolean(form.removePhoto?.checked),
        user: ctx.user,
      }));
      close();
      toast('Stok dan harga buku sample diperbarui.', { tone: 'success' });
    },
  });
}

function openSampleRequest(ctx, stock) {
  const collection = byId(ctx.db.collections, stock.collectionId);
  const source = byId(ctx.db.companies, stock.companyId ?? warehouseOf(ctx.db, stock.warehouseId)?.companyId);
  openModal({
    title: `Minta sample ${collection?.name ?? ''}`,
    description: `Stok ${source?.name ?? 'PT lain'} akan dikirim ke gudang PT Anda setelah disetujui.`,
    submitLabel: 'Kirim permintaan',
    body: `
      ${field('Jumlah (pcs)', `<input class="input" name="qty" inputmode="numeric" value="1" />`, { hint: `Tersedia ${stock.qty} pcs.` })}
      ${field('Harga', `<select class="select" name="pricing"><option value="free">Gratis</option><option value="paid">Berbayar</option></select>`)}
      ${field('Nominal berbayar (Rp)', `<input class="input" name="amount" inputmode="numeric" value="0" />`)}
      ${field('Catatan', `<input class="input" name="note" placeholder="Kebutuhan sample / customer" />`, { full: true })}
    `,
    onMount(form) {
      form.pricing.addEventListener('change', () => {
        form.amount.disabled = form.pricing.value !== 'paid';
      });
      form.amount.disabled = true;
    },
    onSubmit(form, close) {
      ctx.store.update((db) => createSampleRequest(db, {
        stockId: stock.id,
        qty: Number(form.qty.value || 0),
        pricing: form.pricing.value,
        amount: Number(String(form.amount.value).replace(/\D/g, '')) || 0,
        note: form.note.value,
        user: ctx.user,
      }));
      close();
      toast('Permintaan sample dikirim ke PT pemilik stok.', { tone: 'success' });
    },
  });
}

function openGiveStock(ctx, stock) {
  const collection = byId(ctx.db.collections, stock.collectionId);
  const customers = ctx.db.customers.filter((c) => c.stage !== 'dormant');
  if (!customers.length) {
    toast('Belum ada pelanggan untuk menerima buku sample.', { tone: 'error' });
    return;
  }
  const samplePrice = stock.samplePrice ?? collection?.samplePrice ?? 0;
  const sampleDeposit = stock.sampleDeposit ?? collection?.sampleDeposit ?? 0;
  openModal({
    title: `Beri buku sample ${collection?.name ?? ''}`,
    description: 'Buku sample koleksi dari pabrik. Stok berkurang satu pcs; free/deposit/refundable mengikuti aturan yang ada.',
    submitLabel: 'Beri buku sample',
    body: `<div class="form-grid">
      <div class="span-2 notice notice-info">${icon('spark')}<div><strong>${esc(collection?.name ?? '')} · ${esc(collection?.clothType ?? '')}</strong><div class="small">${esc(warehouseOf(ctx.db, stock.warehouseId)?.name ?? stock.location ?? '—')} · stok ${stock.qty} pcs · harga buku sample ${fmt.money(samplePrice)} · deposit refundable ${fmt.money(sampleDeposit)}</div></div></div>
      ${field('Pelanggan', `<select class="select" name="customer">${customers.map((c) => `<option value="${c.id}">${esc(c.name)}${c.company ? ` - ${esc(c.company)}` : ''}</option>`).join('')}</select>`)}
      ${field('Tanggal', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      ${field('Jenis buku sample', `<select class="select" name="mode"><option value="free">Gratis</option><option value="paid">Berbayar</option><option value="deposit">Deposit refundable</option></select>`)}
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" value="0" />`, { hint: 'Kosongkan untuk memakai harga buku sample/deposit koleksi.' })}
      ${field('Catatan', `<input class="input" name="notes" placeholder="Permintaan customer, ruangan, follow-up" />`, { full: true })}
    </div>`,
    onMount(form) {
      const syncAmount = () => {
        form.amount.value = form.mode.value === 'paid' ? samplePrice : form.mode.value === 'deposit' ? sampleDeposit : 0;
      };
      form.mode.addEventListener('change', syncAmount);
    },
    onSubmit(form, close) {
      const mode = form.mode.value;
      const amount = Number(String(form.amount.value).replace(/\D/g, '')) || 0;
      ctx.store.update((db) => createSample(db, {
        customerId: form.customer.value,
        fromStockId: stock.id,
        mode,
        amount,
        date: form.date.value,
        notes: form.notes.value,
        user: ctx.user,
      }));
      close();
      toast('Buku sample diberikan; stok buku sample dan riwayat pelanggan diperbarui.', { tone: 'success' });
    },
  });
}

export function mount(ctx) {
  document.querySelectorAll('[data-stock-filter]').forEach((btn) => btn.addEventListener('click', () => {
    filter.stock = btn.dataset.stockFilter;
    ctx.store.emit();
  }));
  document.querySelectorAll('[data-history-filter]').forEach((btn) => btn.addEventListener('click', () => {
    filter.history = btn.dataset.historyFilter;
    ctx.store.emit();
  }));
  document.querySelector('[data-act="procure-sample"]')?.addEventListener('click', () => openProcureSample(ctx));
  document.querySelectorAll('[data-procurement]').forEach((btn) => btn.addEventListener('click', () => {
    const stock = (ctx.db.sampleStocks ?? []).find((s) => s.id === btn.dataset.procurement);
    if (stock) openProcurementHistory(ctx, stock);
  }));
  document.querySelectorAll('[data-edit-stock]').forEach((btn) => btn.addEventListener('click', () => {
    const stock = (ctx.db.sampleStocks ?? []).find((s) => s.id === btn.dataset.editStock);
    if (stock) openEditStock(ctx, stock);
  }));
  document.querySelectorAll('[data-delete-stock]').forEach((btn) => btn.addEventListener('click', async () => {
    const stock = (ctx.db.sampleStocks ?? []).find((s) => s.id === btn.dataset.deleteStock);
    if (!stock) return;
    const collection = byId(ctx.db.collections, stock.collectionId);
    const ok = await confirmAction({
      title: `Hapus buku sample ${collection?.name ?? ''}?`,
      message: 'Buku sample dihapus dari katalog stok. Riwayat distribusi ke pelanggan tetap tersimpan.',
      confirmLabel: 'Hapus buku sample',
      danger: true,
    });
    if (!ok) return;
    ctx.store.update((db) => deleteSampleStock(db, { id: stock.id, user: ctx.user }));
    toast('Buku sample dihapus dari katalog.', { tone: 'success' });
  }));
  document.querySelectorAll('[data-give-stock]').forEach((btn) => btn.addEventListener('click', () => {
    const stock = (ctx.db.sampleStocks ?? []).find((s) => s.id === btn.dataset.giveStock);
    if (stock) openGiveStock(ctx, stock);
  }));
  document.querySelectorAll('[data-request-sample]').forEach((btn) => btn.addEventListener('click', () => {
    const stock = (ctx.db.sampleStocks ?? []).find((s) => s.id === btn.dataset.requestSample);
    if (stock) openSampleRequest(ctx, stock);
  }));
  document.querySelectorAll('[data-approve-sample]').forEach((btn) => btn.addEventListener('click', () => {
    ctx.store.update((db) => decideSampleRequest(db, { id: btn.dataset.approveSample, approve: true, user: ctx.user }));
    toast('Permintaan sample disetujui; stok berpindah ke PT peminta.', { tone: 'success' });
  }));
  document.querySelectorAll('[data-reject-sample]').forEach((btn) => btn.addEventListener('click', () => {
    ctx.store.update((db) => decideSampleRequest(db, { id: btn.dataset.rejectSample, approve: false, user: ctx.user }));
    toast('Permintaan sample ditolak.', { tone: 'success' });
  }));
  document.querySelectorAll('[data-link]').forEach((btn) => btn.addEventListener('click', () => {
    const sample = ctx.db.samples.find((s) => s.id === btn.dataset.link);
    if (sample) openLink(ctx, sample);
  }));
  document.querySelectorAll('[data-refund]').forEach((btn) => btn.addEventListener('click', () => {
    const dep = ctx.db.deposits.find((d) => d.id === btn.dataset.refund);
    if (dep) openRefund(ctx, dep);
  }));
}
