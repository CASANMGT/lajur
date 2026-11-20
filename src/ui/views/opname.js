/** Stock opname: hitung buta, review, posting penyesuaian. */

import { esc, icon, fmt, badge, toast, openModal, field, confirmAction, printDocument, promptText } from '../dom.js';
import { byId, parseM, todayJakarta } from '../../domain/core.js';
import {
  OPNAME_STATUS, approveOpname, cancelOpname, getSession, opnameSummary, saveCounts, startOpname,
  submitOpname,
} from '../../domain/opname.js';
import { pageHead, statCard, warehouseOf, can, warehouseOptions, roleHint } from './common.js';
import { printOpnameHtml } from './print.js';
import { scanAwbImage } from '../awb.js';

export function render(ctx) {
  if (ctx.route.id) return renderDetail(ctx);

  const { db, role } = ctx;
  const active = db.opnameSessions.filter((s) => ['counting', 'review'].includes(s.status));
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
  const reviewing = s.status === 'review';
  const counting = s.status === 'counting';
  const posted = s.status === 'posted';

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
    const variance = line.countedMm === null ? null : line.countedMm - line.expectedMm;
    const status = line.countedMm === null
      ? badge('Belum dicek', 'muted')
      : line.countedMm <= 0
        ? badge('Tidak ada', 'danger')
        : badge(`Ada · ${fmt.m(line.countedMm)}`, 'ok');
    return `<tr data-opname-row data-collection="${esc(collectionName)}" data-motif="${esc(motifName)}">
      <td><span class="mono strong">${esc(line.rollId)}</span><div class="xs muted">${esc(line.lot)}</div></td>
      <td>${esc(collectionName)} · ${esc(motifName)}<div class="xs muted">${esc(sku?.code)}${roll?.bin ? ` · Rak ${esc(roll.bin)}` : ''}</div></td>
      ${counting ? `<td class="num" style="width:140px"><input class="input" style="min-height:38px;text-align:right" inputmode="decimal" data-count="${line.rollId}" value="${line.countedMm === null ? '' : esc(String(line.countedMm / 1000).replace('.', ','))}" placeholder="0" aria-label="Hitungan ${esc(line.rollId)}" /></td>` : `<td class="num">${line.countedMm === null ? '—' : fmt.m(line.countedMm)}</td>`}
      <td data-opname-status>${status}</td>
      ${reviewing || posted ? `<td class="num muted">${fmt.m(line.expectedMm)}</td><td class="num ${variance ? 'strong' : ''}">${variance === null ? '—' : fmt.m(variance, { signed: true })}</td>` : ''}
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
        ${counting && can(role, 'opname.count') ? `<button class="btn" type="button" data-act="scan">${icon('scan')} Scan QR</button><button class="btn" type="button" data-act="save">${icon('download')} Simpan draf</button><button class="btn btn-primary" type="button" data-act="submit">${icon('arrow')} Ajukan review</button>` : ''}
        ${reviewing && can(role, 'opname.approve') ? `<button class="btn btn-primary" type="button" data-act="approve">${icon('check')} Setujui & posting</button><button class="btn" type="button" data-act="recount">${icon('refresh')} Hitung ulang</button>` : ''}
        ${['counting', 'review'].includes(s.status) ? `<button class="btn btn-ghost" type="button" data-act="cancel">Batalkan sesi</button>` : ''}
        ${posted ? `<button class="btn" type="button" data-act="print">${icon('printer')} Berita acara</button>` : ''}
      </div>
    </div>

    ${counting || reviewing ? `<div class="notice notice-warn" style="margin-bottom:14px">${icon('alert')}<div><strong>Gudang ${esc(wh?.code)} dibekukan.</strong> Penjualan, penerimaan, transfer keluar/masuk, dan retur diblokir sampai sesi selesai. ${reviewing ? 'Operator tidak melihat saldo sistem saat menghitung.' : ''}</div></div>` : ''}
    ${posted ? `<div class="notice notice-teal" style="margin-bottom:14px">${icon('check')}<div><strong>Diposting ${esc(new Date(s.postedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}.</strong> ${esc(s.approveReason)}</div></div>` : ''}

    <div class="kpi-strip" style="margin-bottom:16px">
      ${statCard({ label: 'Baris', value: String(sum.lines), meta: `${sum.countedLines} sudah dihitung` })}
      ${statCard({ label: 'Progres', value: `${Math.round((sum.countedLines / Math.max(1, sum.lines)) * 100)}%`, meta: 'Kelengkapan wajib 100%' })}
      ${statCard({ label: 'Selisih meter', value: sum.complete ? fmt.m(sum.varianceMm, { signed: true }) : '—', meta: 'Tersembunyi saat hitung', tone: 'warn' })}
      ${statCard({ label: 'Penyesuaian', value: String(s.adjustments?.length ?? 0), meta: 'Baris diposting' })}
    </div>

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
        <span class="small muted" data-opname-count>${sortedLines.length} roll</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Roll / lot</th><th>Koleksi · motif</th><th class="num">Hitungan</th><th>Status</th>${reviewing || posted ? '<th class="num">Sistem</th><th class="num">Selisih</th>' : ''}</tr></thead>
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
  const frozen = db.opnameSessions.filter((s) => ['counting', 'review'].includes(s.status)).map((s) => s.warehouseId);
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
  let stopCamera = () => {};
  openModal({
    title: 'Scan QR roll',
    description: 'Arahkan kamera ke QR tag roll. Setelah ditemukan, masukkan panjang fisik dalam meter.',
    submitLabel: 'Tutup',
    wide: true,
    body: `<div class="stack">
      <video data-qr-video autoplay muted playsinline style="width:100%;max-height:320px;border-radius:10px;background:#172b3a;object-fit:cover"></video>
      <p class="small" data-qr-status>Meminta izin kamera…</p>
      ${field('Atau ketik roll ID', `<div class="row"><input class="input" name="manual" placeholder="RL-0029" /><button class="btn" type="button" data-scan-manual>${icon('scan')} Cari</button></div>`)}
      ${field('Atau upload foto QR', `<input class="input" type="file" name="qrFile" accept="image/*" />`, { hint: 'Berguna bila kamera tidak tersedia.' })}
      <div class="notice notice-info">${icon('alert')}<div>QR tag berisi URL <span class="mono">#/scan/ROLL-ID</span>. Roll yang tidak ada di sesi ini akan ditolak.</div></div>
    </div>`,
    onMount(form, close) {
      const video = form.querySelector('[data-qr-video]');
      const status = form.querySelector('[data-qr-status]');
      const handle = (raw) => {
        const text = String(raw ?? '').trim();
        if (!text) return;
        const id = text.match(/\/scan\/([^/?#]+)/)?.[1] ?? text.toUpperCase();
        const line = session.lines.find((row) => row.rollId.toUpperCase() === id.toUpperCase());
        if (!line) {
          status.textContent = `Roll ${id} tidak ada di sesi opname ini.`;
          status.className = 'small danger';
          return;
        }
        stopCamera();
        close();
        onFound(line);
      };
      form.querySelector('[data-scan-manual]')?.addEventListener('click', () => handle(form.manual.value));
      form.manual?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); handle(form.manual.value); }
      });
      form.qrFile?.addEventListener('change', async () => {
        const file = form.qrFile.files?.[0];
        if (!file) return;
        status.textContent = 'Membaca QR…';
        try {
          const result = await scanAwbImage(file);
          handle(result.text || result.trackingRef);
        } catch (err) {
          status.textContent = err.message;
          status.className = 'small danger';
        }
      });
      if (!navigator.mediaDevices?.getUserMedia) {
        status.textContent = 'Kamera tidak tersedia di browser ini. Gunakan input manual atau upload foto QR.';
        status.className = 'small warn';
        return;
      }
      if (typeof window.BarcodeDetector !== 'function') {
        status.textContent = 'Browser ini belum mendukung pemindaian kamera. Gunakan input manual atau upload foto QR.';
        status.className = 'small warn';
        return;
      }
      let stream;
      let raf = 0;
      let detector;
      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
          video.srcObject = stream;
          await video.play();
          detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          status.textContent = 'Arahkan kamera ke QR tag roll…';
          const tick = async () => {
            try {
              const codes = await detector.detect(video);
              if (codes.length) { handle(codes[0].rawValue); return; }
            } catch { /* keep scanning */ }
            raf = requestAnimationFrame(tick);
          };
          tick();
        } catch (err) {
          status.textContent = `Kamera tidak dapat dibuka: ${err.message}. Gunakan input manual atau upload foto QR.`;
          status.className = 'small warn';
        }
      })();
      stopCamera = () => {
        cancelAnimationFrame(raf);
        if (stream) stream.getTracks().forEach((track) => track.stop());
        if (video) video.srcObject = null;
      };
    },
    onClose() { stopCamera(); },
    onSubmit(form, close) { close(); },
  });
}

function collectCounts() {
  return [...document.querySelectorAll('[data-count]')].map((input) => ({
    rollId: input.dataset.count,
    countedMm: input.value.trim() ? parseM(input.value) : null,
  }));
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
    const refreshFilter = () => {
      const collection = collectionSel?.value ?? '';
      const motif = motifSel?.value ?? '';
      let visible = 0;
      for (const row of rows) {
        const show = (!collection || row.dataset.collection === collection) && (!motif || row.dataset.motif === motif);
        row.hidden = !show;
        if (show) visible += 1;
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
    document.querySelectorAll('[data-count]').forEach((input) => input.addEventListener('input', () => {
      const cell = input.closest('tr')?.querySelector('[data-opname-status]');
      if (!cell) return;
      const raw = input.value.trim();
      if (!raw) { cell.innerHTML = badge('Belum dicek', 'muted'); return; }
      const mm = parseM(raw);
      cell.innerHTML = mm <= 0 ? badge('Tidak ada', 'danger') : badge(`Ada · ${fmt.m(mm)}`, 'ok');
    }));
    document.querySelector('[data-act="scan"]')?.addEventListener('click', () => {
      openQrScan(ctx, s, (line) => {
        if (collectionSel) { collectionSel.value = line.collectionName ?? ''; rebuildMotifs(); }
        if (motifSel) { motifSel.value = line.motifName ?? ''; refreshFilter(); }
        setTimeout(() => {
          const input = document.querySelector(`[data-count="${line.rollId}"]`);
          if (input) {
            input.scrollIntoView({ block: 'center', behavior: 'smooth' });
            input.focus();
            input.select();
            input.classList.add('scan-hit');
            setTimeout(() => input.classList.remove('scan-hit'), 1800);
          }
          toast(`Roll ${line.rollId} ditemukan · lot ${line.lot}. Masukkan panjang fisik.`, { tone: 'success' });
        }, 80);
      });
    });
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
