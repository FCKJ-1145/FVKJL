export type View = 'home' | 'discover' | 'instances' | 'screenshots' | 'settings';

export type LaunchStatus = 'idle' | 'preparing' | 'running';

/** 界面主题：深色 / 浅色 */
export type ThemeMode = 'dark' | 'light';

/** 默认版本隔离策略（PCL2 风格）：新建实例时按它决定用独立目录还是共享目录 */
export type IsolationPolicy = 'all' | 'modded_and_snapshot' | 'snapshot' | 'modded' | 'off';

/** 游戏进程优先级 */
export type ProcessPriority = 'high' | 'normal' | 'low';

/** 下载源策略（与后端 DownloadSourceMode 序列化一致） */
export type DownloadSourceMode = 'auto' | 'official_only' | 'mirror_preferred' | 'official_preferred';

export interface LauncherSettings {
  reduceMotion: boolean;
  /** 界面主题：深色 / 浅色 */
  theme: ThemeMode;
  /** 全局透明材质：DWM 高斯模糊透出桌面背景 */
  translucent: boolean;
  /** 材质强度 0-100：越高越通透（着色层越薄，桌面透出越多） */
  glassStrength: number;
  autoCheck: boolean;
  closeAfterLaunch: boolean;
  /** 全局内存分配（GB），默认作用于所有实例 */
  memory: number;
  /** 全局自动分配内存：开启后忽略上面的固定值 */
  autoMemory: boolean;
  /** 新建实例的默认版本隔离策略 */
  isolationPolicy: IsolationPolicy;
  /** 游戏进程优先级 */
  processPriority: ProcessPriority;
  /** 主题色，6 位十六进制 */
  accent: string;
}

export interface ToastMessage {
  id: number;
  title: string;
  detail?: string;
  kind?: 'success' | 'error' | 'info';
}

/** ---------------- 启动器更新 ---------------- */

export type UpdatePhase = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'installing' | 'ready' | 'error';

export interface AvailableUpdateInfo {
  version: string;
  currentVersion: string;
  date: string | null;
  notes: string | null;
  /** latest.json 顶层的 mandatory 标记：只允许更新，不提供跳过 */
  mandatory: boolean;
}

export interface UpdateProgressState {
  downloaded: number;
  /** null = 服务端未提供 contentLength，显示不确定进度 */
  total: number | null;
}

/** 设置页「关于与更新」与更新提示条共用的状态 */
export interface UpdateController {
  phase: UpdatePhase;
  currentVersion: string;
  available: AvailableUpdateInfo | null;
  progress: UpdateProgressState;
  error: string;
  /** 手动检查：忽略「跳过此版本」 */
  checkNow: () => void;
  startUpdate: () => void;
  /** 稍后提醒：本次会话隐藏提示 */
  dismiss: () => void;
  skipVersion: () => void;
  /** 提示条是否应该显示 */
  notifierVisible: boolean;
}

/** ------------- 后端数据模型 ------------- */

export interface BackendSettings {
  minecraft_metadata_source?: DownloadSourceMode;
  minecraft_file_source?: DownloadSourceMode;
  modrinth_source?: DownloadSourceMode;
  curseforge_source?: DownloadSourceMode;
  max_concurrent_downloads?: number;
  auto_concurrent_downloads?: boolean;
  log_level?: string;
  close_behavior?: string;
  /** 默认游戏语言（如 zh_cn / en_us；空 = 跟随启动器语言） */
  default_game_language?: string;
  // 其余键以 loose 方式透传
  [key: string]: unknown;
}

export interface JavaVersion {
  parsed_version: number;
  version: string;
  architecture: string;
  path: string;
  distribution: string | null;
}

export interface InstanceMemory {
  maximum: number;
  automatic: boolean;
  optimize_before_launch?: boolean;
}

/** 前端统一使用的实例视图（由后端 Instance 映射而来） */
export interface InstanceInfo {
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
  memory: InstanceMemory | null;
  javaPath: string | null;
}

export interface InstallProgress {
  current: number;
  total: number;
  secondary?: { current: number; total: number } | null;
}

export interface InstallErrorView {
  message: string;
  [key: string]: unknown;
}

export interface InstallJob {
  jobId: string;
  instanceId: string | null;
  kind: string;
  status: string;
  provider: string;
  progress: InstallProgress | null;
  display: { title: string; icon?: string | null } | null;
  error: InstallErrorView | null;
  created: string;
  finished: string | null;
  summary: { cached?: number; downloaded?: number; failed?: number; total?: number } | null;
}

export interface ManifestVersion {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
}

export interface LoaderVersionEntry {
  id: string;
  stable?: boolean;
}

export interface ProcessInfo {
  uuid: string;
  pid: number;
  instanceId: string;
  instanceName: string;
  startTime: string;
}

export interface LoadingPayload {
  event: unknown;
  loader_uuid: string;
  fraction: number | null;
  message: string;
}

export interface ProcessEventPayload {
  instance_id: string;
  uuid: string;
  pid: number;
  event: string;
  message: string;
  crashed: boolean | null;
}

export interface CreateInstanceRequest {
  name: string;
  gameVersion: string;
  loader: string;
  loaderVersion?: string | null;
  /** 关闭版本隔离时指向共享游戏目录；null = 用实例自己的目录 */
  gameDirOverride?: string | null;
}

export interface EditInstanceRequest {
  name?: string;
  memory?: InstanceMemory | null;
  javaPath?: string | null;
}

/** ------------- 导入已有实例 ------------- */

export interface ImportableInstance {
  name: string;
  path: string;
  compatibleMode: boolean;
  versionPath: string | null;
}

export interface DetectedImport {
  launcherType: string;
  instances: ImportableInstance[];
}

export interface ImportInstanceRequest {
  launcherType: string;
  basePath: string;
  instanceFolder: string;
  instancePath?: string | null;
  gameVersion?: string | null;
  loader?: string | null;
  loaderVersion?: string | null;
}

/** ------------- 发现内容（资源搜索，形状对齐 content-management IPC） ------------- */

/** serde camelCase：mod | plugin | dataPack | resourcePack | shader | modPack | world */
export type ResourceType = 'mod' | 'plugin' | 'dataPack' | 'resourcePack' | 'shader' | 'modPack' | 'world';

export type ResourceSearchSort =
  | 'projectPublished'
  | 'relevance'
  | 'downloads'
  | 'followers'
  | 'firstPublished'
  | 'latestPublished'
  | 'created'
  | 'projectUpdated';

export type ReleaseChannel = 'release' | 'beta' | 'alpha' | 'unknown';

export interface ResourceTarget {
  gameVersions: string[];
  loaders: string[];
  channels: ReleaseChannel[];
}

export type ResourceSearchExpression =
  | { kind: 'all'; terms: ResourceSearchExpression[] }
  | { kind: 'any'; terms: ResourceSearchExpression[] }
  | { kind: 'predicate'; field: string; values: string[]; excluded: boolean };

export interface ResourceSearchQuery {
  filter: ResourceSearchExpression | null;
  text: string;
  types: ResourceType[];
  sources: string[];
  target: ResourceTarget;
  categories: string[];
  sort: ResourceSearchSort;
  pageSize: number;
  /** 是否把中文查询词按内置词库翻译成英文项目名再检索 */
  translate: boolean;
}

export interface SourceProjectRef {
  source: string;
  projectId: string;
}

export interface SourceProjectMetadata {
  environments: string[];
  categories: string[];
  gameVersions: string[];
  loaders: string[];
  gallery: string[];
  project: SourceProjectRef;
  slug: string | null;
  title: string;
  summary: string;
  iconUrl: string | null;
  types: ResourceType[];
  authors: string[];
  license: string | null;
  downloads: number | null;
  followers: number | null;
  createdAt: string | null;
  projectPublishedAt: string | null;
  updatedAt: string | null;
  firstPublishedAt: string | null;
  latestPublishedAt: string | null;
}

export interface ResourceSearchEntry {
  queryEntryId: string;
  resourceId: string | null;
  defaultProject: SourceProjectRef;
  candidates: SourceProjectRef[];
  status: 'confirmed' | 'unconfirmed' | 'rejected';
  basis: string[];
}

export interface ResourceSearchResult {
  entry: ResourceSearchEntry;
  projects: SourceProjectMetadata[];
}

export interface ResourceTotal {
  value: number | null;
  precision: 'exact' | 'estimate' | 'unknown';
}

export interface ResourceSourceFailure {
  source: string;
  code: string;
  message: string;
  retryable: boolean;
}

export interface ResourcePage<T> {
  requestId: string;
  entries: T[];
  cursor: string | null;
  hasMore: boolean;
  total: ResourceTotal;
  sourceFailures: ResourceSourceFailure[];
  exhaustedSources: string[];
}

export interface ResourceSource {
  id: string;
  types: ResourceType[];
  capabilities: string[];
  available: boolean;
  supportedSearchSorts: ResourceSearchSort[];
}

export interface ResourceText {
  source: string;
  format: 'markdown' | 'html' | 'plain';
  body: string;
}

export interface ProjectDocument {
  owner: { id: string; name: string; avatarUrl: string | null; organization: boolean } | null;
  metadata: SourceProjectMetadata;
  description: ResourceText;
  protocol: unknown | null;
}

export type ResourceRef =
  | { kind: 'resource'; id: string }
  | { kind: 'source'; project: SourceProjectRef };

export type InstallScope = { kind: 'instance' } | { kind: 'world'; relativePath: string };

export type ResourceOperationIntent = 'install' | 'update' | 'switchVersion';

export interface ResourceSelection {
  id: string;
  resource: ResourceRef;
  release: ResourceSelectionRelease;
  resourceType: ResourceType;
  scope: InstallScope;
  entryId: string | null;
}

export interface ResourceOperationPlan {
  schemaVersion: number;
  id: string;
  revision: number;
  instanceId: string;
  instanceRevision: number;
  intent: ResourceOperationIntent;
  selections: ResourceSelection[];
  activeRoots: string[];
  nodes: unknown[];
  edges: unknown[];
  actions: unknown[];
  issues: { code?: string; message?: string; [key: string]: unknown }[];
  exceptions: unknown[];
  selectionReasons: unknown[];
}

export interface ResourceFavorite {
  locator: string | null;
  resourceId: string | null;
  project: SourceProjectRef;
  projects: SourceProjectRef[];
  contentType: ResourceType;
  savedAt: number;
}

/** 与后端 SourceReleaseRef 一致：{ project, releaseId } */
export interface SourceReleaseRef {
  project: SourceProjectRef;
  releaseId: string;
}

/** 版本兼容性：空数组表示未知，而不是全兼容（与后端 ReleaseCompatibility 一致） */
export interface ReleaseCompatibility {
  gameVersions: string[];
  loaders: string[];
}

export interface ResourceArtifact {
  reference: { kind: string; [key: string]: unknown };
  fileName: string | null;
  role: string;
  available: boolean | null;
}

/** 与后端 theseus ResourceRelease 严格对应 */
export interface ResourceRelease {
  reference: SourceReleaseRef;
  version: string;
  channel: ReleaseChannel;
  publishedAt: string | null;
  compatibility: ReleaseCompatibility;
  artifacts: ResourceArtifact[];
  equivalentReleases: SourceReleaseRef[];
}

/** 与后端 theseus ReleaseSelection 严格对应 */
export type ResourceSelectionRelease =
  | { kind: 'automatic' }
  | { kind: 'release'; reference: SourceReleaseRef }
  | { kind: 'artifact'; reference: { kind: string; [key: string]: unknown } };