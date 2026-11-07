/** Guided simulation cycle: receive 60 m → sell 10 m → 50 m left → partial payment. */

import { byId, MM_PER_M, todayJakarta } from '../domain/core.js';
import { approvePO, createPO, receivePO } from '../domain/purchasing.js';
import { createInvoice, postInvoice, recordPayment } from '../domain/sales.js';

export const CYCLE_STEPS = [
  { key: 'receive', label: 'Terima 60 m', detail: 'PO pemasok + satu roll 60 m masuk gudang.' },
  { key: 'sell', label: 'Jual 10 m', detail: 'Potong dari roll yang sama; sisa 50 m.' },
  { key: 'pay', label: 'Pembayaran sebagian', detail: 'Catat 40% pembayaran dummy.' },
];

export function cycleOf(db) {
  return db.meta.demoCycle ?? null;
}

/** Advance the cycle as far as possible. Returns the updated cycle state. */
export function runCycle(db, { user, manager, restart = false }) {
  const existing = cycleOf(db);
  let state = existing;
  if (!existing || existing.step >= 3 || restart) {
    state = {
      run: (existing?.run ?? 0) + 1,
      step: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      poId: null,
      receiptId: null,
      rollId: null,
      invoiceId: null,
      paymentId: null,
      paymentAmount: 0,
      log: [],
    };
    db.meta.demoCycle = state;
  }

  const wh = 'wh-jkt';
  const customerId = 'CUS-0002';
  const skuId = 'sku-luna-01';

  if (state.step === 0) {
    const po = createPO(db, {
      supplierId: 'SUP-001',
      date: todayJakarta(),
      expectedDate: todayJakarta(),
      termsDays: 30,
      lines: [{ kind: 'fabric', skuId, qtyMm: 60000, unitPrice: 68000 }],
      note: `Siklus simulasi #${state.run}`,
      user,
    });
    approvePO(db, { id: po.id, user: manager });
    const ref = `SIM-GR-${state.run}-${db.goodsReceipts.length + 1}`;
    const { receipt } = receivePO(db, {
      poId: po.id,
      ref,
      date: todayJakarta(),
      warehouseId: wh,
      lines: [{ poLineId: po.lines[0].id, lots: [{ lot: `SIM-LOT-${state.run}`, lengthsMm: [60000] }] }],
      user,
      note: 'Penerimaan simulasi 60 m',
    });
    state.poId = po.id;
    state.receiptId = receipt.id;
    state.rollId = receipt.lines[0].rollIds[0];
    state.step = 1;
    state.log.push({ at: new Date().toISOString(), step: 0, text: `Roll ${state.rollId} diterima 60 m (${receipt.id}).` });
  }

  if (state.step === 1) {
    const inv = createInvoice(db, {
      customerId,
      date: todayJakarta(),
      dueDays: 14,
      lines: [{ kind: 'fabric', rollId: state.rollId, qtyMm: 10000, unitPrice: 125000 }],
      notes: 'Simulasi: potong 10 m dari roll 60 m.',
      user,
    });
    postInvoice(db, { id: inv.id, user });
    state.invoiceId = inv.id;
    state.step = 2;
    const roll = byId(db.rolls, state.rollId);
    state.log.push({ at: new Date().toISOString(), step: 1, text: `Faktur ${inv.id}: 10 m keluar, sisa ${roll.currentMm / MM_PER_M} m.` });
  }

  if (state.step === 2) {
    const inv = db.invoices.find((i) => i.id === state.invoiceId);
    const amount = Math.round(inv.total * 0.4);
    const pay = recordPayment(db, {
      invoiceId: inv.id,
      amount,
      method: 'transfer',
      reference: `SIM-PAY-${state.run}`,
      date: todayJakarta(),
      user,
      note: 'Pembayaran dummy 40%',
    });
    state.paymentId = pay.id;
    state.paymentAmount = amount;
    state.step = 3;
    state.completedAt = new Date().toISOString();
    state.log.push({ at: new Date().toISOString(), step: 2, text: `Pembayaran ${amount} dicatat (${pay.id}).` });
  }

  return state;
}

export function cycleSummary(db) {
  const state = cycleOf(db);
  if (!state) return null;
  const roll = state.rollId ? db.rolls.find((r) => r.id === state.rollId) : null;
  const invoice = state.invoiceId ? db.invoices.find((i) => i.id === state.invoiceId) : null;
  return {
    ...state,
    roll,
    invoice,
    remainingMm: roll?.currentMm ?? null,
    paid: invoice?.payments?.reduce((a, p) => a + p.amount, 0) ?? 0,
    total: invoice?.total ?? 0,
  };
}
