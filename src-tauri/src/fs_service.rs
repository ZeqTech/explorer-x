//! Filesystem operations behind the UI. Pure std, so they are unit-testable without Tauri.

use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

type Res<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

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
        let ext = if is_dir {
            String::new()
        } else {
            Path::new(&name)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        };
        out.push(Entry {
            path: ent.path().to_string_lossy().into_owned(),
            size: if is_dir { None } else { Some(md.len()) },
            mtime: millis(md.modified()),
            ctime: millis(md.created()),
            name,
            is_dir,
            ext,
            hidden,
        });
    }
    Ok(out)
}

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

fn copy_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for e in fs::read_dir(src)? {
            let e = e?;
            copy_recursive(&e.path(), &dst.join(e.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ())
    }
}

fn inside(dest: &Path, src: &Path) -> bool {
    let d = fs::canonicalize(dest).unwrap_or_else(|_| dest.to_path_buf());
    let s = fs::canonicalize(src).unwrap_or_else(|_| src.to_path_buf());
    d.starts_with(&s)
}

fn file_name_of(p: &Path) -> Res<String> {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).ok_or_else(|| format!("Invalid path: {}", p.display()))
}

pub fn copy_into(srcs: &[String], dest_dir: &str) -> Res<()> {
    let dest = Path::new(dest_dir);
    let mut existing = names_in(dest)?;
    for s in srcs {
        let s = Path::new(s);
        if inside(dest, s) {
            return Err("Cannot copy a folder into itself".into());
        }
        let name = unique_name(&file_name_of(s)?, &existing);
        existing.insert(name.clone());
        copy_recursive(s, &dest.join(name)).map_err(err)?;
    }
    Ok(())
}

pub fn move_into(srcs: &[String], dest_dir: &str) -> Res<()> {
    let dest = Path::new(dest_dir);
    let mut existing = names_in(dest)?;
    for s in srcs {
        let s = Path::new(s);
        if s.parent() == Some(dest) {
            continue;
        }
        if inside(dest, s) {
            return Err("Cannot move a folder into itself".into());
        }
        let name = unique_name(&file_name_of(s)?, &existing);
        existing.insert(name.clone());
        let target = dest.join(name);
        if fs::rename(s, &target).is_err() {
            // e.g. across volumes: copy then remove
            copy_recursive(s, &target).map_err(err)?;
            if s.is_dir() { fs::remove_dir_all(s) } else { fs::remove_file(s) }.map_err(err)?;
        }
    }
    Ok(())
}

pub fn rename(path: &str, new_name: &str) -> Res<String> {
    if new_name.trim().is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err("Invalid name".into());
    }
    let p = Path::new(path);
    let target = p.parent().ok_or("Invalid path")?.join(new_name);
    let case_only = file_name_of(p)?.eq_ignore_ascii_case(new_name);
    if fs::symlink_metadata(&target).is_ok() && !case_only {
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
            let ft = e.file_type().ok();
            let is_dir = ft.map(|t| t.is_dir()).unwrap_or(false); // symlinks are not followed
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

    #[test]
    fn full_flow() {
        let d = tmp();
        fs::write(d.join("a.txt"), "hi").unwrap();
        fs::create_dir(d.join("sub")).unwrap();

        let mut names: Vec<_> = list_dir(&s(&d), false).unwrap().into_iter().map(|e| e.name).collect();
        names.sort();
        assert_eq!(names, ["a.txt", "sub"]);

        copy_into(&[s(&d.join("a.txt"))], &s(&d)).unwrap();
        assert!(d.join("a (2).txt").exists());

        move_into(&[s(&d.join("a (2).txt"))], &s(&d.join("sub"))).unwrap();
        assert!(d.join("sub").join("a (2).txt").exists());
        assert!(!d.join("a (2).txt").exists());

        let e = move_into(&[s(&d.join("sub"))], &s(&d.join("sub"))).unwrap_err();
        assert!(e.contains("itself"));
        let e = copy_into(&[s(&d.join("sub"))], &s(&d.join("sub"))).unwrap_err();
        assert!(e.contains("itself"));

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
}
