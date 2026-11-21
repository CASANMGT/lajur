/** Stock opname: hitung buta, review, posting penyesuaian. */

import { esc, icon, fmt, badge, toast, openModal, field, confirmAction, printDocument, promptText } from '../dom.js';
import { byId, parseM, todayJakarta } from '../../domain/core.js';
import {
  OPNAME_STATUS, approveOpname, cancelOpname, getSession, opnameResult, opnameSummary, saveCounts,
  startOpname, startOpnameInvestigation, submitOpname,
} from '../../domain/opname.js';
import { pageHead, statCard, warehouseOf, can, warehouseOptions, roleHint } from './common.js';
import { printOpnameHtml } from './print.js';
import { openQrScanner } from '../qr-scanner.js';

export function render(ctx) {
  if (ctx.route.id) return renderDetail(ctx);

  const { db, role } = ctx;
  const active = db.opnameSessions.filter((s) => ['counting', 'review', 'investigation'].includes(s.status));
  const history = db.opnameSessions.filter((s) => ['posted', 'cancelled'].includes(s.status));
  const lastPosted = history.find((s) => s.status === 'posted');

  return `
    ${pageHead({
      eyebrow: 'Kontrol stok',
      title: 'Stock opname',
      sub: 'Sesi per gudang, hitung buta, review selisih, lalu posting penyesuaian dengan alasan.',
      actions: `${can(role, 'opname.start') ? `<button class="btn btn-primary" type="button" data-act="new">${icon('plus')} Mulai opname</button>` : ''}`,
    })}
    ${active.length ? active.map((s) => `<div class="notice notice-warn" style="margin-bottom:12px">${icon('clipboard')}<div><strong>${esc(s.id)} · ${esc(warehouseOf(db, s.warehouseId)?.name)}</strong><br>Gudang dibekukan untuk mutasi fisik sampai sesi selesai. <a href="#/opname/${s.id}">Buka sesi →</a></div></div>`).join('') : `<div class="notice notice-teal" style="margin-bottom:12px">${icon('check')}<div>Tidak ada sesi aktif. Mutasi gudang berjalan normal.</div></div>`}

    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Sesi aktif', value: String(active.length), meta: 'Membekukan mutasi fisik', tone: active.length ? 'warn' : 'accent', iconName: 'clipboard' })}
      ${statCard({ label: 'Sesi tersimpan', value: String(db.opnameSessions.length), meta: 'Riwayat permanen' })}
      ${statCard({ label: 'Selisih terakhir', value: lastPosted ? fmt.m(opnameSummary(lastPosted).varianceMm, { signed: true }) : '—', meta: lastPosted ? `disetujui ${esc(lastPosted.postedBy)}` : 'Belum ada' })}
      ${statCard({ label: 'Gudang', value: String(db.warehouses.length), meta: 'Satu sesi aktif per gudang' })}
    </div>

    <section class="card">
      <div class="card-head"><div><h2>Riwayat sesi</h2><p>Hitung buta, keputusan, dan penyesuaian tersimpan permanen.</p></div></div>
      <div class="table-wrap desktop-table">
        <table class="data">
          <thead><tr><th>Sesi</th><th>Gudang</th><th class="hide-sm">Mulai</th><th>Status</th><th class="num">Baris</th><th class="num">Selisih</th><th class="num">Penyesuaian</th></tr></thead>
          <tbody>${db.opnameSessions.map((s) => {
            const sum = opnameSummary(s);
            return `<tr data-href="#/opname/${s.id}" tabindex="0" role="link">
              <td class="mono">${esc(s.id)}</td>
              <td>${esc(warehouseOf(db, s.warehouseId)?.code)}</td>
              <td class="hide-sm">${esc(s.startedDate)}</td>
              <td>${badge(OPNAME_STATUS[s.status].label, OPNAME_STATUS[s.status].tone)}</td>
              <td class="num">${sum.countedLines}/${sum.lines}</td>
              <td class="num">${sum.complete ? fmt.m(sum.varianceMm, { signed: true }) : '—'}</td>
              <td class="num">${s.adjustments?.length ?? 0}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="7"><div class="empty">${icon('clipboard')}<strong>Belum ada sesi</strong></div></td></tr>`}</tbody>
        </table>
      </div>
      <div class="mobile-cards">
        ${db.opnameSessions.map((s) => {
          const sum = opnameSummary(s);
          return `<a class="roll-card" href="#/opname/${s.id}" style="color:inherit;text-decoration:none">
            <div class="top"><span class="id">${esc(s.id)}</span>${badge(OPNAME_STATUS[s.status].label, OPNAME_STATUS[s.status].tone)}</div>
            <div class="small strong">${esc(warehouseOf(db, s.warehouseId)?.name)}</div>
            <div class="xs muted">${esc(s.startedDate)} · ${sum.countedLines}/${sum.lines} dihitung</div>
            <div class="grid3">
              <div class="kv"><span>Selisih</span><strong>${sum.complete ? fmt.m(sum.varianceMm, { signed: true }) : '—'}</strong></div>
              <div class="kv"><span>Penyesuaian</span><strong>${s.adjustments?.length ?? 0}</strong></div>
              <div class="kv"><span>Oleh</span><strong class="xs">${esc(s.countedBy)}</strong></div>
            </div>
          </a>`;
        }).join('')}
      </div>
    </section>`;
}

function renderDetail(ctx) {
  const { db, role, route } = ctx;
  const s = getSession(db, route.id);
  if (!s) return `${pageHead({ title: 'Tidak ditemukan' })}<div class="notice notice-danger">${icon('alert')}<div>Opname ${esc(route.id)} tidak ada.</div></div>`;
  const wh = warehouseOf(db, s.warehouseId);
  const sum = opnameSummary(s);
  const result = opnameResult(s);
  const reviewing = s.status === 'review';
  const investigating = s.status === 'investigation';
  const counting = s.status === 'counting';
  const posted = s.status === 'posted';
  const comparison = reviewing || investigating || posted;

  const sortedLines = [...s.lines].sort((a, b) => {
    const skuA = byId(db.skus, a.skuId);
    const skuB = byId(db.skus, b.skuId);
    const collectionA = String(a.collectionName ?? skuA?.collectionName ?? '');
    const collectionB = String(b.collectionName ?? skuB?.collectionName ?? '');
    const motifA = String(a.motifName ?? skuA?.colourName ?? skuA?.colourCode ?? '');
    const motifB = String(b.motifName ?? skuB?.colourName ?? skuB?.colourCode ?? '');
    return collectionA.localeCompare(collectionB) || motifA.localeCompare(motifB) || String(a.rollId).localeCompare(String(b.rollId));
  });
  const collections = [...new Set(sortedLines.map((line) => line.collectionName ?? byId(db.skus, line.skuId)?.collectionName ?? '').filter(Boolean))].sort();
  const rows = sortedLines.map((line) => {
    const roll = db.rolls.find((r) => r.id === line.rollId);
    const sku = byId(db.skus, line.skuId);
    const collectionName = line.collectionName ?? sku?.collectionName ?? '';
    const motifName = line.motifName ?? sku?.colourName ?? sku?.colourCode ?? '';
    const effective = line.countedMm !== null ? line.countedMm : (line.present === true ? line.expectedMm : 0);
    const variance = line.present === null && line.countedMm === null ? null : effective - line.expectedMm;
    const status = line.present === null && line.countedMm === null
      ? badge('Belum dicek', 'muted')
      : line.present === false || line.countedMm === 0
        ? badge('Tidak ada', 'danger')
        : line.countedMm === null
          ? badge('Ada · meter belum diisi', 'info')
          : badge(`Ada · ${fmt.m(line.countedMm)}`, 'ok');
    return `<tr data-opname-row data-roll="${esc(line.rollId)}" data-collection="${esc(collectionName)}" data-motif="${esc(motifName)}" data-present="${line.present === true ? 'true' : line.present === false ? 'false' : ''}">
      <td><span class="mono strong">${esc(line.rollId)}</span><div class="xs muted">${esc(line.lot)}</div></td>
      <td>${esc(collectionName)} · ${esc(motifName)}<div class="xs muted">${esc(sku?.code)}${roll?.bin ? ` · Rak ${esc(roll.bin)}` : ''}</div></td>
      ${counting
        ? `<td class="num" style="width:140px"><input class="input" style="min-height:38px;text-align:right" inputmode="decimal" data-count="${line.rollId}" value="${line.countedMm === null || line.countedMm === 0 ? '' : esc(String(line.countedMm / 1000).replace('.', ','))}" placeholder="meter" aria-label="Hitungan ${esc(line.rollId)}" /></td>`
        : `<td class="num muted">${fmt.m(line.expectedMm)}</td><td class="num strong">${line.countedMm === null ? (line.present === true ? 'Ada' : '—') : fmt.m(line.countedMm)}</td><td class="num ${variance ? 'strong' : ''}">${variance === null ? '—' : fmt.m(variance, { signed: true })}</td>`}
      <td data-opname-status>${status}${line.countedBy ? `<div class="xs muted">oleh ${esc(line.countedBy)}</div>` : ''}${counting ? `<div class="row" style="gap:4px;margin-top:4px"><button class="btn btn-sm btn-ghost" type="button" data-mark-present="${line.rollId}">Ada</button><button class="btn btn-sm btn-ghost" type="button" data-mark-absent="${line.rollId}">Tidak ada</button></div>` : ''}</td>
    </tr>`;
  }).join('');

  return `
    <div class="page-head">
      <div>
        <a class="small strong" href="#/opname">← Semua opname</a>
        <div class="row" style="margin-top:6px"><h1 class="mono">${esc(s.id)}</h1>${badge(OPNAME_STATUS[s.status].label, OPNAME_STATUS[s.status].tone)}</div>
        <p class="sub">${esc(wh?.name)} · mulai ${esc(s.startedDate)} · dihitung ${esc(s.countedBy)}</p>
      </div>
      <div class="page-actions">
        ${counting && can(role, 'opname.count') ? `<button class="btn qr-mobile-only" type="button" data-act="scan">${icon('scan')} Scan QR</button><button class="btn" type="button" data-act="save">${icon('download')} Simpan draf</button><button class="btn btn-primary" type="button" data-act="submit">${icon('arrow')} Ajukan review</button>` : ''}
        ${reviewing && can(role, 'opname.approve') ? `<button class="btn btn-primary" type="button" data-act="approve">${icon('check')} Setujui & posting</button>${sum.varianceMm ? `<button class="btn btn-danger" type="button" data-act="investigate">${icon('alert')} Investigasi selisih</button>` : ''}<button class="btn" type="button" data-act="recount">${icon('refresh')} Hitung ulang</button>` : ''}
        ${investigating && can(role, 'opname.approve') ? `<button class="btn btn-primary" type="button" data-act="approve">${icon('check')} Selesaikan & posting</button><button class="btn" type="button" data-act="recount">${icon('refresh')} Hitung ulang</button>` : ''}
        ${['counting', 'review', 'investigation'].includes(s.status) ? `<button class="btn btn-ghost" type="button" data-act="cancel">Batalkan sesi</button>` : ''}
        ${posted ? `<button class="btn" type="button" data-act="print">${icon('printer')} Berita acara</button>` : ''}
      </div>
    </div>

    ${counting || reviewing || investigating ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('alert')}<div><strong>Gudang ${esc(wh?.code)} dibekukan.</strong> Penjualan, penerimaan, transfer keluar/masuk, dan retur diblokir sampai sesi selesai. ${reviewing || investigating ? 'Penghitung tidak melihat saldo sistem; supervisor membandingkan sebelum menyetujui.' : ''}</div></div>` : ''}
    ${investigating ? `<div class="notice notice-danger" style="margin-bottom:14px">${icon('alert')}<div><strong>Investigasi selisih · putaran ${s.countRound ?? 1}.</strong> ${esc(s.investigation?.note ?? '')}<br>Lakukan hitung ulang bila perlu. Penyesuaian akhir baru terjadi setelah supervisor menyetujui.</div></div>` : ''}
    ${reviewing && sum.varianceMm ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('alert')}<div><strong>Ada selisih ${fmt.m(sum.varianceMm, { signed: true })}.</strong> Supervisor dapat meminta hitung ulang, membuka investigasi, atau langsung menyetujui penyesuaian akhir.</div></div>` : ''}
    ${posted ? `<div class="notice notice-teal" style="margin-bottom:14px">${icon('check')}<div><strong>Diposting ${esc(new Date(s.postedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}.</strong> ${esc(s.approveReason)}</div></div>` : ''}

    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Baris', value: String(sum.lines), meta: `${sum.countedLines} sudah dihitung` })}
      ${statCard({ label: 'Progres', value: `${Math.round((sum.countedLines / Math.max(1, sum.lines)) * 100)}%`, meta: 'Kelengkapan wajib 100%' })}
      ${statCard({ label: 'Selisih meter', value: sum.complete ? fmt.m(sum.varianceMm, { signed: true }) : '—', meta: 'Tersembunyi saat hitung', tone: 'warn' })}
      ${statCard({ label: 'Penyesuaian', value: String(s.adjustments?.length ?? 0), meta: 'Baris diposting' })}
    </div>

    ${comparison ? `<section class="card card-pad" style="margin-bottom:16px">
      <div class="row-between"><div><h2>Hasil opname</h2><p class="xs muted">Siapa yang menghitung, berapa lama, dan apa yang hilang.</p></div>${badge(result.complete ? 'Lengkap' : 'Belum lengkap', result.complete ? 'ok' : 'warn')}</div>
      <div class="grid grid-3" style="margin-top:12px">
        <div class="kv"><span>Peserta</span><strong class="small">${result.participants.length ? result.participants.map((name) => `<span class="badge no-dot">${esc(name)}</span>`).join(' ') : '—'}</strong></div>
        <div class="kv"><span>Durasi</span><strong>${result.durationMinutes} menit</strong></div>
        <div class="kv"><span>Total dicek</span><strong>${result.countedLines}/${result.lines} roll</strong></div>
        <div class="kv"><span>Dengan meter</span><strong>${result.measuredLines} roll</strong></div>
        <div class="kv"><span>Ada tanpa meter</span><strong>${result.presenceOnly} roll</strong></div>
        <div class="kv"><span>Tidak ada</span><strong>${result.missingLines} roll</strong></div>
        <div class="kv"><span>Selisih meter</span><strong>${fmt.m(result.varianceMm, { signed: true })}</strong></div>
        <div class="kv"><span>Fisik terhitung</span><strong>${fmt.m(result.countedMm)}</strong></div>
        <div class="kv"><span>Sistem</span><strong>${fmt.m(result.expectedMm)}</strong></div>
      </div>
      ${result.missingRolls.length ? `<div class="notice notice-warn" style="margin-top:12px">${icon('alert')}<div><strong>Roll tidak ada:</strong> ${result.missingRolls.map((id) => `<span class="mono">${esc(id)}</span>`).join(', ')}</div></div>` : '<div class="notice notice-teal" style="margin-top:12px">' + icon('check') + '<div>Semua roll yang dicek ditemukan.</div></div>'}
      <div class="notice notice-info" style="margin-top:10px">${icon('alert')}<div><strong>Putaran ${s.countRound ?? 1}.</strong> Opname tidak membuat nomor RL atau lot baru. Penyesuaian hanya mengubah panjang/status roll yang sama; ID dan lot tetap.</div></div>
    </section>` : ''}

    <section class="card">
      <div class="card-head">
        <div><h2>${counting ? 'Hitung fisik (buta)' : 'Hasil hitung'}</h2><p>${counting ? 'Masukkan panjang aktual sesuai hitungan fisik di rak.' : 'Bandingkan dengan saldo sistem dan nilai selisih.'}</p></div>
        <span class="badge no-dot">${esc(wh?.code)}</span>
      </div>
      <div class="filterbar" style="padding:0 0 12px">
        <div class="field"><label for="opname-collection">Koleksi</label>
          <select class="select" id="opname-collection"><option value="">Semua koleksi</option>${collections.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label for="opname-motif">Motif / warna</label>
          <select class="select" id="opname-motif"><option value="">Semua motif</option>${[...new Set(sortedLines.map((line) => line.motifName ?? byId(db.skus, line.skuId)?.colourName ?? byId(db.skus, line.skuId)?.colourCode ?? '').filter(Boolean))].sort().map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}</select>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          ${[['all', 'Semua'], ['counted', 'Sudah dicek'], ['uncounted', 'Belum dicek']].map(([key, label]) => `<button class="chip" type="button" data-opname-state="${key}" aria-pressed="${key === 'all'}">${label} <span data-opname-state-count="${key}"></span></button>`).join('')}
        </div>
        <span class="small muted" data-opname-count>${sortedLines.length} roll</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Roll / lot</th><th>Koleksi · motif</th>${counting ? '<th class="num">Hitungan (meter)</th>' : '<th class="num">Sebelum (sistem)</th><th class="num">Hitungan fisik</th><th class="num">Selisih</th>'}<th>Status / oleh</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>

    ${posted && s.adjustments?.length ? `<div class="section-title"><h2>Penyesuaian diposting</h2><span class="small muted">Nilai memakai harga pokok roll</span></div>
      <section class="card"><div class="table-wrap"><table class="data">
        <thead><tr><th>Roll</th><th class="num">Sebelum</th><th class="num">Sesudah</th><th class="num">Selisih</th><th class="num">Dampak nilai</th><th>Alasan</th></tr></thead>
        <tbody>${s.adjustments.map((a) => `<tr>
          <td class="mono">${esc(a.rollId)}</td><td class="num">${fmt.m(a.beforeMm)}</td><td class="num">${fmt.m(a.afterMm)}</td>
          <td class="num">${fmt.m(a.varianceMm, { signed: true })}</td><td class="num">${fmt.money(a.value)}</td><td class="small muted">${esc(a.reason)}</td>
        </tr>`).join('')}</tbody>
      </table></div></section>` : ''}

    ${reviewing && !can(role, 'opname.approve') ? roleHint(role, 'opname.approve', 'Persetujuan opname hanya untuk manajer.') : ''}`;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

export function openStart(ctx) {
  const { db, role } = ctx;
  const active = db.warehouses.filter((w) => w.active !== false);
  if (!active.length) {
    toast('Tidak ada gudang aktif. Aktifkan gudang di Master Data.', { tone: 'error' });
    return;
  }
  const frozen = db.opnameSessions.filter((s) => ['counting', 'review', 'investigation'].includes(s.status)).map((s) => s.warehouseId);
  const options = db.warehouses.filter((w) => w.active !== false).map((w) => `<option value="${w.id}" ${frozen.includes(w.id) ? 'disabled' : ''}>${esc(w.name)}${frozen.includes(w.id) ? ' — sesi aktif' : ''}</option>`).join('');
  openModal({
    title: 'Mulai stock opname',
    description: 'Gudang akan dibekukan untuk mutasi fisik selama penghitungan dan review.',
    submitLabel: 'Mulai sesi',
    body: `
      ${field('Gudang', `<select class="select" name="warehouse">${options}</select>`)}
      ${field('Catatan', `<input class="input" name="note" placeholder="Contoh: opname bulanan November" />`)}
      <div class="notice notice-warn" style="margin-top:12px">${icon('alert')}<div>Snapshot diambil saat mulai. Tidak ada perubahan stok sebelum persetujuan manajer.</div></div>
    `,
    onSubmit(form, close) {
      const session = ctx.store.update((db) => startOpname(db, { warehouseId: form.warehouse.value, user: ctx.user, note: form.note.value }));
      close();
      window.location.hash = `#/opname/${session.id}`;
      toast('Sesi dimulai; gudang dibekukan.', { tone: 'success' });
    },
  });
}

function openQrScan(ctx, session, onFound) {
  openQrScanner({
    title: 'Scan QR roll',
    description: 'Arahkan kamera ke QR tag roll. Roll ditandai ada; meter opsional.',
    onResult(raw) {
      const id = String(raw).match(/\/scan\/([^/?#]+)/)?.[1] ?? String(raw).trim().toUpperCase();
      const line = session.lines.find((row) => row.rollId.toUpperCase() === id.toUpperCase());
      if (!line) return { ok: false, message: `Roll ${id} tidak ada di sesi opname ini.` };
      onFound(line);
      return { ok: true };
    },
  });
}


function collectCounts() {
  return [...document.querySelectorAll('[data-count]')].map((input) => {
    const row = input.closest('tr');
    const present = row?.dataset.present;
    return {
      rollId: input.dataset.count,
      countedMm: input.value.trim() ? parseM(input.value) : null,
      present: present === 'true' ? true : present === 'false' ? false : null,
    };
  });
}

function save(ctx, s, { submit = false } = {}) {
  ctx.store.update((db) => saveCounts(db, { sessionId: s.id, counts: collectCounts(), user: ctx.user }));
  if (submit) {
    ctx.store.update((db) => submitOpname(db, { sessionId: s.id, user: ctx.user }));
    toast('Diajukan untuk review. Stok belum diubah.', { tone: 'success' });
  } else {
    toast('Draf hitungan disimpan.', { tone: 'success' });
  }
}

export function mount(ctx) {
  if (ctx.route.id) {
    const s = getSession(ctx.db, ctx.route.id);
    if (!s) return;
    const rows = Array.from(document.querySelectorAll('[data-opname-row]'));
    const collectionSel = document.getElementById('opname-collection');
    const motifSel = document.getElementById('opname-motif');
    const countEl = document.querySelector('[data-opname-count]');
    let stateFilter = 'all';
    const rowState = (row) => {
      if (row.dataset.present === 'true' || row.dataset.present === 'false') return 'counted';
      return row.querySelector('[data-count]')?.value.trim() ? 'counted' : 'uncounted';
    };
    const updateStatus = (row) => {
      const cell = row.querySelector('[data-opname-status]');
      if (!cell) return;
      const input = row.querySelector('[data-count]');
      const raw = input?.value.trim() ?? '';
      let html;
      if (row.dataset.present === 'false') html = badge('Tidak ada', 'danger');
      else if (raw) {
        const mm = parseM(raw);
        html = mm <= 0 ? badge('Tidak ada', 'danger') : badge(`Ada · ${fmt.m(mm)}`, 'ok');
      } else if (row.dataset.present === 'true') html = badge('Ada · meter belum diisi', 'info');
      else html = badge('Belum dicek', 'muted');
      cell.querySelectorAll(':scope > .badge').forEach((el) => el.remove());
      cell.insertAdjacentHTML('afterbegin', html);
    };
    const refreshFilter = () => {
      const collection = collectionSel?.value ?? '';
      const motif = motifSel?.value ?? '';
      let visible = 0;
      const counts = { all: 0, counted: 0, uncounted: 0 };
      for (const row of rows) {
        const state = rowState(row);
        counts.all += 1;
        counts[state] += 1;
        const show = (!collection || row.dataset.collection === collection)
          && (!motif || row.dataset.motif === motif)
          && (stateFilter === 'all' || state === stateFilter);
        row.hidden = !show;
        if (show) visible += 1;
      }
      for (const [key, value] of Object.entries(counts)) {
        const el = document.querySelector(`[data-opname-state-count="${key}"]`);
        if (el) el.textContent = `(${value})`;
      }
      if (countEl) countEl.textContent = `${visible} roll`;
    };
    const rebuildMotifs = () => {
      if (!motifSel) return;
      const collection = collectionSel?.value ?? '';
      const names = [...new Set(rows.filter((row) => !collection || row.dataset.collection === collection).map((row) => row.dataset.motif).filter(Boolean))].sort();
      const previous = motifSel.value;
      motifSel.innerHTML = `<option value="">Semua motif</option>${names.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}`;
      if (names.includes(previous)) motifSel.value = previous;
      refreshFilter();
    };
    collectionSel?.addEventListener('change', rebuildMotifs);
    motifSel?.addEventListener('change', refreshFilter);
    document.querySelectorAll('[data-opname-state]').forEach((btn) => btn.addEventListener('click', () => {
      stateFilter = btn.dataset.opnameState;
      document.querySelectorAll('[data-opname-state]').forEach((chip) => chip.setAttribute('aria-pressed', String(chip === btn)));
      refreshFilter();
    }));
    document.querySelectorAll('[data-count]').forEach((input) => input.addEventListener('input', () => {
      const row = input.closest('tr');
      const raw = input.value.trim();
      if (raw) row.dataset.present = parseM(raw) <= 0 ? 'false' : 'true';
      updateStatus(row);
      refreshFilter();
    }));
    document.querySelectorAll('[data-mark-present]').forEach((btn) => btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      row.dataset.present = 'true';
      updateStatus(row);
      refreshFilter();
    }));
    document.querySelectorAll('[data-mark-absent]').forEach((btn) => btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      row.dataset.present = 'false';
      const input = row.querySelector('[data-count]');
      if (input) input.value = '';
      updateStatus(row);
      refreshFilter();
    }));
    document.querySelector('[data-act="scan"]')?.addEventListener('click', () => {
      openQrScan(ctx, s, (line) => {
        if (collectionSel) { collectionSel.value = line.collectionName ?? ''; rebuildMotifs(); }
        if (motifSel) { motifSel.value = line.motifName ?? ''; refreshFilter(); }
        setTimeout(() => {
          const input = document.querySelector(`[data-count="${line.rollId}"]`);
          if (input) {
            const row = input.closest('tr');
            row.dataset.present = 'true';
            updateStatus(row);
            refreshFilter();
            input.scrollIntoView({ block: 'center', behavior: 'smooth' });
            input.focus();
            input.select();
            input.classList.add('scan-hit');
            setTimeout(() => input.classList.remove('scan-hit'), 1800);
          }
          toast(`Roll ${line.rollId} ditandai ada · lot ${line.lot}. Isi meter bila perlu, atau simpan sebagai ada saja.`, { tone: 'success' });
        }, 80);
      });
    });
    refreshFilter();
    document.querySelector('[data-act="save"]')?.addEventListener('click', () => {
      try { save(ctx, s); } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    document.querySelector('[data-act="submit"]')?.addEventListener('click', () => {
      try { save(ctx, s, { submit: true }); } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    document.querySelector('[data-act="approve"]')?.addEventListener('click', async () => {
      const reason = await promptText({
        title: 'Setujui & posting opname',
        label: 'Alasan persetujuan / selisih',
        value: 'Diverifikasi oleh manajer.',
        hint: 'Tersimpan permanen pada sesi dan setiap penyesuaian.',
        submitLabel: 'Posting penyesuaian',
      });
      if (!reason) return;
      try {
        ctx.store.update((db) => approveOpname(db, { sessionId: s.id, user: ctx.user, reason }));
        toast('Opname diposting. Penyesuaian masuk buku mutasi.', { tone: 'success' });
      } catch (err) {
        toast(err.message, { tone: 'error' });
      }
    });
    document.querySelector('[data-act="investigate"]')?.addEventListener('click', async () => {
      const note = await promptText({
        title: 'Buka investigasi selisih',
        label: 'Temuan / rencana investigasi',
        value: 'Selisih perlu dicek ulang ke rak dan riwayat mutasi.',
        hint: 'Investigasi membekukan sesi. Setelah selesai, supervisor dapat hitung ulang atau memposting penyesuaian akhir.',
        submitLabel: 'Buka investigasi',
        tone: 'danger',
      });
      if (!note) return;
      try {
        ctx.store.update((db) => startOpnameInvestigation(db, { sessionId: s.id, user: ctx.user, note }));
        toast('Investigasi dibuka. Lakukan hitung ulang atau selesaikan penyesuaian.', { tone: 'success' });
      } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    document.querySelector('[data-act="recount"]')?.addEventListener('click', async () => {
      const ok = await confirmAction({ title: 'Minta hitung ulang?', message: 'Semua hitungan akan dikosongkan dan status kembali ke penghitungan. Gudang tetap dibekukan.', confirmLabel: 'Hitung ulang' });
      if (!ok) return;
      const reason = await promptText({
        title: 'Hitung ulang',
        label: 'Alasan hitung ulang',
        value: 'Selisih perlu diverifikasi ulang.',
        submitLabel: 'Minta hitung ulang',
        tone: 'danger',
      });
      if (!reason) return;
      try {
        ctx.store.update((db) => approveOpname(db, { sessionId: s.id, user: ctx.user, reason, recount: true }));
        toast('Sesi kembali ke penghitungan.', { tone: 'success' });
      } catch (err) { toast(err.message, { tone: 'error' }); }
    });
    document.querySelector('[data-act="cancel"]')?.addEventListener('click', async () => {
      const ok = await confirmAction({ title: 'Batalkan sesi opname?', message: 'Stok tidak berubah dan pembekuan gudang dilepas.', confirmLabel: 'Batalkan sesi', tone: 'danger' });
      if (!ok) return;
      ctx.store.update((db) => cancelOpname(db, { sessionId: s.id, user: ctx.user, reason: 'Dibatalkan dari demo' }));
      toast('Sesi dibatalkan; gudang dibuka kembali.', { tone: 'success' });
    });
    document.querySelector('[data-act="print"]')?.addEventListener('click', () => printDocument(`Opname ${s.id}`, printOpnameHtml(ctx.db, s)));
    return;
  }

  document.querySelector('[data-act="new"]')?.addEventListener('click', () => openStart(ctx));
  document.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => {
    window.location.hash = tr.dataset.href.replace('#', '');
  }));
  if (ctx.route.query?.new) {
    history.replaceState(null, '', '#/opname');
    openStart(ctx);
  }
}
