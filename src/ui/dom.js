/** UI primitives: escaping, icons, badges, modal, toast, printing. */

import { formatDate, formatDateTime, formatM, formatMoney, formatPcs } from '../domain/core.js';

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const fmt = {
  m: (mm, opts) => formatM(mm, opts),
  money: (n) => formatMoney(n),
  pcs: (n) => formatPcs(n),
  date: (d) => formatDate(d),
  datetime: (d) => formatDateTime(d),
};

const PATHS = {
  home: '<path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  box: '<path d="m3 7.5 9-4 9 4v9l-9 4-9-4z"/><path d="m3 7.5 9 4 9-4"/><path d="M12 11.5V20"/>',
  package: '<path d="m3 7.5 9-4 9 4v9l-9 4-9-4z"/><path d="m3 7.5 9 4 9-4"/><path d="M12 11.5V20"/>',
  transfer: '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
  cart: '<path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  clipboard: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M9 5V3h6v2"/><path d="M8 11h8M8 15h5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6.2"/><path d="M18 14.5a5.5 5.5 0 0 1 3.5 5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".8" fill="currentColor"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.5l3.5 2"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v7H7z"/>',
  cut: '<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8 7.5 20 18M8 16.5 20 6"/>',
  arrow: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.7"/><path d="M20 4v7h-7"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  flask: '<path d="M9 3h6M10 3v6l-5.5 9.2A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.8L14 9V3"/><path d="M7.5 15h9"/>',
  logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M14 8l4 4-4 4"/><path d="M8 12h10"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 4h16"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  truck: '<path d="M3 6h11v11H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1"/>',
  scissors: '<path d="M6 4 18 17M18 4 6 17"/><circle cx="4.5" cy="19" r="1.8"/><circle cx="19.5" cy="19" r="1.8"/>',
  pin: '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>',
  phone: '<path d="M5 3h3.5l1.5 4L8 9a12 12 0 0 0 7 7l2-2 4 1.5V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.8 2.8L16.5 9"/>',
  needle: '<path d="M4 20 20 4"/><path d="M14 4h6v6"/><path d="m11 13 3 3"/>',
  ship: '<path d="M3 15h18l-2 5H5z"/><path d="M6 15V9h9l3 6"/><path d="M9 9V6h4v3"/><path d="M12 3v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',
  yuan: '<path d="m6 4 6 8 6-8"/><path d="M12 12v8M8 14h8M8 18h8"/>',
  camera: '<path d="M4 8h4l2-2h4l2 2h4v11H4z"/><circle cx="12" cy="13" r="3.2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  listCheck: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  userCheck: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="m16 12 2 2 4-4"/>',
  spool: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4a8 8 0 0 0 8 8"/>',
  boxOpen: '<path d="m3 9 9-5 9 5-9 5z"/><path d="M3 9v9l9 5 9-5V9"/><path d="M12 14v9"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h7"/>',
};

export function icon(name, className = 'ico') {
  const path = PATHS[name] ?? PATHS.box;
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const TONE_CLASS = {
  ok: 'badge-ok',
  warn: 'badge-warn',
  danger: 'badge-danger',
  info: 'badge-info',
  teal: 'badge-teal',
  copper: 'badge-copper',
  navy: 'badge-navy',
  muted: '',
};

export function badge(label, tone = 'muted', { dot = true, className = '' } = {}) {
  return `<span class="badge ${TONE_CLASS[tone] ?? ''} ${dot ? '' : 'no-dot'} ${className}">${esc(label)}</span>`;
}

export function swatch(sku, size = '') {
  if (sku?.swatch) {
    return `<span class="swatch ${size}" style="background:${esc(sku.swatch)}" role="img" aria-label="Contoh warna ${esc(sku.colourName || sku.colourCode)}"></span>`;
  }
  return `<span class="swatch swatch-unset ${size}" role="img" aria-label="Swatch belum diset">?</span>`;
}

let fieldSeq = 0;

export function field(label, control, { hint = '', full = false, id = '' } = {}) {
  const existing = control.match(/\bid="([^"]+)"/);
  const controlId = id || existing?.[1] || `f-${++fieldSeq}`;
  let wired = control;
  if (!existing) {
    wired = control.replace(/<(input|select|textarea)\b/, `<$1 id="${controlId}"`);
  }
  return `<div class="field ${full ? 'span-2' : ''}">
    <label for="${esc(controlId)}">${esc(label)}</label>
    ${wired}
    ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}
  </div>`;
}

export function emptyState(title, message, actionHtml = '') {
  return `<div class="empty">${icon('box')}<strong>${esc(title)}</strong><p>${esc(message)}</p>${actionHtml}</div>`;
}

export function amountCell(mm, pcs) {
  if (mm !== null && mm !== undefined) return `<span class="num">${fmt.m(mm)}</span>`;
  if (pcs !== null && pcs !== undefined) return `<span class="num">${fmt.pcs(pcs)} <span class="muted xs">pcs</span></span>`;
  return '—';
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

let toastTimer = 0;

export function toast(message, { tone = 'info', title = '' } = {}) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = `toast ${tone === 'error' ? 'error' : tone === 'success' ? 'success' : ''}`;
  el.innerHTML = `${icon(tone === 'error' ? 'alert' : 'check')}<div>${title ? `<strong>${esc(title)}</strong>` : ''}<span>${esc(message)}</span></div>`;
  region.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    el.style.transition = 'opacity 180ms ease, transform 180ms ease';
    window.setTimeout(() => el.remove(), 200);
  }, 4200);
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

let lastFocus = null;
let activeModal = null;
let activeKeyHandler = null;
let activeOnClose = null;

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = '';
  activeModal = null;
  document.body.style.overflow = '';
  if (activeKeyHandler) {
    document.removeEventListener('keydown', activeKeyHandler);
    activeKeyHandler = null;
  }
  const onClose = activeOnClose;
  activeOnClose = null;
  if (onClose) onClose();
  if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) lastFocus.focus();
}

export function openModal({
  title,
  description = '',
  body,
  submitLabel = 'Simpan',
  cancelLabel = 'Batal',
  onSubmit = null,
  onMount = null,
  onClose = null,
  wide = false,
  danger = false,
  extraFooter = '',
}) {
  const root = document.getElementById('modal-root');
  if (!root) return null;
  closeModal();
  lastFocus = document.activeElement;
  activeOnClose = onClose;
  root.innerHTML = `
    <div class="modal-wrap" data-modal-wrap>
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <div style="flex:1">
            <h2 id="modal-title">${esc(title)}</h2>
            ${description ? `<p>${esc(description)}</p>` : ''}
          </div>
          <button type="button" class="icon-btn" data-modal-close aria-label="Tutup">${icon('x')}</button>
        </div>
        <form novalidate>
          <div class="modal-body">
            <div data-modal-error class="notice notice-danger" hidden style="margin-bottom:12px"></div>
            ${body}
          </div>
          <div class="modal-foot">
            <a class="btn btn-ghost" data-modal-close href="javascript:void(0)">${esc(cancelLabel)}</a>
            ${extraFooter}
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="submit">${esc(submitLabel)}</button>
          </div>
        </form>
      </div>
    </div>`;

  const wrap = root.querySelector('[data-modal-wrap]');
  const modal = root.querySelector('.modal');
  const form = root.querySelector('form');
  const errorBox = root.querySelector('[data-modal-error]');
  const close = () => closeModal();
  activeModal = { close };

  document.body.style.overflow = 'hidden';

  root.querySelectorAll('[data-modal-close]').forEach((btn) => btn.addEventListener('click', close));
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) close();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', onKey);
  activeKeyHandler = onKey;

  const firstField = modal.querySelector('input:not([type=hidden]), select, textarea');
  if (firstField) window.setTimeout(() => firstField.focus(), 30);
  else modal.querySelector('button')?.focus();

  if (onMount) onMount(form, close);

  if (onSubmit) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submit = form.querySelector('button[type=submit]');
      errorBox.hidden = true;
      submit?.setAttribute('disabled', 'disabled');
      try {
        await onSubmit(form, close);
      } catch (err) {
        errorBox.innerHTML = `${icon('alert')}<div><strong>${esc(err.message ?? 'Terjadi kesalahan')}</strong>${
          err.detail ? `<div class="xs">${esc(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail))}</div>` : ''
        }</div>`;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } finally {
        submit?.removeAttribute('disabled');
      }
    });
  }
  return { form, close, modal };
}

export function promptText({ title = 'Masukkan data', label = 'Nilai', value = '', hint = '', placeholder = '', required = true, submitLabel = 'Simpan', tone = 'primary' }) {
  return new Promise((resolve) => {
    let result = null;
    const modal = openModal({
      title,
      submitLabel,
      danger: tone === 'danger',
      body: field(label, `<input class="input" name="value" value="${esc(value)}" placeholder="${esc(placeholder)}" />`, { hint }),
      onClose: () => resolve(result),
      onSubmit(form, close) {
        const v = form.value.value.trim();
        if (required && !v) throw new Error(`${label} wajib diisi.`);
        result = v;
        close();
      },
    });
    if (!modal) resolve(null);
  });
}

export function confirmAction({ title = 'Konfirmasi', message, confirmLabel = 'Lanjutkan', tone = 'primary' }) {
  return new Promise((resolve) => {
    let confirmed = false;
    openModal({
      title,
      body: `<p class="small">${esc(message)}</p>`,
      submitLabel: confirmLabel,
      danger: tone === 'danger',
      onSubmit(form, close) {
        confirmed = true;
        close();
      },
      onClose: () => resolve(confirmed),
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Printing                                                                   */
/* -------------------------------------------------------------------------- */

export function printDocument(title, innerHtml) {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) {
    toast('Jendela cetak diblokir browser. Izinkan popup untuk mencetak.', { tone: 'error' });
    return;
  }
  win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { font: 12px/1.5 Inter, "Segoe UI", system-ui, sans-serif; color: #172b3a; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: -0.02em; }
      h2 { font-size: 14px; margin: 18px 0 6px; }
      .doc-head { display: flex; justify-content: space-between; border-bottom: 1px solid #cfc6b6; padding-bottom: 10px; margin-bottom: 14px; }
      .doc-head small { color: #62727c; }
      .brand { font-weight: 800; letter-spacing: -0.03em; font-size: 20px; }
      .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
      .meta div span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #62727c; }
      .meta div strong { font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
      th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #62727c; border-bottom: 1px solid #cfc6b6; padding: 6px 6px; }
      td { border-bottom: 1px solid #e4ded2; padding: 7px 6px; vertical-align: top; }
      td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .foot { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; font-size: 10px; color: #62727c; }
      .sign { border-top: 1px solid #172b3a; margin-top: 44px; padding-top: 4px; }
      .note { background: #f6f3ed; padding: 10px; border-radius: 6px; font-size: 10.5px; }
      .pill { display: inline-block; padding: 2px 8px; border-radius: 99px; background: #eef4f2; font-size: 9px; font-weight: 600; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <div class="doc-head">
      <div><div class="brand">lajur</div><small>PT Lajur Tekstil Nusantara · Gudang Tekstil</small></div>
      <div style="text-align:right"><small>${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</small></div>
    </div>
    ${innerHtml}
    <div class="foot"><div>Dibuat oleh<div class="sign">Nama & tanggal</div></div><div>Diperiksa<div class="sign">Nama & tanggal</div></div><div>Diterima<div class="sign">Nama & tanggal</div></div></div>
    </body></html>`);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 300);
}

export function downloadFile(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Berkas ${filename} diunduh.`, { tone: 'success' });
}

export function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function imageToDataUrl(file, { maxBytes = 250_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!file.type?.startsWith('image/')) return reject(new Error('Berkas harus berupa gambar.'));
    if (file.size > maxBytes) return reject(new Error('Gambar maksimal 250 KB untuk demo.'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca gambar.'));
    reader.readAsDataURL(file);
    return null;
  });
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}
