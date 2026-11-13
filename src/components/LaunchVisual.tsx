import { Activity, Check, LoaderCircle, Play } from 'lucide-react';
import type { LaunchStatus } from '../types';

interface LaunchVisualProps {
  status: LaunchStatus;
  progress: number;
  memory: number;
  javaMajor?: number;
}

const circumference = 2 * Math.PI * 88;

export function LaunchVisual({ status, progress, memory, javaMajor }: LaunchVisualProps) {
  const Icon = status === 'idle' ? Play : status === 'preparing' ? LoaderCircle : Activity;
  const javaLabel = javaMajor ? `JDK ${javaMajor}` : 'Java 未检测';

  return (
    <div className="launch-visual" data-status={status} aria-hidden="true">
      <div className="orbit orbit-outer"><span /></div>
      <div className="orbit orbit-middle"><span /></div>
      <div className="orbit-glow" />
      <svg className="progress-orbit" viewBox="0 0 200 200">
        <circle className="progress-track" cx="100" cy="100" r="88" />
        <circle
          className="progress-value"
          cx="100"
          cy="100"
          r="88"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (status === 'running' ? 100 : progress) / 100)}
        />
      </svg>
      <div className="orbit-core">
        <Icon className={status === 'preparing' ? 'spin' : ''} size={30} strokeWidth={1.6} />
        <span>{status === 'idle' ? '就绪' : status === 'preparing' ? `${Math.round(progress)}%` : '运行中'}</span>
      </div>
      <div className="orbit-badge badge-java"><Check size={13} />{javaLabel}</div>
      <div className="orbit-badge badge-memory">{memory} GB<span>内存</span></div>
    </div>
  );
}