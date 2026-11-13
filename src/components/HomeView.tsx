import { memo } from 'react';
import { Check, Clock3, Cpu, Gauge, Layers3, Play, Plus, Settings2, Square } from 'lucide-react';
import { formatTime, installStageLabel, loaderLabel } from '../lib/launcher';
import type { InstanceInfo, LaunchStatus, View } from '../types';
import { LaunchVisual } from './LaunchVisual';
import { Select } from './Select';

interface HomeViewProps {
  instance: InstanceInfo;
  instances: InstanceInfo[];
  status: LaunchStatus;
  progress: number;
  message: string;
  memory: number;
  javaMajor?: number;
  onSelect: (id: string) => void;
  onLaunch: () => void;
  onCreate: () => void;
  onNavigate: (view: View) => void;
}

export const HomeView = memo(function HomeView({ instance, instances, status, progress, message, memory, javaMajor, onSelect, onLaunch, onCreate, onNavigate }: HomeViewProps) {
  const installed = instance.installStage === 'installed';
  return (
    <div className="view home-view">
      <div className="page-heading home-heading">
        <div>
          <h1>欢迎回来</h1>
          <p>选择实例，然后继续。</p>
        </div>
        <button type="button" className="button secondary pressable" data-ripple onClick={() => onCreate()}>
          <Plus size={17} aria-hidden="true" />新建实例
        </button>
      </div>

      <section className="launch-stage glass-panel" data-status={status} aria-labelledby="current-instance-name">
        <div className="launch-copy">
          <Select
            ariaLabel="当前实例"
            className="instance-select"
            leading={<Layers3 size={17} aria-hidden="true" />}
            value={instance.id}
            options={instances.map((item) => ({ value: item.id, label: `${item.name} · ${item.version}` }))}
            onChange={onSelect}
          />
          <h2 id="current-instance-name">{instance.name}</h2>
          <p className="instance-meta">版本 {instance.version}{instance.loader !== 'vanilla' && <><span />{loaderLabel(instance.loader)}</>}</p>
          {installed
            ? <div className="ready-label"><Check size={15} aria-hidden="true" />运行环境检查完成</div>
            : <div className="pending-label">{installStageLabel(instance.installStage)} · 点击启动自动补装</div>}
          <div className="launch-actions">
            <button
              type="button"
              className={`button launch-button pressable ${status === 'running' ? 'stop' : ''}`}
              data-ripple
              disabled={status === 'preparing'}
              onClick={() => onLaunch()}
            >
              {status === 'running' ? <Square size={17} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
              {status === 'idle' ? (installed ? '立即启动' : '安装并启动') : status === 'preparing' ? `正在准备 ${Math.round(progress)}%` : '结束运行'}
            </button>
            <button type="button" className="button icon-only secondary pressable" data-ripple aria-label="启动设置" onClick={() => onNavigate('settings')}>
              <Settings2 size={19} aria-hidden="true" />
            </button>
          </div>
          <div className="launch-progress" aria-live="polite">
            <span>{message}</span>
            <div className="progress-line"><span style={{ transform: `scaleX(${status === 'idle' || status === 'running' ? 1 : Math.min(100, progress) / 100})` }} /></div>
          </div>
        </div>
        <LaunchVisual status={status} progress={progress} memory={memory} javaMajor={javaMajor} />
      </section>

      <div className="home-lower">
        <section className="recent-panel" aria-labelledby="recent-title">
          <div className="section-heading">
            <h2 id="recent-title">最近实例</h2>
            <button type="button" className="text-button" onClick={() => onNavigate('instances')}>查看全部</button>
          </div>
          <div className="recent-list">
            {instances.slice(0, 3).map((item) => (
              <button type="button" className="recent-row pressable" data-ripple key={item.id} onClick={() => onSelect(item.id)}>
                <span className="instance-symbol"><Layers3 size={17} aria-hidden="true" /></span>
                <span className="recent-name"><strong>{item.name}</strong><span>{item.version} · {loaderLabel(item.loader)}</span></span>
                <span className="recent-time"><Clock3 size={13} aria-hidden="true" />{formatTime(item.lastPlayed)}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="runtime-panel glass-panel" aria-labelledby="runtime-title">
          <div className="section-heading"><h2 id="runtime-title">运行环境</h2><span className="subtle-badge">正常</span></div>
          <div className="runtime-row"><span><Cpu size={15} aria-hidden="true" />Java 运行时</span><strong>{javaMajor ? `JDK ${javaMajor}` : '未检测到'}</strong></div>
          <div className="runtime-row"><span><Gauge size={15} aria-hidden="true" />内存分配</span><strong>{memory} GB</strong></div>
          <div className="runtime-row"><span><Check size={15} aria-hidden="true" />资源完整性</span><strong>{installed ? '已验证' : installStageLabel(instance.installStage)}</strong></div>
        </section>
      </div>
    </div>
  );
});