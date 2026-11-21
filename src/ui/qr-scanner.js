/** Shared mobile QR scanner: camera (BarcodeDetector or jsQR), manual ID and photo fallback. */

import { esc, icon, field, openModal } from './dom.js';

let jsQrPromise = null;

function ensureJsQr() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsQrPromise) {
    jsQrPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/src/vendor/jsqr.js';
      script.onload = () => (window.jsQR ? resolve(window.jsQR) : reject(new Error('jsQR tidak termuat.')));
      script.onerror = () => reject(new Error('Gagal memuat decoder QR.'));
      document.head.appendChild(script);
    });
  }
  return jsQrPromise;
}

async function decodeQrImage(file) {
  const jsQR = await ensureJsQr();
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
}

export function openQrScanner({ title = 'Scan QR', description = 'Arahkan kamera ke QR tag.', onResult = null } = {}) {
  let stopCamera = () => {};
  openModal({
    title,
    description,
    submitLabel: 'Tutup',
    wide: true,
    autoFocus: false,
    body: `<div class="stack">
      <video data-qr-video autoplay muted playsinline style="width:100%;max-height:320px;border-radius:10px;background:#172b3a;object-fit:cover"></video>
      <p class="small" data-qr-status>Meminta izin kamera…</p>
      ${field('Atau ketik roll ID', `<div class="row"><input class="input" name="manual" placeholder="RL-0029" /><button class="btn" type="button" data-scan-manual>${icon('scan')} Cari</button></div>`)}
      ${field('Atau upload foto QR', `<input class="input" type="file" name="qrFile" accept="image/*" />`, { hint: 'Berguna bila kamera tidak tersedia.' })}
      <div class="notice notice-info">${icon('alert')}<div>QR tag berisi URL <span class="mono">#/scan/ROLL-ID</span>.</div></div>
    </div>`,
    onMount(form, close) {
      const video = form.querySelector('[data-qr-video]');
      const status = form.querySelector('[data-qr-status]');
      const handle = async (raw) => {
        const text = String(raw ?? '').trim();
        if (!text) return;
        if (!onResult) { close(); return; }
        try {
          const result = await onResult(text);
          if (result && result.ok === false) {
            status.textContent = result.message || 'QR tidak dikenali.';
            status.className = 'small danger';
            return;
          }
          stopCamera();
          close();
        } catch (err) {
          status.textContent = err.message;
          status.className = 'small danger';
        }
      };
      form.querySelector('[data-scan-manual]')?.addEventListener('click', () => handle(form.manual.value));
      form.manual?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); handle(form.manual.value); }
      });
      form.qrFile?.addEventListener('change', async () => {
        const file = form.qrFile.files?.[0];
        if (!file) return;
        status.textContent = 'Membaca QR…';
        status.className = 'small';
        try {
          const code = await decodeQrImage(file);
          if (code?.data) handle(code.data);
          else status.textContent = 'QR tidak terbaca dari foto. Coba foto lebih dekat atau ketik roll ID.';
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
      let stream;
      let raf = 0;
      let detector = null;
      let jsQR = null;
      let canvas = null;
      let context = null;
      (async () => {
        try {
          if (typeof window.BarcodeDetector === 'function') {
            detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          } else {
            jsQR = await ensureJsQr();
            canvas = document.createElement('canvas');
            context = canvas.getContext('2d', { willReadFrequently: true });
          }
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          });
          video.srcObject = stream;
          await video.play();
          status.textContent = 'Arahkan kamera ke QR tag roll…';
          const tick = async () => {
            try {
              if (detector) {
                const codes = await detector.detect(video);
                if (codes.length) { handle(codes[0].rawValue); return; }
              } else if (jsQR && video.videoWidth) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
                if (code?.data) { handle(code.data); return; }
              }
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
