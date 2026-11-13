/** 安装任务状态展示与终态判定（后端 InstallJobStatus 为 snake_case） */

export const JOB_STATUS_LABELS: Record<string, string> = {
  queued: '等待中',
  running: '下载中',
  canceling: '取消中',
  waiting_for_user: '等待用户操作',
  succeeded: '已完成',
  failed: '失败',
  interrupted: '已中断',
  canceled: '已取消',
  // 兼容旧前端值
  in_progress: '下载中',
  cancelled: '已取消',
  finished: '已完成',
};

export function jobStatusLabel(status: string): string {
  return JOB_STATUS_LABELS[status] ?? status;
}

/** 已结束（不再变化）的任务状态 */
export const TERMINAL_JOB_STATUSES = new Set([
  'succeeded',
  'failed',
  'canceled',
  'cancel',
  'interrupted',
  'finished',
  'cancelled',
  'dismissed',
]);

export function isJobActive(status: string): boolean {
  return !TERMINAL_JOB_STATUSES.has(status);
}
