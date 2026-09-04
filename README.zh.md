# alva-e2e（中文说明）

对 [alva.ai](https://alva.ai) 公开 playbook 页面的 **Playwright 数据正确性测试**套件。

本项目的核心目标不是 UI / 多端样式，而是**验证页面里的数据对不对**：
数字有没有算错、跨表口径是否一致、有没有脏值 / 占位符残留、枚举值是否合法、更新是否新鲜。

被测目标（经 `.env` 配置，必填——见下方[运行](#运行)章节；代码内无默认值）：

```
https://alva.ai/u/lake/playbooks/amd-deep-dive
```

---

## 应聘提交说明（Alva · AI-Native QA 笔试）

> 本仓库交付笔试的**两部分**，建议按此顺序阅读：
>
> | 部分 | 交付物 | 内容 |
> |---|---|---|
> | **Part 2**（本 README 主体） | `tests/` 共 13 个 spec（7 个 `@data` + 4 个 `@ui` + 1 个 `@markets` + 1 个 `@smoke`，另有 `helpers/` 提取层） | 已发布公开 Playbook（AMD Deep-Dive）的**生产环境金融数据巡检**套件，最新全量实跑 **107 passed / 1 failed / 1 flaky**（1 个 failed 为设计内 D-1 `$0.0` 守卫；flaky 为估值 TTM 口径文案，已定位根因并修复——见 docs/PART2 §5.2），对应 JD 核心职责「生产环境质量巡检……金融数据正确性」 |
> | **Part 1** | [`docs/PART1-onboarding.md`](./docs/PART1-onboarding.md) | 登录链路「注册 → 建 Portfolio Watch Automation → 建 Playbook → 收 Alert」的**探索式测试报告**，9 条发现（F-1~F-9）+ 登录态用例全绿（onboarding/journey 共 8 条需 SSO；markets 个股页 UI 已并入 `tests/` 公开套件） |
>
> 运行证据：Part 2 全量实跑见 [`docs/PART2-data-correctness.md`](./docs/PART2-data-correctness.md) §5.2；Part 1 历史证据见 [`docs/PART1-onboarding.md`](./docs/PART1-onboarding.md) 附录 C。下面三节按笔试要求说明（以 Part 2 为主，因其为自动化交付主体）。

### 1. 为什么选「Playbook 数据正确性」这个场景（而不是另一个）

笔试 Part 1 的旅程是「注册 → 建 Portfolio Watch Automation → **建 Playbook** → 收 Alert」，全部在登录态下。**Playbook 正是这条旅程的第三环**，因此本套件测试的「已发布公开 Playbook（AMD Deep-Dive）的数据正确性」落在题目「任选 Part 1 一场景」的范围内。我刻意**没有**把自动化测试放在登录链路本身，理由：

- **数据 bug 是最深的 bug。** 一条涨跌幅符号反向、一个市值数量级错一位，对投资用户是实打实的亏损，比十条 UI 对齐问题都严重。JD 把「金融数据正确性」单列为核心职责，正是这个判断。
- **公开页面可无人值守巡检。** 登录链路每次跑都要真实账号 + 反爬 + 限流，不适合做常态化回归；而公开 Playbook 能在 CI 里定时跑，真正起到「生产环境巡检」作用。
- **它能做出有说服力的交叉校验。** 同一个指标（AMD 营收、EBITDA、股价）在「财报表」「可比公司表」「行情 KPI」三处各出现一次，互相必须相等——这类断言能抓出取数口径不一致、单位换算错、缓存串号等**单看任一边都发现不了**的真实故障。本套件确实抓到了一个：`comps.spec.ts` 里「EV / Market cap 应有真实数值」这条用例**当前是红色的**，因为可比表里所有公司的 EV 与 Market cap 都渲染成了 `$0.0`（数据没取到，并非真实为零）。
- 登录链路（Part 1 旅程）我没有丢弃，而是作为**互补的独立套件**——需登录态，故独立于本套件、仅本机运行、未纳入本仓库：登录链路 8 条用例（onboarding / journey，需 SSO）**全绿**；探索结论与 9 条发现见 [`docs/PART1-onboarding.md`](./docs/PART1-onboarding.md)。其中 markets 个股页套件是 **Part 1 ↔ Part 2 的衔接区**：markets 个股页既是 alert 的落地页、又是行情数据的出口，其「价格形如 `$X.XX` 且非零」断言正好与 Part 2 的 `$0.0` 缺陷形成对照。

### 2. AI 在工作流里做了什么，我又否决 / 修改了什么

本项目的代码几乎全部由一个 AI 编码 Agent（WorkBuddy）在对话中生成，我（应聘者）负责**定方向、审断言、纠偏**。几个关键节点：

- **Agent 最初按旧项目模板，把重点放在 UI / 多端样式**（Tab 切换、响应式视口）。我明确叫停：「重点是测数据，不是多端样式」，Agent 据此把整套重心翻转为数据正确性，并删掉了 mobile project。
- **Agent 用 `getByText(..., { exact: true })` 匹配公司名，在 iframe 里全军覆没**（公司名 textContent 是 `Advanced Micro Devices\n AMD · NASDAQ`，精确匹配永远不中）。我让它改为基于 `role=heading` / 包含匹配，并据此修好了所有相关断言。
- **Agent 写了 `first()` 命中隐藏引导句**的坑（Thesis 面板里 `first()` 先命中了隐藏的 "…the AMD bull case…" 而非可见标题）。我让它加 `filter({ visible: true })` 修正。
- **Agent 一条业务假设过度**（断言「EBITDA ≤ 毛利」）。我指出晶圆代工厂（如 TSM）折旧计入营业成本会压低毛利、加回折旧后 EBITDA 反超属正常会计表现——Agent 据此把硬边界收敛为「EBITDA ≤ 营收」。
- **Agent 把欢迎语正则写成直撇号 `'`**，而站点用的是弯撇号 `’`（U+2019）。我让它改用无撇号的特征短语。
- **脏值扫描误报**（全文本里某英文单词含 `null` 子串）。我让它把扫描范围从「整页 innerText」收窄到「数据单元格」，消除误报。
- **我把「1 次加载、多次断言」的共享 page 机制定为目标**：Agent 最初每个用例独立加载慢速 iframe，全量跑 38 分钟且限流翻车；改成 `beforeAll` 共享一页后，全量降到 2.5 分钟、97 条用例通过。

### 3. 即使全绿，我仍然不放心的地方（没覆盖什么）

- **只覆盖一个 Playbook、一个时间点。** 这是 AMD 单一标的的快照。其他 Playbook（不同行业 / 不同数据密度）可能暴露不同的渲染或取数问题；且页面每约 4 小时刷新，我无法保证每次刷新后结构不变。
- **交叉校验是「内部一致性」，不是「对外部真相」。** 市值 ÷ P/S 反推营收、Comps 表 vs 财报表同口径——这些都只在页面**内部**互验。如果 Alva 后端**所有数据源同时错了**（如汇率、单位基准），套件会全绿却仍是错的。要真正防住，需要引入一个外部 ground-truth（如 SEC/行情 API）做三方比对，本套件未做。
- **限流让运行本身不稳定。** 站点对高频访问有明显限流（连续跑十几趟后 API 间歇返回空数据）。`pnpm test` 偶尔会因加载不出数据而失败，需要 `--workers=1` 串行重试。这意味着 CI 必须容忍偶发失败、或加预热/退避，否则会出假红。
- **本套件（Part 2）不覆盖登录态——这是刻意的设计取舍，已由 Part 1 互补，但端到端仍是弱项。** 注册、Automation 创建、Alert 配置与推送因需真实账号而排除在本套件外（公开页面才能无人值守巡检）。Part 1 的登录态用例（onboarding/journey 共 8 条）补上了登录链路的**骨架级**覆盖（路由可达、空状态引导、深链定位、行情非零），但仍有两处我自动化不了：① **automation 是异步 LLM 工作流**（构建数分钟），我只能断言「指令进入对话」，无法断言「最终生成的 automation spec 正确」；② **alert 真实触发无法验证**——它要求 AMD 从 $457 实际跌破 $100，等待期不可控。这两处目前依赖人工走查，已在 `docs/PART1-onboarding.md` §6 明确标注。
- **`$0.0` 这条红用例是「已知缺陷跟踪」，不是「新 bug 探测器」。** 它只验证 EV/市值非 0。一旦该缺陷被修，这条会变绿；但它不会主动发现「EV 算错成别的数」这类更隐蔽的错误（需要值级校验，超出当前 scope）。

---

## 运行

### 前置条件

- Node 22+，且能联网访问 `https://alva.ai`（中国大陆用户可能需要代理）。
- 本套件**直连线上站点**，无需启动任何本地服务。

### 命令

`Makefile` 提供的目标：

```bash
make install     # 首次：pnpm install + 安装 Chromium
make test        # 运行全部测试（直连 alva.ai，无需本地服务）
make test-smoke  # 只跑 @smoke 冒烟用例
make test-ui     # 以 Playwright UI 模式运行（可视化，不是只跑外壳用例）
make test-headed # 有头浏览器模式运行
make debug       # 调试模式运行
make report      # 打开 HTML 测试报告
make codegen     # 打开 Playwright 代码生成器
make typecheck   # TypeScript 类型检查
make clean       # 清理 test-results / playwright-report
```

`package.json` 脚本（更细粒度，推荐直接用 pnpm）：

```bash
pnpm test                  # 全部
pnpm run test:data         # 只跑数据正确性用例（--grep @data）
pnpm run test:ui-only      # 只跑外壳/交互用例（--grep @ui）
pnpm run test:smoke        # 只跑 @smoke 冒烟
pnpm run test:ui           # Playwright UI 模式
pnpm run test:headed       # 有头模式
pnpm run test:debug        # 调试模式
pnpm run report            # 打开 HTML 报告
pnpm run typecheck         # TS 类型检查
```

**被测站点是配置而非代码**：`BASE_URL` 与 `PLAYBOOK_PATH` 为**必填**，代码内**不内置默认值**——未配置时套件启动即失败并给出修复指引。在本地 `.env` 中设置（复制 [`.env.example`](./.env.example)；经 `dotenv` 自动加载）：

```bash
cp .env.example .env   # 然后按需修改
```

或单条命令前缀环境变量：

```bash
BASE_URL=https://alva.ai PLAYBOOK_PATH=/u/xxx/playbooks/yyy pnpm test
```

> 提示：线上站点慢且有偶发限流，完整套件建议 `pnpm test -- --workers=1` 串行跑更稳。

### 运行证据

```bash
make install      # 首次：装依赖 + Chromium
make test         # 全量（直连 alva.ai，无需本地服务）
make report       # 打开 HTML 报告
```

- 当前仓库最新全量实跑证据见 [`docs/PART2-data-correctness.md`](./docs/PART2-data-correctness.md) §5.2——2026-09-03 两次本机实跑：先 **106 passed / 2 failed / 1 flaky**（markets 过度断言，已于 `4863cb4` 校准），后 **107 passed / 1 failed / 1 flaky**（failed 为设计内 D-1 `$0.0` 守卫；flaky 为估值 TTM 口径文案最晚填充，已在 `84e6477` 定位根因并修复——快照前先等其就绪）。校准后预期约 **108 passed / 1 failed（D-1）/ 0 flaky**。
- Part 1 登录链路历史证据（97 passed + 1 failed，即 `$0.0` 缺陷）仍保留在 [`docs/PART1-onboarding.md`](./docs/PART1-onboarding.md) 附录 C；Part 1 的 SSO 用例已不在本仓库（`part1/` 被 gitignore），该日志仅作历史参考。
- 提交物即本仓库；运行证据为 `docs/PART1-onboarding.md` 附录 C 的列表式测试报告（等价 CI 日志）。

---

## 被测页面架构（写测试前必读）

页面是 **外壳 + iframe** 两层结构，这是所有选择器的出发点：

| 层 | 内容 | 定位方式 |
|---|---|---|
| 主文档（alva.ai） | 侧边栏、标题 "AMD Deep-Dive"、作者、README 徽章、右侧 Alva 聊天区 | 直接 `page.getByText(...)` |
| `<iframe title="Dashboard">` | 真正的内容仪表盘（公司卡、7 个 Tab、KPI、财务表、Comps 表、风险表、评级、图表），src 指向 `lake.playbook.alva.ai`，路径带版本号（如 `v1.13.28`） | `dashboard(page)` helper（`page.frameLocator`） |

两个坑（数据测试尤其要命）：

1. **数据渐进填充**：iframe 骨架先渲染（占位符是 `—` / `Loading…`），指标标签和数字可能 20~40 秒后才插入 DOM。数据类断言必须显式等待（helper 里的 `DATA_TIMEOUT = 60s`），绝不能假设元素立即可见。
2. **内容加载偶发不稳定 + 限流**：站点对高频访问有限流迹象（连续跑十几趟后 API 会间歇性 200 但空数据）。因此 config 里 `fullyParallel: false`、`workers` 压到 1~2，且每个 spec 用 `beforeAll` **只加载一次页面、共享一个 page**，避免 N 个用例 × 独立加载把站点打挂。

另外两个站点现状（测试里有注释固化）：

- 整站**没有任何 h1~h6 语义化标题**（标题是 `<span class="page-header-title">`）。公司名在 iframe 内、且文本是 `Advanced Micro Devices\n AMD · NASDAQ`（h1 内嵌 span）—— 用 `exact: true` 会永远不中，必须改用 `role=heading` 或文本包含匹配。
- 未登录时控制台会有 401/403（账户接口）和被墙统计脚本的噪音，属预期；`meta.spec.ts` 只断言无**未捕获** JS 异常。

## 数据提取方式（关键设计）

数据测试不是「肉眼看数字对不对」，而是**在浏览器侧把数据抽成结构化对象，再用纯函数断言**：

```
tests/helpers/extract.ts   → 浏览器内运行的提取器（page.evaluate），
                             把 KPI / 财务表 / Comps 表 / 评级 / 风险 / 时间戳
                             抽成 DashboardData 结构
tests/helpers/parse.ts     → 纯函数：parseMoney / parsePct / parseDate / findDirtyValues
tests/helpers/common.ts    → gotoPlaybook / dashboard / waitForDataReady / 共享 page 机制
```

为什么这样设计：

- 页面很多数据在 DOM 里但**不可见**（如 `textContent` 能拿到 Annual financials / Risk 表，但 `innerText` 停在 Price performance）—— 数据测试必须用 `textContent` / `getAttribute`，不能只信可见性。
- 把「抓取」和「校验」分离后，断言可以做得非常密：交叉校验、区间检查、枚举合法性、符号一致性都是纯逻辑，跑得快、报错信息清楚。

## 测试文件

| 文件 | 标签 | 覆盖 |
|---|---|---|
| `smoke.spec.ts` | `@smoke` | 页面可达 + iframe 内容最终渲染 |
| `shell.spec.ts` | `@ui` | 外壳：标题、作者、徽章、描述、侧边栏导航 |
| `tabs.spec.ts` | `@ui` | 7 个 Tab 栏 + 子 Tab 计数一致性（Tab 是滚动锚点，数据一次性在 DOM 里） |
| `chat.spec.ts` | `@ui` | 聊天区：欢迎语、建议卡片、输入框可输入（**不发消息**） |
| `meta.spec.ts` | `@ui` | iframe src、meta description、无 JS 异常、a11y 现状 |
| `data-integrity.spec.ts` | `@data` | **全局脏值扫描**、数据结构齐全、营收占比图例总和 100%、空表格检查 |
| `market-data.spec.ts` | `@data` | 行情 KPI + **可计算交叉校验**（52 周回撤 = f(股价, 高点)；市值 = 股价 × 流通股） |
| `financials.spec.ts` | `@data` | 财报列序连续性、毛利率区间 [0,100]、EBITDA 与营业利润的业务约束 |
| `comps.spec.ts` | `@data` | 可比公司表 + **跨表交叉校验**（Comps 表 AMD 行 == 财报表同口径）、**EV/市值非 $0** |
| `valuation.spec.ts` | `@data` | P/S 反推营收 vs 季度表 TTM 交叉校验、PEG 口径、评级枚举合法 |
| `risk.spec.ts` | `@data` | 风险表枚举值合法性（Neutral/Positive/Negative）、信号日期格式 |
| `freshness.spec.ts` | `@data` | 不同数据源的合理更新周期（财报季度 vs 实时行情 vs 评级） |
| `markets.spec.ts` | `@markets` | markets 个股页深链高亮、价格≠$0.0、Alva Agent 伴侣区、资源路由 200、F-8 错参回退 ×2 |

## 已发现的数据缺陷（用本套件可复现）

- **Comps 表 EV / Market cap 全为 `$0.0`**：所有可比公司（INTC / NVDA / QCOM / TSM / ARM 等）的 EV 与 Market cap 列都显示 `$0.0`。`comps.spec.ts` 里「每家公司 EV / 市值非 $0」这条断言目前**会失败**，固化了这个真实 bug。

## 纪律

- 测试只读：不点击发送按钮、不登录、不写任何数据到对方站点。
- 数值类断言分两类：
  - **格式模式**（价格、涨跌幅、日期、views）→ 只验格式正则，不硬编码具体值（页面每 4 小时自动刷新）。
  - **可计算交验**（回撤、市值、P/S 反推营收、跨表同口径）→ 用页面内其他字段现场算，不依赖外部真相源。
- 新增用例前先跑探测脚本确认真实 DOM 与数据形态，不要凭截图猜选择器或硬编码会变的数值。

---

## 文档索引

- [`README.md`](./README.md) — 同本文件的说明（当前亦为中文）。
- [`docs/PART1-onboarding.md`](./docs/PART1-onboarding.md) — Part 1 登录链路探索式测试报告（F-1~F-9；登录态用例 onboarding/journey 共 8 条需 SSO，markets 个股页 UI 已并入 `tests/` 公开套件）+ 运行证据（附录 C：97 passed + 1 failed，含二次复验）。
- [`tests/`](./tests) — 数据正确性套件（7 个 `@data` spec + 4 个 `@ui` spec + 1 个 `@markets` spec + 1 个 `@smoke` spec + helpers 提取层）。
