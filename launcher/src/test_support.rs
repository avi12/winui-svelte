use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

static COUNTER: AtomicU32 = AtomicU32::new(0);

pub(crate) struct TempDir(PathBuf);

impl TempDir {
    pub(crate) fn new() -> Self {
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path =
            std::env::temp_dir().join(format!("winui-svelte-launcher-{}-{id}", std::process::id()));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    pub(crate) fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// A version folder holding `executable_name`, a copy of `cmd.exe`: a real
/// program that takes arguments and exits with a code the test controls
pub(crate) fn version_folder(root: &Path, version: &str, executable_name: &str) -> PathBuf {
    let folder = root.join(format!("app-{version}"));
    std::fs::create_dir_all(&folder).unwrap();
    let system =
        std::env::var_os("SystemRoot").map_or_else(|| PathBuf::from(r"C:\Windows"), PathBuf::from);
    std::fs::copy(
        system.join("System32").join("cmd.exe"),
        folder.join(executable_name),
    )
    .unwrap();
    folder
}
