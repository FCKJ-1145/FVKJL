import { Download, HardDriveDownload, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect } from 'react';
import { formatBytes, formatTime } from '../lib/launcher';
import { isJobActive, jobStatusLabel } from '../lib/jobs';
import type { InstallJob } from '../types';
import { Modal } from './Modal';

interface DownloadTasksModalProps {
  jobs: InstallJob[];
  progress: number;
  loadingMessage: string;
  onClose: () => void;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  onRefresh: () => void;
}

export function DownloadTasksModal({ jobs, progress, loadingMessage, onClose, onCancel, onRetry, onResume, onDismiss, onRefresh }: DownloadTasksModalProps) {
  // 打开时拉一次最新队列（install_job 事件仍会实时刷新）
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const activeCount = jobs.filter((job) => isJobActive(job.status)).length;
  // 只有确实在跑的任务才显示顶部总进度，避免空队列时留一条空条
  const showCurrent = activeCount > 0 && progress > 0 && progress < 100;

  return (
    <Modal
      className="downloads-modal"
      title="下载任务"
      description={`安装与下载队列 · 共 ${jobs.length} 个任务，${activeCount} 个进行中`}
      onClose={onClose}
    >
      {showCurrent && (
        <div className="queue-current">
          <span className="loader-ring small" aria-hidden="true" />
          <div className="queue-current-copy">
            <strong>正在下载 · {Math.round(progress)}%</strong>
            <span>{loadingMessage}</span>
          </div>
          <div className="progress-line wide"><span style={{ transform: `scaleX(${Math.min(100, progress) / 100})` }} /></div>
        </div>
      )}

      <div className="queue-body">
        {jobs.length ? (
          <div className="queue-list">
            {jobs.map((job) => {
              const percent = job.progress && job.progress.total > 0
                ? Math.round((job.progress.current / job.progress.total) * 100)
                : null;
              const active = isJobActive(job.status);
              const failed = job.status === 'failed';
              const hasSummary = (job.summary?.downloaded ?? 0) > 0 || (job.summary?.total ?? 0) > 0;
              return (
                <div className="queue-row" key={job.jobId} data-status={job.status}>
                  <span className="queue-icon"><HardDriveDownload size={19} aria-hidden="true" /></span>
                  <div className="queue-name">
                    <strong title={job.display?.title ?? undefined}>{job.display?.title ?? `下载任务 ${job.jobId.slice(0, 8)}`}</strong>
                    <span>
                      <em className="queue-tag" data-status={job.status}>{jobStatusLabel(job.status)}</em>
                      {percent !== null && <> · {percent}%</>}
                      {hasSummary && <> · 完成 {job.summary?.downloaded ?? 0}/{job.summary?.total ?? 0}</>}
                    </span>
                    {job.error && <em className="queue-error">{job.error.message}</em>}
                    {active && <div className="progress-line"><span style={{ transform: `scaleX(${percent === null ? 0 : percent / 100})` }} /></div>}
                  </div>
                  <span className="queue-size">
                    {job.progress?.total ? `${formatBytes(job.progress.current)} / ${formatBytes(job.progress.total)}` : ''}
                  </span>
                  <span className="queue-time">{formatTime(job.created)}</span>
                  <span className="row-actions">
                    {active && <button type="button" className="row-icon-button pressable" data-ripple aria-label="取消任务" onClick={() => onCancel(job.jobId)}><X size={15} aria-hidden="true" /></button>}
                    {job.status === 'waiting_for_user' && <button type="button" className="row-icon-button pressable" data-ripple aria-label="继续任务" onClick={() => onResume(job.jobId)}><Download size={15} aria-hidden="true" /></button>}
                    {failed && <button type="button" className="row-icon-button pressable" data-ripple aria-label="重试任务" onClick={() => onRetry(job.jobId)}><RotateCcw size={15} aria-hidden="true" /></button>}
                    {!active && <button type="button" className="row-icon-button danger pressable" data-ripple aria-label="清除记录" onClick={() => onDismiss(job.jobId)}><Trash2 size={15} aria-hidden="true" /></button>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state queue-empty">
            <span className="queue-empty-icon"><HardDriveDownload size={26} aria-hidden="true" /></span>
            <h2>下载队列为空</h2>
            <p>在「发现」里安装内容，或创建实例后，下载任务会出现在这里。</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
