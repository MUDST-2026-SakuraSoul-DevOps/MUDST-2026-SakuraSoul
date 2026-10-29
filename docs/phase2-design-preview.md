# SSK-177 — Phase 2 UI design preview

Local branch: `codex/SSK-177-phase2-design-preview`, based on `origin/dev` (`9f08690`).
Review URL: `http://localhost:5173/phase2-preview/payments`.
Run from `frontend`: `npm run dev -- --host 127.0.0.1`.

## Direction

Extend the existing Sakura Soul admin design without a redesign: the existing Manrope / Plus Jakarta Sans fonts, warm off-white surfaces, muted pink active navigation, mauve primary actions, restrained borders, familiar tables, and modest corner radii. Reuse theme tokens and shared PageHeader, buttons and DataTable. No new packages, external fonts, remote services or backend changes.

The user requested a concrete design for review before pushing. This is an in-memory UI prototype, available only in Vite development mode. It uses a separate preview shell so existing authenticated routes, API behavior, IndexedDB/local storage and user data stay intact. Production builds remove the preview route. No Figma writes, Jira updates or GitHub pushes are part of this change.

One direction is intentional: the user explicitly asked to stay within the current theme rather than explore different visual styles. UI/UX Pro Max guidance applied: labeled form controls, visible success/error feedback, review-before-import, native dialog focus handling, and time-series charts with a data-table alternative. A first chart search returned off-topic radar/map advice; it was discarded and a focused time-series search returned line-chart guidance. Recommendations do not override existing tokens.

## Coverage

| Jira | Preview location | Reviewable UI |
|---|---|---|
| SSK-160 | Units | Floor/room configuration and non-destructive layout explanation |
| SSK-161 | Documents | Shared file picker, type/size validation and in-memory viewer |
| SSK-162 | Units / Rate history | Time-effective rates, scheduling, old/new invoice examples |
| SSK-163 | Payments | Partial/full payment form, optional proof, payment ledger |
| SSK-164 | Payments / Billing settings | Prior balance, interest snapshot, configurable simple-interest illustration |
| SSK-165 | Units / Extra charges | Named one-time/monthly room-specific charges |
| SSK-166 | Utilities | Template download, CSV validation, review and import result |
| SSK-167 | Utilities | Water/electricity, room/floor, month/year filters and raw-data table |
| SSK-168 | Payments | Bank/QR configuration and invoice payment section |
| SSK-169 | Payments | Select invoices, print receipts only for actual received payments |
| SSK-170 | Reports | Unit/tenant/month grouping and filtered CSV export |
| SSK-171 | Maintenance | Stock levels, min/max, low-stock filter and restock flow |
| SSK-172 | Documents | Search, categorize and view contracts/reports/receipts |
| SSK-173 (bonus) | Maintenance / Forecast | Explainable service-cycle suggestions and draft-task action |
| SSK-174 (bonus) | Tenants | Local typo-tolerant search and labeled similar matches |
| SSK-175 (bonus) | Documents / Upload | Clearly simulated OCR extraction and manual-review fields |
| SSK-176 (bonus) | Access & Roles | Role assignments, permission matrix and read-only role preview |

## Limits and decisions still needed

- Refresh or leaving a screen resets its sample changes. Screens use independent sample datasets; edits are not a complete cross-module data model.
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

- Frontend tests: 47 files / 746 tests passed, including nine focused CSV boundary / name matching cases.
- ESLint: passed with no warnings after separating non-component helpers.
- Production build: passed; preview module is absent from production JavaScript. Vite retains the existing app bundle-size warning (>500 kB).
- Browser: partial payment 1,000 reduces 4,320 to 3,320; sample CSV reaches review and completion; scheduled rate appears alongside unchanged historical invoice illustrations; low-stock restock removes the replenished item from the low-stock filter; `krant` finds Kant; accountant role disables permission editing; sample document opens; bulk preview contains two separate payment receipts.
- Responsive: 375px viewport, 30px mobile heading, no document-level horizontal overflow. Tables intentionally scroll within their own container.
- Browser errors/warnings: none in the QA tab. Actual printer output, local OCR, server persistence and backend authorization have not been verified or implemented by this design preview.
