//! The per-user install that winui-svelte's `Updater` and `createRelease`
//! speak: one install root holding a stable launcher and one `app-x.y.z`
//! folder per version. This crate is the Rust half of it, so an app's launcher
//! is a few lines: implement [`Application`] and call [`Launcher`].

mod application;
mod apply;
mod launch;
mod layout;
mod lifecycle;
mod lock;
mod process;
mod retry;
#[cfg(test)]
mod test_support;
mod version;

pub use application::Application;
pub use apply::{ApplyOutcome, ApplyRequest, APPLY_SWITCH};
pub use launch::Launcher;
pub use layout::{
    app_folder, install_root_of, installed_versions, is_bad, mark_bad, newest_runnable, BAD_MARKER,
    PACKAGES_FOLDER, STAGING_SUFFIX,
};
pub use lifecycle::{
    dispatch, run_hook, LaunchFlags, LifecycleEvent, FIRST_RUN_ENV, RESTARTED_ENV,
};
pub use lock::{InstallLock, LockError, LOCK_FILE};
pub use process::{ensure_exited, is_alive, terminate, ExitOutcome, ExitPolicy};
pub use retry::{is_locked, remove_dir_all_with_retry, rename_with_retry, retry, Backoff};
pub use version::{Version, VersionError};

/// Set on every child the launcher starts: the install root
pub const INSTALL_ROOT_ENV: &str = "WINUI_SVELTE_INSTALL_ROOT";
/// Set on every child the launcher starts: the `app-x.y.z` folder it runs from
pub const APP_DIRECTORY_ENV: &str = "WINUI_SVELTE_APP_DIR";
