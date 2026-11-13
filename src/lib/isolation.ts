import type { IsolationPolicy } from '../types';

/** 快照 / 预发布版判定：1.21.4-pre1、24w14a、1.20.5-rc1 这类 */
export function isSnapshotVersion(version: string): boolean {
  const value = version.trim().toLowerCase();
  return /^\d{2}w\d{2}[a-z]$/.test(value)
    || /-(pre|rc)\d*$/.test(value)
    || value.includes('snapshot');
}

/** 可安装 Mod 的版本 = 装了加载器的实例 */
export function isModdableLoader(loader: string): boolean {
  return Boolean(loader) && loader.toLowerCase() !== 'vanilla';
}

/** 按默认隔离策略判断某个新建实例是否使用独立目录 */
export function shouldIsolateInstance(
  policy: IsolationPolicy,
  options: { loader: string; version: string },
): boolean {
  const moddable = isModdableLoader(options.loader);
  const snapshot = isSnapshotVersion(options.version);
  switch (policy) {
    case 'all':
      return true;
    case 'off':
      return false;
    case 'snapshot':
      return snapshot;
    case 'modded':
      return moddable;
    case 'modded_and_snapshot':
    default:
      return moddable || snapshot;
  }
}
