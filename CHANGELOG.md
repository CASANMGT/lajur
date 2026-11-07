# Changelog

All notable changes to Lajur. Dates use Asia/Jakarta.

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
