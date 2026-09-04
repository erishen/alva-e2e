# Alva 探索式 QA 报告 — Part 1：登录链路与产品体验

> **交付物性质**：本文件是 alva.ai AI-Native QA 笔试 **Part 1 的硬性交付物**——针对登录链路（注册 → 建 Portfolio Watch Automation → 建 Playbook → 收 Alert）的探索式测试与问题报告。本报告另含**数据正确性套件（Part 2）的运行证据**，见文末 **附录 C**。
>
> **执行方式**：AI 辅助探索（Playwright 探针 + 自动化套件）+ 人肉走查（评审人在本机真实浏览器走查，纠正 AI 误判）。
>
> **状态**：初稿。自动化发现的结论已定稿；视觉 / 交互 / 移动端 / 边界类发现待走查补充（见文末模板槽）。
>
> **边界声明**：注册走 Google SSO（无密码），自动化套件不重放登录，仅复用评审人手动登录后导出的 `storageState`。
>
> **仓库范围**：本文档是本仓库的交付物；`part1/` 下的登录态套件（`onboarding/journey/markets.spec.ts`）、探索探针（`probes/*.mjs`）与 `export-state.mjs` 均为**本地运行产物，不纳入本仓库**（需 Alva SSO 会话，无法进 CI）。下文以文件名引用它们作为证据轨迹，不代表这些文件随仓库分发。

---

## 1. 执行摘要

| 项 | 结论 |
|---|---|
| 测试范围 | 登录链路关键路径：注册(SSO) → 建 Watch Automation → 建 Playbook → 收 Alert |
| 硬性功能 bug（P0/P1） | **未发现** |
| 全部发现 | 9 条；**F-1 为设计层问题（中）**，F-6 为本地化缺陷（低–中），**F-7 为只读频道误呈现 + 错误信息质量缺陷（低–中）**，**F-8 为 markets 页 `?tab=` 命名不统一 + 错参静默回退（低）**，**F-9 为 markets 页 SEO / 可发现性缺陷（低，相邻观察；已证伪"官方故意不开放爬取"的假设，实为意图与实现脱节）**，其余为低–中 IA / 可发现性 / 空状态观察 |
| AI-Native QA 核心叙事 | 自动化探针 **3 次误判**（2 次人判推翻 + 1 次自纠）；且 F-9 上报前先**证伪了"官方故意不开放爬取"的竞争假设**——证明「人判 + 假设检验」在 AI-Native QA 中不可替代 |
| 已验证的良好设计 | automation 过渡测试、去重告警、异步进度提示、带 ID 深链、合规免责、**AI/GEO 就绪的 robots.txt 与 .md 镜像** |

**一句话结论**：Alva 的登录链路在功能上可用，未发现阻断性缺陷；主要问题集中在**信息架构清晰度、功能可发现性，以及更深一层的产品设计**（chat-first 范式下，功能入口分散、分区语义含糊，且持久 automation 被放进 chat 线程承载、可见性随视图分裂）。自动化擅长抓"结构化数据正确性"与"可达性"，但"这条对话算不算 bug""这个入口是否直观""这算不算设计问题"必须由人判。另有两个具象缺陷：**F-7** 只读资讯流频道 `for-you` 被渲染成聊天入口、报错开发者术语 `channel has no main session`；**F-8** markets 个股页 `?tab=` 深链命名不统一（4 小写 vs 2 驼峰）且错参静默回退——而 markets 页正是 **Part 1（watch alert → 点 AMD）的目的地** 与 **Part 2（行情数据正确性）的交叉点**，是最该补衔接测试的区域（详见 F-8 与 §2.1）。延伸审计还发现：**markets 个股页存在「意图与实现脱节」——官方已用 `index, follow` + SSR 明确表达"要被索引"并支付了工程成本，却因通用 title、无 canonical、sitemap 零收录而零转化（F-9；已证伪"故意不开放爬取"假设）。**

---

## 2. 探索式发现清单

> 严重度说明：**中**=影响完成任务但有 workaround；**低**=体验/认知负担，无功能阻断。

### F-1 【设计问题】持久 automation 以 chat 线程为生命周期宿主，chat 与 task 职责混淆（中 · 产品设计 / IA）
- **模块**：Automation / 导航 / 信息架构
- **现象（评审人实测 + 设计层观察，三点叠加）**：
  1. **chat 与 task 混用（诞生于 chat）**：automation 不在独立"任务"页创建，而是**诞生于一条 chat 线程**——发起 "watch AMD…" 后，该 chat 同时承担"对话"与"任务构建/承载"双重角色：构建进度、完成 spec、后续告警投递通道（channel 5345）全部绑定在这条 chat 上。而纯聊天（如只发 "hi" 的 `2095382872417804288`）始终是纯线程、不进 tasks——**两者混在同一 chat 载体里，界限只靠标题 `Build:` 区分**。
  2. **可见性不一致（一会看得见）**：同一条 automation 对话，在顶层 `Chats` 列表里**看不见**，却在 `Channels/Alva` 主区、`?tab=tasks` 的 Tasks 视图里**看得见**，凭直接 URL 也能开。即"是否可见"取决于当前所在视图，用户会觉得"时有时无"。
  3. **需用户主动找并自行建立心智模型**：上述路由规则（什么进 Chats、什么进 Channels、什么在 tasks）对普通用户不透明，必须自己走查一遍才能理解"这条 chat 到底是聊天还是任务"。
- **预期**：持久化对象（automation/task）与其承载/返回路径应有一致、稳定的模型，不应与即时对话混在同一载体、且按视图随机可见。
- **实际**：chat 既是即时对话面、又是 automation 的生命周期宿主；导航对其呈现随视图分裂（Chats 不收、Channels 收、tasks 收、URL 可），用户须自行拼合心智模型。
- **复现**：① 发 "watch AMD…" → ② 构建完成 → ③ 回首页看 `Chats`（找不到）→ ④ 点 Channels/Alva 或 `?tab=tasks` 才可见；纯聊天 chat 则始终只在对话里、不进 tasks。
- **证据**：`probes/probe-alva-channel.mjs`；`?tab=tasks` 直达；纯聊天 chat `2095382872417804288` 无 automation 签名对照。
- **严重度**：**中（设计问题）**。非阻断性功能 bug，但属**产品设计层面**的 IA / 心智模型缺陷，比单纯"入口难找"更根本——它源于"用 chat 承载持久 artifact"这一范式本身，且被 Alva 的"Chats / Channels / ?tab=tasks 三处不一致可见性"放大。
- **设计视角补充**：chat-first 的 AI agent 平台普遍把持久 artifact 挂在 chat 内，故这是**行业共性张力**而非 Alva 独有硬伤；但 Alva 在共性之上叠加了可见性分裂，使混淆加剧。建议：① automation 完成后在 `Chats` 或独立 `Automations` 入口给出明确、稳定的落点；② 在 chat 内以视觉区隔（如"任务卡片"）标明"此线程已绑定一个 automation"，降低 chat/task 混淆。

### F-2 左侧栏「Chats」与「Channels」分区语义含糊（低–中 · IA）
- **模块**：导航 / 信息架构
- **现象**：左栏有 `Chats`（仅手动建的频道）与 `Channels`（Alva / for-you / 自建频道）两个并列分区，命名相近但归属规则不透明。
- **预期**：用户能直观理解"什么会出现在 Chats、什么会出现在 Channels"。
- **实际**：由 automation 流程产生的对话自动归入 `Channels/Alva`，不进 `Chats`；`New Chat`（临时对话启动台）与 `New Channel`（持久命名空间）也并列，用途区分不直观。
- **严重度**：低–中。是 **F-1 设计问题在导航层的表现**——正因为 chat 承载了 automation 生命周期，才导致 Chats/Channels 归属边界模糊；建议与 F-1 合并处理。

### F-3 for-you 频道需连账户才个性化，未连时与 Alva 主页雷同且无空状态说明（低–中 · 可发现性 / 空状态）
- **模块**：Channels / for-you
- **现象**：`for-you`（`/channel/5346`）需连接个人财务账户（Connect Portfolio / Connect IM）才激活个性化推送。
- **预期**：未连接时，应明确告知"连接账户后此处会变"，避免与默认 Alva 聊天界面混淆。
- **实际**：未连账户时，`for-you` 与 Alva 主页 DOM 近乎一致（同为 agent 聊天界面，均带 "Ask Alva anything" composer），且**无任何空状态说明**解释两者差异。
- **严重度**：低–中（用户难理解"为何有两个一样的聊天入口"）。

### F-4 New Chat（临时启动台）vs New Channel（持久空间）语义模糊（低 · IA）
- **模块**：导航 / 入口
- **现象**：`New Chat`（`/new_chat`）是开聊启动台（渲染 Playbook 模板引导），无独立 URL；`New Channel`（图标按钮）建的是持久命名空间（侧栏常驻、可寻址 `/channel/<id>`、可分享）。
- **预期**：两个"新建"入口的用途差异应一眼可辨。
- **实际**：两者并列于侧栏，均为"跟 Alva 聊"的入口，用途区分不直观（评审人自建的 `Simple Greeting Conversa…` 即 New Channel 产物，易与临时对话混淆）。
- **严重度**：低。

### F-5 核心功能（任务/提醒/记忆/文件）仅首页 chips，无左栏常驻项（低 · 可发现性）
- **模块**：导航 / 入口
- **现象**：`Tasks / Alerts / Memory / Files` 四类功能仅以首页 AI 问候语下方的一排建议 chips（对话 / 任务 / 提醒 / 记忆 / 文件）形式出现。
- **预期**：核心功能应有常驻、带标签的导航项。
- **实际**：左栏（New Chat / Explore / Portfolio / Markets / Channels）**无**这四项；虽有 `?tab=tasks|alerts|memory|files` 深链可补，但 UI 自身无入口。评审人初次走查时即"没看到"这排 chips，印证可发现性差。
- **严重度**：低（有 `?tab=` 深链兜底，非阻断）。

### F-6 中文 locale 下多处 UI 文案未本地化（回退为英文）（低–中 · 本地化 / i18n）
- **模块**：全局 / 本地化
- **现象（人肉视觉走查 + 探针复现）**：在中文语言环境下，导航、问候语、输入框占位符、空状态 CTA 等**多处核心 UI 文案仍为英文**，未翻译。探针强制 zh 后实测残留英文包括：
  - 左栏：`New Chat`、`Tasks (1)`、`Alerts (1)`、`+3,000 bonus credits`、`Connect social accounts to` / `claim bonus`
  - 首页问候：`Your AI investing agent. Ask me to research markets, build live Playbooks, or set up automations that watch the market for you.`
  - 输入框占位符：`Ask Alva anything. @ for context, / for skills`
  - 空状态 CTA：`Get Started`、`Connect Portfolio`、`Connect IM`、`Watch your portfolio 24/7`、`Set up your Alpha Radar`、`Get a quick read on any ticker`、`Screen the market on your rules`、`Build your own automations`
  - 其他：`Created by me`、`Next Run:`、`Build: AMD Below $100 Alert`（任务标题）
- **预期**：启用中文后，面向用户的 UI 文案应一致中文化（专有名词 / 品牌名如 Alva、AMD、GPT 模型名可保留英文）。
- **实际**：仅部分文案中文化（如首页 chips 对话 / 任务 / 提醒 / 记忆 / 文件、for-you），大量核心文案回退英文，呈"中英混杂"。
- **影响**：中文用户体验割裂、理解成本上升；对主打多语言的金融产品，本地化不全削弱专业感与可信度。
- **证据**：`probes/probe-i18n.mjs`（强制 `localStorage.i18nextLng=zh` 复现，覆盖 `/`、`/?tab=tasks`、`/?tab=alerts`、`/markets/AMD`）。
- **严重度**：低–中（非功能阻断，但属明确的本地化质量缺陷；建议列入 i18n 回归清单）。
- **备注**：英文残留由探针独立复现，与评审人视觉走查相互印证；个别英文（如 `Alpha Radar`、`GPT-5.6`）可能属品牌 / 模型名，是否翻译需产品决策，不计入缺陷。

### F-7 for-you 频道误呈聊天入口、发消息报不可读后端术语「channel has no main session」（低–中 · 错误信息质量 / 频道语义误导）
- **模块**：Channels / for-you
- **现象（实跑复现）**：进入 `for-you`（`/channel/5346`），页面渲染与**聊天频道完全一致的输入框**——占位符 `Ask Alva anything. @ for context, / for skills`、麦克风、发送键俱全。用户在其中提问，消息气泡送出后立刻返回两条 UI 文案：
  ```
  An error occurred
  channel has no main session
  ```
- **网络证据**：前端对 `https://api-llm.prd.alva.ai/api/v1/channel/5346/...` 发起两次请求，**均返回 HTTP 409 Conflict**：
  - `GET /api/v1/channel/5346/events` → 409
  - `POST /api/v1/channel/5346/turns` → 409
  说明后端判定该 channel **没有可承载对话的 main session**——即 for-you 是后端聚合 / 个性化推送型**只读资讯流频道**，不绑定双向会话线程，故任何 `turns`（消息）写入被 409 拒绝。
- **预期**：
  1. **交互层**：只读 feed 频道不应呈现可输入的聊天 composer；若要呈现，应禁用并附说明（如 "This is a read-only feed — start a new chat to talk to Alva"）。
  2. **错误层**：即使发生异常，面向用户的报错应是**可读、可操作**的（说明"此频道为只读资讯流，请在 New Chat 中与 Alva 对话"），而非把后端内部术语 `channel has no main session` 直接透传。
- **实际**：
  1. for-you 以"聊天频道"形态呈现（含完整 composer），诱导用户输入；
  2. 发送即失败，前端把后端 409 的原始 message 原样拼上通用前缀 `An error occurred` 抛出，**用户完全无法理解「main session」是什么、下一步该做什么**。
- **根因（推断）**：for-you 是系统聚合 / 个性化推送频道（无主会话线程），但前端未对其做"只读"区分，与双向聊天频道共用同一套 composer 组件与发消息逻辑；错误兜底直接透传后端 message 字符串，缺少用户向改写。对照：Alva 主频道（`/`）同样有 composer，且因有 main session 可正常发消息。
- **复现**：① 打开 `https://alva.ai/channel/5346` → ② 在底部输入框键入任意问题（如 "帮我分析 AMD 估值"）→ ③ 回车 / 发送 → ④ 立即出现 `An error occurred / channel has no main session`；网络面板可见 `channel/5346/turns` 与 `channel/5346/events` 均 409。
- **证据**：`probes/probe-foryou-error.mjs`（实跑捕获 UI 文案 + 409 响应）；对照 Alva 主频道（`/`）composer 可正常发（有 main session）。
- **严重度**：**低–中**。非阻断性功能 bug（核心对话走 Alva / New Chat 不受影响，有 workaround），但属**明确的错误信息质量缺陷 + 频道语义误导**：① 把只读频道包装成聊天入口，制造死路；② 把 `channel has no main session` 这类后端术语裸抛给用户，零可操作性——正是 §6 模板槽关注的"**报错文案清晰度**"问题。
- **与 F-3 的关系**：F-3 观察到"for-you 未连账户时与 Alva 主页雷同、无空状态说明"；本发现进一步证明：for-you **连作为聊天频道都不成立**（后端无 main session），其"看似可聊"纯属 UI 误呈现。两者同源——for-you 的真实身份是只读资讯流，却被 UI 当作聊天频道渲染。建议合并处理：明确 for-you 的"只读 feed"定位并据此调整 UI（去 composer / 禁用 + 引导语）。

### F-8 markets 个股页 `?tab=` 深链命名不统一（2 个驼峰）+ 错参静默回退 Overview（低 · 一致性 / 可发现性）
- **模块**：Markets / 深链
- **现象（实跑复现）**：`/markets/<ticker>`（如 `/markets/AMD`）的 6 个 tab，其 `?tab=` 深链参数命名**不统一**：
  - **小写**：`overview`（默认无参）、`narratives`、`anomalies`、`earnings`
  - **驼峰**：`newsSocial`、`smartMoney`
  且**错参数不报错、不重定向**，静默回退到默认 Overview（仅 422 字最小内容）。例如 `?tab=news`、`?tab=smart-money` 均落到 Overview，目标 tab 的 `aria-selected` 为 false。
- **对照**：首页 `?tab=tasks|alerts|memory|files` 此前已验证**全小写且可正确深链**（见 §4.3 误判案例 1）。两套 scheme 风格冲突——用户从首页学会"小写 param"后，自然猜 `?tab=news` 会踩坑。
- **预期**：① 同站深链参数风格应一致（全小写或全驼峰）；② 错 / 未知参数应给出**可见信号**（停在默认 tab 同时 UI 标明"未知视图"，或重定向到规范 param / 404），而非静默吞掉。
- **实际**：markets 页 2 个 tab 用驼峰、与首页小写 scheme 冲突；错参静默回退 Overview，易让用户 / 自动化断言误判"News tab 是空的 / 坏了"——实测 `?tab=news` 正文仅 422 字，而正确 `?tab=newsSocial` 为 **14408 字**。
- **复现**：① 直链 `https://alva.ai/markets/AMD?tab=news` → News 不高亮、内容≈最小态；② 直链 `?tab=newsSocial` → News 高亮、14408 字；③ 点 UI 的 News tab，URL 变为 `?tab=newsSocial`（反推规范值）；④ `?tab=smart-money` 同理回退，`?tab=smartMoney` 才定位。
- **证据**：`probes/probe-markets-tabs-v2.mjs`（各 tab 高亮 + 内容长度）、`probes/probe-markets-click.mjs`（点击反推规范 param）、`probes/probe-markets-canonical.mjs`（验证驼峰深链生效 + 错参静默回退）。
- **严重度**：**低**。非功能阻断、正确深链可用、有点击兜底；但属**跨页一致性 / 可发现性**缺陷，且静默回退会误导（尤其对"按首页规律猜参数"的用户与自动化）。建议：统一为小写（`?tab=news` / `?tab=smartmoney`）或文档化规范值 + 错参显式提示。

> **为什么这块是 Part 1 ↔ Part 2 的天然衔接区（见 §2.1）**：markets 个股页是 Part 1「watch AMD → 收 alert → 点 AMD」的**落地页**，也是 Part 2「行情数据正确性」的**展示面**。它同时承载"登录旅程的终点"与"数据质量的前端出口"，是两份笔试最该打通测试的区域。

### F-9 markets 个股页 SEO / 可发现性：全站共用通用 title、无 canonical、sitemap 未收录（低 · 相邻观察）
> **性质说明**：本条**非功能缺陷**，属增长 / 可发现性维度。由 URL 结构审计（F-8）延伸而来，作为相邻观察记录，可视交付需要取舍。

- **模块**：Markets / SEO & GEO

> #### ⚠️ 竞争假设检验：「是不是官方故意不让爬？」（已证伪）
>
> 审计中提出过一个可能推翻本条的假设：**「markets 页不做 SEO，也许是官方有意不想让行情数据被抓取」**。若为策略性取舍，本条应从缺陷降级为设计决策、不予置评。为此做了定向验证，**结论：假设不成立，本条是缺陷而非策略**。5 项反证：
>
> | # | 验证项 | 实测结果 | 指向 |
> |---|---|---|---|
> | 1 | `robots.txt` 是否禁 `/markets` | `User-agent: *` → **`Allow: /`**，无任何 `Disallow`（仅 `CCBot`/`ByteSpider` 全站禁） | 未禁止 |
> | 2 | 服务端 `X-Robots-Tag` | 全站**均无**该响应头（`/`、`/markets/AMD`、`?tab=` 变体皆无） | 未禁止 |
> | 3 | 页面 `robots` meta | **`<meta name="robots" content="index, follow">`**——明确**要求**索引 | **主动邀请**索引 |
> | 4 | 行情数据是否服务端渲染（SSR） | **未登录、不执行 JS** 的原始 HTML 中即含真实行情 `$457.06` / `$457.85`、`AMD` 出现 150 次、`Advanced Micro` 存在 | 已主动把数据送给爬虫 |
> | 5 | 是否存在 cloaking / 反爬差异化 | Browser / Googlebot / ChatGPT-User 三种 UA 抓取结果**一致**（232479 / 232478 / 232479 字节），无 Cloudflare 挑战（`server: istio-envoy`、无 `cf-ray`） | 无差别对待 |
>
> **判读**：Alva 明确宣告 `index, follow`、特意做了 SSR 让爬虫**不需要执行 JS 就能拿到真实行情**（这是要花工程成本的），且对所有主流爬虫一视同仁。因此"不想被爬"不成立。
>
> **但用户的直觉里有一半是对的**——Alva 真正排斥的是**训练型抓取**，不是**索引/引用型抓取**，这个区分它做得非常清楚：
> - `Content-Signal: search=yes, ai-input=yes, **ai-train=no**`：允许搜索与 AI 引用，**禁止训练**；
> - 全站只禁两个 UA：`CCBot`（Common Crawl，LLM 训练语料主要来源）与 `ByteSpider`（字节爬虫）——**精准指向训练 / 竞对抓取，而非搜索引擎**；
> - 同时投入 `llms.txt`、`.md` 镜像页、`.well-known/agent.json`、`MCP-Docs` 全套 GEO 设施，**巴不得被 AI 引用**。
>
> ⇒ 精确定性：Alva 的策略是「**开放索引与 AI 引用，拒绝训练语料**」。而 markets 个股页正落在"开放索引"这一侧，却被遗漏了。

- **现象（实跑复现，5 项证据）**：
  1. **所有 markets 页共用同一个通用 title**：`/markets/AMD` 及 6 个 `?tab=` 变体的 `document.title` **全部为** `"Alva - Your AI Investing Agent"`——**不含 ticker、不含 tab 名**。数千个股页标题完全相同，搜索引擎无法区分、CTR 极差。
  2. **markets 页无 canonical**：6 个 `?tab=` 变体与基线 `/markets/AMD` 的 `<link rel="canonical">` **全部缺失**；而 `robots=index, follow` 明确要求索引 → 内容相近的变体无规范化，重复内容风险。
  3. **`?tab=` 大小写敏感**（F-8 的延伸）：`?tab=newsSocial` 唯一有效；小写 `newssocial`、大写 `NEWS`、小写 `smartmoney` **均回退 Overview**。URL 在分享 / 外链时被自动小写化即失效，且**静默**无提示。
  4. **sitemap 完全未收录动态内容页**：`sitemap.xml` 共 60 个 URL，**0 个** `/markets/*`、0 个 `/channel/*`、0 个 `/u/*`；全部为营销静态页 + 31 个 `/new_chat?template=` 变体。数据最丰富、搜索意图最高的个股页反而不可发现。
  5. **sitemap 预算花在近似重复页上**：31 个 `?template=` 变体各自 **self-canonical**（互不合并），且部分仍是通用 title（如 `fintwit-roundtable`）；仅少数（如 `backtest`）有定制 title（"Backtest Any Market Scenario Before You Risk a Dollar | Alva"）。
- **预期**：个股页应有语义化 title（`AMD Anomalies & News | Alva` 之类）、canonical 规范化 `?tab=` 变体、路径化路由（`/markets/AMD/anomalies` 优于 `?tab=anomalies`）、参数大小写不敏感或统一小写、sitemap 收录 markets 页。
- **实际**：通用 title + 无 canonical + 大小写敏感驼峰参数 + sitemap 零收录；而营销 / template 页反而有 canonical 与部分定制 title。
- **结论（关键洞察）**：**这不是"不想被爬"的策略取舍，而是「意图与实现脱节」**——官方已在三个层面明确表达"要被索引"的意图（`robots.txt` 全放行、`robots=index, follow`、花成本做 SSR 把真实行情送进原始 HTML），却在最后一步的实现上完全没有跟进（通用 title、无 canonical、sitemap 零收录）。**意图信号与实现质量互相矛盾，这比单纯的"没做 SEO"更值得报**，因为它意味着投入已经被支付（SSR 工程成本），却因最后一公里缺失而没能转化为任何搜索可见性。
- **投入错位的量化对照**：营销 / `?template=` 页享受定制 title、canonical、**以及首页才有的富 `Link` 响应头**（`</sitemap.xml>; rel="sitemap"`、`</llms.txt>`、`</agent.json>`、`</mcp>; rel="service"` 等 15 条 AI/GEO 声明）；而 `/markets/AMD` 的响应头里**这些声明一条都没有**——GEO 基础设施只接在营销路由上，没接到数据最丰富的产品路由上。
- **✅ 已验证的 GEO / AI 搜索亮点（对照，应保留）**：`robots.txt` 明确放行 `GPTBot / ClaudeBot / Google-Extended / DeepSeekBot / ChatGPT-User`，仅禁 `CCBot / ByteSpider`；并声明 `Content-Signal: search=yes, ai-input=yes, ai-train=no`、提供 `Sitemap` + `Schemamap` + `Agent-Discovery`（`.well-known/agent.json`）；sitemap 内还有多个 `.md` 镜像页（`/developers.md`、`/mcp.md`、`/onboarding.md` 等）供 LLM 抓取。**说明 Alva 在 AI / GEO 侧相当成熟，与传统 URL 参数的 SEO 薄弱形成鲜明反差。**
- **证据**：`probes/probe-seo.mjs`（title / canonical / robots / 大小写敏感性 / template 变体）；curl 抓取 `robots.txt` 与 `sitemap.xml`（60 URL 清单）；各 `?tab=` 原始 HTML md5 / 字节数对比；**竞争假设验证**：未登录 curl 直取 `/markets/AMD` 原始 HTML（确认 SSR 含 `$457.06`）+ Browser / Googlebot / ChatGPT-User 三 UA 对照（确认无 cloaking）+ 全站 `X-Robots-Tag` 扫描（确认无服务端 noindex）。
- **严重度**：**低（相邻观察）**。不影响任何用户功能与任务完成，纯增长维度；但若以"AI-Native 产品的可发现性"为评估维度，这是**投入产出比很高**的改进点（改 title 模板 + 加 canonical + 收录 markets 页即可）。
- **建议**：① title 模板化 `${ticker} ${tabLabel} | Alva`；② `?tab=overview` 规范到 `/markets/AMD`，其余 tab 按内容价值决定 self-canonical 或 noindex；③ 路由路径化 + 参数统一小写；④ sitemap 收录 markets 页、收敛 `?template=` 变体。

### 2.1 Part 1 ↔ Part 2 衔接：markets 个股页测试区（✅ 已落地）

markets 页同时是 **Part 1 旅程终点**（alert 点 AMD 进入）与 **Part 2 数据正确性出口**（真实行情渲染），是最值得补衔接测试的区域。**已实现为 `tests/markets.spec.ts`（11 条用例全绿，公开页测试、已纳入本仓库、可进 CI）**，覆盖：

1. **深链定位**（6 条）：`?tab=overview|narratives|anomalies|newsSocial|smartMoney|earnings` 各自高亮对应 tab（`aria-selected=true`）且内容非空（防静默回退回归，编码 F-8 规范值）。
2. **命名一致性回归守卫**（2 条）：对 `news` / `smart-money` 等"直觉错参"断言**当前确实静默回退 Overview**（F-8 现状），并加 `TODO` 注释——规范修复后翻转断言即可变红提醒。
3. **行情数据正确性**（1 条，衔接 Part 2）：`/markets/AMD` 渲染价格形如 `$\d+\.\d{2}` 且**不为 `$0.0`**（与 Part 2 Comp 表 `$0.0` 缺陷对照——证明 markets 页自身行情源正常）。价格随行情浮动，故校验"格式 + 非零"而非写死数值。
4. **Alva Agent 伴侣区**（1 条）：页底存在可对话的 Alva Agent 区（衔接 F-1 的 chat-first 范式在个股页的落点）。
5. **资源路由深链**（1 条）：`/markets/AMD` 作为带 ID 资源路由正常（与无 ID 功能路由 `/playbooks`、`/alerts` 的 404 对照）。

> 注：价格数值断言属 Part 2 数据正确性范畴，此处仅做"非零 / 格式"轻量校验，避免与 Part 2 套件重复且规避行情浮动导致的 flaky。

> **设计取向说明**：第 2 项刻意做成**回归守卫而非硬失败**——它断言的是"当前有缺陷"这一现状。若改成硬失败，CI 会长期飘红、掩盖真实回归；留 `TODO` 的做法既记录了缺陷，又不干扰信号。（若希望它在 CI 直接标红，翻转断言即可。）

> **已撤除的误报**：早期探针曾报"`/alerts` 等路径 404 = 缺陷"，经人工实测 `+tab=` 查询参数深链正常，确认为探针 URL 格式错误（假阳性），已从缺陷清单移除。

---

## 3. 已验证的良好设计（QA 应记录正向结论）

探索过程中确认以下设计合理，建议保留并在回归中监控：

1. **automation 过渡测试通过**：构建时模拟 `$101 → $99 → $98`，恰好产生 **1 条** alert，证明阈值逻辑正确。
2. **低于阈值期间不重复告警**：须回升至 ≥$100 才允许下次告警（防刷屏），设计良好。
3. **异步构建有进度提示 + 完成推送**：状态 `Running` → 完成后在同一 chat 推送完整 spec（含调度频率、下次生效时间、合规免责）。
4. **带 ID 资源路由深链正常**：`/markets/AMD`、`/u/lake/playbooks/...`、`/channel/<id>` 均正常渲染（仅无 ID 的功能路由 `/playbooks`、`/alerts` 落 404 "Go Home"）。
5. **合规免责声明**：automation 完成消息附 "for informational purposes only…" 免责，符合金融合规。

---

## 4. AI-Native QA 方法论反思（本笔试的核心交付价值）

### 4.1 自动化擅长什么
- **可达性 / 空状态**：登录后各路由可达、未连账户时 Portfolio/Alerts 空状态引导正确（Part 1 套件 8 passed）。
- **结构化数据正确性**：Part 2 套件抓到 Playbook Comp 表 EV/Market cap 全 `$0.0` 的真实缺陷。
- **确定性交互**：点击、输入、URL 切换等可硬断言。

### 4.2 自动化不擅长什么（须人判）
- **LLM 异步行为时序**：automation 构建需数分钟，沙箱出口 IP 下 LLM 回复偶发 >25s 不返回，端到端硬断言在 CI 不可靠。
- **视觉 / 交互 / 移动端 / 文案**：DOM 探不出来，须人肉走查。
- **"这算不算 bug"的定性**：AI 探针易**过度定性**。

### 4.3 三次误判案例（AI 探针 vs 人判 / 自纠）
| # | AI 探针结论 | 纠正来源与结果 |
|---|---|---|
| 1 | "`/alerts`、`/playbooks` 直接访问 404 → 缺陷（中）" | **人判**：真实深链 scheme 是 `?tab=`，`?tab=tasks/alerts/memory/files` 全部正常 → **假阳性，撤除** |
| 2 | "建 automation 的 chat 从导航消失 → 中危硬 bug、断返回路径" | **人判**：实际归在 Channels/Alva，且 `?tab=tasks` 可直达跳回 → **降级为可发现性观察** |
| 3 | "markets 页 `?tab=news` / `?tab=smart-money` 深链失效 → 这两个 tab 坏了" | **自纠**：探针用直觉拼写断言，实际规范值是驼峰 `newsSocial` / `smartMoney`，6 个 tab **全部可深链** → 假阳性，转为 F-8（命名不统一 + 错参静默回退） |

> **套路沉淀（第 3 例的通用教训）**：验证 `?tab=` 一类深链时，**必须先点击 UI 读取 URL 反推规范参数值，再用规范值做深链断言**；直接用直觉拼写（`news` / `smart-money`）几乎必然产生假阳性。本项目因此踩了 3 次同类坑（本例 + 例 1 的 URL 格式）。

> **结论**：AI-Native QA 不是"AI 替代人"，而是"AI 扩大探索覆盖、人判保证结论质量"。自动化套件应定位为**探索加速器与回归网**，缺陷定性与严重度最终由人拍板。

> **人判的更深一层价值（超越纠偏）**：评审人不仅推翻了 AI 误判，还把 F-1 从"可发现性观察"**深化为"设计层问题（中）"**——指出根因是用 chat 线程同时承载"即时对话"与"持久 automation 生命周期"，且可见性随视图分裂（Chats 不收 / Channels 收 / tasks 收 / URL 可），导致"一会看得见、得自己找/自己懂"。这说明人判不止于"纠错"，更能**提升结论层级**：从"哪里难找"上升到"为什么这个模型本身有问题"。

### 4.4 上报前先证伪竞争假设（F-9 的方法论价值）

发现疑似缺陷时，**先自问"这会不会是有意的设计取舍"，并用证据检验它**——这决定了结论该不该报、该定什么级别。F-9 是完整示范：

- **竞争假设**：markets 页不做 SEO，会不会是官方**有意不想让行情数据被抓取**？若成立，本条应从缺陷降级为设计决策、不予置评。
- **证伪过程（5 项反证，见 F-9 表）**：`robots.txt` 全放行 → 无 `X-Robots-Tag` → `robots=index, follow` 主动邀请索引 → **未登录不执行 JS 的原始 HTML 即含真实行情（SSR）** → 三 UA 抓取结果一致无 cloaking。
- **证伪后的收获（比原结论更有价值）**：确认不是策略，而是**意图与实现脱节**——官方已经为"被索引"支付了工程成本（SSR 把行情送进原始 HTML），却因通用 title / 无 canonical / sitemap 零收录而没能转化为任何搜索可见性。
- **同时保留了假设中的合理部分**：Alva 真正排斥的是**训练型抓取**（`ai-train=no`、禁 `CCBot`/`ByteSpider`），而非索引型抓取。精确定性为「**开放索引与 AI 引用，拒绝训练语料**」。

> **可复用检查清单**：发现"某处没做 X"时，先查 ① robots.txt / robots meta / `X-Robots-Tag` 三方信号是否一致；② 数据是否 SSR（决定爬虫拿不拿得到）；③ 换爬虫 UA 抓取是否与浏览器一致（有无 cloaking）。三者都说"开放"而实现缺失，才可判定为缺陷而非策略。

---

## 5. 自动化套件说明（加分项，非必交）

| 套件 | 用例 | 结果 | 覆盖 |
|---|---|---|---|
| `part1/onboarding.spec.ts` | 5 | **5 passed (29.4s)** | 登录链路：工作台 / Explore / 首页快捷入口 / 聊天输入 / AI 一致性 |
| `part1/journey.spec.ts` | 3 | **3 passed (22.0s)** | 旅程空状态骨架：Portfolio 空状态 / Alerts 空状态 / 聊天发指令 |
| `tests/markets.spec.ts`（已迁入公开套件） | 11 | **11 passed (1.8m)** | **Part 1↔Part 2 衔接**：6 个规范 `?tab=` 深链 / 行情非零（衔接 Part 2 `$0.0`）/ Alva Agent 伴侣区 / 带 ID 资源路由 / F-8 错参静默回退回归守卫 |

> 注：`part1/` 的 `onboarding` / `journey` 套件与探针为**本地运行产物，未纳入本仓库**（需 Alva SSO 会话，无法进 CI），上表用例数来自本机运行，作为历史证据留存。`markets.spec.ts` 测的是公开页 `/markets/<ticker>`（断言不依赖登录态），已迁入 `tests/` 纳入本仓库、可进 CI，与 `comps.spec.ts` 组成同页「UI + 数据」双覆盖。本仓库最终含本文档 + `tests/`（数据正确性 + markets UI 衔接）。

**运行**：
- Part 1 本地登录套件（本机 `part1/`，未纳入本仓库；需先 `node part1/export-state.mjs` 手动 SSO 登录导出会话）：
```bash
pnpm exec playwright test --config part1/playwright.config.ts          # onboarding+journey 共 8 条
pnpm exec playwright test --config part1/playwright.config.ts --list  # 仅列出用例
```
- markets 个股页 UI 衔接（已纳入 `tests/`，公开页、可进 CI）：
```bash
pnpm exec playwright test --grep "@markets"        # 使用根配置（tests/）
```

> **探索探针（`part1/probes/`，25 个一次性脚本，本地运行、未纳入本仓库）**：不属回归套件、不进 CI，是**本报告中每条发现的证据轨迹**——写断言前先用它们确认产品真实行为，每条都可重跑复现。命名约定：`probe-*`（探索性，边跑边看）/ `verify-*`（验证性，确认已提出的假设）。其本地说明见 `part1/probes/README.md`（该目录不随本仓库分发，仅作证据轨迹索引）。

**注意**：Alva 后端为海外模型，AI 一致性用例受跨境延迟影响，CI 中偶发超时属预期（非产品 bug）。

---

## 6. 已知未覆盖范围（AI 探针的能力边界）

以下维度**本次未覆盖**，按"为什么没覆盖 + 是否属 JD 要求"如实列示，不做打勾式充数。

**先说结论**：这些均**不属 JD 核心职责**。JD 明确要求的是「**生产环境金融数据正确性巡检**，P/E 算错了要能被巡检抓到」，以及笔试交付三件事（自动化套件 + 运行证据 + README 三节说明）——均已交付。下面 4 项属"探索式测试可延伸但非必需"的维度。

| 维度 | 自动化为何探不出 | JD 要求 | 若要覆盖，怎么测 |
|---|---|---|---|
| **视觉**：加载态 / 骨架屏反馈（尤其 automation 构建期的数分钟） | DOM 能断言"元素存在"，但判断不了"**用户是否感知到系统正在工作**"——这是感知问题，需人眼 + 计时 | ❌ 非核心职责 | 建一个 automation 并计时，观察等待期是否有明确的进度/阶段反馈 |
| **交互**：移动端布局、空状态视觉 | 可跑响应式视口截图，但"布局是否美观可用"无法断言；且本套件**刻意不做多端样式**（见 README §1 的场景选择理由） | ❌ 非核心职责 | 真机 / 模拟器走查 |
| **边界**：删 automation 后 alert 是否残留；登出后分享 Playbook 权限；重复 watch 是否去重 | **技术上可自动化，但会改变账号真实状态**——删除类操作不可逆，重复 watch 的异步构建需数分钟。为避免污染主账号，本次不做 | ❌ 非硬性要求（探索加分项） | 需要一个 disposable 测试账户；或先备份账号状态再操作 |
| **体验**：alert 真实触发的推送（仅 chat？有无通知？） | **客观不可达**——需 AMD 从 **$457** 实际跌破 **$100**，等待期不可控 | ❌ 非硬性要求 | 改用低价标的（如几美元的股票）设贴近现价的阈值；或直接检查 Alva 的 alert 配置页有没有通知渠道选项 |

> **说明**：其中「视觉 / 移动端」两项是**主动取舍**而非遗漏——JD 核心职责是数据正确性，投入产出比最高的做法是把时间花在数据断言上（这一判断已写在 README §1）。「边界」项是有意保留账号状态完整性。「体验」项是客观条件不允许。
>
> 这与 README §3「即使全绿，我仍然不放心的地方」是同一套诚实口径：**清楚知道自己没测什么、为什么没测、以及测了会怎样**，比一份假装全覆盖的清单更有价值。

### 人工走查记录模板（如需补做上述维度）

```
【严重度】P0 / P1 / P2 / P3
【模块】注册 / Automation / Playbook / Alert / AI Agent
【标题】一句话
【预期】…
【实际】…
【复现步骤】1. … 2. … 3. …
【证据】截图 / 录屏
【是否偶发】必现 / 偶发
```

**已由探针覆盖、无需人工走查的项**：

- [x] 本地化：中文 locale 下 UI 文案中英混杂（详见 **F-6**，`probes/probe-i18n.mjs` 实跑复现）
- [x] 交互（报错文案清晰度）：for-you 频道发消息报 `channel has no main session`，后端术语裸抛、无可操作性（详见 **F-7**，`probes/probe-foryou-error.mjs` 实跑复现）

---

## 附录 A：Part 1 旅程"建 watch"机制说明

建 Portfolio Watch Automation 在 Alva 中是**对话式异步 agent workflow**，非表单提交：

1. 在 chat 发 "watch AMD and alert me if it drops below $100"；
2. Alva 回复并调用 `mcp__alva__SpawnTask` 起后台任务（"Build: AMD Below $100 Alert"）；
3. 任务**异步构建 + 测试数分钟**（"being built and tested. Expect a separate update in a few minutes"）；
4. 构建完，在同一 chat 推结果，并落到 **Channels/Alva 的 Tasks/Alerts**（不进 `?tab=alerts` 的 Alpha Radar 页）。

> 注：`?tab=alerts` 是 **Alpha Radar**（连信息源、账户相关）的独立功能，与 chat 内建的 automation 不是同一落点——早期混淆源于此。

## 附录 B：与 Part 2 的缺陷对照

Part 2 套件抓到 Playbook Comp 表 EV/Market cap 全 `$0.0`。本次在 `/markets/AMD` 探到 AMD 实时价 **$457.06（真实）**，说明该 `$0.0` 缺陷**仅限 Playbook Comp 表数据管线，非全局行情源故障**——定位更精准，反而增强报告说服力。

---

## 附录 C：运行证据（Run Evidence）

> 本附录记录**数据正确性套件（Part 2）**的全量运行结果（97 passed + 1 failed，即 `$0.0` 真实数据缺陷）。Part 1 自身登录态用例（onboarding+journey 共 8 条，需 SSO；markets 页 UI 测试已迁入 `tests/`，见 §5）的结果见 §5。等价 CI 日志。

环境：Playwright 1.62.1 + Chromium，macOS，直连 `https://alva.ai`（无本地服务）。
完整运行命令：`pnpm exec playwright test --workers=1 --retries=0 --reporter=list`

---

### 证据 A：全量运行（97 passed · 1 failed，约 2.6 min）

> 1 个 failed 即 `comps.spec.ts` 抓到的真实数据缺陷（可比表 EV / Market cap 全为 `$0.0`）。
> 其余 97 条覆盖数据完整性 / 行情 KPI / 财报 / 可比公司交叉校验 / 估值 / 风险 / 新鲜度 / 外壳 / Tab / 聊天 / 元信息，全部通过。

关键通过项摘录：

```
✓ 数据完整性 › 页面无 NaN / undefined / null / [object Object] 等渲染错误占位
✓ 数据完整性 › 财报表与风险表都渲染出数据行
✓ 数据完整性 › 每张表的数据行列数与其表头一致
✓ 数据完整性 › 营收占比图例齐全且总和为 100%
✓ 行情 KPI   › 52 周高点必须不低于当前股价
✓ 行情 KPI   › 「距高点回撤」可由股价与 52 周高点算出（交叉校验）
✓ 行情 KPI   › 涨跌方向的样式标记与数值符号一致（涨红跌绿不反向）
✓ 财报数据   › 年度营收逐年增长（AMD 增长叙事，倒退即异常）
✓ 财报数据   › 毛利率落在 0~100% 区间内
✓ 财报数据   › EBITDA 不低于同期营业利润
✓ 可比公司   › 【跨表校验】AMD 的营收与年度财报表完全一致
✓ 可比公司   › 【跨表校验】AMD 的 EBITDA 与年度财报表完全一致
✓ 可比公司   › 【跨组件校验】可比表 AMD 股价与行情 SPOT 一致
✓ 估值与评级 › 【跨表校验】市值 ÷ P/S 等于季度表算出的 TTM 营收
✓ 估值与评级 › 【跨表校验】P/E 与 TTM 每股收益方向一致
✓ 风险表     › 优先级只能是 High / Medium / Low
✓ 风险表     › 趋势只能是 stable / improving / worsening
✓ 数据新鲜度 › 行情快照更新时间不晚于今天且不超过 2 天
```

失败项（即巡检抓到的真实数据缺陷）：

```
✗ 可比公司 › EV 与 Market cap 应有真实数值（当前全部为 $0.0，已知缺陷）

   以下公司 EV/市值为 0（已知取数缺陷）：
     [ "AMD: EV=$0.0 MC=$0.0",
       "INTC: EV=$0.0 MC=$0.0",
       "NVDA: EV=$0.0 MC=$0.0",
       "QCOM: EV=$0.0 MC=$0.0",
       "TSM:  EV=$0.0 MC=$0.0",
       "ARM:  EV=$0.0 MC=$0.0",
       "AVGO: EV=$0.0 MC=$0.0",
       "MRVL: EV=$0.0 MC=$0.0",
       "All-peer average: EV=$0.0 MC=$0.0",
       "All-peer median:  EV=$0.0 MC=$0.0" ]

    at tests/comps.spec.ts:186:61
```

> 注意：同表的 Revenue / GP / EBITDA / P/E 均正常填充，唯独 EV 与 Market cap 为 `$0.0`，
> 说明是这两列的取数缺失，而非全局限流或加载失败。缺陷已固化为活跃失败用例，
> 修复后该条会变绿、套件整体回归全绿。

---

### 证据 B：单文件复跑（comps.spec.ts · 11 passed · 1 failed，14.6s）

为隔离验证「红用例确实在抓 bug、而非限流误伤」，单独复跑 `comps.spec.ts`：
除 EV/MC 这条外，其余 11 条（含 3 条跨表交叉校验）全部通过，且页面数据正常加载
（证实 `$0.0` 是列级取数缺陷，不是加载失败）。失败 diff 同上。

---

### 证据 C：二次复验（时隔 5 小时 · 新数据快照 · 97 passed · 1 failed · 3.0 min）

> 页面每约 4 小时自动刷新数据快照。为排除「`$0.0` 只是某一次加载失败的偶发现象」，
> 于**首跑 5 小时后（数据快照已刷新一轮）独立重跑全量**，结果**与证据 A 完全一致**：

```
97 passed (3.0m)
1 failed —— tests/comps.spec.ts:186 › EV 与 Market cap 应有真实数值（当前全部为 $0.0）

   AMD / AVGO / INTC / NVDA / QCOM / MRVL / TSM
   + Average / Median / All-peer average / All-peer median  → 全部 EV=$0.0 MC=$0.0
```

**这条复验的价值在于排除竞争性解释**：

| 若只跑一次，无法排除 | 二次复验后的判定 |
|---|---|
| 站点限流导致数据没加载出来 | ❌ 排除：同表 Revenue / GP / EBITDA / P/E **均正常填充**，唯独 EV 与 MC 两列为 0；且其余 97 条（含 3 条跨表交叉校验）全绿 |
| 单次缓存串号 / 偶发渲染故障 | ❌ 排除：相隔 5 小时、**不同数据快照**下稳定复现同一现象 |
| → | ✅ 判定为**稳定的列级取数缺陷**（EV / Market cap 两列的数据管线取数失败），而非环境或限流噪声 |

> 附注：两次运行列出的公司集合略有差异（首跑含 ARM，复跑无 ARM，但均含 Average/Median 汇总行）。
> 这说明可比公司列表本身会随快照浮动，而**缺陷在所有快照下恒定存在**——进一步佐证其稳定性。

其余 97 条跨两个数据快照均通过，也说明套件本身**不脆弱**（未因页面刷新而产生 flaky）。

---

### 如何复现

```bash
pnpm install
pnpm exec playwright install chromium
pnpm exec playwright test --workers=1 --reporter=list
# 期望：97 passed + 1 failed（failed = 已知的 $0.0 数据缺陷）
# 只看数据正确性绿集：pnpm run test:data  （含该红用例，仍会红）
# 跳过已知缺陷看其余全绿：pnpm exec playwright test --grep-invert "EV 与 Market cap"
```
