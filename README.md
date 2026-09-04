# alva-e2e

A **Playwright data-correctness test** suite for a live web dashboard (the target site is configured via `.env`, never hardcoded — see [Configuration](#running)).

The core goal is **not** UI / multi-device styling — it is **verifying whether the data on the page is actually correct**:
are the numbers computed right, are cross-table figures consistent, are there dirty values / leftover placeholders, are the enum values valid, is the data fresh.

The target site and page are configured via `.env` (`BASE_URL` / `PLAYBOOK_PATH`, required — see [Configuration](#running); no in-code defaults).

---

## What's inside

The suite patrols **financial data correctness** — not UI styling: are computed numbers right, do cross-table figures agree, are there dirty values / leftover placeholders, is the data fresh. A live page like this can be patrolled unattended on CI, and cross-checking the same metric across the financials table, comps table, and quote KPI catches fetch/consistency failures that no single side reveals on its own. This suite caught one for real: every company's EV and Market cap in the comps table renders as `$0.0` (see defect D-1 in docs/PART2).

| Artifact | Contents |
|---|---|
| [`tests/`](./tests) — 13 specs (7 `@data` + 4 `@ui` + 1 `@markets` + 1 `@smoke`, plus a `helpers/` extraction layer) | Production data-correctness patrol for the target dashboard page. Latest full run: **107 passed / 1 failed / 1 flaky** — the 1 failed is the by-design D-1 `$0.0` guard; the flaky (valuation TTM label) was root-caused and fixed since (see [`docs/PART2-data-correctness.md`](./docs/PART2-data-correctness.md) §5.2). |
| [`docs/PART2-data-correctness.md`](./docs/PART2-data-correctness.md) | Full data-correctness report: defect register (D-1 confirmed `$0.0` + guards D-2~D-6), coverage matrix, run evidence with fix history. |
| [`docs/PART1-onboarding.md`](./docs/PART1-onboarding.md) | Exploratory report of the login journey (sign up → create automation → receive alert): 9 findings (F-1~F-9) + logged-in test evidence (Appendix C). |
| [`evidence/`](./evidence) | Auto-captured defect screenshots (red-highlighted `$0.0` columns) committed with the repo. |

A complementary logged-in suite (onboarding/journey, requires SSO) runs locally only and is intentionally not committed to this repo; its exploration and findings live in [`docs/PART1-onboarding.md`](./docs/PART1-onboarding.md).

## Known limitations

- **Only one target page, one point in time.** This is a snapshot of a single ticker. Other pages (different sectors / data densities) may expose different rendering or fetch problems; and the page refreshes roughly every 4 hours, so structure drift cannot be ruled out.
- **Cross-checks are "internal consistency", not "against external truth".** Market cap ÷ P/S back-solving revenue, comps table vs financials table same caliber — all only self-verify **within** the page. If the backend were wrong on **all** data sources at once (e.g. FX rate, unit base), the suite would go all green yet still be wrong. Truly guarding against that needs an external ground-truth (e.g. SEC / quote API) for three-way comparison; this suite doesn't do that.
- **Rate limiting makes the run itself unstable.** The site clearly rate-limits high-frequency access (after a dozen consecutive runs the API intermittently returns empty data). `pnpm test` can occasionally fail just from not loading data, needing `--workers=1` serial retries. That means CI must tolerate flaky failures, or add warm-up / back-off, or it'll produce false reds.
- **The auth state is deliberately out of scope — a design trade-off that keeps the patrol unattended.** Sign-up, automation creation, and alert config/push are excluded because they need a real account (only public pages can be patrolled unattended). The complementary logged-in suite adds **skeleton-level** coverage of the login chain (route reachable, empty-state guidance, deep-link targeting, non-zero quote), but two things can't be automated: ① **the automation is an async LLM workflow** (builds over minutes) — one can only assert "the instruction entered the conversation", not "the final generated automation spec is correct"; ② **real alert triggering can't be verified** — it requires the underlying quote to actually cross the configured alert threshold, an uncontrolled wait. Both rely on manual walkthrough and are flagged explicitly in [`docs/PART1-onboarding.md`](./docs/PART1-onboarding.md) §6.
- **The `$0.0` red case is a "known-defect tracker", not a "new-bug detector".** It only asserts EV/market-cap ≠ 0. Once the defect is fixed this case goes green; but it won't proactively catch more subtle errors like "EV computed to a wrong number" (that needs value-level checks, beyond current scope).

---

## Running

### Prerequisites

- Node 22+, with network access to the target site (users in mainland China may need a proxy).
- This suite **hits the live site directly**; no local server needs to be started.

### Commands

Targets provided by the `Makefile`:

```bash
make install     # first time: pnpm install + install Chromium
make test        # run all tests (hits the target site directly, no local server needed)
make test-smoke  # run only @smoke smoke cases
make test-ui     # run in Playwright UI mode (visual — NOT "shell cases only")
make test-headed # run in headed browser mode
make debug       # run in debug mode
make report      # open the HTML test report
make codegen     # open the Playwright code generator
make typecheck   # TypeScript type check
make clean       # clean test-results / playwright-report
```

`package.json` scripts (finer-grained; recommended to use pnpm directly):

```bash
pnpm test                  # all
pnpm run test:data         # data-correctness cases only (--grep @data)
pnpm run test:ui-only      # shell/interaction cases only (--grep @ui)
pnpm run test:smoke        # @smoke smoke only
pnpm run test:ui           # Playwright UI mode
pnpm run test:headed       # headed mode
pnpm run test:debug        # debug mode
pnpm run report            # open HTML report
pnpm run typecheck         # TS type check
```

**The target site is configuration, not code**: `BASE_URL` and `PLAYBOOK_PATH` are required and have **no in-code default** — the suite fails fast at startup if they are unset. Set them in a local `.env` (copy [`.env.example`](./.env.example); loaded automatically via `dotenv`):

```bash
cp .env.example .env   # then edit as needed
```

Or prefix a single command with env vars:

```bash
BASE_URL=https://example.com PLAYBOOK_PATH=/u/xxx/yyy pnpm test
```

> Tip: the live site is slow and has occasional rate limiting. For a full run, `pnpm test -- --workers=1` serial is more stable.

### Run evidence

```bash
make install      # first time: install deps + Chromium
make test         # full run (hits the target site directly, no local server)
make report       # open the HTML report
```

- Latest full-run evidence for the current repo: see [`docs/PART2-data-correctness.md`](./docs/PART2-data-correctness.md) §5.2 — local full runs 2026-09-03: first **106 passed / 2 failed / 1 flaky** (markets over-assertion, calibrated at `4863cb4`), then **107 passed / 1 failed / 1 flaky** (1 failed = designed D-1 `$0.0` guard; the flaky = valuation TTM label populated last, root-caused and fixed at `84e6477` by gating the snapshot on it). Calibrated expectation: ~**108 passed / 1 failed (D-1) / 0 flaky**.
- Historical login-journey evidence from the exploratory phase (97 passed + 1 failed, the `$0.0` defect) remains in [`docs/PART1-onboarding.md`](./docs/PART1-onboarding.md) Appendix C; the SSO-required cases run locally only (gitignored `part1/`), so that log is kept as historical reference only.
- The full-suite run evidence is the list-style test report in `docs/PART1-onboarding.md` Appendix C (equivalent to CI logs).

---

## Page architecture under test (read before writing tests)

The page is a **shell + iframe** two-layer structure — the starting point for all selectors:

| Layer | Contents | Location method |
|---|---|---|
| Host page (SPA shell) | sidebar, page title, author block, right-side chat widget | directly `page.getByText(...)` |
| `<iframe title="Dashboard">` | the real content dashboard (company card, 7 tabs, KPI, financials, comps, risk, ratings, charts); src is a cross-origin, versioned URL (e.g. `.../v1.13.28`) | `dashboard(page)` helper (`page.frameLocator`) |

Two traps (especially deadly for data tests):

1. **Data fills in progressively**: the iframe skeleton renders first (placeholder `—` / `Loading…`), and metric labels and numbers may not be inserted into the DOM for 20~40s. Data assertions must wait explicitly (helper `DATA_TIMEOUT = 60s`); never assume elements are immediately visible.
2. **Content loading is occasionally unstable + rate-limited**: the site shows signs of rate limiting high-frequency access (after a dozen consecutive runs the API intermittently returns 200 but empty data). Hence in config `fullyParallel: false`, `workers` dropped to 1~2, and each spec uses `beforeAll` to **load the page only once and share one page**, avoiding N cases × independent loads hammering the site.

Two more site realities (hard-coded as comments in the tests):

- The whole site has **no semantic h1~h6 headings** (the title is `<span class="page-header-title">`). The company name is inside the iframe, inside a multi-line text node (h1 embeds a span) — `exact: true` will never match; you must use `role=heading` or substring matching.
- When not logged in, the console shows expected 401/403 (account APIs) and noise from blocked analytics scripts; `meta.spec.ts` only asserts no **uncaught** JS exceptions.

## Data extraction approach (key design)

Data testing is not "eyeball whether the numbers look right" — it is **extracting data into a structured object in the browser, then asserting with pure functions**:

```
tests/helpers/extract.ts   → in-browser extractor (page.evaluate),
                             pulling KPI / financials / comps / ratings / risk / timestamps
                             into a DashboardData structure
tests/helpers/parse.ts     → pure functions: parseMoney / parsePct / parseDate / findDirtyValues
tests/helpers/common.ts    → gotoPlaybook / dashboard / waitForDataReady / shared-page mechanism
```

Why this design:

- Much of the page's data is in the DOM but **not visible** (e.g. `textContent` can get Annual financials / Risk tables, but `innerText` stops at Price performance) — data tests must use `textContent` / `getAttribute`, not trust visibility alone.
- Separating "fetch" from "validate" lets assertions get very dense: cross-checks, range checks, enum validity, and sign consistency are all pure logic — fast to run, clear error messages.

## Test files

| File | Tag | Coverage |
|---|---|---|
| `smoke.spec.ts` | `@smoke` | page reachable + iframe content eventually renders |
| `shell.spec.ts` | `@ui` | shell: title, author, badge, description, sidebar nav |
| `tabs.spec.ts` | `@ui` | 7-tab bar + sub-tab count consistency (tabs are scroll anchors; data is in the DOM at once) |
| `chat.spec.ts` | `@ui` | chat: welcome message, suggestion cards, input is typeable (**does not send**) |
| `meta.spec.ts` | `@ui` | iframe src, meta description, no JS exceptions, a11y现状 |
| `data-integrity.spec.ts` | `@data` | **global dirty-value scan**, structure completeness, revenue-share legend sums to 100%, empty-table check |
| `market-data.spec.ts` | `@data` | quote KPI + **computable cross-checks** (52w drawdown = f(price, high); market cap = price × shares out) |
| `financials.spec.ts` | `@data` | financials column-order continuity, gross-margin range [0,100], EBITDA vs operating-profit business constraint |
| `comps.spec.ts` | `@data` | comps table + **cross-table check** (a comps row == the financials table, same caliber), **EV/market-cap ≠ $0** |
| `valuation.spec.ts` | `@data` | P/S back-solved revenue vs quarterly TTM cross-check, PEG口径, rating enum valid |
| `risk.spec.ts` | `@data` | risk-table enum validity (Neutral/Positive/Negative), signal date format |
| `freshness.spec.ts` | `@data` | reasonable refresh cadence per data source (quarterly financials vs real-time quote vs ratings) |
| `markets.spec.ts` | `@markets` | markets stock-page deep-link highlight, price ≠ $0.0, companion AI-chat area, resource route 200, F-8 bad-param fallback ×2 |

## Known data defects (reproducible with this suite)

- **Comps table EV / Market cap all `$0.0`**: every comp company (INTC / NVDA / QCOM / TSM / ARM, etc.) shows `$0.0` for EV and Market cap. The assertion "each company's EV / market cap ≠ $0" in `comps.spec.ts` currently **fails**, pinning this real bug.

## Discipline

- Tests are read-only: no clicking send, no login, no writing any data to the target site.
- Numeric assertions fall into two kinds:
  - **Format patterns** (price, change %, date, views) → only validate the format regex, never hard-code concrete values (page auto-refreshes every 4 hours).
  - **Computable cross-checks** (drawdown, market cap, P/S back-solved revenue, cross-table same口径) → compute on the fly from other fields on the page; don't depend on an external truth source.
- Before adding a case, run a probe script to confirm the real DOM and data shape; don't guess selectors from screenshots or hard-code values that will change.

---

## Docs index

- [`README.zh.md`](./README.zh.md) — Chinese version of this document.
- [`docs/PART1-onboarding.md`](./docs/PART1-onboarding.md) — login-journey exploratory report (F-1~F-9; logged-in cases: 8 SSO-required + markets UI merged into `tests/`) + run evidence (Appendix C: 97 passed + 1 failed, including the re-verification).
- [`tests/`](./tests) — data-correctness suite (13 specs: 7 `@data` + 4 `@ui` + 1 `@markets` + 1 `@smoke`, plus helpers extraction layer).
