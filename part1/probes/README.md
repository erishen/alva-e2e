# 探索探针（one-off exploration scripts）

本目录是 **Part 1 探索式测试的证据轨迹**，不是回归套件。

## 它们是什么

25 个一次性 Playwright 脚本，用于**实地探测 Alva 的真实行为**——每写一条断言前先用它确认"产品到底是怎么工作的"，每条都可直接重跑复现。

**关键定位**：这些脚本**不参与 CI、不做断言、不在 `part1/*.spec.ts` 套件内**。真正的回归保障是 `part1/` 根目录下的 3 个 spec（19 条用例）。本目录存在的意义是**让报告里的每条发现都可复现、可追责**。

## 用法

```bash
# 需先导出登录态（脚本默认读取 part1/.auth/alva.json）
node part1/export-state.mjs

# 跑任一探针（示例：复现 for-you 频道的 409 报错）
node part1/probes/probe-foryou-error.mjs
```

## 与报告发现的对应

| 发现 | 探针 |
|---|---|
| **F-1** chat / task 混用、automation 可见性分裂 | `probe-alva-channel.mjs`、`probe-chats-list.mjs`、`probe-chat-by-id.mjs` |
| **F-3 / F-7** for-you 只读频道被当聊天渲染、报 `channel has no main session` | `probe-foryou-error.mjs`、`verify-for-you.mjs` |
| **F-6** zh locale 下英文残留 | `probe-i18n.mjs` |
| **F-8** markets 页 `?tab=` 命名不统一 + 错参静默回退 | `probe-markets-tabs-v2.mjs`（高亮 + 内容长度）、`probe-markets-click.mjs`（点击反推规范 param）、`probe-markets-canonical.mjs`（验证驼峰深链生效） |
| **F-9** markets 页 SEO：通用 title / 无 canonical / sitemap 未收录 | `probe-seo.mjs` |
| 路由可达性（区分带 ID 资源路由 vs 无 ID 功能路由） | `probe-routes.mjs`、`probe-markets.mjs` |
| AI 一致性 / 频道语义 | `probe-chat.mjs`、`probe-chats-list.mjs`、`probe-alerts.mjs`、`probe-alert-status.mjs`、`probe-skills.mjs` |
| 侧栏 / 视图 / 新建入口 | `verify-sidebar.mjs`、`verify-tab.mjs`、`verify-channels.mjs`、`verify-newchat.mjs`、`verify-addchannel.mjs` |

## 命名约定

- `probe-*` —— **探索性**探测，目的未知、边跑边看（如 `probe.mjs` 是最早的整体结构扫描）。
- `verify-*` —— **验证性**复跑，针对某个已提出的假设做定性确认。

## 会话文件路径约定（重要）

所有探针统一用**相对脚本自身位置**的方式定位会话文件，**不依赖运行时的 cwd、也不依赖仓库目录名**：

```js
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH = resolve(__dirname, '..', '.auth', 'alva.json');
```

因为脚本在 `part1/probes/` 下，故需 `..` 回到 `part1/.auth/`。这样无论从哪个目录执行（`node part1/probes/x.mjs`、`cd /tmp && node /abs/path/x.mjs`）都能正常加载。

## ⚠️ 已知教训（写在README里防再犯）

### 1. 深链参数：先点击 UI 反推规范值，再断言

`probe-markets-tabs-v2.mjs` 曾因**用直觉拼写 `?tab=news` / `?tab=smart-money` 做断言**，误报"这两个 tab 深链坏了"。真实规范值是驼峰 `newsSocial` / `smartMoney`——是 `probe-markets-click.mjs`（点击 UI 读 URL 反推）才澄清的。

⇒ **深链测试的固定套路：先点击 UI 读 URL 反推规范参数值，再用规范值做深链断言。** 直接凭直觉拼写几乎必然产生假阳性。

### 2. 移动脚本后必须复验，不能只验"测试能否被发现"

本目录的探针原本在 `part1/` 根下，归档到 `part1/probes/` 时**只验证了 Playwright 仍能发现 19 条 spec 用例（`--list`）就认为安全**，结果 **15 个探针全部失效**——它们用 `resolve(__dirname, '.auth', ...)` 定位会话文件，归档后 `__dirname` 从 `part1/` 变成 `part1/probes/`，指向了不存在的 `part1/probes/.auth/`。

根因：探针是 `.mjs`、不匹配 Playwright 的 `**/*.spec.*` 模式，**`--list` 根本不会去加载它们**，所以"测试发现正常"完全不能证明"探针仍可运行"。

⇒ **两条固定纪律：**
1. 脚本一律用"相对自身位置"定位资源（见上方路径约定），**不要写绝对路径、不要依赖 `process.cwd()`**。
2. 移动/重命名任何脚本后，**必须实际执行至少一个**验证它仍能跑通——不能只用 `--list` 之类的静态检查代替。
