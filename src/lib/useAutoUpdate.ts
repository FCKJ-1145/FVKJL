import { useCallback, useEffect, useRef, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import packageInfo from '../../package.json';
import type { AvailableUpdateInfo, UpdateController, UpdatePhase, UpdateProgressState } from '../types';

/** 启动后延迟 8 秒做一次静默检查，之后每 6 小时轮询 */
const STARTUP_CHECK_DELAY = 8000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

const LAST_CHECK_KEY = 'aster.update.last-check';
const SKIPPED_VERSION_KEY = 'aster.update.skipped-version';

interface UseAutoUpdateOptions {
  /** 设置里的「自动检查更新」开关 */
  enabled: boolean;
  desktop: boolean;
}

function readSkippedVersion(): string {
  try {
    return window.localStorage.getItem(SKIPPED_VERSION_KEY) ?? '';
  } catch {
    return '';
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error) return error;
  return '检查更新时发生未知错误';
}

/** latest.json 允许带顶层 mandatory: true 表示强制更新 */
function readMandatory(raw: Record<string, unknown>): boolean {
  return raw.mandatory === true;
}

/**
 * 启动器自动更新：检查 / 下载安装 / 重启。
 *
 * 所有网络与签名校验都由 tauri-plugin-updater 完成，这里只做状态编排。
 * 静默检查失败一律降级为「无更新」，仅打印日志，不打扰用户。
 */
export function useAutoUpdate({ enabled, desktop }: UseAutoUpdateOptions): UpdateController {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [available, setAvailable] = useState<AvailableUpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgressState>({ downloaded: 0, total: null });
  const [error, setError] = useState('');
  const [skipped, setSkipped] = useState(readSkippedVersion);
  const [dismissed, setDismissed] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>(packageInfo.version);

  /** 插件返回的 Update 句柄（含 downloadAndInstall），不放进 state */
  const handleRef = useRef<Update | null>(null);
  const checkingRef = useRef(false);
  const workingRef = useRef(false);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((version) => {
        if (!disposed && version) setCurrentVersion(version);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [desktop]);

  const runCheck = useCallback(async (options?: { silent?: boolean; ignoreSkip?: boolean }) => {
    if (!desktop || checkingRef.current) return;
    checkingRef.current = true;
    const silent = options?.silent ?? false;
    if (!silent) {
      setError('');
      setPhase('checking');
    }
    try {
      window.localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    } catch {
      // 存储不可用不影响检查
    }

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      // 上一次检查留下的句柄先释放
      if (handleRef.current && handleRef.current !== update) {
        void handleRef.current.close().catch(() => undefined);
      }
      handleRef.current = update;

      if (!update) {
        setAvailable(null);
        setProgress({ downloaded: 0, total: null });
        setPhase('up-to-date');
        return;
      }

      const info: AvailableUpdateInfo = {
        version: update.version,
        currentVersion: update.currentVersion,
        date: update.date ?? null,
        notes: update.body?.trim() || null,
        mandatory: readMandatory(update.rawJson),
      };

      // 「跳过此版本」只影响自动提示；手动检查依旧展示
      if (!options?.ignoreSkip && info.version === readSkippedVersion()) {
        setAvailable(null);
        setPhase('idle');
        return;
      }

      setAvailable(info);
      setDismissed(false);
      setPhase('available');
    } catch (cause) {
      if (silent) {
        // 网络 / JSON / 签名异常全部静默降级为无更新
        console.warn('[updater] 检查更新失败，已按无更新处理', cause);
        return;
      }
      setPhase('error');
      setError(errorMessage(cause));
    } finally {
      checkingRef.current = false;
    }
  }, [desktop]);

  const checkNow = useCallback(() => {
    void runCheck({ ignoreSkip: true });
  }, [runCheck]);

  const startUpdate = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle || workingRef.current) return;
    workingRef.current = true;
    setError('');
    setProgress({ downloaded: 0, total: null });
    setPhase('downloading');

    let downloaded = 0;
    let total: number | null = null;

    try {
      await handle.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null;
          setProgress({ downloaded, total });
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setProgress({ downloaded, total });
        } else if (event.event === 'Finished') {
          setPhase('installing');
        }
      });

      // 安装包已交给 NSIS（passive），重启后运行新版本
      setPhase('ready');
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('restart_app');
    } catch (cause) {
      workingRef.current = false;
      setPhase('error');
      setError(errorMessage(cause));
    }
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  const skipVersion = useCallback(() => {
    if (available) {
      try {
        window.localStorage.setItem(SKIPPED_VERSION_KEY, available.version);
      } catch {
        // 存储不可用时仅本次会话隐藏
      }
      setSkipped(available.version);
    }
    setDismissed(true);
  }, [available]);

  useEffect(() => {
    if (!desktop || !enabled) return;

    const startup = window.setTimeout(() => {
      let lastCheck = 0;
      try {
        lastCheck = Number(window.localStorage.getItem(LAST_CHECK_KEY) ?? 0);
      } catch {
        lastCheck = 0;
      }
      if (!Number.isFinite(lastCheck) || Date.now() - lastCheck >= CHECK_INTERVAL) {
        void runCheck({ silent: true });
      }
    }, STARTUP_CHECK_DELAY);

    const interval = window.setInterval(() => void runCheck({ silent: true }), CHECK_INTERVAL);
    return () => {
      window.clearTimeout(startup);
      window.clearInterval(interval);
    };
  }, [desktop, enabled, runCheck]);

  return {
    phase,
    currentVersion,
    available,
    progress,
    error,
    checkNow,
    startUpdate: () => void startUpdate(),
    dismiss,
    skipVersion,
    notifierVisible: Boolean(available) && !dismissed && available?.version !== skipped && phase !== 'error',
  };
}
