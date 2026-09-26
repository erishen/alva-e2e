import { test, expect } from '@playwright/test';
import { PAGE_TITLE, gotoPlaybook } from './helpers/common';

test.describe('页面外壳 @ui', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPlaybook(page);
  });

  test('标题与地址正确', async ({ page }) => {
    await expect(page).toHaveTitle(PAGE_TITLE);
    await expect(page.getByText(PAGE_TITLE).first()).toBeVisible();
  });

  test('作者信息与个人主页链接', async ({ page }) => {
    const author = page.locator('a[href="/profile?username=lake"]');
    await expect(author).toHaveCount(1);
    await expect(author).toHaveText(/Mickie/);
  });

  test('Playbook 头部 CTA 渲染（站点已移除旧 README/Automations 徽章）', async ({
    page,
  }) => {
    // 站点于 2026-09-24 前后改版：原「README」「<n> Automations」徽章被移除，
    // 头部改为「Subscribe / Remix」等 CTA。这两个 CTA 是响应式元素
    // （窄屏 display:none），故断言「存在于 DOM」而非「可见」，既捕获被移除的真实回归，
    // 又不受响应式显隐影响。
    await expect(
      page.getByText('Subscribe', { exact: true }).first()
    ).toBeAttached();
    await expect(
      page.getByText('Remix', { exact: true }).first()
    ).toBeAttached();
  });

  test('playbook 描述文案可见', async ({ page }) => {
    await expect(
      page.getByText(/A live research dashboard for tracking AMD/)
    ).toBeVisible();
    // 描述里的固定特征文案（收起态就能看到的尾部）
    await expect(page.getByText(/refreshed every 4 hours/)).toBeVisible();
  });

  test('Show more 展开后变为 Show less', async ({ page }) => {
    const showMore = page.getByText('Show more', { exact: true });
    await expect(showMore).toBeVisible();
    await showMore.click();

    const showLess = page.getByText('Show less', { exact: true });
    await expect(showLess).toBeVisible();
    await expect(showMore).toHaveCount(0);
  });

  test('侧边栏主导航链接与指向', async ({ page }) => {
    const nav = [
      { text: 'New Chat', href: '/new_chat' },
      { text: 'Explore', href: '/explore' },
      { text: 'Portfolio', href: '/portfolio' },
    ];
    for (const { text, href } of nav) {
      const link = page.locator(`a[href="${href}"]`, { hasText: text });
      await expect(link.first()).toBeVisible();
    }
    // Markets 是按钮（非链接），单独验证可见
    await expect(page.getByText('Markets', { exact: true })).toBeVisible();
  });
});
