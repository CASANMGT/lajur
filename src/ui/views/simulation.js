/** Panel Simulasi Data — dataset terpisah, siklus 60 → 10 → 50 → pembayaran. */

import { esc, icon, fmt, badge, toast, openModal } from '../dom.js';
import { MM_PER_M } from '../../domain/core.js';
import { USERS } from '../../domain/seed.js';
import { CYCLE_STEPS, cycleSummary, runCycle } from '../../data/simulation.js';
import { pageHead, statCard } from './common.js';

export function render(ctx) {
  const { db, dataset, role } = ctx;
  const summary = dataset === 'sim' ? cycleSummary(db) : null;
  const step = summary?.step ?? 0;

  return `
    ${pageHead({
      eyebrow: 'Uji alur',
      title: 'Simulasi Data',
      sub: 'Dataset terpisah dari data utama. Anda bisa mengulang siklus tanpa menyentuh data operasional.',
      actions: dataset === 'sim'
        ? `<button class="btn btn-copper" type="button" data-act="run">${icon('play')} ${summary && summary.step < 3 ? 'Lanjutkan siklus' : summary ? 'Jalankan siklus lagi' : 'Mulai siklus'}</button>
           <button class="btn" type="button" data-act="exit">${icon('logout')} Kembali ke data utama</button>`
        : `<button class="btn btn-primary" type="button" data-act="start">${icon('flask')} Mulai simulasi</button>`,
    })}
    <div class="notice ${dataset === 'sim' ? 'notice-warn' : 'notice-teal'}" style="margin-bottom:16px">
      ${icon('flask')}
      <div>
        <strong>${dataset === 'sim' ? 'Simulasi aktif.' : 'Anda berada di data utama.'}</strong>
        ${dataset === 'sim'
          ? ' Semua perubahan di sini disimpan di kunci localStorage terpisah; kembali ke data utama kapan pun.'
          : ' Simulasi membuat dataset contoh sendiri (inventori, proyek, pembelian, sample, deposit, retur, permintaan gudang) tanpa mengubah data utama.'}
      </div>
    </div>

    <div class="grid grid-main">
      <div class="stack">
        <section class="card card-pad">
          <div class="row-between">
            <h2>Siklus wajib: 60 → 10 → 50 → pembayaran</h2>
            ${badge(dataset === 'sim' ? 'Dataset simulasi' : 'Belum aktif', dataset === 'sim' ? 'copper' : 'muted')}
          </div>
          <div class="flow" style="margin-top:14px">
            ${CYCLE_STEPS.map((s, i) => `<div class="flow-step ${i < step ? 'done' : i === step && step < 3 ? 'current' : ''}">
              <strong>${i + 1}. ${esc(s.label)}</strong>${esc(s.detail)}
            </div>`).join('')}
          </div>

          ${summary ? `
            <div class="grid grid-3" style="margin-top:14px">
              <div class="stat" style="box-shadow:none"><div class="label">Roll</div><div class="value" style="font-size:1.15rem">${summary.roll ? `<a href="#/stok/${summary.roll.id}">${esc(summary.roll.id)}</a>` : '—'}</div><div class="meta">${summary.roll ? `${fmt.m(summary.roll.originalMm)} awal` : ''}</div></div>
              <div class="stat" style="box-shadow:none"><div class="label">Sisa setelah potong</div><div class="value" style="font-size:1.15rem">${summary.remainingMm !== null ? fmt.m(summary.remainingMm) : '—'}</div><div class="meta">${summary.remainingMm !== null ? 'fisik saat ini' : ''}</div></div>
              <div class="stat" style="box-shadow:none"><div class="label">Faktur</div><div class="value" style="font-size:1.15rem">${summary.invoice ? `<a href="#/penjualan/${summary.invoice.id}">${esc(summary.invoice.id)}</a>` : '—'}</div><div class="meta">${summary.invoice ? fmt.money(summary.total) : ''}</div></div>
            </div>
            ${summary.step >= 3 ? `<div class="notice notice-teal" style="margin-top:14px">${icon('check')}<div><strong>Siklus selesai.</strong> 60 m diterima, 10 m terjual, sisa 50 m, pembayaran ${fmt.money(summary.paymentAmount)} tercatat. Ulangi untuk menguji beberapa siklus.</div></div>` : ''}
            <hr class="divider" />
            <div class="xs muted">Log siklus #${summary.run}</div>
            <ul class="timeline" style="margin-top:8px">
              ${(summary.log ?? []).map((l) => `<li><div class="t-head"><strong>Langkah ${l.step + 1}</strong><time>${esc(new Date(l.at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }))}</time></div><div class="t-body">${esc(l.text)}</div></li>`).join('') || '<li class="muted small">Belum dijalankan.</li>'}
            </ul>
          ` : `<div class="empty" style="padding:32px 16px">${icon('flask')}<strong>Simulasi belum dibuat</strong><p>Mulai untuk membuat dataset kedua yang terpisah dari data utama.</p></div>`}
        </section>

        <section class="card card-pad">
          <h2>Yang diuji</h2>
          <ul class="small muted" style="padding-left:16px;margin:8px 0 0;line-height:1.7">
            <li>Penerimaan 60 m membuat roll baru dengan lot dan harga pokok.</li>
            <li>Potongan 10 m mempertahankan identitas roll induk dan membuat piece terjual.</li>
            <li>Sisa 50 m berasal dari record yang sama — bukan angka hardcode.</li>
            <li>Pembayaran sebagian 40% mengurangi sisa tagihan, bukan omzet baru.</li>
            <li>Data utama tidak berubah; kunci penyimpanan berbeda.</li>
          </ul>
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad">
          <h2>Status dataset</h2>
          <div class="stack-sm" style="margin-top:10px">
            <div class="row-between"><span class="small muted">Aktif</span><span class="small">${esc(db.meta.label)}</span></div>
            <div class="row-between"><span class="small muted">Roll</span><span class="small">${db.rolls.length}</span></div>
            <div class="row-between"><span class="small muted">Faktur</span><span class="small">${db.invoices.length}</span></div>
            <div class="row-between"><span class="small muted">Permintaan gudang</span><span class="small">${db.transfers.length}</span></div>
            <div class="row-between"><span class="small muted">Sample</span><span class="small">${db.samples.length}</span></div>
            <div class="row-between"><span class="small muted">Deposit</span><span class="small">${db.deposits.length}</span></div>
          </div>
          ${dataset === 'sim' ? `<hr class="divider" />
            <div class="row">
              <button class="btn btn-sm" type="button" data-act="exit">${icon('logout')} Data utama</button>
              <button class="btn btn-sm btn-danger" type="button" data-act="reset">${icon('refresh')} Reset simulasi</button>
            </div>` : ''}
        </section>

        <section class="card card-pad">
          <h2>Batas simulasi</h2>
          <p class="small muted" style="margin-top:8px">Data disimpan di localStorage perangkat. Tidak ada autentikasi, sinkronisasi, atau transaksi bersama. Jangan masukkan data pelanggan nyata.</p>
          <div class="notice notice-info" style="margin-top:10px">${icon('alert')}<div>Simulasi memakai satu peran manajer internal untuk menyetujui PO dan transfer, karena alur demo membutuhkan persetujuan.</div></div>
        </section>
      </div>
    </div>`;
}

export function openSimulationPrompt(ctx) {
  const hasSim = ctx.store.simExists;
  openModal({
    title: 'Simulasi Data',
    description: 'Dataset terpisah dengan alur yang saling terhubung. Data utama tetap utuh.',
    submitLabel: hasSim ? 'Lanjutkan simulasi' : 'Mulai simulasi',
    extraFooter: hasSim ? `<button class="btn" type="button" data-reset-sim>Mulai ulang</button>` : '',
    body: `
      <div class="stack-sm">
        <div class="notice notice-teal">${icon('flask')}<div><strong>Siklus 60 → 10 → 50 → pembayaran.</strong> Terima satu roll 60 m, jual 10 m, lihat sisa 50 m, lalu catat pembayaran sebagian.</div></div>
        <p class="small muted">Simulasi memakai penyimpanan terpisah. Semua modul (stok, transfer, pembelian, proyek, sample, deposit, retur) memakai record yang saling terhubung di dataset simulasi.</p>
        ${hasSim ? `<p class="xs muted">Sesi simulasi sebelumnya ditemukan dan bisa dilanjutkan.</p>` : ''}
      </div>`,
    onMount(form, close) {
      form.querySelector('[data-reset-sim]')?.addEventListener('click', () => {
        ctx.store.resetSimulation();
        close();
        window.location.hash = '#/simulasi';
        toast('Simulasi direset dengan dataset baru.', { tone: 'success' });
      });
    },
    onSubmit(form, close) {
      ctx.store.ensureSimulation();
      close();
      window.location.hash = '#/simulasi';
      toast('Simulasi aktif. Data utama tidak berubah.', { tone: 'success' });
    },
  });
}

export function mount(ctx) {
  document.querySelector('[data-act="start"]')?.addEventListener('click', () => {
    ctx.store.ensureSimulation();
    toast('Dataset simulasi dibuat. Data utama tetap aman.', { tone: 'success' });
  });
  document.querySelector('[data-act="exit"]')?.addEventListener('click', () => {
    ctx.store.switchDataset('main');
    toast('Kembali ke data utama.', { tone: 'success' });
  });
  document.querySelector('[data-act="reset"]')?.addEventListener('click', () => {
    ctx.store.resetSimulation();
    toast('Simulasi direset.', { tone: 'success' });
  });
  document.querySelector('[data-act="run"]')?.addEventListener('click', () => {
    try {
      const state = ctx.store.update((db) => runCycle(db, { user: ctx.user, manager: USERS.manager, restart: false }));
      const done = state.step >= 3;
      toast(done ? 'Siklus selesai: 60 m → 10 m → 50 m → pembayaran sebagian.' : 'Siklus dilanjutkan.', { tone: 'success' });
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  });
}
