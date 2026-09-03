/**
 * 数值解析工具 —— 把页面上的展示字符串还原成可比较的数字。
 *
 * 站点里同一类数据有多种写法，解析必须覆盖全部，否则断言会漏判：
 *   金额：$750.1B / $625.0M / $457.06 / $0.0 / $961.1M
 *   百分比：-17.25% / +104.53% / 46.0% / -21.83% from high
 *   倍数：116.6× / 278.6× / NM（无意义）/ —（空）
 *
 * 所有函数都返回 null 表示「无法解析」或「空值」，
 * 绝不返回 0 或 NaN —— 0 是有业务含义的合法值，不能用它表示缺失。
 */

/** em dash / en dash / 横杠：站点用它表示「无数据」 */
export const EMPTY_VALUES = new Set(['—', '–', '-', '–', '', 'N/A', 'NA', 'NM']);

/** 单位换算 */
const UNIT_FACTOR: Record<string, number> = {
  K: 1e3,
  M: 1e6,
  MM: 1e6,
  B: 1e9,
  BN: 1e9,
  T: 1e12,
};

/**
 * 判断是否是「空值」展示（—、—、NM 等）。
 * 注意：区别于 0 —— "$0.0" 不是空值，它是真实的（可疑的）数值。
 */
export function isEmptyValue(raw: string | null | undefined): boolean {
  if (raw == null) return true;
  const t = raw.trim();
  return EMPTY_VALUES.has(t);
}

/**
 * 解析金额展示串。
 *   "$750.1B"  → 750_100_000_000
 *   "$625.0M"  →   625_000_000
 *   "$457.06"  →           457.06
 *   "$0.0"     →             0
 *   "—" / null →          null
 */
export function parseMoney(raw: string | null | undefined): number | null {
  if (isEmptyValue(raw)) return null;
  const m = /^\s*\$?\s*(-?[\d,]+(?:\.\d+)?)\s*([KMBT]{1,2})?\s*$/i.exec(String(raw));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || '').toUpperCase();
  const factor = unit ? UNIT_FACTOR[unit] : 1;
  if (factor === undefined) return null;
  return n * factor;
}

/**
 * 解析百分比展示串（返回「百分数本身」，不是小数）。
 *   "-17.25%"                → -17.25
 *   "+104.53%"               → 104.53
 *   "46.0%"                  → 46
 *   "-21.83% from high"      → -21.83   （容忍后缀说明文字）
 *   "—" / null               → null
 */
export function parsePercent(raw: string | null | undefined): number | null {
  if (isEmptyValue(raw)) return null;
  const m = /^\s*([+-]?\s*\d+(?:\.\d+)?)\s*%/.exec(String(raw));
  if (!m) return null;
  const n = Number(m[1].replace(/\s+/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * 解析估值倍数。
 *   "116.6×" / "278.6×" → 116.6 / 278.6
 *   "NM" / "—"          → null（公司当期亏损、P/E 无意义，属正常展示）
 */
export function parseMultiple(raw: string | null | undefined): number | null {
  if (isEmptyValue(raw)) return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[×x]\s*$/i.exec(String(raw));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 解析纯整数计数（分析师覆盖数等） */
export function parseCount(raw: string | null | undefined): number | null {
  if (isEmptyValue(raw)) return null;
  const m = /^\s*(\d+)\s*$/.exec(String(raw));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 解析 ISO 日期 "2026-09-02" → Date（本地零点） */
export function parseIsoDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** 解析 "Sep 3, 2026" / "Aug 5, 2026" 这类展示日期 */
export function parseDisplayDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /([A-Za-z]{3})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(String(raw));
  if (!m) return null;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const d = new Date(Number(m[3]), month, Number(m[2]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 相差天数（a - b，按自然日，取整） */
export function daysBetween(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  const au = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bu = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((au - bu) / MS);
}

/** 相对误差（0~1）。用于「两个来源的同一指标应当接近」这类断言。 */
export function relativeDiff(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return 0;
  return Math.abs(a - b) / base;
}

/**
 * 展示串是否疑似脏数据。
 * 用于「页面不应出现渲染错误残留」的全量扫描 —— 这类文本一旦出现，
 * 说明前端把未定义值直接渲染出来了，是有明确业务影响的数据故障。
 */
export const DIRTY_PATTERNS = [
  'NaN',
  'undefined',
  'Infinity',
  '[object Object]',
  'null',
  '$NaN',
  'NaN%',
  'NaN×',
];

export function findDirtyValues(texts: string[]): string[] {
  return texts.filter((t) => DIRTY_PATTERNS.some((p) => t.includes(p)));
}
