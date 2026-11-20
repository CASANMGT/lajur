# Design System - Lavishome v2.36.0

**Source of truth:** `src/styles/tokens.css` and `src/styles/app.css`
**Brand reference:** *Lavishome - Brand Platform v1.0, 07 Nov 2026*
**Line:** *Setiap roll, tercatat.*

---

## 1. Brand direction

Lavishome is a **warm, corporate, structured** system for textile warehouse work - not a playful consumer app. It should feel like well-organised shelving: calm surfaces, precise numbers, clear labels, and a visible sense of physical material.

| Attribute | Expression |
|-----------|------------|
| Structured | Grid, hairlines, aligned numerals, compact metadata |
| Careful | Every quantity is labelled: physical, reserved, available, quarantine, transit |
| Warm | Ivory background, copper only as a material accent |
| Operational | Indonesian copy, roll IDs in mono, printable labels |
| Honest | "Transit" is never counted as warehouse stock; "available" is never guessed |

### Logo

Lowercase wordmark **lavishome** with a folded-ribbon "L" mark. Clear space at least the height of the `l`; minimum 24 px mark / 96 px wordmark digital. Never stretch, rotate or add effects. Master vector still to be finalised by the brand owner; the demo uses a simplified SVG.

### Photography & pattern

Texture, rolls and racks, organised aisles. Patterns only in brand areas, never behind numeric tables or roll labels. Location and roll identity must always win over decoration.

---

## 2. Colour

### Core palette

| Token | Hex | Use |
|-------|-----|-----|
| `--navy-800` | `#172B3A` | Sidebar, primary text, structural chrome |
| `--ivory` | `#F6F3ED` | Application background |
| `--paper` | `#FFFDF8` | Cards, forms, drawers |
| `--teal` | `#4D7A78` | Primary action, active navigation, focus |
| `--copper` | `#B87552` | Material accent, simulation, warnings |
| `--ink` | `#172B3A` | Body text |
| `--muted` | `#5A6973` | Secondary text (AA on ivory) |
| `--line` | `#E4DED2` | Hairlines and dividers |

### Supporting tones

| Token | Hex | Use |
|-------|-----|-----|
| `--teal-700` | `#3D6765` | Primary hover, links |
| `--teal-100` | `#E2ECEA` | Teal badge background |
| `--copper-700` | `#96603F` | Copper button background (AA with white) |
| `--copper-100` | `#F5E6DB` | Copper badge background |
| `--ok` | `#3C6B4F` | Success |
| `--warn` | `#8A6224` | Warning |
| `--danger` | `#9D4238` | Error, destructive |
| `--info` | `#2F5F73` | Informational |

### Rules

- Navy for structure and text; teal for controls; copper for material/attention, **not** small text on light backgrounds without checking contrast.
- Status colour is always accompanied by a **label**. Never rely on colour alone.
- Swatches are **visual references only**. If no swatch is set, show a neutral hatch and `?`; never invent a colour from a numeric code.
- Contrast target: WCAG AA (4.5:1 body, 3:1 large text/UI). Verified with Lighthouse at 100 for key screens.

### Semantic status mapping

| Meaning | Tone | Badge class |
|---------|------|-------------|
| Available / done / received | green | `badge-ok` |
| Reserved / pending / low stock | amber | `badge-warn` |
| Error / overdue / rejected | red | `badge-danger` |
| Info / in transit / submitted | blue | `badge-info` |
| Simulation / sample / material | copper | `badge-copper` |
| Neutral / draft / sold | muted | default |

---

## 3. Typography

| Role | Family | Weight | Size |
|------|--------|--------|------|
| Display / headings | **Manrope** | 700–800 | 30 → 17 px |
| UI, tables, forms | **Inter** | 400–600 | 14 px base |
| Roll IDs, refs, codes | System mono | 500 | 11.5–14 px |
| Numbers | Inter with `font-variant-numeric: tabular-nums` | 500–700 | inherits |

- Headings use tight tracking (`-0.015em`) and balanced wrapping.
- Never use a display face for table body.
- Metadata floor: 11 px. Phone form inputs: **16 px** to prevent iOS zoom.
- Dates: `7 Nov 2026`; times in Asia/Jakarta.
- Decimals: Indonesian comma, e.g. `61,2 m`, `Rp 850.000`.

---

## 4. Spacing, shape, elevation

- Spacing scale: **4 / 8 / 12 / 16 / 24 / 32 / 48 px** (`--s-1` … `--s-7`).
- Radius: 6 px controls, 8 px buttons/inputs, 12 px cards, 16 px modals.
- Borders: 1 px `--line`; stronger `--line-strong` for inputs.
- Shadows: `--shadow-1` for cards, `--shadow-2` dropdown/toast, `--shadow-3` drawer/modal.
- Density is comfortable; table rows 11 px vertical padding. No "compact mode" in v2.

---

## 5. Components

### 5.1 Buttons

| Variant | Use | Example |
|---------|-----|---------|
| `btn-primary` (teal) | One main action per view | "Buat faktur", "Setujui" |
| `btn-navy` | Simulation entry | "Simulasi Data" |
| `btn-copper` | Simulation-specific action | "Jalankan siklus" |
| `btn` (paper) | Secondary | "Cetak", "Terima barang" |
| `btn-ghost` | Tertiary / cancel | "Batalkan" |
| `btn-danger` | Destructive, always confirmed | "Reset data" |

- Minimum height 40 px desktop, **44 px ≤ 820 px**, 46 px for large.
- Icon + label; icon-only buttons need `aria-label` and 44 px on touch.
- Disabled states reduce opacity and block pointer; they still explain why nearby.
- Loading: submit buttons disable during async work and re-enable after.

### 5.2 Inputs

- Label above control; hint below; error replaces hint in danger colour.
- Inputs are 42 px desktop / 46 px mobile, 16 px text on phones.
- Use `inputmode="decimal"` for metres, `inputmode="numeric"` for rupiah/pcs.
- Grouped units use an attached `.unit` suffix (`m`, `pcs`), not placeholders alone.
- Validation messages name the fix: "Panjang melebihi stok tersedia", not "Error 422".

### 5.3 Badges and chips

- Badge = status with dot + label.
- Chip = filter toggle with `aria-pressed`.
- Counts in navigation use a copper pill only when action is needed.

### 5.4 Tables

- Sticky header, hairline rows, no zebra striping.
- Numeric columns right-aligned and tabular.
- Wide tables scroll **inside** `.table-wrap`; the page never scrolls horizontally.
- Rows that navigate are links: `data-href`, `tabindex="0"`, Enter support.
- On ≤ 700 px, inventory and request tables become **cards** with the same quantities.

### 5.5 Cards and stats

- `stat` = label, big value, meta. Numeric values never wrap; use compact money only in charts.
- Accent border (teal) marks the primary figure; copper marks attention.
- Cards are not clickable unless the whole surface is a link/button.

### 5.6 Drawer, modal, toast

- **Modal:** focus trap, Esc closes, scrim click closes, focus restored. Mobile: bottom sheet, max 92 dvh, footer always visible.
- **Drawer** (navigation): 310 px, scrim, Esc, focus moves inside, closes on link tap.
- **Toast:** bottom-right (bottom full-width on phone), 4.2 s, never the only confirmation for a destructive action.
- Destructive actions use a confirmation modal with explicit verb ("Reset data utama"), not "OK".

### 5.7 Simulation

- Copper banner is sticky under the topbar and unmistakable.
- Banner includes "Kembali ke data utama" and "Panel simulasi".
- Simulated dataset is separated at the persistence layer, not by a flag on records.

### 5.8 Authentication and account

- Full-screen split: navy brand panel + ivory sign-in card; stacked on ≤900 px.
- Three account cards show initials, name, role and a one-line scope. Selection uses `role="radio"` + `aria-checked`.
- PIN field: 4–6 digits, masked by default, show/hide toggle, `inputmode="numeric"`, 16 px+.
- Errors are inline and specific: remaining attempts, lock countdown, format.
- Demo PINs live in a collapsed `<details>` and disappear per account after a PIN change.
- Session is 8 hours; account menu exposes role, remaining session, **Ganti PIN** and **Keluar**.
- Changing a PIN requires the current PIN, blocks weak/duplicate PINs, and never echoes the PIN.
- Honest copy: the PIN gate is local; production needs server auth.

### 5.9 Tasks, mobile navigation, import

- **Task card:** icon tile 38 px, title, status badge, type, warehouse, qty/roll, assignee, due date, priority, proof count. Overdue = copper left border; done = reduced opacity.
- **Task board:** status filters (Aktif / Selesai / Semua), type filter, “Hanya tugas saya”, cutting-queue notice. Actions: Mulai, Terhambat, Selesai, Tugaskan, Batalkan.
- **Completion:** note + optional photo/PDF; proof count appears on the card; metadata only in the demo.
- **Bottom navigation (≤700 px):** Beranda, Tugas, Stok, Akun; 52 px targets, safe-area padding; account opens the account modal.
- **Mobile dashboard:** 2×2 task tiles (Terima Barang, Picking, Potong Kain, Opname), then task list and KPIs.
- **Icons:** one outline set, 1.7 stroke; 18 px default, 14 px inside stat labels, 20–22 px in task tiles. No icon may render at SVG default size (the v2.1 dashboard bug).
- **Import / CNY:** currency shown next to every foreign amount with the IDR equivalent on a second line; CNY badge in copper; shipment status uses info/copper/ok tones; landed cost displayed as a money total.
- **Proof:** file inputs are optional, labelled “Bukti fisik (opsional)”, and never claim the file was uploaded.

### 5.10 Settings, staff, sales orders and master visuals

- **Settings:** tabs Akun saya / Pengguna & peran / Preferensi / Audit / Data. Managers only; other roles are redirected.
- **User row:** name + stable ID, role badge, active state, PIN state, edit and reset-PIN actions. Reset PIN never reveals the old PIN.
- **Preferences:** low-stock threshold, default task due days, proof-required toggle, sales-order toggle, operator cost visibility, sample-deposit requirement.
- **Sales order:** optional module, hidden by default. When enabled: status chips Draft / Dikonfirmasi / Menjadi faktur / Dibatalkan. The detail page shows creator, customer, project, line contents and prices. “Edit” is available on drafts only and warns that reservations are recalculated. “Fakturkan” is the primary action and warns that stock issues once. “Cetak pesanan” produces a sales-order document, never a tax invoice.
- **Product/part rows:** 34 px image thumbnail or neutral swatch; SKU/brand; status; edit. Product/part forms show optional image preview (≤250 KB) and an audit timeline.
- **Supplier cards:** local (teal) vs import/CNY (copper), FX, incoterm, port; add/edit.
- **Role visibility:** navigation is filtered by role, not merely button-disabled. Operator: summary, tasks, production (when enabled), stock, requests, purchasing, opname, simulation. Sales: summary, tasks, stock (read-only), invoices, orders (when enabled), projects, customers, samples, simulation.

### 5.11 WIP production, imagery, mobile layering

- **Production order:** status chips Draft / Siap / Berjalan / Menunggu QC / Selesai. Flow strip cutting → sewing → QC → done; piece table shows code, source roll/lot, metres, stage, worker.
- **Piece actions:** Jahit (cutting piece), QC (sewing), Jahit ulang (rejected). QC dialog has pass/fail, note and optional proof.
- **Payroll:** one row per piece per stage with rate, worker and paid/open status; total per order. Never label it a bank payment.
- **Capacity:** three bars (potong, jahit, QC) showing load/capacity, utilisation colour (teal <70%, copper 70–100%, red >100%) and estimated days.
- **Product imagery:** 34 px row thumbnail, 54 px form preview, optional upload ≤250 KB; neutral placeholder when absent. Show hex swatch (`#C9B79C`) beside the colour code; never derive it from the numeric code.
- **Mobile layering:** bottom nav z45, drawer scrim z55, sidebar z60, modal z110. A drawer must cover the bottom nav, and the scrim covers both. Never let the bottom nav float above an open drawer.
- **Bottom nav:** four 52 px items; content bottom padding 104 px; safe-area padding; account opens the account sheet.
- **Tables on phones:** production/payroll tables scroll inside `.table-wrap`; action buttons stay 44 px.

### 5.12 Roll/part hierarchy, images, supplier price book, import FX

- **Stock hierarchy toggle:** two chips — “Daftar roll” and “Hierarki koleksi”. The tree is grouped collection → colour/SKU → root roll → children. Deep levels are indented with a dashed left rule; child rows are not visually flattened into the parent.
- **Tree row:** roll ID in mono, lot and warehouse/bin, physical / reserved / available metres, status badge. Each row links to the roll detail. Mobile row collapses to a wrapped two-line layout; the page must not scroll horizontally.
- **Part hierarchy:** spare parts are grouped into category cards; parent parts are rows and children are indented with a muted “↳”. A child with stock remains visible if the parent has no stock in the selected warehouse. Show category totals in pcs, never mixed with metres.
- **Roll detail:** show parent, root roll, direct children, total descendants and a breadcrumb-style path from root to current roll. Splitting must be legible as lineage, not as an average.
- **Image preview:** thumbnails are 34 px in tables but are buttons. Click/tap opens a centred full image in a modal; it must not submit a form or close an editor with unsaved changes. Escape, close button and backdrop close it. Use `zoom-in` cursor and visible focus ring. Available to manager, sales and operator wherever the image appears.
- **Supplier price book:** product/part lists show supplier names and the latest quote. “Harga” opens history + a new-quote form; the saved quote updates the IDR master buy price and is used as the PO default. Never hide the supplier behind a tooltip.
- **PO price list:** before saving a PO, show the selected supplier's latest prices with currency, IDR equivalent, MOQ and validity. “Tambah” copies a price into a new line.
- **Import FX:** when currency is CNY, show the latest CNY→IDR rate only as a reference. The rate field must start empty and the user must enter it; the rate actually saved is displayed on the PO detail with its timestamp/source. Never prefill a rate.
- **Optional modules:** WIP Production and Pesanan are off by default. Settings shows two plain checkboxes; when off, no navigation item, dashboard shortcut or report tab may remain. Direct routes redirect to the role home. Copy should say “opsional”, not “coming soon”.
- **Copy:** use “pesanan penjualan”, “bukan faktur”, “kurs terkunci”, “harga pemasok terbaru”. Never call a supplier quote a tax invoice or a payroll entry a bank transfer.

### 5.13 Invoice discount, tax invoice and surat jalan

- **Invoice form:** line prices must be prefilled from master data when a roll/part is selected; a blank price field is a defect. Discount has two explicit modes — fixed Rp and percent — and the computed total updates immediately. Never hide the discount label in print.
- **Invoice detail:** show the discount mode in the totals block (`Diskon (10%)` or `Diskon`). Use a real `<dl>` for the totals so screen readers understand `dt`/`dd`.
- **Faktur pajak card:** show DPP, PPN 11% and total including PPN as read-only values. Issuing is a single action with number and optional NPWP; no price inputs. Label NPWP “(opsional)” and explain that the customer NPWP is used automatically when present. After issuing show number, NPWP, issue time and a print action; print `-` when NPWP is blank. Use “bukan e-faktur resmi” in the demo note.
- **Surat jalan card:** show status, PIC pengiriman, driver/vehicle, address, receiver and a short history. Primary actions follow the state: Buat → Edit PIC/Kirim → Tandai tiba → Konfirmasi terima. Printing must not imply another stock movement.
- **Status labels:** `Dibuat`, `Dikirim`, `Tiba`, `Diterima & dikonfirmasi`. Do not use “selesai” until the receiver is confirmed.
- **No hidden stock event:** never show a second “keluarkan stok” action on the surat jalan. The invoice already issued the stock.

### 5.14 Simple and Advanced modes

- **Simple** is the default and should feel lighter: core nav only, no report/simulation items, no tax invoice or surat jalan cards, no import tabs, and no WIP/Pesanan. **Master Data stays available** for the manager because master updates are basic operation.
- **Advanced** adds the analytical and setup layers. Do not simply grey out hidden items; remove them from navigation and redirect direct URLs.
- **Switch placement:** manager sees a topbar chip `Mode Sederhana` / `Mode Lanjutan`; the same choice is in Settings → Preferensi. Non-managers see the current mode in the sidebar footer but cannot switch.
- **Copy:** explain that Simple is for daily operation and Advanced is for analysis/setup/documents. Never make the user guess why a screen disappeared.
- **Optional modules remain optional in Advanced:** WIP and Pesanan still need their own toggles.
- **Role + mode compose:** a route must pass both role permission and mode gate.

### 5.15 Print/PDF, drivers, couriers, mobile drawer

- **Print preview:** every printable item opens the same window with a top toolbar: **Cetak** and **Unduh PDF**. Do not auto-print, because it prevents using the PDF option. Hide the toolbar in print and when rasterising the PDF.
- **PDF:** generated from the document layout; show a progress label and a fallback instruction (“Cetak → Simpan sebagai PDF”) if the PDF library cannot load.
- **Customer NPWP:** label it optional in both create and edit forms; hint that it feeds faktur pajak. When filled, accept dotted 15-digit or 16-digit NIK/NPWP; keep the field blank-friendly and never block customer creation for a missing NPWP.
- **Driver master:** Master Data → Driver & armada. Show driver, account, phone and all linked internal vehicles (name + plate). Use multi-select on both sides: a driver may hold several vehicles and a vehicle may list several drivers. The first/default vehicle is only a prefill for surat jalan, never an exclusive lock. A driver without one is marked **Belum ditugaskan**. Inactive drivers do not appear in new surat jalan forms.
- **Surat jalan:** select any driver and any internal vehicle independently; autofill phone, type and plate from the chosen pair, but never overwrite an explicit driver/vehicle choice. PIC is a dropdown of active users grouped by role (manager, sales, operator, driver) and snapshots both name and role. Courier select: Internal, J&T, JNE, Lalamove, GoSend, SiCepat, AnterAja, Bali Kargo. The service list follows the courier (JNE = REG/YES/OKS) and is validated again server-side. Capture service, AWB/resi typed or read from a photo, tracking share link, recipient/phone, estimated arrival, weight, pieces, shipping, insurance, COD and instructions. Exactly one **Buat surat jalan** action; **Edit surat jalan** stays available while draft.
- **Courier-specific form:** internal shows the internal SJ number and a manual driver field, and hides resi/link/AWB. Online couriers (Grab/GoSend/Lalamove) show only the app share link. Logistics couriers (JNE/J&T/SiCepat/AnterAja/Bali Kargo) show only AWB/resi upload. Never show both link and AWB for one courier.
- **AWB photo scan:** offer file upload with a preview, a **Hapus foto resi** action and an inline status banner. Try `BarcodeDetector`, then ZXing, then Tesseract OCR; fill the resi field only when a candidate is found and always leave it editable. Extract the digit run from glued OCR text such as `541680005420019DESKRIPSI`. If decoding fails, say so plainly and never block saving the photo.
- **Driver and weekday:** every surat jalan print has a driver signature line; internal deliveries label it **Driver (internal)**. Display **Hari** (Indonesian weekday) instead of the raw date on cards, lists and print.
- **Tracking & arrival:** show the tracking link beside the courier; app-only couriers use the pasted share link, public couriers use their official page. Provide **Salin** so the courier + resi + URL can be pasted into WhatsApp. A delivered delivery shows a Pengiriman badge, an in-app notice and a **Notifikasi tiba** button; browser notifications are opt-in and fire on “Tiba”, never silently.
- **Address:** autocomplete from customer and previous delivery addresses; show an inline map preview and an external map link. Never hide the map behind a submit action.
- **Mobile sidebar:** `overflow-y: auto`, `overscroll-behavior: contain`, safe-area bottom padding. The drawer must scroll at 320/390 with Advanced mode; bottom nav must remain below the drawer.
- **Task flow:** create → Mulai → Selesai, note/proof optional; no stock movement.
- **Task tickets:** task detail and filtered queue print a ticket with Cetak/PDF; show print count and printed by/time. If online assignment is off, hide the assignee field/assign action, keep the manual Start/Finish updates, and print the worker name slot on the ticket.
- **Manual stock:** Stok has **Tambah stok manual** (and `#/stok?add=1`); choose fabric roll or part, warehouse, lot/length/cost or pcs, reason. This is the no-PO stock-in path.
- **Delivery schedule:** sales list shows date, driver/vehicle, courier, customer and status; the surat jalan form shows a same-day driver conflict notice.
- **Warehouses:** demo is Jakarta (JKT) and Bali (DPS) only. Do not label the Bali site Bandung/Surabaya.
- **Chinese suppliers:** Advanced purchasing shows Ningbo, Shaoxing, Yiwu and Guangzhou import suppliers; each uses CNY and a manually entered PO rate.

### 5.16 Driver role, buku sample, catalog, guide

- **Driver account:** show driver name/vehicle, only Ringkasan/Tugas/Pengiriman/Panduan in nav, no prices or master. Driver actions are Kirim and Tiba; receiver confirmation belongs to sales/manager.
- **Transport & courier master:** Lavishome Fleet is the internal transport; Lalamove, GoSend, Bali Kargo, J&T and JNE stay as third-party delivery options. Third parties are never shown as fleet assets.
- **Buku sample:** factory stock per collection, distribute one book to a customer. Do not offer in-app book assembly from roll cuts; show stock, price, refundable deposit and procurement history.
- **Catalog:** card grid with swatch, colour/code, width, sell price and availability; no cost/margin. Provide Cetak/PDF.
- **Guide:** accordion sections with numbered steps and links. Keep copy practical (“Buka → isi → simpan”), not marketing.

### 5.17 Internal fleet, consignment notes and production database

- **Armada internal:** a dedicated table with vehicle name/plate, linked drivers, capacity, tax expiry and active status. Only Lavishome Fleet vehicles appear; there is no ownership chip and no third-party vehicle. One **Kendaraan** action opens a compact modal with a multi-select of drivers. Linking a driver never removes them from another vehicle; the default driver is shown first.
- **Consignment surat jalan:** print as a courier note, not a plain letter. Header: Lavishome mark, courier brand wordmark, "SURAT JALAN / CONSIGNMENT NOTE", courier + service, document ID/date, large AWB/resi and a pseudo barcode. Two address blocks: sender (PT Lavishome Tekstil Nusantara, Jakarta/Bali warehouse, PIC) and recipient (name, phone, address). A meta grid carries invoice, weight/pieces, shipping/insurance, COD, transport/armada, driver/vehicle, tracking URL and status. Keep goods lines price-free; finish with PIC and receiver signature lines.
- **Surat jalan print formats:** offer a chooser. **A4 laser** renders three 88 mm-high copies on one sheet — ORIGINAL / PELANGGAN, SALINAN / BUKTI PENGIRIMAN (POD), SALINAN / ARSIP LOGISTIK — separated by dashed cut lines, each with its own signature block. **Dot matrix** renders a monochrome 9.5 × 11 in continuous form with `Courier New`, bordered boxes and all items. Never mix prices into either layout.
- **Delivery mode:** internal delivery shows independent driver and vehicle pickers; choosing either only prefills the other when it is still blank. Third-party delivery hides the internal fleet block, shows a courier note and an optional courier driver name, and stores no `fleetAssetId`. Snapshot vehicle and transport on the delivery; never rewrite existing documents when master data changes.
- **No price leakage:** the consignment note must never show unit prices, invoice subtotal or margin. It is a delivery document; the invoice already moved stock.
- **Database status:** the reference server is the only place PostgreSQL is used. In the UI, the demo remains browser-local. When documenting production, state which store is active (`storage: postgres` or `json`) and never imply the static demo shares data.

### 5.18 Buku sample stock, roll QR, WA share and price review

- **Buku sample stock:** show books per collection with photo, price, refundable deposit, minimum, warehouse, location and procurement history. Filter stock by Tersedia/Habis and distribution by Terkonversi/Belum konversi. Managers can edit qty/price/deposit/minimum/warehouse/photo. Buku sample pabrik adds stock from the factory; "Beri buku sample" decrements one piece. Thumbnails open full-size; photos are optional and removable.
- **Collection motif & pricing:** show motif and base motif price on the collection; each colour/SKU displays its independent sell price.
- **Roll tag & scan:** print a real QR code to `#/scan/:id`. Logged-out visitors see stock status, total cut, remaining metres and cut history; actions prompt login and retain the scanned URL. Keep the tag monochrome with collection, motif, colour, width, lot, length and warehouse/bin.
- **A4 tag sheet:** the tag dialog lists all rolls with a search field and checkboxes, plus bulk scopes (collection or all available), repeat copies and include-sold. Show a live summary: selected rolls × copies = tags and A4 pages. Print plain (no letterhead/signatures) at `@page A4 margin 8mm`, two columns × four rows, 62mm card height, page-break-inside avoid. The QR points at `#/scan/:id`.
- **Stock hierarchy:** default to a **collapsed collection list** containing only collections with available stock. Click collection → motif/colour → lot/roll. Show motif colour name/code, width, swatch, roll count and available metres. Keep the older tree/list views behind chips.
- **Stock analytics:** always show available roll count, collections with stock and active motif count. Add **Top koleksi** and **Top motif** bars ranked by available metres, not physical metres.
- **WA share:** multi-select collections and motifs. Empty motif selection means all motifs in the selected collections. Show combined rolls/metres and build the message from the selected scope. Default to the collection with the most available stock.
- **Resi actions:** copy-resi writes only the tracking number; copy-link is a separate action. Add **Cek resi** to open `cekresi.com/?noresi=...` as an independent third-party check. Automatic API polling needs a provider key/proxy.
- **QR tag footer:** print the public scan URL under the QR, plus manual **PIC cetak** and **Tanggal cetak**.
- **Customer import:** preview count and duplicates before import; normalize phones; skip duplicates by phone/name.
- **Invoice roll picker:** collection → motif/colour → roll in one row, then mode, metres and price. Whole roll is the default and the metres field is read-only. Cut mode is disabled while the roll has an active reservation. Show the roll's available metres in each option.
- **Delivery map & PIC:** customer profile shows a lazy Google Maps iframe of the delivery address, a Maps link, and the PIC penerimaan. The edit form exposes PIC as a first-class field.
- **Stock sorting:** one select in the filter bar controls collections, motifs, roll rows and mobile cards: most available metres (default), name A–Z, name Z–A. Sorting must not change the stock-only filter.
- **Cloud sync:** configuration is a compact form in Settings → Data with an explicit status badge and four actions (save/test, pull, push, off). The anon key is public; the workspace secret is a password field. Warn that the whole-document sync is last-write-wins.
- **Changelog:** one shared modal, reachable from the sidebar version button, Stock actions and Settings → Data. Newest release first, plain item lists, no nested tabs.
- **Two PTs:** the sidebar footer, login card and user table show the PT and job title. Customer lists are scoped to the logged-in PT; shared customers carry a cross-PT marker. Do not expose the other PT's private customer names in dropdowns or counts.
- **Internal sales:** Jakarta uses **Jual ke PT lain** in Penjualan. The modal shows only the internal buyer customer and source-PT rolls. Posting moves stock to the buyer warehouse; the buyer sees the same document under Pembelian → Pembelian internal and cannot post it.
- **Driver master:** driver records are name + phone + company vehicle. No driver login account. In surat jalan, internal fleet shows driver/vehicle; third-party hides those fields and writes the expedition note.
- **Sample requests:** each stock row shows **Minta sample** when it belongs to another PT. Pricing is a clear gratis/berbayar choice, always without deposit. The owning PT approves from the requests table, which shows the status history.
- **PO internal:** Bali starts the PO from Jakarta stock. Each row shows roll, available metres, mode and the internal price with the list price struck through. The summary shows list total, internal total and savings. Status is requested → shipped → received; Jakarta approves/ships and Bali confirms receipt.
- **Weight on surat jalan:** show a read-only estimate table before the address: roll, lot, qty and estimated kg per line, then total kg / rolls / lots. The weight field is prefilled but editable. Cut rows are lighter automatically.
- **Payments:** the modal starts with kind (deposit/installment/full), amount with thousand separators, method, transfer number, date, proof photo and note. Full locks the amount to the outstanding. Proof accepts a file or a pasted screenshot (Ctrl+V) with preview. The invoice payment table shows kind, reference, proof thumbnail and amount.
- **Payment ledger:** Sales → **Riwayat pembayaran** opens a wide, company-scoped list sorted newest first: payer, invoice, date/time, kind badge, method + transfer number + recorded-by, proof thumbnail, amount. Clicking a thumbnail opens the full screenshot.
- **A4 tag printing:** scope is per roll, per katalog, per motif/colour or all available. The motif select follows the chosen catalog. Sort options are katalog → motif → roll, motif → katalog → roll, roll, most metres and lot. Show the resulting roll/page count before printing.
- **Pembayaran page:** five compact stats (unpaid, partial, paid, outstanding, collected), status chips, sort select, invoice table with payer/date/total/paid/outstanding/last payment, then receipt history. Receipt edit keeps the original proof unless a new file is chosen; delete restores outstanding.
- **Excel stock sync:** manager-only. Show the plan source/date, SKU/roll/metre/sample counts, warehouse, lot, exclusions and the old-roll archive warning. Require a confirmation checkbox before applying. After sync, show a persistent **sudah disinkronkan** notice with counts and archived-roll count. Never delete old rolls; mark them void and keep invoice/movement references valid.
- **WA stock:** offer the action from customer detail and Stock. The message uses only available metres, colour, width and selling price. Provide “Salin pesan” and an explicit `wa.me` link; never send automatically.
- **Price review:** selling price is read-only in the product/part edit form. Use the dedicated price editor. Show last update and age; if ≥90 days, require an explicit checkbox before saving. Always show the change history.
- **Internal warehouse sale:** label transfers as internal sales and show ongkir plus ongkir per metre. Destination HPP includes the shipping allocation.
- **Surat jalan missing:** a posted invoice without a delivery note is an amber operational warning, not a hidden error.

### 5.19 Empty, loading, error

- Empty: icon, short title, one sentence, one action.
- Loading: skeleton blocks only for data-bound regions; no spinner on instant local renders.
- Error: plain-language message, what to do next, optional technical detail collapsed.
- The router has an error boundary with a reload action.

---

## 6. Responsive behaviour

| Width | Layout |
|-------|--------|
| ≥ 1180 px | 4-column KPI grid, two-column main/detail |
| 1020–1180 px | 2-column KPIs, sidebar still fixed |
| 820–1020 px | Sidebar becomes drawer; content full width |
| 701–820 px | 2-column filters; 44 px controls; tables still tables |
| ≤ 700 px | Mobile cards, single-column forms, bottom-sheet modals, full-width toasts |
| ≤ 380 px | Single-column KPI, tighter page padding |

Verified widths: **320, 390, 768 px and desktop**. At all three: page-level horizontal overflow = 0, inputs 16 px, touch targets ≥ 44 px. The login screen follows the same rule: brand panel collapses, card becomes full width, PIN input ≥ 16 px.

---

## 7. Motion

Motion explains change, never decorates a frequent task.

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Hover / colour | 120 ms | `ease` |
| Focus, small state | 120 ms | `ease` |
| Drawer | 260 ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Modal in | 260 ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Toast in | 260 ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Bar chart resize | 260 ms | `cubic-bezier(0.22, 1, 0.36, 1)` |

Rules:
- Animate **specific properties** (`opacity`, `transform`, `background-color`, `border-color`), never `transition: all`.
- No animation on data entry, filtering, or page transitions; warehouse operators repeat these hundreds of times.
- `prefers-reduced-motion: reduce` collapses durations to ~0 ms and disables smooth scrolling.
- Never animate layout-affecting properties in tables.

---

## 8. Accessibility

- Semantic landmarks: `<aside>`, `<header>`, `<main>`, `<nav>`, `<table>` with `<th>`.
- Skip link to `#main`.
- Visible focus ring (`0 0 0 3px rgba(77,122,120,.35)`), never removed.
- Modals: `role="dialog"`, `aria-modal="true"`, labelled by heading, focus trap, Esc.
- Mobile nav: `aria-expanded`, `aria-controls`, scrim, Esc.
- Status chips use text + colour; numeric columns have headers.
- Blind opname hides expected balances from the DOM, not only visually.
- Forms: label association, `aria-invalid`, inline error text, 16 px on phones.
- Icons are `aria-hidden`; icon-only controls have accessible names.
- Target sizes: 44 px minimum on touch (≤ 820 px), 40 px desktop.
- Reduced motion respected.
- Verified with Lighthouse: accessibility 100, best practices 100, SEO 100 on login, dashboard, tasks, production, stock hierarchy, purchasing, invoice detail with tax/delivery, sales-order detail, samples, master, settings and simulation.

Known gaps: no full screen-reader manual pass; no forced-colours/high-contrast theme yet; print documents are not tagged PDFs.

---

## 9. Copy and voice

Direct, polite, specific Indonesian. Prefer the operator's words.

| Instead of | Write |
|------------|-------|
| "Transaksi berhasil" | "Roll baru dicatat: RL-0013." |
| "Stok tidak cukup" | "Tersedia hanya 50 m pada RL-0001." |
| "Error" | "Panjang melebihi stok tersedia. Kurangi 2 m." |
| "Pending" | "Menunggu persetujuan manajer." |
| "Transfer berhasil" | "Barang dikirim ke transit. Gudang tujuan belum menerima." |

Rules:
- Say what changed, in which document, and what is still open.
- Use "Anda" sparingly; labels are usually enough.
- Never promise automatic accuracy; accuracy needs process and checks.
- Distinguish "diterima" (received) from "dikirim" (dispatched) and "dalam perjalanan" (in transit).

---

## 10. Do / don't

**Do**
- Show roll ID, colour code, lot, warehouse/bin before lengths.
- Keep physical, reserved, available, quarantine and transit as separate columns.
- Align numerals; use tabular figures.
- Put the primary action in one place.
- Confirm irreversible actions and state their scope.
- Let operators correct input with a reason and an audit trail.

**Don't**
- Merge rolls into an untraceable average.
- Show a single "stock" number without its definition.
- Colour a swatch from a numeric code.
- Add metres and pieces.
- Use copper for small body text.
- Add scroll-jacking, parallax, or decorative delays.
- Hide required permissions behind disabled buttons only.
