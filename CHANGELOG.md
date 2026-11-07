# Changelog

All notable changes to Lajur. Dates use Asia/Jakarta.

## [2.0.0] â€” 2026-11-07

First release of the **Lajur** version. This is a new project under the Lajur brand direction; the earlier *Lipit* prototype source was not available in the workspace and is not included here.

### Added

**Domain and data**
- Roll-level inventory: collection â†’ colour SKU â†’ lot â†’ physical roll â†’ warehouse/bin.
- Integer-millimetre storage, IDR money, Asia/Jakarta business dates.
- Availability rule `physical âˆ’ reserved`, with quarantine and transit kept separate.
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
- Separate simulation dataset with a copper banner, start/resume/reset/exit, and the guided cycle **receive 60 m â†’ sell 10 m â†’ 50 m â†’ partial payment**.

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

### Known limitations

- Browser-only: no authentication, no server authorization, no shared transactions.
- Supplier goods receipt and supplier bill are created together (demo simplification).
- One invoice per project; partial project fulfilment is not implemented.
- Attachments store metadata only.
- No scanner/barcode integration, accounting ledger, or real payments.
- As-of inventory balances are not reconstructed; only current balances and movement history are provided.

---

## Versioning

- **Major** â€” changes to the domain model or stock/financial rules.
- **Minor** â€” new modules or screens.
- **Patch** â€” fixes, copy, styling.

The dataset version is stored in `db.meta.version` (currently `2`). Backup files with a newer version are rejected.
