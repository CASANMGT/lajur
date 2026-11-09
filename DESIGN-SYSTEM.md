# Design System — Lajur v2.11

**Source of truth:** `src/styles/tokens.css` and `src/styles/app.css`
**Brand reference:** *Lajur — Brand Platform v1.0, 07 Nov 2026*
**Line:** *Setiap roll, tercatat.*

---

## 1. Brand direction

Lajur is a **warm, corporate, structured** system for textile warehouse work — not a playful consumer app. It should feel like well-organised shelving: calm surfaces, precise numbers, clear labels, and a visible sense of physical material.

| Attribute | Expression |
|-----------|------------|
| Structured | Grid, hairlines, aligned numerals, compact metadata |
| Careful | Every quantity is labelled: physical, reserved, available, quarantine, transit |
| Warm | Ivory background, copper only as a material accent |
| Operational | Indonesian copy, roll IDs in mono, printable labels |
| Honest | "Transit" is never counted as warehouse stock; "available" is never guessed |

### Logo

Lowercase wordmark **lajur** with a folded-ribbon "L" mark. Clear space at least the height of the `l`; minimum 24 px mark / 96 px wordmark digital. Never stretch, rotate or add effects. Master vector still to be finalised by the brand owner; the demo uses a simplified SVG.

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
- **Faktur pajak card:** show DPP, PPN 11% and total including PPN as read-only values. Issuing is a single action with number/NPWP; no price inputs. After issuing show number, NPWP, issue time and a print action. Use “bukan e-faktur resmi” in the demo note.
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
- **Driver master:** Master Data → Driver & transport. Show driver, phone, vehicle type and plate. Vehicle types are Motor, Mobil, Truk. Inactive drivers do not appear in new surat jalan forms.
- **Surat jalan:** select driver from master; autofill phone, vehicle type and plate. Courier select: Internal, J&T, JNE, Lalamove, GoSend, SiCepat, AnterAja, Bali Kargo. Capture service, AWB/resi, recipient/phone, weight, pieces, shipping, insurance, COD and instructions for courier-style consignment notes.
- **Address:** autocomplete from customer and previous delivery addresses; show an inline map preview and an external map link. Never hide the map behind a submit action.
- **Mobile sidebar:** `overflow-y: auto`, `overscroll-behavior: contain`, safe-area bottom padding. The drawer must scroll at 320/390 with Advanced mode; bottom nav must remain below the drawer.
- **Task flow:** create → Mulai → Selesai, note/proof optional; no stock movement.
- **Task tickets:** task detail and filtered queue print a ticket with Cetak/PDF; show print count and printed by/time. If online assignment is off, hide the assignee field/assign action, keep the manual Start/Finish updates, and print the worker name slot on the ticket.
- **Manual stock:** Stok has **Tambah stok manual** (and `#/stok?add=1`); choose fabric roll or part, warehouse, lot/length/cost or pcs, reason. This is the no-PO stock-in path.
- **Delivery schedule:** sales list shows date, driver/vehicle, courier, customer and status; the surat jalan form shows a same-day driver conflict notice.
- **Warehouses:** demo is Jakarta (JKT) and Bali (DPS) only. Do not label the Bali site Bandung/Surabaya.
- **Chinese suppliers:** Advanced purchasing shows Ningbo, Shaoxing, Yiwu and Guangzhou import suppliers; each uses CNY and a manually entered PO rate.

### 5.16 Driver role, sample book, catalog, guide

- **Driver account:** show driver name/vehicle, only Ringkasan/Tugas/Pengiriman/Panduan in nav, no prices or master. Driver actions are Kirim and Tiba; receiver confirmation belongs to sales/manager.
- **Transport master:** driver rows show linked user account, transport company, vehicle and plate. Transport table is separate and editable; fleet assets link to both transport and driver.
- **Sample book:** create from multiple roll cuts, show item count/status, print/PDF. Use “Beri” with recipient and date; never show a second stock movement after giving the book.
- **Catalog:** card grid with swatch, colour/code, width, sell price and availability; no cost/margin. Provide Cetak/PDF.
- **Guide:** accordion sections with numbered steps and links. Keep copy practical (“Buka → isi → simpan”), not marketing.

### 5.17 Fleet assets, consignment notes and production database

- **Fleet assets:** a dedicated table under Driver & transport with asset name/plate, ownership chip (Internal teal / Pihak ketiga copper), linked transport, linked driver, capacity, tax expiry and active status. One **Aset** action opens a compact modal; duplicate plates show a plain-language error.
- **Consignment surat jalan:** print as a courier note, not a plain letter. Header: Lajur mark, “SURAT JALAN / CONSIGNMENT NOTE”, courier + service, document ID/date, large AWB/resi and a pseudo barcode. Two address blocks: sender (PT Lajur Tekstil Nusantara, Jakarta/Bali warehouse, PIC) and recipient (name, phone, address). A meta grid carries invoice, weight/pieces, shipping/insurance, COD, driver/vehicle and status. Keep goods lines price-free; finish with PIC and receiver signature lines.
- **No price leakage:** the consignment note must never show unit prices, invoice subtotal or margin. It is a delivery document; the invoice already moved stock.
- **Database status:** the reference server is the only place PostgreSQL is used. In the UI, the demo remains browser-local. When documenting production, state which store is active (`storage: postgres` or `json`) and never imply the static demo shares data.

### 5.18 Empty, loading, error

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
