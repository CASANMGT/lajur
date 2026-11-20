/** Pembayaran & piutang: invoice tracking by date plus editable receipt history. */

import { esc, icon, fmt, badge, toast, openModal, field, imageToDataUrl, confirmAction } from '../dom.js';
import { byId, todayJakarta } from '../../domain/core.js';
import {
  PAYMENT_KIND, deletePayment, invoiceOutstanding, invoicePaid, invoicesForCompany, updatePayment,
} from '../../domain/sales.js';
import { pageHead, statCard, can } from './common.js';
import { BANKS, bankById, bankMarkHtml } from '../../data/banks.js';

const state = { filter: 'all', sort: 'dateDesc' };

function invoicePayState(inv) {
  const out = invoiceOutstanding(inv);
  const paid = invoicePaid(inv);
  if (out <= 0) return { key: 'paid', label: 'Lunas', tone: 'ok' };
  if (paid <= 0) return { key: 'unpaid', label: 'Belum bayar', tone: 'danger' };
  return { key: 'partial', label: 'Belum lunas', tone: 'warn' };
}

function paymentRows(ctx) {
  const invoices = invoicesForCompany(ctx.db, ctx.companyId).filter((inv) => inv.status === 'posted');
  const rows = [];
  for (const inv of invoices) {
    for (const payment of inv.payments ?? []) rows.push({ payment, invoice: inv });
  }
  for (const payment of ctx.db.payments ?? []) {
    const invoice = byId(ctx.db.invoices, payment.invoiceId);
    if (!invoice || !invoices.some((inv) => inv.id === invoice.id)) continue;
    if (!rows.some((row) => row.payment.id === payment.id)) rows.push({ payment, invoice });
  }
  return rows.sort((a, b) => String(b.payment.at ?? b.payment.date).localeCompare(String(a.payment.at ?? a.payment.date)));
}

export function render(ctx) {
  const { db } = ctx;
  const invoices = invoicesForCompany(db, ctx.companyId)
    .filter((inv) => inv.status === 'posted')
    .map((inv) => {
      const stateOf = invoicePayState(inv);
      const payments = [...(inv.payments ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return {
        invoice: inv,
        state: stateOf,
        paid: invoicePaid(inv),
        outstanding: invoiceOutstanding(inv),
        lastPayment: payments[0] ?? null,
        paymentCount: payments.length,
      };
    });
  const counts = {
    all: invoices.length,
    unpaid: invoices.filter((row) => row.state.key === 'unpaid').length,
    partial: invoices.filter((row) => row.state.key === 'partial').length,
    paid: invoices.filter((row) => row.state.key === 'paid').length,
  };
  const totalOutstanding = invoices.reduce((a, row) => a + row.outstanding, 0);
  const totalPaid = invoices.reduce((a, row) => a + row.paid, 0);
  const totalBilled = invoices.reduce((a, row) => a + row.invoice.total, 0);
  let filtered = state.filter === 'all' ? invoices : invoices.filter((row) => row.state.key === state.filter);
  filtered = [...filtered].sort((a, b) => {
    if (state.sort === 'outstanding') return b.outstanding - a.outstanding || a.invoice.customerName.localeCompare(b.invoice.customerName);
    if (state.sort === 'dateAsc') return String(a.invoice.date).localeCompare(String(b.invoice.date));
    if (state.sort === 'customer') return a.invoice.customerName.localeCompare(b.invoice.customerName) || String(b.invoice.date).localeCompare(String(a.invoice.date));
    return String(b.invoice.date).localeCompare(String(a.invoice.date));
  });
  const receipts = paymentRows(ctx);

  return `
    ${pageHead({
      eyebrow: 'Penjualan',
      title: 'Pembayaran & piutang',
      sub: 'Lacak siapa yang belum bayar, belum lunas, dan lunas. Riwayat penerimaan dapat diedit beserta bukti screenshot.',
      actions: `<a class="btn" href="#/penjualan">${icon('receipt')} Faktur</a>`,
    })}
    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Belum bayar', value: String(counts.unpaid), meta: 'Belum ada penerimaan', tone: counts.unpaid ? 'warn' : '', iconName: 'wallet' })}
      ${statCard({ label: 'Belum lunas', value: String(counts.partial), meta: 'Sudah bayar sebagian', tone: counts.partial ? 'warn' : '' })}
      ${statCard({ label: 'Lunas', value: String(counts.paid), meta: 'Sisa tagihan 0' })}
      ${statCard({ label: 'Total sisa', value: fmt.money(totalOutstanding), meta: `dari ${fmt.money(totalBilled)}`, tone: totalOutstanding ? 'warn' : 'ok' })}
      ${statCard({ label: 'Terkumpul', value: fmt.money(totalPaid), meta: `${receipts.length} penerimaan` })}
    </div>
    <div class="row-between" style="margin-bottom:12px;gap:12px;flex-wrap:wrap">
      <div class="row" style="flex-wrap:wrap">
        ${[['all', `Semua (${counts.all})`], ['unpaid', `Belum bayar (${counts.unpaid})`], ['partial', `Belum lunas (${counts.partial})`], ['paid', `Lunas (${counts.paid})`]].map(([key, label]) => `<button class="chip" type="button" data-pay-filter="${key}" aria-pressed="${state.filter === key}">${esc(label)}</button>`).join('')}
      </div>
      <div class="field" style="min-width:220px;margin:0"><label for="pay-sort">Urutkan</label>
        <select class="select" id="pay-sort">
          <option value="dateDesc" ${state.sort === 'dateDesc' ? 'selected' : ''}>Tanggal faktur terbaru</option>
          <option value="dateAsc" ${state.sort === 'dateAsc' ? 'selected' : ''}>Tanggal faktur terlama</option>
          <option value="outstanding" ${state.sort === 'outstanding' ? 'selected' : ''}>Sisa tagihan terbesar</option>
          <option value="customer" ${state.sort === 'customer' ? 'selected' : ''}>Nama pelanggan A–Z</option>
        </select>
      </div>
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="table-wrap desktop-table"><table class="data">
        <thead><tr><th>Pelanggan</th><th>Faktur / tanggal</th><th class="num">Total</th><th class="num">Dibayar</th><th class="num">Sisa</th><th>Status</th><th>Pembayaran terakhir</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${filtered.map(({ invoice, state: payState, paid, outstanding, lastPayment, paymentCount }) => `<tr data-href="#/penjualan/${invoice.id}" tabindex="0" role="link">
          <td><strong class="small">${esc(invoice.customerName)}</strong><div class="xs muted">${esc(invoice.customerId)}</div></td>
          <td class="mono small">${esc(invoice.id)}<div class="xs muted">${esc(invoice.date)} · due ${esc(invoice.dueDate)}</div></td>
          <td class="num">${fmt.money(invoice.total)}</td>
          <td class="num">${fmt.money(paid)}</td>
          <td class="num strong">${outstanding ? fmt.money(outstanding) : '—'}</td>
          <td>${badge(payState.label, payState.tone)}</td>
          <td class="small">${lastPayment ? `${esc(lastPayment.date)}<div class="xs muted">${esc(PAYMENT_KIND[lastPayment.kind]?.label ?? 'Angsuran')} · ${esc(lastPayment.method || '')}</div>` : `<span class="muted">Belum ada</span>`}<div class="xs muted">${paymentCount} penerimaan</div></td>
          <td class="right"><a class="btn btn-sm" href="#/penjualan/${invoice.id}">Buka</a></td>
        </tr>`).join('') || `<tr><td colspan="8"><div class="empty">${icon('wallet')}<strong>Tidak ada faktur</strong><p>Ubah filter atau buat faktur terlebih dahulu.</p></div></td></tr>`}</tbody>
      </table></div>
      <div class="mobile-cards">
        ${filtered.map(({ invoice, state: payState, paid, outstanding }) => `<a class="roll-card" href="#/penjualan/${invoice.id}" style="color:inherit;text-decoration:none">
          <div class="top"><span class="id mono">${esc(invoice.id)}</span>${badge(payState.label, payState.tone)}</div>
          <div class="small strong">${esc(invoice.customerName)}</div>
          <div class="grid3"><div class="kv"><span>Total</span><strong>${fmt.money(invoice.total)}</strong></div><div class="kv"><span>Dibayar</span><strong>${fmt.money(paid)}</strong></div><div class="kv"><span>Sisa</span><strong>${outstanding ? fmt.money(outstanding) : '—'}</strong></div></div>
        </a>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Riwayat penerimaan</h2><p>Semua pembayaran menurut tanggal. Edit nominal, jenis, no. transfer, atau bukti bila perlu.</p></div><span class="badge no-dot">${receipts.length}</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Tanggal</th><th>Pelanggan / faktur</th><th>Jenis</th><th>Metode / no. transfer</th><th>Bukti</th><th class="num">Nominal</th><th><span class="sr-only">Aksi</span></th></tr></thead>
        <tbody>${receipts.map(({ payment, invoice }) => `<tr>
          <td class="small">${esc(payment.date)}<div class="xs muted">${esc(payment.updatedAt ? 'diedit ' + new Date(payment.updatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '')}</div></td>
          <td><strong class="small">${esc(invoice?.customerName ?? '—')}</strong><div class="xs muted mono">${esc(payment.invoiceId)}</div></td>
          <td>${badge(PAYMENT_KIND[payment.kind]?.label ?? 'Angsuran', PAYMENT_KIND[payment.kind]?.tone ?? 'muted')}</td>
          <td class="small"><div class="row" style="gap:6px;align-items:center">${payment.bank ? bankMarkHtml(bankById(payment.bank), { small: true }) : ''}<span>${esc(payment.method || '—')}</span></div><div class="xs muted">${esc(payment.reference || 'tanpa no. transfer')}</div></td>
          <td>${payment.proofImage ? `<img src="${esc(payment.proofImage)}" alt="Bukti ${esc(payment.id)}" class="thumb zoomable" data-zoom="${esc(payment.proofImage)}" data-zoom-title="Bukti ${esc(payment.id)}" role="button" tabindex="0" style="width:52px;height:52px;object-fit:cover" />` : '<span class="xs muted">—</span>'}</td>
          <td class="num strong">${fmt.money(payment.amount)}</td>
          <td class="right"><div class="row" style="justify-content:flex-end"><button class="btn btn-sm" type="button" data-edit-payment="${payment.id}" data-invoice="${payment.invoiceId}">Edit</button>${can(ctx.role, 'invoice.pay') ? `<button class="btn btn-sm btn-danger" type="button" data-delete-payment="${payment.id}" data-invoice="${payment.invoiceId}">Hapus</button>` : ''}</div></td>
        </tr>`).join('') || `<tr><td colspan="7"><div class="empty">${icon('wallet')}<strong>Belum ada penerimaan</strong><p>Pembayaran yang dicatat dari faktur muncul di sini.</p></div></td></tr>`}</tbody>
      </table></div>
    </section>`;
}

function openEditPayment(ctx, payment, invoice) {
  const formatAmount = (value) => Number(value || 0).toLocaleString('id-ID');
  openModal({
    title: `Edit pembayaran ${payment.id}`,
    description: `Faktur ${invoice.id} · ${invoice.customerName}`,
    submitLabel: 'Simpan perubahan',
    body: `
      ${field('Jenis', `<select class="select" name="kind">${Object.entries(PAYMENT_KIND).map(([k, v]) => `<option value="${k}" ${payment.kind === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`)}
      ${field('Nominal (Rp)', `<input class="input" name="amount" inputmode="numeric" value="${formatAmount(payment.amount)}" />`)}
      <div class="span-2 small" data-edit-remaining style="margin-top:-4px;margin-bottom:8px"></div>
      ${field('Metode', `<select class="select" name="method">${['transfer', 'tunai', 'qris', 'giro'].map((m) => `<option value="${m}" ${payment.method === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`)}
      ${field('Bank pengirim', `<select class="select" name="bank">${BANKS.map((bank) => `<option value="${bank.id}" ${payment.bank === bank.id ? 'selected' : ''}>${esc(bank.name)}</option>`).join('')}</select>`)}
      ${field('No. transfer / referensi', `<input class="input" name="reference" value="${esc(payment.reference ?? '')}" />`)}
      ${field('Tanggal', `<input class="input" type="date" name="date" value="${esc(payment.date)}" />`)}
      ${field('Bukti baru (opsional)', `<input class="input" type="file" name="proof" accept="image/*" />`, { hint: 'Kosongkan untuk mempertahankan bukti lama.', full: true })}
      ${field('Catatan', `<input class="input" name="note" value="${esc(payment.note ?? '')}" />`, { full: true })}
      ${payment.proofImage ? `<div class="span-2"><div class="xs muted" style="margin-bottom:4px">Bukti saat ini</div><img src="${esc(payment.proofImage)}" alt="Bukti ${esc(payment.id)}" style="max-width:100%;max-height:200px;object-fit:contain;border:1px solid var(--line);border-radius:8px" /></div>` : ''}
    `,
    onMount(form) {
      const remainingEl = form.querySelector('[data-edit-remaining]');
      const updateRemaining = () => {
        const paid = Number(String(form.amount.value).replace(/\D/g, ''));
        const sisa = Math.max(0, invoiceOutstanding(invoice) + Number(payment.amount || 0) - paid);
        if (remainingEl) {
          remainingEl.innerHTML = sisa > 0
            ? `Sisa setelah pembayaran ini: <strong>${fmt.money(sisa)}</strong>`
            : '<strong class="ok">Lunas setelah pembayaran ini.</strong>';
        }
      };
      form.amount.addEventListener('input', () => {
        const digits = String(form.amount.value).replace(/\D/g, '');
        form.amount.value = digits ? Number(digits).toLocaleString('id-ID') : '';
        updateRemaining();
      });
      updateRemaining();
    },
    async onSubmit(form, close) {
      const file = form.proof?.files?.[0];
      const proofImage = file ? await imageToDataUrl(file, { maxBytes: 800_000 }) : undefined;
      ctx.store.update((db) => updatePayment(db, {
        id: payment.id,
        patch: {
          kind: form.kind.value,
          amount: Number(String(form.amount.value).replace(/\D/g, '')),
          method: form.method.value,
          bank: form.bank.value,
          reference: form.reference.value,
          date: form.date.value,
          note: form.note.value,
          ...(proofImage !== undefined ? { proofImage } : {}),
        },
        user: ctx.user,
      }));
      close();
      toast('Pembayaran diperbarui.', { tone: 'success' });
    },
  });
}

export function mount(ctx) {
  document.querySelectorAll('[data-pay-filter]').forEach((btn) => btn.addEventListener('click', () => {
    state.filter = btn.dataset.payFilter;
    ctx.store.emit();
  }));
  document.getElementById('pay-sort')?.addEventListener('change', (event) => {
    state.sort = event.target.value;
    ctx.store.emit();
  });
  document.querySelectorAll('[data-edit-payment]').forEach((btn) => btn.addEventListener('click', () => {
    const invoice = byId(ctx.db.invoices, btn.dataset.invoice);
    const payment = invoice?.payments?.find((p) => p.id === btn.dataset.editPayment)
      ?? (ctx.db.payments ?? []).find((p) => p.id === btn.dataset.editPayment);
    if (payment && invoice) openEditPayment(ctx, payment, invoice);
  }));
  document.querySelectorAll('[data-delete-payment]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Hapus pembayaran?',
      message: 'Sisa tagihan faktur akan bertambah kembali. Tindakan ini dapat dicatat ulang.',
      confirmLabel: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      ctx.store.update((db) => deletePayment(db, { id: btn.dataset.deletePayment, user: ctx.user }));
      toast('Pembayaran dihapus; sisa tagihan diperbarui.', { tone: 'success' });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }));
}
