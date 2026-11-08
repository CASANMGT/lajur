# Gap analysis — Lajur v2.8 vs. earlier PRD and design system v2

Legend: **Done** = usable in the demo · **Partial** = usable with a documented limitation · **Planned** = production-only.

## 1. PRD requirement check

| PRD area | Status | Where / note |
|---|---|---|
| Collection → colour → lot → roll → warehouse/bin | Done | `inventory`, Stok & Roll, roll detail |
| Opening Luna rolls as individual lengths | Done | 60 / 61.2 / 63 / 70 / 70 and 70 / 70 / 63 / 50.3 / 80, tested |
| Physical / reserved / available / quarantine / transit | Done | Summary + roll columns; transit excluded from both warehouses |
| Same colour in other warehouses | Done | Roll detail availability card |
| Whole-roll and cut-length sales | Done | Invoice modal, roll-utuh mode, traceable child piece |
| Block negative, reserved, quarantine, transit, dormant, fractional pcs | Done | Domain invariants + tests |
| Multi-line invoice, fabric + parts, snapshots | Done | `postInvoice`, service lines |
| Internal PO/request with approval and exact-roll dispatch | Done | `TRF-0001`, dispatch modal |
| Partial dispatch/receipt 15 / 5 / 2 → 10 outstanding, 3 transit | Done | Tested exactly |
| Approval does not reserve; re-check at dispatch | Done | Documented in UI and PRD |
| Transfer preserves quantity/cost; no revenue/AP | Done | Tests |
| Supplier database, price, MOQ, lead time, terms | Done | Supplier tab |
| Local **and Chinese** suppliers | **Done in v2.2** | `SUP-004` Ningbo, origin/import, CNY |
| Pay supplier in yuan | **Done in v2.2** | CNY bill and TT payment with FX snapshot |
| COGS from import purchase + freight/duty | **Done in v2.2** | Landed cost allocated to roll `costPerM` |
| Track shipment | **Done in v2.2** | BL/container, ETD/ETA, customs, landed cost, timeline |
| External PO partial receiving with roll lengths/lots | Done | `PO-0002`, `PO-0005` |
| Duplicate receipt / over-receive blocked | Done | Tests |
| Supplier invoices, partial payments, returns | Done | Payables, supplier return |
| Customer profiles, contacts, stage, next action | Done | Pelanggan |
| Customer projects/samples/purchases/deposits | Done | Customer profile |
| Quotes / orders / invoices | **Partial** | Sales order + invoice + discount + faktur pajak + surat jalan; formal quote document still planned |
| Samples free / paid / refundable deposit | Done | Sample & Deposit page |
| Sample cuts reduce the source roll | Done | `createSample` → `splitRoll` |
| Sample-to-purchase linking and conversion | Done | Link invoice, sample report |
| Deposit receipt separate from revenue; refund guard | Done | Ledger + balance |
| Indent deposit lifecycle | **Partial** | Deposit + apply to invoice; full indent PO allocation planned |
| Projects draft → reserve → invoice/issue → handover | Done | Single authoritative issue |
| Partial project fulfilment | Planned | One invoice per project |
| Project photos/attachments | Partial | Metadata only |
| Material allocation by warehouse and exact roll | Done | FIFO auto-allocation + manual |
| Shortage indicators / material cost | Done | Project detail and reports |
| Stock opname: session, snapshot, blind count, draft, submit, variance, recount, approval, posting, history | Done | OPN-001 |
| Warehouse freeze during opname | Done | Blocks sales, receiving, transfers, returns, samples, quarantine |
| Adjustment below reservation rejected | Done | `ALLOCATION_CONFLICT` |
| Customer/supplier returns, credit, quarantine | Done | Customer return; supplier return |
| Product/SKU/category master, photos, dormant history | Partial | SKU/category/collection master done; product photo metadata only |
| Customer/supplier master editing | Done | |
| Cutting/packing instructions + print | Done | Project instructions |
| Reports: stock, movement, value, sales, receiving, aging, deposits, returns, performance, samples, shortage, slow-moving | Done | Laporan tabs |
| Company-level financials, labelled not a ledger | Done | Notice on every report |
| Simulation separate dataset + guided cycle | Done | 60 → 10 → 50 → partial payment |
| Role-based defaults | Done | Separate PIN and home per role |
| Mobile 320/390/768, drawer, 44 px, 16 px, cards, wide table containment | Done | Bottom nav added in v2.2 |
| Reduced motion, focus, validation, empty/error/loading | Done | Lighthouse 100 |
| **Task / operation management** | **Done in v2.2** | Tugas Operasi: receive, picking, cutting, sewing, QC, transfer, shipment, opname, sample |
| **WIP production / payroll / capacity** | **Done in v2.4** | Per-piece cutting → sewing → QC, rework, piece-rate payroll, capacity load |
| **Sales order reserves stock** | **Done in v2.4** | Reserve at order, release on cancel, consume once at invoice |
| **Explicit CNY buying** | **Done in v2.4** | Currency + FX chosen on PO; IDR HPP and bill |
| **Roll parent/child hierarchy per collection** | **Done in v2.5** | Collection → colour → root → child tree; lineage path and conserved metres |
| **Sales order detail, editing and print** | **Done in v2.5** | Creator, contents, prices, draft edit with re-reservation, printable Pesanan Penjualan |
| **Supplier price book** | **Done in v2.5** | Supplier(s), latest price/MOQ/validity per SKU/part; new quote updates master buy price |
| **User-entered CNY rate on import PO** | **Done in v2.8.1** | No default; latest shown as reference only; user rate + timestamp/source snapshotted |
| **Part parent/child per category in stock** | **Done in v2.6** | Category cards; Motor → Remote, Bracket → Bracket set, Rel 3 m → Rel 4 m |
| **Image preview for both roles** | **Done in v2.6** | Click/tap thumbnails in Master Data and Gudang; full-size modal |
| **WIP + Pesanan optional** | **Done in v2.6** | Off by default; Settings toggles; menu/routes/report tabs gated |
| **Invoice discount fixed/percent** | **Done in v2.7** | Snapshot on invoice; shown in detail and print |
| **Faktur pajak** | **Done in v2.7** | DPP/PPN 11% from total; NPWP, number, print; no manual price |
| **Surat jalan / PIC / confirmation** | **Done in v2.7** | Draft → dispatched → delivered → confirmed; no second stock move |
| **Simple / Advanced mode** | **Done in v2.8** | Simple default; manager switch in topbar/settings; advanced routes redirect |
| **Demo names** | **Done in v2.8** | Henry Martin (manager), Henny (operator), Belinda (sales) |
| **Server auth/RBAC/shared state** | **Partial** | Runnable `server/` reference; UI still static/local |
| **Object storage** | **Partial** | Local SVG/Data URLs for images; proof metadata only |
| **Manager monitors sales + cutting tasks** | **Done** | Dashboard sales chart + task/cutting monitor |
| **Settings, users & roles** | **Done in v2.3** | Account/PIN, staff add/edit/deactivate, reset PIN, preferences, audit, data |
| **Sales orders** | **Done in v2.5** | Draft detail/edit/print; reserves stock; invoice once |
| **Product/part master detail** | **Done in v2.5** | Brand, image, supplier list, latest price, active flag, audit trail |
| **Supplier add/edit** | **Done in v2.3** | Local/import, CNY/FX/incoterm/port |
| **Optional physical proof on documents** | **Partial** | Metadata on receipts, transfer receipts, tasks, shipments; invoices/opname still planned |
| Authentication / PIN per role | Done (demo) | PBKDF2, session, lockout, change PIN |
| Server authorization / shared transactions | Planned | Production architecture in PRD §12 |
| Immutable posted documents / idempotency | Planned | Demo is single-user local |

## 2. Design-system v2 (uploaded) check

| Design element | Status | Note |
|---|---|---|
| Brand identity, navy/ivory/teal/copper, Manrope + Inter | Done | Tokens unchanged |
| Status chips: Draft, Menunggu, Dalam Transit, Selesai, Ditolak | Done | Plus task/PO/shipment statuses |
| Amber warning, red danger tints | Done | `warn` / `danger` tokens |
| 24 px outline icon language | Done | Unified 18 px UI / 14 px stat icons, stroke 1.7 |
| Mobile bottom navigation | Done | Beranda, Tugas, Stok, Akun |
| Mobile task-first dashboard | Done | Terima Barang, Picking, Potong Kain, Opname tiles |
| Task cards with due/priority/assignee | Done | Tugas Operasi |
| Cut roll screen with roll summary + preview | Done | WIP production order + per-piece flow |
| Partial internal receiving with transit control | Done | Receive modal + transfer detail |
| Blind opname with manager-only variance | Done | Expected hidden while counting, shown in review |
| Sample swatches and unset state | Done | Swatch never derived from code |
| Flow: Pesan → Planning → Cutting → Jahit → QC → Transit → Selesai | **Partial** | Sales order → WIP → shipment done; machine planning/calendar partial |
| Desktop workspace hierarchy tree (collection → colour → lot → roll → bin) | **Done in v2.5** | *Hierarki koleksi* toggle with root/child roll tree |
| Spare-part hierarchy by category | **Done in v2.6** | Parent/child rows in Gudang; optional parent field in Master Data |
| Image preview / enlarge | **Done in v2.6** | Full-size modal from any product/part thumbnail |
| Optional WIP and Pesanan | **Done in v2.6** | Hidden by default; manager toggles in Settings |
| Hero illustration / decorative waves | Not needed | Functional UI prioritised; brand mark used |
| 320 / 390 / 768 / desktop | Done | Verified, 0 overflow |
| Simulation badges | Done | Copper banner + badges |
| File/photo proof | Partial | Metadata only |

## 3. Role focus

| Role | Default landing | Sees first | Cannot |
|---|---|---|---|
| Manajer | Ringkasan | exceptions, sales chart, task/cutting monitor, approvals, settings | — |
| Operator | Ringkasan | task tiles, my tasks, warehouse KPIs, work queue, receiving/opname, WIP when enabled | invoices, orders, sales/CRM, reports, master/settings |
| Sales / CS | Penjualan | receivables, follow-ups, samples/deposits, orders when enabled | purchasing, opname, master/settings, approvals |

## 4. Highest-value remaining gaps

1. **Wire the shared backend to the UI** and move posting to PostgreSQL with idempotency.
2. **Object storage** for product photos and proof, plus virus scanning.
3. **Partial project fulfilment** and quote documents.
4. **As-of inventory valuation** and import FX revaluation.
5. **Barcode/QR scanner** and label printer integration.
6. **Corporate accounting** integration (GL/PPN) and warehouse attribution policy.
7. **Full production planning**: machine calendar, shifts, capacity reservations, HR/tax payroll.
