# MiniFinance Visual Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the supplied visual refinement to the existing MiniFinance frontend without changing routes, API contracts, or business behavior.

**Architecture:** Keep the existing feature pages and API/query layer. Add small shared layout components for the logo, user menu, and month selector; keep month formatting in the existing format utility; apply design tokens through the global stylesheet and update existing route-level headings instead of duplicating titles inside feature pages.

**Tech Stack:** React, TypeScript, Tailwind CSS 4, local CSS, Vitest/Testing Library/MSW, Playwright.

**Spec:** `docs/a.md` section 4, amended by the user-provided design refinement task.

## Global Constraints

- Do not change functionality, routes, API contracts, or business logic.
- Do not add a brand color, gradients, decorative shadows, or radii above 8px, except the avatar.
- Keep `accent`, `ring`, `destructive`, `income`, `expense`, and `warning` unchanged unless a contrast check proves a specific pair fails.
- Use `income` and `expense` for cash-flow series and retain sign/label cues.
- Run frontend `typecheck`, `lint`, and `test:unit`; update affected E2E selectors; capture requested Playwright screenshots.
- Preserve unrelated pre-existing workspace changes and do not commit them.

## Review Focus

- Month navigation across December/January and February in leap and non-leap years.
- Zero-valued totals retain foreground text while nonzero totals carry the semantic color and sign cues.
- Cash-flow empty state does not render empty axes and retains an actionable link.
- The user menu exposes all three theme choices and logout with semantic controls.
- Mobile navigation remains available only below `md`; tablet rail and desktop do not show a menu button.

---

### Task 1: Shared period and logo presentation

**Files:**
- Create: `frontend/src/components/layout/logo-mark.tsx`
- Create: `frontend/src/components/layout/month-selector.tsx`
- Modify: `frontend/src/lib/format.ts`
- Test: `frontend/src/lib/format.test.ts`
- Test: `frontend/src/components/layout/month-selector.test.tsx`

**Interfaces:**
- Produces `formatMonth(value: string): string`, `shiftMonth(value: string, amount: number): string`, `LogoMark({ className?, size? })`, and an accessible month selector accepting `value` and `onChange`.

- [ ] Add tests for Portuguese month display, month rollover/leap-year-safe navigation, and accessible previous/next controls; run them and observe the expected failures.
- [ ] Implement the helpers and components with the specified SVG path and exact button labels/ARIA names.
- [ ] Run the focused tests, then the frontend unit suite.

### Task 2: Tokens, shell, identity, and user menu

**Files:**
- Modify: `frontend/src/styles/globals.css`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/layout.test.tsx`
- Modify: `frontend/public/favicon.svg`
- Modify: `frontend/index.html`
- Modify: `frontend/src/features/auth/auth-page.tsx`

**Interfaces:**
- Consumes the components produced by Task 1.
- Produces the specified desktop sidebar, tablet rail, mobile sheet/menu, left-aligned route header, and accessible user menu with theme options and logout.

- [ ] Add/adjust tests for the header label, menu open state, all theme choices, logout action, and viewport-dependent navigation; verify the assertions fail against the current shell.
- [ ] Implement the responsive shell, wordmark, favicon reference, and user menu; remove sidebar theme/logout controls and duplicated header content.
- [ ] Calculate WCAG contrast for actual text, icon, focus, and control-boundary pairs; adjust only failing token pairs and record the chosen values.
- [ ] Run focused tests and frontend unit suite.

### Task 3: Dashboard period, summary, and charts

**Files:**
- Modify: `frontend/src/features/dashboard/dashboard-page.tsx`
- Create: `frontend/src/features/dashboard/dashboard-page.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes `formatMonth`, `shiftMonth`, and the shared month selector from Task 1.
- Preserves all existing query endpoints and response shapes.

- [ ] Add MSW-backed component tests for the extended-month display, summary secondary lines and zero-value colors, semantic chart labels, direct month labels/year rollover, category palette, and zero-data state; verify expected failures.
- [ ] Implement the requested header period control, remove the duplicate page heading/support sentence, update summary details, align chart semantics with totals, and implement the empty chart action.
- [ ] Run focused tests and frontend unit suite.

### Task 4: Apply page hierarchy and period controls across features

**Files:**
- Modify: `frontend/src/shared/ui/resource.tsx`
- Modify: `frontend/src/features/accounts/accounts-page.tsx`
- Modify: `frontend/src/features/transactions/transactions-page.tsx`
- Modify: `frontend/src/features/categories/categories-page.tsx`
- Modify: `frontend/src/features/cards/cards-page.tsx`
- Modify: `frontend/src/features/budgets/budgets-page.tsx`
- Modify: `frontend/src/features/recurrences/recurrences-page.tsx`
- Modify: `frontend/src/features/goals/goals-page.tsx`
- Modify: `frontend/tests/e2e/finance.spec.ts`

**Interfaces:**
- Consumes the shared header and month selector from Tasks 1–2.
- Preserves feature actions, navigation destinations, and API request payloads.

- [ ] Update E2E semantic selectors first and add checks for no duplicate route titles, formatted month controls, mobile menu availability, and removed sidebar controls; run to observe expected failures.
- [ ] Remove redundant page titles/support copy; use the shared month selector for dashboard and other month-period controls; keep meaningful section headings.
- [ ] Scan feature components for hard-coded colors and replace any component-level color literals/fixed color classes with tokens.
- [ ] Run focused E2E and unit tests.

### Task 5: Documentation and visual verification

**Files:**
- Modify: `README.md`
- Modify: `docs/a.md`
- Create or update screenshot artifacts under: `frontend/test-results/design-review/`

- [ ] Update root README design documentation and `docs/a.md` token reference to match the shipped tokens, including any contrast-driven exception.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run test:unit` from `frontend/`.
- [ ] Use Playwright to capture Painel, Transações, Cartões, and Login at 375px, 768px, and 1280px in light and dark themes; inspect the output and report any visual or contrast issue.
- [ ] Apply the section 4.6 quality gate to the changed screens and record evidence and any limitation in the final response.
