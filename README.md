# Lajur

**Inventory and business management for curtain fabric â€” traced to the last metre.**
*Setiap roll, tercatat.*

Lajur is an Indonesian-language ERP demo for a curtain company with **one company and multiple warehouses**. It treats every fabric length as a distinct physical roll, keeps reservations and transit separate from stock on hand, and connects inventory to sales, projects, samples, deposits, purchasing and stock opname.

![No build step](https://img.shields.io/badge/build-none-brightgreen) ![Tests](https://img.shields.io/badge/tests-23%2F23-brightgreen) ![A11y](https://img.shields.io/badge/lighthouse%20a11y-100-brightgreen) ![License](https://img.shields.io/badge/demo-only-orange)

---

## Quick start

```bash
cd Lajur
npm run dev
# â†’ http://127.0.0.1:8787
```

No install and no build step. The app is plain ES modules, CSS and `localStorage`; serve the folder with any static server.

```bash
npm test          # domain invariants (node:test)
npm run check     # import every module in Node
node tools/render-check.mjs   # render every view without a DOM
```

> On Windows PowerShell, if `npm` is blocked by execution policy, use `npm.cmd run dev` or `node tools/serve.mjs`.

### Deploy

The repository is Vercel-ready (`vercel.json`, static output):

```bash
npx vercel --prod
```

Or import the GitHub repository in Vercel with framework preset **Other**, build command empty, output directory `.`.

---

## What is inside

```
Lajur/
â”œâ”€â”€ index.html
â”œâ”€â”€ vercel.json
â”œâ”€â”€ package.json
â”œâ”€â”€ PRD.md                    product requirements, rules, roadmap
â”œâ”€â”€ DESIGN-SYSTEM.md          brand, tokens, components, accessibility
â”œâ”€â”€ CHANGELOG.md
â”œâ”€â”€ assets/                   mark + favicon
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ domain/               pure business logic (no DOM)
â”‚   â”‚   â”œâ”€â”€ core.js           units (mm), IDR, Jakarta dates, IDs, audit
â”‚   â”‚   â”œâ”€â”€ inventory.js      rolls, availability, splits, parts, ledger
â”‚   â”‚   â”œâ”€â”€ transfers.js      internal requests: approve/dispatch/receive
â”‚   â”‚   â”œâ”€â”€ sales.js          invoices, posting, payments, returns
â”‚   â”‚   â”œâ”€â”€ purchasing.js     suppliers, PO, receiving, payables
â”‚   â”‚   â”œâ”€â”€ projects.js       allocation, reservation, issue, handover
â”‚   â”‚   â”œâ”€â”€ crm.js            customers, samples, deposits, refunds
â”‚   â”‚   â”œâ”€â”€ opname.js         blind count, review, adjustment
â”‚   â”‚   â”œâ”€â”€ reports.js        derived metrics (no stored totals)
â”‚   â”‚   â””â”€â”€ seed.js           realistic linked fixtures
â”‚   â”œâ”€â”€ data/
â”‚   â”‚   â”œâ”€â”€ store.js          main/sim persistence, clone-commit
â”‚   â”‚   â”œâ”€â”€ backup.js         export/restore with reference validation
â”‚   â”‚   â””â”€â”€ simulation.js     guided 60 â†’ 10 â†’ 50 cycle
â”‚   â”œâ”€â”€ ui/
â”‚   â”‚   â”œâ”€â”€ dom.js            escaping, icons, modal, toast, print
â”‚   â”‚   â”œâ”€â”€ shell.js          sidebar, topbar, simulation banner
â”‚   â”‚   â”œâ”€â”€ router.js         hash routes + error boundary
â”‚   â”‚   â””â”€â”€ views/            dashboard, inventory, transfers, purchasing,
â”‚   â”‚                         sales, projects, customers, opname, reports,
â”‚   â”‚                         master, simulation, print documents
â”‚   â””â”€â”€ styles/
â”‚       â”œâ”€â”€ tokens.css
â”‚       â””â”€â”€ app.css
â”œâ”€â”€ tests/
â”‚   â””â”€â”€ invariants.test.js    23 domain tests
â””â”€â”€ tools/
    â”œâ”€â”€ serve.mjs             tiny static server
    â”œâ”€â”€ check.mjs             module import check
    â”œâ”€â”€ render-check.mjs      server-side view render check
    â””â”€â”€ seed-check.mjs        dataset sanity output
```

### Layer rules

- **Domain** never touches the DOM, storage, or the network. It takes a `db` object and mutates it, throwing `DomainError` codes on invalid operations.
- **Store** clones the active dataset, runs the mutation, and only commits if no error was thrown.
- **Views** render strings from the same records; totals are computed, not hardcoded.
- **Persistence** uses `lajur.v2.main` and `lajur.v2.sim` as separate keys.

---

## Demo walkthrough (8 minutes)

1. **Dashboard** â€” manager defaults: inventory value, receivables, month margin, payables, exception feed.
2. **Stok & Roll** â€” search `RL-0001`; open it. See 60 m physical, 0 reserved, 60 m available, lot `LOT-2608-A`, bin `A-01-01`, and the full movement trail.
3. **Whole vs cut** â€” open `#/penjualan?new=1&roll=RL-0001`, add 10 m, post. The roll becomes 50 m and the sold piece is a separate traceable child. You can also choose **Roll utuh** (blocked when reserved).
4. **Permintaan Gudang** â€” open `TRF-0001`. It is the canonical partial case:
   **15 requested Â· 5 dispatched Â· 2 received Â· 10 not yet dispatched Â· 3 in transit.**
   Approve does not reserve; dispatch re-checks availability.
5. **Pembelian** â€” open `PO-0001`. Receive 60 m as two rolls (e.g. `20, 40`), each with its own lot. Try the same receipt ref twice: it is rejected.
6. **Proyek** â€” open `PRJ-001`. See reservations on an exact roll and parts. `PRJ-002` shows a shortage. Issue posts the invoice and deducts stock; handover does not deduct again.
7. **Pelanggan** â€” open `CUS-0002`: projects, invoices, samples, deposits, activity. Samples record the source roll; sample deposit refund is blocked until a purchase is linked.
8. **Stock Opname** â€” start a session for Bandung. Expected balances are hidden; save, submit, then approve as manager. The warehouse is frozen while counting.
9. **Laporan** â€” stock by warehouse/SKU, valuation, AR/AP aging, slow-moving, sample conversion, project shortage, audit trail.
10. **Simulasi Data** â€” click the copper button, start, then run the cycle:
    **receive 60 m â†’ sell 10 m â†’ 50 m left â†’ 40% dummy payment.** Main data stays at 60 m.

### Demo accounts (role switch)

| Role | Name | What changes |
|------|------|--------------|
| Manajer | Arif Wibowo | approvals, master edit, refunds, all screens |
| Operator Gudang | Rani Pratama | receiving, transfer dispatch/receive, opname counting |
| Sales / CS | Dimas Anggara | invoices, projects, customers, samples, deposits |

The selector is a **UX simulation**; it is not authentication.

---

## Business rules that are actually enforced

| Invariant | Where |
|-----------|-------|
| Available = physical âˆ’ reserved, never negative | `inventory.availableMm`, all issue paths |
| Cut conserves length and keeps parent identity | `splitRoll`, `postInvoice`, `dispatchLine` |
| Reserved metres cannot be sold | `splitRoll`, `postInvoice` |
| Whole roll blocked when reserved | `sellWholeRoll` |
| Quarantine / transit cannot be sold | `isSellable`, `postInvoice` |
| Dormant SKU blocked | `buildFabricLine`, `postInvoice` |
| Metres and pieces never summed | summary and report functions |
| Invoice posts stock once | `postInvoice`; handover is status-only |
| Transfer outstanding = requested âˆ’ dispatched | `lineStats`, tested as 10 with transit 3 |
| Receipt over transit and dispatch over outstanding rejected | `receiveLine`, `dispatchLine` |
| Duplicate receipt ref and over-receipt rejected | `receivePO` |
| Returns cannot exceed sold quantity | `createCustomerReturn` |
| Deposit cannot be refunded twice or applied + refunded | `depositBalance`, `applyDepositToInvoice`, `refundDeposit` |
| Sample refund needs a linked purchase | `sampleQualifyingPurchase` |
| Opname freezes mutations | `assertWarehouseOpen` |
| Adjustment below reservation rejected | `approveOpname` |
| Simulation is isolated | separate storage key + test |
| Restore validates references | `backup.validateBackup` |

---

## Verification (actually run)

**Date:** 7 November 2026 Â· Node 24.14.0 Â· Chromium via OpenCode browser

| Check | Result |
|-------|--------|
| `node --test` | **23 passed, 0 failed** |
| Module import check | **28/28 modules** |
| Server-side render of all views | **13/13 render, no exceptions** |
| Browser route sweep | **17/17 routes**, zero console errors |
| Guided cycle | receive 60 â†’ cut 10 â†’ **50 remaining**, payment **Rp 500.000** (40%) |
| Simulation isolation | main `RL-0001` stayed **60 m** after sim mutations |
| Mobile widths 320 / 390 / 768 | overflow **0 px**, inputs **16 px**, targets **â‰¥ 44 px** |
| Drawer | opens, scrim, focus inside, Esc closes |
| Modal at 320/390 | fits viewport, footer/submit visible, body scrolls |
| Blind opname | only `Hitungan` column; no expected balance in DOM |
| Lighthouse (dashboard, stock detail, transfer detail, simulation) | **Accessibility 100, Best Practices 100, SEO 100** |

Reproduce:

```bash
npm test
node tools/check.mjs
node tools/render-check.mjs
```

---

## Feature matrix

### Implemented

- Roll-level inventory with collection â†’ colour â†’ lot â†’ roll â†’ warehouse/bin.
- Opening stock exactly as specified, each length separate.
- Physical / reserved / available / quarantine / transit, with transit excluded from both warehouses.
- Cut and whole-roll sales, mixed invoices, snapshotted lines, partial payments.
- Internal requests with approval, partial dispatch, partial receipt, print documents, no financial postings.
- Supplier PO, partial receiving per roll/lot, duplicate and over-receipt protection, payable payments, supplier returns.
- Projects: allocate, reserve, invoice/stock issue, handover, shortage, material cost, instructions.
- Customers, CRM stages, activities, samples with conversion, sample deposits, indent deposits, refund guards.
- Customer returns with credit and quarantine.
- Blind stock opname with freeze, variance, recount, posting, permanent history.
- Reports and role-specific dashboards.
- Separate simulation dataset with guided cycle, reset and return.
- JSON backup/export/restore with referential validation.

### Partial

- Supplier bill is created with goods receipt (demo simplification).
- One invoice per project; no partial project fulfilment.
- Attachments store metadata only.
- Paid sample uses a service invoice; no separate sample price list.
- As-of inventory balances are not reconstructed; movement history is.
- Barcode labels are visual; no scanner integration.
- Permissions are UI-level only.
- Quote/order documents are not separate from invoices.

### Planned

- Server-side auth, RBAC, warehouse scoping and audit.
- PostgreSQL transactional posting with idempotency and immutable documents.
- GR/IR reconciliation and supplier invoice matching.
- Partial project invoicing and deliveries.
- Barcode/QR scanning and label printer integration.
- Accounting integration (AR/AP/GL), PPN.
- Transit exception workflow (damaged/lost/disputed).
- Offline/PWA sync and shared multi-user data.
- Warehouse attribution policy for profitability.

---

## Limitations (browser-only demo)

- **No real authentication.** Role switching is a demo; every domain rule can be bypassed by editing local storage.
- **No secure multi-user authorization.** Two browsers do not share data.
- **No shared transactional backend.** No concurrency control, no idempotency, no server audit.
- **No actual payments, bank messages, or supplier communication.** Payment records are local.
- **Local persistence only.** Clearing site data deletes the demo; the backup JSON is the escape hatch.
- **Not accounting.** Reports are management summaries, not a ledger, tax invoice, or P&L.
- **Single currency and time zone** (IDR, Asia/Jakarta) by design.

Production requirements are defined in [PRD.md Â§12](./PRD.md#12-production-architecture).

---

## Design and accessibility notes

- Brand from the Lajur guide: Midnight Navy, Warm Ivory, Muted Teal, Copper; Manrope + Inter; tabular numerals.
- Status always has a text label; swatches never encode numeric codes.
- Motion is limited to 120â€“260 ms, specific properties, and disabled under `prefers-reduced-motion`.
- Mobile: drawer navigation, 16 px inputs, 44 px targets, bottom-sheet dialogs, cards instead of wide tables.
- Modal focus trap, Esc, focus restore; skip link; semantic headings; visible focus.
- Lighthouse accessibility 100 on the four audited screens.
- Remaining gap: no manual screen-reader pass; no forced-colours theme.

See [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md).

---

## Data notes

- Lengths are stored in **integer millimetres**; `61,2 m` is `61200`.
- Money is integer rupiah, rounded at posting boundaries.
- Business dates are `YYYY-MM-DD` in Asia/Jakarta; timestamps are ISO UTC.
- Invoice lines snapshot description, quantity, price and cost so master edits never rewrite history.
- Internal transfers preserve cost: child rolls inherit `costPerM`.
- IDs are stable; display codes can change.

## License and use

Demo/prototype for evaluation. Do not enter real customer or payroll data. The Lajur name, logo and brand assets belong to their owner; this repository is not a production system.
