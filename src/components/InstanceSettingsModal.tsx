import { Check, FolderOpen, HardDrive, ImagePlus, Layers3, Loader2, MemoryStick, Package, Plus, Settings2, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatBytes, launcher, loaderLabel } from '../lib/launcher';
import {
  addModFromPath,
  fetchInstanceIcon,
  getGameDirInfo,
  listInstanceMods,
  openInstanceDir,
  pickImageFile,
  pickModFiles,
  removeMod,
  setInstanceIcon,
  setInstanceIsolated,
  setModEnabled,
  type GameDirInfo,
  type InstanceDirKind,
  type InstanceMod,
} from '../lib/instanceSettings';
import type { InstanceInfo, JavaVersion } from '../types';
import { invalidateInstanceIcon } from './InstanceIcon';
import { Select } from './Select';
import { Modal } from './Modal';
import { Toggle } from './Toggle';

interface InstanceSettingsModalProps {
  instance: InstanceInfo;
  javaVersions: JavaVersion[];
  maxMemory: number;
  isDesktop: boolean;
  onClose: () => void;
  /** 名称 / 内存 / Java 改动落盘后刷新实例列表 */
  onSaved: () => void | Promise<void>;
  notify: (title: string, detail?: string, tone?: 'success' | 'error') => void;
}

const DIR_ACTIONS: { kind: InstanceDirKind; label: string; hint: string }[] = [
  { kind: 'version', label: '版本文件夹', hint: '实例根目录（mods / config / logs 都在这里）' },
  { kind: 'saves', label: '存档文件夹', hint: 'saves/，单人世界存档' },
  { kind: 'mods', label: 'Mod 文件夹', hint: 'mods/，游戏实际加载的 jar' },
];

export function InstanceSettingsModal({ instance, javaVersions, maxMemory, isDesktop, onClose, onSaved, notify }: InstanceSettingsModalProps) {
  const [name, setName] = useState(instance.name);
  const [javaPath, setJavaPath] = useState(instance.javaPath ?? '');
  const [memoryGb, setMemoryGb] = useState(() => Math.max(2, Math.round((instance.memory?.maximum ?? 4096) / 1024)));
  const [autoMemory, setAutoMemory] = useState(instance.memory?.automatic ?? false);
  const [isolated, setIsolated] = useState(true);
  const [dirInfo, setDirInfo] = useState<GameDirInfo | null>(null);
  const [saving, setSaving] = useState(false);

  const [iconSrc, setIconSrc] = useState<string | null>(null);
  const [iconBusy, setIconBusy] = useState(false);

  const [mods, setMods] = useState<InstanceMod[]>([]);
  const [modsLoading, setModsLoading] = useState(true);
  const [modBusy, setModBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [addingMod, setAddingMod] = useState(false);

  /** 分页：常规（图标/名称/隔离/目录） / 启动（Java/内存） / MOD 管理 */
  const [tab, setTab] = useState<'general' | 'launch' | 'mods'>('general');

  /** 由整合包自带（托管）的 MOD 数量，用于给出说明 */
  const packManagedCount = useMemo(() => mods.filter((mod) => mod.packManaged).length, [mods]);

  const memoryCeiling = useMemo(() => {
    const available = maxMemory > 0 ? Math.floor(maxMemory / 1024 ** 3) : 16;
    return Math.min(64, Math.max(8, available));
  }, [maxMemory]);

  const loadIcon = useCallback(async () => {
    if (!isDesktop) return;
    try {
      setIconSrc(await fetchInstanceIcon(instance.id, 192));
    } catch {
      // 没有图标或读取失败都退回默认图标
      setIconSrc(null);
    }
  }, [instance.id, isDesktop]);

  const handlePickIcon = async () => {
    try {
      const path = await pickImageFile();
      if (!path) return;
      setIconBusy(true);
      await setInstanceIcon(instance.id, path);
      invalidateInstanceIcon(instance.id);
      await loadIcon();
      await onSaved();
      notify('实例图标已更新', undefined, 'success');
    } catch (error) {
      notify('更换图标失败', errorText(error), 'error');
    } finally {
      setIconBusy(false);
    }
  };

  const handleClearIcon = async () => {
    setIconBusy(true);
    try {
      await setInstanceIcon(instance.id, null);
      invalidateInstanceIcon(instance.id);
      await loadIcon();
      await onSaved();
      notify('已恢复默认图标', undefined, 'success');
    } catch (error) {
      notify('移除图标失败', errorText(error), 'error');
    } finally {
      setIconBusy(false);
    }
  };

  const loadMods = useCallback(async () => {
    if (!isDesktop) {
      setModsLoading(false);
      return;
    }
    setModsLoading(true);
    try {
      setMods(await listInstanceMods(instance.id));
    } catch (error) {
      notify('读取 MOD 列表失败', errorText(error), 'error');
    } finally {
      setModsLoading(false);
    }
  }, [instance.id, isDesktop, notify]);

  useEffect(() => {
    if (!isDesktop) return;
    let disposed = false;
    void getGameDirInfo(instance.id)
      .then((info) => {
        if (disposed) return;
        setDirInfo(info);
        setIsolated(info.isolated);
      })
      .catch((error) => notify('读取实例目录失败', errorText(error), 'error'));
    return () => {
      disposed = true;
    };
  }, [instance.id, isDesktop, notify]);

  useEffect(() => {
    void loadMods();
  }, [loadMods]);

  useEffect(() => {
    void loadIcon();
  }, [loadIcon]);

  const dirty = name.trim() !== instance.name
    || javaPath !== (instance.javaPath ?? '')
    || memoryGb !== Math.max(2, Math.round((instance.memory?.maximum ?? 4096) / 1024))
    || autoMemory !== (instance.memory?.automatic ?? false)
    || (dirInfo ? isolated !== dirInfo.isolated : false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      notify('名称不能为空', '请先填写实例名称再保存。', 'error');
      return;
    }
    setSaving(true);
    try {
      const patch: { name?: string; memory?: { maximum: number; automatic: boolean; optimize_before_launch: boolean }; javaPath?: string | null } = {};
      if (trimmed !== instance.name) patch.name = trimmed;
      if (javaPath !== (instance.javaPath ?? '')) patch.javaPath = javaPath || null;
      const previousMemory = Math.max(2, Math.round((instance.memory?.maximum ?? 4096) / 1024));
      if (memoryGb !== previousMemory || autoMemory !== (instance.memory?.automatic ?? false)) {
        patch.memory = { maximum: memoryGb * 1024, automatic: autoMemory, optimize_before_launch: true };
      }
      if (Object.keys(patch).length) await launcher.editInstance(instance.id, patch);
      if (dirInfo && isolated !== dirInfo.isolated) {
        setDirInfo(await setInstanceIsolated(instance.id, isolated));
      }
      await onSaved();
      notify('实例设置已保存', trimmed, 'success');
    } catch (error) {
      notify('保存失败', errorText(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDir = async (kind: InstanceDirKind, label: string) => {
    try {
      const path = await openInstanceDir(instance.id, kind);
      // 给出明确反馈：资源管理器可能开在启动器窗口后面
      notify(`已打开${label}`, path, 'success');
    } catch (error) {
      notify(`打开${label}失败`, errorText(error), 'error');
    }
  };

  const handleToggleMod = async (mod: InstanceMod) => {
    setModBusy(mod.id);
    try {
      await setModEnabled(instance.id, mod.id, !mod.enabled);
      setMods((current) => current.map((item) => (item.id === mod.id ? { ...item, enabled: !item.enabled } : item)));
    } catch (error) {
      notify('切换 MOD 状态失败', errorText(error), 'error');
    } finally {
      setModBusy(null);
    }
  };

  const handleRemoveMod = async (mod: InstanceMod) => {
    setModBusy(mod.id);
    try {
      await removeMod(instance.id, mod.id);
      setMods((current) => current.filter((item) => item.id !== mod.id));
      setConfirmRemove(null);
      notify('已删除 MOD', mod.title, 'success');
    } catch (error) {
      notify('删除 MOD 失败', errorText(error), 'error');
    } finally {
      setModBusy(null);
    }
  };

  const handleAddMod = async () => {
    try {
      const files = await pickModFiles();
      if (!files.length) return;
      setAddingMod(true);
      let added = 0;
      for (const file of files) {
        try {
          await addModFromPath(instance.id, file);
          added += 1;
        } catch (error) {
          notify('添加失败', `${file}\n${errorText(error)}`, 'error');
        }
      }
      if (added) {
        await loadMods();
        notify('已添加 MOD', `成功导入 ${added} 个文件`, 'success');
      }
    } catch (error) {
      notify('打开文件选择器失败', errorText(error), 'error');
    } finally {
      setAddingMod(false);
    }
  };

  return (
    <Modal
      className="instance-settings-modal"
      title="实例设置"
      description={`${instance.version} · ${instance.loader === 'vanilla' ? '原版' : loaderLabel(instance.loader)}`}
      onClose={onClose}
    >
      <div className="instance-settings-tabs" role="tablist" aria-label="实例设置分区">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'general'}
          className={`instance-settings-tab pressable ${tab === 'general' ? 'active' : ''}`}
          data-ripple
          onClick={() => setTab('general')}
        >
          <Settings2 size={15} aria-hidden="true" />常规
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'launch'}
          className={`instance-settings-tab pressable ${tab === 'launch' ? 'active' : ''}`}
          data-ripple
          onClick={() => setTab('launch')}
        >
          <MemoryStick size={15} aria-hidden="true" />启动
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mods'}
          className={`instance-settings-tab pressable ${tab === 'mods' ? 'active' : ''}`}
          data-ripple
          onClick={() => setTab('mods')}
        >
          <Package size={15} aria-hidden="true" />MOD
          <em className="section-count">{modsLoading ? '…' : mods.length}</em>
        </button>
      </div>

      <div className="instance-settings-scroll">
        {tab === 'general' && (
          <>
        <section className="settings-block" aria-label="常规">
          <div className="instance-identity">
            <span className="instance-avatar">
              {iconSrc ? <img src={iconSrc} alt="" /> : <Layers3 size={26} aria-hidden="true" />}
            </span>
            <div className="instance-identity-copy">
              <strong>实例图标</strong>
              <span>建议 1:1 正方形图片，最大 256×256；从发现页安装的整合包会自动套用封面</span>
              <div className="instance-identity-actions">
                <button type="button" className="button secondary small pressable" data-ripple disabled={!isDesktop || iconBusy} onClick={() => void handlePickIcon()}>
                  {iconBusy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <ImagePlus size={14} aria-hidden="true" />}更换图标
                </button>
                {iconSrc && (
                  <button type="button" className="button secondary small pressable" data-ripple disabled={iconBusy} onClick={() => void handleClearIcon()}>恢复默认</button>
                )}
              </div>
            </div>
          </div>
          <label className="field settings-field">
            <span>实例名称</span>
            <input value={name} maxLength={48} onChange={(event) => setName(event.target.value)} placeholder="给这个实例起个名字" />
          </label>

          <div className="setting-row">
            <div>
              <strong>版本隔离</strong>
              <span>开启后该实例使用独立的 mods / 存档 / 配置；关闭后与其它未隔离实例共用一个 minecraft 目录</span>
            </div>
            <Toggle label="版本隔离" checked={isolated} onChange={setIsolated} />
          </div>
          {dirInfo && (
            <p className="path-hint" title={isolated ? dirInfo.profileDir : dirInfo.sharedDir}>
              <FolderOpen size={13} aria-hidden="true" />
              {isolated ? dirInfo.profileDir : `${dirInfo.sharedDir}（共用）`}
            </p>
          )}
        </section>

        <section className="settings-block" aria-labelledby="settings-dirs">
          <h3 id="settings-dirs"><FolderOpen size={15} aria-hidden="true" />目录</h3>
          <div className="dir-actions">
            {DIR_ACTIONS.map((action) => (
              <button
                key={action.kind}
                type="button"
                className="dir-button pressable"
                data-ripple
                disabled={!isDesktop}
                title={action.hint}
                onClick={() => void handleOpenDir(action.kind, action.label)}
              >
                <FolderOpen size={16} aria-hidden="true" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </section>
          </>
        )}

        {tab === 'launch' && (
          <section className="settings-block" aria-label="启动">
            <div className="setting-row">
              <div><strong>Java 运行时</strong><span>为这个实例指定 Java，默认跟随启动器自动选择</span></div>
              <Select
                ariaLabel="Java 运行时"
                value={javaPath}
                options={[
                  { value: '', label: '自动选择（推荐）' },
                  ...javaVersions.map((item) => ({
                    value: item.path,
                    label: `Java ${item.parsed_version} · ${item.architecture}${item.distribution ? ` · ${item.distribution}` : ''}`,
                  })),
                ]}
                onChange={setJavaPath}
              />
            </div>

            <div className="setting-row memory-setting">
              <div><strong>内存分配</strong><span>{autoMemory ? '由启动器按可用内存自动分配' : `固定分配 ${memoryGb} GB`}</span></div>
              <output htmlFor="instance-memory-range">{autoMemory ? '自动' : `${memoryGb} GB`}</output>
            </div>
            <input
              id="instance-memory-range"
              className="memory-range"
              type="range"
              min={2}
              max={memoryCeiling}
              step={1}
              value={memoryGb}
              disabled={autoMemory}
              onChange={(event) => setMemoryGb(Number(event.target.value))}
              aria-label="内存分配"
            />
            <div className="range-labels"><span>2 GB</span><span>{memoryCeiling} GB</span></div>
            <div className="setting-row">
              <div><strong>自动分配内存</strong><span>关闭后才会使用上面的固定值</span></div>
              <Toggle label="自动分配内存" checked={autoMemory} onChange={setAutoMemory} />
            </div>
          </section>
        )}

        {tab === 'mods' && (
        <section className="settings-block" aria-label="MOD 管理">
          <div className="mods-toolbar">
            {!modsLoading && packManagedCount > 0 && (
              <p className="path-hint">
                <Package size={13} aria-hidden="true" />
                其中 {packManagedCount} 个为整合包内置，会随整合包一起更新维护
              </p>
            )}
            <button type="button" className="button secondary small pressable" data-ripple disabled={!isDesktop || addingMod} onClick={() => void handleAddMod()}>
              {addingMod ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}添加 MOD
            </button>
          </div>

          {modsLoading ? (
            <div className="mod-empty"><Loader2 size={16} className="spin" aria-hidden="true" />正在读取 MOD 列表…</div>
          ) : mods.length ? (
            <div className="mod-list">
              {mods.map((mod) => (
                <div className="mod-row" key={mod.id} data-disabled={!mod.enabled}>
                  <span className="mod-mark" aria-hidden="true">{mod.iconUrl ? <img src={mod.iconUrl} alt="" loading="lazy" /> : <Package size={15} />}</span>
                  <div className="mod-name">
                    <strong title={mod.fileName}>{mod.title}</strong>
                    <span>
                      {mod.versionNumber ? `v${mod.versionNumber} · ` : ''}
                      {formatBytes(mod.size)}
                      {mod.packManaged ? ' · 整合包内置' : ''}
                      {mod.external ? ' · 本地文件' : ''}
                      {!mod.enabled ? ' · 已禁用' : ''}
                    </span>
                  </div>
                  <span className="mod-actions">
                    <span className="mod-switch">
                      <Toggle
                        label={`${mod.enabled ? '禁用' : '启用'} ${mod.title}`}
                        checked={mod.enabled}
                        onChange={() => {
                          if (modBusy !== mod.id) void handleToggleMod(mod);
                        }}
                      />
                    </span>
                    {confirmRemove === mod.id ? (
                      <>
                        <button type="button" className="row-icon-button danger pressable" data-ripple aria-label={`确认删除 ${mod.title}`} onClick={() => void handleRemoveMod(mod)}><Check size={14} aria-hidden="true" /></button>
                        <button type="button" className="row-icon-button pressable" data-ripple aria-label="取消删除" onClick={() => setConfirmRemove(null)}><X size={14} aria-hidden="true" /></button>
                      </>
                    ) : (
                      <button type="button" className="row-icon-button danger pressable" data-ripple aria-label={`删除 ${mod.title}`} onClick={() => setConfirmRemove(mod.id)}><Trash2 size={14} aria-hidden="true" /></button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mod-empty">
              <HardDrive size={16} aria-hidden="true" />
              这个实例还没有 MOD，点「添加 MOD」导入 .jar 文件。
            </div>
          )}
        </section>
        )}
      </div>

      <div className="modal-actions">
        <span className="save-state">{dirty ? '有未保存的改动' : '所有改动已保存'}</span>
        <button type="button" className="button secondary pressable" data-ripple onClick={onClose}>关闭</button>
        <button type="button" className="button primary pressable" data-ripple disabled={saving || !dirty} onClick={() => void handleSave()}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </Modal>
  );
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '请稍后重试。';
}
