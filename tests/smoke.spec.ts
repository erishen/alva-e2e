import { test, expect } from '@playwright/test';
import {
  PLAYBOOK_PATH,
  PAGE_TITLE,
  DATA_TIMEOUT,
  gotoPlaybook,
  companyHeading,
} from './helpers/common';

test.describe('冒烟测试 @smoke', () => {
  test('页面可达且核心内容最终渲染', async ({ page }) => {
    await gotoPlaybook(page);

    await expect(page).toHaveURL(new RegExp(PLAYBOOK_PATH.replace(/\//g, '\\/') + '$'));
    await expect(page).toHaveTitle(PAGE_TITLE);

    // 仪表盘 iframe 里的公司名标题最终可见（数据填充可能需要数十秒）
    await expect(companyHeading(page)).toBeVisible({ timeout: DATA_TIMEOUT });
  });
});
