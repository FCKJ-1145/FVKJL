# 发现内容页 任务清单

> 依据 `spec.md` 执行。全部完成后统一 `pnpm build` → `touch src-tauri/build.rs` → `cargo build` → 后台启动 exe 验收。

## 后端（薄插件）

- [x] **B1** 新建 `aster-src/aster-launcher/src-tauri/src/api/resources.rs`
  - DashMap 取消注册表 + `RequestGuard` + `EARLY_CANCELLATIONS`（30s 过期）
  - `service()` 取 `State::get().await?.resources().await?.clone()`
  - 10 个命令：`resource_sources` / `resource_search` / `resource_cancel` / `resource_project_document` / `resource_get_description` / `resource_favorites` / `resource_favorite_add` / `resource_favorite_remove` / `resource_prepare_operation` / `resource_queue_plan`
  - `tauri::plugin::Builder::new("resources")` + `generate_handler!`
- [x] **B2** `src-tauri/src/api/mod.rs` 加 `pub mod resources;`
- [x] **B3** `src-tauri/src/main.rs` 注册 `api::resources::init()`（紧跟 install 插件）
- [x] **B4** `src-tauri/build.rs` InlinedPlugin 命令清单补 10 个命令（与 handler 完全一致）
- [x] **B5** `src-tauri/capabilities/default.json` 补 `resources:default` 权限
- [x] **B6** 核对 `identity.rs` 的 `ResourceRef` serde 形状、`providers/modrinth.rs` 的 filter `field` 名，记录到实现注释
- [x] **B7** `cargo check -p aster-launcher` 通过

## 前端基础

- [x] **F1** `src/types.ts`：`View` 加 `'discover'`；新增 `ResourceType` / `ResourceSearchSort` / `ResourceSearchExpression` / `ResourceSearchQuery` / `ResourceTarget` / `SourceProjectMetadata` / `ResourceSearchResult` / `ResourcePage<T>` / `ResourceSource` / `ResourceSelection` / `ResourceOperationPlan` / `ResourceFavorite` 等类型
- [x] **F2** `src/components/Sidebar.tsx`：navigation 加 `{ id: 'discover', label: '发现内容', icon: Compass }`
- [x] **F3** `src/lib/launcher.ts`：
  - `LauncherBackend` 接口加 8 个方法
  - `desktopBackend` 实现（`invoke('plugin:resources|resource_xxx', {...})`）
  - `mockBackend` 实现（演示模式假数据：~12 条 Modrinth 风格资源、3 个数据源、内存收藏、假安装任务）

## 发现页 UI

- [x] **F4** 新建 `src/components/DiscoverView.tsx`
  - 分类 tabs（整合包/模组/资源包/数据包/地图/光影包/收藏夹）+ 搜索框 + 数据源徽章
  - 工具栏：排序、每页数量、分页（cursor 栈）
  - 卡片列表（封面/标题/徽章/描述/标签/下载数/更新时间/安装按钮/收藏心形）
  - 右侧筛选栏（类别、名称搜索、运行环境、游戏版本、加载器、许可证、开源）
  - 项目详情弹层（描述正文）
  - 加载/空/错误状态；请求取消（切换筛选时 `discoverCancel` 旧 requestId）
- [x] **F5** `src/App.tsx`
  - `view === 'discover'` 分支渲染 `DiscoverView`
  - `handleDiscoverInstall(project, type)`：选实例 → `discoverInstall` → `refreshJobs` → toast
  - 无实例时 toast 提示并 `setView('instances')`
- [x] **F6** `src/styles.css` 新增 `.discover-*` 样式（tabs、toolbar、card、filter rail、detail modal、skeleton），复用玻璃拟态变量

## 验收

- [x] **V1** `tests/launcher.spec.ts` 新增发现页用例并通过 `pnpm test`
- [x] **V2** `pnpm build` 通过
- [x] **V3** `touch src-tauri/build.rs && cargo build` 通过
- [x] **V4** 后台启动 `target/debug/aster-launcher.exe`，人工验收搜索/筛选/收藏/安装链路
