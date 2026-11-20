# Changelog

All notable changes to Lajur. Dates use Asia/Jakarta.

## [2.39.1] — 2026-11-21

**Release name: Label PT. Dalam.** Renamed the internal-sale label from “PT lain” to **PT. Dalam** in Penjualan and the internal-PO notice.

### Verification

- Module check **62/62**; render check passes; no domain behavior changed.

---

## [2.39.0] — 2026-11-21

**Release name: Opname per Koleksi, Motif & Scan QR.** Stock opname is now sorted by collection → motif → roll, with live ada/meter status and mobile QR scanning.

### Added

- **Opname sorting:** session lines are stored sorted by collection, then motif/colour, then roll A–Z.
- **Filters:** Koleksi and Motif/warna selects narrow the count list.
- **Live status:** each row shows **Belum dicek / Tidak ada / Ada · X m** as the operator types.
- **QR scan:** Scan QR opens the rear camera (BarcodeDetector), with manual roll ID and QR photo fallback. A found roll focuses its meter input and highlights the row.
- **Payment page simplification:** the “Metode pembayaran” summary card is removed from the main Pembayaran list; bank/method remains on each receipt row.

### Verification

- `node --test`: **101 passed**; module check **62/62**; render check passes.
- Browser QA: OPN-002 lines began `Aria/Greige` then `Luna`; manual QR `RL-0013` focused the row; `8,5` changed status to **Ada · 8,5 m**.

---

## [2.38.0] — 2026-11-20

**Release name: Pembayaran Sebagian & Logo Bank.** Partial payments now show the remaining balance live, with Indonesian bank marks, transfer numbers and method stats.

### Added

- **Live remaining balance:** under the amount, the form shows “Sisa setelah bayar” and turns green when the payment settles the invoice.
- **Bank sender:** BCA, Mandiri, BNI, BRI, BSI, Permata, CIMB Niaga, Danamon, BTN, Jago, SeaBank or other, with brand-colour marks.
- **Payment method stats:** Pembayaran page summarises banks/methods used, count and total collected.
- **Receipt display:** bank mark + method + transfer number on the invoice and payment history.
- **Hidden-box fix:** `[hidden]` elements (empty modal error, proof preview) no longer show as an empty pink bar.

### Verification

- `node --test`: **100 passed**; module check **62/62**; render check passes.
- Browser QA: Rp 812.000 outstanding → input Rp 500.000 showed “Sisa Rp 312.000”; Mandiri mark selected; receipt stored `bank: mandiri`; method stats showed transfer receipts.

---

## [2.37.0] — 2026-11-20

**Release name: Tag A4 Multi-Katalog & Multi-Warna.** Several catalogs and several motif/colours can be printed in one A4 run.

### Added

- **Multi-select catalog:** Ctrl/Cmd + click in the Katalog list selects multiple catalogs.
- **Multi-select motif/colour:** Ctrl/Cmd + click selects multiple motifs; the list follows the selected catalogs.
- **Union preview:** the tag summary counts all rolls from the selected catalogs/motifs and the A4 page count.
- Sorting still applies across the full multi-selection.

### Verification

- `node --test`: **100 passed**; module check **61/61**; render check passes.
- Browser QA: Luna + Aria with 2 motifs produced **9 roll / 2 pages**; multi-catalog collection scope produced **19 roll / 3 pages**.

---

## [2.36.0] — 2026-11-20

**Release name: Pembayaran, Piutang & Edit Penerimaan.** A dedicated payment page tracks unpaid/partial/paid invoices, with editable receipt history.

### Added

- **Pembayaran page** in the sidebar after Penjualan.
- **Invoice tracking:** customer, invoice/date, due date, total, paid, outstanding, status and last payment.
- **Status filters:** Semua, Belum bayar, Belum lunas, Lunas.
- **Sorting:** newest/oldest invoice date, largest outstanding, customer A–Z.
- **Small stats:** counts for each status, total outstanding, total billed and total collected.
- **Editable receipts:** edit amount, kind, method, transfer number, date, note or proof; delete a receipt and restore the outstanding balance.
- **Payment history by date** with proof thumbnails.

### Verification

- `node --test`: **100 passed**; module check **61/61**; render check passes.
- Browser QA: page showed 2 unpaid, 1 partial, 2 paid, Rp 9.742.000 outstanding from Rp 14.412.000; partial filter and outgoing sort worked; `PAY-0005` amount/ref edited successfully.

---

## [2.35.0] — 2026-11-20

**Release name: Tag A4 per Roll, Katalog & Motif.** A4 tag printing can now target rolls, catalogs or motifs and sort the sheet by the same keys.

### Added

- **Cakupan tag:** per roll (manual), per katalog/koleksi, per motif/warna, or all available rolls.
- **Motif selector:** choosing a katalog filters the motif/colour list; per-motif prints only rolls for that SKU.
- **Urutkan tag:** Katalog A–Z → motif → roll; Motif/warna A–Z → katalog → roll; Roll A–Z; Meter tersedia terbanyak; Lot A–Z.
- **Live counts:** tag summary updates per scope (`6 roll · 1 halaman`, `13 roll · 2 halaman`, etc.).
- **Print title:** includes the selected sort label.

### Verification

- `node --test`: **100 passed**; module check **60/60**; render check passes.
- Browser QA: motif scope showed **6 roll / 1 page**; collection scope **13 roll / 2 pages**; picker reordered correctly for Roll, Katalog and Motif sorts.

---

## [2.34.0] — 2026-11-20

**Release name: Riwayat Pembayaran & Bukti Screenshot.** Every receipt is now visible in one ledger, with payer, time, kind, transfer number and proof screenshot.

### Added

- **Riwayat pembayaran:** Sales action opens a company-scoped ledger sorted newest first. Columns: date/time, payer/invoice, kind, method + transfer number + recorder, proof thumbnail, amount.
- **Proof screenshot:** payment form accepts an image file or a pasted screenshot (Ctrl+V) with live preview. The image is stored with the payment and opens full-size from the invoice table or ledger.
- **Ledger totals:** count of receipts, total received and number with proof.
- **Readable amounts:** payment input and ledger use Indonesian thousand separators.

### Verification

- `node --test`: **100 passed**; module check **60/60**; render check passes.
- Browser QA: ledger showed 5 receipts across INV-0001/0002/0003 with kind badges (deposit, angsuran, pelunasan) and payer names.

---

## [2.33.0] — 2026-11-20

**Release name: Berat Roll & Pembayaran Bertahap.** Surat jalan now estimates kg per roll/lot from the invoice, and payments support deposit/installment/full with proof photo.

### Added

- **Estimated roll weight:** width × GSM per metre. Blackout defaults 250 GSM, dimout 180, sheer 80; master `weightGsm` wins when present.
- **Per-roll/lot weight:** delivery lines store `rollId`, `lot`, `weightKg`, `rollCount` and unique lot count. Cut lines use the cut metres, so they weigh less.
- **Surat jalan auto-fill:** creating a surat jalan from an invoice prefills total kg, roll count and lot count; the estimate table lists each roll/lot. A4 3-copy and dot-matrix prints include Roll/Lot and Est. kg columns and totals.
- **Payment kinds:** deposit/uang muka, installment/angsuran, full/pelunasan. Full automatically pays the entire remaining balance.
- **Payment proof:** each payment stores date, kind, method, transfer number/reference, note and optional proof photo. Amounts display Indonesian thousand separators.
- **Payment history:** invoice payment table shows kind badge, transfer reference, proof thumbnail and amount.

### Verification

- `node --test`: **100 passed**; module check **60/60**; render check passes.
- Browser QA: `INV-0003` surat jalan prefilled **19 kg · 1 roll · 1 lot**, with RL-0006 18 m ≈ 12,6 kg and parts 6,4 kg; deposit Rp 100.000 then full Rp 1.282.000 settled the invoice.

---

## [2.32.1] — 2026-11-20

**Release name: Harga Internal Manual & PO Bali.** Handles imported stock where master sell prices are still zero.

### Fixed

- PO internal now has an editable **Harga luar/m** per row. The internal price is recalculated at the configured discount even when the SKU master price is 0.
- Domain rejects a PO line when both list price and internal price are missing.
- Imported 13 Nov stock can now be used for a real internal PO once the outside price is entered.

### Verification

- `node --test`: **98 passed**; module check **60/60**; render check passes.
- Example: 125.000 outside → 112.500 internal (10% discount).

---

## [2.32.0] — 2026-11-20

**Release name: PO Internal Bali & Harga Internal.** Bali now initiates its own PO to Jakarta from Jakarta stock, at a cheaper internal price, with full shipment tracking.

### Added

- **Bali-initiated PO internal:** Pembelian → Pembelian internal → **Buat PO internal**. Bali sees Jakarta rolls, available metres, list price and the cheaper internal price.
- **Internal pricing:** `internalDiscountPct` defaults to **10%** below the normal sell price. The UI shows list total, internal total and savings.
- **Tracking:** `requested → shipped → received`, with history, tracking reference, linked internal invoice, ETA and confirmer.
- **Example mockup:** fresh seed includes `IPO-0001` (Bali ← Jakarta) at Rp 6.750.000 vs Rp 7.500.000 list, plus an explainer card in Pembelian internal.
- **Seller action:** Jakarta sees pending PO internal in Penjualan and approves/ships from Pembelian internal. Shipping creates and posts the internal invoice and moves stock to Bali.
- **Buyer action:** Bali confirms receipt after shipment.
- **Sample tracking/no deposit:** request rows show history and “tanpa deposit”; internal samples are free/paid only.

### Verification

- `node --test`: **98 passed**; module check **60/60**; render check passes.
- Browser QA: Bali created `IPO-0002` for 60 m at Rp 6.750.000 (list Rp 7.500.000); Jakarta shipped it (`INV-0005`, roll moved to `wh-bali`); Bali confirmed receipt; history `Dibuat → Disetujui & dikirim → Diterima`.

---

## [2.31.0] — 2026-11-20

**Release name: Dua PT, Internal Sales & Driver Master.** Jakarta and Bali are now separate PTs with scoped customers, internal sales/purchases, sample requests, and driver master data without login accounts.

### Added

- **Two PTs:** PT Lavishome Tekstil Nusantara (Jakarta, `co-jkt`) and PT Lavishome Bali (`co-bali`), each with its own warehouse and manager.
- **Four named users:** Henry Martin (Admin/Owner, Jakarta), Henny (Sales/Owner, Jakarta), Fauzi (Operation, Jakarta), Nicolas (Owner Bali). No driver login accounts.
- **Customer isolation and sharing:** customers carry `companyId`; each PT sees its own customers plus shared/internal counterparts. Matching phone or name across PTs marks both records `shared`.
- **Internal sales Jakarta→Bali:** Penjualan → **Jual ke PT lain** creates an internal invoice. Posting moves rolls/parts to the Bali warehouse and keeps them available.
- **Bali internal purchase:** Pembelian → **Pembelian internal** lists purchases from Jakarta and lets Bali create a draft request. Only the seller PT may post it.
- **Sample requests:** Bali can request Jakarta sample stock free or paid; the owning PT approves and stock moves to the Bali sample warehouse.
- **Driver master:** name, phone and company vehicle; no driver account. Internal surat jalan snapshots driver/vehicle.
- **Third-party surat jalan:** driver and vehicle fields are hidden/cleared; the notes say the driver is determined by the expedition. Print layouts omit the driver row.
- **Schema 21 / backup v21:** migrations add companies, PT ownership, internal customers, sample requests and shared-customer links.

### Verification

- `node --test`: **96 passed** (new tests for PT users, customer sharing, internal sale stock move, sample request transfer).
- Module import check: **59 modules**; render check passes.
- Browser QA: 4 login cards; Jakarta internal sale moved `RL-0001` from `wh-jkt` to `wh-bali`; Bali saw the same invoice under Pembelian internal; Bali sample request `SMR-0001` approved and moved 1 pc to `wh-bali`; Bali customer list hid Jakarta-only customers; zero console errors.

---

## [2.30.1] — 2026-11-20

**Release name: Build Statis Vercel & Neon.** Fixes the Vercel deploy after adding `npm run build`.

### Fixed

- `npm run build` now writes `public/` (`tools/build.mjs`) so Vercel has an output directory.
- `public/` is git-ignored; the build copies `index.html`, `assets/` and `src/`.
- Vercel deploy now uses the built static output while keeping `api/cloud.js` as a function.

### Verification

- Local `npm run build`: **92 passed**, **59 modules**, all views render, `public/` created.
- Neon API: POST returned revision 1; GET returned 2.203 rolls / 20 customers.
- Production: `/api/cloud` returns data with the sync key; app served at v2.30.1.

---

## [2.30.0] — 2026-11-20

**Release name: Neon Terhubung & Build Pipeline.** The app is linked to the Neon project and the API is verified against it.

### Added

- Linked Neon project **Lavishome** (`cold-frog-43511102`), production branch, region **AWS `ap-southeast-1` (Singapore)**.
- `neon.ts` branch policy and `.neon` project link (`.neon` stays git-ignored).
- `@vercel/functions` `attachDatabasePool()` so Vercel Fluid compute releases idle Postgres clients.
- `npm run build` (tests + module check + render check) and `npm start`.
- Local dev server now serves `/api/cloud` and loads `.env.local`.
- CI now runs `npm ci && npm run build`.

### Verified

- `neon deploy`: branch matches policy; 5 Neon variables pulled into `.env.local`.
- Local API: `GET /api/cloud` returned revision 0 before seeding.
- Full dataset push: `POST` returned `{"revision":1}`; `GET` returned **2.203 rolls / 20 customers / 2026-11-13**.
- Vercel production: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `LAJUR_SYNC_KEY` set; `/api/cloud` runs in `sin1`.

---

## [2.29.1] — 2026-11-20

**Release name: Sinkron Neon Region Singapura.** Deployment region pinned to Singapore so the API runs beside a Singapore Neon database.

### Changed

- `vercel.json` pins the `/api/cloud` function to **`sin1` (Singapore)**.
- Setup docs and Settings now require a Neon project in **AWS `ap-southeast-1` (Singapore)**.
- `.env.example` shows a Singapore pooled Neon host.

### Verification

- `node --test`: **92 passed**; module check **59/59**; render check passes.
- Vercel deployment reports the function build in `sin1`.

---

## [2.29.0] — 2026-11-20

**Release name: Sinkron Neon & Domain Lavishome.** The shared dataset backend moved from a browser-side Supabase RPC to a Vercel Function backed by Neon Postgres.

### Added

- **`api/cloud.js`:** GET/POST `/api/cloud?workspace=lavishome` with `x-lajur-key`, optimistic revision guard, transaction per push, and automatic `lajur_cloud` table creation.
- **Neon setup:** `db/neon.sql`, plus Vercel environment variables `DATABASE_URL` and `LAJUR_SYNC_KEY`.
- **Gzip transport:** the dataset is gzip-compressed in both directions so the current ~3.7 MB document stays under Vercel's 4.5 MB function limit.
- **Pure handler tests:** request authorization, workspace validation, GET/POST, and 409 revision conflicts.

### Changed

- Settings → Data now asks for workspace + sync key (and an optional API URL), not a Supabase project URL/anon key.
- Shell footer shows **Tersinkron ke cloud Neon** when sync is configured.
- Production domain is **https://lavishome.vercel.app**; `lajur-lake.vercel.app` remains an alias.
- The live domain was seeded with the 13 Nov 2026 dataset: **2.203 rolls, 144.590,62 m, 20 customers**.

### Removed

- `db/supabase.sql` and the direct browser-to-Supabase RPC path.

### Verification

- `node --test`: **92 passed** (89 + 3 API handler tests).
- Module import check: **59 modules**; render check passes.
- Deploy: Vercel production + `lavishome.vercel.app` domain; live browser shows v2.29.0, 2.203 rolls, 20 customers, zero console errors.

---

## [2.28.1] — 2026-11-20

**Release name: Perbaikan Restore Database.** Patch for the JSON upload path after a dated stock sync.

### Fixed

- `validateBackup` no longer rejects `sellPriceHistory` rows whose SKU or part was archived by a later stock sync. This made a full-dataset export impossible to upload back into the app.
- Verified the 13 Nov 2026 dataset (2.203 rolls including archived rows, 20 customers) restores into the new `lavishome.vercel.app` origin.

### Verification

- `node --test`: **89 passed**.
- Module import check: **58 modules**; render check passes.

---

## [2.28.0] — 2026-11-20

**Release name: Faktur per Roll & Sinkron Supabase.** Collection → motif → roll invoice entry with whole-roll defaults, surat jalan/tax actions from Penjualan, customer delivery maps with PIC, database download/upload, in-app changelog, stock sorting, and optional Supabase cloud sync.

### Added

- **Faktur per roll:** pick **Koleksi → Motif/warna → Roll**. Each roll shows its available metres. The default mode is **Roll utuh**; **Potong** is available when the roll has no reservation.
- **Penjualan quick actions:** the invoice list links to **Surat jalan**; the invoice detail can create/print a surat jalan and issue/print a faktur pajak from the top action bar.
- **Customer delivery map:** the customer profile shows a Google Maps embed of the delivery address, plus the **PIC penerimaan** name and external customer code. PIC is editable in the customer form.
- **Database download/upload:** Settings → Data downloads the full JSON dataset (`Unduh database`) and restores it (`Unggah database`). Restore now tolerates price-history rows whose SKU was archived by a later stock sync.
- **Supabase cloud sync:** `db/supabase.sql` creates a workspace table and two RPC functions. Settings → Data stores the project URL, publishable key, workspace and workspace secret; data is pulled on start and pushed after each change with optimistic revision checks.
- **In-app changelog:** the sidebar version button, Stock page, and Settings → Data open **Riwayat versi**.
- **Stock sorting:** sort collections/motifs by **Meter tersedia terbanyak**, **Nama A–Z**, or **Nama Z–A**. The roll list follows the same order.

### Changed

- The sidebar groups **Pengiriman / Surat Jalan** directly after **Penjualan**.
- Customer records keep `contactName`, `externalCode` and `source` from the Excel import and manual edits.
- The visible app URL is **https://lavishome.vercel.app** (the existing deployment keeps `lajur-lake.vercel.app` as an alias).

### Verification

- `node --test`: **89 passed** (3 cloud-config/revision/RPC tests + 1 archived-SKU backup test).
- Module import check: **58 modules**; render check passes.
- Browser QA: collection/motif/roll cascade with whole-roll default; sort A–Z reorders the collection list; customer map iframe and PIC render; settings cloud card renders with all four actions; changelog modal shows v2.28.0; zero console errors.

---

## [2.27.0] — 2026-11-20

**Release name: WA Multi-Stok & Impor Customer.** Multi-select WhatsApp stock scopes, resi-only copy, third-party cek resi, QR tag URL/PIC/date, and customer Excel import.

### Added

- **WA multi-select:** choose several collections and several motifs (Ctrl/Cmd + click). The preview and message can cover one motif, many motifs, whole collections, or all selected scopes.
- **Resi-only copy:** the copy button beside the resi now copies only the tracking number. A separate **Salin link** copies the tracking URL.
- **Third-party cek resi:** a **Cek resi** link opens `cekresi.com` with the resi prefilled, for a second check independent of the courier page.
- **QR tag URL/PIC/date:** every printed tag now includes the public `#/scan/:id` URL and manual **PIC cetak** + **Tanggal cetak** fields.
- **Customer Excel import:** Customers → **Impor Excel**, with header detection (`NAMA LENGKAP KONTAK`), phone normalization, duplicate skipping by name/phone, preview and confirmation.
- **Customer import data:** all 15 rows from `customer test data.xlsx` imported into the local customer base.

### Changed

- Customer records now keep `contactName`, `externalCode`, `source` and `importedAt` from Excel.
- No API key is required for the cekresi.com page link. Automatic status polling through a courier API still needs a provider key or server proxy.

### Verification

- `node --test`: **85 passed**.
- Browser QA: two collections + two motifs selected in WA preview; resi copy yielded exactly `541680005420019`; cek resi URL prefilled; QR tag contained scan URL, PIC and date; customer file previewed 15 customers and imported 15 (0 duplicates).
- Version bumped to 2.27.0; schema 20 and backup v20 unchanged.

---

## [2.26.0] — 2026-11-20

**Release name: Workspace Stok & Impor Excel.** Defaults to a collapsed collection list with stock-only drill-down, adds stock/motif analytics, cascading WA share, sample deletion, and dated Excel import with backup.

### Added

- **Default Koleksi view:** Stok & Roll opens on a collapsed collection list, only collections with available stock. Click a collection to see motifs; click a motif to see lots/rolls. The old list/tree views remain.
- **Stock statistics:** total available rolls, collections with stock, active motifs, plus **Top koleksi** and **Top motif** bars.
- **Motif details:** each motif shows colour name/code, width, swatch, roll count, available metres and the underlying lot/roll rows.
- **Cascading WA share:** choose collection → motif; the modal shows available rolls/metres and builds a message only for that scope. Defaults to the collection with the most stock.
- **Delete buku sample:** manager-only soft delete; the stock row disappears but distribution history stays valid.
- **Dated Excel import:** manager can upload `.xlsx`, choose the stock date, preview SKU/roll/metre/sample counts, download a full database backup, then sync. The parser reads `NAMA WARNA` / `STOK_PER_ROLL` columns and handles the old file layout.
- **Sync history:** each import appends to `meta.stockSyncHistory`; the latest sync drives the stock notice.

### Changed

- Default stock filter is now **Hanya ada stok**; reset restores that default.
- The stock page notice shows the latest synced date/source and archived-roll count.
- Documentation now explains the production database/backup recommendation: Vercel static + localStorage is demo-only; production is API + PostgreSQL with `pg_dump`/PITR and restore drills.

### Verification

- `node --test`: **84 passed**.
- Browser QA: default Koleksi view collapsed; stats show 2,175 rolls / 35 collections / 257 motifs; collection→motif→lot drill-down works; WA collection→motif preview shows `ESPRIT · 1-1 — 6 roll · 663.7 m`; sample delete removes the row and preserves history; Excel upload preview reads 257 SKUs / 2,175 rolls / 144,590.62 m from the real file.
- Version bumped to 2.26.0; schema 20 and backup v20 unchanged.

---

## [2.25.0] — 2026-11-20

**Release name: Sinkron Stok 13 Nov 2026.** Imports the actual 13 November 2026 Excel stock list through a manager-only, preview-and-confirm action.

### Added

- **Stock sync plan:** bundled `src/data/stock-13nov2026.json` with **257 normal SKUs**, **2,175 rolls**, **144,590.62 m**, **40 sample pieces / 3,076 m**, and **47 collections**.
- **Manager sync action:** Stok → **Sinkron stok 13 Nov** opens a preview with SKU/roll/metre/sample counts, warehouse, lot `STOK-13NOV2026`, exclusions and the old-roll archive warning. A mandatory confirmation checkbox prevents accidental sync.
- **Safe archive:** the previous 24 available demo rolls are marked **void** with a movement note; invoices, projects and audit history remain readable. Old fabric SKUs are made inactive.
- **Sample import:** 40 Excel sample rows become Buku Sample stock per collection; they are never sold as normal rolls.
- **Stock plan provenance:** `meta.stockSync` records source, date, warehouse, counts, archived rolls, user and timestamp.

### Data decisions applied

- Warehouse: **Jakarta (JKT)**.
- Excluded `BIAYA MATERI TAMBAHAN` and `FOLDER LUNALITE`.
- `PROFLEX BEIGE` uses the per-roll total **200 m** (not the 400 m summary cell).
- Prices default to **Rp 0**; widths are parsed from the name with 280 cm fallback.

### Verification

- `node --test`: **83 passed**.
- Browser sync result: **2,175 imported rolls**, **144,590.62 m**, **40 sample pieces**, **24 old rolls archived**, 257 active imported SKUs.
- Referential checks: **0** missing SKU/collection/roll references in rolls, movements and invoice lines.
- Old invoice `INV-0003` still renders with its historical RL-0006 line.
- Version bumped to 2.25.0; schema 20 and backup v20 unchanged.

---

## [2.24.0] — 2026-11-20

**Release name: Surat Jalan Internal & Foto Sample.** Makes the surat jalan form follow the delivery type, adds driver signatures, shows the weekday, and adds sample-book photos.

### Added

- **Driver signature:** every A4 copy and dot-matrix form now has a Driver signature block; internal deliveries label it **Driver (internal)**.
- **Internal delivery mode:** internal couriers hide resi/AWB/link fields, show the internal surat jalan number, and use a manual **Nama driver** when the driver is not in the master.
- **Courier-specific fields:** online couriers (Grab/GoSend/Lalamove) show only the app share link; logistics couriers (JNE/J&T/SiCepat/AnterAja/Bali Kargo) show only the resi/AWB upload + scan. Service options continue to follow the courier.
- **Delete AWB photo:** editing a surat jalan can remove the uploaded resi image; the number can still be typed.
- **Day display:** surat jalan cards, list and print show **Hari** (e.g. Jumat) instead of the raw date.
- **Sample-book photo:** buku sample stock and procurement accept a photo (max 800 KB); the stock table shows a thumbnail that opens full-size. Photos can be replaced or removed.
- **Tag print priority:** opening Tag A4 from a roll detail puts that roll first in the picker, preselects it, and prints it first.
- **Salin near resi:** the copy-link action sits next to the resi text (or next to the app link when there is no resi).

### Verification

- `node --test`: **81 passed**.
- Browser QA: internal form hides resi/link; JNE shows AWB only; GoSend shows link only; delivered surat jalan opens edit; AWB photo removal works; internal print shows `NO. SURAT JALAN`, `SJ-0003`, `Hari Jumat`, `Driver (internal)`; RL-0007 is first and checked in Tag A4; sample photo thumbnail renders.
- Version bumped to 2.24.0; schema 20 and backup v20 unchanged.

---

## [2.23.0] — 2026-11-20

**Release name: Surat Jalan 3 Salinan.** Adds courier brand marks, active surat jalan editing, number-focused AWB extraction, and two print layouts.

### Added

- **Courier marks:** each delivery company gets a compact brand wordmark (JNE, J&T, SiCepat, AnterAja, Grab, GoSend, Lalamove, Bali Kargo, Lavishome Fleet) in the delivery card, Pengiriman table and surat jalan print.
- **A4 laser — 3 copies:** one A4 sheet contains **ORIGINAL / PELANGGAN**, **SALINAN / BUKTI PENGIRIMAN (POD)** and **SALINAN / ARSIP LOGISTIK**, with dashed cut lines. Each copy has its own header, AWB, addresses, items, signatures and tracking link.
- **Dot matrix — 9.5 × 11 in:** a monochrome continuous-form layout with bordered boxes, monospace type, all items, signatures and tracking URL.
- **Print chooser:** clicking print on a surat jalan now asks for A4 laser (3 copies) or dot matrix.

### Changed

- **Active surat jalan can be edited:** draft, dispatched and delivered deliveries are editable; confirmed deliveries remain locked.
- **AWB scanning focuses on the number:** OCR output such as `541680005420019DEAKEIPSI` is reduced to the leading digit run `541680005420019`, and long numeric groups are preferred over barcode/letters.

### Verification

- `node --test`: **81 passed**.
- Browser QA: A4 output has 3 copies and 2 cut lines; dot matrix uses `9.5in 11in` and contains the resi + tracking URL; delivered surat jalan opens the edit modal.
- Version bumped to 2.23.0; schema 20 and backup v20 unchanged.

---

## [2.22.2] — 2026-11-20

**Release name: Salin Link Lacak.** Adds one-click copy for the tracking link on surat jalan.

### Added

- **Salin link lacak** on the invoice delivery card and the Pengiriman table/mobile cards. Copies a ready-to-paste message: courier, service, resi and the official/app tracking URL, for example:
  `JNE Express · YES · Resi JNE-9999`
  `https://...`
- The printed surat jalan now includes the tracking URL under **Lacak paket**.

### Verification

- `node --test`: **80 passed**.
- Browser QA: copied `JNE Express · YES · Resi JNE-9999` + GoSend link; print output contains the same tracking URL.

---

## [2.22.1] — 2026-11-20

**Release name: Resi JNE Terbaca.** Hardens AWB photo scanning for real phone photos of JNE-style labels.

### Fixed

- ZXing now gets a second pass on a contrast-stretched greyscale canvas when the original photo fails to decode. Low-contrast or slightly uneven photos that previously fell through to OCR can now yield the barcode value.
- Added a regression test using the real JNE label layout and number `541680005420019`; the exact Code128 barcode was decoded in browser QA with the same number.

### Verification

- `node --test`: **80 passed**.
- Browser QA: generated Code128 `541680005420019` and a deliberately faint version both filled the resi field.
- Version bumped to 2.22.1; schema 20 and backup v20 unchanged.

---

## [2.22.0] — 2026-11-19

**Release name: Pilih Roll & Lacak Resi.** Pick exact rolls for A4 tags, use a real user PIC dropdown, read AWB numbers from photos, and follow deliveries with courier tracking links and arrival notifications.

### Added

- **Multi-roll A4 picker:** the tag dialog lists every roll with a search box, checkboxes, “Pilih terlihat”, and a live count of tags/pages. Select any rolls (not only a whole collection), set copies, and print 8 tags per A4 sheet.
- **PIC user dropdown:** surat jalan PIC now comes from active users grouped by role — manager, sales, operator, and **driver** — while the printed name stays snapshotted.
- **AWB photo reader:** uploading a resi photo tries the platform `BarcodeDetector`, then ZXing (Code128/Code39/QR), then in-browser Tesseract OCR. The detected number fills **No. resi** automatically; every step has a clear fallback to manual entry.
- **Tracking links:** store a share link from Grab/GoSend/Lalamove (or any courier app); JNE, J&T, SiCepat, AnterAja and Bali Kargo get their official tracking page automatically. “Lacak” buttons appear on the invoice card and Pengiriman table.
- **Arrival notifications:** enable browser notifications from Pengiriman or the invoice card. Marking a delivery “Tiba” fires a notification, shows an in-app notice, and adds a Pengiriman badge for packages awaiting confirmation.

### Changed

- Delivery data adds `picUserId`, `picRole`, `trackingUrl`; watchers/backups validate the new user and URL references.
- Version bumped to 2.22.0, schema 20, backup v20.

### Verification

- `node --test`: **79 passed**.
- Module imports **49 modules**; render checks green.
- Browser QA: selected 3 rolls × 2 copies = 6 tags; QR barcode photo read as `JT123456789012` (ZXing); PIC dropdown grouped by role including drivers; GoSend share link opened from the delivery card; delivered package produced a nav badge, in-app notice and confirmation prompt.

---

## [2.21.0] — 2026-11-19

**Release name: Tag A4 & Armada Fleksibel.** A4 QR tag sheets, a reliable editable surat jalan with courier-specific services and AWB photos, stock hierarchy split by availability, and many-to-many driver/vehicle links.

### Added

- **A4 stock tags:** **Tag A4** prints 8 tags per sheet (2 × 4) in plain A4 mode — one roll, repeated copies, or every roll in a motif/collection, with an include-sold option.
- **Surat jalan edit:** draft surat jalan can be edited from the invoice and the Pengiriman table. The form supports customer/recipient selection, PIC suggestions, estimated arrival (`ETA`), and a scrollable modal.
- **AWB photo:** AWB/resi can be typed or uploaded as an image (max 800 KB), stored on the delivery and shown on the invoice detail.
- **Courier service map:** `SERVICES_BY_COURIER` validates services server-side; JNE accepts only REG/YES/OKS, J&T EZ/ECO/CARGO, and so on.
- **Many-to-many drivers/vehicles:** drivers can use several company vehicles and vehicles can be used by several drivers; Master Data uses multi-select lists and surat jalan picks driver and vehicle independently.
- **Stock availability split:** the default hierarchy is collection/motif → colour, ordered by most available; sold/consumed rolls move to a **Terjual / habis** group. The list view adds the same group headers.

### Changed

- Removed the duplicate top **Surat jalan** action; only the single **Buat surat jalan** card remains and all action buttons are bound (including multiple mobile/desktop instances).
- Surat jalan defaults to the driver’s/vehicle’s linked pair but no longer overwrites an explicit choice.
- Delivery records now store `recipientCustomerId`, `eta`, and `awbImage`; fleet assets store `driverIds`.
- Version bumped to 2.21.0, schema 19, backup v19.

### Verification

- `node --test`: **76 passed**.
- Module imports **47 modules**; render checks green.
- Browser QA: A4 sheet generated 26 tags for 13 rolls × 2 copies at 8mm margins; JNE service list REG/YES/OKS; surat jalan create/edit with ETA and recipient; driver linked to two vehicles and both vehicle rows updated; stock tree/list availability grouping.

### Migration

- Existing `driverId` links are copied into `driverIds`; `recipientCustomerId`, `eta`, `awbImage` and default courier services are filled on load. No manual data action required.

---

## [2.20.0] — 2026-11-19

**Release name: Scan Stok & Motif.** Adds a public QR stock-status page, buku sample stock/price editing with warehouse locations, conversion filters, and collection motive/base pricing.

### Added

- **Public QR scan page:** scanning `#/scan/RL-0001` shows stock status and cut history even when logged out. Visitors get a login prompt for full actions; the scanned roll URL survives login.
- **Buku sample filters:** Tersedia / Habis filter for stock; Terkonversi / Belum konversi filter beside riwayat distribusi.
- **Edit buku sample:** manager can edit qty, sample price, refundable deposit, minimum and warehouse location directly from the stock row.
- **Sample warehouse location:** sample stock can be in Gudang Jakarta or Gudang Bali, chosen during procurement, edit, or initial collection creation.
- **Motive & base price:** each collection stores a motif and a base motif price; each colour/SKU keeps its own sell price, allowing different prices per colour.
- **Roll cut/leftover page:** current stock, total cut, remaining metres, cut history and full movement history.

### Changed

- QR payload now targets `/ #/scan/:id`; detail remains available after login.
- Collection master displays motif, base price, sample price/deposit/stock and warehouse.
- Version bumped to 2.20.0, schema 18, backup v18.

### Verification

- `node --test`: **74 passed**.
- Module imports **47 modules**; render checks green.
- Browser QA: logged-out scan page, login redirect, cut-history page, stock/history filters, sample edit/warehouse, collection motive.

### Known limitations

- Public scan reads the local demo dataset. Cross-device live scanning requires the shared API/PostgreSQL client to be wired to the UI.
- No handheld scanner integration.

---

## [2.19.0] — 2026-11-19

**Release name: Buku Sample & QR Scan.** Makes the QR scan open the roll page even before login, adds a clear cut-history/leftover view, and renames the sample flow to factory-supplied **buku sample** per collection with no in-app book assembly.

### Added

- **QR scan landing:** scanning a roll QR opens `#/stok/:id`; if logged out, the app preserves the scanned URL through login instead of dropping the user on the dashboard.
- **Roll cut history:** roll detail now shows panjang awal, total dipotong, sisa roll (stok aktual), each cut with before/after metres, reference and user, plus the full movement history.
- **Buku sample catalogue:** price, refundable deposit, stock, minimum and location per collection, with procurement history.

### Changed

- Sample terminology is now **buku sample** across the nav, page, customer profile, collection master and guide.
- Buku sample is factory stock per collection. In-app “make a sample book” assembly was removed; stock is procured, not built.
- Seed sample distributions now consume buku sample stock; no seeded sample cuts a sellable roll.
- Version bumped to 2.19.0; schema and backup stay at 17.

### Verification

- `node --test`: **74 passed**.
- Module imports and server-side render green.
- Browser QA: QR/deep link survives login; RL-0007 shows 1 cut 70 m → 69.5 m; Buku Sample page shows factory stock/price/deposit and no book assembly.

---

## [2.18.0] — 2026-11-19

**Release name: Sample Pabrik & QR.** Replaces roll-cut sample stock with factory-procured collection samples, adds sample pricing/deposit and procurement history, and switches roll stock tags to scannable QR codes.

### Added

- **QR stock tags:** roll tags now use a real QR code that opens the roll detail when scanned with a phone camera. QR includes the absolute app URL; the tag still shows roll, collection, cloth type, colour, width, lot, length and warehouse/bin.
- **Collection sample stock:** sample quantity lives under the collection, not on a roll. When creating/editing a collection, enter sample price, refundable deposit, minimum stock and factory quantity/cost.
- **Factory procurement history:** every sample receipt stores date, qty, unit cost, total, supplier and note. A “Riwayat” action shows it per collection.
- **Sample catalogue:** stock, sample price, refundable deposit, minimum and location are visible before giving a sample.
- **Sample book from collection stock:** books consume one collection sample per item, not roll cuts.

### Changed

- Giving a sample decrements collection sample stock by one pcs; the sample record stores collection, optional SKU, stockId, mode and deposit.
- Free/paid/deposit modes remain. Paid defaults to the collection sample price; deposit defaults to the collection refundable deposit.
- Existing per-colour sample stock is migrated and aggregated into collection-level factory stock.
- Version bumped to 2.18.0, schema 17, backup v17.

### Verification

- `node --test`: **74 passed**.
- Module imports and server-side render green.
- Browser QA: Luna/Aria/Nova catalogue shows price/deposit/stock; deposit automatic Rp 50.000; stock decrements; procurement history; QR tag renders and prints.

### Known limitations

- QR scanning opens the app URL; it does not deep-link a native scanner integration.
- Sample stock is counted in pieces, not metres.
- QR generation uses the bundled `qrcode-generator` library.

---

## [2.17.1] — 2026-11-18

**Release name: Sample, Barcode & Harga polish.** Fixes migration of existing collections so their cloth type is derived from the category instead of defaulting to “Kain”.

### Fixed

- Legacy Luna/Aria/Nova collections now migrate to Blackout/Sheer/Dimout using their category, with 60 m × 300 cm defaults.
- Existing local data gains sample stock, roll barcodes and sell-price history on load.

### Verification

- `node --test`: **73 passed**; module and render checks green.
- Live migration checked on an existing v2.16 browser dataset.

---

## [2.17.0] — 2026-11-18

**Release name: Sample, Barcode & Harga.** Adds sample stock and distribution history, roll barcode tags, customer WhatsApp stock sharing, sell-price history with 90-day review, collection cloth types/default roll size, and shipping-capitalised warehouse transfers.

### Added

- **Sample stock per collection:** fabric sample pieces are cut from rolls into showroom stock. Give one to a customer without another stock cut; stock decrements and a history entry is written.
- **Sample distribution history:** customer summary shows samples taken, metres, un-converted count, conversion count, purchase total and last sample date.
- **Roll barcode tags:** every roll gets a stable Code 39 barcode (roll ID), printable on a stock tag with collection, cloth type, colour, width, lot, length and warehouse/bin.
- **Customer WhatsApp:** customer master stores a WA number; customer detail and Stock have an **Info stok WA** action that builds a copy-paste stock availability message and opens `wa.me`.
- **Sell-price history:** every price change is recorded with old/new price, date, user and note. Prices untouched for ≥90 days require explicit confirmation before a change.
- **Collection metadata:** cloth type is defined before colour; collections default to a 60 m × 300 cm roll.
- **Internal transfer shipping:** warehouse-to-warehouse transfers accept an ongkir; it is capitalised into destination roll HPP when received.
- **Surat jalan warning:** Pengiriman lists posted invoices that still need a surat jalan.

### Changed

- Version bumped to 2.17.0, schema 16, backup v16.
- Order/collection master copy now shows cloth type and default roll size.
- Transfer copy now describes internal warehouse sales rather than a purely free movement.

### Verification

- `node --test`: **72 passed**.
- Module imports 46/46; server-side render all views.
- Browser QA: collection defaults, sample stock give, customer WA message, price review 90-day confirmation, barcode tag preview and posted-invoice surat-jalan warning.

### Known limitations

- Barcode is Code 39 on a printable tag; there is no hardware scanner integration yet.
- Sample stock counts pieces, not metres; the source roll still tracks metres.
- Transfer shipping is apportioned evenly across requested metres.

---

## [2.16.1] — 2026-11-18

**Release name: Lavishome polish.** Completes the brand sweep in secondary labels and download filenames.

### Fixed

- Master Data copy, driver hint, catalog print title and fleet labels now say **Lavishome Fleet**.
- Backup, stock and report downloads use `lavishome-*` filenames.

### Verification

- `node --test`: **67 passed**; module and render checks green.
- Live login, sidebar, company name and Master Data checked after deployment.

---

## [2.16.0] — 2026-11-18

**Release name: Lavishome.** Rebrands the visible wordmark, document headers, company and fleet names from Lajur to Lavishome.

### Changed

- Sidebar, login screen, browser titles, loading screen and print documents now use **lavishome**.
- Company name becomes **PT Lavishome Tekstil Nusantara**; internal fleet becomes **Lavishome Fleet**.
- Product-part brand and import supplier display names use Lavishome.
- Logo mark renamed to `/assets/lavishome-mark.svg`; favicon label updated.
- Existing local datasets are migrated from the old brand strings without changing storage keys or transaction IDs.
- Version bumped to 2.16.0; schema and backup stay at 15.

### Verification

- `node --test`: **67 passed**, including brand migration.
- Module imports and server-side render remain green.
- Browser QA: login, sidebar, ringkasan, master, invoice and consignment print show **lavishome** / **PT Lavishome Tekstil Nusantara** / **Lavishome Fleet**.
- Existing v2.15 local data is rebranded on load.

---

## [2.15.0] — 2026-11-09

**Release name: Armada Internal & Assignment.** Drivers are now attached to an internal vehicle, the fleet asset list contains only Lajur Fleet vehicles, and third-party delivery stays available as a courier option.

### Added

- **Driver ↔ vehicle assignment:** the driver form selects an internal vehicle; the vehicle form can assign a driver. Moving either side keeps the pair in sync and prevents one driver from holding two vehicles.
- **Internal fleet only:** the Armada internal table lists only Lajur Fleet vehicles. Lalamove, J&T, JNE and other third-party vehicles are no longer fleet assets.
- **Surat jalan modes:** internal delivery shows driver + assigned vehicle; third-party delivery hides the internal fleet fields, keeps courier/service/AWB, and allows an optional courier driver name.
- Delivery snapshots now include `fleetAssetId` and `vehicleName`; the card, Pengiriman list and consignment print show the vehicle name.
- Migration removes old third-party mock vehicles, converts real vehicles to internal, syncs driver assignments and backfills delivery vehicle snapshots.

### Changed

- Version bumped to 2.15.0, schema 15, backup v15.
- Master Data tab renamed **Driver & armada**; the transport table is now **Transport & kurir**.
- `saveDriver` accepts `fleetAssetId`; `saveFleetAsset` no longer accepts ownership and always belongs to the internal fleet.

### Verification

- `node --test`: **66 passed**.
- Module imports and server-side render remain green.
- Browser QA: Asep → Honda Vario, Rudi → Toyota Hilux, Slamet → Isuzu Elf; moving Asep to the Hilux unassigns Rudi and updates both records.
- Browser QA: internal SJ-0003 snapshots FLT-002 / Toyota Hilux / Lajur Fleet; J&T SJ-0002 has no fleet asset and uses courier driver “Kurir J&T”; print shows the vehicle and transport.

### Known limitations

- One internal vehicle per driver; there is no assignment history or shift calendar.
- Third-party couriers have no asset record by design; only the courier, AWB and optional driver name are stored.

---

## [2.14.0] — 2026-11-09

**Release name: Transport di Surat Jalan.** Connects the transport/armada master to surat jalan generation, so a generated delivery note carries the driver, vehicle and transport company from the mock data.

### Added

- **Transport / armada field** on the surat jalan form, populated from the active transport master (Lajur Fleet, Lalamove, GoSend, Bali Kargo, J&T, JNE).
- Selecting a driver auto-fills phone, vehicle, plate and — for internal delivery — the driver's transport.
- Selecting a non-internal courier auto-selects the matching transport.
- Delivery records snapshot `transportId` and `transportName`; the invoice card, Pengiriman list and consignment print show the transport.
- Existing deliveries are backfilled with a transport snapshot during migration.

### Changed

- Version bumped to 2.14.0, schema 14, backup v14.
- `createDelivery`/`updateDelivery` resolve transport explicitly, then from the courier, then from the driver.

### Verification

- `node --test`: **64 passed**.
- Module imports and server-side render remain green.
- Browser QA: J&T + Rudi → J&T Express, Internal + Slamet → Bali Kargo Utama; generated SJ-0003/SJ-0004 show the transport; print includes `TRANSPORT / ARMADA`.

### Known limitations

- Transport is a snapshot; changing a driver's transport in master data does not rewrite existing surat jalan.
- Courier and transport remain separate choices because a courier brand and the operating armada can differ.

---

## [2.13.0] — 2026-11-09

**Release name: NPWP Opsional.** Makes the customer NPWP an explicit optional field for faktur pajak, with validation when filled and automatic fallback from the customer record.

### Added

- **Optional NPWP:** customer create/edit and the faktur pajak issue form label NPWP as optional and explain that it can be left blank.
- **Validation:** when filled, NPWP accepts the dotted 15-digit format or the newer 16-digit NIK/NPWP form; letters and implausible lengths are rejected with `INVALID_NPWP`.
- **Tax invoice fallback:** issuing a faktur pajak uses the entered NPWP, otherwise the customer's NPWP, otherwise leaves it blank and prints `-`.
- Regression test covers blank NPWP, customer fallback and invalid input.

### Changed

- Version bumped to 2.13.0, schema 13, backup v13.
- Guide and tax-invoice copy now state that NPWP is optional.

### Verification

- `node --test`: **62 passed**.
- Module imports and server-side render remain green.
- Customer form, tax-invoice form and tax-invoice print retain the existing layout and keyboard flow.

### Known limitations

- NPWP is stored and printed as text; this demo does not validate against DJP/Coretax or generate an official e-faktur.
- NPWP is not required for posting an invoice or issuing a faktur pajak.

---

## [2.12.0] — 2026-11-09

**Release name: Armada, Resi & PostgreSQL.** Adds a fleet-asset master, J&T/JNE-style consignment surat jalan and an optional PostgreSQL production store for the reference API.

### Added

- **Fleet asset master:** motors, cars and trucks with code/plate, internal or third-party ownership, linked transport and driver, capacity (kg) and tax expiry; six seeded assets (Honda Vario, Hilux, Isuzu Elf, Lalamove motor, J&T van, JNE truck), create/edit and duplicate-plate guard.
- **J&T/JNE consignment fields on surat jalan:** recipient name/phone, courier, service (REG/YES/OKS/COD/CARGO), AWB/resi, weight, pieces, shipping cost, insurance, COD and delivery instructions.
- **Consignment-note print layout:** sender/recipient blocks, AWB header, service, weight/pieces, charges, pseudo barcode, PIC and receiver signature lines. Prices remain excluded from the goods list.
- **PostgreSQL store:** `db/schema.sql` and `server/pg-store.mjs`; `DATABASE_URL` selects JSONB state with ACID transactions, optimistic revision guard, audit, users/sessions and idempotency tables. JSON files remain the zero-setup fallback.
- **Health storage flag:** `/api/health` reports `storage: postgres` or `json`.

### Changed

- Version bumped to 2.12.0, schema 13, backup v13.
- `pg` added as the reference-server dependency; `package-lock.json` committed.
- Delivery master/migration backfills consignment and fleet fields for older datasets.
- Transport master includes J&T Express and JNE Express; couriers include J&T, JNE, SiCepat and AnterAja.

### Verification

- `node --test`: **61 passed** (59 domain/UI + 2 auth), including fleet-asset migration, consignment delivery and price-free consignment print invariants.
- Module imports 46/46; render 26/26 views including master, delivery and print paths.
- JSON server starts and `/api/health` returns `storage: json`.
- PostgreSQL schema and store are ready; a live database was not provisioned in this environment.

### Known limitations

- The static Vercel demo still uses browser-local storage; the API is a reference implementation.
- PostgreSQL holds the whole domain document in JSONB rather than row-level financial tables; row-level posting and immutable documents remain the next migration step.
- Server users/sessions are still JSON-backed when running without a database; the PG user/session tables exist but are not yet used by the auth path.
- Object storage for real product/proof images is still absent.

---

## [2.11.0] — 2026-11-09

**Release name: Driver, Sample & Panduan.** Adds driver user accounts and corporate transport, sample books from roll cuts, customer catalog, and an in-app tutorial for every process.

### Added

- **Driver user role:** Asep, Rudi and Slamet are users (PIN 1212/2323/3434) linked to driver records. Driver sees Ringkasan/Tugas/Pengiriman/Panduan; can Kirim/Tiba, not confirm receiver or see prices/master.
- **Transport master:** Lajur Fleet (internal), Lalamove, GoSend, Bali Kargo Utama; drivers link to a transport company.
- **Sample book:** create a giveaway book from multiple roll cuts, each cut reduces stock and creates a sample; print/PDF and mark recipient/date.
- **Catalog:** active colours, width, sell price and availability; print/PDF for customers.
- **In-app guide:** 14 tutorial sections covering every business-process input.
- Driver seed accounts and transport links; driver dashboard.

### Changed

- Version bumped to 2.11.0, schema 12, backup v12.
- Sales/nav gains Katalog and Pengiriman; all roles gain Panduan; Master Data remains in Simple.
- Auth defaults and reference server RBAC include driver accounts.

### Verification

- `node --test`: **57 passed** (30 invariants + 4 operations + 9 admin + 5 orders/pricing + 3 invoice/delivery + 4 production + 2 auth).
- Module imports 46/46; render 24+ views including Katalog, Pengiriman and Panduan.
- Simple routes **22/22**; Advanced with WIP+Pesanan **28/28**, zero console errors.
- Driver login: only Ringkasan/Tugas/Pengiriman/Panduan; invoice URL redirects to Pengiriman.
- Sample book SB-0001: 2 roll cuts, stock reduced, given to Budi Prospek, print contains BUKU SAMPLE.
- Catalog: 5 active SKUs, print/PDF output.
- Guide: 14 sections.

### Known limitations

- Driver role is demo-level; server API includes driver login but no driver-specific delivery endpoints yet.
- Sample book is an index for a physical book; there is no printed cover design editor.
- Catalog is fabric-only and shows current stock, not a reserved order quantity.

---

## [2.10.0] — 2026-11-08

**Release name: Gudang & Tiket.** Consolidates warehouses to Jakarta + Bali, moves Master Data into Simple mode, adds printed task tickets/online-assignment option, manual stock shortcut, delivery schedules and Chinese supplier demos.

### Added

- **Warehouse consolidation:** only Jakarta (JKT) and Bali (DPS); legacy Bandung/Surabaya references migrate to Bali.
- **Master Data in Simple mode:** master updates, including Driver & kendaraan, no longer require Advanced.
- **Task tickets + print queue:** print a single ticket or the filtered queue with Cetak/PDF; printing increments count and records printer/time.
- **Online assignment option:** Settings toggle. When off, tasks are created without an online assignee, the assign action is hidden, and the printed ticket carries the manual worker slot.
- **Manual stock addition:** clarified **Tambah stok manual**, also opened by `#/stok?add=1`.
- **Delivery schedule:** sales list shows driver/date/courier/status; surat jalan warns when a driver already has another delivery that day.
- **Chinese supplier demos:** Ningbo, Shaoxing, Yiwu and Guangzhou suppliers, CNY prices and a draft Shaoxing PO (`PO-0006`).

### Verification

- `node --test`: **56 passed**; module imports 43/43; render 24/24.
- Warehouses: exactly JKT Jakarta and DPS Bali; legacy references remapped in migration.
- Task ticket: TSK-0003 printCount 1, printedBy Henry Martin; ticket/PDF toolbar present.
- Online assignment off: notice shown; create form has no assignee field.
- Manual stock: `#/stok?add=1` opens Tambah stok with Jakarta + Bali.
- Delivery schedule: overlapping Asep/2026-10-06 shows SJ-0001 conflict.
- Chinese suppliers: 4 CNY suppliers; draft PO-0006 from Shaoxing.
- Browser routes: 19 Simple / 25 Advanced with modules; zero console errors.

### Known limitations

- Print tickets are paper/PDF; there is no physical printer integration or QR scanner.
- Online assignment is a demo toggle, not server push.

---

## [2.9.0] — 2026-11-08

**Release name: Driver & PDF.** Adds print/PDF for every document, driver/vehicle master, third-party couriers, address autocomplete/map, mobile drawer scrolling and task QA.

### Added

- **Print + PDF for all printable items:** print preview now has **Cetak** and **Unduh PDF**. PDF is generated from the document layout in the browser.
- **Driver & kendaraan master:** name, phone, Motor/Mobil/Truk, plate, active flag, notes; add/edit in Master Data.
- **Surat jalan driver selection:** choosing a master driver autofills phone, vehicle type and plate; delivery snapshots those values.
- **Third-party couriers:** Internal, Lalamove, GoSend, GrabExpress + tracking reference.
- **Address autocomplete + map preview:** suggestions from customers and prior deliveries; inline map and external map link.
- **Mobile sidebar scrolling:** Advanced-mode drawer now scrolls independently at 320/390.

### Fixed

- Sidebar/nav footer could not be reached on small phones when Advanced mode added menu items.
- Print preview previously auto-opened the print dialog, preventing a PDF choice.

### Verification

- `node --test`: **56 passed** (29 invariants + 4 operations + 9 admin + 5 orders/pricing + 3 invoice/delivery + 4 production + 2 auth).
- Module imports 43/43; render 24/24.
- Print/PDF test: `Tes-PDF-Lajur.pdf`, 60.370 bytes.
- Driver master: 3 seeded drivers; Asep → motor/B 1234 CD; Rudi → mobil/B 9876 EF; form autofill verified.
- Delivery form: 4 driver options, address datalist, map iframe updates when address changes.
- Mobile sidebar: 320/390 scrollHeight 1037/1021, scrollTop 220 works.
- Task simulation: create → start → complete with note and history.
- Browser routes: 18 Simple / 25 Advanced with modules; zero console errors.

### Known limitations

- PDF generation uses jsDelivr (jsPDF + html2canvas); offline use falls back to Cetak → Simpan sebagai PDF.
- Map preview uses Google Maps embed and requires network access.
- Driver/courier data remains local to the demo dataset.

---

## [2.8.1] — 2026-11-08

**Release name: Kurs Manual.** Removes every default FX rate from purchase orders.

### Changed

- **No PO rate default.** The CNY→IDR field starts empty for foreign POs. The latest rate is shown only as reference text, never prefilled or applied automatically.
- Saving a foreign PO without a rate is rejected (`INVALID_FX`).
- Every foreign PO enters a user-determined rate, recorded with timestamp and source `Kurs manual PO`.
- Line price conversion shows values only after a rate is entered (unless the supplier quote already matches the PO currency).
- Seed POs keep their historical rates but do not append duplicate FX records.

### Verification

- `node --test`: **55 passed**, including missing-rate rejection and user-entered rate snapshot.
- UI: CNY supplier selected → rate field empty; latest reference shown as text; entering 2.250 enables totals and save.
- No automatic fallback to supplier FX, latest FX or previous PO.

---

## [2.8.0] — 2026-11-08

**Release name: Mode Kerja.** Splits the UI into Simple daily operations and Advanced analysis/setup, and renames the demo team.

### Added

- **Simple mode (default):**
  - Core menu: Ringkasan, Tugas, Stok, Permintaan Gudang, Pembelian, Penjualan, Proyek, Pelanggan, Sample, Opname, Pengaturan.
  - Purchasing limited to PO + Penerimaan.
  - Invoice discount/payment/return remain available.
  - No reports, master data, simulation, tax invoice, surat jalan, import tabs, WIP or Pesanan.
- **Advanced mode:**
  - Adds Laporan, Master Data, Simulasi.
  - Adds Faktur Pajak and Surat Jalan cards/actions.
  - Adds import shipment/bill/supplier tabs and PO price list.
  - Unlocks optional WIP/Pesanan when enabled.
- **Mode switch:** topbar chip for managers + Settings → Preferensi selector. Non-managers see the current mode in the sidebar footer.
- **Route guard:** advanced URLs redirect to the role home while Simple is active.
- **New demo names:** Henry Martin (manager), Henny (operator), Belinda (sales).
- Migration renames the previous default names once, without touching custom renamed users.

### Changed

- Version bumped to 2.8.0, schema 10, backup v10.
- `uiMode: 'simple'` added to settings; existing datasets migrate to Simple.
- Settings advanced toggles are only shown in Advanced mode.
- Simple invoice detail no longer shows tax/delivery cards; advanced modes do.

### Verification

- `node --test`: **55 passed** (29 invariants + 4 operations + 8 admin + 5 orders/pricing + 3 invoice/delivery + 4 production + 2 auth).
- Module imports 43/43; render 24/24.
- Simple route sweep: **18/18** with advanced URLs redirected.
- Advanced route sweep with WIP + Pesanan: **25/25**, zero console errors.
- Mode switch: Simple → Advanced restores Laporan, Master, Simulasi, import tabs, tax/delivery cards; Advanced → Simple removes them and redirects.
- Names: login/users show Henry Martin, Henny, Belinda.
- Lighthouse accessibility 100 after mode gating.

### Known limitations

- Mode is a dataset-wide setting, not per user; a manager changes it for the demo dataset.
- Advanced mode does not auto-enable WIP/Pesanan.
- This is still a browser-local demo; server RBAC remains separate.

---

## [2.7.0] — 2026-11-08

**Release name: Faktur & Pengiriman.** Adds invoice discounts, printable faktur pajak, post-invoice surat jalan with PIC and receiver confirmation, and role QA fixes.

### Added

- **Invoice discount:** fixed rupiah or percentage of subtotal, shown before posting and snapshotted on the invoice; label in detail and print.
- **Faktur pajak:** issue once for a posted invoice; DPP + PPN 11% calculated from the invoice total, NPWP/number stored, printable tax invoice; no manual price fields.
- **Surat jalan:** created from a posted invoice with PIC pengiriman, driver, vehicle, address; status draft → dispatched → delivered → confirmed; receiver name/note; printable surat jalan; stock never moves again.
- Customer NPWP field, prefilled into the tax invoice.
- Invoice detail delivery card and list/mobile delivery status; new `deliveries` collection.
- Invoice line prices prefill from master data for both fabric and spare parts (blank part price fixed).
- Role QA matrix across manager, sales and operator.

### Changed

- Invoice totals use a semantic `<dl>` (Lighthouse `dlitem` fixed).
- Version bumped to 2.7.0, schema 9, backup v9; migration adds `deliveries` and invoice tax/delivery fields.
- README/PRD/design system updated for invoice documents, tax invoice and surat jalan.

### Verification

- `node --test`: **55 passed** (29 invariants + 4 operations + 8 admin + 5 orders/pricing + 3 invoice/delivery + 4 production + 2 auth).
- Module imports 42/42; render 24/24; browser route sweep 21 default / 24 with optional modules.
- Invoice: part price 85.000 auto-filled; 4 × 85.000 with 10% discount → Rp 306.000.
- Faktur pajak: DPP 275.676 + PPN 30.324 = 306.000; duplicate issue rejected; print includes DPP/PPN.
- Surat jalan: seed SJ-0001 (PIC Henny) confirmed by Budi; new flow draft → dispatched → delivered → confirmed; part stock unchanged (22 → 22 in QA).
- Role QA: manager full; sales invoice/tax/delivery yes, purchasing/master/settings redirect; operator receiving/stock yes, invoice/prices redirect/absent.
- Mobile 320/390/768: invoice detail overflow 0; tax/delivery cards visible.
- Lighthouse accessibility 100 on invoice detail, invoice list and customer detail.

### Known limitations

- Faktur pajak is a demo, not an e-faktur integration; PPN is fixed at 11% and tax-inclusive.
- One surat jalan per invoice; delivery changes are status-only.
- Images remain local SVG/data URLs; object storage planned.
- Reference server is still not wired to the static UI.

---

## [2.6.0] — 2026-11-08

**Release name: Gudang Ringkas.** Parts get a category parent/child hierarchy in stock, all product/part thumbnails open a full-size preview, and WIP Production + Pesanan become optional modules hidden by default.

### Added

- **Part hierarchy in Gudang:**
  - Spare parts are grouped by category with parent/child rows.
  - `parentPartId` on parts; parent must be in the same category; cycles rejected.
  - Seed examples: Motor → Remote, Bracket → Bracket set, Rel 3 m → Rel 4 m.
  - Jakarta stock added for Rel 4 m (6 pcs) and Motor (2 pcs) so the hierarchy is visible by default.
- **Image preview:**
  - Click/tap any product or part thumbnail in Master Data or Gudang.
  - Full-size modal with close button, Escape and backdrop.
  - Keyboard activation (Enter/Space); focus returns to the thumbnail.
  - Works for manager, sales and operator.
- **Optional modules:**
  - WIP Production and Pesanan are off by default.
  - Settings → Preferensi has separate toggles.
  - Menu, dashboard shortcuts, report tabs and direct routes follow the flags.
- Part edit form: optional parent part selector, with same-category and cycle validation.
- Seed settings now ship with `salesOrderEnabled: false` and `productionEnabled: false`.

### Changed

- Version bumped to 2.6.0, schema 8, backup v8.
- Migration from schema ≤7 turns both optional modules off once; managers can re-enable them in Settings.
- Part stock view reuses the category grouping and shows thumbnails.
- README/PRD/design system updated for the optional modules and image preview.

### Fixed

- A stocked child part no longer disappears when its parent has no stock in the selected warehouse.
- Image preview does not close or submit any form.

### Verification

- `node --test`: **52 passed** (29 invariants + 4 operations + 8 admin + 5 orders/pricing + 4 production + 2 auth).
- Module imports 41/41; render 24/24; browser route sweep 21 default routes and 24/24 with WIP + Pesanan enabled, zero console errors.
- Part hierarchy: Motor → Remote, Bracket → Bracket set, Rel 3 m → Rel 4 m at Jakarta.
- Image preview: 320/390 preview 279 px / 345 px wide, 0 page overflow; manager and operator.
- Optional modules: fresh seed hides WIP + Pesanan; enabling restores menu and direct routes; direct `#/produksi` redirects while off.
- Lighthouse accessibility 100 on stock, master and settings.

### Known limitations

- Part hierarchy is display-level; a part has one parent, not a full bill of materials.
- Images remain local SVG/data URLs; object storage is still planned.
- Reference server is still not wired to the static UI.
- Pesanan remains available as an optional module, not a replacement for invoice drafts.
- Payroll is a piece-rate ledger, not HR/tax.

---

## [2.5.0] — 2026-11-08

**Release name: Hierarki & Pesanan.** Adds roll parent/child hierarchy per collection, sales-order detail/edit/print, a supplier price book, latest-price defaults on PO and a CNY→IDR rate snapshot on import POs.

### Added

- **Roll hierarchy per collection** (`#/stok` → *Hierarki koleksi*):
  - Collection → colour/SKU → root roll → child rolls.
  - Root/parent/child counts, lineage path on roll detail, direct children and total descendants.
  - Split lineage keeps `parentRollId`/`rootRollId`; physical metres are conserved.
- **Sales order detail** (`#/pesanan/:id`):
  - Creator, customer, project, dates, full line contents, unit prices, amounts and reservation list.
  - Draft editing with customer/date/notes, add/remove lines, quantity and price changes.
  - Saving releases old fabric/part reservations and reserves the new lines.
  - Printable **Pesanan Penjualan** with creator, lines, roll/lot and total; explicitly “bukan faktur”.
- **Supplier price book** (`#/master`):
  - Product and part lists show supplying supplier(s) and the latest price/validity.
  - New **Harga** dialog records supplier quotes (price, currency, MOQ, validity) and history.
  - Saving a newer quote refreshes the master IDR buy price.
- **PO price list:** creating a PO shows the supplier's latest prices with IDR equivalents, MOQ and validity; line prices default to the latest quote.
- **Latest CNY→IDR rate:** import PO shows the latest rate, timestamp and source; the rate is editable and snapshotted on the PO. A different rate is appended to `fxRates`.
- Seed: 20 supplier price records (including an October increase), 3 CNY rate records, supplier links for all parts and Nova.

### Changed

- `createPO` defaults line prices from supplier price history rather than the static master buy price.
- Import PO stores `fxAsOf` and `fxSource`; PO detail shows the snapshot.
- Master product/part tables now include a supplier column and latest-price note.
- Version bumped to 2.5.0, schema 7, backup v7; migration adds `fxRates`, supplier-price currency/IDR values and sequences.

### Fixed

- Supplier-price sequence now starts after the seeded records (`SP-0021`), avoiding duplicate IDs.
- CNY decimal input no longer strips the decimal point (`27,5` → 27,5, not 275).
- PO price parsing separates IDR thousands from foreign decimals.

### Verification

- `node --test`: **51 passed** (29 invariants + 4 operations + 7 admin + 5 orders/pricing + 4 production + 2 auth).
- Module imports 41/41; render 24/24; browser route sweep 24/24 with zero console errors.
- Hierarchy split RL-0001 → child keeps parent/root and totals are conserved.
- Sales order edit: 20 m × Rp 125.000 → 22 m × Rp 130.000; reservation 22 m and total Rp 2.860.000.
- Supplier price: latest 69.500; new quote 71.500 updates master; PO defaults to 69.500.
- Import: CNY 27 prefilled from Ningbo, FX 2.250 snapshotted; manual 2.300 stored as FX-0004.
- Mobile 320/390/768: tree and order detail overflow 0; drawer z60/scrim z55/nav z45.
- Lighthouse accessibility 100 on stock hierarchy, sales-order detail, master and purchasing.

### Known limitations

- The reference server is still not wired to the static Vercel UI; no PostgreSQL/multi-node locking.
- Object storage is still absent: product images are local SVG/data URLs; proof is metadata.
- Sales-order editing is limited to drafts; confirmed orders must be cancelled/recreated.
- Payroll is a piece-rate ledger, not HR/tax.
- Partial project fulfilment, quotes, as-of valuation and accounting/PPN remain planned.

---

## [2.4.0] — 2026-11-08

**Release name: Produksi & Kontrol.** Adds WIP production with payroll/capacity, stock-reserving sales orders, richer reporting, explicit CNY buying, part imagery and mobile layering fixes.

### Added

- **WIP production orders** (`#/produksi`):
  - Order from available rolls, total metres and piece length.
  - Cutting consumes the reservation and creates one WIP piece per length, keeping source roll/lot.
  - Piece flow cutting → sewing → QC, with QC pass/fail and rework.
  - Piece-rate payroll ledger per stage/worker, mark paid.
  - Work-centre capacity/load/estimated days.
  - Production/payroll/capacity report tab.
- **Sales orders reserve stock** at creation for fabric and parts; cancel releases; converting to invoice consumes the reservation and issues stock once.
- **Explicit CNY buying:** choose IDR/CNY and FX on the PO independently of the supplier default; foreign prices convert to IDR HPP and bills.
- **Richer reporting:** WIP metres, open payroll, QC rejects, capacity, order progress, payroll entries.
- **Part imagery:** local SVG product renders for 10 parts, optional uploaded image, brand and hex swatch display.
- **Demo part at Rp 140.000:** “Bracket set 4 pcs” (`BRK-04`).
- **Reference shared backend** (`server/`): scrypt PIN login, HttpOnly session, RBAC per action, revisioned shared state, atomic writes and domain transactions. `npm run server`.
- UI/mobile: bottom nav z45, drawer scrim z55, sidebar z60, 61 px nav, safe-area padding.

### Changed

- Production cut moves stock from raw roll to WIP; it does not create an invoice.
- Operator can execute production (cut/sew/QC) but cannot create/release/payroll; managers own production administration.
- Operator no longer sees supplier bills, supplier master or PO prices; purchasing shows only PO/receiving/shipment for operator.
- Field labels are programmatically associated across all forms.

### Fixed

- Sales order whole-roll conversion with reservation.
- Part reservations are consumed/released during order conversion.
- Production capacity/landed costs no longer divide millimetres as metres.
- Table action headers, settings labels and production detail accessibility.
- Drawer/bottom-nav stacking and mobile overflow at 320/390.

### Verification

- `node --test`: **46 passed** (29 invariants + 4 operations + 7 admin + 4 production + 2 auth).
- Module imports 40/40; render 23/23; browser route sweep 23/23.
- Production: 10 m → 5 pieces, payroll Rp 25.000, reject/rework, capacity load.
- Sales order: 10 m reserved; conversion issued once.
- Server: operator login + `task.start` 200; operator `invoice.post` 403.
- Lighthouse accessibility 100 on production, production detail, reports and settings.

### Known limitations

- Reference server is not wired to the static Vercel UI; no PostgreSQL/multi-node locking yet.
- Object storage is still absent: product images are local SVG/data URLs; proof is metadata.
- Payroll is a piece-rate ledger, not HR/tax.
- Partial project fulfilment, quotes, as-of valuation and accounting/PPN remain planned.

---

## [2.3.0] — 2026-11-08

**Release name: Kontrol & Peran.** Adds a settings workspace, staff/role management, sales orders, richer master data and strict role-based navigation.

### Added

- **Settings workspace** (`#/pengaturan`, manager only):
  - Account/PIN form.
  - Staff users: add with role + initial PIN, edit name/role/active, reset PIN without knowing the old PIN.
  - Preference toggles: low-stock threshold, default task due days, proof required on receiving, sales-order enabled, operator cost visibility, sample-deposit requirement.
  - Audit tab for user/product/part/supplier/warehouse/settings changes.
  - Data export/restore/reset.
- **Dynamic login:** login screen reads active users from the database, not a hardcoded list; new staff appear immediately. Deactivated users cannot log in; sessions are invalidated on next render.
- **Role navigation guards:** operator and sales only see their work; direct URLs redirect to the role home. Manager sees all.
- **Sales orders** (`#/pesanan`): draft/confirmed orders, customer and available product checks, convert to invoice exactly once (stock issue only at invoice), cancel.
- **Product master:** create/edit with collection, colour, swatch, width, prices, active/dormant, optional image (≤250 KB data URL), notes and per-product audit trail.
- **Spare-part master:** create/edit with SKU, brand, category, prices, active flag, optional image, notes and audit trail.
- **Supplier master:** create/edit local or import, CNY/IDR, FX, incoterm, port, terms, lead time, audit trail.
- **Role-aware cost views:** operator/sales cannot see cost/value on roll detail unless `operatorCanSeeCosts` is enabled; operator loses financial purchasing tabs and PO prices.

### Changed

- Purchasing tabs for operator: PO, receiving, shipments only; bills and suppliers are manager-only.
- Login accounts are generated from `db.users`; PIN hashes remain separate from the data backup.
- Version bumped to 2.3.0, schema 5, backup v5; datasets migrate forward.
- Field helper now associates every label with its input, fixing settings accessibility.

### Fixed

- User creation with a pre-generated auth ID was rejected as “user not found”.
- Field labels were not programmatically associated in several forms.
- Landing/PIN/session checks now respect active status and new users.
- Last active manager guard on role change/deactivation.
- Order conversion is idempotent: converted/cancelled orders cannot post twice.
- Sales-order preference hides the menu and blocks the order page.

### Verification

- `node --test`: **42 passed** (29 invariants + 4 operations + 7 admin + 2 auth).
- Module imports 39/39; render 22/22; browser routes 22/22, zero console errors.
- Staff creation/login, role redirects, sales order 5 m → invoice with stock 60 → 55 m, part brand/audit, supplier CNY, preference toggle.
- Lighthouse accessibility 100 on settings, master, orders and dashboard.

### Known limitations

- PIN auth remains client-side; users/backups do not include PIN hashes (manager reset required after restore).
- Images are small data URLs; production needs object storage.
- No full WIP production order or machine capacity.
- Quotes/orders are separate, but partial project fulfilment and accounting remain planned.

---

## [2.2.0] — 2026-11-08

**Release name: Operasi & Impor.** Adds task operations, a dedicated sample workspace, Chinese import suppliers with CNY/FX, shipment tracking, landed COGS, physical-proof metadata, mobile bottom navigation and an icon-system fix.

### Added

- **Tugas Operasi** (`#/tugas`):
  - Types: receive, putaway, picking, cutting, sewing/finishing, QC, transfer, shipment, opname, sample.
  - Create, assign/reassign, start, block, resume, complete, cancel; priority, due date, project/roll link, target metres, notes.
  - Manager board with active/overdue/cutting counts; operator “my tasks” default; cutting queue warning.
  - Completion note + optional physical proof; history timeline; stock is never posted by a task.
- **Sample & Deposit workspace** (`#/sampel`): samples by customer/source roll, conversion linking, deposit balances and ledger, refunds.
- **Import suppliers**:
  - Supplier `origin` (local/import), country, currency (IDR/CNY), FX rate, incoterm and port.
  - Seed Chinese supplier **Ningbo Lajur Textiles** with CNY price list.
  - PO in CNY, line price in CNY, IDR cost at locked FX, PO total in both currencies.
  - CNY supplier bills and TT payments with FX snapshot and `paidForeign`.
  - Shipment tracking: unique BL/AWB, mode, container, ETD/ETA, status timeline (preparing → transit → customs → arrived → received), freight/insurance/duty/other.
  - **Landed COGS:** shipment costs allocated by line value and added to received roll cost per metre/piece.
- **Optional physical proof** on supplier receipts, internal transfer receipts, tasks and shipments; metadata only (name/type/size/note/user/time).
- **Mobile workspace**: bottom navigation (Beranda/Tugas/Stok/Akun), 2-column task tiles, task-first operator home, 44 px targets and safe-area padding.
- **Icon system**: all icons inherit an 18 px size; stat icons 14 px. Fixes oversized SVG icons and “missing” icons in dashboard stat labels.
- **Manager monitor**: dashboard shows sales, receivables, active/overdue tasks, cutting queue and shipment alerts.
- `GAP-ANALYSIS.md`: requirement-by-requirement status against the PRD and design-system v2.

### Changed

- Purchasing now has tabs: PO, Penerimaan, Pengiriman impor, Tagihan, Pemasok.
- Supplier prices and PO lines display foreign currency with IDR equivalent.
- Payable payments for import bills accept CNY and convert at the bill FX.
- Mobile content bottom padding accounts for the fixed navigation.
- Schema upgraded to 4; backups to v4 (v2/v3 accepted and migrated).

### Fixed

- Dashboard stat icons rendered at SVG default dimensions because no global `.ico` size existed.
- Shipment/landed allocation initially divided by millimetres instead of metres, understating HPP; corrected.
- Foreign unit prices were rounded to whole CNY; now stored with 2 decimals before IDR conversion.
- Task completion “today” compared UTC date to Jakarta date; now uses the business date.
- Sales users no longer see a refund button for indent deposits they cannot refund.
- Task “mine” filter resets correctly when switching roles.

### Verification

- `node --test`: **35 passed** (29 invariants + 4 operations + 2 auth).
- Module imports: 37/37; render check: 20/20 (including 3 roles and login).
- Browser route sweep: 20/20, zero console errors.
- Import test: 26.5 CNY × 2,250 FX + Rp 600,000 landed → roll HPP **Rp 71,625/m**, bill **CNY 1,325**.
- Task lifecycle and proof metadata; shipment status/progress; mobile bottom nav at 320/390.
- Lighthouse accessibility 100 on dashboard, tasks, purchasing, samples, master, simulation and login.

### Known limitations

- Tasks coordinate production; there is no full WIP production order (cutting → sewing → QC per piece), payroll or machine capacity.
- File proof stores metadata only.
- Landed cost is allocated at receipt time; later shipment cost changes are not automatically revalued.
- Server auth, shared sessions, concurrency and immutable posting remain production work.

---

## [2.1.0] — 2026-11-08

**Release name: Akses & Gudang.** Adds per-role PIN login, editable warehouses, direct stock intake, schema migration and CI.

### Added

- **Per-role login:** three accounts (manager, operator, sales), each with its own 4–6 digit PIN.
  - PBKDF2-SHA256 hashing with a per-user random salt (120 000 iterations).
  - 8-hour session in `sessionStorage`; logout from the account menu.
  - Five failed attempts lock the account for 60 seconds with a countdown message.
  - PIN change requires the current PIN and rejects weak/duplicate PINs.
  - Demo PINs (`2468`, `1357`, `8642`) are shown only while an account still uses its default.
  - Account menu shows name, role, session time, “Ganti PIN” and “Keluar”.
- **Role-derived experience:** no role switcher; the signed-in account determines permissions and home route.
- **Editable warehouses:** create, edit code/name/bin prefix/contact/address, activate or deactivate.
  - Unique code and bin prefix.
  - Deactivation is refused while physical rolls, transit, part stock, active requests or an active opname reference the warehouse.
  - Inactive warehouses stay in history but disappear from operational selectors.
- **Editable collections:** create and rename collections; SKU `collectionName` labels stay in sync while internal IDs remain stable.
- **Direct stock intake (“Tambah stok”):** opening balance, correction or consignment without a PO.
  - Unique receipt reference, warehouse, date, reason.
  - Fabric: lot, each roll length separately, cost per metre; each roll gets an ID and movement.
  - Parts: integer pcs and cost.
  - Creates a `goodsReceipt` with `kind: "adhoc"` and no supplier payable.
- **Versioning:** `APP_VERSION`/`SCHEMA_VERSION` in `src/version.js`, version shown in sidebar and Master Data.
- **CI:** GitHub Actions runs the test suite, module check and render check on push/PR.
- **Schema migration:** `store.migrate` upgrades older local datasets and adds `warehouse.active`.
- **Backup v3:** accepts v2 data, validates ad-hoc receipts without a supplier, rejects newer schemas.

### Changed

- Default home route: manager/operator → summary; sales → invoices.
- Login screen, account modal and version label added to the design system.
- Warehouse selectors only show active sites.
- Documentation updated for auth, warehouse master, direct intake and versioning.

### Fixed

- Whole-roll invoice lines now fail with `ROLL_CHANGED` if the roll length changed after the draft; previously the invoice amount and the issued quantity could diverge.
- Refundable **sample deposits can no longer be applied** to invoice credit (`DEPOSIT_REFUND_ONLY`); they remain refund-only after a linked purchase.
- Stock mutations during opname now also block sample cuts, quarantine, customer returns and supplier returns.
- Project issue no longer leaves part reservations behind, overstating part availability.
- Modal key handlers and shell key handlers are removed when replaced, avoiding duplicate Esc/focus behaviour.
- Mobile account and warehouse controls meet 44 px; PIN toggle is 44 px on touch.
- Accessibility: single `<main>` on login, skip-link target, table action headers, account/warehouse accessible names, contrast — Lighthouse 100 on login, dashboard, stock, master and simulation.

### Verification

- `node --test`: **31 passed** (29 business + 2 auth).
- Module imports: 32/32.
- Render check: 14/14 views (including login).
- Browser route sweep: 18/18, zero console errors.
- PIN login, lockout messaging, PIN change, warehouse CRUD/deactivation, direct intake and guided simulation cycle exercised in Chromium.

### Known limitations

- PIN authentication is client-side and resets when site data is cleared; it is not a security boundary.
- No server, shared sessions, concurrency control or audit immutability.
- Return credit above the remaining invoice balance is not carried as a customer credit.
- Direct intake is not a substitute for supplier receiving and creates no payable.

---

## [2.0.0] — 2026-11-07

First release of the **Lajur** version. This is a new project under the Lajur brand direction; the earlier *Lipit* prototype source was not available in the workspace and is not included here.

### Added

**Delivery**
- Vercel production deployment at `https://lajur-lake.vercel.app`, project linked to GitHub for automatic deploys from `main`.
- GitHub repository `CASANMGT/lajur`.

**Domain and data**
- Roll-level inventory: collection → colour SKU → lot → physical roll → warehouse/bin.
- Integer-millimetre storage, IDR money, Asia/Jakarta business dates.
- Availability rule `physical − reserved`, with quarantine and transit kept separate.
- Cut/split that preserves parent identity, root roll and length conservation.
- 23 invariant tests covering cuts, reservations, transfers, receiving, returns, deposits, projects, opname, simulation and backup.

**Operations**
- Supplier receiving with individual roll lengths, lots, destination warehouse, duplicate-reference and over-receipt protection.
- Internal warehouse requests (`Permintaan Gudang / PO Internal`) with approval, exact-roll dispatch, partial dispatch, partial receipt, transit tracking, print documents and cancellation before dispatch.
- Supplier POs, price list, partial receiving, payables and supplier returns.
- Customer returns with cumulative quantity checks, credit and quarantine disposition.

**Commercial**
- Multi-line invoices mixing fabric (m), parts (pcs) and service lines.
- Whole-roll and cut-length sales; invoice posting is the single stock-issue event.
- Snapshot of description, quantity, price and cost on posted lines.
- Partial payments, deposit application, AR aging.
- Projects: requirements, FIFO allocation, reservation, invoice/stock issue, handover, shortage, material cost, printable instructions.
- CRM stages, next action, follow-up, activity log.
- Free / paid / refundable samples cut from a specific roll; sample-to-purchase linking.
- Refundable sample deposits and indent deposits with ledger, balance guards and manager approval.

**Control**
- Blind stock opname per warehouse: snapshot, drafts, completeness, review, variance, recount, approval, adjustment posting, permanent history, warehouse freeze.
- Adjustment rejection when a count would fall below committed reservations.
- Movement ledger with user, role, reference and financial impact.
- Reports: stock by warehouse/SKU, valuation, movement, sales/margin, product performance, AR/AP aging, deposits, returns, sample conversion, project shortage, slow-moving, audit.
- JSON export/restore with full referential validation.
- Separate simulation dataset with a copper banner, start/resume/reset/exit, and the guided cycle **receive 60 m → sell 10 m → 50 m → partial payment**.

**UI/UX**
- Lajur brand implementation: Midnight Navy, Warm Ivory, Muted Teal, Copper; Manrope + Inter.
- Role-specific dashboards for manager, operator and sales.
- Responsive shell with accessible drawer, 44 px touch targets, 16 px phone inputs and card layouts.
- Bottom-sheet modals with focus trap, Esc, focus restore and a footer that stays visible at 320 px.
- Empty, loading, validation and error states, plus a router error boundary.
- Reduced-motion support and specific transition properties.

### Changed

- Project renamed from *Lipit* to **Lajur** and rebuilt under the brand guide (tagline *Setiap roll, tercatat.*).
- Financial reporting is explicitly company-level; no warehouse profit is invented from internal transfers.
- Internal request approval explicitly does **not** reserve stock; dispatch re-checks availability.

### Fixed during review

- Part reservations were not released after project issue or cancellation, understating available parts. Fixed and covered by a new test.
- Dispatching after a partial receipt regressed the transfer status to `dispatched`; it now stays `partially_received`.
- Blind opname leaked the expected-balance column in the review header/last column. Removed; verified in the browser DOM.
- Mobile modal footer could fall below a 390 px viewport because the form did not flex-shrink. Fixed with a min-height-0 flex form; footer now visible at 320/390 px.
- Contrast failures on muted metadata, copper buttons/badges, simulation banner and current flow step. Adjusted tokens; Lighthouse accessibility now 100 on audited screens.
- Heading levels skipped from `h1` to `h3` in cards. Reworked to `h2`/`h3` with matching styles.
- UTF-8 double-encoding introduced by an automated bulk edit (em dashes and box-drawing characters). Repaired across views and docs; all files re-scanned clean.

### Known limitations

- Browser-only: no authentication, no server authorization, no shared transactions.
- Supplier goods receipt and supplier bill are created together (demo simplification).
- One invoice per project; partial project fulfilment is not implemented.
- Attachments store metadata only.
- No scanner/barcode integration, accounting ledger, or real payments.
- As-of inventory balances are not reconstructed; only current balances and movement history are provided.

---

## Versioning

- **Major** — changes to the domain model or stock/financial rules.
- **Minor** — new modules or screens.
- **Patch** — fixes, copy, styling.

The dataset version is stored in `db.meta.version` (currently `2`). Backup files with a newer version are rejected.
