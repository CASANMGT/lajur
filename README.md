# Lajur

**Inventory and business management for curtain fabric — traced to the last metre.**
*Setiap roll, tercatat.*

**Live demo:** https://lajur-lake.vercel.app
**Source:** https://github.com/CASANMGT/lajur

Lajur is an Indonesian-language ERP demo for a curtain company with **one company and multiple warehouses**. It treats every fabric length as a distinct physical roll, keeps reservations and transit separate from stock on hand, and connects inventory to sales, projects, samples, deposits, purchasing and stock opname.

![No build step](https://img.shields.io/badge/build-none-brightgreen) ![Tests](https://img.shields.io/badge/tests-35%2F35-brightgreen) ![Version](https://img.shields.io/badge/version-2.2.0-blue) ![A11y](https://img.shields.io/badge/lighthouse%20a11y-100-brightgreen) ![License](https://img.shields.io/badge/demo-only-orange)

---

## Quick start

```bash
cd Lajur
npm run dev
# → http://127.0.0.1:8787
```

No install and no build step. The app is plain ES modules, CSS and `localStorage`; serve the folder with any static server.

```bash
npm test          # domain invariants (node:test)
npm run check     # import every module in Node
node tools/render-check.mjs   # render every view without a DOM
```

> On Windows PowerShell, if `npm` is blocked by execution policy, use `npm.cmd run dev` or `node tools/serve.mjs`.

### Deploy

The repository is linked to Vercel (`lajur` project) and deploys `main` automatically.

```bash
npx vercel --prod
```

Or import the GitHub repository in Vercel with framework preset **Other**, build command empty, output directory `.`. The current production alias is **https://lajur-lake.vercel.app**.

### Sign in (demo)

Each role has its own account and PIN. The PIN is hashed with PBKDF2-SHA256 and kept in local storage; a session lasts 8 hours (per browser tab). Five wrong attempts lock that account for 60 seconds.

| Akun | Peran | PIN awal |
|------|-------|----------|
| Arif Wibowo | Manajer / pemilik | `2468` |
| Rani Pratama | Operator gudang | `1357` |
| Dimas Anggara | Sales & customer service | `8642` |

Change the PIN from the avatar menu (top right) → **Ganti PIN**. The demo PIN hint disappears once a PIN is changed. Resetting site data restores the defaults.

> This is still a browser demo: PINs gate the UI and the demo session, not a server. Production authorization must be enforced by the API.

### Versioning

- Semver in `package.json` and `src/version.js` (`APP_VERSION`), schema in `SCHEMA_VERSION`.
- Git tags: `v2.0.0`, `v2.1.0`, `v2.2.0`.
- `CHANGELOG.md` records every release and review fix.
- `.github/workflows/ci.yml` runs the 35 tests, module check and render check on every push/PR.
- Backups carry a format version; datasets are migrated forward on load (`store.migrate`).

---

## What is inside

```
Lajur/
├── index.html
├── vercel.json
├── package.json
├── PRD.md                    product requirements, rules, roadmap
├── DESIGN-SYSTEM.md          brand, tokens, components, accessibility
├── GAP-ANALYSIS.md           requirement-by-requirement status
├── CHANGELOG.md
├── .github/workflows/ci.yml  tests on every push and PR
├── assets/                   mark + favicon
├── src/
│   ├── version.js            app version + schema version
│   ├── domain/               pure business logic (no DOM)
│   │   ├── core.js           units (mm), IDR, Jakarta dates, IDs, audit
│   │   ├── inventory.js      rolls, availability, splits, parts, direct intake
│   │   ├── transfers.js      internal requests: approve/dispatch/receive
│   │   ├── sales.js          invoices, posting, payments, returns
│   │   ├── purchasing.js     suppliers, PO, receiving, payables, FX
│   │   ├── shipments.js      import shipment tracking + landed cost
│   │   ├── tasks.js          receive/pick/cut/sew/QC/opname tasks
│   │   ├── attachments.js    optional physical-proof metadata
│   │   ├── projects.js       allocation, reservation, issue, handover
│   │   ├── crm.js            customers, samples, deposits, refunds
│   │   ├── opname.js         blind count, review, adjustment
│   │   ├── reports.js        derived metrics (no stored totals)
│   │   ├── master.js         warehouse + collection invariants
│   │   └── seed.js           realistic linked fixtures
│   ├── data/
│   │   ├── store.js          main/sim persistence, migration, clone-commit
│   │   ├── backup.js         export/restore with reference validation
│   │   ├── auth.js           PIN hashing, sessions, lockout
│   │   └── simulation.js     guided 60 → 10 → 50 cycle
│   ├── ui/
│   │   ├── dom.js            escaping, icons, modal, toast, print
│   │   ├── shell.js          sidebar, topbar, account menu, simulation banner
│   │   ├── router.js         auth gate, hash routes, error boundary
│   │   └── views/            login, dashboard, tasks, inventory, transfers, purchasing,
│   │                         sales, projects, customers, samples, opname, reports,
│   │                         master, simulation, print documents
│   └── styles/
│       ├── tokens.css
│       └── app.css
├── tests/
│   ├── invariants.test.js    29 business invariant tests
│   ├── operations.test.js    4 import/task/shipment tests
│   └── auth.test.js          2 PIN hashing / policy tests
└── tools/
    ├── serve.mjs             tiny static server
    ├── check.mjs             module import check
    ├── render-check.mjs      server-side view render check
    └── seed-check.mjs        dataset sanity output
```

### Layer rules

- **Domain** never touches the DOM, storage, or the network. It takes a `db` object and mutates it, throwing `DomainError` codes on invalid operations.
- **Store** clones the active dataset, runs the mutation, and only commits if no error was thrown.
- **Views** render strings from the same records; totals are computed, not hardcoded.
- **Persistence** uses `lajur.v2.main` and `lajur.v2.sim` as separate keys.

---

## Demo walkthrough (8 minutes)

0. **Masuk** — choose an account and enter its PIN (manager `2468`, operator `1357`, sales `8642`). Change it from the avatar menu.
1. **Dashboard** — manager defaults: inventory value, receivables, month margin, payables, exception feed.
2. **Stok & Roll** — search `RL-0001`; open it. See 60 m physical, 0 reserved, 60 m available, lot `LOT-2608-A`, bin `A-01-01`, and the full movement trail.
3. **Whole vs cut** — open `#/penjualan?new=1&roll=RL-0001`, add 10 m, post. The roll becomes 50 m and the sold piece is a separate traceable child. You can also choose **Roll utuh** (blocked when reserved).
4. **Permintaan Gudang** — open `TRF-0001`. It is the canonical partial case:
   **15 requested · 5 dispatched · 2 received · 10 not yet dispatched · 3 in transit.**
   Approve does not reserve; dispatch re-checks availability.
5. **Pembelian** — open `PO-0001`. Receive 60 m as two rolls (e.g. `20, 40`), each with its own lot. Try the same receipt ref twice: it is rejected.
6. **Proyek** — open `PRJ-001`. See reservations on an exact roll and parts. `PRJ-002` shows a shortage. Issue posts the invoice and deducts stock; handover does not deduct again.
7. **Pelanggan** — open `CUS-0002`: projects, invoices, samples, deposits, activity. Samples record the source roll; sample deposit refund is blocked until a purchase is linked.
8. **Stock Opname** — start a session for Bandung. Expected balances are hidden; save, submit, then approve as manager. The warehouse is frozen while counting.
9. **Laporan** — stock by warehouse/SKU, valuation, AR/AP aging, slow-moving, sample conversion, project shortage, audit trail.
10. **Simulasi Data** — click the copper button, start, then run the cycle:
    **receive 60 m → sell 10 m → 50 m left → 40% dummy payment.** Main data stays at 60 m.
11. **Tambah stok** — on Stok, “Tambah stok” records opening stock or a correction without a PO: unique document, lot, each roll length, cost, reason, and a movement per roll.
12. **Master Data → Gudang** — add or rename a warehouse, change its code/prefix/contact, or deactivate an empty one. Deactivation is refused while stock, transit, parts, active requests, or an opname still reference it. Collection names can be renamed without changing SKU IDs.
13. **Tugas Operasi** — create receive/picking/cutting/sewing/QC/shipment tasks, assign to Rani, start and complete with an optional proof. Manager sees overdue and cutting queues; tasks never move stock.
14. **Pembelian → Pengiriman impor / PO-0004** — CNY PO at Rp 2,250/CNY, BL/container, ETA, landed cost; update status to customs/arrived. Receiving this PO posts roll HPP including freight/duty.
15. **Sample & Deposit** — sample conversion, deposit ledger and refunds in one workspace.

### Role experience

| Role | Sees | Cannot do |
|------|------|-----------|
| Manajer | Approvals, all reports, master, refunds | — |
| Operator Gudang | Stock, receiving, dispatch/receive, opname counting, direct intake | Create invoices, edit master, approve |
| Sales / CS | Invoices, projects, customers, samples, deposits | Approve transfers/opname, edit master, count stock |

Log in as each account to see the difference. Hiding a button is still not server authorization.

---

## Business rules that are actually enforced

| Invariant | Where |
|-----------|-------|
| Available = physical − reserved, never negative | `inventory.availableMm`, all issue paths |
| Cut conserves length and keeps parent identity | `splitRoll`, `postInvoice`, `dispatchLine` |
| Reserved metres cannot be sold | `splitRoll`, `postInvoice` |
| Whole roll blocked when reserved | `sellWholeRoll` |
| Quarantine / transit cannot be sold | `isSellable`, `postInvoice` |
| Dormant SKU blocked | `buildFabricLine`, `postInvoice` |
| Whole-roll draft cannot post if its length changed | `postInvoice` (`ROLL_CHANGED`) |
| Direct intake is documented, unique and traceable | `receiveAdhocStock` |
| Warehouse codes/prefixes are unique; deactivation requires empty stock | `master.saveWarehouse` |
| Sample deposits are refund-only, never invoice credit | `applyDepositToInvoice` |
| Metres and pieces never summed | summary and report functions |
| Invoice posts stock once | `postInvoice`; handover is status-only |
| Transfer outstanding = requested − dispatched | `lineStats`, tested as 10 with transit 3 |
| Receipt over transit and dispatch over outstanding rejected | `receiveLine`, `dispatchLine` |
| Duplicate receipt ref and over-receipt rejected | `receivePO` |
| Returns cannot exceed sold quantity | `createCustomerReturn` |
| Deposit cannot be refunded twice or applied + refunded | `depositBalance`, `applyDepositToInvoice`, `refundDeposit` |
| Sample refund needs a linked purchase | `sampleQualifyingPurchase` |
| Opname freezes mutations | `assertWarehouseOpen` |
| Adjustment below reservation rejected | `approveOpname` |
| Simulation is isolated | separate storage key + test |
| Restore validates references | `backup.validateBackup` |
| PINs are salted PBKDF2 hashes; sessions expire; 5 failures lock | `data/auth.js` (demo only) |

---

## Verification (actually run)

**Date:** 8 November 2026 · Node 24.14.0 · Chromium via OpenCode browser

| Check | Result |
|-------|--------|
| `node --test` | **35 passed, 0 failed** (33 business + 2 auth) |
| Module import check | **37/37 modules** |
| Server-side render of all views | **20/20 render, no exceptions** (incl. login and 3 roles) |
| Browser route sweep | **20/20 routes**, zero console errors |
| Task operations | create → start → complete with note/proof; stock unchanged |
| Import CNY | PO `26.5 CNY × 2.250`, landed `Rp 600.000`, roll HPP `Rp 71.625/m`; bill `CNY 1.325` |
| Shipment tracking | ETD/ETA, in-transit → received, landed cost, progress |
| Direct intake proof | optional file metadata on receiving/task/shipment/transfer receipt |
| Mobile bottom nav | Beranda / Tugas / Stok / Akun at 320/390; 2-column task tiles |
| PIN login | wrong PIN shows remaining attempts; correct PIN reaches role home |
| PIN change | manager changed PIN, logged out, logged in with the new PIN |
| PIN lockout | 5 failures → 60 s account lock (logic + message) |
| Warehouse editing | created MDN, edited code, deactivated empty site; JKT deactivation refused with stock reasons |
| Direct stock intake | 2 rolls (`12 m + 8 m`) created with lot, cost, receipt and movements |
| Guided cycle | receive 60 → cut 10 → **50 remaining**, payment **Rp 500.000** (40%) |
| Simulation isolation | main `RL-0001` stayed **60 m** after sim mutations |
| Mobile widths 320 / 390 / 768 | overflow **0 px**, inputs **16 px**, targets **≥ 44 px** |
| Drawer / account button | opens, focus moves inside, Esc closes; account 44 px on touch |
| Modal at 320/390 | fits viewport, footer/submit visible, body scrolls |
| Blind opname | only `Hitungan` column; no expected balance in DOM |
| Lighthouse (login, dashboard, tasks, stock, purchasing, samples, master, simulation) | **Accessibility 100, Best Practices 100, SEO 100** |

Reproduce:

```bash
npm test
node tools/check.mjs
node tools/render-check.mjs
```

---

## Feature matrix

### Implemented

- Per-role login with PBKDF2-hashed PIN, 8-hour session, 5-attempt lockout, PIN change, logout.
- Role-specific navigation defaults and action gating for manager, operator, sales.
- Editable warehouses (create, rename, recoordinate, deactivate with usage guard) and editable collections.
- Direct stock intake without PO (opening balance/correction) with unique document, lot, per-roll lengths, cost, reason and audit.
- **Task operations:** receive, putaway, picking, cutting, sewing/finishing, QC, transfer, shipment, opname and sample tasks; assign, start, block, resume, complete, cancel; due dates, priority, cutting queue, manager board; completion note and optional physical proof.
- **Import suppliers:** local vs import (China), CNY pricing, locked FX rate, PO value in CNY and IDR, CNY supplier bills and payments, landed cost (freight/insurance/duty/other) allocated to roll HPP, shipment tracking (BL/container, ETD/ETA, customs, arrival) and document metadata.
- **Sample & Deposit workspace:** dedicated page for samples by customer/source roll, conversion linking, deposit ledger and refunds.
- **Optional physical proof:** file metadata on supplier receipts, internal transfer receipts, tasks and shipments.
- **Mobile workspace:** bottom navigation (Beranda/Tugas/Stok/Akun), 2-column task tiles, task-first operator dashboard, compact task cards.
- Consistent 18 px icon system with 14 px stat icons (fixes oversized/missing-looking dashboard icons).
- Roll-level inventory with collection → colour → lot → roll → warehouse/bin.
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
- JSON backup/export/restore with referential validation and schema migration.
- Versioned release (`v2.2.0`), changelog and GitHub Actions CI.

### Partial

- Supplier bill is created with goods receipt (demo simplification).
- One invoice per project; no partial project fulfilment.
- **Production flow is task-based.** Cutting/sewing/QC exist as tasks; there is no WIP production order with per-piece routing, piece-rate payroll, or machine capacity.
- Attachments store metadata only (no bytes).
- Landed cost is allocated per unit at receipt; reallocation after a later shipment cost change is manual.
- Paid sample uses a service invoice; no separate sample price list.
- As-of inventory balances are not reconstructed; movement history is.
- Barcode labels are visual; no scanner integration.
- Permissions are UI-level only; PIN is a local gate, not server authorization.
- Quote/order documents are not separate from invoices.
- Return credit above the remaining invoice balance is not carried as a customer credit balance.

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

- **PIN login is local, not real authentication.** PINs are hashed, but everything runs in the browser; anyone with the device can clear storage. There is no server, no shared session, and no secure multi-user authorization.
- **No secure multi-user authorization.** Two browsers do not share data; sessions are per tab.
- **No shared transactional backend.** No concurrency control, no idempotency, no server audit.
- **No actual payments, bank messages, or supplier communication.** Payment records are local.
- **Local persistence only.** Clearing site data deletes the demo (and resets PINs); the backup JSON is the escape hatch.
- **Not accounting.** Reports are management summaries, not a ledger, tax invoice, or P&L.
- **Production is task-based, not a WIP production order.** Cutting/sewing/QC are tracked as tasks; per-piece routing, payroll and capacity are planned.
- **Proof is metadata only.** Photos/documents are not uploaded or stored.
- **Single currency and time zone** (IDR, Asia/Jakarta) by design.

Production requirements are defined in [PRD.md §12](./PRD.md#12-production-architecture).

---

## Design and accessibility notes

- Brand from the Lajur guide: Midnight Navy, Warm Ivory, Muted Teal, Copper; Manrope + Inter; tabular numerals.
- Status always has a text label; swatches never encode numeric codes.
- Motion is limited to 120–260 ms, specific properties, and disabled under `prefers-reduced-motion`.
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
