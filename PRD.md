# PRD — Lajur v2.5

**Product:** Lajur — curtain & textile inventory management
**Company model:** one company, multiple warehouses
**Locale:** Indonesian UI, IDR, Asia/Jakarta
**Version:** 2.5.0 (schema 7)
**Status:** interactive demo complete (browser-only), production architecture defined but not built
**Date:** 7 November 2026
**Related:** [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) · [README.md](./README.md) · [CHANGELOG.md](./CHANGELOG.md)

> **Brand line:** *Setiap roll, tercatat.*
> Lajur is an internal working name from the brand guide; it can be replaced without changing the product model.

---

## 1. Problem and goals

Curtain businesses sell fabric by the metre, but they buy and store fabric as **individual physical rolls with different lengths, dye lots and costs**. A "stock: 324 m" number is not actionable on the warehouse floor: the operator must know *which roll* is 61.2 m, which lot it belongs to, where it sits, and whether part of it is already promised to a project.

Lajur exists to keep one traceable chain:

**collection → colour variant/SKU → lot → physical roll → warehouse / bin**

and one consistent set of quantities:

**physical − reserved = available**, with **quarantine** and **in-transit** shown separately.

### Goals

| # | Goal | Measure of success |
|---|------|--------------------|
| G1 | Find any roll, lot, colour or part in seconds | Search returns the roll by ID, lot, SKU, colour name/code, bin |
| G2 | Never sell or ship stock that is reserved, quarantined or in transit | Domain rejects the operation; invariant tests pass |
| G3 | Make internal warehouse requests safe without duplicate shipping | Requested / dispatched / received / outstanding / transit stay distinct |
| G4 | Keep money and stock separate | Transfers create no revenue, AR, or supplier debt; invoice posting is the only stock issue |
| G5 | Give owners a daily exception list | Dashboard shows approvals, late transfers, aging, shortages |
| G6 | Make the demo reusable without contaminating real data | Separate simulation dataset, reset, guided cycle |

### Non-goals (v2 demo)

- It is **not** an accounting ledger, tax invoice, or payroll system.
- It does **not** provide server-side authentication or authorization; the PIN gate is a local demo, not a security boundary.
- It does **not** model multi-company ownership or profit per warehouse.
- It does **not** support partial project fulfilment (one invoice per project).

---

## 2. Assumptions

1. **One legal entity, three warehouses** (Jakarta, Bandung, Surabaya). Warehouses are stock locations, not profit centres.
2. **Fabric is the unit of truth in metres**, stored as integer millimetres. Spare parts are integer pieces. They are never summed.
3. **Opening stock** is given for Luna:
   - colour 01: 60, 61.2, 63, 70, 70 m (324.2 m)
   - colour 02: 70, 70, 63, 50.3, 80 m (333.3 m)
   Each length is a separate roll.
4. Prices are **exclusive of tax**; the demo does not compute PPN. Money is integer IDR.
5. "Manager" approves internal requests, purchase orders, opname adjustments and indent refunds.
6. A **project** is fulfilled as one document in the demo. Partial fulfilment is a production item.
7. Sales may be **whole roll**, **cut length**, or **mixed** with parts on one invoice.
8. Colour swatches are **visual hints only**; a numeric colour code never determines a colour. An unset swatch is valid.
9. The demo is single-user. Role switching simulates the experience, not security.
10. Demo payments, supplier messages and banking are recordings, never real transactions.

---

## 3. Personas and role-specific defaults

Each persona signs in with their own account and PIN; the session determines the role. There is no role switcher. Demo PINs are `2468` (manager), `1357` (operator), `8642` (sales) until changed. This is a local gate, not server security.

Role scope in v2.5: **operator** can reach summary, tasks, production WIP, stock, internal requests, supplier receiving, opname and simulation; **sales** can reach summary, tasks, read-only stock, invoices, sales orders, projects, customers, samples and simulation; **manager** can reach everything including reports, master data and settings. Operators never see PO prices, supplier bills or the supplier master.

### 3.1 Warehouse operator ("Operator Gudang")

Needs speed on the floor, often on a phone, sometimes with gloves.

**Default landing:** `#/ringkasan` with warehouse-scoped KPIs and work queue, or `#/stok` when arriving from a scan/link.

**Primary tasks**
- Search roll / lot / colour / part; read physical, reserved, free, quarantine, transit.
- Receive supplier goods and record each roll length separately.
- Prepare and dispatch internal requests; record partial receipts.
- Follow cutting and packing instructions.
- Perform blind stock opname.
- Trace a roll's full history.

**UI rules**
- Warehouse selector is always visible; quantities are scoped to it.
- Mobile cards lead with roll ID, colour and the three quantities.
- Quantities use tabular numerals and metres with Indonesian decimals (`61,2 m`).
- Destructive or financial actions are absent, not just disabled.

### 3.2 Sales / customer service ("Sales / CS")

**Default landing:** `#/penjualan` or manager-style overview with customer follow-ups.

**Primary tasks**
- Customer profile: projects, samples, purchases, invoices, payments, deposits, activity.
- Quotes/orders/invoices/payments (demo: invoice is the sales document).
- Whole-roll and cut-length sales, mixed with parts.
- Samples and sample-to-purchase conversion.
- Customer deposits for indent and sample deposits.
- Returns and outstanding balances.

### 3.3 Manager / owner ("Manajer")

**Default landing:** `#/ringkasan` company view.

**Primary tasks**
- Decide exceptions: approvals, late deliveries, aging, project shortages.
- Compare stock availability across warehouses.
- Sales, gross margin, inventory value, slow-moving stock.
- Sample conversion and project material cost.

---

## 4. Scope

### 4.1 Implemented in the demo

| Area | What works |
|------|------------|
| Inventory | Collections, SKUs, lots, rolls, bins; physical/reserved/available/quarantine/transit; search and filters; roll trace; split and cut; whole-roll sale; quarantine; movement ledger; direct intake (opening/correction) with unique doc, lot, cost and reason |
| Tasks | Receive, putaway, picking, cutting, sewing/finishing, QC, transfer, shipment, opname, sample; assign/start/block/resume/complete/cancel; priority, due date, cutting queue, manager monitor, optional proof |
| Import purchasing | Local and Chinese suppliers; CNY prices and locked FX; PO value in CNY + IDR; CNY bills and payments; landed cost (freight/insurance/duty) in roll HPP; shipment BL/container, ETD/ETA, customs, arrival, documents |
| Access | Per-role login (manager/operator/sales) with PBKDF2 PIN, 8-hour session, 5-attempt lockout, PIN change, logout; role-specific home and action gating |
| Settings | Account/PIN, staff users (add/edit role/activate/deactivate/reset PIN), operational preferences, audit, backup/restore |
| Sales orders | Draft/confirmed order, customer + available roll/part, **reserves stock**, creator and full contents, **editable draft with re-reservation**, line prices, printable sales order, convert to invoice once; stock only moves at invoice |
| Roll hierarchy | Collection → colour/SKU → root roll → child rolls, parent/root identity, split lineage and conserved metres |
| Supplier price book | Every fabric/part lists its supplier(s), latest price, currency, MOQ and validity; new quotes update master buy price; PO defaults to latest supplier price |
| Foreign buying | Explicit IDR/CNY, latest CNY→IDR rate shown and **snapshotted on the PO** with timestamp/source; IDR HPP, bill and payment |
| Production WIP | Per-piece order: cutting → sewing → QC, reject/rework, piece-rate payroll, work-centre capacity, source roll/lot trace |
| Reporting | Stock, sales/margin, production WIP/payroll/capacity, orders, AR/AP, deposits, returns, samples, slow-moving |
| Master | Editable warehouses (create, code, name, prefix, contact, deactivate with usage guard); editable collections; categories; products with brand/image/notes; parts with brand/image/notes; suppliers local/import |
| Internal requests | Create, submit, approve/reject, cancel before dispatch, dispatch from exact rolls, partial dispatch, partial receive, print request and surat jalan, 5-quantity progress |
| Purchasing | Suppliers, price list, PO, approval, partial receiving with per-roll lengths and lots, duplicate receipt block, over-receipt block, auto supplier bill (demo simplification), payables, supplier returns |
| Sales | Multi-line invoice, fabric + parts + service lines, draft → post, snapshot description/price/cost, payments, deposit application, customer returns with credit and quarantine, print |
| Projects | Create, requirements, FIFO auto-allocation, reservation, invoice/stock issue, handover, shortage, material cost, instructions print |
| CRM | Contacts, stage, next action, follow-up, activity log, projects/invoices/samples/deposits |
| Samples & deposits | Free / paid / refundable sample; roll cut; conversion link; deposit ledger; refund guards; indent deposit |
| Opname | Session per warehouse, snapshot, blind count, save draft, completeness, review, variance, recount, approve/post, permanent history, freeze |
| Reports | Stock by warehouse/SKU, valuation, movement, sales/margin, product performance, AR/AP aging, deposits, returns, samples, project shortage, slow-moving, audit |
| Demo | Separate simulation dataset, banner, start/resume/reset/exit, guided 60→10→50→partial payment cycle, JSON backup/restore with reference validation |

### 4.2 Partial in the demo

| Area | Limitation |
|------|------------|
| Supplier billing | Goods receipt and supplier invoice are created together; production separates them |
| Quote → order → invoice | Invoice is the only sales document |
| Project fulfilment | One invoice; no partial issue or multi-invoice project |
| Permissions | PIN session gates the UI; no server enforcement, no shared session |
| Attachments | File metadata only; bytes are not stored |
| Barcode | Label is printable; no scanner integration |
| Payments | Recorded locally; no gateway, bank or reconciliation |
| As-of inventory | Movement history exists; historical balance reconstruction is not exposed |
| Transit exceptions | Damaged/lost/disputed goods in transit need a future workflow |

### 4.3 Planned (production)

Authentication and server authorization; transactional posting with idempotency; immutable posted documents; concurrency control; GR/IR reconciliation; partial project fulfilment; barcode/QR; accounting integration; notifications; offline sync; warehouse-level attribution policy; audit export; backups and disaster recovery.

---

## 5. Domain model

### 5.1 Entities

| Entity | Key fields |
|--------|-----------|
| `warehouse` | id, code, name, bin prefix, address, phone, **active** |
| `collection` | id, name, category, description |
| `sku` (colour variant) | id, collectionId, code, colourCode, colourName, swatch (nullable), widthCm, unit `m`, buy/sell price, brand/notes/image optional, active/dormant |
| `part` | id, SKU, name, category, brand, unit `pcs`, buy/sell price, image/notes optional, active |
| `roll` | id, skuId, lot, receivedAt, receiptRef, originalMm, currentMm, reservedMm, warehouseId, bin, status, condition, costPerM, parentRollId, rootRollId, transit, reservations[] |
| `movement` | id, at, type, ref, warehouse from/to, sku/part/roll, qty, before/after, unit cost, value, user, role, note |
| `transfer` | id, from/to warehouse, neededBy, reason, projectId, status, lines[] |
| `transfer line` | skuId, requestedMm, dispatchedMm, receivedMm, allocations[{rollId, dispatchedMm, receivedMm}] |
| `supplier` | id, name, contact, country, origin local/import, currency, fxRate, incoterm, port, terms, leadTime, notes |
| `purchase order` | id, supplier, currency, fxRate, dates, terms, status, lines[] with foreign price + IDR cost, totalForeign, total IDR |
| `goods receipt` | id, unique ref, kind `po`/`adhoc`, PO, supplier (nullable for adhoc), date, warehouse, currency/fx, lines with lot/lengths/rollIds, total, attachments |
| `supplier invoice` | id, supplier, PO, receipt, currency, fxRate, amountForeign, amount IDR, paid, paidForeign, payments[] |
| `shipment` | id, PO, supplier, mode, BL/AWB ref, container, ETD, ETA, status, history[], costs{freight,insurance,duty,other}, landedCostIdr, attachments |
| `task` | id, type, title, warehouse, assignee, priority, status, dueDate, project, roll, qtyMm, notes, history[], attachments |
| `customer` | id, name, company, contact, address, stage, nextAction, followUpDate, salesperson, activities[] |
| `project` | id, customer, name, location, targetDate, status, requirements[], allocations, invoiceId, attachments, history[] |
| `invoice` | id, customer, project, date, dueDate, status, lines[] (snapshot), subtotal, discount, total, credited, depositApplied, payments[] |
| `sales order` | id, customer, project, date, status draft/confirmed/converted/cancelled, createdBy/userId, lines[] with qty + unit price + amount, total, invoiceId, history[] |
| `supplier price` | id, supplierId, skuId/partId, price, currency, unit, moqMm/moqPcs, validFrom, validTo, priceIdr, createdAt, createdBy |
| `fx rate` | id, currency, rate, asOf, source, poId, createdBy |
| `production order` | id, customer/project, warehouse, targetDate, status, lines[] (roll, qty, piece length), notes |
| `production piece` | id, orderId, lineId, roll/lot, qtyMm, stage cutting/sewing/done/rejected, worker, QC note, operations[] |
| `payroll entry` | id, orderId, pieceId, stage, worker, rate, amount, date, paid |
| `work centre` | stage, name, capacityPerDay, ratePerPiece |
| `settings` | lowStockMm, taskDueDays, requireProofOnReceipt, salesOrderEnabled, operatorCanSeeCosts, sampleDepositRequired |
| `sample` | id, customer, sku, source roll, qty, mode free/paid/deposit, depositId, linkedInvoiceId, status |
| `deposit` | id, customer, kind indent/sample, amount, applied, refunded, ledger[], sampleId |
| `return` | id, type customer/supplier, source invoice/receipt, lines, credit, status |
| `opname session` | id, warehouse, status, snapshot lines (expected, counted), adjustments, approvals, history[] |
| `audit` | id, at, user, role, action, entity, entityId, detail |

### 5.2 Units and precision

- `currentMm`, `reservedMm`, `originalMm` are **integer millimetres**.
- UI parses metres with comma or dot, formats with `Intl.NumberFormat('id-ID')`.
- Parts use `qtyPcs` integers; fractional part input is rejected.
- Money is `Math.round`ed to whole rupiah at every posting boundary.
- Invoice lines snapshot `qty`, `unitPrice`, `unitCost`, `description`, `lot`.

### 5.3 Roll identity rules

- Every physical roll has a unique stable ID (`RL-0001`) and a printable label.
- Cutting keeps the **parent roll identity** and creates a **child piece** with `parentRollId` and `rootRollId`.
- Wholesale of an entire roll does not split it; the roll becomes `sold`.
- A cut for sale creates a `sold` piece; a sample creates a `consumed` piece.
- A transit dispatch either moves the whole roll or creates a transit child; receipt may split it again.
- Parent + children lengths must equal the original length.

### 5.4 Statuses

| Entity | Values |
|--------|--------|
| Roll | available, quarantine, sold, consumed, void (+ `transit` object) |
| Transfer | draft, submitted, approved, rejected, dispatched, partially_received, received, cancelled |
| PO | draft, approved, partial, received, cancelled |
| Invoice | draft, posted, void |
| Project | draft, reserved, issued, handover, cancelled |
| Opname | counting, review, posted, cancelled |
| Deposit | open, partial, cleared, refunded |

---

## 6. Workflows

### 6.1 Receiving supplier goods

1. Create PO (supplier, dates, terms, fabric/parts).
2. Manager approves.
3. Receiver enters unique document ref, warehouse, and per line: lot and **each roll length separately** (parts: pcs).
4. System rejects duplicate refs and over-receipt per line.
5. Each length creates a new roll with its own ID, lot, bin, cost.
6. Demo creates a supplier bill at the same time. **Production:** GR and supplier invoice are separate documents reconciled before payables post.

### 6.2 Whole-roll and cut-length sale

1. Select customer, then a roll from a specific warehouse.
2. Choose **cut** or **whole**.
3. Cut `10 m` from `RL-0001` (60 m): parent becomes 50 m, a sold child piece of 10 m is created with the same lot/cost; total metres conserved.
4. Whole roll: only allowed when no metres are reserved; roll status becomes sold.
5. Invoice posting validates every line first, then issues stock **once** and snapshots costs.
6. Multi-line invoices may mix fabric (m) and parts (pcs).

### 6.3 Internal warehouse request / PO Internal

1. Destination warehouse requests products, colours, quantities, source warehouse, needed-by date, reason and optional project.
2. Manager approves or rejects.
3. **Approval does not reserve stock.** Availability is re-checked at dispatch.
4. Source warehouse selects exact roll IDs and quantities; dispatch reduces source metres and creates transit pieces.
5. Destination records partial or full receipt; each receipt creates a roll at destination, preserving lot and cost.
6. Print request and internal delivery note (surat jalan).

**Canonical example**

> Requested 15 m · dispatched 5 m · received 2 m
> **Not yet dispatched = 10 m** (`requested − dispatched`)
> **Still in transit = 3 m** (`dispatched − received`)

Outstanding dispatch is **never** derived from received quantity; doing so causes duplicate shipping.

**Cancellation** is allowed only before any dispatch. Transfer of damaged/lost/disputed goods needs a future exception workflow; it must not silently adjust transit.

**Financial rule:** transfers preserve quantity and cost and create **no** revenue, AR, or supplier payables.

### 6.4 Project fulfilment

**Draft → material reservation → invoice/stock issue → handover**

- Requirements are fabric (SKU + metres) and parts (pcs + warehouse).
- Fabric allocations point to exact rolls; FIFO auto-allocation is available.
- Reservation increases `reservedMm` / part `reserved`; availability drops immediately.
- **Invoice posting is the single authoritative stock issue.** Handover only changes status and records a date. Posting twice and handover double-deduction are rejected.

### 6.5 Samples and deposits

- **Free:** cut from a roll, no money.
- **Paid:** cut from a roll plus a service invoice (revenue), no second stock issue.
- **Deposit:** cut from a roll plus a refundable liability.
- Every sample records customer, SKU, source roll, metres, date, mode and linked invoice.
- Sample refund is only allowed after a qualifying linked posted purchase.
- Deposit ledger records receive/apply/refund; `amount − applied − refunded` is the balance.
- The same deposit amount can never be both applied and refunded.
- Indent deposits are obligations, not revenue; they are applied once to an invoice and unused balances stay visible.

### 6.6 Stock opname

1. Start session per warehouse (one active session per warehouse).
2. Snapshot all physical rolls.
3. Blind count: expected balance hidden; inputs accept metres.
4. Save draft; completeness is required to submit.
5. Manager reviews variance and value.
6. Recount or approve with a mandatory reason.
7. Approval posts adjustments with before/after, user, timestamp, reference and financial impact.
8. Session history is permanent.

**Freeze policy (demo):** while `counting` or `review`, sales, receiving, transfers and returns for that warehouse are blocked. Approval is rejected if a counted roll would fall below its committed reservations (`ALLOCATION_CONFLICT`).

### 6.7 Returns

- Customer return is against original invoice lines; cumulative returns cannot exceed sold quantity.
- Credit reduces the invoice outstanding; fabric returns create quarantine rolls; parts restock only when disposition is good.
- Supplier return is against received stock and reduces the linked payable.
- Duplicate credits are blocked by the cumulative quantity check.

### 6.8 Import suppliers, CNY and shipments

1. Supplier master marks **local** or **import**, with currency (IDR/CNY), FX rate, incoterm and port.
2. Purchase order stores the **currency and FX at PO time**; line prices stay in the supplier currency and each line gets an IDR cost.
3. A shipment records BL/AWB, container, mode, ETD/ETA, and costs: freight, insurance, duty, other. Statuses: preparing → in transit → customs → arrived → received.
4. Receiving uses the PO FX for goods cost and allocates **landed cost** by line value, adding it to each received roll's cost per metre (parts: per piece).
5. The supplier bill is in CNY with an IDR equivalent; payments record the CNY amount, FX snapshot and IDR value. Payables aging remains IDR.
6. Duplicate shipment references and duplicate receipt references are rejected.
7. Landed cost is not a stock quantity, revenue or payable; it is part of inventory cost.

### 6.9 Operational tasks
- Task types: receive, putaway, picking, cutting, sewing/finishing, QC, transfer, shipment, opname, sample.
- Any task can link a warehouse, assignee, project, roll, target metres, priority and due date.
- Lifecycle: open → in progress → blocked/resumed → done, or cancelled.
- **Tasks never post stock.** Cutting as a task is only coordination; actual cutting is recorded by a WIP production order (`#/produksi`).
- Managers see all tasks and the cutting queue; operators default to their own tasks; sales can create sample tasks.
- Completion accepts a note and optional physical proof metadata.

### 6.10 WIP production orders

1. Create a production order from one or more available rolls, total metres and a piece length (e.g. 2.4 m per panel). The roll is reserved.
2. Cutting consumes the reservation, reduces the source roll and creates one WIP piece per length. Each piece keeps the source roll, lot and a unique code.
3. Each piece moves cutting → sewing → QC. QC can pass (done) or fail (rejected); rejected pieces can be reworked back to sewing.
4. Every completed stage writes one payroll entry at the work-centre piece rate. Payroll can be marked paid without a bank transfer.
5. Capacity shows active pieces per stage versus daily capacity and estimated days. It is an estimate, not a machine calendar.
6. Production never creates a sales invoice; invoicing remains a separate event. Cancellation before cutting releases the reservation; after cutting it requires a scrap workflow (planned).

### 6.11 Roll hierarchy, order documents and supplier pricing

1. **Roll hierarchy:** each roll has at most one parent. A split creates a child with `parentRollId` and the original `rootRollId`; the parent and child lengths conserve the original. Stock exposes a toggle between the flat roll list and a collection → colour/SKU → root → child tree.
2. **Sales order visibility:** the list shows the creator; the detail shows customer, project, creator, dates, history, every line with quantity/price/amount and the reservation. A confirmed or converted order is read-only except for printing.
3. **Draft order editing:** editing releases the old fabric/part reservations and reserves the new lines in one operation. A failed edit leaves the previous order and reservations intact.
4. **Sales order document:** printing produces “Pesanan Penjualan” with creator, lines, roll/lot, prices, total and signature space. It is not a tax invoice.
5. **Supplier price book:** each SKU/part can have quotes from multiple suppliers. The latest valid quote on the PO date is the default PO price; saving a newer quote refreshes the master IDR buy price.
6. **Import rate:** when buying in CNY, the PO shows the latest rate before saving. The consumed rate, its timestamp and source are stored on the PO; a different entered rate becomes the new latest rate.

---

## 7. Business rules (normative)

| ID | Rule |
|----|------|
| BR-01 | Available = physical − reserved; never negative. |
| BR-02 | A cut may not consume reserved metres; whole-roll sale requires zero reservation. |
| BR-03 | A split conserves length: parent after + child = parent before. |
| BR-04 | Each cut piece keeps a parent reference and root roll ID. |
| BR-05 | Quarantine and transit stock can never be sold. |
| BR-06 | New sales of inactive/dormant SKUs are blocked. |
| BR-07 | Parts accept integers only; metres and pieces are never added. |
| BR-08 | Invoice posting issues stock exactly once; handover never issues. |
| BR-09 | Posted invoice lines keep snapshotted description, qty, price and cost. |
| BR-10 | Transfer outstanding = requested − dispatched, not requested − received. |
| BR-11 | Transit = dispatched − received; transit is not stock at either warehouse. |
| BR-12 | Internal transfers create no revenue, AR, or supplier AP. |
| BR-13 | Approval does not reserve; dispatch re-checks availability. |
| BR-14 | Transfer cancellation is only before dispatch. |
| BR-15 | Receipt document refs are unique; over-receipt per PO line is rejected. |
| BR-16 | Project issue requires complete allocation and reserves before invoicing. |
| BR-17 | Deposit balance = amount − applied − refunded; refunds above balance are rejected. |
| BR-18 | Sample refund requires a linked qualifying purchase. |
| BR-19 | Opname blocks warehouse mutations while counting/reviewing. |
| BR-20 | An adjustment below committed reservation requires allocation resolution first. |
| BR-21 | Returns cannot exceed sold quantity; credit cannot be duplicated. |
| BR-22 | Simulation writes to a different storage key and never mutates main data. |
| BR-23 | Restore validates every reference before replacing data. |
| BR-24 | Financial reports are company-level; warehouse profit needs an explicit policy. |
| BR-25 | Warehouse code and bin prefix are unique; deactivation is refused while physical stock, transit, parts, active requests, or an active opname reference it. |
| BR-26 | Direct stock intake requires a unique document reference, warehouse, lot (fabric), individual lengths, cost, reason, and audit; it creates no supplier payable. |
| BR-27 | A whole-roll invoice line may only post if the roll length still equals the draft snapshot. |
| BR-28 | Sample deposits are refund-only; they cannot be applied as invoice credit. |
| BR-29 | PINs are stored as salted PBKDF2 hashes; sessions expire after 8 hours; five failures lock the account for 60 seconds. Demo only, not production auth. |
| BR-30 | Operational tasks coordinate work but never change stock; stock changes only through receipts, transfers, invoices, samples and opname adjustments. |
| BR-31 | Import POs store the supplier currency and the FX rate at PO time; receipt cost and supplier bill store the resulting IDR at that rate. |
| BR-32 | Landed cost (freight, insurance, duty, other) is allocated proportionally by line value and added to received unit cost; it is not revenue or a separate stock quantity. |
| BR-33 | Shipment reference (BL/AWB) is unique per PO; ETA must be after ETD; status changes are kept in a timeline. |
| BR-34 | Physical proof is optional and stored as metadata (name, type, size, note, user, time); file bytes are not persisted in the demo. |
| BR-35 | A manager must be able to see open/overdue tasks, cutting queue, sales and receivables from the dashboard. |
| BR-36 | Operator navigation is limited to attendance/warehouse work: summary, tasks, stock, internal requests, purchasing receiving, opname and simulation; sales/CRM/report/settings are not reachable. |
| BR-37 | Sales navigation is limited to summary, tasks, stock (read-only), invoices, orders, projects, customers, samples and simulation; purchasing/opname/master/settings are not reachable. |
| BR-38 | A sales order posts no stock. Converting it to an invoice posts stock exactly once; a converted or cancelled order cannot be converted again. |
| BR-39 | At least one active manager must remain; deactivating the last manager is rejected. |
| BR-40 | Product, part, supplier, warehouse, user and settings edits are written to the audit trail; images are optional and stored as small data URLs in the demo. |
| BR-41 | A sales order reserves fabric and parts immediately; cancelling releases them, converting consumes them and posts stock exactly once. |
| BR-42 | Cutting a production order consumes its reservation and creates one WIP piece per piece length; the piece keeps the source roll, lot and code. |
| BR-43 | Each completed production stage writes one payroll entry at the work-centre piece rate; payroll is marked paid without a bank transfer. |
| BR-44 | Production never creates a sales invoice; invoicing is a separate commercial event. Capacity is a daily estimate from active pieces. |
| BR-45 | Import PO currency and FX can be set at buying time, independent of the supplier default; received HPP and supplier bills use that snapshot. |
| BR-46 | Rolls form a parent/child forest per collection: a split creates a child whose `parentRollId` and `rootRollId` preserve lineage, and parent + child lengths conserve the original. |
| BR-47 | A sales order records its creator, line quantities and unit prices. Only a draft can be edited; saving releases the old reservations and reserves the new lines in the same operation. |
| BR-48 | A printable sales order is a commercial order document, not a tax invoice; stock still moves only when the order is converted and the invoice is posted. |
| BR-49 | Supplier price records are the source of truth for PO defaults: the latest price valid on the PO date is used, and saving a newer quote refreshes the master buy price in IDR. |
| BR-50 | Every import PO stores the CNY→IDR rate, timestamp and source used at buying time; a rate different from the latest known rate is appended to the FX history. |

---

## 8. Permissions

Demo role switching is a **UX simulation**. Production must enforce the following on the server for every mutation and query.

In v2.5 the role comes from a PIN session (PBKDF2 hash, 8-hour session, 60-second lockout after five failures). This improves the demo flow but remains client-side: clearing storage resets it, and a user with devtools can bypass it. Server-side permission checks are still mandatory.

| Capability | Operator | Sales | Manager |
|-----------|:--------:|:-----:|:-------:|
| View stock, roll trace | ✓ | ✓ | ✓ |
| Direct stock intake (no PO) | ✓ | – | ✓ |
| Create/submit internal request | ✓ | – | ✓ |
| Dispatch / receive transfer | ✓ | – | ✓ |
| Approve / reject transfer | – | – | ✓ |
| Count opname | ✓ | – | ✓ |
| Approve / post opname | – | – | ✓ |
| Receive supplier PO | ✓ | – | ✓ |
| Create PO | – | ✓ | ✓ |
| Create/post invoice, payment | – | ✓ | ✓ |
| Create sales order / convert to invoice | – | ✓ | ✓ |
| Create project / reserve / issue | – | ✓ | ✓ |
| Create customer / sample / deposit | – | ✓ | ✓ |
| Refund sample deposit | – | – | ✓ |
| Refund indent deposit | – | – | ✓ |
| Edit master data / suppliers | – | – | ✓ |
| Create/edit warehouses | – | – | ✓ |
| Manage staff users, roles and PIN resets | – | – | ✓ |
| Manage settings and preferences | – | – | ✓ |
| Login and change own PIN | ✓ | ✓ | ✓ |
| Backup / restore | – | – | ✓ |

**Production requirements:** deny-by-default policy, role + warehouse scope on queries, immutable audit of every mutation, idempotency keys on posting endpoints, and no trusting client-computed totals.

---

## 9. Reporting definitions

| Report | Definition | Label |
|--------|-----------|-------|
| Stock by warehouse/SKU | Sum of physical rolls at location; reserved and available separated | **Current balance** |
| Inventory value | Σ `currentMm/1000 × costPerM` + parts `qty × buyPrice`; transit shown separately | Current |
| Movement history | Append-only view of `movement` records with ref/user/time | Historical |
| Sales summary | Posted invoices; revenue, snapshotted COGS, gross margin | Period |
| Receivables aging | Outstanding by due-date age buckets | As of today |
| Payables aging | Supplier bill balance by due-date buckets | As of today |
| Slow-moving | Stock with no posted sale in ≥ 90 days | Current |
| Sample conversion | Converted samples ÷ total samples | Period |
| Project shortage | Required − allocated per requirement; material cost at cost | Current |
| P&L | **Not provided.** Management margin only, not a ledger | Clearly labelled |

No dashboard figure is hardcoded: all are computed from the same records.

---

## 10. Acceptance criteria

Statuses refer to the automated suite in `tests/` and browser verification on 7 Nov 2026.

| ID | Criterion | Status |
|----|-----------|--------|
| AC-01 | Opening Luna rolls exist as individual lengths (60, 61.2, 63, 70, 70 / 70, 70, 63, 50.3, 80) | Pass |
| AC-02 | Cutting 10 m from a 60 m roll leaves 50 m and a traceable 10 m piece | Pass |
| AC-03 | Reserved metres cannot be sold; available never negative | Pass |
| AC-04 | Whole-roll sale is blocked when reservations exist | Pass |
| AC-05 | Mixed invoice keeps metres and pieces separate and posts once | Pass |
| AC-06 | Transfer 15/5/2 yields outstanding 10 and transit 3; no revenue/AP created | Pass |
| AC-07 | Dispatch over outstanding and receipt over transit are rejected | Pass |
| AC-08 | Approval does not reserve; dispatch re-checks availability | Pass |
| AC-09 | Transfer preserves metres and unit cost; transit excluded from warehouse stock | Pass |
| AC-10 | Duplicate receipt ref and over-receipt are rejected | Pass |
| AC-11 | Return cannot exceed sold quantity or be credited twice | Pass |
| AC-12 | Deposit cannot be refunded twice or refunded + applied | Pass |
| AC-13 | Sample refund requires a qualifying linked purchase | Pass |
| AC-14 | Project issue deducts once; handover deducts nothing; second issue rejected | Pass |
| AC-15 | Part reservations are released exactly once on project issue | Pass |
| AC-16 | Opname freezes warehouse mutations and requires completeness | Pass |
| AC-17 | Opname adjustment below reservation is rejected | Pass |
| AC-18 | Dormant SKU sale is rejected | Pass |
| AC-19 | Simulation dataset is independent from main | Pass |
| AC-20 | Backup validates references and refuses broken restore | Pass |
| AC-21 | Key screens render without console errors; no page-level horizontal overflow at 320/390/768/desktop | Pass |
| AC-22 | Blind opname view exposes no expected balances | Pass |
| AC-23 | Lighthouse accessibility = 100 on dashboard, stock detail, transfer detail, simulation | Pass |
| AC-24 | Guided cycle: receive 60 → sell 10 → 50 remaining → partial payment | Pass |
| AC-25 | Each role logs in with its own PIN; wrong PIN reduces attempts; 5 failures lock 60 s | Pass |
| AC-26 | PIN can be changed after verifying the current PIN; weak/duplicate PINs are rejected | Pass |
| AC-27 | Warehouse can be created/edited; duplicate code/prefix rejected; deactivation blocked while in use | Pass |
| AC-28 | Direct intake creates individual rolls/parts with unique ref, lot, cost, reason and movements | Pass |
| AC-29 | Whole-roll draft with changed length is rejected | Pass |
| AC-30 | Sample deposit cannot be applied to an invoice | Pass |
| AC-31 | Task can be created, assigned, started, blocked/resumed and completed; stock unchanged | Pass |
| AC-32 | Manager sees overdue tasks and cutting queue on the dashboard | Pass |
| AC-33 | Import PO in CNY stores FX, converts to IDR, and records a CNY payable | Pass |
| AC-34 | Landed cost increases received roll cost per metre | Pass |
| AC-35 | Shipment tracks ETD/ETA/status and rejects duplicate reference | Pass |
| AC-36 | Optional proof metadata is stored on task/receipt/shipment | Pass |
| AC-37 | Mobile bottom navigation and 2-column task tiles work at 320/390 | Pass |
| AC-38 | Manager creates staff with role/PIN; new account logs in; deactivated account cannot | Pass |
| AC-39 | Last active manager cannot be deactivated | Pass |
| AC-40 | Product/part create-edit keeps stable ID, stores brand/image and audit entry | Pass |
| AC-41 | Supplier can be created/edited as local or CNY import | Pass |
| AC-42 | Sales order does not move stock; conversion issues stock once | Pass |
| AC-43 | Operator cannot reach sales/CRM/settings; sales cannot reach purchasing/opname/master | Pass |
| AC-44 | Preference “sales order off” hides the menu and document | Pass |
| AC-45 | Sales order reserves stock; conversion releases and issues once | Pass |
| AC-46 | Production order cuts 10 m into 5 pieces, payroll 25k, and preserves qty | Pass |
| AC-47 | Piece can be sewn, QC pass/reject, reworked; stats update | Pass |
| AC-48 | Capacity load and payroll payment are derived from pieces | Pass |
| AC-49 | Import PO accepts explicit CNY + FX at buying | Pass |
| AC-50 | Production/payroll/capacity report derives from same pieces | Pass |
| AC-51 | Reference server: scrypt login, shared revision, RBAC action; operator cannot post invoice | Pass |
| AC-52 | Stock hierarchy groups collection → colour → root → child and conserves metres after a split | Pass |
| AC-53 | Sales order shows creator, contents and prices; draft edit re-reserves and recalculates total | Pass |
| AC-54 | Printable sales order contains creator, lines, prices and “bukan faktur” note | Pass |
| AC-55 | Product/part master lists suppliers and latest price; a new quote updates buy price | Pass |
| AC-56 | PO defaults to latest supplier price; CNY PO stores latest rate, timestamp and source | Pass |

Test evidence: `node --test` → 51/51 passing; browser route sweep → 24/24 routes with zero console errors; viewport checks at 320/390/768 show overflow 0 and 16 px inputs; Lighthouse accessibility 100 on login, dashboard, tasks, production, stock hierarchy, purchasing, sales-order detail, master, settings and simulation.

---

## 11. Non-functional requirements

- **Performance:** client-side render under 100 ms for the demo dataset; avoid per-keystroke full re-render (inventory filters update only the list).
- **Accessibility:** WCAG AA contrast; visible focus; 44 px touch targets on tablets/phones; modal focus trap and Esc; semantic headings; reduced-motion support.
- **Responsiveness:** 320, 390, 768 px and desktop; no page-level horizontal scroll; wide tables scroll inside their container.
- **Data safety:** separate simulation key; reference-validated restore; reset is explicit and confirmed.
- **Time zone:** business dates in Asia/Jakarta; timestamps stored as ISO and rendered local.

---

## 12. Production architecture

### 12.1 Target stack

A runnable **reference API** now lives in `server/` (Node built-ins, scrypt PIN, HttpOnly session, RBAC per action, revisioned JSON state, atomic writes). It proves the auth/transaction contract but is not wired to the static demo and is not multi-node. Production replaces its file store with PostgreSQL and a managed session store.

- **API:** modular monolith (e.g., Node/NestJS or Laravel) with domain modules mirroring `src/domain`.
- **Database:** PostgreSQL. Rolls, reservations and ledger as rows; unique constraints on receipt refs; `SELECT … FOR UPDATE` or serializable transactions.
- **Posting:** one transaction per document; idempotency key per submit; outbox for events; immutable posted rows (no updates, reversals only).
- **Auth:** OIDC, server sessions, RBAC + warehouse scope; step-up approval for manager actions.
- **Files:** object storage with signed URLs; virus scanning.
- **Jobs:** aging snapshots, shortage checks, notifications, backups.
- **Observability:** structured audit log, request tracing, alerting on negative stock or failed postings.
- **Deployment:** managed Postgres, container app, CDN static frontend, daily PITR backups, restore drills.

### 12.2 Migration from the demo

1. Freeze master data: SKUs, colours, widths, units, warehouses, bins.
2. Import opening rolls with measured lengths and costs; validate totals against physical count.
3. Import open AR/AP/deposits as opening balances, not as new transactions.
4. Pilot one warehouse for 2–4 weeks with parallel counting.
5. Add barcode labels and scanner test.
6. Train the freeze policy and the distinction between reserved/transit.
7. Go-live with read-only legacy access for one period.

### 12.3 Roadmap

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| P0 (done) | Demo, invariants, PRD, design system, PIN login, warehouse master, tasks, import shipments, settings, roles, roll hierarchy, sales orders with edit/print, supplier price book, FX snapshots, WIP production, payroll, capacity | 51/51 tests, a11y 100 |
| P1 | Server + Postgres, auth, RBAC, immutable posting, audit, backups | Concurrency and duplicate-submit tests pass |
| P2 | GR/IR separation, supplier invoices, partial project fulfilment, attachments, barcode | Reconciliation report matches |
| P3 | Accounting integration, warehouse attribution policy, forecasting, notifications | Month-end close reconciled |
| P4 | Offline/PWA sync, scanner hardware, driver tracking | Field pilot signed off |

---

## 13. Risks and open questions

| Risk | Mitigation |
|------|------------|
| Local data loss (browser cleared) | Demo discloses; export JSON; production uses Postgres + backups |
| Role confusion (UI hides, server does not enforce) | Documented; production RBAC mandatory |
| Double shipping on partial transfers | Outstanding = requested − dispatched; tested |
| Cost drift on splits | Child inherits `costPerM`; tested |
| Opname freeze blocks urgent shipping | Freeze policy explicit; cancel session is available to manager |
| Colour matching errors | Codes/lots shown; swatch marked as reference only |
| Deposit/refund abuse | Ledger + balance checks + manager approval |
| Partial project delivery not supported | Out of scope; flagged in UI and PRD |

**Open questions for the client**
1. Should whole-roll sale be allowed when the roll is partially reserved? (Current: no.)
2. What is the approval threshold for indent refunds and stock adjustments?
3. Which warehouse owns transit cost and shrinkage?
4. Is PPN required on invoices, and at what rate?
5. Do projects need multi-invoice/partial delivery in phase 1?
