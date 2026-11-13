export type WindowAction = 'minimize' | 'maximize' | 'close';

export function isDesktop() {
  return '__TAURI_INTERNALS__' in window;
}

export async function controlWindow(action: WindowAction) {
  if (!isDesktop()) return false;

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();
  if (action === 'minimize') await appWindow.minimize();
  if (action === 'maximize') await appWindow.toggleMaximize();
  if (action === 'close') await appWindow.close();
  return true;
}

/**
 * 全局透明材质：通知 Rust 侧开 / 关 DWM 高斯模糊（blur-behind）。
 *
 * 模糊由系统合成器实时渲染 —— 窗口移动、缩放全程零开销，桌面画面
 * 实时透出且没有抓图噪点。区域按卡片圆角自动对齐，这里只传开关。
 */
export async function setGlass(enabled: boolean) {
  if (!isDesktop()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_glass', { enabled });
  } catch {
    // 命令不可用时保持现状：页面内的着色层依旧按设置渲染
  }
}

/**
 * 窗口在配置里是隐藏创建的，等首帧绘制完成后再显示，
 * 避免 WebView2 默认白底先闪一下。
 */
export async function revealWindow() {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const appWindow = getCurrentWindow();

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const releaseBootLock = () => document.documentElement.classList.remove('boot');

  try {
    await appWindow.show();
    await appWindow.setFocus();
  } catch {
    // 权限异常时兜底再试一次，避免窗口一直不可见
    window.setTimeout(() => void appWindow.show().catch(() => {}), 800);
  } finally {
    // 滚动锁要一直保持到「字体就绪」之后：
    // 界面字体是 font-display: swap，先拿系统字体渲染、Bricolage 到位后再替换，
    // 替换那一瞬间行高会变，内容可能比视口高一点 → 闪出滚动条。
    // 锁住滚动容器，等字体替换完成、重排稳定后再放开，用户就看不到那一下。
    const fontsReady = typeof document.fonts !== 'undefined' && document.fonts.ready
      ? document.fonts.ready
      : Promise.resolve();
    fontsReady
      .then(() => window.setTimeout(releaseBootLock, 220))
      .catch(() => releaseBootLock());
    window.setTimeout(releaseBootLock, 1600); // 兜底，绝不长期锁死滚动
  }
}
