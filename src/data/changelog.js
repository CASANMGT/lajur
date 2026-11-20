/**
 * In-app changelog. Keep the newest release first; the UI renders this list
 * from Settings → Data and the sidebar version button.
 */

export const CHANGELOG = [
  {
    version: '2.35.0',
    date: '2026-11-20',
    name: 'Tag A4 per Roll, Katalog & Motif',
    items: [
      'Cetak tag A4 bisa per roll, per katalog/koleksi, per motif/warna, atau semua roll.',
      'Pilihan motif otomatis mengikuti katalog yang dipilih.',
      'Urutkan tag: katalog, motif/warna, roll, meter tersedia, atau lot.',
      'Ringkasan jumlah roll dan halaman A4 langsung diperbarui.',
    ],
  },
  {
    version: '2.34.0',
    date: '2026-11-20',
    name: 'Riwayat Pembayaran & Bukti Screenshot',
    items: [
      'Tombol Riwayat pembayaran menampilkan semua penerimaan: siapa, kapan, jenis, metode, no. transfer, nominal.',
      'Bukti pembayaran bisa upload file atau tempel screenshot dengan Ctrl+V.',
      'Klik bukti untuk melihat screenshot penuh dari invoice atau ledger.',
    ],
  },
  {
    version: '2.33.0',
    date: '2026-11-20',
    name: 'Berat Roll & Pembayaran Bertahap',
    items: [
      'Surat jalan otomatis menghitung estimasi kg per roll/lot dari lebar × GSM.',
      'Potongan lebih pendek otomatis lebih ringan; total kg, roll, dan lot masuk surat jalan.',
      'Cetak A4 3-copy dan dot-matrix menampilkan Roll/Lot dan estimasi kg per baris.',
      'Pembayaran bisa deposit, angsuran, atau pelunasan; pelunasan otomatis membayar sisa.',
      'Setiap pembayaran menyimpan no. transfer, tanggal, catatan, dan foto bukti.',
    ],
  },
  {
    version: '2.32.1',
    date: '2026-11-20',
    name: 'Harga Internal Manual & PO Bali',
    items: [
      'Harga jual luar bisa diisi manual saat PO internal; harga internal otomatis 10% lebih murah.',
      'Cocok untuk stok 13 Nov yang belum punya harga master.',
    ],
  },
  {
    version: '2.32.0',
    date: '2026-11-20',
    name: 'PO Internal Bali & Harga Internal',
    items: [
      'Bali bisa membuat PO internal dari stok Jakarta langsung dari halaman Pembelian internal.',
      'Harga internal otomatis 10% lebih murah dari harga jual luar; total hemat terlihat.',
      'Tracking PO: diminta → dikirim → diterima, dengan faktur internal dan roll yang berpindah.',
      'Contoh PO Bali ← Jakarta tersedia di data demo.',
      'Permintaan sample antar-PT menampilkan riwayat dan tanpa deposit.',
    ],
  },
  {
    version: '2.31.0',
    date: '2026-11-20',
    name: 'Dua PT, Internal Sales & Driver Master',
    items: [
      'PT Jakarta dan PT Bali terpisah; pelanggan dibatasi per PT dan bisa dibagi jika mirip.',
      'Jakarta bisa menjual internal ke Bali; stok berpindah ke gudang Bali.',
      'Bali bisa membuat pembelian internal dan meminta sample gratis/berbayar.',
      'Driver hanya master nama, telepon, kendaraan; tanpa akun login.',
      'Ekspedisi pihak ketiga tidak menampilkan driver dan menambah catatan otomatis.',
      'Akun: Henry (Admin/Owner), Henny (Sales/Owner), Fauzi (Operation), Nicolas (Owner Bali).',
    ],
  },
  {
    version: '2.30.1',
    date: '2026-11-20',
    name: 'Build Statis Vercel & Neon',
    items: [
      'npm run build sekarang membuat folder public/ untuk Vercel.',
      'API /api/cloud tetap berjalan sebagai Vercel Function.',
      'Deploy production kembali normal dengan data Neon.',
    ],
  },
  {
    version: '2.30.0',
    date: '2026-11-20',
    name: 'Neon Terhubung & Build Pipeline',
    items: [
      'Project Neon Lavishome (Singapore) terhubung ke branch production.',
      'API /api/cloud memakai node-postgres + attachDatabasePool untuk Vercel Fluid compute.',
      'Dataset 2.203 roll dan 20 pelanggan sudah masuk ke Neon.',
      'npm run build menjalankan tes, cek modul, dan render check.',
    ],
  },
  {
    version: '2.29.1',
    date: '2026-11-20',
    name: 'Sinkron Neon Region Singapura',
    items: [
      'Function /api/cloud dipasang di region Vercel sin1 (Singapura).',
      'Project Neon disarankan di AWS ap-southeast-1 (Singapore) agar latency rendah.',
      'DATABASE_URL dan LAJUR_SYNC_KEY tetap hanya di environment Vercel.',
    ],
  },
  {
    version: '2.29.0',
    date: '2026-11-20',
    name: 'Sinkron Neon & Domain Lavishome',
    items: [
      'Sinkronisasi cloud memakai Neon Postgres melalui /api/cloud di Vercel.',
      'DATABASE_URL dan LAJUR_SYNC_KEY disimpan sebagai environment variable Vercel, bukan di browser.',
      'Body dataset dikompresi gzip agar muat di batas 4,5 MB Vercel.',
      'Domain produksi pindah ke lavishome.vercel.app dengan data 13 Nov 2026 dan 20 pelanggan.',
    ],
  },
  {
    version: '2.28.1',
    date: '2026-11-20',
    name: 'Perbaikan Restore Database',
    items: [
      'Restore database tidak lagi gagal ketika riwayat harga menunjuk SKU yang sudah diarsipkan oleh sinkron stok.',
      'Dataset 13 Nov 2026 + 20 pelanggan dipulihkan ke domain lavishome.vercel.app.',
    ],
  },
  {
    version: '2.28.0',
    date: '2026-11-20',
    name: 'Faktur per Roll & Sinkron Cloud',
    items: [
      'Faktur memilih koleksi → motif/warna → roll, dan default ke roll utuh.',
      'Tombol surat jalan dan faktur pajak tersedia dari halaman Penjualan.',
      'Peta lokasi pengiriman dan PIC penerimaan di profil pelanggan.',
      'Unduh/unggah database dan sinkronisasi cloud antar perangkat (kemudian dipindah ke Neon di v2.29.0).',
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
