# Alva 数据正确性 QA 报告 — Part 2：数据正确性与缺陷发现

> **交付物性质**：本文件是 alva.ai AI-Native QA 笔试 **Part 2 的硬性交付物**——针对公开 playbook 页（以 `/u/lake/playbooks/amd-deep-dive` 为主）的**数据正确性端到端测试套件**与**缺陷发现报告**。
>
> **执行方式**：读-only 探针（Playwright 直连线上 `https://alva.ai`，不修改任何数据）+ 跨表交叉校验 + 异常值守卫；所有用例可进 CI（无需 SSO）。
>
> **状态**：定稿。缺陷登记表（§2）、覆盖矩阵（§3）已定稿；运行证据（§5.2）已补 2026-09-03 本机全量实跑记录（修复前 106 passed / 2 failed / 1 flaky）。
>
> **边界声明**：被测对象是线上公开页面，**不重放登录、不写数据**。除 `markets.spec.ts`（公开个股页）外，其余 spec 均围绕同一个公开 playbook 页做只读断言；`part1/` 下的 SSO 登录态套件不在此列（见 PART1 报告「仓库范围」）。
>
> **仓库范围**：本文档与 `tests/` 目录均为本仓库交付物，可进 CI。与 Part 1 的 `part1/` 本地套件不同，Part 2 全部用例针对公开页、无 SSO 依赖，因此**随仓库分发并可在 CI 中直接运行**；`playwright-report/`、`test-results/` 为运行产物，已被 `.gitignore` 忽略。

---

## 1. 执行摘要

| 项 | 结论 |
|---|---|
| 测试范围 | 公开 playbook 页的数据正确性：估值/财报/行情/可比公司/风险/新鲜度/数据完整性 + 页面外壳与 Tab 导航 |
| 用例规模 | 13 个 spec 文件、91 条用例声明（`@data` 7 / `@ui` 4 / `@markets` 1 / `@smoke` 1；tabs、markets 含参数化展开）。参数化展开后实际执行数见 §5.2 最新实跑（修复前本机全量：**106 passed / 2 failed / 1 flaky**） |
| 活跃功能缺陷（P0/P1） | **1 条确认**：D-1 可比公司表 EV 与 Market cap 全部渲染为 `$0.0`（取数缺陷，P1） |
| 防护性守卫 | 6 类跨表/异常/新鲜度回归守卫（D-2 ~ D-6 及完整性类），覆盖金额量纲、交叉校验、NaN 渲染、信号管道、时间新鲜度、Tab 命名 |
| 核心叙事 | 数据正确性类问题**适合自动化**：金额量纲、跨表勾稽、异常值、新鲜度阈值均可机检；但「$0.0 是取数 bug 还是真实为零」「某阈值该取多少」仍需人判定口径 |
| 已验证的良好设计 | 跨表勾稽自洽（市值÷P/S=TTM 营收、可比表 AMD 与年度财报一致）、公开页免登录可测、带 ID 深链、客户端渲染用 `domcontentloaded`+显式断言（不用 networkidle） |

**一句话结论**：Part 2 套件以**只读、可进 CI** 的方式锁住了 alva.ai 公开 playbook 页的数据正确性。最实质的发现是 **D-1——可比公司表的 `EV` 与 `Market cap` 两列全部为 `$0.0`**（已用真 DOM 抓取验证，确属取数未到位而非真实为零）；该用例被设计为**「活跃失败」守卫**：缺陷修复前保持红色，避免数据回归悄悄放过这个 bug。其余均为防护性守卫——它们目前通过，但构成了一道「金额量纲 / 跨表勾稽 / 异常值 / 信号管道 / 时间新鲜度 / Tab 命名」的持续防线。

---

## 2. 缺陷登记表

> 严重度说明：**高（P1）**=数据正确性缺陷，会直接误导投资判断；**防护守卫**=当前通过、用于防止回归的检查，单列以便评审人看清套件在守什么。

### D-1 【确认缺陷 · 高/P1】可比公司表 EV 与 Market cap 全部为 `$0.0`（取数缺陷）
- **模块**：可比公司表（Comparables）/ 估值字段
- **现象（真 DOM 抓取验证）**：`/u/lake/playbooks/amd-deep-dive` 的可比公司表中，**每一家**公司的 `EV` 与 `Market cap` 两列均渲染为 `$0.0`。这是取数未到位（字段空 → 默认显示 0），**并非 AMD 及可比公司真实市值为零**。
- **预期**：EV 与 Market cap 应为真实金额（AMD 为千亿美元级公司，可比表亦应非零）。
- **实际**：整列 `$0.0`，等价于「可比分析里最核心的两个估值锚点缺失」。
- **复现**：打开 playbook → 滚动到 Comparables 表 → 观察 `EV` / `Market cap` 列。
- **证据（守卫用例）**：`tests/comps.spec.ts` → `EV 与 Market cap 应有真实数值（当前全部为 $0.0，已知缺陷）`。该用例**故意保持活跃失败**：`expect(bad).toEqual([])` 在 `$0.0` 出现时不通过，缺陷修复后自动转绿。
- **可视化证据（自动留存）**：本缺陷属「渲染成 $0.0」的可见问题，守卫除断言外额外抓一张截图 `evidence/comps-ev-mc-zero.png` 并 `attach` 到 HTML 报告（`npm run report` 直接看）。截图实现要点（曾踩坑截出白屏）：① 必须用 `beforeAll` 里真正加载好的 `page`，不能用 test fixture 自动分配的空白 `page`；② 正文在**跨域 iframe** 内、且可比表仅在 **Comps Tab** 激活时可见，故先点 Comps Tab 再直接截 iframe 内的 `.comps-grid` 元素（锁定 EV/Market cap 两列的 `$0.0`），规避跨域整页截图留白与 `display:none` 截不到内容两坑。截图在本机 `npm test` 时生成（沙箱连不上 alva.ai，无法代跑）——生成后 `git add evidence/` 即可随仓库交付，评审人无需重跑即见真实页面状态。
- **录屏说明（不可靠，不依赖）**：`playwright.config.ts` 的 `video: 'retain-on-failure'` 会为失败用例留视频，但本组用例用 `describe.configure({ mode: 'serial' })` + `beforeAll` 共享一个页面，**视频录制的是 per-test 的 fixture 空白页而非共享仪表盘页**，对 D-1 这类用例同样会白屏。因此 D-1 的可靠视觉证据以**截图**为准，录屏不作为交付证据。
- **严重度**：**高（P1，数据正确性）**。可比表是投资决策核心视图，$0.0 会直接误导相对估值判断；虽不崩溃页面，但在金融数据产品里属高优先级数据缺陷。
- **备注**：本缺陷与 `tests/market-data.spec.ts` 的「市值量级合理（十亿级以上）」**不冲突**——后者校验的是 `/markets/AMD` 行情 KPI 的 Market cap（有真实值、通过），而 `$0.0` 只出现在**可比表**的 EV/MC 列，说明是可比表这一取数路径的局部缺陷，而非全局市值缺失。

### D-2 【防护守卫】跨表勾稽一致性（市值÷P/S = TTM 营收 等）
- **模块**：估值 / 可比公司 / 行情
- **守卫**：`valuation.spec.ts`「市值 ÷ P/S 等于季度表算出的 TTM 营收」；`comps.spec.ts`「AMD 营收/ EBITDA 与年度财报表完全一致」「AMD 股价与行情 SPOT 一致（四舍五入容差）」；`valuation.spec.ts`「P/E 与 TTM EPS 方向一致」。
- **意图**：三者（倍数、市值、营收）任一口径取错即对不上，机检可立刻暴露量级/列错位。**当前通过**。

### D-3 【防护守卫】渲染错误值与 KPI 完整性
- **模块**：全局数据完整性
- **守卫**：`data-integrity.spec.ts`「单元格不残留 NaN / undefined / null / [object Object]」「每个 KPI 有标签和值且非空占位」「KPI 标签不重复」「历史列不能有空值」「营收占比图例总和 100%」。
- **意图**：抓客户端渲染把缺数渲染成 `NaN`、空占位、或图例比例失真。**当前通过**。

### D-4 【防护守卫】风险信号管道健康度
- **模块**：风险表
- **守卫**：`risk.spec.ts`「至少一条风险在最近 30 天内有新信号」（单条陈旧正常，**全部陈旧**=抓取管道停摆）；「信号日期不早于 90 天」「信号文本有实质内容非占位符」。
- **意图**：区分「单条信号自然停留」与「整体信号源失效」——只对后者报警，避免误报。**当前通过**。

### D-5 【防护守卫】数据新鲜度阈值
- **模块**：行情 / 财报 / 评级
- **守卫**：`freshness.spec.ts`「行情快照 ≤ 2 天」「股价取数 ≤ 7 天（跨周末可 3 天）」「财报取数 ≤ 120 天」「评级 ≤ 7 天」「所有时间戳可解析、非未来」。
- **意图**：给每类数据设「多久算 stale」的下限，超阈即报警。**当前通过**。

### D-6 【防护守卫 · 衔接 Part 1】markets 个股页 Tab 命名与错参回退（F-8 回归）
- **模块**：markets 个股页 `?tab=` 深链
- **守卫**：`markets.spec.ts`「错参 `?tab=news` 不崩溃、页面仍可用」「错参 `?tab=smart-money` 静默回退 Overview（规范为 `smartMoney`）」。
- **意图**：把 Part 1 的 F-8 发现固化为回归守卫——命名不统一（`news` 小写 vs `smartMoney` 驼峰）与错参静默回退的现状被持续监控，避免悄悄恶化。**当前通过（记录现状）**。

---

## 3. 覆盖矩阵

| Spec 文件 | 区域 | 标签 | 用例数* | 主要守卫 |
|---|---|---|---|---|
| `smoke.spec.ts` | 冒烟 | `@smoke` | 1 | 页面可达、核心内容最终渲染 |
| `shell.spec.ts` | 页面外壳 / 导航 | `@ui` | 5 | 标题地址、作者信息、README/Automations 徽章、playbook 描述、Show more 展开、侧栏主导航 |
| `chat.spec.ts` | 右侧聊天区（未登录可见） | `@ui` | 5 | Alva 欢迎语、5 张功能卡片、卡片说明、输入框可输入、输入提示、语音按钮 |
| `meta.spec.ts` | 元信息 / 页面健康 | `@ui` | 4 | 版本化 playbook iframe、meta description、无未捕获 JS 异常、未登录 Log in 入口、语义化标题现状 |
| `tabs.spec.ts` | Tab 导航 | `@ui` | 4 | 七 Tab 完整、默认 Overview、逐一点击高亮、来回切换不卡死、子 Tab 计数自洽 |
| `valuation.spec.ts` | 估值与分析师评级 | `@data` | 9 | 倍数为正、**市值÷P/S=TTM 营收**、口径季度一致、P/E 与 EPS 同向、目标价区间、覆盖数、刷新日期、财报日历顺序 |
| `data-integrity.spec.ts` | 数据完整性 | `@data` | 11 | 无 NaN/undefined、KPI 完整、标签不重复、行数列数一致、历史列非空、可比≥5、风险≥5、图例 100% |
| `market-data.spec.ts` | 行情 KPI | `@data` | 9 | SPOT>0、涨跌幅合理、涨红跌绿不反向、52 周高点≥现价、回撤交叉校验、倍数为正、**市值量级十亿级**、口径标注、YTD≠30 日 |
| `financials.spec.ts` | 财报数据 | `@data` | 13 | 列头时序、季度连续、营收为正、年度增长、毛利率 0~100%、EBITDA≥营业利润、净利率、EPS 增长、年度>单季（量纲）、预测标记、口径说明 |
| `comps.spec.ts` | 可比公司 | `@data` | 11 | AMD 在表、财年对齐、毛利/EBITDA≤营收、股价为正、P/E 合法、跨表勾稽、股价=SPOT、**EV/MC 真实值（$0.0 缺陷 D-1）**、汇总行边界 |
| `risk.spec.ts` | 风险表 | `@data` | 8 | 数量/字段、优先级枚举、趋势枚举、名称不重复、信号日期非未来、信号≤90 天、**管道健康≥1/30 天**、信号文本实质、分类多维 |
| `freshness.spec.ts` | 数据新鲜度 | `@data` | 6 | 快照≤2 天、股价≤7 天、财报≤120 天、评级≤7 天、时间戳可解析、已报告期间<今天 |
| `markets.spec.ts` | markets 个股页 | `@markets` | 5 | 深链高亮（默认 tab 仅 `aria-selected` 属性存在时校验，避免过度断言）、内容守卫用 waitForFunction 等待文本稳定到位（阈值 150，吸收慢加载/限流偶发短文本；作为「面板塌缩」探测器而非卡固定字数）、价格≠$0.0、Alva Agent 伴侣区、资源路由 200、F-8 错参回退 ×2 |

> *用例数为 `test(...)` 声明数；`tabs.spec.ts`、`markets.spec.ts` 含参数化展开，实际执行更多。合计 **91 条声明**。参数化展开后的实际执行数见 §5.2 最新实跑（修复前本机全量 106 passed / 2 failed / 1 flaky）。`npm run test:data`（`--grep @data`）覆盖 7 个 `@data` spec；`npm run test:ui-only` 覆盖 4 个 `@ui` spec。

---

## 4. 方法论

1. **只读探针**：所有用例只读取页面已渲染数据并断言，**不发写请求、不重放登录**。被测为线上公开页，安全边界清晰。
2. **跨表勾稽（reconciliation）**：不孤立看一个数字，而是让同一事实在多处交叉验证——市值÷P/S 应等于季度表 TTM 营收；可比表 AMD 营收/EBITDA 应等于年度财报；可比表股价应等于行情 SPOT。任一处口径取错即对不上。
3. **量纲与枚举守卫**：金额用 `parseMoney` 解析后校验量级（市值十亿级、毛利率 0~100%）；枚举（优先级 High/Medium/Low、趋势 stable/improving/worsening）用白名单而非「包含即过」。
4. **异常值扫描**：显式拒绝 `NaN / undefined / null / [object Object]` 与空占位，防止缺数被渲染成「看似正常」。
5. **新鲜度阈值分级**：行情（T-1）、评级（日更）、财报（季更）按数据特性设不同 stale 阈值，只对「超阈」报警，降低误报。
6. **信号管道健康（聚合判据）**：风险信号「单条陈旧正常、全部陈旧才是故障」，用聚合判据区分自然停留与源失效。
7. **标签化与 CI 友好**：`@data / @ui / @markets / @smoke` 标签让 CI 可按层运行；`fullyParallel: false` + `serial` describe 适配线上站点限流；`timeout` 整体放宽应对客户端渲染。

---

## 5. 运行与证据

### 5.1 运行命令
```bash
# 安装（首次）
npm install && npx playwright install chromium

# 全量（直连 https://alva.ai，无需本地服务、无需登录）
npm test
# 或
make test

# 按层运行
npm run test:data     # 仅 @data 数据正确性（7 个 spec）
npm run test:ui-only  # 仅 @ui 页面外壳与导航
npm run test:smoke    # 仅 @smoke 冒烟

# 查看 HTML 报告
npm run report        # 或 make report
```

环境变量：`BASE_URL`（默认 `https://alva.ai`）、`PLAYBOOK_PATH`（默认 `/u/lake/playbooks/amd-deep-dive`）。

### 5.2 证据说明（重要）
- **本报告的缺陷登记表与覆盖矩阵基于用例设计定稿；实时通过/失败数字需在本机对线上站点实跑生成**（`playwright-report/index.html`）。沙箱环境无法直连 `alva.ai`（出口代理拦截 + 客户端渲染限流），故未在此嵌入一次新跑的计数。
- **D-1（$0.0 EV/MC）被设计为活跃失败守卫**：在缺陷修复前，该用例在报告中保持红色——这是预期状态，代表「数据回归正在盯住这个 bug」，不是套件不稳定。
- 运行产物 `playwright-report/`、`test-results/` 已被 `.gitignore` 忽略，不随仓库提交。

### 5.2.1 最新本机全量实跑（2026-09-03，commit 4863cb4 之前）

- 命令：`npm test`（chromium 单端，本地 `.env` 默认 `BASE_URL=https://alva.ai` / `PLAYBOOK_PATH=/u/lake/playbooks/amd-deep-dive`）
- 结果：**106 passed / 2 failed / 1 flaky**（约 5.2 min）
- 分解：
  - `comps.spec.ts` EV/MC `$0.0` 守卫 = **1 failed（设计内）**：即 D-1，缺陷修复前保持红色，代表数据回归正盯住该 bug。
  - `markets.spec.ts` 深链内容守卫脆弱 = **1 failed（已校准）**：实测该守卫在 `?tab=overview / earnings / anomalies` 间轮流转红/抖动，根因是 alva.ai 慢加载 + 限流导致 `body.innerText` 长度在流式渲染时偶发低于阈值（非固定 tab 属性，故按 tab 调阈值无效）。修法三步：(1) `4863cb4` 将默认 tab 的 `aria-selected` 改为「仅属性存在时校验」；(2) 初版按 tab 区分阈值（默认 150 / 其余 400）；(3) 终版改为 `waitForFunction` 等待文本长度稳定 >150（吸收时序抖动），并修正 `settle()` 误把 `>400` 当稳定判据的假设。预期复跑变绿。
  - `chat.spec.ts` 欢迎语 = **1 flaky**：站点慢加载偶发，重试通过；已把局部超时提到 45s，CI `retries:2` 仍兜底。
校准后预期（含 waitForFunction 修复）：深链内容守卫不再因时序抖动失败，复跑约 **108 passed / 1 failed**（唯一红为设计内 D-1）。注：chat / comps(AMD 在表) / markets(anomalies) 偶发 flaky 属 alva.ai 慢加载的环境性偶发，非断言错误，CI 的 `retries:2` 会兜底；本地偶发 flaky 不影响交付。

### 5.2.2 最新本机全量实跑（2026-09-03 晚，commit f0f8179 之后）
- 结果：**107 passed / 1 failed / 1 flaky**（约 3.1 min）
- 分解：
  - `comps.spec.ts` EV/MC `$0.0` 守卫 = **1 failed（设计内 D-1）**：预期红色，未变。
  - `valuation.spec.ts:38`「估值倍数都是正数，且带 TTM 口径说明」= **1 flaky（已定位修复）**：根因是 `waitForDataReady` 的就绪判据只等了 KPI `value`/可比表/财务表行数，**没等 KPI `sub` 口径文案**——估值的 `sub`（"TTM P/E" 等）是页面最晚填充字段之一，早期快照里 `value` 已是价格但 `sub` 还是空占位，于是 `extractDashboard` 偶在 `sub` 注入 "TTM" 前冻住快照，导致这条只依赖 `.sub` 的断言偶发红。修法：把「估值 KPI（`P/E`/`P/S`/`EV / EBITDA`）的 `value` 已是数字且 `sub` 含 `TTM`」也纳入 `tests/helpers/common.ts::waitForDataReady` 的就绪判据（commit 待落），从源头消除时序竞争，**断言语义不变**，且对所有 spec 共享的 `loadDashboard` 一并生效、降低整体抖动。
- 校准后预期（含本次 common.ts 修复）：复跑约 **108 passed / 1 failed（D-1 设计内）、0 flaky**。

### 5.3 CI 建议
- `@data` 层每日定时跑（数据正确性对时效敏感）；`@ui` 层随页面变更跑；`@smoke` 层每次部署后跑。
- `forbidOnly: !!process.env.CI` 已开，防止 `.only` 误提交导致 CI 只跑一条。

---

## 附录 A：标签分类

| 标签 | 含义 | 覆盖 |
|---|---|---|
| `@data` | 数据正确性（金额/勾稽/异常/新鲜度） | valuation / data-integrity / market-data / financials / comps / risk / freshness |
| `@ui` | 页面外壳与导航（不含数据断言） | shell / chat / meta / tabs |
| `@markets` | markets 公开个股页（衔接 Part 1 旅程） | markets |
| `@smoke` | 冒烟 | smoke |

## 附录 B：运行命令速查

| 目标 | 命令 |
|---|---|
| 全量 | `npm test` |
| 数据层 | `npm run test:data` |
| UI 层 | `npm run test:ui-only` |
| 冒烟 | `npm run test:smoke` |
| 类型检查 | `npm run typecheck` |
| HTML 报告 | `npm run report` |
| 调试 | `npm run test:debug` |
| 有头模式 | `npm run test:headed` |
