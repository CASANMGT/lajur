/** Panduan langkah demi langkah untuk semua proses input di Lajur. */

import { esc, icon } from '../dom.js';
import { pageHead } from './common.js';

const steps = [
  {
    id: 'mulai',
    title: 'Mulai: peran dan mode',
    body: `
      <ol>
        <li>Masuk dengan akun: <strong>Henry Martin</strong> (manajer, PIN 2468), <strong>Henny</strong> (operator, 1357), <strong>Belinda</strong> (sales, 8642), atau akun driver (Asep 1212, Rudi 2323, Slamet 3434).</li>
        <li>Manajer memilih <strong>Mode Sederhana</strong> atau <strong>Mode Lanjutan</strong> di topbar atau Pengaturan → Preferensi.</li>
        <li>Sederhana = operasi harian + Master Data. Lanjutan = laporan, simulasi, faktur pajak, surat jalan, impor, WIP/Pesanan.</li>
        <li>Gunakan menu <strong>Panduan</strong> ini kapan saja.</li>
      </ol>`,
  },
  {
    id: 'stok',
    title: 'Stok, roll, dan tambah stok manual',
    body: `
      <ol>
        <li>Buka <a href="#/stok">Stok & Roll</a>. Pilih gudang Jakarta atau Bali.</li>
        <li>Setiap roll adalah panjang fisik dengan lot dan rak sendiri. Gunakan pencarian atau filter koleksi/status.</li>
        <li><strong>Tambah stok manual</strong> untuk saldo awal/koreksi tanpa PO: pilih kain atau part, gudang, lot, panjang roll, biaya, dan alasan.</li>
        <li>Buka detail roll untuk melihat mutasi, induk/turunan, dan mencetak label.</li>
        <li>Gunakan <strong>Hierarki koleksi</strong> untuk melihat collection → warna → roll induk → turunan.</li>
      </ol>`,
  },
  {
    id: 'transfer',
    title: 'Permintaan gudang / transfer internal',
    body: `
      <ol>
        <li>Buka <a href="#/transfer">Permintaan Gudang</a> → Buat permintaan.</li>
        <li>Pilih gudang asal/tujuan, produk, warna, jumlah meter, tanggal butuh, dan alasan.</li>
        <li>Operator submit; manajer approve. Persetujuan tidak mereservasi stok.</li>
        <li>Saat dispatch, pilih roll fisik. Barang transit bukan stok gudang asal maupun tujuan.</li>
        <li>Terima sebagian atau penuh; cetak permintaan atau surat jalan internal.</li>
      </ol>`,
  },
  {
    id: 'pembelian',
    title: 'Pembelian lokal dan impor',
    body: `
      <ol>
        <li>Buka <a href="#/pembelian">Pembelian</a> → Buat PO.</li>
        <li>Pilih pemasok. Harga baris diisi dari harga pemasok terbaru; Anda tetap bisa mengubahnya.</li>
        <li>Untuk CNY, <strong>kurs wajib diisi pengguna</strong>. Tidak ada default; angka terbaru hanya referensi.</li>
        <li>Simpan PO → Setujui. Penerimaan memilih lot dan panjang setiap roll; kelebihan terima ditolak.</li>
        <li>PO impor: buat pengiriman, isi BL/container, ETD/ETA, biaya freight/asuransi/bea masuk, lalu terima.</li>
      </ol>`,
  },
  {
    id: 'penjualan',
    title: 'Faktur penjualan dan diskon',
    body: `
      <ol>
        <li>Buka <a href="#/penjualan">Penjualan</a> → Buat faktur.</li>
        <li>Pilih pelanggan, lalu kain (roll tertentu) atau spare part. Harga otomatis terisi dari master.</li>
        <li>Pilih diskon <strong>nominal Rp</strong> atau <strong>persentase %</strong>; total dihitung langsung.</li>
        <li>Terbitkan faktur: stok keluar satu kali. Simpan draf jika belum ingin mengeluarkan stok.</li>
        <li>Catat pembayaran, deposit, retur, dan cetak faktur/PDF.</li>
      </ol>`,
  },
  {
    id: 'pajak-pengiriman',
    title: 'Faktur pajak dan surat jalan',
    body: `
      <ol>
        <li>Setelah faktur terbit, buka detail faktur.</li>
        <li><strong>Faktur pajak</strong>: DPP/PPN 11% dihitung otomatis; isi nomor dan NPWP pelanggan (opsional) lalu terbitkan. Dapat dicetak/PDF.</li>
        <li><strong>Surat jalan</strong>: pilih PIC, kurir (Internal/Lalamove/GoSend/GrabExpress), driver dari master, kendaraan, alamat dengan autocomplete dan peta.</li>
        <li>Alur: Buat → Kirim → Tiba → Konfirmasi terima oleh PIC pelanggan. Stok tidak berubah lagi.</li>
        <li>Driver melihat tugasnya di menu <a href="#/pengiriman">Pengiriman</a>.</li>
      </ol>`,
  },
  {
    id: 'pesanan',
    title: 'Pesanan penjualan (opsional)',
    body: `
      <ol>
        <li>Aktifkan Pesanan di Pengaturan → Preferensi (mode Lanjutan), lalu buka <a href="#/pesanan">Pesanan</a>.</li>
        <li>Pesanan mencadangkan stok; belum mengeluarkan stok.</li>
        <li>Lihat pembuat, isi, harga, lalu edit draf bila perlu. Reservasi dihitung ulang.</li>
        <li>Konfirmasi → Fakturkan. Faktur adalah satu-satunya peristiwa pengeluaran stok.</li>
      </ol>`,
  },
  {
    id: 'proyek',
    title: 'Proyek pelanggan',
    body: `
      <ol>
        <li>Buka <a href="#/proyek">Proyek</a> → Buat proyek, pilih pelanggan dan target.</li>
        <li>Isi kebutuhan kain/part dan alokasi roll. Reservasi mengurangi stok tersedia.</li>
        <li>Issue proyek menerbitkan faktur dan mengeluarkan stok satu kali; handover hanya status.</li>
        <li>Cetak instruksi potong/packing.</li>
      </ol>`,
  },
  {
    id: 'sample',
    title: 'Sample, buku sample, dan katalog',
    body: `
      <ol>
        <li>Buka <a href="#/sampel">Sample & Deposit</a> → Sample baru. Potongan diambil dari roll; stok berkurang.</li>
        <li><strong>Buku sample</strong>: beri nama, pilih pelanggan/prospek, tambah beberapa potongan roll dan ukuran, lalu buat. Setiap potongan menjadi sample fisik.</li>
        <li>Buku dapat dicetak/PDF dan ditandai “Beri” kepada calon pelanggan.</li>
        <li>Buka <a href="#/katalog">Katalog</a> untuk daftar warna, lebar, harga jual, dan stok; cetak/PDF untuk pelanggan.</li>
        <li>Sample dapat dikaitkan ke faktur saat pelanggan membeli.</li>
      </ol>`,
  },
  {
    id: 'tugas',
    title: 'Tugas operasi, tiket cetak, dan penugasan',
    body: `
      <ol>
        <li>Buka <a href="#/tugas">Tugas Operasi</a> → Buat tugas. Pilih jenis, gudang, prioritas, jatuh tempo, roll/proyek bila perlu.</li>
        <li>Bila penugasan online aktif, pilih petugas. Bila nonaktif, cetak tiket dan tulis petugas di tiket.</li>
        <li><strong>Cetak tiket</strong> atau <strong>Cetak antrean</strong>; setiap cetak menambah printCount.</li>
        <li>Pekerja membuka tugas dan menekan <strong>Mulai</strong> lalu <strong>Selesai</strong> dengan catatan/bukti.</li>
        <li>Tugas tidak pernah mengubah stok.</li>
      </ol>`,
  },
  {
    id: 'produksi',
    title: 'Produksi WIP (opsional)',
    body: `
      <ol>
        <li>Aktifkan Produksi WIP di Pengaturan (mode Lanjutan), lalu buka <a href="#/produksi">Produksi WIP</a>.</li>
        <li>Buat order dari roll, total meter, dan panjang per piece. Roll dicadangkan.</li>
        <li>Cutting mengonsumsi kain dan membuat piece WIP; lalu Jahit → QC.</li>
        <li>QC gagal dapat dijahit ulang; payroll borongan per piece dan kapasitas dihitung dari piece.</li>
      </ol>`,
  },
  {
    id: 'opname',
    title: 'Stock opname',
    body: `
      <ol>
        <li>Buka <a href="#/opname">Stock Opname</a> → Mulai sesi per gudang.</li>
        <li>Hitung fisik tanpa melihat saldo sistem; simpan hitungan.</li>
        <li>Submit → manajer review dan posting. Selisih membuat mutasi penyesuaian.</li>
        <li>Gudang dibekukan selama counting/review.</li>
      </ol>`,
  },
  {
    id: 'master',
    title: 'Master data, driver, transport, dan pengguna',
    body: `
      <ol>
        <li>Buka <a href="#/master">Master Data</a>. Tersedia di mode Sederhana untuk manajer.</li>
        <li>Produk kain: kode, warna, swatch hex, lebar, harga, gambar, supplier dan harga pemasok.</li>
        <li>Spare part: SKU, brand, induk/child, harga, gambar.</li>
        <li><strong>Driver & transport</strong>: driver punya akun pengguna, telepon, kendaraan (motor/mobil/truk), plat, dan transport internal/pihak ketiga (Lalamove, GoSend, Bali Kargo).</li>
        <li>Pengguna & peran: tambah staf, ubah peran, reset PIN. Driver dapat login untuk melihat pengiriman.</li>
      </ol>`,
  },
  {
    id: 'laporan',
    title: 'Laporan, pengaturan, dan cadangan',
    body: `
      <ol>
        <li>Mode Lanjutan → <a href="#/laporan">Laporan</a>: stok, penjualan, produksi/payroll, AR/AP, kontrol.</li>
        <li>Pengaturan → Preferensi: mode, penugasan online, WIP/Pesanan, bukti fisik, harga pokok.</li>
        <li>Pengaturan → Data: ekspor/impor JSON dan reset dataset demo.</li>
        <li>Semua dokumen cetak punya opsi Cetak dan Unduh PDF.</li>
      </ol>`,
  },
];

export function render() {
  return `
    ${pageHead({
      eyebrow: 'Belajar',
      title: 'Panduan proses bisnis',
      sub: 'Langkah input dari stok sampai surat jalan, sample book, katalog, dan laporan.',
    })}
    <div class="notice notice-info" style="margin-bottom:14px">${icon('listCheck')}<div>Setiap langkah memakai data demo yang bisa Anda ubah. Ikuti urutan, atau lompat ke bagian yang dibutuhkan.</div></div>
    <div class="stack">
      ${steps.map((step, index) => `<details class="card guide-step" ${index < 2 ? 'open' : ''}>
        <summary style="cursor:pointer;padding:14px 16px;display:flex;gap:10px;align-items:center">
          <span class="badge no-dot">${index + 1}</span><strong>${esc(step.title)}</strong>
        </summary>
        <div class="card-pad" style="border-top:1px solid var(--line)">${step.body}</div>
      </details>`).join('')}
    </div>`;
}
