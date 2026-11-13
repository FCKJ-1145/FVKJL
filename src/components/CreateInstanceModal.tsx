import { ChevronLeft, FileArchive, FolderOpen, Layers3, PackagePlus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { launcher, loaderLabel, toErrorMessage } from '../lib/launcher';
import { VERSION_CATEGORIES, VERSION_CATEGORY_LABELS, versionCategory, type VersionCategory } from '../lib/versions';
import type { CreateInstanceRequest, DetectedImport, ImportableInstance, InstallJob, ManifestVersion } from '../types';
import { Modal } from './Modal';
import { Select } from './Select';

interface CreateInstanceModalProps {
  presetVersion?: string | null;
  isDesktop: boolean;
  onClose: () => void;
  onCreate: (request: CreateInstanceRequest) => Promise<void>;
  onJobStarted: (job: InstallJob, title: string) => void;
}

type Step = 'choose' | 'create' | 'import';
type ImportSource = 'file' | 'launcher' | 'minecraft';
type LoaderVersionMode = 'stable' | 'latest' | 'other';

/** 与 theseus ModLoader 的 serde 名称一致 */
const LOADERS = [
  'vanilla',
  'fabric',
  'neoforge',
  'forge',
  'quilt',
  'optifine',
  'cleanroom',
  'lite_loader',
  'legacy_fabric',
  'babric',
] as const;

const LOADER_VERSION_MODES: { key: LoaderVersionMode; label: string }[] = [
  { key: 'stable', label: '稳定版' },
  { key: 'latest', label: '最新版' },
  { key: 'other', label: '其他' },
];

const LAUNCHER_LABELS: Record<string, string> = {
  Axolotl: 'Aster / Axolotl',
  HMCL: 'HMCL',
  PCL2: 'PCL2',
  PCL2CE: 'PCL2 社区版',
  MultiMC: 'MultiMC',
  PrismLauncher: 'Prism Launcher',
  ModrinthApp: 'Modrinth App',
  ATLauncher: 'ATLauncher',
  GDLauncher: 'GDLauncher',
  Curseforge: 'CurseForge',
  Generic: '通用目录',
};

export function CreateInstanceModal({ presetVersion, isDesktop, onClose, onCreate, onJobStarted }: CreateInstanceModalProps) {
  const [step, setStep] = useState<Step>('choose');

  return (
    <Modal title="新建实例" description="选择创建方式：下载全新版本，或导入已有内容。" onClose={onClose}>
      {step === 'choose' && <ChooseStep onPick={setStep} onClose={onClose} />}
      {step === 'create' && (
        <CreateStep
          presetVersion={presetVersion}
          isDesktop={isDesktop}
          onBack={() => setStep('choose')}
          onSubmit={onCreate}
        />
      )}
      {step === 'import' && (
        <ImportStep
          isDesktop={isDesktop}
          onBack={() => setStep('choose')}
          onJobStarted={onJobStarted}
        />
      )}
    </Modal>
  );
}

/** 第一步：选择「全新创建」或「导入已有」 */
function ChooseStep({ onPick, onClose }: { onPick: (step: Step) => void; onClose: () => void }) {
  return (
    <>
      <div className="creation-choice">
        <button type="button" className="choice-card pressable" data-ripple onClick={() => onPick('create')}>
          <span className="icon-tile"><Sparkles size={20} aria-hidden="true" /></span>
          <strong>全新创建</strong>
          <span>选择游戏版本与加载器，下载所需的全部文件。</span>
        </button>
        <button type="button" className="choice-card pressable" data-ripple onClick={() => onPick('import')}>
          <span className="icon-tile"><PackagePlus size={20} aria-hidden="true" /></span>
          <strong>导入已有</strong>
          <span>导入整合包、启动器实例目录，或直接使用 .minecraft 文件夹。</span>
        </button>
      </div>
      <div className="modal-actions">
        <button type="button" className="button secondary pressable" data-ripple onClick={onClose}>取消</button>
      </div>
    </>
  );
}

/** 全新创建：版本分类 + 版本 + 加载器 + 加载器版本（稳定 / 最新 / 自选） */
function CreateStep({ presetVersion, isDesktop, onBack, onSubmit }: {
  presetVersion?: string | null;
  isDesktop: boolean;
  onBack: () => void;
  onSubmit: (request: CreateInstanceRequest) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [versions, setVersions] = useState<ManifestVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(isDesktop);
  const [category, setCategory] = useState<VersionCategory>('all');
  const [gameVersion, setGameVersion] = useState('');
  const [loader, setLoader] = useState<string>('vanilla');
  const [loaderVersions, setLoaderVersions] = useState<{ id: string; stable?: boolean }[]>([]);
  const [loaderVersion, setLoaderVersion] = useState('');
  const [loaderVersionMode, setLoaderVersionMode] = useState<LoaderVersionMode>('stable');
  const [loaderLoading, setLoaderLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 拉取版本清单
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const list = await launcher.fetchGameVersions();
        if (disposed) return;
        const releases = list.filter((item) => item.type === 'release');
        setVersions(list);
        setGameVersion(presetVersion ?? releases[0]?.id ?? list[0]?.id ?? '');
      } catch (loadError) {
        if (!disposed) setError(toErrorMessage(loadError));
      } finally {
        if (!disposed) setVersionsLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, [presetVersion]);

  // 版本分类过滤后同步选中项
  const filteredVersions = useMemo(
    () => versions.filter((item) => category === 'all' || versionCategory(item.id, item.type) === category),
    [versions, category],
  );

  useEffect(() => {
    if (versionsLoading) return;
    if (filteredVersions.some((item) => item.id === gameVersion)) return;
    setGameVersion(filteredVersions[0]?.id ?? '');
  }, [category, filteredVersions, gameVersion, versionsLoading]);

  // 根据「游戏版本 + 加载器」拉取真实可用的加载器版本
  useEffect(() => {
    if (loader === 'vanilla' || !gameVersion) {
      setLoaderVersions([]);
      setLoaderVersion('');
      setLoaderLoading(false);
      return;
    }
    let disposed = false;
    setLoaderLoading(true);
    setLoaderVersions([]);
    setLoaderVersion('');
    setLoaderVersionMode('stable');
    void (async () => {
      try {
        const list = await launcher.fetchLoaderVersions(loader, gameVersion);
        if (disposed) return;
        // 版本号倒序：第一条即最新版，第一条 stable 即推荐稳定版
        const sorted = [...list].sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
        setLoaderVersions(sorted);
        // 没有稳定版时自动切到「最新版」，与 Axolotl 行为一致
        const mode: LoaderVersionMode = sorted.some((item) => item.stable) ? 'stable' : 'latest';
        setLoaderVersionMode(mode);
        setLoaderVersion(pickVersion(sorted, mode));
      } catch {
        if (!disposed) setLoaderVersions([]);
      } finally {
        if (!disposed) setLoaderLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, [loader, gameVersion]);

  const applyVersionMode = (mode: LoaderVersionMode) => {
    setLoaderVersionMode(mode);
    if (mode !== 'other') setLoaderVersion(pickVersion(loaderVersions, mode));
  };

  const hasStable = loaderVersions.some((item) => item.stable);
  const loaderUnsupported = loader !== 'vanilla' && !loaderLoading && loaderVersions.length === 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!gameVersion) {
      setError('请选择游戏版本。');
      return;
    }
    if (loader !== 'vanilla') {
      if (loaderLoading) {
        setError('正在获取加载器版本，请稍候。');
        return;
      }
      if (!loaderVersions.length) {
        setError(`${loaderLabel(loader)} 暂不支持游戏版本 ${gameVersion}，请更换加载器或版本。`);
        return;
      }
      if (!loaderVersion) {
        setError('请选择一个加载器版本。');
        return;
      }
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        gameVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? null : loaderVersion,
      });
    } catch (submitError) {
      setError(toErrorMessage(submitError));
      setSubmitting(false);
    }
  };

  return (
    <form className="instance-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="field">
        <label htmlFor="instance-name">实例名称<span className="field-optional">可选</span></label>
        <input
          id="instance-name"
          value={name}
          onChange={(event) => { setName(event.target.value); setError(''); }}
          placeholder="留空自动命名（我的世界1）"
          maxLength={24}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'instance-name-error' : undefined}
        />
        <span className="field-hint">不填写时会自动命名为「我的世界1」，重名则顺延为我的世界2、3…</span>
      </div>

      <div className="field">
        <label>版本分类</label>
        <div className="chip-row" aria-label="版本分类">
          {VERSION_CATEGORIES.map((item) => (
            <button
              type="button"
              key={item.key}
              className="filter-chip pressable"
              data-ripple
              aria-pressed={category === item.key}
              onClick={() => setCategory(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>游戏版本</label>
        <Select
          ariaLabel="游戏版本"
          className="field-select"
          value={gameVersion}
          disabled={versionsLoading || !filteredVersions.length}
          placeholder={versionsLoading ? '正在获取版本列表…' : '该分类暂无版本'}
          options={filteredVersions.map((item) => ({
            value: item.id,
            label: `${item.id} · ${VERSION_CATEGORY_LABELS[versionCategory(item.id, item.type)]}`,
          }))}
          onChange={setGameVersion}
        />
        <span className="field-hint">
          {versionsLoading ? '正在连接版本源…' : `当前分类 ${filteredVersions.length} 个版本`}
        </span>
      </div>

      <div className="field">
        <label>加载器</label>
        <div className="chip-row" aria-label="加载器">
          {LOADERS.map((item) => (
            <button
              type="button"
              key={item}
              className="filter-chip pressable"
              data-ripple
              aria-pressed={loader === item}
              onClick={() => { setLoader(item); setError(''); }}
            >
              {item === 'vanilla' ? 'None' : loaderLabel(item)}
            </button>
          ))}
        </div>
      </div>

      {loader !== 'vanilla' && (
        <div className="field loader-version-field">
          <label>加载器版本</label>
          {loaderLoading && <span className="field-hint">正在获取版本列表…</span>}
          {!loaderLoading && loaderUnsupported && (
            <span className="field-hint error" role="alert">
              {loaderLabel(loader)} 不支持游戏版本 {gameVersion}，请更换加载器或版本。
            </span>
          )}
          {!loaderLoading && !loaderUnsupported && (
            <>
              <div className="chip-row" aria-label="加载器版本类型">
                {LOADER_VERSION_MODES.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className="filter-chip pressable"
                    data-ripple
                    aria-pressed={loaderVersionMode === item.key}
                    disabled={item.key === 'stable' && !hasStable}
                    onClick={() => applyVersionMode(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {loaderVersionMode === 'other' ? (
                <Select
                  ariaLabel="加载器版本"
                  className="field-select"
                  value={loaderVersion}
                  options={loaderVersions.map((item) => ({
                    value: item.id,
                    label: `${item.id}${item.stable ? ' (stable)' : ''}`,
                  }))}
                  onChange={setLoaderVersion}
                />
              ) : (
                <span className="field-hint">
                  将会安装：{loaderLabel(loader)} {loaderVersion}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {error && <p className="import-hint error" role="alert">{error}</p>}

      <div className="modal-actions">
        <button type="button" className="step-back pressable" data-ripple onClick={onBack}>
          <ChevronLeft size={16} aria-hidden="true" />返回
        </button>
        <button type="submit" className="button primary pressable" data-ripple disabled={submitting || versionsLoading || loaderLoading}>
          {submitting ? '正在创建…' : '创建实例'}
        </button>
      </div>
    </form>
  );
}

function pickVersion(
  list: { id: string; stable?: boolean }[],
  mode: LoaderVersionMode,
): string {
  if (!list.length) return '';
  if (mode === 'stable') return (list.find((item) => item.stable) ?? list[0]).id;
  return list[0].id;
}

/** 导入已有：整合包文件 / 启动器目录 / .minecraft 文件夹 */
function ImportStep({ isDesktop, onBack, onJobStarted }: {
  isDesktop: boolean;
  onBack: () => void;
  onJobStarted: (job: InstallJob, title: string) => void;
}) {
  const [source, setSource] = useState<ImportSource | null>(null);
  const [basePath, setBasePath] = useState('');
  const [detected, setDetected] = useState<DetectedImport | null>(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const resetScan = () => {
    setDetected(null);
    setSelectedPath('');
    setBasePath('');
    setError('');
  };

  const startModpack = useCallback(async (path: string) => {
    setImporting(true);
    setError('');
    try {
      const job = await launcher.importModpack(path);
      const filename = path.split(/[\\/]/).pop() ?? '整合包';
      onJobStarted(job, `导入整合包 ${filename}`);
    } catch (importError) {
      setError(toErrorMessage(importError));
    } finally {
      setImporting(false);
    }
  }, [onJobStarted]);

  const pickFile = async () => {
    resetScan();
    setSource('file');
    if (!isDesktop) {
      await startModpack('C:\\整合包\\演示整合包.mrpack');
      return;
    }
    const selected = await openDialog({ multiple: false, directory: false, filters: [{ name: '整合包', extensions: ['mrpack', 'zip'] }] });
    if (typeof selected !== 'string') return;
    await startModpack(selected);
  };

  const pickFolder = async (kind: 'launcher' | 'minecraft') => {
    resetScan();
    setSource(kind);
    let path = '';
    if (isDesktop) {
      const selected = await openDialog({ multiple: false, directory: true });
      if (typeof selected !== 'string') return;
      path = selected;
    } else {
      path = 'C:\\Games';
    }
    setBasePath(path);
    setDetecting(true);
    try {
      const result = await launcher.detectImportableInstances(path);
      setDetected(result);
      setSelectedPath(result.instances[0]?.path ?? '');
    } catch (scanError) {
      setError(toErrorMessage(scanError));
    } finally {
      setDetecting(false);
    }
  };

  const startInstance = async () => {
    if (!detected || !selectedPath) {
      setError('请先选择一个要导入的实例。');
      return;
    }
    const instance = detected.instances.find((item) => item.path === selectedPath);
    if (!instance) return;
    setImporting(true);
    setError('');
    try {
      // 与 Axolotl 的字段语义保持一致：
      // 兼容模式实例：basePath = 实例目录，instancePath = 版本目录
      // 普通实例：basePath = 扫描根目录，instancePath = 实例目录
      const request = instance.compatibleMode
        ? {
            launcherType: detected.launcherType,
            basePath: instance.path,
            instanceFolder: instance.name,
            instancePath: instance.versionPath ?? instance.path,
          }
        : {
            launcherType: detected.launcherType,
            basePath,
            instanceFolder: instance.name,
            instancePath: instance.path,
          };
      const job = await launcher.importInstance(request);
      onJobStarted(job, `导入实例 ${instance.name}`);
    } catch (importError) {
      setError(toErrorMessage(importError));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="import-choice">
        <button type="button" className="choice-card pressable" data-ripple data-selected={source === 'file'} onClick={() => void pickFile()} disabled={importing}>
          <span className="icon-tile"><FileArchive size={20} aria-hidden="true" /></span>
          <strong>整合包文件</strong>
          <span>选择 .mrpack 或 .zip 整合包，自动创建对应实例。</span>
        </button>
        <button type="button" className="choice-card pressable" data-ripple data-selected={source === 'launcher'} onClick={() => void pickFolder('launcher')} disabled={importing || detecting}>
          <span className="icon-tile"><FolderOpen size={20} aria-hidden="true" /></span>
          <strong>启动器目录</strong>
          <span>选择 PCL2 / HMCL / MultiMC / Prism 等启动器目录，自动识别实例。</span>
        </button>
        <button type="button" className="choice-card pressable" data-ripple data-selected={source === 'minecraft'} onClick={() => void pickFolder('minecraft')} disabled={importing || detecting}>
          <span className="icon-tile"><Layers3 size={20} aria-hidden="true" /></span>
          <strong>.minecraft 文件夹</strong>
          <span>直接选择一个 .minecraft 目录，导入其中的版本与资源。</span>
        </button>
      </div>

      {detecting && (
        <p className="import-hint"><span className="loader-ring small" aria-hidden="true" />正在扫描目录，较大的启动器目录可能需要几秒…</p>
      )}

      {detected && (
        <div className="import-list glass-panel">
          <div className="import-list-head">
            <strong>检测到 {LAUNCHER_LABELS[detected.launcherType] ?? detected.launcherType}</strong>
            <span>{detected.instances.length} 个实例</span>
          </div>
          {detected.instances.map((item: ImportableInstance) => (
            <button
              type="button"
              key={item.path}
              className="import-row pressable"
              data-ripple
              aria-pressed={selectedPath === item.path}
              onClick={() => { setSelectedPath(item.path); setError(''); }}
            >
              <span className="import-row-main">
                <strong>{item.name}</strong>
                <small>{item.path}</small>
              </span>
              {item.compatibleMode && <span className="tag">兼容模式</span>}
            </button>
          ))}
        </div>
      )}

      {error && <p className="import-hint error" role="alert">{error}</p>}
      {!detected && !error && !detecting && (
        <p className="import-hint">提示：也可以把整合包文件或文件夹直接拖到窗口上。</p>
      )}

      <div className="modal-actions">
        <button type="button" className="step-back pressable" data-ripple onClick={onBack} disabled={importing}>
          <ChevronLeft size={16} aria-hidden="true" />返回
        </button>
        {detected && (
          <button type="button" className="button primary pressable" data-ripple onClick={() => void startInstance()} disabled={importing || !selectedPath}>
            {importing ? '正在导入…' : '导入实例'}
          </button>
        )}
      </div>
    </>
  );
}

type OpenOptions = {
  multiple?: boolean;
  directory?: boolean;
  filters?: { name: string; extensions: string[] }[];
};

/** Tauri 文件对话框；仅在桌面端调用（直接走 dialog 插件命令，避免额外 JS 依赖） */
async function openDialog(options: OpenOptions): Promise<string | string[] | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke('plugin:dialog|open', { options })) as string | string[] | null;
}
