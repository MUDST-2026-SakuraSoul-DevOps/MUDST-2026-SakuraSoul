# SSK-177 — Phase 2 UI design preview

Local branch: `codex/SSK-177-phase2-design-preview`, based on `origin/dev` (`9f08690`).
Review URL: `http://localhost:5173/phase2-preview/payments`.
Run from `frontend`: `npm run dev -- --host 127.0.0.1`.

## Direction

Extend the existing Sakura Soul admin design without a redesign: the existing Manrope / Plus Jakarta Sans fonts, warm off-white surfaces, muted pink active navigation, mauve primary actions, restrained borders, familiar tables, and modest corner radii. Reuse theme tokens and shared PageHeader, buttons and DataTable. No new packages, external fonts, remote services or backend changes.

The user requested a concrete design for review before pushing. This is an in-memory UI prototype, available only in Vite development mode. It uses a separate preview shell so existing authenticated routes, API behavior, IndexedDB/local storage and user data stay intact. Production builds remove the preview route. No Figma writes, Jira updates or GitHub pushes are part of this change.

## Phase 1 continuity

The sidebar uses the seven original Figma navigation items and icons from `frontend/src/layouts/nav.ts`: Dashboard, Units, Tenants, Payments, Maintenance, Contracts, Appliances. Settings remains in the sidebar profile link. Phase 2 capabilities are grouped inside their owning module rather than added as parallel main menus.

- Dashboard (`/phase2-preview/dashboard`) shows 24 sample room cards, occupancy/floor/search filters and room-specific links to rates, contracts and payments.
- Contracts (`/phase2-preview/contracts`) manages preview agreements, validates overlapping periods and links to scans in its Contract documents view. Documents are attachments; they do not replace lease management.
- Appliance Rental (`/phase2-preview/appliances`) provides rental requests and a catalog, using the existing appliance types, stock rules and catalog dialog. Rental fees are captured separately from deposits.
- Payments → Next invoice draft reads shared rental requests and contracts. Active rentals appear as individual lines using the agreed rental fee; Pending/Returned and future-starting rentals are excluded. This is a future, full-month charge illustration, not an issued invoice. Existing invoice snapshots never change when a rental is edited.
- Contract, document, catalog and rental state is shared across preview navigation. The restored screens demonstrate the relevant flows; the original production Phase 1 pages and their backend integration are untouched.

One direction is intentional: the user explicitly asked to stay within the current theme rather than explore different visual styles. UI/UX Pro Max guidance applied: labeled form controls, visible success/error feedback, review-before-import, native dialog focus handling, and time-series charts with a data-table alternative. A first chart search returned off-topic radar/map advice; it was discarded and a focused time-series search returned line-chart guidance. Recommendations do not override existing tokens.

## Final navigation structure

| Main menu | Views and responsibilities |
|---|---|
| Dashboard | Room availability and links to the related work |
| Units | All units, Rate history, Extra charges, Water & Electricity (CSV + graphs) |
| Tenants | Tenant directory and similar-name search |
| Payments | Invoices, Payment history, Summary reports (group by unit/tenant/month), Receipts & slips |
| Maintenance | Maintenance Tasks, Supplies & Inventory, Schedule & Reminder (including forecast), Maintenance Log, Documents |
| Contracts | Lease agreements and Contract documents (including the OCR review flow) |
| Appliances | Rental requests and Appliance catalog; fees flow to a future invoice draft |
| Sidebar profile | My Profile and Team & Access |

The first seven items reproduce the original Figma navigation vocabulary. Utilities and financial reports are views of Units and Payments. Files are kept in one shared in-memory collection and retrieved through the relevant owner; contract, maintenance and payment views do not mix their document types. Active subviews have shareable URLs and breadcrumbs. Old `/utilities`, `/reports`, `/documents?type=...` and `/permissions` links redirect without losing the room or upload context. Subview segments remain equal width, with compact labels on small screens where needed.

## Coverage

| Jira | Preview location | Reviewable UI |
|---|---|---|
| SSK-160 | Units | Floor/room configuration and non-destructive layout explanation |
| SSK-161 | Documents views inside Contracts / Maintenance / Payments | Shared file picker, type/size validation and in-memory viewer |
| SSK-162 | Units / Rate history | Time-effective rates, scheduling, old/new invoice examples |
| SSK-163 | Payments | Partial/full payment form, optional proof, payment ledger |
| SSK-164 | Payments / Billing settings | Prior balance, interest snapshot, configurable simple-interest illustration |
| SSK-165 | Units / Extra charges | Named one-time/monthly room-specific charges |
| SSK-166 | Units / Water & Electricity | Template download, CSV validation, review and import result |
| SSK-167 | Units / Water & Electricity | Water/electricity, room/floor, month/year filters and raw-data table |
| SSK-168 | Payments | Bank/QR configuration and invoice payment section |
| SSK-169 | Payments | Select invoices, print receipts only for actual received payments |
| SSK-170 | Payments / Summary reports | Unit/tenant/month grouping and filtered CSV export |
| SSK-171 | Maintenance / Supplies & Inventory | Stock levels, min/max, low-stock filter and restock flow |
| SSK-172 | Contracts / Contract documents; Maintenance / Documents; Payments / Receipts & slips | Search, categorize and view contracts/reports/receipts |
| SSK-173 (bonus) | Maintenance / Schedule & Reminder | Explainable service-cycle suggestions and draft-task action |
| SSK-174 (bonus) | Tenants | Local typo-tolerant search and labeled similar matches |
| SSK-175 (bonus) | Contracts / Contract documents / Upload | Clearly simulated OCR extraction and manual-review fields |
| SSK-176 (bonus) | Profile Settings / Team & Access | Role assignments, permission matrix and read-only role preview |

## Limits and decisions still needed

- Profile Settings opens from the sidebar profile link, with equal-width My Profile and Team & Access tabs. Access & Roles is no longer a main navigation item. The old `/phase2-preview/permissions` URL redirects to `/phase2-preview/settings?tab=team`.

- Refresh or Reset clears sample changes. Shared contracts/documents/rentals/catalog survive navigation; other screen-local changes reset when leaving that screen. Financial reports, issued invoice samples, utility readings and rate-history illustrations remain separate datasets; this is not a complete cross-module data model.
- No real payment processing, document storage, bank QR generation, OCR engine, backend RBAC or invoice generation. Selected QR/proof filenames demonstrate placement only.
- CSV template uses monthly consumption, not cumulative readings. The review dataset is limited to rooms 101/102/201/202 and 2026. Import replaces matching preview readings, never issued invoices.
- Rate scheduling currently stores rent/date/note in memory; utility rate fields show the proposed form only. The old/new invoice comparison is a static illustration.
- Interest illustration assumes simple monthly interest on principal. Proration, grace periods, rounding, adjustments and allocation order require a business decision before production implementation.
- Report closing balances cannot be summed across months; they represent period snapshots. Collections and charges are distinct from balances.
- Fuzzy search is a bounded local edit-distance example. Forecast is a service-interval illustration, not a trained model.
- A preview is not evidence that SSK-160–176 are implemented or ready to mark Done. SSK-178 QA and SSK-179 release remain later work.

## Review checks

Check every sidebar destination; schedule a rate; add a charge; record a partial payment and inspect its remaining balance; select receipts for print preview; import a valid CSV and reject a duplicate row; switch chart units and period; filter/export a report; restock a low item; search `kart` and `krant`; view a sample document; switch role preview to confirm configuration becomes read-only.

## Verification performed

- Frontend tests: 49 files / 757 tests passed, including nine focused CSV boundary / name matching cases.
- ESLint: passed with no warnings after separating non-component helpers.
- Production build: passed; preview module is absent from production JavaScript. Vite retains the existing app bundle-size warning (>500 kB).
- Browser: partial payment 1,000 reduces 4,320 to 3,320; sample CSV reaches review and completion; scheduled rate appears alongside unchanged historical invoice illustrations; low-stock restock removes the replenished item from the low-stock filter; `krant` finds Kant; accountant role disables permission editing; sample document opens; bulk preview contains two separate payment receipts.
- Responsive: 375px viewport, 30px mobile heading, no document-level horizontal overflow. Tables intentionally scroll within their own container.
- Browser errors/warnings: none in the QA tab. Actual printer output, local OCR, server persistence and backend authorization have not been verified or implemented by this design preview.

### Phase 1 continuity checks

- The appliance-domain and preview data-boundary checks remain green within the full frontend suite.
- Dashboard → unit 101 → Contracts → attached files selects the correct room and Contract category.
- Overlapping contract creation is rejected; a new future agreement for room 103 appears as Upcoming.
- Unit 101 December draft shows appliance rent 300 separately and current charges subtotal 5,600; the security deposit is not a monthly charge.
- Unit 201 Pending request initially has no rental line. After approval, its December draft shows rental 450 and subtotal 6,050; its issued November invoice remains 5,610.
- The restored Dashboard, Contracts and Appliance Rental pages were inspected at a 375px viewport: equal-width tab segments, no document-level horizontal overflow and an accessible sidebar profile link. QA browser logs contain no errors or warnings.

### Navigation consolidation checks

- Seven original main-menu entries, with one active category and one active subview.
- CSV/import/chart controls remain reachable in Units; report grouping and export remain reachable in Payments.
- Receipt, contract and maintenance file views show only the matching document category.
- Contract → Attach scan opens the upload form inside Contract documents with the room retained.
- Completing a maintenance task moves it into Maintenance Log; inventory and the recurring-service calendar remain separate views.
- Legacy report and utility links redirect to the canonical module URLs. Navigation/data-boundary focused tests: 20 passed.
- Units, Payments, Maintenance and Contracts subnavigation was inspected at 375px: equal-sized segments, no document-level overflow and one active segment.
