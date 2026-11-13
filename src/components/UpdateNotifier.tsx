import { ArrowUpCircle, Download, X } from 'lucide-react';
import { formatBytes } from '../lib/launcher';
import type { AvailableUpdateInfo, UpdatePhase, UpdateProgressState } from '../types';

interface UpdateNotifierProps {
  update: AvailableUpdateInfo;
  phase: UpdatePhase;
  progress: UpdateProgressState;
  onUpdate: () => void;
  onLater: () => void;
  onSkip: () => void;
}

/**
 * 非模态更新提示：右下角小条，不阻断主流程。
 * 下载 / 安装阶段留在原地显示进度，完成后由 hook 触发重启。
 */
export function UpdateNotifier({ update, phase, progress, onUpdate, onLater, onSkip }: UpdateNotifierProps) {
  const busy = phase === 'downloading' || phase === 'installing' || phase === 'ready';
  const percent = progress.total && progress.total > 0
    ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
    : null;

  const status = phase === 'downloading'
    ? (percent === null ? `正在下载… ${formatBytes(progress.downloaded)}` : `正在下载… ${percent}%`)
    : phase === 'installing'
      ? '正在安装更新…'
      : phase === 'ready'
        ? '安装完成，正在重启…'
        : '';

  return (
    <aside className="update-notifier" role="status" aria-live="polite" aria-label="启动器更新">
      <div className="update-notifier-head">
        <span className="update-notifier-icon"><ArrowUpCircle size={17} aria-hidden="true" /></span>
        <div className="update-notifier-copy">
          <strong>发现新版本 v{update.version}</strong>
          <span>当前版本 v{update.currentVersion}{update.mandatory ? ' · 必须更新' : ''}</span>
        </div>
        <button type="button" className="icon-button" aria-label="稍后提醒" onClick={onLater}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {status && (
        <div className="update-progress" role="progressbar" aria-label="更新进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
          <span className={percent === null ? 'is-indeterminate' : ''} style={percent === null ? undefined : { width: `${percent}%` }} />
        </div>
      )}
      {status && <span className="update-status">{status}</span>}

      {update.notes && (
        <details className="update-notes">
          <summary>更新日志</summary>
          <p>{update.notes}</p>
        </details>
      )}

      <div className="update-notifier-actions">
        <button type="button" className="button primary small pressable" data-ripple onClick={onUpdate} disabled={busy}>
          <Download size={14} aria-hidden="true" />{busy ? '更新中…' : '立即更新'}
        </button>
        {!busy && (
          <button type="button" className="button secondary small pressable" data-ripple onClick={onLater}>稍后</button>
        )}
        {!busy && !update.mandatory && (
          <button type="button" className="button secondary small pressable" data-ripple onClick={onSkip}>跳过此版本</button>
        )}
      </div>
    </aside>
  );
}
