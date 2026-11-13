use std::path::PathBuf;
use std::time::Duration;

use crate::api::Result;
use serde::Serialize;
use theseus::pack::import;
use theseus::pack::import::{ImportLauncherType, ImportableInstance};

const IMPORT_SCAN_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const IMPORT_VALIDATION_TIMEOUT: Duration = Duration::from_secs(2 * 60);

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("import")
        .invoke_handler(tauri::generate_handler![
            get_importable_instances,
            is_valid_importable_instance,
            get_default_launcher_path,
            import_detect_instances,
        ])
        .build()
}

/// 获取某个启动器目录下所有可导入的实例
#[tauri::command]
pub async fn get_importable_instances(
    launcher_type: ImportLauncherType,
    base_path: PathBuf,
) -> Result<Vec<ImportableInstance>> {
    Ok(tokio::time::timeout(
        IMPORT_SCAN_TIMEOUT,
        import::get_importable_instances(launcher_type, base_path),
    )
    .await
    .map_err(|_| {
        theseus::Error::from(theseus::ErrorKind::InputError(format!(
            "Launcher instance scan timed out after {} minutes",
            IMPORT_SCAN_TIMEOUT.as_secs() / 60
        )))
    })??)
}

/// 校验某个实例目录能否按指定启动器类型导入
#[tauri::command]
pub async fn is_valid_importable_instance(
    instance_folder: PathBuf,
    launcher_type: ImportLauncherType,
) -> Result<bool> {
    Ok(tokio::time::timeout(
        IMPORT_VALIDATION_TIMEOUT,
        import::is_valid_importable_instance(instance_folder, launcher_type),
    )
    .await
    .map_err(|_| {
        theseus::Error::from(theseus::ErrorKind::InputError(format!(
            "Launcher instance validation timed out after {} minutes",
            IMPORT_VALIDATION_TIMEOUT.as_secs() / 60
        )))
    })?)
}

/// 返回指定启动器的默认路径；找不到时为 None
#[tauri::command]
pub async fn get_default_launcher_path(
    launcher_type: ImportLauncherType,
) -> Result<Option<PathBuf>> {
    Ok(import::get_default_launcher_path(launcher_type))
}

/// 探测结果：命中的启动器类型与其下可导入实例
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedImport {
    pub launcher_type: ImportLauncherType,
    pub instances: Vec<ImportableInstance>,
}

/// 依次按常见启动器类型探测目录，返回第一个命中的结果；
/// Generic 放在最后，可直接接受 `.minecraft` 文件夹或整合目录。
#[tauri::command]
pub async fn import_detect_instances(base_path: PathBuf) -> Result<DetectedImport> {
    const ORDER: [ImportLauncherType; 11] = [
        ImportLauncherType::Axolotl,
        ImportLauncherType::HMCL,
        ImportLauncherType::PCL2,
        ImportLauncherType::PCL2CE,
        ImportLauncherType::MultiMC,
        ImportLauncherType::PrismLauncher,
        ImportLauncherType::ModrinthApp,
        ImportLauncherType::ATLauncher,
        ImportLauncherType::GDLauncher,
        ImportLauncherType::Curseforge,
        ImportLauncherType::Generic,
    ];

    for launcher_type in ORDER {
        let scanned = tokio::time::timeout(
            IMPORT_SCAN_TIMEOUT,
            import::get_importable_instances(launcher_type, base_path.clone()),
        )
        .await;

        // 超时或错误都按“该类型不适用”继续尝试下一个
        if let Ok(Ok(instances)) = scanned
            && !instances.is_empty()
        {
            return Ok(DetectedImport {
                launcher_type,
                instances,
            });
        }
    }

    Err(theseus::Error::from(theseus::ErrorKind::InputError(
        "未在该目录中找到可导入的实例，请选择启动器目录或 .minecraft 文件夹。"
            .to_string(),
    ))
    .into())
}
