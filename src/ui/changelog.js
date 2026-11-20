/** Shared changelog modal: Settings → Data and the sidebar version button. */

import { esc, icon, openModal } from './dom.js';
import { CHANGELOG } from '../data/changelog.js';

export function openChangelog() {
  openModal({
    title: 'Riwayat versi',
    description: 'Perubahan yang sudah dirilis. Versi terbaru ada di paling atas.',
    wide: true,
    cancelLabel: 'Tutup',
    submitLabel: 'Selesai',
    body: `<div class="stack">${CHANGELOG.map((release) => `<section class="card card-pad" style="background:var(--ivory-50)">
      <div class="row-between">
        <div>
          <strong class="mono">v${esc(release.version)}</strong>
          <span class="small muted"> · ${esc(release.name)}</span>
        </div>
        <span class="xs muted">${esc(release.date)}</span>
      </div>
      <ul class="small muted" style="margin:8px 0 0;padding-left:18px;line-height:1.6">
        ${release.items.map((item) => `<li>${esc(item)}</li>`).join('')}
      </ul>
    </section>`).join('')}</div>
    <div class="notice notice-info" style="margin-top:12px">${icon('checkCircle')}<div>Riwayat ini mengikuti <span class="mono">CHANGELOG.md</span> di repositori.</div></div>`,
    onSubmit(form, close) {
      close();
    },
  });
}
