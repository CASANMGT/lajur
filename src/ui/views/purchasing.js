/** Pembelian: PO pemasok, penerimaan, tagihan, pemasok. */

import {
  esc, icon, fmt, badge, toast, openModal, field, printDocument,
} from '../dom.js';
import { byId, daysBetween, parseM, todayJakarta } from '../../domain/core.js';
import {
  PO_STATUS, approvePO, createPO, createSupplierReturn, paySupplierInvoice, payablesAging, poLineOpen,
  receivePO, supplierPerformance,
} from '../../domain/purchasing.js';
import { pageHead, statCard, warehouseOf, can, warehouseOptions, roleHint } from './common.js';
import { printPoHtml } from './print.js';

let tab = 'po';

export function render(ctx) {
  if (ctx.route.id) return renderPoDetail(ctx);

  const { db, role } = ctx;
  const ap = payablesAging(db);
  const open = ap.items.length;
  const late = ap.items.filter((i) => i.daysLate > 0).length;

  return `
    ${pageHead({
      eyebrow: 'Pembelian',
      title: 'Pemasok & penerimaan',
      sub: 'PO eksternal terpisah dari permintaan gudang. Penerimaan menolak nomor ganda dan kelebihan kirim.',
      actions: `${can(role, 'po.create') ? `<button class="btn btn-primary" type="button" data-act="new-po">${icon('plus')} Buat PO</button>` : ''}`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Utang pemasok', value: fmt.money(ap.total), meta: `${open} tagihan terbuka`, tone: 'warn', iconName: 'truck' })}
      ${statCard({ label: 'Lewat jatuh tempo', value: String(late), meta: 'Tagihan perlu dibayar', tone: 'warn' })}
      ${statCard({ label: 'PO berjalan', value: String(db.purchaseOrders.filter((p) => ['approved', 'partial'].includes(p.status)).length), meta: 'Belum diterima lengkap' })}
      ${statCard({ label: 'Penerimaan', value: String(db.goodsReceipts.length), meta: 'Dokumen GR tersimpan' })}
    </div>

    <div class="tabs" role="tablist">
      ${[['po', 'Purchase order'], ['tagihan', 'Tagihan & pembayaran'], ['pemasok', 'Pemasok']].map(([k, label]) => `<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${esc(label)}</button>`).join('')}
    </div>

    ${tab === 'po' ? renderPoTab(ctx) : tab === 'tagihan' ? renderBillTab(ctx) : renderSupplierTab(ctx)}`;
}

function renderPoTab(ctx) {
  const { db } = ctx;
  const rows = [...db.purchaseOrders].sort((a, b) => (a.date < b.date ? 1 : -1));
  return `<section class="card">
    <div class="table-wrap desktop-table">
      <table class="data">
        <thead><tr><th>PO</th><th>Pemasok</th><th class="hide-sm">Estimasi</th><th style="min-width:150px">Diterima</th><th class="num">Total</th><th>Status</th></tr></thead>
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
            <td class="num">${fmt.money(po.total)}</td>
            <td>${badge(PO_STATUS[po.status].label, PO_STATUS[po.status].tone)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    <div class="mobile-cards">
      ${rows.map((po) => `<a class="roll-card" href="#/pembelian/${po.id}" style="color:inherit;text-decoration:none">
        <div class="top"><span class="id">${esc(po.id)}</span>${badge(PO_STATUS[po.status].label, PO_STATUS[po.status].tone)}</div>
        <div class="small strong">${esc(po.supplierName)}</div>
        <div class="xs muted">Estimasi ${esc(po.expectedDate)} Â· ${esc(po.note || '')}</div>
        <div class="grid3"><div class="kv"><span>Total</span><strong>${fmt.money(po.total)}</strong></div><div class="kv"><span>Baris</span><strong>${po.lines.length}</strong></div><div class="kv"><span>Status</span><strong>${esc(PO_STATUS[po.status].label)}</strong></div></div>
      </a>`).join('')}
    </div>
  </section>`;
}

function renderBillTab(ctx) {
  const { db, role } = ctx;
  const ap = payablesAging(db);
  const bills = [...db.supplierInvoices].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  return `<div class="notice notice-info" style="margin-bottom:12px">${icon('alert')}<div><strong>Demo menggabungkan penerimaan dan tagihan.</strong> Produksi harus memisahkan GR dan supplier invoice, lalu merekonsiliasi sebelum utang diposting.</div></div>
    <section class="card">
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Tagihan</th><th>Pemasok</th><th class="hide-sm">Jatuh tempo</th><th class="num">Nilai</th><th class="num">Dibayar</th><th class="num">Sisa</th><th></th></tr></thead>
          <tbody>${bills.map((b) => {
            const out = b.amount - b.paid;
            const late = daysBetween(b.dueDate, todayJakarta());
            return `<tr>
              <td class="mono">${esc(b.id)}<div class="xs muted">${esc(b.poId ?? '')}</div></td>
              <td>${esc(byId(db.suppliers, b.supplierId)?.name ?? b.supplierId)}</td>
              <td class="hide-sm">${esc(b.dueDate)}${late > 0 ? ` <span class="badge badge-danger no-dot">${late} hr</span>` : ''}</td>
              <td class="num">${fmt.money(b.amount)}</td>
              <td class="num">${fmt.money(b.paid)}</td>
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
  return `<div class="grid grid-2">
    ${db.suppliers.map((s) => {
      const perf = supplierPerformance(db).find((p) => p.supplier.id === s.id);
      const prices = db.supplierPrices.filter((p) => p.supplierId === s.id);
      return `<section class="card card-pad">
        <div class="row-between"><div><h2>${esc(s.name)}</h2><div class="xs muted">${esc(s.code)} Â· ${esc(s.address)}</div></div>${role === 'manager' ? `<button class="btn btn-sm" data-edit-supplier="${s.id}">Edit</button>` : ''}</div>
        <div class="stack-sm" style="margin-top:10px">
          <div class="row-between"><span class="small muted">Kontak</span><span class="small">${esc(s.contact)} Â· ${esc(s.phone)}</span></div>
          <div class="row-between"><span class="small muted">Termin</span><span class="small">${esc(s.termsDays)} hari Â· lead ${esc(s.leadTimeDays)} hari</span></div>
          <div class="row-between"><span class="small muted">Performa</span><span class="small">${perf?.receiptCount ?? 0} penerimaan Â· ${perf?.lateReceipts ?? 0} terlambat</span></div>
        </div>
        <hr class="divider" />
        <div class="xs muted">Harga pemasok</div>
        <div class="stack-sm" style="margin-top:6px">
          ${prices.map((p) => {
            const sku = p.skuId ? byId(db.skus, p.skuId) : null;
            const part = p.partId ? byId(db.parts, p.partId) : null;
            return `<div class="row-between"><span class="small">${esc(sku ? `${sku.code} â€” ${sku.colourName || sku.colourCode}` : part?.name ?? '')}</span><span class="small num">${fmt.money(p.price)} / ${esc(p.unit)}</span></div>`;
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
  const actions = [];
  if (po.status === 'draft' && role === 'manager') actions.push(`<button class="btn btn-primary" data-act="approve">${icon('check')} Setujui PO</button>`);
  if (['approved', 'partial'].includes(po.status) && can(role, 'po.receive')) actions.push(`<button class="btn btn-primary" data-act="receive">${icon('truck')} Terima barang</button>`);
  actions.push(`<button class="btn" data-act="print">${icon('printer')} Cetak PO</button>`);

  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/pembelian">â† Semua pembelian</a>
        <div class="row" style="margin-top:6px"><h1 class="mono">${esc(po.id)}</h1>${badge(PO_STATUS[po.status].label, PO_STATUS[po.status].tone)}</div>
        <p class="sub">${esc(supplier?.name)} Â· estimasi ${esc(po.expectedDate)} Â· termin ${esc(po.termsDays)} hari</p>
      </div>
      <div class="page-actions">${actions.join('')}</div>
    </div>

    <div class="grid grid-main">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Baris pesanan</h2><p>Kelebihan terima ditolak per baris.</p></div><span class="badge no-dot">${fmt.money(po.total)}</span></div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Barang</th><th class="num">Dipesan</th><th class="num">Diterima</th><th class="num">Sisa</th><th class="num">Harga</th></tr></thead>
              <tbody>${po.lines.map((l) => {
                const open = poLineOpen(l);
                return `<tr>
                  <td><strong>${esc(l.description)}</strong></td>
                  <td class="num">${l.kind === 'fabric' ? fmt.m(l.qtyMm) : `${fmt.pcs(l.qtyPcs)} pcs`}</td>
                  <td class="num">${l.kind === 'fabric' ? fmt.m(l.receivedMm) : `${fmt.pcs(l.receivedPcs)} pcs`}</td>
                  <td class="num ${open ? 'strong' : 'muted'}">${l.kind === 'fabric' ? fmt.m(open) : `${fmt.pcs(open)} pcs`}</td>
                  <td class="num">${fmt.money(l.unitPrice)}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div><h2>Penerimaan</h2><p>Setiap baris menyimpan roll dan lot sendiri.</p></div><span class="badge no-dot">${receipts.length}</span></div>
          ${receipts.length ? `<div class="table-wrap"><table class="data">
            <thead><tr><th>Dokumen</th><th>Tanggal</th><th>Gudang</th><th class="num">Nilai</th><th>Tagihan</th></tr></thead>
            <tbody>${receipts.map((r) => `<tr>
              <td class="mono">${esc(r.id)}<div class="xs muted">${esc(r.ref)}</div></td>
              <td>${esc(r.date)}</td>
              <td>${esc(warehouseOf(db, r.warehouseId)?.code)}</td>
              <td class="num">${fmt.money(r.total)}</td>
              <td>${r.supplierInvoiceId ? `<a class="mono xs" href="#/pembelian?tab=tagihan">${esc(r.supplierInvoiceId)}</a>` : 'â€”'}</td>
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
            <div class="row-between"><span class="small muted">Disetujui</span><span class="small">${esc(po.approvedBy || 'â€”')}</span></div>
            <div class="row-between"><span class="small muted">Tagihan</span><span class="small">${bill ? `${esc(bill.id)}` : 'â€”'}</span></div>
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
  const skuOptions = db.skus.filter((s) => s.active).map((s) => `<option value="${s.id}">${esc(s.collectionName)} ${esc(s.colourName || s.colourCode)} â€” ${esc(s.code)}</option>`).join('');
  const partOptions = db.parts.map((p) => `<option value="${p.id}">${esc(p.sku)} Â· ${esc(p.name)}</option>`).join('');
  const row = () => `<div class="alloc-row" data-line style="grid-template-columns:1fr 1.3fr 90px 110px 34px">
    <select class="select l-kind"><option value="fabric">Kain</option><option value="part">Part</option></select>
    <select class="select l-product">${skuOptions}</select>
    <input class="input l-qty" inputmode="decimal" placeholder="m" />
    <input class="input l-price" inputmode="numeric" placeholder="harga" />
    <button class="icon-btn" type="button" data-remove>${icon('x')}</button>
  </div>`;

  openModal({
    title: 'Buat purchase order',
    description: 'PO eksternal ke pemasok. Bukan permintaan gudang internal.',
    wide: true,
    submitLabel: 'Simpan PO',
    body: `
      <div class="form-grid">
        ${field('Pemasok', `<select class="select" name="supplier">${db.suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>`)}
        ${field('Tanggal PO', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
        ${field('Estimasi tiba', `<input class="input" type="date" name="expectedDate" value="${new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)}" />`)}
        ${field('Termin (hari)', `<input class="input" type="number" name="terms" value="30" min="0" max="180" />`)}
        ${field('Catatan', `<input class="input" name="note" placeholder="Instruksi kirim / lot" />`, { full: true })}
      </div>
      <div class="section-title" style="margin:18px 0 6px"><h3>Baris PO</h3></div>
      <div id="po-rows">${row()}</div>
      <button class="btn btn-sm" type="button" data-add>${icon('plus')} Tambah baris</button>
      <div class="notice notice-info" style="margin-top:12px">${icon('alert')}<div>Harga dan MOQ dapat diambil dari daftar harga pemasok di tab Pemasok.</div></div>
    `,
    onMount(form) {
      const rows = form.querySelector('#po-rows');
      const bind = (r) => {
        r.querySelector('.l-kind').addEventListener('change', (e) => {
          r.querySelector('.l-product').innerHTML = e.target.value === 'fabric' ? skuOptions : partOptions;
          r.querySelector('.l-qty').placeholder = e.target.value === 'fabric' ? 'm' : 'pcs';
        });
        r.querySelector('[data-remove]').addEventListener('click', () => { if (rows.children.length > 1) r.remove(); });
        r.querySelector('.l-product').addEventListener('change', () => {
          const id = r.querySelector('.l-product').value;
          const item = db.skus.find((s) => s.id === id) ?? db.parts.find((p) => p.id === id);
          if (item) r.querySelector('.l-price').value = String(item.buyPrice);
        });
      };
      form.querySelectorAll('[data-line]').forEach(bind);
      form.querySelector('[data-add]').addEventListener('click', () => {
        rows.insertAdjacentHTML('beforeend', row());
        bind(rows.lastElementChild);
      });
      form.querySelector('.l-price').value = String(db.skus[0]?.buyPrice ?? '');
    },
    onSubmit(form, close) {
      const lines = [...form.querySelectorAll('[data-line]')].map((row) => {
        const kind = row.querySelector('.l-kind').value;
        const raw = row.querySelector('.l-qty').value;
        const price = Number(String(row.querySelector('.l-price').value).replace(/\D/g, '')) || 0;
        return kind === 'fabric'
          ? { kind, skuId: row.querySelector('.l-product').value, qtyMm: parseM(raw), unitPrice: price || undefined }
          : { kind, partId: row.querySelector('.l-product').value, qtyPcs: Number(raw), unitPrice: price || undefined };
      }).filter((l) => (l.qtyMm ?? l.qtyPcs) > 0);
      if (!lines.length) throw new Error('Tambahkan minimal satu baris PO.');
      const po = ctx.store.update((db) => createPO(db, {
        supplierId: form.supplier.value,
        date: form.date.value,
        expectedDate: form.expectedDate.value,
        termsDays: Number(form.terms.value || 30),
        lines,
        note: form.note.value,
        user: ctx.user,
      }));
      close();
      window.location.hash = `#/pembelian/${po.id}`;
      toast('PO dibuat. Setujui sebelum menerima barang.', { tone: 'success' });
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
      ctx.store.update((db) => receivePO(db, {
        poId: po.id,
        ref: form.ref.value,
        date: form.date.value,
        warehouseId: form.warehouse.value,
        lines,
        user: ctx.user,
        createBill: form.createBill.checked,
      }));
      close();
      toast('Penerimaan diposting. Roll baru dan tagihan dibuat.', { tone: 'success' });
    },
  });
}

function openPayBill(ctx, bill) {
  const out = bill.amount - bill.paid;
  openModal({
    title: `Bayar ${bill.id}`,
    description: `Sisa ${fmt.money(out)}.`,
    body: `
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" value="${String(out)}" />`)}
      ${field('Tanggal', `<input class="input" type="date" name="date" value="${todayJakarta()}" />`)}
      ${field('Metode', `<select class="select" name="method"><option value="transfer">Transfer</option><option value="giro">Giro</option><option value="tunai">Tunai</option></select>`)}
      ${field('Catatan', `<input class="input" name="note" />`)}
    `,
    onSubmit(form, close) {
      const amount = Number(String(form.amount.value).replace(/\D/g, ''));
      ctx.store.update((db) => paySupplierInvoice(db, {
        id: bill.id, amount, date: form.date.value, method: form.method.value, note: form.note.value, user: ctx.user,
      }));
      close();
      toast('Pembayaran pemasok dicatat (simulasi).', { tone: 'success' });
    },
  });
}

function openEditSupplier(ctx, supplier) {
  openModal({
    title: `Edit ${supplier.name}`,
    body: `<div class="form-grid">
      ${field('Nama', `<input class="input" name="name" value="${esc(supplier.name)}" />`)}
      ${field('Kontak', `<input class="input" name="contact" value="${esc(supplier.contact)}" />`)}
      ${field('Telepon', `<input class="input" name="phone" value="${esc(supplier.phone)}" />`)}
      ${field('Email', `<input class="input" name="email" value="${esc(supplier.email)}" />`)}
      ${field('Termin (hari)', `<input class="input" type="number" name="termsDays" value="${supplier.termsDays}" />`)}
      ${field('Lead time (hari)', `<input class="input" type="number" name="leadTimeDays" value="${supplier.leadTimeDays}" />`)}
      ${field('Alamat', `<input class="input" name="address" value="${esc(supplier.address)}" />`, { full: true })}
      ${field('Catatan', `<input class="input" name="notes" value="${esc(supplier.notes)}" />`, { full: true })}
    </div>`,
    onSubmit(form, close) {
      ctx.store.update((db) => {
        const s = db.suppliers.find((x) => x.id === supplier.id);
        Object.assign(s, {
          name: form.name.value.trim(),
          contact: form.contact.value,
          phone: form.phone.value,
          email: form.email.value,
          termsDays: Number(form.termsDays.value || 0),
          leadTimeDays: Number(form.leadTimeDays.value || 0),
          address: form.address.value,
          notes: form.notes.value,
        });
      });
      close();
      toast('Data pemasok diperbarui.', { tone: 'success' });
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
    if (supplier) openEditSupplier(ctx, supplier);
  }));

  if (ctx.route.query?.tab === 'tagihan') {
    tab = 'tagihan';
    history.replaceState(null, '', '#/pembelian');
    ctx.store.emit();
  }
}
