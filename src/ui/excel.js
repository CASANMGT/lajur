/** Lazy Excel reader for stock imports. SheetJS is loaded only when needed. */

let xlsxPromise = null;

function loadXlsx() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Excel hanya dapat dibaca di browser.'));
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        if (!window.XLSX) reject(new Error('Pembaca Excel tidak tersedia.'));
        else resolve(window.XLSX);
      };
      script.onerror = () => reject(new Error('Pembaca Excel tidak dapat dimuat. Periksa koneksi internet.'));
      document.head.appendChild(script);
    }).catch((err) => {
      xlsxPromise = null;
      throw err;
    });
  }
  return xlsxPromise;
}

export async function readExcelRows(file) {
  if (!file) throw new Error('Pilih file Excel terlebih dahulu.');
  if (file.size > 10 * 1024 * 1024) throw new Error('File Excel maksimal 10 MB.');
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Sheet pertama tidak ditemukan.');
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
}
