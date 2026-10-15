mod fs_service;

use fs_service::{Conflict, DirStats, DiskSpace, DupGroup, Entry, Hit, Moved, Place, Progress, Props, Res, Resolutions, CANCELLED};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

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

// ---- long-running operations: progress + cancel ---------------------------

/// Cancel flags for running copy/move operations, keyed by the id the UI chose.
#[derive(Default)]
struct Ops(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    op_id: String,
    done: u64,
    total: u64,
    current: String,
}

struct OpProgress {
    app: AppHandle,
    op_id: String,
    srcs: Vec<String>,
    total: Option<u64>, // measured lazily: instant same-volume moves never need it
    done: u64,
    last_emit: Instant,
    cancel: Arc<AtomicBool>,
}

impl Progress for OpProgress {
    fn set_total(&mut self, total: u64) {
        self.total = Some(total);
    }
    fn advance(&mut self, bytes: u64, current: &str) -> Res<()> {
        if self.cancel.load(Ordering::Relaxed) {
            return Err(CANCELLED.into());
        }
        let total = *self.total.get_or_insert_with(|| fs_service::total_size(&self.srcs));
        self.done += bytes;
        if self.last_emit.elapsed() >= Duration::from_millis(80) {
            self.last_emit = Instant::now();
            let _ = self.app.emit(
                "op-progress",
                ProgressEvent { op_id: self.op_id.clone(), done: self.done, total, current: current.to_string() },
            );
        }
        Ok(())
    }
}

async fn run_op<T: Send + 'static>(
    app: AppHandle,
    ops: &Ops,
    op_id: String,
    srcs: Vec<String>,
    f: impl FnOnce(&mut OpProgress) -> Res<T> + Send + 'static,
) -> Res<T> {
    let cancel = Arc::new(AtomicBool::new(false));
    ops.0.lock().unwrap().insert(op_id.clone(), cancel.clone());
    let id = op_id.clone();
    let result = blocking(move || {
        let mut p = OpProgress { app, op_id, srcs, total: None, done: 0, last_emit: Instant::now(), cancel };
        f(&mut p)
    })
    .await;
    ops.0.lock().unwrap().remove(&id);
    result
}

#[tauri::command]
fn cancel_op(ops: State<'_, Ops>, op_id: String) {
    if let Some(flag) = ops.0.lock().unwrap().get(&op_id) {
        flag.store(true, Ordering::Relaxed);
    }
}
#[tauri::command]
async fn find_conflicts(srcs: Vec<String>, dest_dir: String) -> Res<Vec<Conflict>> {
    blocking(move || fs_service::conflicts(&srcs, &dest_dir)).await
}
#[tauri::command]
async fn copy_into(
    app: AppHandle,
    ops: State<'_, Ops>,
    op_id: String,
    srcs: Vec<String>,
    dest_dir: String,
    resolutions: Option<Resolutions>,
) -> Res<Vec<Moved>> {
    let list = srcs.clone();
    run_op(app, &ops, op_id, srcs, move |p| {
        fs_service::copy_into(&list, &dest_dir, &resolutions.unwrap_or_default(), p)
    })
    .await
}
#[tauri::command]
async fn move_into(
    app: AppHandle,
    ops: State<'_, Ops>,
    op_id: String,
    srcs: Vec<String>,
    dest_dir: String,
    resolutions: Option<Resolutions>,
) -> Res<Vec<Moved>> {
    let list = srcs.clone();
    run_op(app, &ops, op_id, srcs, move |p| {
        fs_service::move_into(&list, &dest_dir, &resolutions.unwrap_or_default(), p)
    })
    .await
}
/// Moves each `to` back onto `from` exactly (undo / redo of moves).
#[tauri::command]
async fn rename_many(pairs: Vec<Moved>) -> Res<()> {
    blocking(move || fs_service::rename_many(&pairs)).await
}
/// Recreates an empty folder or file at an exact path (redo of "new folder" / "new file").
#[tauri::command]
async fn create_path(path: String, is_dir: bool) -> Res<()> {
    blocking(move || fs_service::create_exact(&path, is_dir)).await
}
#[tauri::command]
async fn properties(path: String) -> Res<Props> {
    blocking(move || fs_service::properties(&path)).await
}
#[tauri::command]
async fn dir_stats(path: String) -> Res<DirStats> {
    blocking(move || Ok(fs_service::dir_stats(&path))).await
}
#[tauri::command]
async fn text_preview(path: String, max_bytes: usize) -> Res<Option<String>> {
    blocking(move || fs_service::text_preview(&path, max_bytes.min(1 << 20))).await
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
async fn disk_space(path: String) -> Res<DiskSpace> {
    blocking(move || fs_service::disk_space(&path)).await
}
#[tauri::command]
async fn drives() -> Res<Vec<Place>> {
    blocking(|| Ok(fs_service::drives())).await
}
#[tauri::command]
fn quick_access(app: AppHandle) -> Res<Vec<Place>> {
    Ok(fs_service::quick_access(&app.path().home_dir().map_err(|e| e.to_string())?))
}

/// Folders pinned to Quick access in Windows File Explorer, read through the shell.
#[cfg(windows)]
fn explorer_pins() -> Res<Vec<String>> {
    use std::os::windows::process::CommandExt;
    const SCRIPT: &str = "$ns=(New-Object -ComObject Shell.Application).Namespace('shell:::{679f85cb-0220-4080-b29b-5540cc05aab6}');         foreach($i in $ns.Items()){ if($i.IsFolder -and (@($i.Verbs()|ForEach-Object{$_.Name}) -match 'Unpin from Quick access')){ $i.Path } }";
    let out = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", SCRIPT])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && std::path::Path::new(l).is_dir())
        .map(String::from)
        .collect())
}
#[cfg(not(windows))]
fn explorer_pins() -> Res<Vec<String>> {
    Err("Importing pins is only available on Windows".into())
}
#[tauri::command]
async fn import_explorer_pins() -> Res<Vec<String>> {
    blocking(explorer_pins).await
}

#[tauri::command]
async fn find_duplicates(app: AppHandle, ops: State<'_, Ops>, op_id: String, root: String) -> Res<Vec<DupGroup>> {
    let srcs = vec![root.clone()];
    run_op(app, &ops, op_id, srcs, move |p| fs_service::find_duplicates(&root, p)).await
}
#[tauri::command]
async fn compress_paths(app: AppHandle, ops: State<'_, Ops>, op_id: String, paths: Vec<String>) -> Res<String> {
    let srcs = paths.clone();
    run_op(app, &ops, op_id, srcs, move |p| fs_service::compress(&paths, p)).await
}
#[tauri::command]
async fn extract_zip(app: AppHandle, ops: State<'_, Ops>, op_id: String, path: String) -> Res<String> {
    let srcs = vec![path.clone()];
    run_op(app, &ops, op_id, srcs, move |p| fs_service::extract(&path, p)).await
}

// ---- trash --------------------------------------------------------------------

#[tauri::command]
async fn trash_paths(paths: Vec<String>) -> Res<()> {
    blocking(move || trash::delete_all(&paths).map_err(|e| e.to_string())).await
}

/// Takes items back out of the Trash / Recycle Bin (undo of a delete).
#[tauri::command]
async fn restore_trashed(paths: Vec<String>) -> Res<usize> {
    blocking(move || restore_from_trash(&paths)).await
}

#[cfg(any(target_os = "windows", all(unix, not(target_os = "macos"))))]
fn restore_from_trash(paths: &[String]) -> Res<usize> {
    let items = trash::os_limited::list().map_err(|e| e.to_string())?;
    let mut chosen = Vec::new();
    for p in paths {
        let want = std::path::Path::new(p);
        // if the same path was deleted several times, restore the most recent one
        if let Some(item) = items.iter().filter(|i| i.original_path() == want).max_by_key(|i| i.time_deleted) {
            chosen.push(item.clone());
        }
    }
    let n = chosen.len();
    if n == 0 {
        return Err("Could not find the item in the Recycle Bin".into());
    }
    trash::os_limited::restore_all(chosen).map_err(|e| e.to_string())?;
    Ok(n)
}
#[cfg(target_os = "macos")]
fn restore_from_trash(_: &[String]) -> Res<usize> {
    Err("Undoing a delete is not supported on macOS. Use Put Back in the Trash.".into())
}

// ---- native file icons ------------------------------------------------------

/// Icons already fetched, keyed by file type (or by path for per-file icons such as .exe).
#[derive(Default)]
struct IconCache(Mutex<HashMap<String, Option<String>>>);

#[cfg(not(target_os = "linux"))]
fn icon_data_url(path: &str) -> Res<Option<String>> {
    use base64::Engine;
    let icon = file_icon_provider::get_file_icon(path, 64).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, icon.width, icon.height);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().map_err(|e| e.to_string())?;
        w.write_image_data(&icon.pixels).map_err(|e| e.to_string())?;
    }
    Ok(Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(out))))
}
// the icon library needs the main thread on Linux; the UI falls back to built-in icons there
#[cfg(target_os = "linux")]
fn icon_data_url(_: &str) -> Res<Option<String>> {
    Ok(None)
}

#[tauri::command]
async fn file_icon(cache: State<'_, IconCache>, path: String, is_dir: bool) -> Res<Option<String>> {
    let ext = std::path::Path::new(&path).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    // most file icons depend only on the type; these kinds, and every folder (Documents, Pictures
    // and friends have their own artwork), are cached per path
    let per_file = matches!(ext.as_str(), "exe" | "lnk" | "ico" | "msi" | "url" | "app" | "scr" | "cur" | "appref-ms");
    let key = if per_file || is_dir { format!("p:{path}") } else { format!("e:{ext}") };
    if let Some(hit) = cache.0.lock().unwrap().get(&key) {
        return Ok(hit.clone());
    }
    let icon = blocking(move || icon_data_url(&path)).await.unwrap_or(None);
    cache.0.lock().unwrap().insert(key, icon.clone());
    Ok(icon)
}

// ---- opening things -----------------------------------------------------------

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
        .manage(Ops::default())
        .manage(IconCache::default())
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            open_window(app.handle(), folder_from_args(&args))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_dir, copy_into, move_into, rename_path, make_dir, new_file, search, drives, quick_access,
            trash_paths, open_path, reveal_path, is_dir, home_dir, platform, new_window, clipboard_write,
            clipboard_read, clipboard_text, open_terminal, cancel_op, find_conflicts, rename_many, create_path,
            properties, dir_stats, text_preview, restore_trashed, file_icon, import_explorer_pins, compress_paths, extract_zip, find_duplicates, disk_space
        ])
        .build(tauri::generate_context!())
        .expect("error while building Explorer X");

    app.run(|app, event| {
        let _ = &app;
        match event {
            // macOS: "open this folder with Explorer X" (also fires right after a cold launch).
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                let cold = app.state::<Startup>().0.elapsed() < Duration::from_secs(3);
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
