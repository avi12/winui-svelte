use crate::lifecycle::LifecycleEvent;
use crate::version::Version;
use std::io;

/// What differs per app; everything else is the crate's
pub trait Application {
    /// The program inside each `app-x.y.z` folder that the launcher starts,
    /// such as `anystt.exe`
    fn executable_name(&self) -> &str;

    /// Runs the app's side of an install, update or uninstall: a shortcut, an
    /// Add or remove programs entry, a startup entry. Runs inside the version
    /// that is the subject of the event (see [`LifecycleEvent`])
    fn on_lifecycle(&self, _event: LifecycleEvent, _version: &Version) -> io::Result<()> {
        Ok(())
    }

    /// Asks the running app to end cleanly (a tray icon to remove, a window to
    /// close) before an update kills it; return at once, the launcher waits
    fn request_exit(&self, _pid: u32) {}

    /// Extra environment for the started app, beside the crate's own variables
    fn environment(&self) -> Vec<(String, String)> {
        Vec::new()
    }
}
