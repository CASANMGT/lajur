/**
 * AWB/resi photo reader.
 *
 * Tries the browser barcode detector first (AWB labels almost always carry a
 * Code128/Code39/ITF barcode), then falls back to in-browser OCR. Everything
 * runs on the device; the image is never uploaded to a server.
 */

const COURIER_PREFIX = {
  jne: [/^JNE/, /^CGK/, /^JKT/],
  jnt: [/^JT/],
  sicepat: [/^00/, /^SC/],
  anteraja: [/^10/, /^AJ/],
  gosend: [/^GO/, /^GS/],
  grabexpress: [/^GR/, /^GE/],
  lalamove: [/^LL/, /^LM/],
};

let tesseractPromise = null;
let zxingPromise = null;

export function normalizeAwb(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Pull the most plausible consignment number out of OCR text or a barcode
 * value. Courier-specific prefixes get a large bonus so JNE/J&T/SiCepat
 * numbers win over invoice numbers, phone numbers or dates.
 */
export function parseAwb(text, { courier = '' } = {}) {
  const raw = String(text ?? '').toUpperCase();
  if (!raw.trim()) return '';
  const seen = new Set();
  const candidates = [];
  const add = (value, bonus = 0) => {
    const token = normalizeAwb(value);
    if (token.length < 6 || token.length > 24 || seen.has(token)) return;
    seen.add(token);
    const digits = (token.match(/\d/g) ?? []).length;
    const letters = token.length - digits;
    if (digits < 4) return;
    let score = bonus + Math.min(token.length, 18) + digits * 2 - Math.max(0, letters - digits) * 4;
    const prefixed = COURIER_PREFIX[courier]?.some((re) => re.test(token));
    if (prefixed) score += 60;
    if (/^(19|20)\d{6,}$/.test(token)) score -= 70;
    candidates.push({ token, score });

    // OCR frequently glues the resi to the next label ("541680005420019DESKRIPSI").
    // For an AWB the useful value is the leading digit run, not the letters.
    const leading = token.match(/^(\d{8,20})/)?.[1];
    if (leading && leading !== token && !seen.has(leading)) {
      seen.add(leading);
      candidates.push({ token: leading, score: bonus + 60 + Math.min(leading.length, 18) + leading.length * 2 });
    }
  };

  // Also scan the full text for long digit groups separated by spaces/hyphens.
  for (const match of raw.matchAll(/\d[\d\s-]{8,24}\d/g)) {
    const digitsOnly = match[0].replace(/\D/g, '');
    if (digitsOnly.length >= 10 && digitsOnly.length <= 20) add(digitsOnly, 30);
  }

  const label = raw.match(/(?:NO\.?\s*(?:RESI|AWB)|RESI|AWB|TRACKING(?:\s*(?:NO|NUMBER))?|CONSIGNMENT(?:\s*NO)?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 -]{5,30})/);
  if (label) {
    add(label[1], 50);
    add(label[1].split(/\s+/)[0], 25);
  }

  for (const line of raw.split(/\r?\n/)) {
    const cleaned = line.replace(/[^A-Z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    add(cleaned, 0);
    for (const token of cleaned.match(/[A-Z0-9]{6,24}/g) ?? []) add(token, 0);
    // Labels often print the resi in groups: "JT 1234 5678 9012".
    const groups = cleaned.split(' ');
    for (let index = 0; index < groups.length; index += 1) {
      for (let length = 2; length <= 4 && index + length <= groups.length; length += 1) {
        const joined = groups.slice(index, index + length).join('');
        if (joined.length >= 8 && /\d/.test(joined)) add(joined, 0);
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.token ?? '';
}

async function detectBarcode(file) {
  if (typeof window === 'undefined' || typeof window.BarcodeDetector !== 'function') return [];
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
    const formats = ['code_128', 'code_39', 'code_93', 'itf', 'qr_code', 'data_matrix', 'pdf417'];
    const supported = typeof window.BarcodeDetector.getSupportedFormats === 'function'
      ? await window.BarcodeDetector.getSupportedFormats().catch(() => null)
      : null;
    const useFormats = supported?.length ? formats.filter((f) => supported.includes(f)) : formats;
    const detector = new window.BarcodeDetector(useFormats.length ? { formats: useFormats } : undefined);
    const codes = await detector.detect(bitmap);
    return codes.map((code) => String(code.rawValue ?? '')).filter(Boolean);
  } catch {
    return [];
  } finally {
    bitmap?.close?.();
  }
}

function loadScript(src, label = 'Mesin pembaca resi') {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`${label} tidak dapat dimuat. Periksa koneksi internet.`));
    document.head.appendChild(script);
  });
}

function loadZxing() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Pembaca barcode hanya tersedia di browser.'));
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!zxingPromise) {
    zxingPromise = loadScript('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js', 'Pembaca barcode')
      .then(() => {
        if (!window.ZXing) throw new Error('Pembaca barcode tidak tersedia.');
        return window.ZXing;
      })
      .catch((err) => {
        zxingPromise = null;
        throw err;
      });
  }
  return zxingPromise;
}

async function decodeCanvas(reader, canvas) {
  try {
    const result = await reader.decodeFromCanvas(canvas);
    return result ? [String(result.getText())] : [];
  } catch {
    return [];
  }
}

/** ZXing fallback: works where the platform BarcodeDetector is missing. */
async function detectZxing(file) {
  const url = URL.createObjectURL(file);
  let reader = null;
  try {
    const ZXing = await loadZxing();
    reader = new ZXing.BrowserMultiFormatReader();
    try {
      const result = await reader.decodeFromImageUrl(url);
      if (result) return [String(result.getText())];
    } catch {
      // Fall through to the contrast-enhanced canvas pass.
    }

    const image = new Image();
    image.src = url;
    await image.decode();
    const longest = Math.max(image.width, image.height) || 1;
    const scale = Math.min(2, Math.max(1, 1400 / longest));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // A phone photo of a label is often grey and low-contrast. Stretch the
    // greyscale range before a second ZXing pass.
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    for (let index = 0; index < data.length; index += 4) {
      const grey = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const value = Math.max(0, Math.min(255, 128 + (grey - 128) * 1.8));
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
    return await decodeCanvas(reader, canvas);
  } catch {
    return [];
  } finally {
    try { reader?.reset(); } catch { /* ignore */ }
    URL.revokeObjectURL(url);
  }
}

function loadTesseract() {
  if (typeof window === 'undefined') return Promise.reject(new Error('OCR hanya tersedia di browser.'));
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js')
      .then(() => {
        if (!window.Tesseract) throw new Error('Mesin OCR tidak tersedia.');
        return window.Tesseract;
      })
      .catch((err) => {
        tesseractPromise = null;
        throw err;
      });
  }
  return tesseractPromise;
}

async function readImageText(file) {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });
  try {
    const recognition = worker.recognize(file);
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OCR terlalu lama. Ketik nomor resi manual.')), 45_000);
    });
    const { data } = await Promise.race([recognition, timeout]);
    return data?.text ?? '';
  } finally {
    await worker.terminate().catch(() => {});
  }
}

/**
 * Read an AWB photo. Returns the best number found, the raw OCR text and the
 * method used. Never throws for an unreadable image; only for a non-image file
 * or an engine that cannot load.
 */
export async function scanAwbImage(file, { courier = '' } = {}) {
  if (!file) return { trackingRef: '', text: '', method: '' };
  if (!String(file.type ?? '').startsWith('image/')) {
    throw new Error('Berkas resi harus berupa gambar.');
  }

  const barcodes = [...await detectBarcode(file), ...await detectZxing(file)];
  for (const value of barcodes) {
    const trackingRef = parseAwb(value, { courier });
    if (trackingRef) return { trackingRef, text: value, method: 'barcode' };
    const digitsOnly = normalizeAwb(value).match(/\d{8,20}/)?.[0] ?? '';
    if (digitsOnly) return { trackingRef: digitsOnly, text: value, method: 'barcode' };
  }

  const text = await readImageText(file);
  const trackingRef = parseAwb(text, { courier });
  return { trackingRef, text, method: trackingRef ? 'ocr' : '' };
}
