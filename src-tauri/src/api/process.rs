use crate::api::Result;
use theseus::prelude::*;
use uuid::Uuid;

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("process")
        .invoke_handler(tauri::generate_handler![
            process_get_all,
            process_get_by_instance_id,
            process_kill,
            process_wait_for,
            process_set_priority,
        ])
        .build()
}

#[tauri::command]
pub async fn process_get_all() -> Result<Vec<ProcessMetadata>> {
    Ok(process::get_all().await?)
}

#[tauri::command]
pub async fn process_get_by_instance_id(
    instance_id: &str,
) -> Result<Vec<ProcessMetadata>> {
    Ok(process::get_by_instance_id(instance_id).await?)
}

#[tauri::command]
pub async fn process_kill(uuid: Uuid) -> Result<()> {
    Ok(process::kill(uuid).await?)
}

#[tauri::command]
pub async fn process_wait_for(uuid: Uuid) -> Result<()> {
    Ok(process::wait_for(uuid).await?)
}

/// 设置游戏进程优先级：high = 游戏性能更佳，normal = 平衡，low = 优先其它程序。
///
/// 启动完成后再调用：Java 进程刚 spawn 时窗口还没出来，
/// 前端会轮询 process_get_all 拿到 pid 再调用本命令。
#[tauri::command]
pub async fn process_set_priority(pid: u32, level: String) -> Result<()> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            HIGH_PRIORITY_CLASS, IDLE_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS,
            OpenProcess, PROCESS_SET_INFORMATION, SetPriorityClass,
        };

        let class = match level.as_str() {
            "high" => HIGH_PRIORITY_CLASS,
            "low" => IDLE_PRIORITY_CLASS,
            _ => NORMAL_PRIORITY_CLASS,
        };
        unsafe {
            let handle = OpenProcess(PROCESS_SET_INFORMATION, 0, pid);
            if handle.is_null() {
                return Err(std::io::Error::last_os_error().into());
            }
            let applied = SetPriorityClass(handle, class);
            CloseHandle(handle);
            if applied == 0 {
                return Err(std::io::Error::last_os_error().into());
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (pid, level);
    }
    Ok(())
}
