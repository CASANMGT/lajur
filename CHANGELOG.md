# Changelog

All notable changes to Lajur. Dates use Asia/Jakarta.

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
