# 运行证据（Test Run Evidence）

等价 CI 日志。环境：Playwright 1.62.1 + Chromium，macOS，直连 `https://alva.ai`（无本地服务）。
完整运行命令：`npx playwright test --workers=1 --retries=0 --reporter=list`

---

## 证据 A：全量运行（97 passed · 1 failed，约 2.6 min）

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

## 证据 B：单文件复跑（comps.spec.ts · 11 passed · 1 failed，14.6s）

为隔离验证「红用例确实在抓 bug、而非限流误伤」，单独复跑 `comps.spec.ts`：
除 EV/MC 这条外，其余 11 条（含 3 条跨表交叉校验）全部通过，且页面数据正常加载
（证实 `$0.0` 是列级取数缺陷，不是加载失败）。失败 diff 同上。

---

## 如何复现

```bash
npm install
npx playwright install chromium
npx playwright test --workers=1 --reporter=list
# 期望：97 passed + 1 failed（failed = 已知的 $0.0 数据缺陷）
# 只看数据正确性绿集：npm run test:data  （含该红用例，仍会红）
# 跳过已知缺陷看其余全绿：npx playwright test --grep-invert "EV 与 Market cap"
```
