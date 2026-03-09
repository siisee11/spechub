use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;

pub fn files_with_extension(root: &Path, extension: &str) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    walk(root, &mut |path| {
        if path.extension().and_then(|value| value.to_str()) == Some(extension) {
            files.push(path.to_path_buf());
        }
    })?;
    Ok(files)
}

pub fn script_and_source_files(root: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    walk(root, &mut |path| {
        let extension = path.extension().and_then(|value| value.to_str());
        if matches!(extension, Some("rs" | "mts" | "sh")) {
            files.push(path.to_path_buf());
        }
    })?;
    Ok(files)
}

fn walk(root: &Path, visitor: &mut dyn FnMut(&Path)) -> Result<()> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if matches!(
            name.as_ref(),
            ".git" | ".worktree" | "target" | "node_modules"
        ) {
            continue;
        }
        if path.is_dir() {
            walk(&path, visitor)?;
        } else {
            visitor(&path);
        }
    }
    Ok(())
}
