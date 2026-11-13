# 发现内容页（Discover）实现规格

## 1. 目标

在 Aster 启动器左侧栏新增「发现内容」页，布局与 Axolotl Browse 页对齐：分类胶囊 tabs、搜索框 + 数据源标识、排序/每页数量/分页、内容卡片列表（封面、标题、描述、标签、下载量、更新时间、安装按钮）、右侧筛选栏、收藏夹，并打通「搜索 → 选择资源 → 准备安装计划 → 入队下载 → 复用现有下载任务弹窗」的完整链路。

**范围边界**：只做 Modrinth 数据源可覆盖的分类（整合包 / 模组 / 资源包 / 数据包 / 地图 / 光影包 / 收藏夹）。「投影」「服务器」无对应 `ResourceType` 或 provider 支持，本轮不做，tab 不展示。

## 2. 已确认的后端能力（修正此前的错误认知）

此前认为 `content-management` 只有类型契约，实际 `crates/theseus/src/resources/` 已有完整服务实现，可直接复用，**无需新写搜索/安装后端**：

| 能力 | 位置 | 签名 |
| --- | --- | --- |
| 服务获取 | `crates/theseus/src/state/mod.rs:289` | `State::get().await?.resources().await?` → `&Arc<ResourceService>` |
| 数据源 | `resources/service.rs:250` | `fn sources(&self) -> Vec<ResourceSource>` |
| 搜索 | `resources/search.rs:81` | `async fn search(&Arc<Self>, query: ResourceSearchQuery, cursor: Option<String>, request_id: RequestId, cancel: &CancellationToken) -> ResourceResult<ResourcePage<ResourceSearchResult>>` |
| 项目详情 | `resources/catalog.rs:234` | `async fn project_document(&self, project: &SourceProjectRef, locator: Option<String>, cancel) -> ResourceResult<ProjectDocument>` |
| 描述 | `resources/catalog.rs:364` | `async fn description(&self, reference: &ResourceRef, source: &SourceId, locator: Option<String>, cancel) -> ResourceResult<ResourceText>` |
| 收藏 | `resources/favorites.rs:52/56/83` | `list()` / `add(SourceProjectRef, ResourceType, Option<String>)` / `remove(&SourceProjectRef)` |
| 安装计划 | `resources/plans.rs:3384` | `prepare_with_progress(instance_id, intent, selections, install_dependencies, cancel, progress: OperationProgress, resolve_dependencies)` |
| 入队 | `resources/plans.rs:3916` | `queue_with_resource_names(plan_id, revision, HashMap<String,String>)` → `InstallJobSnapshot` |

`src-tauri/Cargo.toml` 已依赖 `dashmap`、`tokio-util`、`theseus`，可直接移植 Axolotl 的 `RequestGuard + CancellationToken` 取消模型。

**结论**：后端只需新增一个薄 Tauri 插件（约 170 行），命令体全部是对上方服务的转发。

## 3. 后端设计

### 3.1 新建 `src-tauri/src/api/resources.rs`

插件名 `resources`，命令清单（与前端 `plugin:resources|<cmd>` 一一对应）：

| 命令 | 参数（camelCase） | 返回 |
| --- | --- | --- |
| `resource_sources` | 无 | `Vec<ResourceSource>` |
| `resource_search` | `query: ResourceSearchQuery`, `cursor: Option<String>`, `requestId: RequestId` | `ResourcePage<ResourceSearchResult>` |
| `resource_cancel` | `requestId: RequestId` | `()` |
| `resource_project_document` | `project: SourceProjectRef`, `locator: Option<String>`, `requestId` | `ProjectDocument` |
| `resource_get_description` | `reference: ResourceRef`, `source: SourceId`, `locator: Option<String>`, `requestId` | `ResourceText` |
| `resource_favorites` | 无 | `Vec<ResourceFavorite>` |
| `resource_favorite_add` | `project: SourceProjectRef`, `contentType: ResourceType`, `locator: Option<String>` | `()` |
| `resource_favorite_remove` | `project: SourceProjectRef` | `()` |
| `resource_prepare_operation` | `instanceId: String`, `intent: ResourceOperationIntent`, `selections: Vec<ResourceSelection>`, `installDependencies: Option<bool>`, `requestId` | `ResourceOperationPlan` |
| `resource_queue_plan` | `planId: PlanId`, `revision: u32`, `resourceNames: Option<HashMap<String,String>>` | `InstallJobSnapshot` |

实现要点：
- `static REQUESTS: LazyLock<DashMap<RequestId, CancellationToken>>` + `EARLY_CANCELLATIONS` 提前取消缓存（30 秒过期）+ `RequestGuard`（Drop 时移除）。
- `fn service() -> Result<Arc<ResourceService>>`，用 `TheseusSerializableError` 的 `Theseus` / `Resource` 变体自动转换。
- `prepare_operation` 不接 `on_progress` channel，直接传 `None` 作为 progress，`resolve_dependencies = true`，`install_dependencies.unwrap_or(true)`。

### 3.2 注册（四件套）

- `src-tauri/src/api/mod.rs`：加 `pub mod resources;`
- `src-tauri/src/main.rs`：在 `.plugin(...)` 链中加 `api::resources::init()`（紧邻 `install` 插件）
- `src-tauri/build.rs`：在 InlinedPlugin 的 commands 列表中加入上述 10 个命令名，保持与 `tauri::generate_handler!` 完全一致
- `src-tauri/capabilities/default.json`：为 main 窗口补 `resources:default`（或按现有显式命令写法逐条列出）

## 4. 前端数据契约（严格按 serde 序列化）

```ts
// ResourceType：serde camelCase → mod | plugin | dataPack | resourcePack | shader | modPack | world
interface ResourceTarget { gameVersions: string[]; loaders: string[]; channels: ReleaseChannel[] } // channels: release|beta|alpha|unknown
interface ResourceSearchQuery {
  filter: ResourceSearchExpression | null;
  text: string;
  types: ResourceType[];
  sources: string[];          // "modrinth"
  target: ResourceTarget;
  categories: string[];
  sort: ResourceSearchSort;   // relevance|downloads|followers|projectPublished|firstPublished|latestPublished|created|projectUpdated
  pageSize: number;           // 1..=100
}
type ResourceSearchExpression =
  | { kind: 'all'; terms: ResourceSearchExpression[] }
  | { kind: 'any'; terms: ResourceSearchExpression[] }
  | { kind: 'predicate'; field: string; values: string[]; excluded: boolean };
interface ResourcePage<T> { requestId: string; entries: T[]; cursor: string | null; hasMore: boolean; total: { value: number | null; precision: 'exact'|'estimate'|'unknown' }; sourceFailures: unknown[]; exhaustedSources: string[] }
interface ResourceSearchResult { entry: ResourceSearchEntry; projects: SourceProjectMetadata[] }
interface SourceProjectMetadata { project: { source: string; projectId: string }; slug: string|null; title: string; summary: string; iconUrl: string|null; types: ResourceType[]; environments: string[]; categories: string[]; gameVersions: string[]; loaders: string[]; authors: string[]; license: string|null; downloads: number|null; followers: number|null; updatedAt: string|null; ... }
```

筛选栏使用 `filter` 表达式：`predicate` 的 `field` 取 Modrinth provider 支持字段（`categories` / `environments` / `game_versions` / `loaders` / `license` / `open_source`），多个 predicate 用 `{kind:'all', terms:[...]}` 组合；实现前在 `crates/theseus/src/resources/providers/modrinth.rs` 与 `search_filters.rs` 中核对字段名，若字段名不符则按实际值调整（以代码为准）。

安装选择对象形状：

```ts
const selection: ResourceSelection = {
  id: randomId(),
  resource: { kind: 'source', project: { source: 'modrinth', projectId } }, // ResourceRef::Source
  release: { kind: 'automatic' },
  resourceType,          // camelCase 枚举
  scope: { kind: 'instance' },
  entryId: null,
};
```

> 注：`ResourceRef` 的序列化形状需在 `crates/content-management/src/resources/identity.rs` 中最终确认（`Resource { id }` / `Source { project }`），前端按确认结果生成。

## 5. 前端文件改动

| 文件 | 改动 |
| --- | --- |
| `src/types.ts` | `View` 增加 `'discover'`；新增第 4 节全部类型 + `DiscoverCategoryId` |
| `src/components/Sidebar.tsx` | navigation 增加 `{ id: 'discover', label: '发现内容', icon: Compass }` |
| `src/lib/launcher.ts` | `LauncherBackend` 新增 `discoverSources / discoverSearch / discoverCancel / discoverProject / discoverDescription / discoverFavorites / discoverFavoriteToggle / discoverInstall`；desktop 与 mock 双实现 |
| `src/components/DiscoverView.tsx`（新建） | 整页 UI：tabs、搜索、排序/分页、卡片、筛选栏、详情弹层、收藏夹 |
| `src/App.tsx` | `view === 'discover'` 分支；`handleDiscoverInstall`（选实例 → prepare → queue → 刷新 jobs + toast）；向 DiscoverView 传 `instances` / `onInstall` / `notify` |
| `src/styles.css` | `.discover-*` 全套玻璃拟态样式（与现有 `glass-panel`/`filter-chip`/`button` 复用） |
| `tests/launcher.spec.ts` | 新增用例：进入发现页 → 搜索演示数据 → 卡片渲染 → 点击安装产生任务 |

### 5.1 DiscoverView 交互规格（对齐 Axolotl）

1. 顶部胶囊分类 tabs + 右侧「翻译」开关（仅 UI，中文查询走 `resolve_chinese_content_search` 后端已有能力，先不做翻译开关逻辑，开关写死关闭并标注「实验」）。
2. 搜索框 + 数据源徽章（来自 `discoverSources()`，显示 `Modrinth`）、防抖 350ms、切换分类/排序/筛选立即重查。
3. 工具栏：排序下拉（Relevance / Downloads / Followers / 最近发布）、每页数量（20 / 40 / 60）、分页（上一页/下一页 + 页码，基于 `cursor` 栈）。
4. 卡片：左方形封面（`iconUrl`，失败降级为渐变占位）、标题 + 来源徽章、灰色 2 行描述、标签行（`environments` + `loaders` + 前 2 个 `categories`）、下载数与更新时间、右侧粉色「+ 安装」按钮（安装中禁用并转圈）。
5. 右侧筛选栏（可折叠）：类别多选、名称内搜索、运行环境（客户端/服务端）、游戏版本（取筛选数据）、加载器、许可证、开源开关。
6. 收藏夹 tab：`discoverFavorites()` 与搜索结果同卡片渲染；卡片右上心形按钮切换收藏。
7. 详情弹层：点击卡片标题打开，展示封面、标题、作者、下载/关注、完整描述（`discoverDescription`）、游戏版本/加载器 chips、安装按钮。
8. 安装：若无实例，提示「请先在实例库创建实例」并跳转实例库；有实例则使用当前选中实例（`selectedId`）直接安装，toast 提示「已加入下载任务」。

## 6. 验证步骤

1. `pnpm build`（前端 TS + Vite）。
2. `touch src-tauri/build.rs` 后 `cargo build`（验证插件注册、ACL、类型编译）。
3. 后台启动 `target/debug/aster-launcher.exe`（保活循环，`dangerouslyDisableSandbox: true`）。
4. `pnpm test` 跑 Playwright 用例（演示模式覆盖发现页）。
5. 人工验收：切分类、搜索、翻页、筛选、收藏、安装 → 下载任务弹窗出现任务并可取消。

## 7. 风险与回退

- **ACL 未生效**：若前端报 `resources.resource_search not allowed`，检查 `build.rs` 命令清单与 `capabilities/default.json`，重新 `cargo build`（ACL 是构建期生成）。
- **数据源不可用**：`sources()` 返回空或 `available=false` 时，页面显示空状态「当前数据源不可用，请检查网络」，不阻塞其他页面。
- **类型形状不符**：若安装时报 `invalid value` / `missing field`，按第 4 节核对 `identity.rs` 与 `operation.rs` 的最终 serde 形状调整前端构造。
