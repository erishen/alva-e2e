#!/usr/bin/env node
// 校验每日 @data 生产巡逻结果。
//
// 背景：套件里有一个「已知缺陷哨兵用例」——alva.ai 可比公司页的 EV / Market cap
// 整列渲染成 $0.0（见 tests/comps.spec.ts 内注释与 evidence/ 截图）。哨兵设计为
// 缺陷修复前保持失败、修复后自动变绿。巡逻的目标是「数据回归不悄悄溜过」，
// 而不是让 CI 长期挂着已知红，所以本脚本放行已登记的哨兵失败：
//   - 报告缺失 / 无法解析 / 没跑任何用例   → 退出 1（防静默空跑）
//   - 失败用例全部是已登记哨兵             → 退出 0（打印提示，证据仍在报告里）
//   - 存在任何未登记的失败                 → 退出 1（真实告警）
import { readFileSync } from 'node:fs';

// 已登记的「预期失败」哨兵用例：文件名双向后缀匹配（JSON 报告里的 spec.file
// 可能是 'comps.spec.ts' 也可能是 'tests/comps.spec.ts'）且完整标题包含该片段。
//
// 哨兵登记门槛：失败原因必须与上游 alva.ai 公开数据强相关，且 CI 与本地实跑都能
// 复现。2026-09-07 起的两条新哨兵共用同一上游根因（AMD Deep-Dive playbook 的
// 「Latest signal」字段整列渲染为「—」），分两条登记是为了「部分修复时还能
// 触发新信号」—— 若合并为一条，将来上游只修一半就完全静音了。
const KNOWN_FAILURES = [
  {
    file: 'tests/comps.spec.ts',
    titleIncludes: 'EV 与 Market cap 应有真实数值',
    reason: 'alva.ai 可比表 EV/Market cap 整列 $0.0（上游缺陷，修复后自动转绿）',
  },
  {
    file: 'tests/data-integrity.spec.ts',
    titleIncludes: '财报表的历史列不能有空值',
    reason: 'alva.ai AMD playbook「Latest signal」列整列渲染为「—」'
      + '（上游数据缺失，2026-09-07 起；CI run 34094914809 + 本机 2026-09-08 实跑均复现：'
      + '56 passed / 3 failed，其它 56 项数据正常加载，可排除选择器/时序问题）',
  },
  {
    file: 'tests/risk.spec.ts',
    titleIncludes: '最近信号都带日期',
    reason: 'alva.ai AMD playbook 风险表 7 条「Latest signal」全部为「—」'
      + '（与 data-integrity 那条同源：上游数据缺失，2026-09-07 起）',
  },
];

const reportPath = process.argv[2] ?? 'patrol-report.json';

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch {
  // 兜底：报告文件若混入了 reporter 的终端输出，截取最外层 JSON 再试一次
  const raw = readFileSync(reportPath, 'utf8');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  try {
    report = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    console.error(`❌ 无法读取巡逻报告 ${reportPath}: ${err.message}`);
    process.exit(1);
  }
}

// 收集全部 spec（携带套件层级标题作为完整用例名）
const specs = [];
const walk = (suite, ancestry) => {
  const here = [...ancestry, suite.title].filter(Boolean);
  for (const child of suite.suites ?? []) walk(child, here);
  for (const spec of suite.specs ?? []) specs.push({ spec, title: [...here, spec.title].join(' › ') });
};
for (const s of report.suites ?? []) walk(s, []);

if (specs.length === 0) {
  console.error('❌ 巡逻报告里没有任何用例 —— 套件可能没跑起来（grep 过滤/环境问题？）');
  process.exit(1);
}

const failures = [];
for (const { spec, title } of specs) {
  for (const test of spec.tests ?? []) {
    if (test.status === 'unexpected') failures.push({ file: spec.file ?? '', title });
  }
}

const known = (f) =>
  KNOWN_FAILURES.some(
    (k) => (f.file.endsWith(k.file) || k.file.endsWith(f.file)) && f.title.includes(k.titleIncludes)
  );
const unexpected = failures.filter((f) => !known(f));

console.log(`巡逻完成：${specs.length} 个用例，${failures.length} 个失败。`);

if (unexpected.length > 0) {
  console.error('❌ 存在未登记的失败用例（真实数据回归）：');
  for (const f of unexpected) console.error(`   - [${f.file}] ${f.title}`);
  process.exit(1);
}

if (failures.length > 0) {
  for (const f of failures) {
    const entry = KNOWN_FAILURES.find(
      (k) => (f.file.endsWith(k.file) || k.file.endsWith(f.file)) && f.title.includes(k.titleIncludes)
    );
    console.log(`⚠️ 已知缺陷哨兵（放行）：${f.title}`);
    console.log(`   ${entry?.reason ?? ''}`);
  }
  console.log('✅ 仅已知缺陷失败，放行。证据见 HTML 报告 artifact 与 evidence/。');
  process.exit(0);
}

console.log('✅ 巡逻全绿（已知缺陷已修复，哨兵转绿）。');
process.exit(0);
