use crate::application::Application;
use crate::layout::{app_folder, install_root_of, newest_runnable, STAGING_SUFFIX};
use crate::lifecycle::LaunchFlags;
use crate::process::ExitPolicy;
use crate::retry::{remove_dir_all_with_retry, rename_with_retry, Backoff};
use crate::version::Version;
use crate::{APP_DIRECTORY_ENV, INSTALL_ROOT_ENV};
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::Duration;

/// An install root and the app that lives in it. The root's own copy of the
/// launcher calls [`Launcher::forward`]; an update calls
/// [`Launcher::apply`](crate::ApplyRequest)
pub struct Launcher<A: Application> {
    pub(crate) application: A,
    pub(crate) root: PathBuf,
    /// How long a started version has to fail before it counts as started
    pub startup_timeout: Duration,
    /// How long a hook (`Updated`, `Obsolete`) may run
    pub hook_timeout: Duration,
    /// How a running instance is asked to exit, and when it is killed
    pub exit_policy: ExitPolicy,
    /// The delays between the retries of a file operation Windows may have locked
    pub backoff: Backoff,
}

impl<A: Application> Launcher<A> {
    /// A launcher for the install at `root`, with the default timeouts
    pub fn new(application: A, root: PathBuf) -> Self {
        Self {
            application,
            root,
            startup_timeout: Duration::from_secs(10),
            hook_timeout: Duration::from_secs(15),
            exit_policy: ExitPolicy::DEFAULT,
            backoff: Backoff::DEFAULT,
        }
    }

    /// The launcher for the install `executable` belongs to: its folder when
    /// that is the root, the parent when it is a version folder
    pub fn for_executable(application: A, executable: &Path) -> Option<Self> {
        let folder = executable.parent()?;
        let root = install_root_of(folder).unwrap_or_else(|| folder.to_path_buf());
        Some(Self::new(application, root))
    }

    /// The install root
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The application this launcher starts
    pub fn application(&self) -> &A {
        &self.application
    }

    pub(crate) fn spawn(
        &self,
        version: Version,
        arguments: &[String],
        flags: LaunchFlags,
    ) -> io::Result<Child> {
        let folder = app_folder(&self.root, version);
        let mut command = Command::new(folder.join(self.application.executable_name()));
        command
            .args(arguments)
            .current_dir(&folder)
            .env(INSTALL_ROOT_ENV, &self.root)
            .env(APP_DIRECTORY_ENV, &folder)
            .envs(self.application.environment());
        flags.apply_to(&mut command);
        command.spawn()
    }

    /// The stub: starts the newest version that can run, with the arguments
    /// passed through. The caller ends, or waits on the child, as it likes
    pub fn forward(&self, arguments: &[String], flags: LaunchFlags) -> io::Result<Child> {
        let Some((version, _)) = newest_runnable(&self.root, self.application.executable_name())
        else {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!(
                    "no app-x.y.z folder with {} under {}",
                    self.application.executable_name(),
                    self.root.display()
                ),
            ));
        };
        self.spawn(version, arguments, flags)
    }

    /// Renames the unpacked `app-x.y.z.staging` folder into place as the last
    /// step of an update, replacing a half-finished folder of the same version
    pub fn promote_staging(&self, version: Version) -> io::Result<()> {
        let destination = app_folder(&self.root, version);
        let staging = PathBuf::from(format!("{}{STAGING_SUFFIX}", destination.display()));
        remove_dir_all_with_retry(self.backoff, &destination)?;
        rename_with_retry(self.backoff, &staging, &destination)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{version_folder, TempDir};

    struct Plain;

    impl Application for Plain {
        fn executable_name(&self) -> &'static str {
            "app.exe"
        }

        fn environment(&self) -> Vec<(String, String)> {
            vec![("APP_EXTRA".to_string(), "yes".to_string())]
        }
    }

    fn arguments(list: &[&str]) -> Vec<String> {
        list.iter().map(ToString::to_string).collect()
    }

    #[test]
    fn forwards_the_arguments_to_the_newest_version_and_sets_the_environment() {
        let temp = TempDir::new();
        version_folder(temp.path(), "1.2.0", "app.exe");
        let newest = version_folder(temp.path(), "1.10.0", "app.exe");
        let launcher = Launcher::new(Plain, temp.path().to_path_buf());
        let script = "echo %WINUI_SVELTE_APP_DIR%;%WINUI_SVELTE_INSTALL_ROOT%;%APP_EXTRA%;%WINUI_SVELTE_FIRST_RUN% > out.txt";
        let flags = LaunchFlags {
            is_first_run: true,
            is_restarted: false,
        };
        let mut child = launcher
            .forward(&arguments(&["/v:off", "/c", script]), flags)
            .unwrap();
        assert!(child.wait().unwrap().success());
        let output = std::fs::read_to_string(newest.join("out.txt")).unwrap();
        let expected = format!("{};{};yes;1", newest.display(), temp.path().display());
        assert_eq!(output.trim(), expected);
    }

    #[test]
    fn nothing_to_start_is_not_found() {
        let temp = TempDir::new();
        std::fs::create_dir(temp.path().join("app-1.0.0.staging")).unwrap();
        let error =
            Launcher::new(Plain, temp.path().to_path_buf()).forward(&[], LaunchFlags::default());
        assert_eq!(error.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn the_root_is_found_from_the_stub_or_from_a_version() {
        let root = Path::new(r"C:\Users\a\App");
        let from_stub = Launcher::for_executable(Plain, &root.join("app.exe")).unwrap();
        let from_version =
            Launcher::for_executable(Plain, &root.join("app-1.0.0").join("app.exe")).unwrap();
        assert_eq!(from_stub.root(), root);
        assert_eq!(from_version.root(), root);
    }

    #[test]
    fn promotes_a_staging_folder_over_a_half_finished_one() {
        let temp = TempDir::new();
        let version = Version::new(2, 0, 0);
        std::fs::create_dir_all(temp.path().join("app-2.0.0").join("old")).unwrap();
        std::fs::create_dir_all(temp.path().join("app-2.0.0.staging").join("new")).unwrap();
        Launcher::new(Plain, temp.path().to_path_buf())
            .promote_staging(version)
            .unwrap();
        assert!(temp.path().join("app-2.0.0").join("new").is_dir());
        assert!(!temp.path().join("app-2.0.0").join("old").exists());
        assert!(!temp.path().join("app-2.0.0.staging").exists());
    }
}
