import { Check, Play, Plus, ScrollText, Search, SearchX, Settings2, Square, Trash2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { formatTime, loaderLabel } from '../lib/launcher';
import { InstanceIcon } from './InstanceIcon';
import type { InstanceInfo } from '../types';

interface InstancesViewProps {
  instances: InstanceInfo[];
  selectedId: string;
  runningIds: Set<string>;
  onSelect: (id: string) => void;
  onLaunch: (id: string) => void;
  onCreate: () => void;
  onRemove: (instance: InstanceInfo) => void;
  onViewLogs: (instanceId: string) => void;
  onOpenSettings: (instanceId: string) => void;
}

export const InstancesView = memo(function InstancesView({ instances, selectedId, runningIds, onSelect, onLaunch, onCreate, onRemove, onViewLogs, onOpenSettings }: InstancesViewProps) {
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<InstanceInfo | null>(null);
  const filtered = useMemo(() => instances.filter((item) => `${item.name} ${item.version} ${item.loader}`.toLowerCase().includes(query.toLowerCase())), [instances, query]);

  return (
    <div className="view instances-view">
      <div className="page-heading">
        <div><h1>实例库</h1><p>管理相互独立的运行环境。</p></div>
        <div className="page-heading-actions">
          <button type="button" className="button primary pressable" data-ripple onClick={() => onCreate()}><Plus size={17} aria-hidden="true" />新建实例</button>
        </div>
      </div>
      <div className="toolbar glass-panel">
        <Search size={18} aria-hidden="true" />
        <input type="search" aria-label="搜索实例" placeholder="搜索名称、版本或加载器" value={query} onChange={(event) => setQuery(event.target.value)} />
        <span>{filtered.length} 个实例</span>
      </div>
      {filtered.length ? (
        <div className="instance-table glass-panel">
          <div className="instance-table-head" aria-hidden="true"><span>实例</span><span>加载器</span><span>最近运行</span><span>操作</span></div>
          {filtered.map((item) => {
            const running = runningIds.has(item.id);
            return (
              <div className={`instance-row ${selectedId === item.id ? 'selected' : ''} ${running ? 'is-running' : ''}`} key={item.id}>
                <button type="button" className="instance-main" onClick={() => onSelect(item.id)} aria-pressed={selectedId === item.id}>
                  <InstanceIcon instance={item} />
                  <span><strong>{item.name}</strong><small>版本 {item.version}{running && <em className="running-tag">正在运行</em>}</small></span>
                  {selectedId === item.id && <span className="selected-badge"><Check size={12} aria-hidden="true" />当前</span>}
                </button>
                <span className="table-cell">{item.loader === 'vanilla' ? '原版' : loaderLabel(item.loader)}</span>
                <span className="table-cell muted">{formatTime(item.lastPlayed)}</span>
                <span className="row-actions">
                  <button type="button" className={`button row-launch ${running ? 'stop' : 'secondary'} pressable`} data-ripple onClick={() => onLaunch(item.id)} aria-label={running ? `停止 ${item.name}` : `启动 ${item.name}`}>
                    {running ? <Square size={13} fill="currentColor" aria-hidden="true" /> : <Play size={15} fill="currentColor" aria-hidden="true" />}{running ? '停止' : '启动'}
                  </button>
                  <button type="button" className="row-icon-button pressable" data-ripple aria-label={`${item.name} 的设置`} title="实例设置" onClick={() => onOpenSettings(item.id)}>
                    <Settings2 size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className="row-icon-button pressable" data-ripple aria-label={`查看 ${item.name} 的日志`} onClick={() => onViewLogs(item.id)}>
                    <ScrollText size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className="row-icon-button danger pressable" data-ripple aria-label={`删除 ${item.name}`} onClick={() => setConfirmDelete(item)}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state glass-panel">
          <SearchX size={30} aria-hidden="true" />
          <h2>没有匹配的实例</h2>
          <p>尝试更换关键词，或清除当前搜索。</p>
          <button type="button" className="button secondary pressable" data-ripple onClick={() => setQuery('')}>清除搜索</button>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setConfirmDelete(null)}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="modal-heading">
              <div>
                <h2 id="confirm-title">删除实例</h2>
                <p>该操作不会删除已下载的游戏文件，但会移除实例配置。</p>
              </div>
            </div>
            <p className="confirm-copy">确定要删除 <strong>{confirmDelete.name}</strong>（{confirmDelete.version}）吗？</p>
            <div className="modal-actions">
              <button type="button" className="button secondary pressable" data-ripple onClick={() => setConfirmDelete(null)}>取消</button>
              <button type="button" className="button danger pressable" data-ripple onClick={() => { onRemove(confirmDelete); setConfirmDelete(null); }}>删除实例</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});