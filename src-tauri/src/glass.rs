//! 全局透明材质：DWM 级高斯模糊（blur-behind）。
//!
//! 旧方案是「Rust 抓桌面像素 → 缩成小图 → 页面贴图 + CSS blur」，
//! 拖动必卡、帧率受限，还要叠乳白散射与噪点来遮抓图杂质。
//! 现在改为直接让 DWM 在窗口背后做系统级高斯模糊：
//! GPU 合成、零像素搬运，窗口移动 / 缩放全程零开销，桌面实时透出，
//! 也没有任何抓图噪点 —— 干净纯粹的磨砂玻璃。
//!
//! 圆角问题（系统模糊默认按窗口矩形铺满、无视 CSS 圆角）的解法：
//! blur-behind 支持 HRGN 区域。用 CreateRoundRectRgn 建一个与
//! .app-shell 卡片完全一致的圆角矩形区域 —— 模糊只发生在卡片内，
//! 16px 透明边距留给 CSS 投影。窗口尺寸 / 最大化 / DPI 变化时
//! 由窗口事件驱动重建区域（重建本身只是重建一个 HRGN，微秒级）。

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use windows_sys::Win32::Foundation::RECT;
use windows_sys::Win32::Graphics::Dwm::{
    DwmEnableBlurBehindWindow, DWM_BB_BLURREGION, DWM_BB_ENABLE, DWM_BLURBEHIND,
};
use windows_sys::Win32::Graphics::Gdi::{CreateRectRgn, CreateRoundRectRgn, DeleteObject, HRGN};
use windows_sys::Win32::UI::HiDpi::GetDpiForWindow;
use windows_sys::Win32::UI::WindowsAndMessaging::GetClientRect;

/// 与 CSS 的 --frame-gutter 对齐：窗口边缘留给 CSS 投影的透明边距（逻辑像素）。
const FRAME_GUTTER_DP: i32 = 16;
/// 与 .app-shell 的 --shell-radius 对齐（逻辑像素）。
const SHELL_RADIUS_DP: i32 = 22;

/// 模糊开关状态。窗口事件只负责「重铺区域」，开 / 关由 set_glass 驱动；
/// 状态记在这里，避免 resize 事件把已经关闭的模糊又铺回去。
static ENABLED: AtomicBool = AtomicBool::new(true);

/// 上次应用时的（客户区宽, 客户区高, 是否最大化）：尺寸与状态都没变时跳过重建，
/// 避免 resize 过程中重复的 Resized 事件反复重铺区域造成边缘闪烁。
static LAST_SIZE: Mutex<(i32, i32, bool)> = Mutex::new((0, 0, false));

/// 设置开关。`maximized` 决定区域是否贴满整个窗口（无边距无圆角）。
pub fn set_enabled(hwnd: *mut c_void, enabled: bool, maximized: bool) {
    ENABLED.store(enabled, Ordering::Release);
    if enabled {
        apply_region(hwnd, maximized);
    } else {
        keep_alpha_only(hwnd);
    }
}

/// 窗口尺寸 / 最大化 / DPI 变化后调用。
/// 开启时重建圆角区域（否则会与卡片错位）；关闭时空区域与尺寸无关，
/// 但一并重铺一次，防止外部（tao / 主题切换）重置了 blur-behind 状态。
pub fn refresh(hwnd: *mut c_void, maximized: bool) {
    // resize 过程中 Resized 事件每帧都会触发；尺寸与最大化状态都没变时跳过，
    // 避免反复重建 HRGN、重新注册 blur-behind 造成的边缘闪烁。
    let (w, h) = unsafe {
        let mut rc: RECT = std::mem::zeroed();
        if GetClientRect(hwnd, &mut rc) == 0 {
            return;
        }
        (rc.right, rc.bottom)
    };
    let mut last = LAST_SIZE.lock().unwrap();
    if *last == (w, h, maximized) {
        return;
    }
    *last = (w, h, maximized);
    drop(last);

    if ENABLED.load(Ordering::Acquire) {
        apply_region(hwnd, maximized);
    } else {
        keep_alpha_only(hwnd);
    }
}

/// 在卡片区域上启用 DWM 高斯模糊。
///
/// 系统模糊默认铺满窗口矩形会顶掉 CSS 圆角；blur-behind 支持
/// HRGN 区域，直接建一个与 .app-shell 一致的圆角矩形即可。
/// 区域用完即删：DwmEnableBlurBehindWindow 内部会拷贝区域数据。
fn apply_region(hwnd: *mut c_void, maximized: bool) {
    unsafe {
        let Some(region) = build_region(hwnd, maximized) else {
            return;
        };
        let blur = DWM_BLURBEHIND {
            dwFlags: DWM_BB_ENABLE | DWM_BB_BLURREGION,
            fEnable: 1,
            hRgnBlur: region,
            fTransitionOnMaximized: 0,
        };
        DwmEnableBlurBehindWindow(hwnd, &blur);
        DeleteObject(region);
    }
}

/// 撤销模糊：模糊区域清空，但**不能**把 blur-behind 关掉。
///
/// Tauri 的透明窗口（tao 的 `transparent`）本身就是用
/// `DwmEnableBlurBehindWindow(fEnable: true, hRgnBlur: 空区域)` 打开的逐像素
/// alpha 通道 —— 透明窗口能透出桌面靠的就是它。直接传 `fEnable: 0` 会把这条
/// 通道一起关掉，整块窗口退化成不透明黑底：卡片外那圈 16px 投影边距
/// （`--frame-gutter`）就会变成一圈黑边，圆角外侧也全黑。
/// 所以这里沿用 tao 的构造：alpha 通道保持开启，只把模糊区域清空。
fn keep_alpha_only(hwnd: *mut c_void) {
    unsafe {
        // 空区域（0,0,-1,-1）：没有任何像素参与模糊，但仍保留透明合成
        let region = CreateRectRgn(0, 0, -1, -1);
        if region.is_null() {
            return;
        }
        let blur = DWM_BLURBEHIND {
            dwFlags: DWM_BB_ENABLE | DWM_BB_BLURREGION,
            fEnable: 1,
            hRgnBlur: region,
            fTransitionOnMaximized: 0,
        };
        DwmEnableBlurBehindWindow(hwnd, &blur);
        DeleteObject(region);
    }
}

/// 卡片圆角区域：客户区内缩 FRAME_GUTTER、四角 SHELL_RADIUS。
/// 最大化时贴满客户区（CSS 侧的 --frame-gutter 与圆角同样归零）。
/// hRgnBlur 是客户区相对坐标（GetClientRect 的左上角即原点）。
unsafe fn build_region(hwnd: *mut c_void, maximized: bool) -> Option<HRGN> {
    unsafe {
        let mut rc: RECT = std::mem::zeroed();
        // hRgnBlur 是「客户区相对」坐标（MSDN：region within the client area）。
        // 必须用 GetClientRect 而不是 GetWindowRect：无边框但可缩放的窗口在 Windows
        // 上仍带一层不可见 resize 边框（WS_THICKFRAME），GetWindowRect 会把边框计入
        // 宽高，导致模糊区域比卡片大一圈、边缘错位 —— 正是那条时隐时现的边线来源。
        if GetClientRect(hwnd, &mut rc) == 0 {
            return None;
        }
        let w = rc.right; // GetClientRect 的 left/top 恒为 0
        let h = rc.bottom;
        if w <= 0 || h <= 0 {
            return None;
        }

        let (gutter, radius) = if maximized {
            (0, 0)
        } else {
            // 区域是物理像素：按窗口 DPI 把设计值换算过去
            let scale = GetDpiForWindow(hwnd).max(96) as f32 / 96.0;
            (
                (FRAME_GUTTER_DP as f32 * scale).round() as i32,
                (SHELL_RADIUS_DP as f32 * scale).round() as i32,
            )
        };

        let region = CreateRoundRectRgn(
            gutter,
            gutter,
            w - gutter,
            h - gutter,
            radius * 2,
            radius * 2,
        );
        if region.is_null() {
            return None;
        }
        Some(region)
    }
}
