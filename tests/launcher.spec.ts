import { expect, test } from '@playwright/test';

test('home renders with a clear primary action and named controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await expect(page.getByRole('button', { name: '立即启动' })).toBeVisible();
  await expect(page.getByLabel('当前实例')).toHaveValue('main');
  const unnamedButtons = await page.locator('button').evaluateAll((buttons) => buttons.filter((button) => !button.textContent?.trim() && !button.getAttribute('aria-label')).length);
  expect(unnamedButtons).toBe(0);
  await page.screenshot({ path: 'artifacts/home-1440.png', animations: 'disabled' });
});

test('creates, validates and persists an instance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建实例' }).click();
  const dialog = page.getByRole('dialog', { name: '新建实例' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: '全新创建' }).click();
  await page.getByRole('button', { name: '创建实例' }).click();
  await expect(page.getByRole('alert')).toHaveText('请输入实例名称。');
  await page.getByLabel('实例名称').fill('测试长名称实例');
  await page.getByLabel('游戏版本').selectOption('1.21.3');
  await page.getByRole('button', { name: '创建实例' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: '测试长名称实例' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '测试长名称实例' })).toBeVisible();
});

test('launch state can complete and reset', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '立即启动' }).click();
  await expect(page.getByRole('button', { name: /正在准备/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: '结束运行' })).toBeVisible({ timeout: 6000 });
  await expect(page.getByText('界面演示正在运行')).toBeVisible();
  await page.getByRole('button', { name: '结束运行' }).click();
  await expect(page.getByRole('button', { name: '立即启动' })).toBeVisible();
});

test('instance search exposes a useful empty state and recovery', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '实例库', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索实例' }).fill('不存在的实例');
  await expect(page.getByRole('heading', { name: '没有匹配的实例' })).toBeVisible();
  await page.getByRole('button', { name: '清除搜索' }).click();
  await expect(page.locator('.instance-row')).toHaveCount(3);
  await page.screenshot({ path: 'artifacts/instances-1440.png', animations: 'disabled' });
});

test('version categories and creation update the instance library', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '实例库', exact: true }).click();
  await page.getByRole('button', { name: '新建实例' }).click();
  await page.getByRole('button', { name: '全新创建' }).click();
  await page.getByRole('button', { name: '快照版', exact: true }).click();
  await page.getByLabel('实例名称').fill('快照 25w45a');
  await page.getByLabel('游戏版本').selectOption('25w45a');
  await page.getByRole('button', { name: '创建实例' }).click();
  await page.getByRole('button', { name: '实例库', exact: true }).click();
  await expect(page.locator('.instance-row').filter({ hasText: '25w45a' })).toHaveCount(1);
  await expect(page.locator('.instance-row').filter({ hasText: '25w45a' })).toContainText('版本 25w45a');
});

test('instance library exposes download tasks and both creation paths', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '实例库', exact: true }).click();
  await expect(page.locator('.page-heading-actions').getByRole('button', { name: /下载任务/ })).toBeVisible();
  await page.getByRole('button', { name: '新建实例' }).click();
  await page.getByRole('button', { name: '导入已有' }).click();
  await expect(page.getByRole('button', { name: /整合包文件/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /启动器目录/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /\.minecraft 文件夹/ })).toBeVisible();
  await page.getByRole('button', { name: /返回/ }).click();
  await page.getByRole('button', { name: '全新创建' }).click();
  await expect(page.getByRole('button', { name: '正式版' })).toBeVisible();
  await expect(page.getByRole('button', { name: '愚人节版' })).toBeVisible();
  await expect(page.getByRole('button', { name: '远古版' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fabric', exact: true })).toBeVisible();
});

test('discover browses resources, filters and queues an install', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '发现内容', exact: true }).click();
  await expect(page.getByRole('heading', { name: '发现内容' })).toBeVisible();

  const cards = page.locator('.discover-card');
  await expect(cards.first()).toContainText('Fabulously Optimized');

  const search = page.getByRole('searchbox', { name: '搜索资源' });
  await search.fill('Cobblemon');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Cobblemon');
  await search.fill('');

  await page.getByRole('tab', { name: '光影包' }).click();
  await expect(cards.first()).toContainText('Complementary Reimagined');

  await page.getByRole('tab', { name: '整合包' }).click();
  await cards.first().getByRole('button', { name: '安装' }).click();
  await expect(page.locator('.toast')).toContainText('已开始创建整合包实例');

  // 整合包入队后会打开下载队列，先关闭再继续验证收藏流程
  const downloadsDialog = page.getByRole('dialog', { name: '下载任务' });
  await expect(downloadsDialog).toBeVisible();
  await downloadsDialog.getByRole('button', { name: '关闭弹窗' }).click();
  await expect(downloadsDialog).not.toBeVisible();

  await cards.first().getByRole('button', { name: /收藏/ }).click();
  await page.getByRole('tab', { name: '收藏夹' }).click();
  await expect(cards.first()).toContainText('Fabulously Optimized');
});

test('settings persist and reduced motion is applied to the document', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const motionToggle = page.getByRole('switch', { name: '减少动态效果' });
  await motionToggle.click();
  await expect(motionToggle).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '冰川', exact: true }).click();
  expect(await page.locator('html').getAttribute('data-accent')).toBe('cyan');
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '减少动态效果' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: 'artifacts/settings-1440.png', animations: 'disabled' });
});

test('theme choice persists and light surfaces replace dark glass', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: '首页', exact: true }).click();
  const badge = page.locator('.orbit-badge').first();
  await expect(badge).toBeVisible();
  const surface = await badge.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
    };
  });
  expect(surface.background).toContain('255, 255, 255');
  expect(surface.text).toBe('#131923');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
});

test('accent palette and glass material can be customised and persisted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();

  await page.getByRole('button', { name: '紫藤', exact: true }).click();
  expect(await page.locator('html').getAttribute('data-accent')).toBe('violet');
  await expect(page.locator('.accent-value')).toHaveText('#C0A8FF');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#c0a8ff');

  await page.getByLabel('自定义主题色').fill('#4fd1c5');
  expect(await page.locator('html').getAttribute('data-accent')).toBe('custom');
  await expect(page.locator('.accent-value')).toHaveText('#4FD1C5');

  expect(await page.locator('html').getAttribute('data-glass')).toBe('on');
  await page.getByRole('switch', { name: '全局透明材质' }).click();
  expect(await page.locator('html').getAttribute('data-glass')).toBe('off');
  await page.getByRole('switch', { name: '全局透明材质' }).click();
  await page.getByRole('button', { name: '通透', exact: true }).click();
  expect(await page.locator('html').getAttribute('data-glass-level')).toBe('clear');

  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  expect(await page.locator('html').getAttribute('data-accent')).toBe('custom');
  expect(await page.locator('html').getAttribute('data-glass-level')).toBe('clear');
  await expect(page.locator('.accent-value')).toHaveText('#4FD1C5');
});

test('desktop and compact layouts do not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/home-1024.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: '立即启动' })).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-390.png', animations: 'disabled' });
});

test('modal supports Escape and browser window controls explain their boundary', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建实例' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '最小化', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('请在 Tauri 桌面窗口中使用此功能。');
});
