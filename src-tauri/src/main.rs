#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
#![recursion_limit = "256"]

mod api;
mod error;
mod glass;

use std::ffi::c_void;
use std::path::PathBuf;
use std::time::Duration;

use tauri::Manager;
use tauri_plugin_fs::FsExt;
use theseus::prelude::*;

/// 安装更新后由前端调用，重启应用以运行新版本。
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// 全局透明材质开关：开启 = DWM 高斯模糊铺在卡片圆角区域上，
/// 桌面画面实时透出；关闭 = 撤销模糊，由页面实体底接管。
#[tauri::command]
fn set_glass(app: tauri::AppHandle, enabled: bool) {
    if let Some(window) = app.get_webview_window("main")
        && let Ok(hwnd) = window.hwnd()
    {
        let maximized = window.is_maximized().unwrap_or(false);
        glass::set_enabled(hwnd.0 as *mut c_void, enabled, maximized);
    }
}

// Should be called in launcher initialization
#[tracing::instrument(skip_all)]
#[tauri::command]
async fn initialize_state(app: tauri::AppHandle) -> api::Result<()> {
    tracing::info!("Initializing app event state...");
    theseus::EventState::init(app.clone()).await?;

    tracing::info!("Initializing app state...");
    State::init(app.config().identifier.clone()).await?;

    // A recreated webview must not recover or interrupt backup operations a second time.
    static BACKUP_STARTUP: tokio::sync::OnceCell<()> =
        tokio::sync::OnceCell::const_new();
    BACKUP_STARTUP.get_or_try_init(|| async {
        theseus::instance::recover_backup_repository().await?;
        tauri::async_runtime::spawn(async {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            if let Some(state) = State::get_if_initialized()
                && let Err(error) = state.maintain_database_backups().await
            {
                tracing::warn!(%error, "Failed to prune old database backups");
            }
            if let Err(error) =
                theseus::instance::maintain_backup_repository().await
            {
                tracing::warn!(%error, "Failed to maintain the instance backup repository");
            }
        });
        Ok::<(), theseus::Error>(())
    })
    .await?;

    // The logger starts before the database is available, so the stored level
    // is applied here once settings can be read.
    match theseus::settings::get().await {
        Ok(mut settings) => {
            match resolve_update_channel(&app).await {
                Ok(channel) => {
                    let log_level = api::settings::log_level_for_channel(
                        &channel,
                        &settings.log_level,
                    );
                    if log_level != settings.log_level {
                        settings.log_level = log_level;
                        if let Err(error) = theseus::settings::patch(
                            serde_json::json!({ "log_level": settings.log_level }),
                        )
                        .await
                        {
                            tracing::warn!(
                                "Could not save the Beta log level: {error}"
                            );
                        }
                    }
                }
                Err(error) => {
                    tracing::warn!(
                        "Could not resolve the update channel: {error}"
                    );
                }
            }

            if std::env::var_os("RUST_LOG").is_none()
                && let Err(error) = theseus::set_log_level(&settings.log_level)
            {
                tracing::warn!("Keeping the default log level: {error}");
            }
        }
        Err(error) => {
            tracing::warn!("Could not read the stored log level: {error}");
        }
    }

    let state = State::get().await?;
    // Do not start accepting group writes until the legacy import succeeds.
    theseus::state::instance_groups::ensure_imported(&state).await?;

    app.asset_protocol_scope()
        .allow_directory(state.directories.caches_dir(), true)?;
    app.asset_protocol_scope()
        .allow_directory(state.directories.caches_dir().join("icons"), true)?;
    app.asset_protocol_scope()
        .allow_directory(state.directories.instances_dir(), true)?;
    app.asset_protocol_scope()
        .allow_directory(state.directories.servers_dir(), true)?;
    app.fs_scope()
        .allow_directory(state.directories.instances_dir(), true)?;
    app.fs_scope()
        .allow_directory(state.directories.servers_dir(), true)?;

    Ok(())
}

async fn resolve_update_channel<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> api::Result<String> {
    let settings_dir = update_channel_settings_dir(app)?;
    let state = theseus::read_update_channel_state(&settings_dir).await?;
    let channel = state
        .active_channel
        .unwrap_or_else(|| theseus::default_update_channel().to_string());

    match channel.as_str() {
        "release" | "beta" => Ok(channel),
        _ => Err(theseus::Error::from(theseus::ErrorKind::FSError(
            "Update channel settings are invalid".to_string(),
        ))
        .into()),
    }
}

fn update_channel_settings_dir<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> api::Result<PathBuf> {
    theseus::DirectoryInfo::initial_settings_dir_path(&app.config().identifier)
        .ok_or_else(|| {
            theseus::Error::from(theseus::ErrorKind::FSError(
                "Could not find update channel settings directory".to_string(),
            ))
            .into()
        })
}

fn main() {
    // Configure the tokio runtime with a larger thread stack size to prevent
    // stack overflows on Windows during deep async call chains. The /STACK
    // linker flag in .cargo/config.toml only affects the main thread.
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_stack_size(16 * 1024 * 1024)
        .build()
        .expect("failed to build tokio runtime");
    let handle = rt.handle().clone();
    // SAFETY: tauri::async_runtime::set() takes a Handle by value but does not
    // take ownership of the Runtime itself — Tauri expects the runtime to
    // outlive main(). The OS reclaims the leaked pages on exit.
    std::mem::forget(rt);
    tauri::async_runtime::set(handle);

    let tauri_context = tauri::tauri_build_context!();

    let _log_guard = theseus::start_logger(&tauri_context.config().identifier);
    theseus::scheduler::panic::install_panic_hook(
        &tauri_context.config().identifier,
    );

    tracing::info!("Initializing tracing subscriber. Loading Aster Launcher!");

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // 窗口以隐藏状态创建，由前端首帧渲染完成后调用 show()，
            // 避免 WebView2 默认白底造成启动闪白。
            let handle = app.handle().clone();

            // 兜底：前端若因异常未能显示窗口，4 秒后强制显示
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(4));
                if let Some(window) = handle.get_webview_window("main") {
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();
                    }
                }
            });

            // 全局透明材质：先按默认开启铺好 DWM 高斯模糊区域，
            // 前端载入设置后会通过 set_glass 命令纠正真实开关状态。
            // 尺寸 / 最大化 / DPI 变化时区域需要重建（微秒级），
            // 否则模糊区域会与卡片错位。
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(hwnd) = window.hwnd() {
                    glass::set_enabled(
                        hwnd.0 as *mut c_void,
                        true,
                        window.is_maximized().unwrap_or(false),
                    );
                }
                let listen_window = window.clone();
                window.on_window_event(move |event| {
                    if matches!(
                        event,
                        tauri::WindowEvent::Resized(_)
                            | tauri::WindowEvent::ScaleFactorChanged { .. }
                    ) && let Ok(hwnd) = listen_window.hwnd()
                    {
                        let maximized = listen_window.is_maximized().unwrap_or(false);
                        glass::refresh(hwnd.0 as *mut c_void, maximized);
                    }
                });
            }
            Ok(())
        })
        .plugin(api::install::init())
        .plugin(api::import::init())
        .plugin(api::instance::init())
        .plugin(api::logs::init())
        .plugin(api::jre::init())
        .plugin(api::metadata::init())
        .plugin(api::process::init())
        .plugin(api::resources::init())
        .plugin(api::settings::init())
        .plugin(api::utils::init())
        .plugin(api::files::init())
        .plugin(api::shortcuts::init())
        .manage(api::files::StudioWatchers::default())
        .invoke_handler(tauri::generate_handler![
            initialize_state,
            set_glass,
            restart_app
        ])
        .run(tauri_context)
        .expect("error while running Aster Launcher");
}