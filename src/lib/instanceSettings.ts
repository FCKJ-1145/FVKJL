/**
 * 实例设置（桌面端专用）：目录信息 / 版本隔离 / 打开目录 / MOD 管理。
 *
 * 这些能力都依赖 Rust 侧的命令，浏览器预览（web demo）下不可用，
 * 因此不挂在 LauncherBackend 接口上，而是单独封装一层。
 */

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke(command, args)) as T;
}

export interface GameDirInfo {
  /** 当前生效的游戏目录（mods / saves / 都从这里读） */
  gameDir: string;
  /** 实例自己的 profile 目录（版本隔离打开时的落点） */
  profileDir: string;
  /** 关闭隔离后共用的目录 */
  sharedDir: string;
  isolated: boolean;
}

export type InstanceDirKind = 'version' | 'saves' | 'mods';

export interface InstanceMod {
  id: string;
  fileName: string;
  filePath: string;
  size: number;
  enabled: boolean;
  title: string;
  iconUrl: string | null;
  versionNumber: string | null;
  external: boolean;
  /** 由所链接的整合包托管（整合包自带），不是用户手动添加的 */
  packManaged: boolean;
}

interface RawGameDirInfo {
  game_dir: string;
  profile_dir: string;
  shared_dir: string;
  isolated: boolean;
}

interface RawContentItem {
  id: string;
  file_name: string;
  file_path: string;
  size: number;
  enabled: boolean;
  project_type: string;
  source_kind?: string | null;
  project?: { title?: string; icon_url?: string | null } | null;
  version?: { version_number?: string } | null;
  external?: boolean;
}

/** 这些来源的内容由整合包托管，不是用户自己加的 */
const PACK_SOURCE_KINDS = new Set(['modrinth_modpack', 'curseforge', 'imported_modpack']);

function mapDirInfo(raw: RawGameDirInfo): GameDirInfo {
  return {
    gameDir: raw.game_dir,
    profileDir: raw.profile_dir,
    sharedDir: raw.shared_dir,
    isolated: raw.isolated,
  };
}

export async function getGameDirInfo(instanceId: string): Promise<GameDirInfo> {
  const raw = await invokeCommand<RawGameDirInfo>('plugin:instance|instance_get_game_dir_info', { instanceId });
  return mapDirInfo(raw);
}

/** 切换版本隔离，返回切换后的目录信息 */
export async function setInstanceIsolated(instanceId: string, isolated: boolean): Promise<GameDirInfo> {
  const raw = await invokeCommand<RawGameDirInfo>('plugin:instance|instance_set_isolated', { instanceId, isolated });
  return mapDirInfo(raw);
}

/** 在资源管理器里打开实例目录，返回实际打开的路径 */
export async function openInstanceDir(instanceId: string, kind: InstanceDirKind): Promise<string> {
  return invokeCommand<string>('plugin:instance|instance_open_dir', { instanceId, kind });
}

/**
 * 列出实例里的 MOD（只取 mods 目录下的内容项）。
 *
 * 用 `instance_get_all_content_items` 而不是 `instance_get_content_items`：
 * 后者会隐藏由所链接整合包托管的内容，导致整合包刚装完却在设置里显示 0 个 MOD。
 */
export async function listInstanceMods(instanceId: string): Promise<InstanceMod[]> {
  const items = await invokeCommand<RawContentItem[]>('plugin:instance|instance_get_all_content_items', {
    instanceId,
    cacheBehaviour: null,
  });
  return items
    .filter((item) => item.project_type === 'mod')
    .map((item) => ({
      id: item.id,
      fileName: item.file_name,
      filePath: item.file_path,
      size: item.size,
      enabled: item.enabled,
      title: item.project?.title ?? item.file_name.replace(/\.jar$/i, ''),
      iconUrl: item.project?.icon_url ?? null,
      versionNumber: item.version?.version_number ?? null,
      external: item.external ?? false,
      packManaged: item.source_kind ? PACK_SOURCE_KINDS.has(item.source_kind) : false,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
}

export async function setModEnabled(instanceId: string, contentId: string, enabled: boolean): Promise<void> {
  await invokeCommand<string>('plugin:instance|instance_toggle_content_entry', {
    instanceId,
    contentId,
    desiredEnabled: enabled,
  });
}

export async function removeMod(instanceId: string, contentId: string): Promise<void> {
  await invokeCommand<void>('plugin:instance|instance_remove_content_entry', { instanceId, contentId });
}

/** 把本地 jar 加进实例的 mods 目录 */
export async function addModFromPath(instanceId: string, path: string): Promise<string> {
  return invokeCommand<string>('plugin:instance|instance_add_project_from_path', {
    instanceId,
    projectPath: path,
    projectType: 'mod',
    innerBase: null,
  });
}

interface OpenDialogOptions {
  multiple?: boolean;
  directory?: boolean;
  title?: string;
  filters?: { name: string; extensions: string[] }[];
}

/** 直接调 dialog 插件命令，避免额外引入 @tauri-apps/plugin-dialog */
export async function pickModFiles(): Promise<string[]> {
  const picked = await invokeCommand<string | string[] | null>('plugin:dialog|open', {
    options: {
      multiple: true,
      directory: false,
      title: '选择要添加的 MOD（.jar）',
      filters: [{ name: 'Mod', extensions: ['jar'] }],
    } satisfies OpenDialogOptions,
  });
  if (!selected(picked)) return [];
  return Array.isArray(picked) ? picked : [picked];
}

function selected(value: string | string[] | null): value is string | string[] {
  return Boolean(value) && (typeof value === 'string' || Array.isArray(value));
}

/** 实例图标（data URL）；没有自定义图标时返回 null */
export async function fetchInstanceIcon(instanceId: string, maxDimension = 128): Promise<string | null> {
  return invokeCommand<string | null>('plugin:files|instance_icon_data', { instanceId, maxDimension });
}

/** 设置 / 清除实例图标；path 为本地图片路径 */
export async function setInstanceIcon(instanceId: string, path: string | null): Promise<void> {
  await invokeCommand<void>('plugin:instance|instance_edit_icon', { instanceId, iconPath: path });
}

/** 用远程图标（整合包封面）设置实例图标 */
export async function setInstanceIconFromUrl(instanceId: string, iconUrl: string): Promise<void> {
  const response = await fetch(iconUrl);
  if (!response.ok) throw new Error(`下载图标失败：HTTP ${response.status}`);
  const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
  // 缓存文件名用安全短名：icon_url 里带协议和斜杠，不适合直接当文件名
  const iconName = `modpack-${instanceId.replace(/[^\w-]/g, '').slice(0, 8)}-${Date.now()}.png`;
  const cached = await invokeCommand<string>('plugin:instance|instance_cache_icon', {
    iconName,
    bytes,
  });
  await setInstanceIcon(instanceId, cached);
}

/** 选一张图片作为实例图标 */
export async function pickImageFile(): Promise<string | null> {
  const picked = await invokeCommand<string | string[] | null>('plugin:dialog|open', {
    options: {
      multiple: false,
      directory: false,
      title: '选择实例图标（建议 1:1 正方形，≤ 256×256）',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    },
  });
  if (typeof picked === 'string') return picked;
  if (Array.isArray(picked)) return picked[0] ?? null;
  return null;
}

/** 关闭版本隔离时共用的游戏目录 */
export async function sharedGameDir(): Promise<string> {
  return invokeCommand<string>('plugin:instance|instance_shared_game_dir');
}

/** 调整游戏进程优先级：high / normal / low */
export async function setProcessPriority(pid: number, level: string): Promise<void> {
  await invokeCommand<void>('plugin:process|process_set_priority', { pid, level });
}
