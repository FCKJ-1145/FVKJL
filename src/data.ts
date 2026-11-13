import { FALLBACK_ACCENT } from './lib/palette';
import type { IsolationPolicy, LauncherSettings, ProcessPriority } from './types';

export interface DemoInstance {
  id: string;
  name: string;
  version: string;
  loader: string;
  lastPlayed: string;
}

export const INITIAL_INSTANCES: DemoInstance[] = [
  {
    id: 'main',
    name: '主实例',
    version: '1.21.4',
    loader: 'Fabric',
    lastPlayed: '今天 09:41',
  },
  {
    id: 'performance',
    name: '性能优先',
    version: '1.21.1',
    loader: 'Fabric',
    lastPlayed: '昨天 22:18',
  },
  {
    id: 'extended',
    name: '扩展环境',
    version: '1.20.6',
    loader: 'Forge',
    lastPlayed: '11 月 2 日',
  },
];

export const AVAILABLE_RELEASES = [
  { version: '1.21.4', date: '2025-12-03', channel: '正式版', size: '24.8 MB' },
  { version: '1.21.3', date: '2025-10-23', channel: '正式版', size: '24.6 MB' },
  { version: '1.21.1', date: '2025-08-08', channel: '正式版', size: '24.2 MB' },
  { version: '25w45a', date: '2025-11-05', channel: '快照', size: '25.1 MB' },
  { version: '1.20.6', date: '2025-04-29', channel: '正式版', size: '23.9 MB' },
];

export const DEFAULT_SETTINGS: LauncherSettings = {
  reduceMotion: false,
  theme: 'dark',
  translucent: true,
  glassStrength: 60,
  autoCheck: true,
  closeAfterLaunch: false,
  memory: 8,
  autoMemory: false,
  isolationPolicy: 'modded_and_snapshot',
  processPriority: 'normal',
  accent: FALLBACK_ACCENT,
};

/** 默认版本隔离策略（文案对齐 PCL2） */
export const ISOLATION_POLICIES: { id: IsolationPolicy; label: string; hint: string }[] = [
  { id: 'all', label: '隔离所有版本', hint: '每个版本使用各自的目录，互不影响' },
  { id: 'modded_and_snapshot', label: '隔离可安装 Mod 的版本与非正式版', hint: '带加载器的版本和快照各自独立，原版正式版共用一个目录' },
  { id: 'snapshot', label: '隔离非正式版', hint: '只有快照 / 预发布版独立，正式版共用' },
  { id: 'modded', label: '隔离可安装 Mod 的版本', hint: '只有带加载器的版本独立，其它版本共用' },
  { id: 'off', label: '关闭版本隔离', hint: '所有版本共用同一个 minecraft 目录（mods / 存档共享）' },
];

/** 进程优先级：对应 Windows 的 HIGH / NORMAL / IDLE priority class */
export const PROCESS_PRIORITIES: { id: ProcessPriority; label: string; hint: string }[] = [
  { id: 'high', label: '高', hint: '游戏性能更佳，会抢占其它程序的 CPU 时间' },
  { id: 'normal', label: '中', hint: '平衡，跟随系统默认调度' },
  { id: 'low', label: '低', hint: '优先保证其它程序，适合边玩边干别的' },
];
