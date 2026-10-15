//! Filesystem operations behind the UI. Pure std (plus `trash` for recoverable replace),
//! so everything here is unit-testable without Tauri.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub type Res<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---- data types -----------------------------------------------------------

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub mtime: f64,
    pub ctime: f64,
    pub ext: String,
    pub hidden: bool,
}

#[derive(Serialize, Debug, Clone)]
pub struct Place {
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// One item that ended up somewhere: used to report results and to undo/redo moves and copies.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Moved {
    pub from: String,
    pub to: String,
}

/// What to do when a copied or moved item's name already exists in the destination.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Resolution {
    /// Send the existing item to the Trash and put the new one in its place.
    Replace,
    /// Leave this item alone.
    Skip,
    /// Keep both: the new item gets a " (2)" style name. This is the default.
    Keep,
}
pub type Resolutions = HashMap<String, Resolution>;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub src: String,
    pub name: String,
    pub src_is_dir: bool,
    pub existing_is_dir: bool,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Props {
    pub name: String,
    pub path: String,
    pub parent: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
    pub size: u64,
    pub items: Option<u64>,
    pub mtime: f64,
    pub ctime: f64,
    pub atime: f64,
    pub readonly: bool,
    pub hidden: bool,
    pub ext: String,
}

#[derive(Serialize, Debug, Clone, Default, PartialEq)]
pub struct DirStats {
    pub size: u64,
    pub files: u64,
    pub folders: u64,
}

// ---- progress -------------------------------------------------------------

/// Receives byte counts while copying. Returning `Err` aborts the operation (used for cancel).
pub trait Progress {
    fn advance(&mut self, bytes: u64, current: &str) -> Res<()>;
    /// Tells the listener how many bytes the whole operation will process, when that is only known
    /// after the operation has looked at its input (e.g. the uncompressed size of an archive).
    fn set_total(&mut self, _total: u64) {}
}

pub struct NoProgress;
impl Progress for NoProgress {
    fn advance(&mut self, _: u64, _: &str) -> Res<()> {
        Ok(())
    }
}

pub const CANCELLED: &str = "Cancelled";

// ---- listing --------------------------------------------------------------

fn millis(t: std::io::Result<std::time::SystemTime>) -> f64 {
    t.ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

#[cfg(windows)]
fn is_hidden_attr(md: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    md.file_attributes() & 0x2 != 0 // FILE_ATTRIBUTE_HIDDEN
}
#[cfg(not(windows))]
fn is_hidden_attr(_: &fs::Metadata) -> bool {
    false
}

fn ext_of(name: &str) -> String {
    Path::new(name).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

pub fn list_dir(dir: &str, show_hidden: bool) -> Res<Vec<Entry>> {
    let mut out = Vec::new();
    for ent in fs::read_dir(dir).map_err(err)? {
        let Ok(ent) = ent else { continue };
        let Ok(md) = fs::symlink_metadata(ent.path()) else { continue }; // unreadable entry: skip
        let mut is_dir = md.is_dir();
        if md.file_type().is_symlink() {
            is_dir = fs::metadata(ent.path()).map(|m| m.is_dir()).unwrap_or(false);
        }
        let name = ent.file_name().to_string_lossy().into_owned();
        let hidden = name.starts_with('.') || is_hidden_attr(&md);
        if hidden && !show_hidden {
            continue;
        }
        out.push(Entry {
            path: ent.path().to_string_lossy().into_owned(),
            size: if is_dir { None } else { Some(md.len()) },
            mtime: millis(md.modified()),
            ctime: millis(md.created()),
            ext: if is_dir { String::new() } else { ext_of(&name) },
            name,
            is_dir,
            hidden,
        });
    }
    Ok(out)
}

// ---- names ----------------------------------------------------------------

/// "a.txt" -> "a (2).txt" -> "a (3).txt" ... until it does not collide.
pub fn unique_name(name: &str, existing: &HashSet<String>) -> String {
    if !existing.contains(name) {
        return name.to_string();
    }
    let p = Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..)
        .map(|i| format!("{stem} ({i}){ext}"))
        .find(|c| !existing.contains(c))
        .unwrap()
}

fn names_in(dir: &Path) -> Res<HashSet<String>> {
    Ok(fs::read_dir(dir)
        .map_err(err)?
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect())
}

fn file_name_of(p: &Path) -> Res<String> {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).ok_or_else(|| format!("Invalid path: {}", p.display()))
}

fn exists(p: &Path) -> bool {
    fs::symlink_metadata(p).is_ok()
}

// ---- copying --------------------------------------------------------------

fn copy_file(src: &Path, dst: &Path, p: &mut dyn Progress) -> Res<()> {
    let name = file_name_of(src)?;
    let mut r = fs::File::open(src).map_err(err)?;
    let mut w = fs::File::create(dst).map_err(err)?;
    let mut buf = vec![0u8; 1 << 20];
    let result = (|| -> Res<()> {
        loop {
            let n = r.read(&mut buf).map_err(err)?;
            if n == 0 {
                return Ok(());
            }
            w.write_all(&buf[..n]).map_err(err)?;
            p.advance(n as u64, &name)?;
        }
    })();
    drop(w);
    match result {
        Ok(()) => {
            if let Ok(md) = fs::metadata(src) {
                let _ = fs::set_permissions(dst, md.permissions());
            }
            Ok(())
        }
        Err(e) => {
            let _ = fs::remove_file(dst); // never leave a half-written copy behind
            Err(e)
        }
    }
}

fn copy_recursive(src: &Path, dst: &Path, p: &mut dyn Progress) -> Res<()> {
    let md = fs::symlink_metadata(src).map_err(err)?;
    if md.is_dir() {
        fs::create_dir_all(dst).map_err(err)?;
        for e in fs::read_dir(src).map_err(err)? {
            let e = e.map_err(err)?;
            copy_recursive(&e.path(), &dst.join(e.file_name()), p)?;
        }
        Ok(())
    } else if md.file_type().is_symlink() && src.is_dir() {
        Ok(()) // links to folders are skipped, which also avoids cycles
    } else {
        copy_file(src, dst, p)
    }
}

/// Total bytes in files under `paths` (symlinks not followed).
pub fn total_size(paths: &[String]) -> u64 {
    fn walk(p: &Path) -> u64 {
        let Ok(md) = fs::symlink_metadata(p) else { return 0 };
        if md.is_dir() {
            fs::read_dir(p).map(|rd| rd.flatten().map(|e| walk(&e.path())).sum()).unwrap_or(0)
        } else {
            md.len()
        }
    }
    paths.iter().map(|p| walk(Path::new(p))).sum()
}

fn inside(dest: &Path, src: &Path) -> bool {
    let d = fs::canonicalize(dest).unwrap_or_else(|_| dest.to_path_buf());
    let s = fs::canonicalize(src).unwrap_or_else(|_| src.to_path_buf());
    d.starts_with(&s)
}

/// Sends an existing item to the Trash so "Replace" is always recoverable.
#[cfg(not(test))]
fn recycle(p: &Path) -> Res<()> {
    trash::delete(p).map_err(err)
}
#[cfg(test)]
fn recycle(p: &Path) -> Res<()> {
    // tests must not fill the real Recycle Bin
    if p.is_dir() { fs::remove_dir_all(p) } else { fs::remove_file(p) }.map_err(err)
}

/// Where `src` goes inside `dest` given the user's choice. `None` means "skip it".
fn resolve_target(
    src: &Path,
    dest: &Path,
    existing: &mut HashSet<String>,
    res: &Resolutions,
) -> Res<Option<PathBuf>> {
    let name = file_name_of(src)?;
    let same_dir = src.parent() == Some(dest);
    if !same_dir && existing.contains(&name) {
        match res.get(&src.to_string_lossy().into_owned()).copied().unwrap_or(Resolution::Keep) {
            Resolution::Skip => return Ok(None),
            Resolution::Replace => {
                recycle(&dest.join(&name))?;
                return Ok(Some(dest.join(name)));
            }
            Resolution::Keep => {}
        }
    }
    let unique = unique_name(&name, existing);
    existing.insert(unique.clone());
    Ok(Some(dest.join(unique)))
}

/// Items from `srcs` whose names already exist in `dest_dir` (excluding same-folder duplicates).
pub fn conflicts(srcs: &[String], dest_dir: &str) -> Res<Vec<Conflict>> {
    let dest = Path::new(dest_dir);
    let mut out = Vec::new();
    for s in srcs {
        let sp = Path::new(s);
        if sp.parent() == Some(dest) {
            continue;
        }
        let name = file_name_of(sp)?;
        let target = dest.join(&name);
        if let Ok(md) = fs::symlink_metadata(&target) {
            out.push(Conflict {
                src: s.clone(),
                name,
                src_is_dir: sp.is_dir(),
                existing_is_dir: md.is_dir(),
            });
        }
    }
    Ok(out)
}

pub fn copy_into(srcs: &[String], dest_dir: &str, res: &Resolutions, p: &mut dyn Progress) -> Res<Vec<Moved>> {
    let dest = Path::new(dest_dir);
    let mut existing = names_in(dest)?;
    let mut done = Vec::new();
    for s in srcs {
        let sp = Path::new(s);
        if inside(dest, sp) && sp.is_dir() {
            return Err("Cannot copy a folder into itself".into());
        }
        let Some(target) = resolve_target(sp, dest, &mut existing, res)? else { continue };
        copy_recursive(sp, &target, p)?;
        done.push(Moved { from: s.clone(), to: target.to_string_lossy().into_owned() });
    }
    Ok(done)
}

pub fn move_into(srcs: &[String], dest_dir: &str, res: &Resolutions, p: &mut dyn Progress) -> Res<Vec<Moved>> {
    let dest = Path::new(dest_dir);
    let mut existing = names_in(dest)?;
    let mut done = Vec::new();
    for s in srcs {
        let sp = Path::new(s);
        if sp.parent() == Some(dest) {
            continue;
        }
        if inside(dest, sp) {
            return Err("Cannot move a folder into itself".into());
        }
        let Some(target) = resolve_target(sp, dest, &mut existing, res)? else { continue };
        move_one(sp, &target, p)?;
        done.push(Moved { from: s.clone(), to: target.to_string_lossy().into_owned() });
    }
    Ok(done)
}

fn move_one(src: &Path, target: &Path, p: &mut dyn Progress) -> Res<()> {
    if fs::rename(src, target).is_ok() {
        return Ok(());
    }
    // e.g. across volumes: copy (with progress), then remove the original
    copy_recursive(src, target, p)?;
    if src.is_dir() { fs::remove_dir_all(src) } else { fs::remove_file(src) }.map_err(err)
}

/// Moves each `to` back to / onto `from` exactly (used to undo and redo moves).
pub fn rename_many(pairs: &[Moved]) -> Res<()> {
    for m in pairs {
        let (from, to) = (Path::new(&m.from), Path::new(&m.to));
        if exists(to) {
            return Err(format!("\"{}\" already exists", file_name_of(to)?));
        }
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(err)?;
        }
        move_one(from, to, &mut NoProgress)?;
    }
    Ok(())
}

// ---- duplicate files ---------------------------------------------------------

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DupGroup {
    pub size: u64,
    pub paths: Vec<String>,
}

/// SHA-256 of the first `limit` bytes of a file (all of it when `limit` is None).
fn hash_file(path: &Path, limit: Option<u64>, p: &mut dyn Progress) -> Res<[u8; 32]> {
    use sha2::{Digest, Sha256};
    let mut f = fs::File::open(path).map_err(err)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    let mut left = limit.unwrap_or(u64::MAX);
    while left > 0 {
        let want = buf.len().min(left.min(usize::MAX as u64) as usize);
        let n = f.read(&mut buf[..want]).map_err(err)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
        left -= n as u64;
        p.advance(n as u64, &path.to_string_lossy())?;
    }
    Ok(h.finalize().into())
}

/// Finds files under `root` with identical contents: same size, then same first 64 KB, then same
/// SHA-256 of the whole file. Empty files and symlinks are ignored. Biggest wasted space first.
pub fn find_duplicates(root: &str, p: &mut dyn Progress) -> Res<Vec<DupGroup>> {
    fn walk(dir: &Path, by_size: &mut HashMap<u64, Vec<PathBuf>>) {
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let Ok(md) = fs::symlink_metadata(e.path()) else { continue };
            if md.is_dir() {
                walk(&e.path(), by_size);
            } else if md.is_file() && md.len() > 0 {
                by_size.entry(md.len()).or_default().push(e.path());
            }
        }
    }
    let mut by_size = HashMap::new();
    walk(Path::new(root), &mut by_size);

    let mut groups = Vec::new();
    for (size, files) in by_size.into_iter().filter(|(_, f)| f.len() > 1) {
        let mut by_head: HashMap<[u8; 32], Vec<PathBuf>> = HashMap::new();
        for f in files {
            // unreadable files (permissions, in use) are simply left out
            match hash_file(&f, Some(64 * 1024), p) {
                Ok(h) => by_head.entry(h).or_default().push(f),
                Err(e) if e == CANCELLED => return Err(e),
                Err(_) => {}
            }
        }
        for same_head in by_head.into_values().filter(|f| f.len() > 1) {
            let mut by_full: HashMap<[u8; 32], Vec<PathBuf>> = HashMap::new();
            for f in same_head {
                match hash_file(&f, None, p) {
                    Ok(h) => by_full.entry(h).or_default().push(f),
                    Err(e) if e == CANCELLED => return Err(e),
                    Err(_) => {}
                }
            }
            for mut same in by_full.into_values().filter(|f| f.len() > 1) {
                same.sort();
                groups.push(DupGroup { size, paths: same.iter().map(|x| x.to_string_lossy().into_owned()).collect() });
            }
        }
    }
    groups.sort_by(|a, b| {
        let wa = a.size * (a.paths.len() as u64 - 1);
        let wb = b.size * (b.paths.len() as u64 - 1);
        wb.cmp(&wa).then_with(|| a.paths.cmp(&b.paths))
    });
    Ok(groups)
}

// ---- zip --------------------------------------------------------------------

/// Copies `from` into the archive entry that is currently open, reporting progress and honouring cancel.
fn zip_copy<R: Read, W: Write>(from: &mut R, to: &mut W, name: &str, p: &mut dyn Progress) -> Res<()> {
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = from.read(&mut buf).map_err(err)?;
        if n == 0 {
            return Ok(());
        }
        to.write_all(&buf[..n]).map_err(err)?;
        p.advance(n as u64, name)?;
    }
}

/// Adds `path` (a file, or a folder with everything in it) to the archive under `name`.
/// Symlinks are skipped so an archive never pulls in files from outside the selection.
fn zip_add<W: Write + std::io::Seek>(z: &mut zip::ZipWriter<W>, path: &Path, name: &str, p: &mut dyn Progress) -> Res<()> {
    use zip::write::SimpleFileOptions;
    let md = fs::symlink_metadata(path).map_err(err)?;
    if md.file_type().is_symlink() {
        return Ok(());
    }
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated).large_file(md.len() > u32::MAX as u64);
    if md.is_dir() {
        z.add_directory(format!("{name}/"), opts).map_err(err)?;
        let mut kids: Vec<_> = fs::read_dir(path).map_err(err)?.flatten().collect();
        kids.sort_by_key(|k| k.file_name());
        for k in kids {
            zip_add(z, &k.path(), &format!("{name}/{}", k.file_name().to_string_lossy()), p)?;
        }
    } else {
        z.start_file(name, opts).map_err(err)?;
        let mut f = fs::File::open(path).map_err(err)?;
        zip_copy(&mut f, z, name, p)?;
    }
    Ok(())
}

/// Zips `paths` into a new archive next to the first one and returns its path. One item gives
/// "<name>.zip", several give "Archive.zip"; an existing archive is never overwritten. If the
/// operation fails or is cancelled the half-written archive is removed.
pub fn compress(paths: &[String], p: &mut dyn Progress) -> Res<String> {
    let first = Path::new(paths.first().ok_or("Nothing to compress")?);
    let parent = first.parent().ok_or("Invalid path")?;
    let base = if paths.len() == 1 {
        let n = file_name_of(first)?;
        if first.is_dir() { n } else { Path::new(&n).file_stem().map(|x| x.to_string_lossy().into_owned()).unwrap_or(n) }
    } else {
        "Archive".to_string()
    };
    let target = parent.join(unique_name(&format!("{base}.zip"), &names_in(parent)?));
    p.set_total(total_size(paths));
    let result = (|| -> Res<()> {
        let mut z = zip::ZipWriter::new(fs::File::create(&target).map_err(err)?);
        for item in paths {
            let item = Path::new(item);
            zip_add(&mut z, item, &file_name_of(item)?, p)?;
        }
        z.finish().map_err(err)?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&target);
        return Err(e);
    }
    Ok(target.to_string_lossy().into_owned())
}

/// Extracts a .zip into a new folder named after it (next to the archive) and returns that folder.
/// Entries that would land outside the folder (".." or absolute paths) and symlinks are skipped.
/// If the operation fails or is cancelled the half-extracted folder is removed.
pub fn extract(zip_path: &str, p: &mut dyn Progress) -> Res<String> {
    let zp = Path::new(zip_path);
    let parent = zp.parent().ok_or("Invalid path")?;
    let stem = zp.file_stem().map(|x| x.to_string_lossy().into_owned()).ok_or("Invalid path")?;
    let mut archive = zip::ZipArchive::new(fs::File::open(zp).map_err(err)?).map_err(|e| format!("Not a valid zip file: {e}"))?;
    let mut total = 0;
    for i in 0..archive.len() {
        total += archive.by_index_raw(i).map_err(err)?.size();
    }
    p.set_total(total);
    let dest = parent.join(unique_name(&stem, &names_in(parent)?));
    fs::create_dir(&dest).map_err(err)?;
    let result = (|| -> Res<()> {
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(err)?;
            let Some(rel) = entry.enclosed_name() else { continue };
            if entry.is_symlink() {
                continue;
            }
            let out = dest.join(&rel);
            if entry.is_dir() {
                fs::create_dir_all(&out).map_err(err)?;
                continue;
            }
            if let Some(dir) = out.parent() {
                fs::create_dir_all(dir).map_err(err)?;
            }
            let mut f = fs::File::create(&out).map_err(err)?;
            zip_copy(&mut entry, &mut f, &rel.to_string_lossy(), p)?;
        }
        Ok(())
    })();
    if let Err(e) = result {
        let _ = fs::remove_dir_all(&dest);
        return Err(e);
    }
    Ok(dest.to_string_lossy().into_owned())
}

// ---- rename / create ------------------------------------------------------

pub fn rename(path: &str, new_name: &str) -> Res<String> {
    if new_name.trim().is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err("Invalid name".into());
    }
    let p = Path::new(path);
    let target = p.parent().ok_or("Invalid path")?.join(new_name);
    let case_only = file_name_of(p)?.eq_ignore_ascii_case(new_name);
    if exists(&target) && !case_only {
        return Err("A file with that name already exists".into());
    }
    fs::rename(p, &target).map_err(err)?;
    Ok(target.to_string_lossy().into_owned())
}

pub fn make_dir(dir: &str, name: &str) -> Res<String> {
    let d = Path::new(dir);
    let n = unique_name(name, &names_in(d)?);
    fs::create_dir(d.join(&n)).map_err(err)?;
    Ok(d.join(n).to_string_lossy().into_owned())
}

pub fn new_file(dir: &str, name: &str) -> Res<String> {
    let d = Path::new(dir);
    let n = unique_name(name, &names_in(d)?);
    fs::write(d.join(&n), b"").map_err(err)?;
    Ok(d.join(n).to_string_lossy().into_owned())
}

/// Recreates an empty folder or file at an exact path (redo of "new folder" / "new file").
pub fn create_exact(path: &str, is_dir: bool) -> Res<()> {
    let p = Path::new(path);
    if exists(p) {
        return Err("Already exists".into());
    }
    if is_dir { fs::create_dir(p) } else { fs::write(p, b"") }.map_err(err)
}

// ---- search ---------------------------------------------------------------

pub fn search(root: &str, query: &str, limit: usize) -> Vec<Hit> {
    let q = query.to_lowercase();
    let mut hits = Vec::new();
    let mut stack = vec![PathBuf::from(root)];
    while let Some(d) = stack.pop() {
        if hits.len() >= limit {
            break;
        }
        let Ok(rd) = fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false); // symlinks are not followed
            if name.to_lowercase().contains(&q) {
                hits.push(Hit { name, path: e.path().to_string_lossy().into_owned(), is_dir });
            }
            if is_dir {
                stack.push(e.path());
            }
            if hits.len() >= limit {
                break;
            }
        }
    }
    hits
}

// ---- properties and preview -----------------------------------------------

pub fn properties(path: &str) -> Res<Props> {
    let p = Path::new(path);
    let lmd = fs::symlink_metadata(p).map_err(err)?;
    let is_symlink = lmd.file_type().is_symlink();
    let md = fs::metadata(p).unwrap_or_else(|_| lmd.clone());
    let name = file_name_of(p).unwrap_or_else(|_| path.to_string());
    let is_dir = md.is_dir();
    Ok(Props {
        ext: if is_dir { String::new() } else { ext_of(&name) },
        parent: p.parent().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default(),
        symlink_target: if is_symlink { fs::read_link(p).ok().map(|t| t.to_string_lossy().into_owned()) } else { None },
        size: if is_dir { 0 } else { md.len() },
        items: if is_dir { fs::read_dir(p).ok().map(|rd| rd.flatten().count() as u64) } else { None },
        mtime: millis(md.modified()),
        ctime: millis(md.created()),
        atime: millis(md.accessed()),
        readonly: md.permissions().readonly(),
        hidden: name.starts_with('.') || is_hidden_attr(&lmd),
        name,
        path: path.to_string(),
        is_dir,
        is_symlink,
    })
}

/// Recursive size and counts for a folder (symlinks not followed).
pub fn dir_stats(path: &str) -> DirStats {
    fn walk(p: &Path, s: &mut DirStats) {
        let Ok(rd) = fs::read_dir(p) else { return };
        for e in rd.flatten() {
            let Ok(md) = fs::symlink_metadata(e.path()) else { continue };
            if md.is_dir() {
                s.folders += 1;
                walk(&e.path(), s);
            } else {
                s.files += 1;
                s.size += md.len();
            }
        }
    }
    let mut s = DirStats::default();
    walk(Path::new(path), &mut s);
    s
}

/// First `max_bytes` of a file as text, or `None` if it looks binary.
pub fn text_preview(path: &str, max_bytes: usize) -> Res<Option<String>> {
    let mut buf = Vec::new();
    fs::File::open(path).map_err(err)?.take(max_bytes as u64).read_to_end(&mut buf).map_err(err)?;
    if buf.contains(&0) {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&buf).into_owned();
    let bad = text.chars().filter(|c| *c == '\u{FFFD}').count();
    // an incomplete multi-byte character at the cut-off is fine; many bad characters means binary
    if bad > 2 && bad * 50 > text.chars().count() {
        return Ok(None);
    }
    Ok(Some(text))
}

// ---- places ---------------------------------------------------------------

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct DiskSpace {
    pub free: u64,
    pub total: u64,
}

/// Free and total space of the volume that holds `path` (free = what a normal user can still use).
pub fn disk_space(path: &str) -> Res<DiskSpace> {
    Ok(DiskSpace { free: fs4::available_space(path).map_err(err)?, total: fs4::total_space(path).map_err(err)? })
}

pub fn drives() -> Vec<Place> {
    let os = std::env::consts::OS;
    if os == "windows" {
        return ('A'..='Z')
            .filter(|c| Path::new(&format!("{c}:\\")).exists())
            .map(|c| Place { name: format!("{c}:"), path: format!("{c}:\\") })
            .collect();
    }
    let mut v = vec![Place {
        name: if os == "macos" { "Macintosh HD".into() } else { "File System".into() },
        path: "/".into(),
    }];
    let mounts = if os == "macos" { "/Volumes" } else { "/mnt" };
    if let Ok(rd) = fs::read_dir(mounts) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            // /Volumes/Macintosh HD is just a link back to "/"
            if os == "macos" && name == "Macintosh HD" {
                continue;
            }
            v.push(Place { name, path: e.path().to_string_lossy().into_owned() });
        }
    }
    v
}

pub fn quick_access(home: &Path) -> Vec<Place> {
    let videos = if std::env::consts::OS == "macos" { "Movies" } else { "Videos" };
    [("Home", ""), ("Desktop", "Desktop"), ("Documents", "Documents"), ("Downloads", "Downloads"),
     ("Pictures", "Pictures"), ("Music", "Music"), ("Videos", videos)]
        .iter()
        .map(|(n, sub)| Place {
            name: n.to_string(),
            path: if sub.is_empty() { home.to_path_buf() } else { home.join(sub) }.to_string_lossy().into_owned(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "ex-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&d).unwrap();
        d
    }
    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }
    fn none() -> Resolutions {
        Resolutions::new()
    }
    fn read(p: &Path) -> String {
        fs::read_to_string(p).unwrap()
    }

    #[test]
    fn full_flow() {
        let d = tmp();
        fs::write(d.join("a.txt"), "hi").unwrap();
        fs::create_dir(d.join("sub")).unwrap();

        let mut names: Vec<_> = list_dir(&s(&d), false).unwrap().into_iter().map(|e| e.name).collect();
        names.sort();
        assert_eq!(names, ["a.txt", "sub"]);

        // duplicating next to the original keeps both
        let dup = copy_into(&[s(&d.join("a.txt"))], &s(&d), &none(), &mut NoProgress).unwrap();
        assert_eq!(dup[0].to, s(&d.join("a (2).txt")));
        assert!(d.join("a (2).txt").exists());

        let moved = move_into(&[s(&d.join("a (2).txt"))], &s(&d.join("sub")), &none(), &mut NoProgress).unwrap();
        assert_eq!(moved, [Moved { from: s(&d.join("a (2).txt")), to: s(&d.join("sub").join("a (2).txt")) }]);
        assert!(!d.join("a (2).txt").exists());

        assert!(move_into(&[s(&d.join("sub"))], &s(&d.join("sub")), &none(), &mut NoProgress).unwrap_err().contains("itself"));
        assert!(copy_into(&[s(&d.join("sub"))], &s(&d.join("sub")), &none(), &mut NoProgress).unwrap_err().contains("itself"));

        rename(&s(&d.join("a.txt")), "b.txt").unwrap();
        assert!(rename(&s(&d.join("b.txt")), "sub").unwrap_err().contains("exists"));
        assert!(rename(&s(&d.join("b.txt")), "x/y").is_err());
        rename(&s(&d.join("b.txt")), "B.txt").unwrap(); // case-only rename is allowed

        assert_eq!(search(&s(&d), "a (2)", 500).len(), 1);
        assert_eq!(Path::new(&make_dir(&s(&d), "New folder").unwrap()).file_name().unwrap(), "New folder");
        assert_eq!(Path::new(&make_dir(&s(&d), "New folder").unwrap()).file_name().unwrap(), "New folder (2)");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn hidden_and_unique() {
        let d = tmp();
        fs::write(d.join(".secret"), "").unwrap();
        fs::write(d.join("vis"), "").unwrap();
        assert_eq!(list_dir(&s(&d), false).unwrap().len(), 1);
        assert_eq!(list_dir(&s(&d), true).unwrap().len(), 2);

        let ex: HashSet<String> = ["a.tar.gz".to_string(), "a.tar (2).gz".to_string()].into();
        assert_eq!(unique_name("a.tar.gz", &ex), "a.tar (3).gz");
        assert_eq!(unique_name("fresh", &ex), "fresh");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn conflict_resolutions() {
        let d = tmp();
        let (src, dst) = (d.join("src"), d.join("dst"));
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dst).unwrap();
        for (dir, text) in [(&src, "new"), (&dst, "old")] {
            fs::write(dir.join("a.txt"), text).unwrap();
        }
        fs::write(src.join("b.txt"), "new-b").unwrap();
        fs::write(dst.join("b.txt"), "old-b").unwrap();
        fs::write(src.join("c.txt"), "new-c").unwrap(); // no conflict
        let all = [s(&src.join("a.txt")), s(&src.join("b.txt")), s(&src.join("c.txt"))];

        let found = conflicts(&all, &s(&dst)).unwrap();
        assert_eq!(found.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["a.txt", "b.txt"]);
        // copying into the folder the items already live in is a duplicate, not a conflict
        assert!(conflicts(&all, &s(&src)).unwrap().is_empty());

        let mut res = Resolutions::new();
        res.insert(all[0].clone(), Resolution::Replace);
        res.insert(all[1].clone(), Resolution::Skip);
        let done = copy_into(&all, &s(&dst), &res, &mut NoProgress).unwrap();
        assert_eq!(read(&dst.join("a.txt")), "new"); // replaced
        assert_eq!(read(&dst.join("b.txt")), "old-b"); // skipped
        assert_eq!(read(&dst.join("c.txt")), "new-c"); // copied
        assert_eq!(done.len(), 2); // skipped item is not reported

        // default is keep-both
        copy_into(&[all[1].clone()], &s(&dst), &none(), &mut NoProgress).unwrap();
        assert_eq!(read(&dst.join("b (2).txt")), "new-b");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn undo_moves_and_exact_create() {
        let d = tmp();
        fs::create_dir(d.join("sub")).unwrap();
        fs::write(d.join("a.txt"), "x").unwrap();
        let moved = move_into(&[s(&d.join("a.txt"))], &s(&d.join("sub")), &none(), &mut NoProgress).unwrap();
        let inverse: Vec<Moved> = moved.iter().map(|m| Moved { from: m.to.clone(), to: m.from.clone() }).collect();
        rename_many(&inverse).unwrap();
        assert!(d.join("a.txt").exists() && !d.join("sub").join("a.txt").exists());
        // refuses to overwrite
        fs::write(d.join("sub").join("a.txt"), "y").unwrap();
        assert!(rename_many(&moved).unwrap_err().contains("already exists"));

        create_exact(&s(&d.join("made")), true).unwrap();
        assert!(d.join("made").is_dir());
        assert!(create_exact(&s(&d.join("made")), true).is_err());
        fs::remove_dir_all(d).unwrap();
    }

    struct CancelAfter(u64, u64);
    impl Progress for CancelAfter {
        fn advance(&mut self, bytes: u64, _: &str) -> Res<()> {
            self.1 += bytes;
            if self.1 >= self.0 { Err(CANCELLED.into()) } else { Ok(()) }
        }
    }

    #[test]
    fn progress_and_cancel() {
        let d = tmp();
        fs::create_dir(d.join("out")).unwrap();
        fs::write(d.join("big.bin"), vec![7u8; 3 << 20]).unwrap(); // three 1 MiB chunks
        assert_eq!(total_size(&[s(&d.join("big.bin"))]), 3 << 20);

        struct Count(u64);
        impl Progress for Count {
            fn advance(&mut self, b: u64, _: &str) -> Res<()> { self.0 += b; Ok(()) }
        }
        let mut c = Count(0);
        copy_into(&[s(&d.join("big.bin"))], &s(&d.join("out")), &none(), &mut c).unwrap();
        assert_eq!(c.0, 3 << 20);

        fs::remove_file(d.join("out").join("big.bin")).unwrap();
        let err = copy_into(&[s(&d.join("big.bin"))], &s(&d.join("out")), &none(), &mut CancelAfter(1 << 20, 0)).unwrap_err();
        assert_eq!(err, CANCELLED);
        assert!(!d.join("out").join("big.bin").exists(), "partial copy must be removed");
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn properties_stats_and_preview() {
        let d = tmp();
        fs::create_dir(d.join("dir")).unwrap();
        fs::write(d.join("dir").join("one.txt"), "hello").unwrap();
        fs::create_dir(d.join("dir").join("inner")).unwrap();
        fs::write(d.join("dir").join("inner").join("two.txt"), "world!!").unwrap();

        let p = properties(&s(&d.join("dir").join("one.txt"))).unwrap();
        assert_eq!((p.name.as_str(), p.ext.as_str(), p.size, p.is_dir), ("one.txt", "txt", 5, false));
        let p = properties(&s(&d.join("dir"))).unwrap();
        assert!(p.is_dir);
        assert_eq!(p.items, Some(2));
        assert_eq!(dir_stats(&s(&d.join("dir"))), DirStats { size: 12, files: 2, folders: 1 });

        assert_eq!(text_preview(&s(&d.join("dir").join("one.txt")), 1024).unwrap().as_deref(), Some("hello"));
        assert_eq!(text_preview(&s(&d.join("dir").join("one.txt")), 3).unwrap().as_deref(), Some("hel"));
        fs::write(d.join("bin.dat"), [0u8, 1, 2, 255, 0]).unwrap();
        assert_eq!(text_preview(&s(&d.join("bin.dat")), 1024).unwrap(), None);
        fs::remove_dir_all(d).unwrap();
    }
    #[test]
    fn disk_space_of_a_folder() {
        let d = tmp();
        let sp = disk_space(&s(&d)).unwrap();
        assert!(sp.total > 0 && sp.free <= sp.total);
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn zip_round_trip() {
        let d = tmp();
        fs::create_dir_all(d.join("proj").join("inner")).unwrap();
        fs::write(d.join("proj").join("a.txt"), "alpha").unwrap();
        fs::write(d.join("proj").join("inner").join("b.txt"), "beta").unwrap();
        fs::write(d.join("solo.txt"), "solo").unwrap();

        let z1 = compress(&[s(&d.join("proj"))], &mut NoProgress).unwrap();
        assert_eq!(Path::new(&z1).file_name().unwrap(), "proj.zip");
        assert_eq!(Path::new(&compress(&[s(&d.join("proj"))], &mut NoProgress).unwrap()).file_name().unwrap(), "proj (2).zip");
        let z2 = compress(&[s(&d.join("solo.txt")), s(&d.join("proj"))], &mut NoProgress).unwrap();
        assert_eq!(Path::new(&z2).file_name().unwrap(), "Archive.zip");

        let out = extract(&z1, &mut NoProgress).unwrap();
        assert_eq!(Path::new(&out).file_name().unwrap(), "proj (2)");
        assert_eq!(read(&Path::new(&out).join("proj").join("inner").join("b.txt")), "beta");
        let out2 = extract(&z2, &mut NoProgress).unwrap();
        assert_eq!(read(&Path::new(&out2).join("solo.txt")), "solo");
        assert!(extract(&s(&d.join("solo.txt")), &mut NoProgress).is_err());
        fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn zip_progress_and_cancel() {
        struct Totals {
            total: u64,
            done: u64,
        }
        impl Progress for Totals {
            fn advance(&mut self, b: u64, _: &str) -> Res<()> {
                self.done += b;
                Ok(())
            }
            fn set_total(&mut self, t: u64) {
                self.total = t;
            }
        }
        let d = tmp();
        fs::write(d.join("big.bin"), vec![3u8; 600_000]).unwrap();
        let mut t = Totals { total: 0, done: 0 };
        let z = compress(&[s(&d.join("big.bin"))], &mut t).unwrap();
        assert_eq!((t.total, t.done), (600_000, 600_000));
        let mut t = Totals { total: 0, done: 0 };
        extract(&z, &mut t).unwrap();
        assert_eq!((t.total, t.done), (600_000, 600_000));

        // cancelling removes the partial result and leaves no stray files behind
        let mut before: Vec<_> = names_in(&d).unwrap().into_iter().collect();
        assert_eq!(compress(&[s(&d.join("big.bin"))], &mut CancelAfter(100_000, 0)).unwrap_err(), CANCELLED);
        assert_eq!(extract(&z, &mut CancelAfter(100_000, 0)).unwrap_err(), CANCELLED);
        let mut after: Vec<_> = names_in(&d).unwrap().into_iter().collect();
        before.sort();
        after.sort();
        assert_eq!(before, after);
        fs::remove_dir_all(d).unwrap();
    }
    #[test]
    fn finds_duplicates() {
        let d = tmp();
        fs::create_dir(d.join("sub")).unwrap();
        fs::write(d.join("a.txt"), "same content").unwrap();
        fs::write(d.join("sub").join("copy.txt"), "same content").unwrap();
        fs::write(d.join("other.txt"), "same lengtH").unwrap(); // same size, different bytes
        fs::write(d.join("empty1"), "").unwrap();
        fs::write(d.join("empty2"), "").unwrap();
        let big = vec![7u8; 200_000];
        let mut big2 = big.clone();
        *big2.last_mut().unwrap() = 8; // differs only after the quick-hash window
        fs::write(d.join("big1.bin"), &big).unwrap();
        fs::write(d.join("big2.bin"), &big2).unwrap();
        fs::write(d.join("big3.bin"), &big).unwrap();

        let g = find_duplicates(&s(&d), &mut NoProgress).unwrap();
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].size, 200_000);
        assert_eq!(g[0].paths, [s(&d.join("big1.bin")), s(&d.join("big3.bin"))]);
        assert_eq!(g[1].paths, [s(&d.join("a.txt")), s(&d.join("sub").join("copy.txt"))]);
        fs::remove_dir_all(d).unwrap();
    }
}
