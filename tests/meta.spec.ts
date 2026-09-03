import { test, expect } from '@playwright/test';
import { PLAYBOOK_PATH, PAGE_TITLE, gotoPlaybook } from './helpers/common';

test.describe('元信息与页面健康 @ui', () => {
  test('iframe 指向版本化的 playbook 仪表盘', async ({ page }) => {
    await gotoPlaybook(page);
    const iframe = page.locator('iframe[title="Dashboard"]');
    await expect(iframe).toHaveCount(1);

    const src = await iframe.getAttribute('src');
    expect(src).toBeTruthy();
    // 内容域与 playbook 标识（版本号会变，不锁死）
    expect(src!).toMatch(/playbook\.alva\.ai/);
    expect(src!).toMatch(/amd-deep-dive/);
  });

  test('meta description 与页面主题一致', async ({ page }) => {
    await gotoPlaybook(page);
    const desc = await page
      .locator('meta[name="description"]')
      .getAttribute('content');
    // description 存在且描述 AMD 研究仪表盘（文案可能微调，锁主题词）
    expect(desc).toBeTruthy();
    expect(desc!).toMatch(/research dashboard/i);
    expect(desc!).toMatch(/AMD/i);
  });

  test('无未捕获的 JS 异常', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await gotoPlaybook(page);
    await page.waitForTimeout(8000); // 给 SPA 初始化和异步逻辑留时间

    // 资源 401/403（未登录账户接口、被墙的统计脚本）是已知噪音，
    // 这里只断言没有未捕获的运行时异常
    expect(pageErrors, `未捕获异常: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('未登录时提供 Log in 入口', async ({ page }) => {
    await gotoPlaybook(page);
    await expect(page.getByText('Log in', { exact: true })).toBeVisible();
  });

  test('主文档无语义化标题（a11y 现状记录）', async ({ page }) => {
    await gotoPlaybook(page);
    // 站点主文档目前没有任何 h1~h6（外壳标题是 span）。
    // 注意：iframe 仪表盘内部有 <h1 class="page-header-title">，
    // 这里 page.locator 不穿透 iframe，只统计主文档。
    // 一旦主文档补上语义化标题，请复核 shell 测试是否可改用更稳的选择器。
    const headingCount = await page.locator('h1, h2, h3, h4, h5, h6').count();
    if (headingCount > 0) {
      throw new Error(
        '主文档已引入语义化标题 —— 请复核 shell.spec 是否可改用更稳的标题选择器'
      );
    }
    expect(headingCount).toBe(0);
  });
});
