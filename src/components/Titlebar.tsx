import { Bell, Download, Minus, Square, X } from 'lucide-react';
import { controlWindow, type WindowAction } from '../lib/desktop';

interface TitlebarProps {
  onNotify: (title: string, detail?: string) => void;
  onOpenDownloads: () => void;
  runningCount?: number;
  activeJobs?: number;
  backendReady?: boolean;
  backendError?: string;
}

export function Titlebar({ onNotify, onOpenDownloads, runningCount = 0, activeJobs = 0, backendReady = true, backendError = '' }: TitlebarProps) {
  const handleAction = async (action: WindowAction) => {
    try {
      const handled = await controlWindow(action);
      if (!handled) onNotify('窗口控制', '请在 Tauri 桌面窗口中使用此功能。');
    } catch {
      onNotify('暂时无法控制窗口', '请确认窗口权限已启用后重试。');
    }
  };

  const statusText = !backendReady
    ? (backendError ? '后端初始化失败' : '正在初始化启动器核心')
    : activeJobs > 0
      ? `正在下载 · ${activeJobs} 个任务进行中`
      : runningCount > 0
        ? `${runningCount} 个实例正在运行`
        : '所有组件已就绪';

  return (
    /* `deep` = 整条标题栏（含状态文字）任意位置都能拖，不再只认「正好点在 header 上」；
       拖动和双击最大化都由 Tauri 的 drag region 脚本负责，
       这里不能再挂 onMouseDown / onDoubleClick，否则一次按下会发两条 start_dragging，
       第二条会把窗口移动循环打断（只剩左上角能拖就是这么来的）。 */
    <header className="titlebar" data-tauri-drag-region="deep">
      <div className="titlebar-status">
        <span className={`status-dot ${!backendReady ? 'error' : activeJobs > 0 || runningCount > 0 ? 'busy' : ''}`} aria-hidden="true" />
        <span>{statusText}</span>
      </div>
      <div className="titlebar-actions" data-no-drag>
        <button
          type="button"
          className="icon-button pressable"
          data-ripple
          aria-label={activeJobs > 0 ? `下载任务（${activeJobs} 个进行中）` : '下载任务'}
          onClick={onOpenDownloads}
        >
          <Download size={18} aria-hidden="true" />
          {activeJobs > 0 && <span className="icon-badge" aria-hidden="true">{activeJobs > 9 ? '9+' : activeJobs}</span>}
        </button>
        <button
          type="button"
          className="icon-button pressable"
          data-ripple
          aria-label="查看通知"
          onClick={() => onNotify('没有新通知', '你已查看全部消息。')}
        >
          <Bell size={18} aria-hidden="true" />
        </button>
        <div className="window-controls">
          <button type="button" className="window-control" aria-label="最小化" onClick={() => void handleAction('minimize')}>
            <Minus size={17} aria-hidden="true" />
          </button>
          <button type="button" className="window-control" aria-label="最大化或还原" onClick={() => void handleAction('maximize')}>
            <Square size={14} aria-hidden="true" />
          </button>
          <button type="button" className="window-control close" aria-label="关闭" onClick={() => void handleAction('close')}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}