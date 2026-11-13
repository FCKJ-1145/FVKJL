import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { CreateInstanceModal } from './components/CreateInstanceModal';
import { DiscoverView } from './components/DiscoverView';
import { DownloadTasksModal } from './components/DownloadTasksModal';
import { HomeView } from './components/HomeView';
import { InstanceLogs } from './components/InstanceLogs';
import { InstanceSettingsModal } from './components/InstanceSettingsModal';
import { InstancesView } from './components/InstancesView';
import { ScreenshotsView } from './components/ScreenshotsView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { Titlebar } from './components/Titlebar';
import { Toast } from './components/Toast';
import { UpdateNotifier } from './components/UpdateNotifier';
import { DEFAULT_SETTINGS } from './data';
import { isDesktop, revealWindow, setGlass } from './lib/desktop';
import { shouldIsolateInstance } from './lib/isolation';
import { setInstanceIconFromUrl, setProcessPriority, sharedGameDir } from './lib/instanceSettings';
import { invalidateInstanceIcon } from './components/InstanceIcon';
import { applyAccent, applyGlassStrength, normalizeAccent, normalizeGlassStrength } from './lib/palette';
import { launcher, toErrorMessage } from './lib/launcher';
import { TERMINAL_JOB_STATUSES } from './lib/jobs';
import { useAutoUpdate } from './lib/useAutoUpdate';
import { usePersistentState } from './lib/usePersistentState';
import { useRipple } from './lib/useRipple';
import type { BackendSettings, CreateInstanceRequest, InstanceInfo, InstanceMemory, InstallJob, LauncherSettings, SourceProjectMetadata, ToastMessage, View } from './types';

interface ActiveBar {
  fraction: number | null;
  message: string;
}

function sameSerialized<T>(left: T, right: T): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function sameIdSet(left: Set<string>, right: Set<string>): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [backendReady, setBackendReady] = useState(!isDesktop());
  const [backendError, setBackendError] = useState('');
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [selectedId, setSelectedId] = usePersistentState<string>('aster.selected-instance', 'main');
  const [backendSettings, setBackendSettings] = useState<BackendSettings>({});
  const [javaVersions, setJavaVersions] = useState<{ parsed_version: number; version: string; path: string; architecture: string; distribution: string | null }[]>([]);
  const [maxMemory, setMaxMemory] = useState(0);
  const [jobs, setJobs] = useState<InstallJob[]>([]);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [preparingIds, setPreparingIds] = useState<Set<string>>(new Set());
  const [loadingBars, setLoadingBars] = useState<Record<string, ActiveBar>>({});
  const [storedSettings, setSettings] = usePersistentState<LauncherSettings>('aster.settings', DEFAULT_SETTINGS);
  const settings = useMemo<LauncherSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    theme: storedSettings.theme === 'light' ? 'light' : 'dark',
    accent: normalizeAccent(storedSettings.accent),
    translucent: storedSettings.translucent !== false,
    glassStrength: normalizeGlassStrength(storedSettings.glassStrength),
  }), [storedSettings]);
  /** 启动器自动更新：静默检查 + 设置页手动检查 + 右下角提示 */
  const updater = useAutoUpdate({ enabled: settings.autoCheck, desktop: isDesktop() });
  // 演示模式下的启动进度（浏览器预览）
  const [demoProgress, setDemoProgress] = useState(0);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoPreparing, setDemoPreparing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPreset, setCreatePreset] = useState<string | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [logsFor, setLogsFor] = useState<InstanceInfo | null>(null);
  /** 实例设置弹窗：存 id 而不是对象，改名后仍能拿到最新实例 */
  const [settingsForId, setSettingsForId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  useRipple();

  const selectedInstance = instances.find((item) => item.id === selectedId) ?? instances[0] ?? null;

  const notify = useCallback((title: string, detail?: string, kind: ToastMessage['kind'] = 'success') => {
    setToast({ id: Date.now(), title, detail, kind });
  }, []);

  const closeCreate = useCallback(() => { setCreateOpen(false); setCreatePreset(null); }, []);
  const closeToast = useCallback(() => setToast(null), []);

  /** 主题切换走一次轻量跨主题过渡；不支持 View Transition 时退回短时颜色过渡。 */
  const handleSettingsChange = useCallback((next: LauncherSettings) => {
    const root = document.documentElement;
    const themeChanged = next.theme !== root.dataset.theme;
    const reducedMotion = next.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!themeChanged || reducedMotion) {
      setSettings(next);
      return;
    }

    const transitionDocument = document;
    if (typeof transitionDocument.startViewTransition !== 'function') {
      root.classList.add('theme-fade');
      setSettings(next);
      window.setTimeout(() => root.classList.remove('theme-fade'), 320);
      return;
    }

    transitionDocument.startViewTransition(() => {
      flushSync(() => {
        root.dataset.theme = next.theme;
        setSettings(next);
      });
    });
  }, [setSettings]);

  useLayoutEffect(() => {
    applyAccent(settings.accent);
  }, [settings.accent]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reduceMotion = String(settings.reduceMotion);
    root.dataset.theme = settings.theme;
    applyGlassStrength(settings.glassStrength, settings.translucent);
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', settings.theme === 'light' ? '#eef2f8' : '#090d14');
  }, [settings.reduceMotion, settings.theme, settings.translucent, settings.glassStrength]);

  /** 全局透明材质：Rust 侧 DWM 高斯模糊随开关即时同步 */
  useEffect(() => {
    void setGlass(settings.translucent);
  }, [settings.translucent]);

  useEffect(() => {
    const root = document.documentElement;
    const desktop = isDesktop();
    root.dataset.runtime = desktop ? 'tauri' : 'web';
    if (!desktop) return;

    let timer = 0;
    let disposed = false;
    const syncMaximized = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void (async () => {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const maximized = await getCurrentWindow().isMaximized();
          if (!disposed) root.dataset.maximized = String(maximized);
        })();
      }, 60);
    };

    syncMaximized();
    window.addEventListener('resize', syncMaximized);
    void revealWindow();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener('resize', syncMaximized);
    };
  }, []);

  /** 数据刷新：实例、任务、进程、设置 */
  const refreshInstances = useCallback(async () => {
    try {
      const list = await launcher.fetchInstances();
      // 轮询返回的新数组若内容没变，保留旧引用，避免整棵视图重复渲染。
      setInstances((current) => sameSerialized(current, list) ? current : list);
      setBackendError('');
    } catch (error) {
      setBackendError(toErrorMessage(error));
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const next = await launcher.listJobs();
      setJobs((current) => sameSerialized(current, next) ? current : next);
    } catch {
      // 任务列表刷新失败不影响主流程
    }
  }, []);

  const refreshProcesses = useCallback(async () => {
    if (!isDesktop()) return;
    try {
      const processes = await launcher.fetchProcesses();
      const next = new Set(processes.map((process) => process.instanceId));
      setRunningIds((current) => sameIdSet(current, next) ? current : next);
    } catch {
      // 进程查询失败时可重试
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      setBackendSettings(await launcher.fetchSettings());
    } catch {
      // 设置读取失败时保留上一次值
    }
  }, []);

  const refreshJava = useCallback(async () => {
    try {
      const [versions, memory] = await Promise.all([launcher.fetchJavaVersions(), launcher.getMaxMemory()]);
      setJavaVersions(versions);
      setMaxMemory(memory);
    } catch {
      // Java 环境读取失败时保留空列表
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshInstances(), refreshJobs(), refreshProcesses(), refreshSettings(), refreshJava()]);
  }, [refreshInstances, refreshJobs, refreshProcesses, refreshSettings, refreshJava]);

  /** 桌面端启动：初始化后端并载入数据 */
  useEffect(() => {
    if (!isDesktop()) return;
    let disposed = false;
    void (async () => {
      try {
        await launcher.initialize();
      } catch (error) {
        if (!disposed) {
          setBackendError(toErrorMessage(error));
          notify('后端初始化失败', toErrorMessage(error), 'error');
        }
        return;
      }
      if (disposed) return;
      setBackendReady(true);
      await refreshAll();
    })();
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 浏览器演示模式：载入本地演示数据 */
  useEffect(() => {
    if (isDesktop()) return;
    void refreshInstances();
    void refreshSettings();
    void refreshJava();
  }, [refreshInstances, refreshSettings, refreshJava]);

  /** 桌面端事件订阅 */
  useEffect(() => {
    if (!isDesktop()) return;
    const unsubs: Promise<() => void>[] = [];
    unsubs.push(launcher.onLoading((payload) => {
      setLoadingBars((bars) => {
        const next = { ...bars };
        if (payload.fraction === null || payload.fraction === undefined) delete next[payload.loader_uuid];
        else next[payload.loader_uuid] = { fraction: payload.fraction, message: payload.message };
        return next;
      });
    }));
    unsubs.push(launcher.onProcess((payload) => {
      setPreparingIds((ids) => {
        const next = new Set(ids);
        next.delete(payload.instance_id);
        return next;
      });
      if (['stopped', 'exited', 'crashed', 'error'].includes(payload.event) && (payload.crashed || payload.event === 'error')) {
        notify('实例异常退出', payload.message || '进程已结束。', 'error');
      }
      void refreshProcesses();
      void refreshInstances();
      void refreshJobs();
    }));
    unsubs.push(launcher.onInstallJob((payload) => {
      // 实时刷新 jobs 列表
      void refreshJobs();
      // 安装完成/失败/取消/中断时刷新 instances（install_stage 会变）
      // 后端 InstallJobStatus (snake_case): queued, running, canceling, waiting_for_user,
      //   succeeded, failed, interrupted, canceled
      const status = payload.status?.toLowerCase() ?? '';
      if (['succeeded', 'failed', 'canceled', 'cancel', 'interrupted'].includes(status)) {
        void refreshInstances();
        if (status === 'succeeded') {
          const title = payload.display?.title ?? '安装完成';
          notify(title, '资源已就绪，可以启动。');
        } else if (status === 'failed' || status === 'interrupted') {
          const msg = payload.error?.message ?? (status === 'interrupted' ? '安装被中断' : '安装任务失败');
          notify('安装失败', msg, 'error');
        } else if (status === 'canceled') {
          notify('安装已取消', '', 'info');
        }
      }
    }));
    unsubs.push(launcher.onNotification((payload) => {
      notify(payload.title || '通知', payload.message);
    }));
    unsubs.push(launcher.onSettings(() => {
      void refreshSettings();
    }));
    return () => {
      unsubs.forEach((unsub) => void unsub.then((fn) => fn()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 任务与进程轮询（桌面端；窗口不可见时暂停进程查询） */
  useEffect(() => {
    if (!isDesktop()) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refreshProcesses();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshProcesses();
    };
    const processTimer = window.setInterval(tick, 4000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(processTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshProcesses]);

  useEffect(() => {
    if (!isDesktop()) return;
    // 只要有 active jobs 或 loading bars 就轮询刷新（install_job 事件是主要通道，轮询作为兜底）
    // 后端 InstallJobStatus: queued, running, canceling, waiting_for_user,
    //   succeeded, failed, interrupted, canceled
    const hasActive = jobs.some((job) => !TERMINAL_JOB_STATUSES.has(job.status));
    if (!hasActive && Object.keys(loadingBars).length === 0) return;
    const timer = window.setInterval(() => {
      void refreshJobs();
      void refreshInstances();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [jobs, loadingBars, refreshJobs, refreshInstances]);

  useEffect(() => {
    const main = mainRef.current;
    main?.focus({ preventScroll: true });
    // 切页从顶部开始：main 上有 scroll-behavior: smooth，这里用 instant 直接归零，
    // 否则会和新页面的入场淡入抢动画，看起来像页面在抖。
    main?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [view]);

  /** 演示模式：准备动画推进 */
  useEffect(() => {
    if (!demoPreparing) return;
    const timer = window.setInterval(() => setDemoProgress((value) => Math.min(100, value + 4)), 90);
    return () => window.clearInterval(timer);
  }, [demoPreparing]);

  useEffect(() => {
    if (!demoPreparing || demoProgress < 100) return;
    setDemoPreparing(false);
    setDemoRunning(true);
    notify('启动流程已完成', '当前为浏览器演示模式，桌面端将真正启动游戏。');
  }, [demoPreparing, demoProgress, notify]);

  const openCreate = useCallback((version?: string) => {
    setCreatePreset(version ?? null);
    setCreateOpen(true);
  }, []);

  const openDownloads = useCallback(() => setDownloadsOpen(true), []);
  const openInstances = useCallback(() => setView('instances'), []);
  const handleProfile = useCallback(() => notify('本地用户', '当前使用离线模式，无需登录。', 'info'), [notify]);

  /** 启动后把游戏进程调到设置里的优先级：Java 进程要一会儿才出现在进程表里 */
  const applyLaunchPriority = useCallback(async (instanceId: string) => {
    const level = settings.processPriority;
    if (!isDesktop() || level === 'normal') return;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      try {
        const processes = await launcher.fetchProcesses();
        const target = processes.find((item) => item.instanceId === instanceId);
        if (target) {
          await setProcessPriority(target.pid, level);
          return;
        }
      } catch {
        // 进程表暂时不可读时继续等
      }
    }
  }, [settings.processPriority]);

  const handleLaunch = useCallback(async (id?: string) => {
    if (id) setSelectedId(id);
    const target = instances.find((item) => item.id === (id ?? selectedId)) ?? instances[0];
    if (!target) {
      notify('暂无可启动的实例', '请先在「实例库」中创建或恢复一个实例。', 'error');
      return;
    }
    // 已在运行 → 结束
    const isRunning = isDesktop() ? runningIds.has(target.id) : demoRunning;
    if (isRunning) {
      try {
        if (isDesktop()) await launcher.kill(target.id);
        else { setDemoRunning(false); setDemoProgress(0); }
        notify('已结束运行', `${target.name} 已停止。`);
      } catch (error) {
        notify('结束失败', toErrorMessage(error), 'error');
      }
      void refreshProcesses();
      return;
    }
    // 未完成安装 → 先修复安装（与 Axolotl 一致的“点启动自动补安装”）
    if (target.installStage !== 'installed') {
      notify('需要先完成安装', `${target.version} 尚未安装完成，已加入下载队列。`, 'info');
      try {
        const job = await launcher.repairInstance(target.id);
        await refreshJobs();
        if (job) { /* 任务已入队 */ }
      } catch (error) {
        notify('修复任务创建失败', toErrorMessage(error), 'error');
      }
      setCreateOpen(false);
      setCreatePreset(null);
      setDownloadsOpen(true);
      return;
    }
    if (isDesktop()) {
      setPreparingIds((ids) => new Set(ids).add(target.id));
      try {
        await launcher.launch(target.id, true);
        void applyLaunchPriority(target.id);
        if (settings.closeAfterLaunch) {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          void getCurrentWindow().minimize().catch(() => {});
        }
      } catch (error) {
        setPreparingIds((ids) => {
          const next = new Set(ids);
          next.delete(target.id);
          return next;
        });
        notify('启动失败', toErrorMessage(error), 'error');
      }
    } else {
      setDemoProgress(0);
      setDemoPreparing(true);
    }
    return undefined;
  }, [applyLaunchPriority, demoRunning, instances, notify, refreshJobs, refreshProcesses, runningIds, selectedId, settings.closeAfterLaunch]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    const instance = instances.find((item) => item.id === id);
    if (instance && view === 'instances') notify('已切换当前实例', instance.name);
  }, [instances, notify, view]);

  const handleCreate = async (request: CreateInstanceRequest) => {
    try {
      // 名称留空时自动命名：我的世界1、我的世界2…（跳过已被占用的序号）
      const instanceName = request.name.trim() || nextDefaultInstanceName(instances);
      // 默认版本隔离策略：不隔离时把实例指向共享 minecraft 目录
      let gameDirOverride: string | null = null;
      if (isDesktop() && !shouldIsolateInstance(settings.isolationPolicy, { loader: request.loader, version: request.gameVersion })) {
        try {
          gameDirOverride = await sharedGameDir();
        } catch {
          gameDirOverride = null;
        }
      }
      const job = await launcher.createInstance({ ...request, name: instanceName, gameDirOverride });
      setCreateOpen(false);
      setCreatePreset(null);
      notify('实例已创建', `${instanceName} · ${request.gameVersion} 已加入下载队列。`, 'info');
      await refreshInstances();
      await refreshJobs();
      if (job.instanceId) setSelectedId(job.instanceId);
    } catch (error) {
      notify('创建失败', toErrorMessage(error), 'error');
      throw error;
    }
  };

  /** 待套用的封面：jobId → 发现页封面 URL（后端下载失败时兜底） */
  const pendingCoverIcons = useRef<Map<string, string>>(new Map());

  /** 发现内容：安装资源到当前实例（可指定版本）；整合包则创建新实例 */
  const handleDiscoverInstall = useCallback(async (meta: SourceProjectMetadata, release?: import('./types').ResourceSelectionRelease, instanceId?: string) => {
    const contentType = meta.types[0] ?? 'mod';
    if (contentType === 'modPack') {
      // 把发现页封面一并交给后端：创建实例时直接下载为 icon_path
      const job = await launcher.discoverInstallModpack(meta.project, meta.title || meta.slug, release, meta.iconUrl);
      const cover = meta.iconUrl?.trim();
      if (cover) pendingCoverIcons.current.set(job.jobId, cover);
      notify('正在创建整合包实例', `${meta.title}：完成后会出现在实例库。`, 'success');
      await refreshJobs();
      await refreshInstances();
      setDownloadsOpen(true);
      return;
    }
    const instance = (instanceId ? instances.find((item) => item.id === instanceId) : null)
      ?? instances.find((item) => item.id === selectedId) ?? instances[0] ?? null;
    if (!instance) {
      notify('请先创建实例', '发现内容需要安装到一个实例中。', 'info');
      setView('instances');
      return;
    }
    await launcher.discoverInstall(instance.id, meta.project, contentType, meta.slug, release);
    notify('已加入下载任务', `${meta.title} → ${instance.name}`, 'success');
    await refreshJobs();
    await refreshInstances();
    setDownloadsOpen(true);
  }, [instances, notify, refreshInstances, refreshJobs, selectedId]);

  /** 导入流程已在弹窗内发起任务，这里负责收尾与刷新 */
  const appliedIconJobs = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isDesktop()) return;
    for (const job of jobs) {
      const instanceId = job.instanceId;
      if (job.status !== 'succeeded' || !instanceId) continue;
      if (appliedIconJobs.current.has(job.jobId)) continue;
      const icon = job.display?.icon;
      // 后端成功写入图标时 display.icon 是本地缓存路径，无需再套；
      // 仅当它是远程 URL（旧流程），或图标缺失时才用发现页封面兜底。
      const source = typeof icon === 'string' && /^https?:\/\//i.test(icon)
        ? icon
        : !icon
          ? pendingCoverIcons.current.get(job.jobId) ?? null
          : null;
      if (!source) continue;
      appliedIconJobs.current.add(job.jobId);
      pendingCoverIcons.current.delete(job.jobId);
      void setInstanceIconFromUrl(instanceId, source)
        .then(() => {
          invalidateInstanceIcon(instanceId);
          void refreshInstances();
        })
        .catch(() => undefined);
    }
  }, [jobs, refreshInstances]);

  const handleJobStarted = (job: InstallJob, title: string) => {
    setCreateOpen(false);
    setCreatePreset(null);
    notify(title, '已加入下载队列。', 'info');
    void refreshInstances();
    void refreshJobs();
    if (job.instanceId) setSelectedId(job.instanceId);
  };

  const handleRemove = useCallback(async (instance: InstanceInfo) => {
    try {
      await launcher.removeInstance(instance.id);
      if (selectedId === instance.id) setSelectedId(instances.find((item) => item.id !== instance.id)?.id ?? 'main');
      await refreshInstances();
      notify('实例已删除', `${instance.name} 已被移除。`);
    } catch (error) {
      notify('删除失败', toErrorMessage(error), 'error');
    }
  }, [instances, notify, refreshInstances, selectedId, setSelectedId]);

  /** 全局内存设置：一次性写到所有实例（实例设置里的单独调整会覆盖这里的值） */
  const handleApplyMemoryToAll = useCallback(async (memory: InstanceMemory) => {
    if (!isDesktop()) return;
    const targets = instances;
    await Promise.all(
      targets.map((item) => launcher.editInstance(item.id, { memory }).catch(() => undefined)),
    );
    await refreshInstances();
  }, [instances, refreshInstances]);

  const handlePatchSettings = useCallback(async (patch: Record<string, unknown>) => {
    if (!isDesktop()) {
      setBackendSettings((current) => ({ ...current, ...patch }));
      return;
    }
    try {
      const next = await launcher.patchSettings(patch);
      setBackendSettings(next);
      notify('设置已保存', '更改将立即生效。');
    } catch (error) {
      notify('保存失败', toErrorMessage(error), 'error');
    }
  }, [notify]);

  const handleOpenLogs = useCallback((instanceId: string) => {
    setLogsFor(instances.find((item) => item.id === instanceId) ?? null);
  }, [instances]);

  /** 当前展示进度：桌面端取最近一条加载条，演示模式取模拟进度 */
  const currentProgress = useMemo(() => {
    if (!isDesktop()) return demoPreparing ? demoProgress : demoRunning ? 100 : 0;
    const bars = Object.values(loadingBars);
    const active = bars.filter((bar) => bar.fraction !== null && bar.fraction !== undefined);
    if (!active.length) return 0;
    return Math.round(Math.min(100, Math.max(...active.map((bar) => (bar.fraction as number) * 100))));
  }, [loadingBars, demoPreparing, demoProgress, demoRunning]);

  const currentMessage = useMemo(() => {
    if (!isDesktop()) return demoPreparing ? '正在校验运行环境与资源' : demoRunning ? '界面演示正在运行' : '所有资源已准备完毕';
    const bars = Object.values(loadingBars).filter((bar) => bar.message && bar.fraction !== null);
    if (bars.length) return bars[bars.length - 1].message;
    return '所有资源已准备完毕';
  }, [loadingBars, demoPreparing, demoRunning]);

  const isWeb = !isDesktop();
  const selectedRunning = isWeb ? demoRunning : selectedInstance ? runningIds.has(selectedInstance.id) : false;
  const selectedPreparing = isWeb ? demoPreparing : selectedInstance ? preparingIds.has(selectedInstance.id) : false;

  const homeInstance = selectedInstance || (instances[0] ?? null);
  const memoryGb = homeInstance?.memory?.maximum
    ? Math.max(1, Math.round(homeInstance.memory.maximum / 1024))
    : settings.memory;

  const runningCount = isDesktop() ? runningIds.size : (demoRunning ? 1 : 0);
  const activeJobCount = jobs.filter((job) => !TERMINAL_JOB_STATUSES.has(job.status)).length;

  return (
    <div className="app-viewport">
      <a className="skip-link" href="#main-content">跳转到主要内容</a>
      <div className="app-shell">
        <div className="shell-veil" aria-hidden="true" />
        <Sidebar view={view} onChange={setView} onProfile={handleProfile} />
        <div className="main-panel">
          <Titlebar runningCount={runningCount} activeJobs={activeJobCount} backendReady={backendReady} backendError={backendError} onNotify={notify} onOpenDownloads={openDownloads} />
          <main id="main-content" ref={mainRef} tabIndex={-1}>
            {!backendReady && isDesktop() ? (
              <ViewShell>
                <div className="empty-state glass-panel">
                  <span className="loader-ring" aria-hidden="true" />
                  <h2>正在初始化启动器核心</h2>
                  <p>{backendError || '载入 Axolotl 核心运行时（theseus）…'}</p>
                </div>
              </ViewShell>
            ) : view === 'home' && homeInstance ? (
              <HomeView
                instance={homeInstance}
                instances={instances}
                status={selectedRunning ? 'running' : selectedPreparing ? 'preparing' : 'idle'}
                progress={currentProgress}
                message={currentMessage}
                memory={memoryGb}
                javaMajor={javaVersions[0]?.parsed_version}
                onSelect={handleSelect}
                onLaunch={handleLaunch}
                onCreate={openCreate}
                onNavigate={setView}
              />
            ) : view === 'home' ? (
              <ViewShell>
                <div className="empty-state glass-panel">
                  <h2>还没有实例</h2>
                  <p>创建第一个实例，开始你的游戏之旅。</p>
                  <button type="button" className="button primary pressable" data-ripple onClick={() => openCreate()}>新建实例</button>
                </div>
              </ViewShell>
            ) : view === 'discover' ? (
              <DiscoverView
                instances={instances}
                selectedId={selectedId}
                notify={notify}
                onOpenInstances={openInstances}
                onInstall={handleDiscoverInstall}
                backendReady={backendReady}
              />
            ) : view === 'instances' ? (
              <InstancesView
                instances={instances}
                selectedId={selectedId}
                runningIds={runningIds}
                onSelect={handleSelect}
                onLaunch={handleLaunch}
                onCreate={openCreate}
                onRemove={handleRemove}
                onViewLogs={handleOpenLogs}
                onOpenSettings={setSettingsForId}
              />
            ) : view === 'screenshots' ? (
              <ScreenshotsView isDesktop={isDesktop()} />
            ) : (
              <SettingsView
                settings={settings}
                backendSettings={backendSettings}
                javaVersions={javaVersions}
                maxMemory={maxMemory}
                isDesktop={isDesktop()}
                onChange={handleSettingsChange}
                onPatchSettings={(patch) => void handlePatchSettings(patch)}
                onApplyMemory={handleApplyMemoryToAll}
                onRefreshJava={() => void refreshJava()}
                updater={updater}
              />
            )}
          </main>
        </div>
        {updater.notifierVisible && updater.available && (
          <UpdateNotifier
            update={updater.available}
            phase={updater.phase}
            progress={updater.progress}
            onUpdate={updater.startUpdate}
            onLater={updater.dismiss}
            onSkip={updater.skipVersion}
          />
        )}
        {toast && <Toast toast={toast} onClose={closeToast} />}
        {createOpen && (
          <CreateInstanceModal
            presetVersion={createPreset}
            isDesktop={isDesktop()}
            onClose={closeCreate}
            onCreate={(request) => handleCreate(request)}
            onJobStarted={handleJobStarted}
          />
        )}
        {downloadsOpen && (
          <DownloadTasksModal
            jobs={jobs}
            progress={currentProgress}
            loadingMessage={currentMessage}
            onClose={() => setDownloadsOpen(false)}
            onCancel={(jobId) => void launcher.cancelJob(jobId).then(refreshJobs).catch((error) => notify('操作失败', toErrorMessage(error), 'error'))}
            onRetry={(jobId) => void launcher.retryJob(jobId).then(refreshJobs).catch((error) => notify('操作失败', toErrorMessage(error), 'error'))}
            onResume={(jobId) => void launcher.resumeJob(jobId).then(refreshJobs).catch((error) => notify('操作失败', toErrorMessage(error), 'error'))}
            onDismiss={(jobId) => void launcher.dismissJob(jobId).then(() => { void refreshJobs(); }).catch((error) => notify('操作失败', toErrorMessage(error), 'error'))}
            onRefresh={refreshJobs}
          />
        )}
        {logsFor && (
          <InstanceLogs instanceId={logsFor.id} instanceName={logsFor.name} onClose={() => setLogsFor(null)} />
        )}
        {settingsForId && (() => {
          const target = instances.find((item) => item.id === settingsForId);
          if (!target) return null;
          return (
            <InstanceSettingsModal
              instance={target}
              javaVersions={javaVersions}
              maxMemory={maxMemory}
              isDesktop={isDesktop()}
              onClose={() => setSettingsForId(null)}
              onSaved={refreshInstances}
              notify={notify}
            />
          );
        })()}
      </div>
    </div>
  );
}

function ViewShell({ children }: { children: ReactNode }) {
  return <div className="view">{children}</div>;
}

/**
 * 未填实例名称时的默认名：我的世界1、我的世界2……
 * 遇到重名就往后顺延，取第一个没被占用的序号。
 */
function nextDefaultInstanceName(instances: InstanceInfo[]): string {
  const used = new Set(instances.map((item) => item.name.trim()));
  for (let index = 1; index <= 9999; index += 1) {
    const candidate = `我的世界${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `我的世界${Date.now()}`;
}