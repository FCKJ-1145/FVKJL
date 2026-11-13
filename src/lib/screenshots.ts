/**
 * 截图中心（桌面端专用）：汇总所有实例 / 版本目录下的截图。
 *
 * 截图走 Tauri asset 协议（后端逐文件放行），浏览器预览不可用。
 */

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke(command, args)) as T;
}

export interface GameScreenshot {
  id: string;
  instanceId: string;
  instanceName: string;
  fileName: string;
  /** ISO 时间（取自截图文件创建时间） */
  createdAt: string;
  modifiedAt: number;
  path: string;
  /** asset 协议地址，可直接给 <img src> */
  url: string;
}

interface RawScreenshot {
  id: string;
  instance_id: string;
  instance_name: string;
  file_name: string;
  created_at: string;
  modified_at: number;
  group_id: string | null;
  path: string;
  url: string;
}

interface RawScanResult {
  screenshots: RawScreenshot[];
  skipped_instances: string[];
}

export interface ScreenshotScan {
  screenshots: GameScreenshot[];
  /** 无权限 / 目录缺失而被跳过的实例数 */
  skipped: number;
}

/** 扫描全部实例的 screenshots 目录，按时间倒序返回 */
export async function listAllScreenshots(): Promise<ScreenshotScan> {
  const raw = await invokeCommand<RawScanResult>('plugin:instance|instance_list_all_screenshots');
  const screenshots = (raw.screenshots ?? [])
    .map((item) => ({
      id: item.id,
      instanceId: item.instance_id,
      instanceName: item.instance_name,
      fileName: item.file_name,
      createdAt: item.created_at,
      modifiedAt: item.modified_at,
      path: item.path,
      url: item.url,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { screenshots, skipped: (raw.skipped_instances ?? []).length };
}

/** 在资源管理器里定位某张截图 */
export async function revealScreenshot(path: string): Promise<void> {
  await invokeCommand<void>('plugin:utils|highlight_in_folder', { path });
}
