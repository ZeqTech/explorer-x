mod fs_service;

use fs_service::{Entry, Hit, Place};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;
#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

type Res<T> = Result<T, String>;

static WINDOW_SEQ: AtomicUsize = AtomicUsize::new(0);

/// When the app started, used to tell a cold launch from a later "open folder" request.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
struct Startup(Instant);

// ---- windows ------------------------------------------------------------

fn open_window(app: &AppHandle, start: Option<String>) -> tauri::Result<()> {
    let label = format!("win{}", WINDOW_SEQ.fetch_add(1, Ordering::SeqCst));
    // The UI reads window.__START_PATH__ to decide which folder to show first.
    let init = format!("window.__START_PATH__ = {};", serde_json::to_string(&start).unwrap_or("null".into()));
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Explorer X")
        .inner_size(1200.0, 760.0)
        .min_inner_size(640.0, 400.0)
        .disable_drag_drop_handler() // lets HTML5 drag-and-drop work inside the UI on Windows
        .initialization_script(&init);
    #[cfg(target_os = "macos")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    builder.build()?;
    Ok(())
}

/// First command-line argument (after the executable) that is an existing folder.
fn folder_from_args(args: &[String]) -> Option<String> {
    args.iter().skip(1).filter(|a| !a.starts_with('-')).find(|a| std::path::Path::new(a).is_dir()).cloned()
}

// ---- commands -----------------------------------------------------------

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Res<T> + Send + 'static) -> Res<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_dir(dir: String, show_hidden: bool) -> Res<Vec<Entry>> {
    blocking(move || fs_service::list_dir(&dir, show_hidden)).await
}
#[tauri::command]
async fn copy_into(srcs: Vec<String>, dest_dir: String) -> Res<()> {
    blocking(move || fs_service::copy_into(&srcs, &dest_dir)).await
}
#[tauri::command]
async fn move_into(srcs: Vec<String>, dest_dir: String) -> Res<()> {
    blocking(move || fs_service::move_into(&srcs, &dest_dir)).await
}
#[tauri::command]
async fn rename_path(path: String, new_name: String) -> Res<String> {
    blocking(move || fs_service::rename(&path, &new_name)).await
}
#[tauri::command]
async fn make_dir(dir: String) -> Res<String> {
    blocking(move || fs_service::make_dir(&dir, "New folder")).await
}
#[tauri::command]
async fn new_file(dir: String) -> Res<String> {
    blocking(move || fs_service::new_file(&dir, "New file.txt")).await
}
#[tauri::command]
async fn search(root: String, query: String) -> Res<Vec<Hit>> {
    blocking(move || Ok(fs_service::search(&root, &query, 500))).await
}
#[tauri::command]
async fn drives() -> Res<Vec<Place>> {
    blocking(|| Ok(fs_service::drives())).await
}
#[tauri::command]
fn quick_access(app: AppHandle) -> Res<Vec<Place>> {
    Ok(fs_service::quick_access(&app.path().home_dir().map_err(|e| e.to_string())?))
}
#[tauri::command]
async fn trash_paths(paths: Vec<String>) -> Res<()> {
    blocking(move || trash::delete_all(&paths).map_err(|e| e.to_string())).await
}
#[tauri::command]
fn open_path(app: AppHandle, path: String) -> Res<()> {
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}
#[tauri::command]
fn reveal_path(app: AppHandle, path: String) -> Res<()> {
    app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}
#[tauri::command]
fn is_dir(path: String) -> Res<bool> {
    std::fs::metadata(path).map(|m| m.is_dir()).map_err(|e| e.to_string())
}
#[tauri::command]
fn home_dir(app: AppHandle) -> Res<String> {
    app.path().home_dir().map(|p| p.to_string_lossy().into_owned()).map_err(|e| e.to_string())
}
/// Same names the UI expects for platform checks.
#[tauri::command]
fn platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}
// async on purpose: creating a window from a sync command deadlocks on Windows
#[tauri::command]
async fn new_window(app: AppHandle, path: Option<String>) -> Res<()> {
    open_window(&app, path).map_err(|e| e.to_string())
}

// The file clipboard is the system text clipboard holding a small JSON marker, as before.
#[tauri::command]
fn clipboard_write(paths: Vec<String>, cut: bool) -> Res<()> {
    let text = serde_json::json!({ "explorerX": true, "paths": paths, "cut": cut }).to_string();
    arboard::Clipboard::new().and_then(|mut c| c.set_text(text)).map_err(|e| e.to_string())
}
#[tauri::command]
fn clipboard_read() -> Res<Option<serde_json::Value>> {
    let Ok(text) = arboard::Clipboard::new().and_then(|mut c| c.get_text()) else { return Ok(None) };
    Ok(serde_json::from_str::<serde_json::Value>(&text).ok().filter(|v| v["explorerX"] == true))
}

/// Plain text (e.g. a path) on the system clipboard.
#[tauri::command]
fn clipboard_text(text: String) -> Res<()> {
    arboard::Clipboard::new().and_then(|mut c| c.set_text(text)).map_err(|e| e.to_string())
}

/// Opens a terminal in `path` (or in its parent folder when `path` is a file).
#[tauri::command]
fn open_terminal(path: String) -> Res<()> {
    let p = std::path::Path::new(&path);
    let dir = if p.is_dir() { p } else { p.parent().ok_or("No parent folder")? };
    launch_terminal(dir)
}

fn launch_terminal(dir: &std::path::Path) -> Res<()> {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // Windows Terminal if installed, otherwise a plain console window.
        if Command::new("wt.exe").arg("-d").arg(dir).spawn().is_ok() {
            return Ok(());
        }
        return Command::new("cmd.exe")
            .args(["/C", "start", "", "/D"])
            .arg(dir)
            .arg("cmd.exe")
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW for the helper; "start" opens the real console
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }
    #[cfg(target_os = "macos")]
    {
        return Command::new("open").args(["-a", "Terminal"]).arg(dir).spawn().map(|_| ()).map_err(|e| e.to_string());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        for t in ["x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"] {
            if Command::new(t).current_dir(dir).spawn().is_ok() {
                return Ok(());
            }
        }
        Err("No terminal emulator found".into())
    }
}

// ---- app ------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // A later launch (e.g. as the OS folder handler) opens a window in the running instance.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let _ = open_window(app, folder_from_args(&argv));
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(Startup(Instant::now()))
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            open_window(app.handle(), folder_from_args(&args))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_dir, copy_into, move_into, rename_path, make_dir, new_file, search, drives, quick_access,
            trash_paths, open_path, reveal_path, is_dir, home_dir, platform, new_window, clipboard_write,
            clipboard_read, clipboard_text, open_terminal
        ])
        .build(tauri::generate_context!())
        .expect("error while building Explorer X");

    app.run(|app, event| {
        let _ = &app;
        match event {
            // macOS: "open this folder with Explorer X" (also fires right after a cold launch).
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                let cold = app.state::<Startup>().0.elapsed() < std::time::Duration::from_secs(3);
                let mut reuse_first = cold;
                for p in urls.iter().filter_map(|u| u.to_file_path().ok()).filter(|p| p.is_dir()) {
                    let p = p.to_string_lossy().into_owned();
                    if reuse_first {
                        reuse_first = false;
                        if let Some(w) = app.webview_windows().values().next() {
                            let _ = w.emit("open-path", p);
                            continue;
                        }
                    }
                    let _ = open_window(app, Some(p));
                }
            }
            // macOS apps stay alive with no windows; clicking the Dock icon brings one back.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::ExitRequested { api, code: None, .. } => api.prevent_exit(),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { has_visible_windows: false, .. } => {
                let _ = open_window(app, None);
            }
            _ => {}
        }
    });
}
