import { FileText, RefreshCw, ScrollText, Terminal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isDesktop } from '../lib/desktop';
import { launcher, type LogFile } from '../lib/launcher';

interface InstanceLogsProps {
  instanceId: string;
  instanceName: string;
  onClose: () => void;
}

const LOG_TYPE_LABELS: Record<string, string> = {
  InfoLog: '游戏日志',
  CrashReport: '崩溃报告',
  JvmCrash: 'JVM 崩溃',
  LauncherLog: '启动器日志',
};

const LOG_TYPE_ORDER: Record<string, number> = {
  LauncherLog: 0,
  InfoLog: 1,
  CrashReport: 2,
  JvmCrash: 3,
};

export function InstanceLogs({ instanceId, instanceName, onClose }: InstanceLogsProps) {
  const [files, setFiles] = useState<LogFile[]>([]);
  const [selected, setSelected] = useState('');
  const [live, setLive] = useState('');
  const [loading, setLoading] = useState(true);
  const outputRef = useRef<HTMLPreElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [fileList, liveBuffer] = await Promise.all([
        launcher.fetchLogFiles(instanceId),
        launcher.fetchLiveLog(instanceId),
      ]);
      const sorted = [...fileList].sort((a, b) =>
        (LOG_TYPE_ORDER[b.log_type] ?? 9) - (LOG_TYPE_ORDER[a.log_type] ?? 9) || b.age - a.age);
      setFiles(sorted);
      setSelected((current) => current || sorted.find((item) => item.filename.includes('latest'))?.filename || sorted[0]?.filename || '');
      setLive(liveBuffer);
    } catch {
      setFiles([]);
      setLive('');
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    void refresh();
    if (!isDesktop()) return;
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const output = useMemo(() => {
    if (selected) {
      const file = files.find((item) => item.filename === selected);
      if (file) return file.output ?? '';
    }
    return live;
  }, [files, selected, live]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [output]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-panel logs-modal" role="dialog" aria-modal="true" aria-labelledby="logs-title">
        <div className="modal-heading">
          <div>
            <h2 id="logs-title">运行日志</h2>
            <p>{instanceName} · 实时输出与历史日志</p>
          </div>
          <div className="logs-heading-actions">
            <button type="button" className="icon-button pressable" data-ripple aria-label="刷新日志" onClick={() => void refresh()}>
              <RefreshCw size={17} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button pressable" data-ripple aria-label="关闭日志" onClick={onClose}>
              <X size={19} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="logs-body">
          <aside className="logs-sidebar" aria-label="日志文件列表">
            <span className="logs-sidebar-title"><Terminal size={13} aria-hidden="true" />实时缓冲</span>
            <button type="button" className={`log-file ${!selected ? 'active' : ''}`} onClick={() => setSelected('')}>
              <FileText size={14} aria-hidden="true" />实时输出
            </button>
            <span className="logs-sidebar-title"><ScrollText size={13} aria-hidden="true" />历史文件</span>
            {files.map((file) => (
              <button type="button" key={file.filename} className={`log-file ${selected === file.filename ? 'active' : ''}`} onClick={() => setSelected(file.filename)}>
                <FileText size={14} aria-hidden="true" />
                <span className="log-filename" title={`${LOG_TYPE_LABELS[file.log_type] ?? file.log_type} · ${file.filename}`}>
                  {file.filename}
                  <em className="log-type-tag">{LOG_TYPE_LABELS[file.log_type] ?? file.log_type}</em>
                </span>
              </button>
            ))}
            {!loading && !files.length && <span className="logs-empty">暂无日志文件</span>}
          </aside>
          <pre ref={outputRef} className="logs-output" aria-label="日志内容">{output || '（暂无输出）'}</pre>
        </div>
      </div>
    </div>
  );
}