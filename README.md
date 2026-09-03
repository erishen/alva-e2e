# alva-e2e

A **Playwright data-correctness test** suite for the public playbook pages on [alva.ai](https://alva.ai).

The core goal is **not** UI / multi-device styling — it is **verifying whether the data on the page is actually correct**:
are the numbers computed right, are cross-table figures consistent, are there dirty values / leftover placeholders, are the enum values valid, is the data fresh.

Default target (the AMD deep-dive report):

```
https://alva.ai/u/lake/playbooks/amd-deep-dive
```

---

## Submission notes (Alva · AI-Native QA take-home)

> This repo delivers **both parts** of the take-home. Suggested reading order:
>
> | Part | Artifact | Contents |
> |---|---|---|
> | **Part 2** (the body of this README) | `tests/` — 13 specs (7 `@data` + 4 `@ui` + 1 `@markets` + 1 `@smoke`, plus a `helpers/` extraction layer) | A **production financial-data巡检 (patrol)** suite for the published public Playbook (AMD Deep-Dive): **97 passed + 1 failed** (the 1 red is a real data defect it caught), matching the JD's core responsibility "production-quality patrol … financial data correctness" |
> | **Part 1** | [`PART1-onboarding.md`](./PART1-onboarding.md) | An **exploratory testing report** of the login journey "sign up → create Portfolio Watch Automation → create Playbook → receive Alert": 9 findings (F-1~F-9) + logged-in test cases, all green (onboarding/journey: 8, SSO-required; the markets stock-page UI suite is merged into the public `tests/` suite) |
>
> Run evidence is in [`PART1-onboarding.md`](./PART1-onboarding.md) (Appendix C). The three sections below follow the take-home requirements (Part 2 first, since it is the automated deliverable).

### 1. Why "Playbook data correctness" (and not another scenario)

The Part 1 journey is "sign up → create Portfolio Watch Automation → **create Playbook** → receive Alert", all behind auth. **The Playbook is the third step of that journey**, so testing "the data correctness of a published public Playbook (AMD Deep-Dive)" sits squarely inside the take-home's "pick any one Part 1 scenario" scope. I deliberately **did not** put the automation on the login journey itself, for these reasons:

- **Data bugs are the deepest bugs.** A reversed gain/loss sign, or a market cap off by one order of magnitude, is real money lost for an investing user — far worse than ten UI alignment nits. The JD singles out "financial data correctness" as a core responsibility precisely because of this.
- **Public pages can be patrolled unattended.** The login journey needs a real account + anti-bot + rate limiting on every run, so it doesn't suit routine regression. A public Playbook can run on a CI timer and genuinely serve as "production patrol".
- **It enables convincing cross-checks.** The same metric (AMD revenue, EBITDA, share price) appears once each in the financials table, the comps table, and the quote KPI — and they must all agree. Assertions like these catch real failures (inconsistent fetch口径 / unit-conversion errors / cache cross-wiring) that **no single side would reveal on its own**. This suite did catch one: in `comps.spec.ts`, the assertion "EV / Market cap should be real values" is **currently red**, because every company's EV and Market cap in the comps table render as `$0.0` (data not fetched, not actually zero).
- The login journey (Part 1) is not discarded — it is covered by a **complementary standalone logged-in suite** (requires auth, hence separated from this suite and not committed to this repo): 19 tests across onboarding / journey / markets specs, **all green**; the exploration and 9 findings are in [`PART1-onboarding.md`](./PART1-onboarding.md). Its markets spec is the **bridge between Part 1 and Part 2**: the markets stock page is both the alert landing page and the quote-data outlet, and its assertion "price looks like `$X.XX` and is non-zero" directly contrasts with Part 2's `$0.0` defect.

### 2. What the AI did in the workflow, and what I overrode / corrected

Almost all of this project's code was generated in conversation by an AI coding agent (WorkBuddy); I (the candidate) set direction, reviewed assertions, and corrected course. Key moments:

- **The agent first followed an old project template and focused on UI / multi-device styling** (tab switching, responsive viewports). I explicitly stopped it: "the point is testing data, not multi-device styling." The agent then flipped the whole focus to data correctness and dropped the mobile project.
- **The agent matched company names with `getByText(..., { exact: true })` and got wiped out inside the iframe** (the company name textContent is `Advanced Micro Devices\n AMD · NASDAQ`, so exact matching never hits). I had it switch to `role=heading` / substring matching and fixed every related assertion accordingly.
- **The agent's `first()` hit a hidden intro sentence** (in the Thesis panel, `first()` matched the hidden "…the AMD bull case…" instead of the visible heading). I had it add `filter({ visible: true })` to fix it.
- **The agent over-asserted one business assumption** ("EBITDA ≤ gross profit"). I pointed out that for foundries (e.g. TSM) depreciation hits COGS and lowers gross profit, so EBITDA rebounding above gross profit after add-back is normal accounting — the agent then tightened the hard bound to "EBITDA ≤ revenue".
- **The agent wrote the welcome-message regex with a straight apostrophe `'`**, while the site uses a curly apostrophe `’` (U+2019). I had it switch to an apostrophe-free feature phrase.
- **Dirty-value scan false positive** (an English word somewhere in the full text contains the substring `null`). I had it narrow the scan from "whole-page innerText" to "data cells" to kill the false positive.
- **I set the "load once, assert many" shared-page mechanism as the target**: the agent initially loaded the slow iframe independently per case — a full run took 38 min and tripped rate limits; after switching to a single shared page in `beforeAll`, the full run dropped to ~2.5 min with 97 cases passing.

### 3. Even all-green, what I still don't trust (what's not covered)

- **Only one Playbook, one point in time.** This is a snapshot of a single AMD ticker. Other Playbooks (different sectors / data densities) may expose different rendering or fetch problems; and the page refreshes roughly every 4 hours, so I can't guarantee the structure stays put after each refresh.
- **Cross-checks are "internal consistency", not "against external truth".** Market cap ÷ P/S back-solving revenue, comps table vs financials table same口径 — all only self-verify **within** the page. If Alva's backend were wrong on **all** data sources at once (e.g. FX rate, unit base), the suite would go all green yet still be wrong. Truly guarding against that needs an external ground-truth (e.g. SEC / quote API) for three-way comparison; this suite doesn't do that.
- **Rate limiting makes the run itself unstable.** The site clearly rate-limits high-frequency access (after a dozen consecutive runs the API intermittently returns empty data). `npm test` can occasionally fail just from not loading data, needing `--workers=1` serial retries. That means CI must tolerate flaky failures, or add warm-up / back-off, or it'll produce false reds.
- **This suite (Part 2) deliberately does not cover the auth state — a design trade-off, complemented by Part 1, but end-to-end is still weak.** Sign-up, Automation creation, and Alert config/push are excluded from this suite because they need a real account (only public pages can be patrolled unattended). Part 1's logged-in cases (onboarding/journey: 8) add **skeleton-level** coverage of the login chain (route reachable, empty-state guidance, deep-link targeting, non-zero quote), but two things I couldn't automate: ① **the automation is an async LLM workflow** (builds over minutes) — I can only assert "the instruction entered the conversation", not "the final generated automation spec is correct"; ② **real alert triggering can't be verified** — it requires AMD to actually fall from $457 through $100, an uncontrolled wait. Both currently rely on manual walkthrough and are flagged explicitly in `PART1-onboarding.md` §6.
- **The `$0.0` red case is a "known-defect tracker", not a "new-bug detector".** It only asserts EV/market-cap ≠ 0. Once the defect is fixed this case goes green; but it won't proactively catch more subtle errors like "EV computed to a wrong number" (that needs value-level checks, beyond current scope).

---

## Running

### Prerequisites

- Node 22+, with network access to `https://alva.ai` (users in mainland China may need a proxy).
- This suite **hits the live site directly**; no local server needs to be started.

### Commands

Targets provided by the `Makefile`:

```bash
make install     # first time: npm install + install Chromium
make test        # run all tests (hits alva.ai directly, no local server needed)
make test-smoke  # run only @smoke smoke cases
make test-ui     # run in Playwright UI mode (visual — NOT "shell cases only")
make test-headed # run in headed browser mode
make debug       # run in debug mode
make report      # open the HTML test report
make codegen     # open the Playwright code generator
make typecheck   # TypeScript type check
make clean       # clean test-results / playwright-report
```

`package.json` scripts (finer-grained; recommended to use npm directly):

```bash
npm test                  # all
npm run test:data         # data-correctness cases only (--grep @data)
npm run test:ui-only      # shell/interaction cases only (--grep @ui)
npm run test:smoke        # @smoke smoke only
npm run test:ui           # Playwright UI mode
npm run test:headed       # headed mode
npm run test:debug        # debug mode
npm run report            # open HTML report
npm run typecheck         # TS type check
```

Or override the target page with env vars:

```bash
BASE_URL=https://alva.ai PLAYBOOK_PATH=/u/xxx/playbooks/yyy npm test
```

> Configuration is also read from a local `.env` file (see [`.env.example`](./.env.example) for the full list). `playwright.config.ts` loads it via `dotenv`, so you can `cp .env.example .env` instead of prefixing every command with env vars.

> Tip: the live site is slow and has occasional rate limiting. For a full run, `npm test -- --workers=1` serial is more stable.

### Run evidence

```bash
make install      # first time: install deps + Chromium
make test         # full run (hits alva.ai directly, no local server)
make report       # open the HTML report
```

- Full run logs are in [`PART1-onboarding.md`](./PART1-onboarding.md) (Appendix C): **97 passed + 1 failed** (the 1 failed is the `$0.0` real data defect described above), finishing in ~2.6~3.0 min.
- This result was **independently re-verified twice** (re-run 5 hours apart, after a page-data snapshot refresh; `97 passed + 1 failed` was identical both times). That rules out the competing explanations "rate limiting / occasional load failure" and confirms a stable column-level fetch defect — see **Evidence C** in `PART1-onboarding.md` Appendix C.
- The deliverable is this repo; the run evidence is the list-style test report in `PART1-onboarding.md` Appendix C (equivalent to CI logs).

---

## Page architecture under test (read before writing tests)

The page is a **shell + iframe** two-layer structure — the starting point for all selectors:

| Layer | Contents | Location method |
|---|---|---|
| Main document (alva.ai) | sidebar, title "AMD Deep-Dive", author, README badge, right-side Alva chat | directly `page.getByText(...)` |
| `<iframe title="Dashboard">` | the real content dashboard (company card, 7 tabs, KPI, financials, comps, risk, ratings, charts); src points to `lake.playbook.alva.ai` with a version path (e.g. `v1.13.28`) | `dashboard(page)` helper (`page.frameLocator`) |

Two traps (especially deadly for data tests):

1. **Data fills in progressively**: the iframe skeleton renders first (placeholder `—` / `Loading…`), and metric labels and numbers may not be inserted into the DOM for 20~40s. Data assertions must wait explicitly (helper `DATA_TIMEOUT = 60s`); never assume elements are immediately visible.
2. **Content loading is occasionally unstable + rate-limited**: the site shows signs of rate limiting high-frequency access (after a dozen consecutive runs the API intermittently returns 200 but empty data). Hence in config `fullyParallel: false`, `workers` dropped to 1~2, and each spec uses `beforeAll` to **load the page only once and share one page**, avoiding N cases × independent loads hammering the site.

Two more site realities (hard-coded as comments in the tests):

- The whole site has **no semantic h1~h6 headings** (the title is `<span class="page-header-title">`). The company name is inside the iframe and its text is `Advanced Micro Devices\n AMD · NASDAQ` (h1 embeds a span) — `exact: true` will never match; you must use `role=heading` or substring matching.
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
| `comps.spec.ts` | `@data` | comps table + **cross-table check** (comps AMD row == financials same口径), **EV/market-cap ≠ $0** |
| `valuation.spec.ts` | `@data` | P/S back-solved revenue vs quarterly TTM cross-check, PEG口径, rating enum valid |
| `risk.spec.ts` | `@data` | risk-table enum validity (Neutral/Positive/Negative), signal date format |
| `freshness.spec.ts` | `@data` | reasonable refresh cadence per data source (quarterly financials vs real-time quote vs ratings) |
| `markets.spec.ts` | `@markets` | markets stock-page deep-link highlight, price ≠ $0.0, Alva Agent companion area, resource route 200, F-8 bad-param fallback ×2 |

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
- [`PART1-onboarding.md`](./PART1-onboarding.md) — Part 1 login-journey exploratory report (F-1~F-9; logged-in cases: 8 SSO-required + markets UI merged into `tests/`) + run evidence (Appendix C: 97 passed + 1 failed, including the re-verification).
- [`tests/`](./tests) — Part 2 data-correctness suite (13 specs: 7 `@data` + 4 `@ui` + 1 `@markets` + 1 `@smoke`, plus helpers extraction layer).
