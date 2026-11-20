/**
 * In-app changelog. Keep the newest release first; the UI renders this list
 * from Settings → Data and the sidebar version button.
 */

export const CHANGELOG = [
  {
    version: '2.28.0',
    date: '2026-11-20',
    name: 'Faktur per Roll & Sinkron Cloud',
    items: [
      'Faktur memilih koleksi → motif/warna → roll, dan default ke roll utuh.',
      'Tombol surat jalan dan faktur pajak tersedia dari halaman Penjualan.',
      'Peta lokasi pengiriman dan PIC penerimaan di profil pelanggan.',
      'Unduh/unggah database dan sinkronisasi Supabase antar perangkat.',
      'Urutkan stok menurut nama atau meter tersedia terbanyak.',
    ],
  },
  {
    version: '2.27.0',
    date: '2026-11-20',
    name: 'WA Multi-Stok & Impor Customer',
    items: [
      'WA share bisa memilih beberapa koleksi dan beberapa motif sekaligus.',
      'Salin resi hanya menyalin nomor; salin link terpisah.',
      'Cek resi pihak ketiga lewat cekresi.com.',
      'Tag QR memuat URL scan, PIC cetak, dan tanggal cetak.',
      'Impor pelanggan dari Excel dengan deteksi duplikat.',
    ],
  },
  {
    version: '2.26.0',
    date: '2026-11-20',
    name: 'Workspace Stok & Impor Excel',
    items: [
      'Workspace Koleksi dengan drill-down koleksi → motif → lot.',
      'Statistik top koleksi dan top motif.',
      'Impor stok Excel per tanggal dengan pratinjau dan arsip roll lama.',
    ],
  },
  {
    version: '2.25.0',
    date: '2026-11-19',
    name: 'Sinkron Stok 13 Nov 2026',
    items: [
      'Sinkronisasi 2.175 roll / 144.590,62 m dari Excel 13 Nov 2026.',
      'Roll demo lama diarsipkan tanpa merusak referensi faktur.',
    ],
  },
  {
    version: '2.24.0',
    date: '2026-11-18',
    name: 'Surat Jalan Internal',
    items: [
      'Surat jalan internal dengan tanda tangan driver.',
      'Foto sample dan bukti pengiriman.',
    ],
  },
];
