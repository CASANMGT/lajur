/**
 * Customers, CRM, samples, deposits.
 *
 * Deposits are liabilities, not revenue. Every movement is kept in a ledger on
 * the deposit so the same rupiah can never be both applied and refunded.
 */

import {
  DomainError, MM_PER_M, assert, audit, byId, isoNow, money, nextId, normalizeNpwp, todayJakarta,
} from './core.js';
import { availableMm, requireRoll, splitRoll } from './inventory.js';
import { createInvoice, invoiceOutstanding, postInvoice, requireInvoice } from './sales.js';

export const CRM_STAGE = {
  prospek: { label: 'Prospek', tone: 'muted' },
  sample: { label: 'Sample dikirim', tone: 'copper' },
  negosiasi: { label: 'Negosiasi', tone: 'info' },
  pelanggan: { label: 'Pelanggan', tone: 'ok' },
  dormant: { label: 'Dormant', tone: 'danger' },
};

export function getCustomer(db, id) {
  return db.customers.find((c) => c.id === id) ?? null;
}

export function requireCustomer(db, id) {
  const c = getCustomer(db, id);
  if (!c) throw new DomainError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.');
  return c;
}

export function createCustomer(db, input, user) {
  assert(input.name?.trim(), 'NAME_REQUIRED', 'Nama pelanggan wajib diisi.');
  const customer = {
    id: nextId(db, 'customer', 'CUS', 4),
    name: input.name.trim(),
    company: input.company ?? '',
    npwp: normalizeNpwp(input.npwp),
    phone: input.phone ?? '',
    email: input.email ?? '',
    address: input.address ?? '',
    city: input.city ?? '',
    salespersonId: input.salespersonId ?? 'u-sales',
    stage: input.stage ?? 'prospek',
    nextAction: input.nextAction ?? '',
    followUpDate: input.followUpDate ?? '',
    notes: input.notes ?? '',
    createdAt: isoNow(),
    activities: [],
  };
  db.customers.push(customer);
  audit(db, user, 'buat_pelanggan', 'customer', customer.id, customer.name);
  return customer;
}

export function updateCustomer(db, { id, patch, user }) {
  const c = requireCustomer(db, id);
  const clean = patch.npwp === undefined ? patch : { ...patch, npwp: normalizeNpwp(patch.npwp) };
  Object.assign(c, clean, { updatedAt: isoNow() });
  audit(db, user, 'ubah_pelanggan', 'customer', c.id, Object.keys(clean).join(','));
  return c;
}

export function logActivity(db, { customerId, type = 'catatan', note, user, date = todayJakarta() }) {
  const c = requireCustomer(db, customerId);
  const activity = {
    id: `ACT-${(c.activities?.length ?? 0) + 1}`,
    at: isoNow(),
    date,
    type,
    note,
    by: user?.name ?? 'Sistem',
  };
  c.activities = c.activities ?? [];
  c.activities.unshift(activity);
  return activity;
}

export function customerInvoices(db, customerId) {
  return db.invoices.filter((i) => i.customerId === customerId);
}

export function customerReceivable(db, customerId) {
  return customerInvoices(db, customerId)
    .filter((i) => i.status === 'posted')
    .reduce((acc, i) => acc + invoiceOutstanding(i), 0);
}

/* -------------------------------------------------------------------------- */
/* Samples                                                                    */
/* -------------------------------------------------------------------------- */

export const SAMPLE_MODE = {
  free: { label: 'Gratis', tone: 'muted' },
  paid: { label: 'Berbayar', tone: 'info' },
  deposit: { label: 'Deposit', tone: 'copper' },
};

export const SAMPLE_BOOK_STATUS = {
  ready: { label: 'Siap diberikan', tone: 'teal' },
  given: { label: 'Sudah diberikan', tone: 'ok' },
};

export function getSample(db, id) {
  return db.samples.find((s) => s.id === id) ?? null;
}

/**
 * A sample is cut from a specific roll, so the physical metres leave stock.
 * `free` costs nothing; `paid` raises a service invoice; `deposit` records a
 * refundable liability (never revenue).
 */
export function createSample(db, { customerId, skuId, rollId, qtyMm, mode = 'free', amount = 0, date = todayJakarta(), notes = '', user }) {
  const customer = requireCustomer(db, customerId);
  const roll = requireRoll(db, rollId);
  assert(roll.skuId === skuId, 'SKU_MISMATCH', 'Roll bukan SKU yang dipilih.');
  assert(roll.warehouseId, 'ROLL_IN_TRANSIT', 'Roll dalam perjalanan tidak dapat dipotong untuk sample.');
  const qty = Math.round(Number(qtyMm));
  assert(qty > 0, 'INVALID_LENGTH', 'Panjang sample harus lebih dari 0 m.');
  assert(qty <= availableMm(roll), 'INSUFFICIENT_AVAILABLE',
    `Tersedia hanya ${availableMm(roll) / MM_PER_M} m pada ${roll.id}.`);
  assert(['free', 'paid', 'deposit'].includes(mode), 'INVALID_MODE', 'Jenis sample tidak dikenal.');
  assert(!db.settings?.sampleDepositRequired || mode !== 'free', 'SAMPLE_DEPOSIT_REQUIRED',
    'Sample gratis dinonaktifkan oleh Pengaturan. Gunakan sample berbayar atau deposit.');

  const sampleId = nextId(db, 'sample', 'SMP', 4);
  const { piece } = splitRoll(db, {
    rollId,
    qtyMm: qty,
    user,
    ref: sampleId,
    reason: `Sample untuk ${customer.name}`,
    pieceStatus: 'consumed',
    note: `Sample ${mode}`,
  });

  const sample = {
    id: sampleId,
    customerId,
    skuId,
    rollId,
    pieceRollId: piece.id,
    qtyMm: qty,
    mode,
    date,
    notes,
    depositId: null,
    invoiceId: null,
    paidAmount: 0,
    linkedInvoiceId: null,
    status: 'active',
    createdAt: isoNow(),
    createdBy: user?.id ?? 'system',
  };

  if (mode === 'paid') {
    const value = money(amount);
    assert(value > 0, 'INVALID_AMOUNT', 'Nominal sample berbayar wajib diisi.');
    const invoice = createInvoice(db, {
      customerId,
      lines: [
        {
          kind: 'service',
          description: `Sample ${byId(db.skus, skuId)?.code ?? skuId} (${qty / MM_PER_M} m)`,
          unitPrice: value,
        },
      ],
      notes: `Sample ${sample.id}`,
      user,
    });
    postInvoice(db, { id: invoice.id, user });
    sample.invoiceId = invoice.id;
    sample.paidAmount = value;
  } else if (mode === 'deposit') {
    const value = money(amount);
    assert(value > 0, 'INVALID_AMOUNT', 'Nominal deposit sample wajib diisi.');
    const deposit = createDeposit(db, {
      customerId,
      kind: 'sample',
      amount: value,
      date,
      sampleId: sample.id,
      note: `Deposit sample ${sample.id}`,
      user,
    });
    sample.depositId = deposit.id;
  }

  db.samples.unshift(sample);
  customer.stage = customer.stage === 'pelanggan' ? customer.stage : 'sample';
  customer.nextAction = customer.nextAction || 'Follow up hasil sample';
  logActivity(db, {
    customerId,
    type: 'sample',
    note: `Sample ${sample.id} ${qty / MM_PER_M} m (${SAMPLE_MODE[mode].label}) dari ${rollId}`,
    user,
    date,
  });
  audit(db, user, 'kirim_sample', 'sample', sample.id, `${qty / MM_PER_M} m · ${mode}`);
  return sample;
}

/**
 * Build a physical sample book from roll cuts. Each item creates a normal
 * sample (stock leaves the roll) and is linked back to the book.
 */
export function createSampleBook(db, {
  name, customerId, date = todayJakarta(), items, notes = '', user,
}) {
  const customer = requireCustomer(db, customerId);
  const cleanName = String(name ?? '').trim();
  assert(cleanName.length >= 2, 'INVALID_NAME', 'Nama buku sample minimal 2 karakter.');
  assert(Array.isArray(items) && items.length > 0, 'EMPTY_ITEMS', 'Buku sample harus memiliki minimal satu potongan.');
  const id = nextId(db, 'sampleBook', 'SB', 4);
  const built = items.map((item) => {
    const roll = requireRoll(db, item.rollId);
    const qty = Math.round(Number(item.qtyMm));
    assert(qty > 0, 'INVALID_LENGTH', 'Panjang sample harus lebih dari 0 m.');
    const sample = createSample(db, {
      customerId,
      skuId: roll.skuId,
      rollId: roll.id,
      qtyMm: qty,
      mode: 'free',
      date,
      notes: `Buku sample ${id}`,
      user,
    });
    return {
      sampleId: sample.id,
      skuId: sample.skuId,
      rollId: sample.rollId,
      qtyMm: sample.qtyMm,
    };
  });
  const book = {
    id,
    name: cleanName,
    customerId,
    customerName: customer.name,
    date,
    status: 'ready',
    items: built,
    notes: String(notes ?? '').trim(),
    createdAt: isoNow(),
    createdBy: user?.name ?? 'Sistem',
    givenTo: '',
    givenAt: null,
    history: [{ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Buku sample dibuat', note: `${built.length} potongan` }],
  };
  db.sampleBooks = db.sampleBooks ?? [];
  db.sampleBooks.unshift(book);
  audit(db, user, 'buat_buku_sample', 'sampleBook', id, `${cleanName} · ${built.length} potongan`);
  return book;
}

export function giveSampleBook(db, {
  id, givenTo, date = todayJakarta(), note = '', user,
}) {
  const book = (db.sampleBooks ?? []).find((b) => b.id === id);
  assert(book, 'SAMPLE_BOOK_NOT_FOUND', 'Buku sample tidak ditemukan.');
  assert(book.status !== 'given', 'INVALID_STATUS', 'Buku sample sudah diberikan.');
  const recipient = String(givenTo ?? '').trim();
  assert(recipient.length >= 2, 'RECIPIENT_REQUIRED', 'Nama penerima buku wajib diisi.');
  book.status = 'given';
  book.givenTo = recipient;
  book.givenAt = isoNow();
  book.givenDate = date;
  book.notes = String(note ?? book.notes).trim();
  book.history.push({ at: isoNow(), by: user?.name ?? 'Sistem', action: 'Buku diberikan', note: recipient });
  audit(db, user, 'beri_buku_sample', 'sampleBook', id, recipient);
  return book;
}

/** Explicitly connect a sample to the purchase it produced. */
export function linkSampleToInvoice(db, { sampleId, invoiceId, user }) {  const sample = getSample(db, sampleId);
  assert(sample, 'SAMPLE_NOT_FOUND', 'Sample tidak ditemukan.');
  const inv = requireInvoice(db, invoiceId);
  assert(inv.status === 'posted', 'INVALID_STATUS', 'Faktur harus terbit.');
  assert(inv.customerId === sample.customerId, 'CUSTOMER_MISMATCH', 'Faktur milik pelanggan lain.');
  assert(new Date(inv.date) >= new Date(sample.date), 'DATE_ORDER', 'Faktur mendahului tanggal sample.');
  sample.linkedInvoiceId = invoiceId;
  sample.status = 'converted';
  sample.convertedAt = isoNow();
  logActivity(db, {
    customerId: sample.customerId,
    type: 'konversi',
    note: `Sample ${sample.id} dikaitkan ke ${invoiceId}`,
    user,
  });
  audit(db, user, 'konversi_sample', 'sample', sample.id, invoiceId);
  return sample;
}

export function sampleQualifyingPurchase(db, sample) {
  if (sample.linkedInvoiceId) {
    const inv = requireInvoice(db, sample.linkedInvoiceId);
    return inv.status === 'posted' ? inv : null;
  }
  const candidates = db.invoices.filter(
    (i) => i.customerId === sample.customerId && i.status === 'posted' && i.date >= sample.date,
  );
  return candidates[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Deposits                                                                   */
/* -------------------------------------------------------------------------- */

export const DEPOSIT_KIND = {
  indent: { label: 'Indent', tone: 'info' },
  sample: { label: 'Sample', tone: 'copper' },
};

export function getDeposit(db, id) {
  return db.deposits.find((d) => d.id === id) ?? null;
}

export function depositBalance(deposit) {
  return Math.max(0, deposit.amount - deposit.applied - deposit.refunded);
}

export function createDeposit(db, { customerId, kind = 'indent', amount, date = todayJakarta(), sampleId = null, note = '', user }) {
  requireCustomer(db, customerId);
  const value = money(amount);
  assert(value > 0, 'INVALID_AMOUNT', 'Nominal deposit harus lebih dari 0.');
  assert(['indent', 'sample'].includes(kind), 'INVALID_KIND', 'Jenis deposit tidak dikenal.');
  const deposit = {
    id: nextId(db, 'deposit', 'DEP', 4),
    customerId,
    kind,
    sampleId,
    amount: value,
    applied: 0,
    refunded: 0,
    receivedAt: date,
    note,
    status: 'open',
    ledger: [{ at: isoNow(), type: 'receive', amount: value, ref: '', by: user?.name ?? 'Sistem', note: 'Deposit diterima' }],
    createdAt: isoNow(),
  };
  db.deposits.unshift(deposit);
  logActivity(db, {
    customerId,
    type: 'deposit',
    note: `Deposit ${DEPOSIT_KIND[kind].label} ${deposit.id} diterima`,
    user,
    date,
  });
  audit(db, user, 'terima_deposit', 'deposit', deposit.id, `${kind} ${value}`);
  return deposit;
}

export function applyDepositToInvoice(db, { depositId, invoiceId, amount, user }) {
  const deposit = getDeposit(db, depositId);
  assert(deposit, 'DEPOSIT_NOT_FOUND', 'Deposit tidak ditemukan.');
  assert(deposit.kind !== 'sample', 'DEPOSIT_REFUND_ONLY',
    'Deposit sample hanya dapat direfund setelah pembelian terkait; tidak dapat dialokasikan ke faktur.');
  const inv = requireInvoice(db, invoiceId);
  assert(inv.status === 'posted', 'INVALID_STATUS', 'Deposit hanya dapat dialokasikan ke faktur terbit.');
  assert(inv.customerId === deposit.customerId, 'CUSTOMER_MISMATCH', 'Deposit milik pelanggan lain.');
  const value = money(amount);
  const balance = depositBalance(deposit);
  assert(value > 0, 'INVALID_AMOUNT', 'Nominal alokasi harus lebih dari 0.');
  assert(value <= balance, 'DEPOSIT_EXCEEDED', `Saldo deposit hanya ${balance}.`);
  assert(value <= invoiceOutstanding(inv), 'OVERPAYMENT', 'Alokasi melebihi sisa tagihan faktur.');

  deposit.applied += value;
  deposit.ledger.push({ at: isoNow(), type: 'apply', amount: value, ref: invoiceId, by: user?.name ?? 'Sistem', note: 'Dialokasikan ke faktur' });
  inv.depositApplied = (inv.depositApplied ?? 0) + value;
  if (depositBalance(deposit) === 0) deposit.status = 'cleared';
  audit(db, user, 'alokasi_deposit', 'deposit', deposit.id, `${value} → ${invoiceId}`);
  return deposit;
}

/**
 * Refund is only allowed against the remaining balance. Sample deposits require
 * a qualifying linked purchase; indent refunds require a manager.
 */
export function refundDeposit(db, { depositId, amount, reason, user, date = todayJakarta() }) {
  const deposit = getDeposit(db, depositId);
  assert(deposit, 'DEPOSIT_NOT_FOUND', 'Deposit tidak ditemukan.');
  const value = money(amount);
  const balance = depositBalance(deposit);
  assert(value > 0, 'INVALID_AMOUNT', 'Nominal refund harus lebih dari 0.');
  assert(value <= balance, 'DEPOSIT_EXCEEDED', `Refund melebihi saldo deposit (${balance}).`);
  assert(reason && reason.trim().length >= 3, 'REASON_REQUIRED', 'Alasan refund wajib diisi.');

  if (deposit.kind === 'sample') {
    const sample = deposit.sampleId ? getSample(db, deposit.sampleId) : null;
    assert(sample, 'SAMPLE_NOT_FOUND', 'Sample terkait deposit tidak ditemukan.');
    assert(sampleQualifyingPurchase(db, sample), 'NO_QUALIFYING_PURCHASE',
      'Deposit sample hanya dapat direfund setelah ada pembelian yang dikaitkan.');
  } else {
    assert(user?.role === 'manager', 'FORBIDDEN', 'Refund deposit indent memerlukan persetujuan manajer.');
  }

  deposit.refunded += value;
  deposit.ledger.push({ at: isoNow(), type: 'refund', amount: value, ref: '', by: user?.name ?? 'Sistem', note: reason.trim(), date });
  deposit.status = depositBalance(deposit) === 0 ? 'refunded' : 'partial';
  logActivity(db, {
    customerId: deposit.customerId,
    type: 'refund',
    note: `Refund ${deposit.id} sebesar ${value}: ${reason.trim()}`,
    user,
    date,
  });
  audit(db, user, 'refund_deposit', 'deposit', deposit.id, `${value} · ${reason.trim()}`);
  return deposit;
}

export function customerDeposits(db, customerId) {
  return db.deposits.filter((d) => d.customerId === customerId);
}

export function customerOpenDepositTotal(db, customerId) {
  return customerDeposits(db, customerId).reduce((acc, d) => acc + depositBalance(d), 0);
}

export function sampleConversionRate(db) {
  const total = db.samples.length;
  const converted = db.samples.filter((s) => s.status === 'converted' || s.linkedInvoiceId).length;
  return { total, converted, rate: total ? (converted / total) * 100 : 0 };
}
