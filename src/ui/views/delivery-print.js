/** Surat jalan print chooser: A4 3-copy laser or 9.5 x 11 in dot matrix. */

import { openModal, printDocument } from '../dom.js';
import { printDeliveryCopiesHtml, printDeliveryDotMatrixHtml } from './print.js';

export function openDeliveryPrint(db, delivery) {
  openModal({
    title: `Cetak surat jalan ${delivery.id}`,
    description: 'Pilih format printer. A4 laser memuat 3 salinan yang bisa dipotong; dot matrix memakai continuous form.',
    submitLabel: 'Buka cetak',
    body: `<div class="stack-sm">
      <label class="print-option">
        <input type="radio" name="format" value="a4" checked />
        <span><strong>A4 laser — 3 salinan</strong>
          <small>ORIGINAL pelanggan, bukti pengiriman (POD), dan arsip logistik dalam satu lembar A4. Potong pada garis putus-putus.</small>
        </span>
      </label>
      <label class="print-option">
        <input type="radio" name="format" value="dot" />
        <span><strong>Dot matrix — 9,5 × 11 inci</strong>
          <small>Continuous form monokrom, 1 salinan, tanpa warna. Cocok untuk printer dot matrix.</small>
        </span>
      </label>
    </div>`,
    onSubmit(form, close) {
      const mode = form.format.value;
      if (mode === 'dot') {
        printDocument(`Surat jalan ${delivery.id} — dot matrix`, printDeliveryDotMatrixHtml(db, delivery), {
          plain: true,
          pageSize: '9.5in 11in',
          margin: '6mm',
        });
      } else {
        printDocument(`Surat jalan ${delivery.id} — A4 3 salinan`, printDeliveryCopiesHtml(db, delivery), {
          plain: true,
          pageSize: 'A4',
          margin: '5mm',
        });
      }
      close();
    },
  });
}
