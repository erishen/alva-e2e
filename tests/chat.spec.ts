import { test, expect } from '@playwright/test';
import { gotoPlaybook } from './helpers/common';

test.describe('右侧聊天区（未登录可见） @ui', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPlaybook(page);
  });

  test('Alva 智能体欢迎语可见', async ({ page }) => {
    // 不带 "I'm" —— 站点用弯撇号（U+2019），直撇号正则匹配不上。
    // 延长局部超时：线上站点偶发慢加载致欢迎语 DOM 晚到（flaky 源），CI 另有 retries 兜底。
    await expect(page.getByText(/your AI investing agent/)).toBeVisible({ timeout: 45_000 });
  });

  test('五个功能建议卡片齐全', async ({ page }) => {
    const suggestions = [
      'Watch your portfolio 24/7',
      'Set up your Alpha Radar',
      'Get a quick read on any ticker',
      'Screen the market on your rules',
      'Build your own automations',
    ];
    for (const s of suggestions) {
      await expect(page.getByText(s).first()).toBeVisible();
    }
  });

  test('建议卡片带说明文案', async ({ page }) => {
    // 卡片 = 标题 + 一句说明，抽验说明文案存在（内容可能微调，用特征短语）
    await expect(
      page.getByText(/message you only when a move, risk, catalyst/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/surface up to 3 evidence-backed opportunities/i).first()
    ).toBeVisible();
  });

  test('输入框存在且可以输入文字（不发送）', async ({ page }) => {
    const input = page.locator('[contenteditable="true"]');
    await expect(input).toHaveCount(1);

    await input.click();
    await page.keyboard.type('What is AMD trading at?');
    await expect(input).toContainText('What is AMD trading at?');

    // 清空 —— 只验证可输入性，绝不点击发送按钮（避免调用对方 AI 服务）
    await input.fill('');
    await expect(input).not.toContainText('What is AMD trading at?');
  });

  test('输入框提示文案', async ({ page }) => {
    await expect(page.getByText(/Ask Alva anything/)).toBeVisible();
  });

  test('语音输入按钮可达', async ({ page }) => {
    await expect(page.locator('[aria-label="Start voice input"]')).toBeVisible();
  });
});
