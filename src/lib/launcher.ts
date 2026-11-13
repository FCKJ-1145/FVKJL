import { isDesktop } from './desktop';
import { AVAILABLE_RELEASES, INITIAL_INSTANCES } from '../data';
import type {
  BackendSettings,
  CreateInstanceRequest,
  DetectedImport,
  DownloadSourceMode,
  EditInstanceRequest,
  ImportInstanceRequest,
  InstallJob,
  InstanceInfo,
  JavaVersion,
  LoaderVersionEntry,
  LoadingPayload,
  ManifestVersion,
  ProcessEventPayload,
  ProcessInfo,
  ProjectDocument,
  ResourceFavorite,
  ResourcePage,
  ResourceRelease,
  ResourceSearchExpression,
  ResourceSearchQuery,
  ResourceSearchResult,
  ResourceSelection,
  ResourceSelectionRelease,
  ResourceSource,
  ResourceTarget,
  ResourceType,
  SourceProjectMetadata,
  SourceProjectRef,
} from '../types';

/**
 * 启动器后端桥接。
 *
 * 桌面端（Tauri）走真实命令（来自 Axolotl 核心 theseus 的命令层）；
 * 浏览器预览（vite dev）走 demo 实现，保证纯前端演示与 Playwright 测试可用。
 */

type Unsubscribe = () => void;

export interface InstallJobEventPayload {
  job_id: string;
  instance_id?: string | null;
  kind?: string;
  status: string;
  phase?: string;
  progress?: { current: number; total: number; secondary?: { current: number; total: number } | null } | null;
  display?: { title: string; icon?: string | null } | null;
  error?: { message?: string; phase?: string } | null;
  created: string;
  finished?: string | null;
  summary?: { cached?: number; downloaded?: number; failed?: number; total?: number } | null;
}

export interface LauncherBackend {
  /** 初始化后端状态（数据库迁移、运行时初始化） */
  initialize(): Promise<void>;
  fetchInstances(): Promise<InstanceInfo[]>;
  createInstance(request: CreateInstanceRequest): Promise<InstallJob>;
  /** 对已存在但未装完的实例发起修复安装 */
  repairInstance(instanceId: string): Promise<InstallJob>;
  removeInstance(instanceId: string): Promise<void>;
  editInstance(instanceId: string, edit: EditInstanceRequest): Promise<void>;
  launch(instanceId: string, offlineMode?: boolean): Promise<void>;
  kill(instanceId: string): Promise<void>;
  listJobs(): Promise<InstallJob[]>;
  cancelJob(jobId: string): Promise<void>;
  retryJob(jobId: string): Promise<void>;
  resumeJob(jobId: string): Promise<void>;
  dismissJob(jobId: string): Promise<void>;
  /** 探测目录下可导入的实例（启动器目录或 .minecraft 文件夹） */
  detectImportableInstances(basePath: string): Promise<DetectedImport>;
  /** 导入某个已存在的实例目录 */
  importInstance(request: ImportInstanceRequest): Promise<InstallJob>;
  /** 从整合包文件（.mrpack / .zip）创建实例 */
  importModpack(path: string): Promise<InstallJob>;
  fetchGameVersions(): Promise<ManifestVersion[]>;
  fetchLoaderVersions(loader: string, gameVersion?: string): Promise<LoaderVersionEntry[]>;
  /** —— 发现内容 —— */
  discoverSources(): Promise<ResourceSource[]>;
  discoverSearch(query: ResourceSearchQuery, cursor: string | null, requestId: string): Promise<ResourcePage<ResourceSearchResult>>;
  discoverCancel(requestId: string): Promise<void>;
  discoverProject(project: SourceProjectRef, locator: string | null): Promise<ProjectDocument>;
  /** 获取某个资源的可用版本列表，用于安装弹窗里选版本 */
  discoverReleases(project: SourceProjectRef, contentType: ResourceType, target: ResourceTarget, locator: string | null): Promise<ResourcePage<ResourceRelease>>;
  discoverFavorites(): Promise<ResourceFavorite[]>;
  discoverFavorite(project: SourceProjectRef, contentType: ResourceType, locator: string | null, favorite: boolean): Promise<void>;
  /** 准备安装计划并入队，返回安装任务；release 默认 automatic，传 specified 则装指定版本 */
  discoverInstall(instanceId: string, project: SourceProjectRef, contentType: ResourceType, locator: string | null, release?: ResourceSelectionRelease): Promise<InstallJob>;
  /** 整合包：从在线源创建新实例（不是装进现有实例）；iconUrl 为发现页封面，用作实例图标 */
  discoverInstallModpack(project: SourceProjectRef, locator: string | null, release?: ResourceSelectionRelease, iconUrl?: string | null): Promise<InstallJob>;
  fetchProcesses(): Promise<ProcessInfo[]>;
  fetchSettings(): Promise<BackendSettings>;
  patchSettings(patch: Record<string, unknown>): Promise<BackendSettings>;
  fetchJavaVersions(): Promise<JavaVersion[]>;
  setJavaDefault(majorVersion: number, path: string): Promise<void>;
  autoInstallJava(majorVersion: number): Promise<string | null>;
  getMaxMemory(): Promise<number>;
  fetchLogFiles(instanceId: string): Promise<LogFile[]>;
  fetchLiveLog(instanceId: string): Promise<string>;
  onLoading(listener: (payload: LoadingPayload) => void): Promise<Unsubscribe>;
  onProcess(listener: (payload: ProcessEventPayload) => void): Promise<Unsubscribe>;
  onInstallJob(listener: (payload: InstallJobEventPayload) => void): Promise<Unsubscribe>;
  onNotification(listener: (payload: { title: string; message: string }) => void): Promise<Unsubscribe>;
  onSettings(listener: () => void): Promise<Unsubscribe>;
}

/** —— 工具函数 —— */

export interface LogFile {
  log_type: string;
  filename: string;
  age: number;
  output: string | null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '尚未运行';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay) return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/** 加载器内部标识 → 展示名 */
export function loaderLabel(loader: string): string {
  const labels: Record<string, string> = {
    vanilla: '原版',
    fabric: 'Fabric',
    forge: 'Forge',
    quilt: 'Quilt',
    neoforge: 'NeoForge',
    optifine: 'OptiFine',
    cleanroom: 'Cleanroom',
    lite_loader: 'LiteLoader',
    legacy_fabric: 'Legacy Fabric',
    babric: 'Babric',
  };
  return labels[loader.toLowerCase()] ?? loader;
}

/** 下载源策略 → 展示名 */
export function sourceLabel(source: DownloadSourceMode | undefined): string {
  switch (source) {
    case 'official_only': return '仅官方';
    case 'mirror_preferred': return '镜像优先';
    case 'official_preferred': return '官方优先';
    default: return '自动选择';
  }
}

export const DOWNLOAD_SOURCE_OPTIONS: { value: DownloadSourceMode; label: string; hint: string }[] = [
  { value: 'auto', label: '自动选择', hint: '根据连接质量在官方与镜像间自动切换' },
  { value: 'official_only', label: '仅官方', hint: '只从 Mojang/微软官方服务器下载' },
  { value: 'mirror_preferred', label: '镜像优先', hint: '优先使用镜像加速（如 BMCLAPI）' },
  { value: 'official_preferred', label: '官方优先', hint: '优先官方，失败时回退镜像' },
];

export const INSTALL_STAGE_LABELS: Record<string, string> = {
  installed: '已安装',
  minecraft_installing: 'Minecraft 安装中',
  forge_installing: 'Forge 安装中',
  fabric_installing: 'Fabric 安装中',
  quilt_installing: 'Quilt 安装中',
  neoforge_installing: 'NeoForge 安装中',
  optifine_installing: 'OptiFine 安装中',
  modrinth_installing: 'Modrinth 资源安装中',
  curseforge_installing: 'CurseForge 资源安装中',
  installing: '安装中',
  failed: '安装失败',
  not_installed: '未安装',
};

export function installStageLabel(stage: string): string {
  return INSTALL_STAGE_LABELS[stage] ?? stage;
}

/** —— 桌面实现（Tauri） —— */

type InvokeResult<T> = T | { field_name?: unknown; message?: unknown };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    const parsed = JSON.parse(JSON.stringify(error)) as InvokeResult<unknown>;
    if (parsed && typeof parsed === 'object') {
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
      const fieldName = (parsed as { field_name?: unknown }).field_name;
      if (typeof fieldName === 'string' && fieldName) return fieldName;
    }
  } catch {
    // 忽略序列化失败，走通用信息
  }
  return '操作失败，请查看后端日志。';
}

const desktopBackend: LauncherBackend = {
  async initialize() {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('initialize_state');
  },

  async fetchInstances() {
    const { invoke } = await import('@tauri-apps/api/core');
    const list = (await invoke('plugin:instance|instance_list')) as RawInstance[];
    return list.map(mapInstance);
  },

  async createInstance(request) {
    const { invoke } = await import('@tauri-apps/api/core');
    const job = (await invoke('plugin:install|install_create_instance', {
      request: {
        name: request.name,
        gameVersion: request.gameVersion,
        loader: request.loader,
        loaderVersion: request.loaderVersion ?? null,
        adjuncts: [],
        iconPath: null,
        link: null,
        gameDirOverride: request.gameDirOverride ?? null,
      },
    })) as RawInstallJob;
    return mapJob(job);
  },

  async repairInstance(instanceId) {
    const { invoke } = await import('@tauri-apps/api/core');
    const job = (await invoke('plugin:install|install_existing_instance', { instanceId, force: false })) as RawInstallJob;
    return mapJob(job);
  },

  async removeInstance(instanceId) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:instance|instance_remove', { instanceId });
  },

  async editInstance(instanceId, edit) {
    const { invoke } = await import('@tauri-apps/api/core');
    const body: Record<string, unknown> = {};
    if (edit.name !== undefined) body.name = edit.name;
    if (edit.memory !== undefined) body.memory = edit.memory;
    if (edit.javaPath !== undefined && edit.javaPath !== null) body.java_path = edit.javaPath;
    await invoke('plugin:instance|instance_edit', {
      instanceId,
      editInstance: body,
    });
  },

  async launch(instanceId, offlineMode = true) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:instance|instance_run', {
      instanceId,
      serverAddress: null,
      offlineMode,
      extraLaunchArgs: null,
      gcIntent: null,
    });
  },

  async kill(instanceId) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:instance|instance_kill', { instanceId });
  },

  async listJobs() {
    const { invoke } = await import('@tauri-apps/api/core');
    const jobs = (await invoke('plugin:install|install_job_list', { includeFinished: false })) as RawInstallJob[];
    return jobs.map(mapJob);
  },

  async cancelJob(jobId) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:install|install_job_cancel', { jobId });
  },

  async retryJob(jobId) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:install|install_job_retry', { jobId });
  },

  async resumeJob(jobId) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:install|install_job_resume', { jobId });
  },

  async dismissJob(jobId) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:install|install_job_dismiss', { jobId });
  },

  async detectImportableInstances(basePath) {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = (await invoke('plugin:import|import_detect_instances', { basePath })) as RawDetectedImport;
    return {
      launcherType: result.launcherType,
      instances: (result.instances ?? []).map((item) => ({
        name: item.name,
        path: item.path,
        compatibleMode: item.compatible_mode ?? false,
        versionPath: item.version_path ?? null,
      })),
    };
  },

  async importInstance(request) {
    const { invoke } = await import('@tauri-apps/api/core');
    const job = (await invoke('plugin:install|install_import_instance', {
      launcherType: request.launcherType,
      basePath: request.basePath,
      instanceFolder: request.instanceFolder,
      instancePath: request.instancePath ?? null,
      symlink: false,
      gameVersion: request.gameVersion ?? null,
      loader: request.loader ?? null,
      loaderVersion: request.loaderVersion ?? null,
      gameDirOverride: null,
    })) as RawInstallJob;
    return mapJob(job);
  },

  async importModpack(path) {
    const { invoke } = await import('@tauri-apps/api/core');
    // CreatePackLocation 是内部标签枚举（tag = "type"，camelCase）：
    // { type: 'fromFile', path: '...' }
    const job = (await invoke('plugin:install|install_create_modpack_instance', {
      location: { type: 'fromFile', path },
      postInstallEdit: null,
    })) as RawInstallJob;
    return mapJob(job);
  },

  async fetchGameVersions() {
    const { invoke } = await import('@tauri-apps/api/core');
    const manifest = (await invoke('plugin:metadata|metadata_get_game_versions')) as RawVersionManifest;
    return manifest.versions.map((version) => ({
      id: version.id,
      type: version.type,
      url: version.url,
      time: version.time,
      releaseTime: version.releaseTime,
    }));
  },

  async fetchLoaderVersions(loader, gameVersion) {
    const { invoke } = await import('@tauri-apps/api/core');
    // NeoForge 在 daedalus 的 loader manifest 中标识为 "neo"
    const apiLoader = loader === 'neoforge' ? 'neo' : loader;
    const manifest = (await invoke('plugin:metadata|metadata_get_loader_versions', { loader: apiLoader, gameVersion })) as RawLoaderManifest;
    const entries = manifest.gameVersions ?? [];
    // 只接受精确匹配：清单里没有该游戏版本就代表加载器不支持，不能退回到第一条
    const entry = entries.find((item) => item.id === gameVersion);
    if (!entry) return [];
    // 新的 manifest 会把共用加载器版本的多个游戏版本归并到 versionGroups
    const loaders = entry.versionGroup
      ? (manifest.versionGroups ?? []).find((group) => group.id === entry.versionGroup)?.loaders ?? []
      : entry.loaders;
    return loaders.map((item) => ({ id: item.id, stable: item.stable ?? true }));
  },

  async discoverSources() {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('plugin:aster-resources|resource_sources')) as ResourceSource[];
  },

  async discoverSearch(query, cursor, requestId) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('plugin:aster-resources|resource_search', {
      query,
      cursor,
      requestId,
    })) as ResourcePage<ResourceSearchResult>;
  },

  async discoverCancel(requestId) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:aster-resources|resource_cancel', { requestId });
  },

  async discoverProject(project, locator) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('plugin:aster-resources|resource_project_document', {
      project,
      locator,
      requestId: `doc-${project.source}-${project.projectId}-${Date.now()}`,
    })) as ProjectDocument;
  },

  async discoverFavorites() {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('plugin:aster-resources|resource_favorites')) as ResourceFavorite[];
  },

  async discoverFavorite(project, contentType, locator, favorite) {
    const { invoke } = await import('@tauri-apps/api/core');
    if (favorite) {
      await invoke('plugin:aster-resources|resource_favorite_add', { project, contentType, locator });
    } else {
      await invoke('plugin:aster-resources|resource_favorite_remove', { project });
    }
  },

  async discoverReleases(project, _contentType, target, locator) {
    const { invoke } = await import('@tauri-apps/api/core');
    // 后端 ResourceTarget 三个字段都必填，空数组表示不过滤
    const safeTarget: ResourceTarget = {
      gameVersions: target?.gameVersions ?? [],
      loaders: target?.loaders ?? [],
      channels: target?.channels ?? [],
    };
    return (await invoke('plugin:aster-resources|resource_releases', {
      reference: { kind: 'source', project },
      target: safeTarget,
      locator,
      cursor: null,
      requestId: `rel-${project.source}-${project.projectId}-${Date.now()}`,
    })) as ResourcePage<ResourceRelease>;
  },

  async discoverInstall(instanceId, project, contentType, locator, release) {
    const { invoke } = await import('@tauri-apps/api/core');
    const requestId = `install-${project.source}-${project.projectId}-${Date.now()}`;
    const selection: ResourceSelection = {
      id: `sel-${project.source}-${project.projectId}-${Date.now()}`,
      resource: { kind: 'source', project },
      release: release ?? { kind: 'automatic' },
      resourceType: contentType,
      scope: { kind: 'instance' },
      entryId: null,
    };
    const plan = (await invoke('plugin:aster-resources|resource_prepare_operation', {
      instanceId,
      intent: 'install',
      selections: [selection],
      installDependencies: true,
      requestId,
    })) as { id: string; revision: number; actions?: unknown[]; issues?: { message?: string; blocking?: boolean }[] };
    if (Array.isArray(plan.actions) && plan.actions.length === 0) {
      const reasons = (plan.issues ?? [])
        .map((issue) => issue.message)
        .filter((message): message is string => Boolean(message))
        .map((message) => (message === 'no compatible release found'
          ? '未找到与该实例 Minecraft 版本/加载器兼容的版本'
          : message));
      throw new Error(
        reasons.length > 0
          ? reasons.join('；')
          : '该资源与当前实例的 Minecraft 版本或加载器不兼容，或已经安装过。',
      );
    }
    const planId = plan.id;
    const revision = plan.revision;
    const job = (await invoke('plugin:aster-resources|resource_queue_plan', {
      planId,
      revision,
      resourceNames: { [selection.id]: locator ?? project.projectId },
    })) as RawInstallJob;
    return mapJob(job);
  },

  async discoverInstallModpack(project, locator, release, iconUrl) {
    const { invoke } = await import('@tauri-apps/api/core');
    if (project.source !== 'modrinth') {
      throw new Error('目前仅支持从 Modrinth 一键创建整合包实例，其他来源请下载 .mrpack 后手动导入。');
    }
    let versionId = release?.kind === 'release' ? release.reference.releaseId : '';
    if (!versionId) {
      const page = (await invoke('plugin:aster-resources|resource_releases', {
        reference: { kind: 'source', project },
        target: { gameVersions: [], loaders: [], channels: [] },
        locator,
        cursor: null,
        requestId: `modpack-rel-${project.projectId}-${Date.now()}`,
      })) as ResourcePage<ResourceRelease>;
      versionId = page.entries[0]?.reference.releaseId ?? '';
      if (!versionId) throw new Error('该整合包没有可用版本。');
    }
    // CreatePackLocation 为内部标签枚举（tag = "type"）：变体名 camelCase，但字段名保持 snake_case
    // （与 Axolotl 前端一致：{ type: 'fromVersionId', project_id, version_id, title, icon_url }）
    // icon_url 传发现页封面，后端创建实例时会直接下载并写入 icon_path，缺失时才回落到默认图标
    const job = (await invoke('plugin:install|install_create_modpack_instance', {
      location: {
        type: 'fromVersionId',
        project_id: project.projectId,
        version_id: versionId,
        title: locator ?? project.projectId,
        icon_url: iconUrl?.trim() || null,
      },
      postInstallEdit: null,
    })) as RawInstallJob;
    return mapJob(job);
  },

  async fetchProcesses() {
    const { invoke } = await import('@tauri-apps/api/core');
    const processes = (await invoke('plugin:process|process_get_all')) as RawProcess[];
    return processes.map((process) => ({
      uuid: process.uuid,
      pid: process.pid,
      instanceId: process.instance_id,
      instanceName: process.instance_name,
      startTime: process.start_time,
    }));
  },

  async fetchSettings() {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('plugin:settings|settings_get')) as BackendSettings;
  },

  async patchSettings(patch) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('plugin:settings|settings_patch', { patch })) as BackendSettings;
  },

  async fetchJavaVersions() {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('plugin:jre|get_java_versions')) as JavaVersion[];
  },

  async setJavaDefault(majorVersion, path) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:jre|set_java_default_version', { majorVersion, path });
  },

  async autoInstallJava(majorVersion) {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = (await invoke('plugin:jre|jre_auto_install_java', { javaVersion: majorVersion })) as string | null;
    return path;
  },

  async getMaxMemory() {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('plugin:jre|jre_get_max_memory')) as number;
  },

  async fetchLogFiles(instanceId) {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('plugin:logs|logs_get_logs', { instanceId, clearContents: false })) as LogFile[];
  },

  async fetchLiveLog(instanceId) {
    const { invoke } = await import('@tauri-apps/api/core');
    const censored = (await invoke('plugin:logs|logs_get_live_log_buffer', { instanceId })) as { censored_content?: string; content?: string } | string;
    if (typeof censored === 'string') return censored;
    return censored.censored_content ?? censored.content ?? '';
  },

  onLoading(listener) {
    return listenPayload('loading', listener);
  },

  onProcess(listener) {
    return listenPayload('process', listener);
  },

  onInstallJob(listener) {
    return listenPayload('install_job', listener);
  },

  onNotification(listener) {
    return listenPayload('notification', listener);
  },

  onSettings(listener) {
    return listenPayload('settings', () => listener());
  },
};

async function listenPayload<T>(event: string, listener: (payload: T) => void): Promise<Unsubscribe> {
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<T>(event, (payload) => listener(payload.payload));
  return () => unlisten();
}

/** Web 预览模式下也需要一个事件总线（demo 流程用） */
class EventBus {
  private listeners: Record<string, Set<(payload: unknown) => void>> = {};

  emit(event: string, payload: unknown) {
    this.listeners[event]?.forEach((listener) => listener(payload));
  }

  on<T>(event: string, listener: (payload: T) => void): Unsubscribe {
    (this.listeners[event] ??= new Set()).add(listener as (payload: unknown) => void);
    return () => this.listeners[event]?.delete(listener as (payload: unknown) => void);
  }
}

export const backendEvents = new EventBus();

/** —— 演示实现（浏览器预览） —— */

interface MockInstance {
  id: string;
  name: string;
  version: string;
  loader: string;
  loaderVersion: string | null;
  installStage: string;
  iconPath: string | null;
  created: string;
  modified: string;
  lastPlayed: string | null;
  memory: { maximum: number; automatic: boolean } | null;
  javaPath: string | null;
}

function demoInstancesFromStorage(): MockInstance[] {
  try {
    const stored = window.localStorage.getItem('aster.instances');
    if (stored) {
      const parsed = JSON.parse(stored) as { id: string; name: string; version: string; loader: string }[];
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((item) => ({
          id: item.id,
          name: item.name,
          version: item.version,
          loader: item.loader,
          loaderVersion: null,
          installStage: 'installed',
          iconPath: null,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          lastPlayed: null,
          memory: null,
          javaPath: null,
        }));
      }
    }
  } catch {
    // 存储不可用时回退初始数据
  }
  return INITIAL_INSTANCES.map((item) => ({
    id: item.id,
    name: item.name,
    version: item.version,
    loader: item.loader,
    loaderVersion: null,
    installStage: 'installed',
    iconPath: null,
    created: new Date(Date.now() - 86400 * 1000 * 30).toISOString(),
    modified: new Date(Date.now() - 86400 * 1000).toISOString(),
    lastPlayed: null,
    memory: null,
    javaPath: null,
  }));
}

/** —— 发现内容演示数据（浏览器预览 / Playwright） —— */

interface DemoResourceSeed {
  id: string;
  title: string;
  summary: string;
  type: ResourceType;
  downloads: number;
  followers: number;
  categories: string[];
  loaders: string[];
  environments: string[];
  license: string;
  author: string;
  updated: string;
  gameVersions?: string[];
}

const DEMO_RESOURCE_SEEDS: DemoResourceSeed[] = [
  { id: 'fabulously-optimized', title: 'Fabulously Optimized', summary: '面向性能优化的整合包，内置 Sodium、Iris 等模组，开箱即用。', type: 'modPack', downloads: 8934210, followers: 15230, categories: ['optimization', 'multiplayer', 'lightweight'], loaders: ['fabric', 'quilt'], environments: ['client'], license: 'LGPL-3.0', author: 'Robotkoer', updated: '2026-11-02T08:12:00Z' },
  { id: 'sodium', title: 'Sodium', summary: '现代渲染引擎，显著提升帧率并减少卡顿。', type: 'mod', downloads: 12453780, followers: 20145, categories: ['optimization'], loaders: ['fabric', 'neoforge'], environments: ['client'], license: 'LGPL-3.0', author: 'CaffeineMC', updated: '2026-11-05T14:30:00Z' },
  { id: 'iris', title: 'Iris Shaders', summary: '高性能光影加载器，兼容 OptiFine 光影包。', type: 'mod', downloads: 6721980, followers: 9910, categories: ['optimization', 'decoration'], loaders: ['fabric', 'neoforge'], environments: ['client'], license: 'LGPL-3.0', author: 'IrisShaders', updated: '2026-11-04T09:05:00Z' },
  { id: 'complementary-reimagined', title: 'Complementary Reimagined', summary: '风格化光影包，兼顾画质与性能，适合日常游玩。', type: 'shader', downloads: 3120450, followers: 4210, categories: ['realistic', 'fantasy'], loaders: ['iris'], environments: ['client'], license: 'ARR', author: 'EminGT', updated: '2026-10-28T21:40:00Z' },
  { id: 'terralith', title: 'Terralith', summary: '用原版方块重塑主世界地形，新增 100 多个生物群系。', type: 'dataPack', downloads: 4218760, followers: 6180, categories: ['worldgen', 'adventure'], loaders: [], environments: ['client', 'server'], license: 'ARR', author: 'Starmute', updated: '2026-10-30T11:20:00Z' },
  { id: 'incendium', title: 'Incendium', summary: '下界内容扩展：新结构、新生物与更强的挑战。', type: 'dataPack', downloads: 1987650, followers: 2980, categories: ['adventure', 'worldgen'], loaders: [], environments: ['client', 'server'], license: 'ARR', author: 'Starmute', updated: '2026-10-19T16:00:00Z' },
  { id: 'create', title: 'Create', summary: '机械动力：齿轮、传送带与自动化装置，建造你的工厂。', type: 'mod', downloads: 10432870, followers: 24800, categories: ['technology', 'decoration'], loaders: ['fabric', 'neoforge'], environments: ['client', 'server'], license: 'MIT', author: 'simibubi', updated: '2026-11-06T10:15:00Z' },
  { id: 'jei', title: 'Just Enough Items', summary: '物品与配方查询，模组整合包必备。', type: 'mod', downloads: 15204320, followers: 18400, categories: ['utility'], loaders: ['fabric', 'neoforge', 'forge'], environments: ['client'], license: 'MIT', author: 'mezz', updated: '2026-11-01T07:45:00Z' },
  { id: 'xaeros-minimap', title: "Xaero's Minimap", summary: '小地图与路径点，支持多人服务器与洞穴模式。', type: 'mod', downloads: 9210340, followers: 13290, categories: ['utility', 'adventure'], loaders: ['fabric', 'neoforge', 'forge'], environments: ['client'], license: 'ARR', author: 'xaero96', updated: '2026-10-25T19:10:00Z' },
  { id: 'cobblemon', title: 'Cobblemon', summary: '宝可梦风格的开放世界模组，含对战、捕捉与培育。', type: 'modPack', downloads: 5320970, followers: 11840, categories: ['adventure', 'magic'], loaders: ['fabric'], environments: ['client', 'server'], license: 'MPL-2.0', author: 'Cobblemon Team', updated: '2026-11-03T13:25:00Z' },
  { id: 'faithful-32x', title: 'Faithful 32x', summary: '原版风格的高分辨率材质包，保留原汁原味。', type: 'resourcePack', downloads: 6120380, followers: 5340, categories: ['decoration'], loaders: [], environments: ['client'], license: 'ARR', author: 'Faithful Team', updated: '2026-10-22T08:30:00Z' },
  { id: 'fresh-animations', title: 'Fresh Animations', summary: '为生物添加流畅动画，支持大部分原版实体。', type: 'resourcePack', downloads: 3810920, followers: 6120, categories: ['decoration', 'realistic'], loaders: [], environments: ['client'], license: 'ARR', author: 'FreshLX', updated: '2026-10-31T22:05:00Z' },
  { id: 'structory', title: 'Structory', summary: '新增大量原版风格结构，探索世界更有惊喜。', type: 'world', downloads: 1521030, followers: 2140, categories: ['adventure', 'worldgen'], loaders: [], environments: ['client', 'server'], license: 'ARR', author: 'botanydev', updated: '2026-10-12T09:50:00Z' },
  { id: 'dungeons-and-taverns', title: 'Dungeons and Taverns', summary: '结构扩展数据包，加入地牢、酒馆与城堡。', type: 'world', downloads: 987650, followers: 1410, categories: ['adventure'], loaders: [], environments: ['client', 'server'], license: 'ARR', author: 'Konci', updated: '2026-10-08T17:35:00Z' },
];

const DEMO_RESOURCE_RESULTS: ResourceSearchResult[] = DEMO_RESOURCE_SEEDS.map((seed) => {
  const project: SourceProjectRef = { source: 'modrinth', projectId: seed.id };
  const metadata: SourceProjectMetadata = {
    environments: seed.environments,
    categories: seed.categories,
    gameVersions: ['1.21.1', '1.21', '1.20.1'],
    loaders: seed.loaders,
    gallery: [],
    project,
    slug: seed.id,
    title: seed.title,
    summary: seed.summary,
    iconUrl: null,
    types: [seed.type],
    authors: [seed.author],
    license: seed.license,
    downloads: seed.downloads,
    followers: seed.followers,
    createdAt: seed.updated,
    projectPublishedAt: seed.updated,
    updatedAt: seed.updated,
    firstPublishedAt: seed.updated,
    latestPublishedAt: seed.updated,
  };
  return {
    entry: {
      queryEntryId: `${project.source}:${project.projectId}`,
      resourceId: null,
      defaultProject: project,
      candidates: [project],
      status: 'confirmed',
      basis: ['source'],
    },
    projects: [metadata],
  };
});

const DEMO_FAVORITES_KEY = 'aster.discover-favorites';

interface DemoFavoriteEntry {
  project: SourceProjectRef;
  contentType: ResourceType;
  savedAt: number;
}

function demoFavoriteEntries(): DemoFavoriteEntry[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DEMO_FAVORITES_KEY) ?? '[]');
    return Array.isArray(raw) ? (raw as DemoFavoriteEntry[]) : [];
  } catch {
    return [];
  }
}

function saveDemoFavorites(entries: DemoFavoriteEntry[]) {
  window.localStorage.setItem(DEMO_FAVORITES_KEY, JSON.stringify(entries));
}

/** 演示模式下的安装任务（下载任务弹窗会读取） */
const demoJobs: InstallJob[] = [];

const mockBackend: LauncherBackend = {
  async initialize() {
    // 演示模式无需初始化
  },

  async fetchInstances() {
    return demoInstancesFromStorage();
  },

  async createInstance(request) {
    const created: MockInstance = {
      id: `release-${request.gameVersion}-${Date.now()}`,
      name: request.name,
      version: request.gameVersion,
      loader: loaderLabel(request.loader) === '原版' ? 'Vanilla' : loaderLabel(request.loader),
      loaderVersion: request.loaderVersion ?? null,
      installStage: 'installed',
      iconPath: null,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      lastPlayed: null,
      memory: null,
      javaPath: null,
    };
    const current = this.fetchInstances().then((items) => items);
    const instances = await current;
    const nextList = [created, ...instances];
    window.localStorage.setItem('aster.instances', JSON.stringify(nextList.map(({ id, name, version, loader }) => ({ id, name, version, loader }))));
    return {
      jobId: `demo-${Date.now()}`,
      instanceId: created.id,
      kind: 'create_instance',
      status: 'finished',
      provider: 'demo',
      progress: { current: 1, total: 1 },
      display: { title: `创建实例 ${created.name}` },
      error: null,
      created: new Date().toISOString(),
      finished: new Date().toISOString(),
      summary: null,
    };
  },

  async repairInstance() {
    return {
      jobId: `demo-${Date.now()}`,
      instanceId: null,
      kind: 'repair',
      status: 'finished',
      provider: 'demo',
      progress: { current: 1, total: 1 },
      display: { title: '修复实例（演示）' },
      error: null,
      created: new Date().toISOString(),
      finished: new Date().toISOString(),
      summary: null,
    };
  },

  async removeInstance(instanceId) {
    const current = await this.fetchInstances();
    const nextList = current.filter((item) => item.id !== instanceId);
    window.localStorage.setItem('aster.instances', JSON.stringify(nextList.map(({ id, name, version, loader }) => ({ id, name, version, loader }))));
  },

  async editInstance(_instanceId, _edit) {
    // 演示模式仅保留 UI 偏好
  },

  async launch(instanceId) {
    backendEvents.emit('process', {
      instance_id: instanceId,
      uuid: `demo-${Date.now()}`,
      pid: 4242,
      event: 'starting',
      message: '演示启动',
      crashed: null,
    });
  },

  async kill(instanceId) {
    backendEvents.emit('process', {
      instance_id: instanceId,
      uuid: `demo-${Date.now()}`,
      pid: 4242,
      event: 'stopped',
      message: '已结束（演示）',
      crashed: null,
    });
  },

  async listJobs() {
    return [...demoJobs];
  },

  async cancelJob(jobId) {
    const index = demoJobs.findIndex((job) => job.jobId === jobId);
    if (index >= 0) demoJobs.splice(index, 1);
  },
  async retryJob() {},
  async resumeJob() {},
  async dismissJob(jobId) {
    const index = demoJobs.findIndex((job) => job.jobId === jobId);
    if (index >= 0) demoJobs.splice(index, 1);
  },

  async detectImportableInstances(basePath) {
    return {
      launcherType: 'Generic',
      instances: [{
        name: '.minecraft',
        path: `${basePath}\\.minecraft`,
        compatibleMode: false,
        versionPath: null,
      }],
    };
  },

  async importInstance(request) {
    return {
      jobId: `demo-import-${Date.now()}`,
      instanceId: `import-${Date.now()}`,
      kind: 'import_instance',
      status: 'finished',
      provider: 'demo',
      progress: { current: 1, total: 1 },
      display: { title: `导入实例 ${request.instanceFolder}` },
      error: null,
      created: new Date().toISOString(),
      finished: new Date().toISOString(),
      summary: null,
    };
  },

  async importModpack(path) {
    const title = path.split(/[\\/]/).pop() ?? '整合包';
    return {
      jobId: `demo-pack-${Date.now()}`,
      instanceId: `pack-${Date.now()}`,
      kind: 'create_modpack',
      status: 'finished',
      provider: 'demo',
      progress: { current: 1, total: 1 },
      display: { title: `导入整合包 ${title}` },
      error: null,
      created: new Date().toISOString(),
      finished: new Date().toISOString(),
      summary: null,
    };
  },

  async fetchGameVersions() {
    return AVAILABLE_RELEASES.map((release) => ({
      id: release.version,
      type: release.channel === '快照' ? 'snapshot' : 'release',
      url: '',
      time: release.date,
      releaseTime: release.date,
    }));
  },

  async fetchLoaderVersions() {
    return [{ id: 'latest', stable: true }];
  },

  async discoverSources() {
    return [{
      id: 'modrinth',
      types: ['modPack', 'mod', 'resourcePack', 'dataPack', 'shader', 'world'],
      capabilities: ['search', 'project', 'description', 'releases', 'download', 'dependencies'],
      available: true,
      supportedSearchSorts: ['relevance', 'downloads', 'followers', 'projectPublished', 'latestPublished'],
    }];
  },

  async discoverSearch(query, cursor, requestId) {
    const collect = (expr: ResourceSearchExpression | null, field: string): string[] => {
      if (!expr) return [];
      if (expr.kind === 'predicate') return expr.field === field ? expr.values : [];
      return expr.terms.flatMap((term) => collect(term, field));
    };
    const text = query.text.trim().toLowerCase();
    const environments = collect(query.filter, 'environment');
    const categories = collect(query.filter, 'category');
    const gameVersions = collect(query.filter, 'gameVersion');
    const loaders = collect(query.filter, 'loader');
    let items = DEMO_RESOURCE_RESULTS.filter((result) => {
      const meta = result.projects[0];
      if (query.types.length > 0 && !meta.types.some((type) => query.types.includes(type))) return false;
      if (text && !`${meta.title} ${meta.summary}`.toLowerCase().includes(text)) return false;
      if (environments.length > 0 && !environments.some((env) => meta.environments.includes(env))) return false;
      if (categories.length > 0 && !categories.some((cat) => meta.categories.includes(cat))) return false;
      if (gameVersions.length > 0 && !gameVersions.some((ver) => meta.gameVersions.includes(ver))) return false;
      if (loaders.length > 0 && !loaders.some((loader) => meta.loaders.includes(loader))) return false;
      return true;
    });
    if (query.sort === 'downloads') items = [...items].sort((a, b) => (b.projects[0].downloads ?? 0) - (a.projects[0].downloads ?? 0));
    if (query.sort === 'followers') items = [...items].sort((a, b) => (b.projects[0].followers ?? 0) - (a.projects[0].followers ?? 0));
    if (query.sort === 'projectPublished' || query.sort === 'latestPublished') {
      items = [...items].sort((a, b) => (b.projects[0].updatedAt ?? '').localeCompare(a.projects[0].updatedAt ?? ''));
    }
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const pageSize = Math.max(1, Math.min(query.pageSize || 20, 100));
    const page = items.slice(offset, offset + pageSize);
    const nextOffset = offset + page.length;
    return {
      requestId,
      entries: page,
      cursor: nextOffset < items.length ? String(nextOffset) : null,
      hasMore: nextOffset < items.length,
      total: { value: items.length, precision: 'exact' },
      sourceFailures: [],
      exhaustedSources: [],
    };
  },

  async discoverCancel() {
    // 演示模式无真实请求可取消
  },

  async discoverProject(project) {
    const result = DEMO_RESOURCE_RESULTS.find((item) => item.projects[0].project.projectId === project.projectId) ?? DEMO_RESOURCE_RESULTS[0];
    const meta = result.projects[0];
    return {
      owner: { id: meta.project.projectId, name: meta.authors[0] ?? '未知作者', avatarUrl: null, organization: false },
      metadata: meta,
      description: {
        source: 'modrinth',
        format: 'markdown',
        body: `# ${meta.title}\n\n${meta.summary}\n\n**兼容游戏版本**：${meta.gameVersions.join('、')}\n\n**支持的加载器**：${meta.loaders.length > 0 ? meta.loaders.join('、') : '不依赖加载器'}\n\n**许可证**：${meta.license ?? '未标注'}\n\n（演示模式描述内容）`,
      },
      protocol: null,
    };
  },

  async discoverFavorites() {
    return demoFavoriteEntries().map((entry) => ({
      locator: null,
      resourceId: null,
      project: entry.project,
      projects: [entry.project],
      contentType: entry.contentType,
      savedAt: entry.savedAt,
    }));
  },

  async discoverFavorite(project, contentType, locator, favorite) {
    const entries = demoFavoriteEntries().filter((entry) => entry.project.projectId !== project.projectId);
    if (favorite) entries.unshift({ project, contentType, savedAt: Date.now() });
    saveDemoFavorites(entries);
    void locator;
  },

  async discoverReleases(project, _contentType, _target, locator) {
    const seed = DEMO_RESOURCE_SEEDS.find((s) => s.id === project.projectId);
    const versions = seed?.gameVersions ?? ['1.21.1', '1.21', '1.20.1', '1.20'];
    const loaders = seed?.loaders ?? ['fabric'];
    const now = Date.now();
    const entries: ResourceRelease[] = versions.map((v: string, idx: number) => ({
      reference: { project, releaseId: `${project.projectId}-v${v.replace(/\./g, '-')}` },
      version: v,
      channel: idx === 0 ? 'release' : idx === 1 ? 'beta' : 'alpha',
      publishedAt: new Date(now - idx * 86400000 * 10).toISOString(),
      compatibility: {
        gameVersions: [v, v.replace(/\.\d+$/, '.x')],
        loaders: loaders.length ? loaders : ['vanilla'],
      },
      artifacts: [{
        reference: { kind: 'modrinth', id: `${project.projectId}-v${v.replace(/\./g, '-')}` },
        fileName: `${project.projectId}-${v}.jar`,
        role: 'primary',
        available: true,
      }],
      equivalentReleases: [],
    }));
    void locator;
    return {
      requestId: `rel-demo-${project.projectId}-${Date.now()}`,
      entries,
      cursor: null,
      hasMore: false,
      total: { value: entries.length, precision: 'exact' as const },
      sourceFailures: [],
      exhaustedSources: [],
    };
  },

  async discoverInstall(instanceId, project, contentType, locator, _release) {
    const meta = DEMO_RESOURCE_RESULTS.find((item) => item.projects[0].project.projectId === project.projectId)?.projects[0];
    const job: InstallJob = {
      jobId: `demo-resource-${Date.now()}`,
      instanceId,
      kind: 'install_resource',
      status: 'finished',
      provider: 'demo',
      progress: { current: 1, total: 1 },
      display: { title: `安装 ${locator ?? meta?.title ?? project.projectId}` },
      error: null,
      created: new Date().toISOString(),
      finished: new Date().toISOString(),
      summary: null,
    };
    demoJobs.unshift(job);
    backendEvents.emit('install_job', {
      job_id: job.jobId,
      instance_id: instanceId,
      kind: job.kind,
      status: 'succeeded',
      progress: job.progress,
      display: job.display,
      error: null,
      created: job.created,
      finished: job.finished,
      summary: null,
    });
    void contentType;
    return job;
  },

  async discoverInstallModpack(project, locator, _release, _iconUrl) {
    const job: InstallJob = {
      jobId: `demo-modpack-${Date.now()}`,
      instanceId: `demo-${project.projectId}`,
      kind: 'create_modpack',
      status: 'finished',
      provider: 'demo',
      progress: { current: 1, total: 1 },
      display: { title: `创建整合包实例 ${locator ?? project.projectId}` },
      error: null,
      created: new Date().toISOString(),
      finished: new Date().toISOString(),
      summary: null,
    };
    demoJobs.unshift(job);
    return job;
  },

  async fetchProcesses() {
    return [];
  },

  async fetchSettings() {
    return { max_concurrent_downloads: 4, minecraft_file_source: 'auto', minecraft_metadata_source: 'auto' };
  },

  async patchSettings() {
    return this.fetchSettings();
  },

  async fetchJavaVersions() {
    return [{ parsed_version: 17, version: '17.0.21', architecture: 'x64', path: '自动检测', distribution: 'Temurin' }];
  },

  async setJavaDefault() {},
  async autoInstallJava() {
    return null;
  },
  async getMaxMemory() {
    return 16 * 1024 * 1024 * 1024;
  },

  async fetchLogFiles() {
    return [{ log_type: 'InfoLog', filename: 'latest.log', age: 0, output: '[演示] 这是一个浏览器演示日志。' }];
  },

  async fetchLiveLog() {
    return '[演示] 浏览器预览模式，不包含真实游戏日志。';
  },

  async onLoading(listener) {
    return backendEvents.on('loading', listener);
  },

  async onProcess(listener) {
    return backendEvents.on('process', listener);
  },

  async onInstallJob(listener) {
    return backendEvents.on('install_job', listener);
  },

  async onNotification(listener) {
    return backendEvents.on('notification', listener);
  },

  async onSettings(listener) {
    return backendEvents.on('settings', () => listener());
  },
};

/** 按运行环境选择实现 */
export const launcher: LauncherBackend = isDesktop() ? desktopBackend : mockBackend;

/** —— 原始后端类型（仅解析用，不导出） —— */

interface RawInstance {
  id: string;
  name: string;
  game_version: string;
  loader: string;
  loader_version?: string | null;
  install_stage: string;
  icon_path?: string | null;
  created: string;
  modified: string;
  last_played?: string | null;
  memory?: { maximum: number; automatic: boolean } | null;
  java_path?: string | null;
}

interface RawVersionManifest {
  latest: { release: string; snapshot: string };
  versions: { id: string; type: string; url: string; time: string; releaseTime: string }[];
}

interface RawLoaderManifest {
  gameVersions?: { id: string; versionGroup?: string | null; loaders: { id: string; stable?: boolean }[] }[];
  versionGroups?: { id: string; loaders: { id: string; stable?: boolean }[] }[];
}

interface RawProcess {
  uuid: string;
  pid: number;
  instance_id: string;
  instance_name: string;
  start_time: string;
}

interface RawDetectedImport {
  launcherType: string;
  instances?: {
    name: string;
    path: string;
    compatible_mode?: boolean;
    version_path?: string | null;
  }[];
}

interface RawInstallJob {
  job_id: string;
  instance_id?: string | null;
  kind: string;
  status: string;
  provider: string;
  progress?: { current: number; total: number; secondary?: { current: number; total: number } | null } | null;
  display?: { title: string; icon?: string | null } | null;
  error?: { message?: string } | null;
  created: string;
  finished?: string | null;
  summary?: { cached?: number; downloaded?: number; failed?: number; total?: number } | null;
}

function mapInstance(instance: RawInstance): InstanceInfo {
  // 后端 InstanceInstallStage.as_str() 返回全小写（"installed", "minecraft_installing"...），
  // 前端统一使用小写比较，避免大小写不匹配导致永远认为未安装。
  const stage = (instance.install_stage ?? 'not_installed').toLowerCase();
  return {
    id: instance.id,
    name: instance.name,
    version: instance.game_version,
    loader: instance.loader ?? 'vanilla',
    loaderVersion: instance.loader_version ?? null,
    installStage: stage,
    iconPath: instance.icon_path ?? null,
    created: instance.created,
    modified: instance.modified,
    lastPlayed: instance.last_played ?? null,
    memory: instance.memory ?? null,
    javaPath: instance.java_path ?? null,
  };
}

function mapJob(job: RawInstallJob): InstallJob {
  return {
    jobId: job.job_id,
    instanceId: job.instance_id ?? null,
    kind: job.kind,
    status: job.status,
    provider: job.provider,
    progress: job.progress ?? null,
    display: job.display ?? null,
    error: job.error && typeof job.error.message === 'string' ? { message: job.error.message } : null,
    created: job.created,
    finished: job.finished ?? null,
    summary: job.summary ?? null,
  };
}

/** 把未知错误转成用户可读信息 */
export function toErrorMessage(error: unknown): string {
  return errorMessage(error);
}