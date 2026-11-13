use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use dashmap::DashMap;
use theseus::resources::{
    favorites::{self, ResourceFavorite},
    ipc::{ResourcePage, ResourceSearchQuery, ResourceSearchResult, ResourceTarget},
    plans,
    providers::ProjectDocument,
    *,
};
use tokio_util::sync::CancellationToken;

use crate::api::Result;

/// 进行中的请求取消令牌。requestId 由前端生成，同名请求不允许并发。
static REQUESTS: LazyLock<DashMap<RequestId, CancellationToken>> =
    LazyLock::new(DashMap::new);
/// 请求注册前就已取消的 ID，短期保留以覆盖「先取消后发起」的竞态。
static EARLY_CANCELLATIONS: LazyLock<DashMap<RequestId, std::time::Instant>> =
    LazyLock::new(DashMap::new);

struct RequestGuard(RequestId);
impl Drop for RequestGuard {
    fn drop(&mut self) {
        REQUESTS.remove(&self.0);
    }
}

fn request(id: &RequestId) -> Result<(RequestGuard, CancellationToken)> {
    let token = CancellationToken::new();
    match REQUESTS.entry(id.clone()) {
        dashmap::mapref::entry::Entry::Occupied(_) => Err(
            ResourceError::InvalidRequest("request ID already active".into())
                .into(),
        ),
        dashmap::mapref::entry::Entry::Vacant(entry) => {
            entry.insert(token.clone());
            if EARLY_CANCELLATIONS.remove(id).is_some_and(|(_, time)| {
                time.elapsed() < std::time::Duration::from_secs(30)
            }) {
                token.cancel();
            }
            Ok((RequestGuard(id.clone()), token))
        }
    }
}

async fn service() -> Result<Arc<ResourceService>> {
    Ok(theseus::State::get().await?.resources().await?.clone())
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    // 插件名不能与 Tauri core 内置的 "resources" 插件（处理资源协议）冲突，
    // 否则运行时 invoke 分发会命中 core 插件而报 "Command xxx not found"。
    tauri::plugin::Builder::new("aster-resources")
        .invoke_handler(tauri::generate_handler![
            resource_sources,
            resource_search,
            resource_cancel,
            resource_project_document,
            resource_get_description,
            resource_releases,
            resource_favorites,
            resource_favorite_add,
            resource_favorite_remove,
            resource_prepare_operation,
            resource_queue_plan,
        ])
        .build()
}

#[tauri::command]
pub async fn resource_sources() -> Result<Vec<ResourceSource>> {
    Ok(service().await?.sources())
}

#[tauri::command]
pub async fn resource_search(
    query: ResourceSearchQuery,
    cursor: Option<String>,
    request_id: RequestId,
) -> Result<ResourcePage<ResourceSearchResult>> {
    let (_guard, cancel) = request(&request_id)?;
    Ok(service()
        .await?
        .search(query, cursor, request_id, &cancel)
        .await?)
}

#[tauri::command]
pub fn resource_cancel(request_id: RequestId) {
    if let Some(token) = REQUESTS.get(&request_id) {
        token.cancel();
    } else {
        EARLY_CANCELLATIONS.retain(|_, time| {
            time.elapsed() < std::time::Duration::from_secs(30)
        });
        if EARLY_CANCELLATIONS.len() < 256 {
            EARLY_CANCELLATIONS
                .insert(request_id.clone(), std::time::Instant::now());
        }
        if let Some(token) = REQUESTS.get(&request_id) {
            token.cancel();
        }
    }
}

#[tauri::command]
pub async fn resource_project_document(
    project: SourceProjectRef,
    locator: Option<String>,
    request_id: RequestId,
) -> Result<ProjectDocument> {
    let (_guard, cancel) = request(&request_id)?;
    Ok(service()
        .await?
        .project_document(&project, locator, &cancel)
        .await?)
}

#[tauri::command]
pub async fn resource_get_description(
    reference: ResourceRef,
    source: SourceId,
    locator: Option<String>,
    request_id: RequestId,
) -> Result<ResourceText> {
    let (_guard, cancel) = request(&request_id)?;
    Ok(service()
        .await?
        .description(&reference, &source, locator, &cancel)
        .await?)
}

#[tauri::command]
pub async fn resource_releases(
    reference: ResourceRef,
    target: ResourceTarget,
    locator: Option<String>,
    cursor: Option<String>,
    request_id: RequestId,
) -> Result<ResourcePage<ResourceRelease>> {
    let (_guard, cancel) = request(&request_id)?;
    Ok(service()
        .await?
        .releases(&reference, target, cursor, request_id, locator, &cancel)
        .await?)
}

#[tauri::command]
pub async fn resource_favorites() -> Result<Vec<ResourceFavorite>> {
    Ok(favorites::list().await?)
}

#[tauri::command]
pub async fn resource_favorite_add(
    project: SourceProjectRef,
    content_type: ResourceType,
    locator: Option<String>,
) -> Result<()> {
    favorites::add(project, content_type, locator).await?;
    Ok(())
}

#[tauri::command]
pub async fn resource_favorite_remove(project: SourceProjectRef) -> Result<()> {
    favorites::remove(&project).await?;
    Ok(())
}

#[tauri::command]
pub async fn resource_prepare_operation(
    instance_id: String,
    intent: ResourceOperationIntent,
    selections: Vec<ResourceSelection>,
    install_dependencies: Option<bool>,
    request_id: RequestId,
) -> Result<ResourceOperationPlan> {
    let (_guard, cancel) = request(&request_id)?;
    Ok(plans::prepare_with_progress(
        instance_id,
        intent,
        selections,
        install_dependencies.unwrap_or(true),
        &cancel,
        None,
        true,
    )
    .await?)
}

#[tauri::command]
pub async fn resource_queue_plan(
    plan_id: PlanId,
    revision: u32,
    resource_names: Option<HashMap<String, String>>,
) -> Result<theseus::install::InstallJobSnapshot> {
    Ok(plans::queue_with_resource_names(
        plan_id,
        revision,
        resource_names.unwrap_or_default(),
    )
    .await?)
}
