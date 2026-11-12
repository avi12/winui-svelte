use crate::application::Application;
use crate::launch::Launcher;
use crate::layout::{app_folder, mark_bad, runnable_versions};
use crate::lifecycle::{run_hook, LaunchFlags, LifecycleEvent};
use crate::lock::InstallLock;
use crate::process::{ensure_exited, ExitOutcome};
use crate::version::Version;
use std::io;
use std::process::Child;
use std::thread::sleep;
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// What an update hands the launcher once the new version is unpacked
#[derive(Debug, Clone, Default)]
pub struct ApplyRequest {
    /// The running app to replace; the launcher waits for it, asks it to end,
    /// then kills it
    pub parent_pid: Option<u32>,
    /// Passed through to the version that starts
    pub arguments: Vec<String>,
    /// Run the `Updated` and `Obsolete` hooks around the swap
    pub should_run_hooks: bool,
}

#[derive(Debug)]
pub enum ApplyOutcome {
    Started {
        version: Version,
        child: Child,
        exit: Option<ExitOutcome>,
    },
    /// The newest version failed to start: it is marked bad and `restored`,
    /// the one before it, runs instead
    RolledBack {
        failed: Version,
        restored: Version,
        child: Child,
    },
}

/// A start counts when the child is still running after the timeout, or ended
/// with success (a hand-over stub ends at once)
fn has_started(child: &mut Child, timeout: Duration) -> io::Result<bool> {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if let Some(status) = child.try_wait()? {
            return Ok(status.success());
        }
        sleep(POLL_INTERVAL);
    }
    Ok(true)
}

impl<A: Application> Launcher<A> {
    /// Replaces the running app with the newest unpacked version, under the
    /// install lock: waits for `parent_pid` to end, starts the newest version
    /// and, when that fails within `startup_timeout`, marks its folder bad and
    /// starts the version before it. Both starts carry the restarted flag
    pub fn apply(&self, request: &ApplyRequest) -> io::Result<ApplyOutcome> {
        let _lock = InstallLock::acquire(&self.root).map_err(io::Error::other)?;
        let exit = request
            .parent_pid
            .map(|pid| ensure_exited(pid, self.exit_policy, || self.application.request_exit(pid)));
        let versions = runnable_versions(&self.root, self.application.executable_name());
        let Some(&newest) = versions.first() else {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "no version to start",
            ));
        };
        let previous = versions.get(1).copied();
        if request.should_run_hooks {
            self.run_update_hooks(newest, previous);
        }
        let flags = LaunchFlags {
            is_first_run: false,
            is_restarted: true,
        };
        let mut child = self.spawn(newest, &request.arguments, flags)?;
        let is_started = has_started(&mut child, self.startup_timeout).unwrap_or(false);
        if is_started {
            return Ok(ApplyOutcome::Started {
                version: newest,
                child,
                exit,
            });
        }
        let _ = mark_bad(&app_folder(&self.root, newest));
        let Some(restored) = previous else {
            return Err(io::Error::other(format!(
                "version {newest} failed to start and there is no earlier one"
            )));
        };
        let child = self.spawn(restored, &request.arguments, flags)?;
        Ok(ApplyOutcome::RolledBack {
            failed: newest,
            restored,
            child,
        })
    }

    fn run_update_hooks(&self, newest: Version, previous: Option<Version>) {
        let executable = self.application.executable_name();
        let steps = [
            Some((newest, LifecycleEvent::Updated)),
            previous.map(|version| (version, LifecycleEvent::Obsolete)),
        ];
        for (version, event) in steps.into_iter().flatten() {
            let path = app_folder(&self.root, version).join(executable);
            // A hook that fails or hangs must not stop the update
            let _ = run_hook(&path, event, &newest, self.hook_timeout);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layout::is_bad;
    use crate::test_support::{version_folder, TempDir};

    struct Plain;

    impl Application for Plain {
        fn executable_name(&self) -> &str {
            "app.exe"
        }
    }

    // cmd.exe stands in for the app: it exits 1 where fail.flag sits in its
    // folder (the working directory) and 0 otherwise
    fn exit_by_flag() -> ApplyRequest {
        let arguments = ["/c", "if", "exist", "fail.flag", "exit", "1"];
        ApplyRequest {
            arguments: arguments.iter().map(ToString::to_string).collect(),
            ..ApplyRequest::default()
        }
    }

    fn fast(temp: &TempDir) -> Launcher<Plain> {
        let mut launcher = Launcher::new(Plain, temp.path().to_path_buf());
        launcher.startup_timeout = Duration::from_secs(20);
        launcher
    }

    #[test]
    fn starts_the_newest_version() {
        let temp = TempDir::new();
        version_folder(temp.path(), "1.0.0", "app.exe");
        version_folder(temp.path(), "1.1.0", "app.exe");
        let outcome = fast(&temp).apply(&exit_by_flag()).unwrap();
        assert!(
            matches!(outcome, ApplyOutcome::Started { version, .. } if version == Version::new(1, 1, 0))
        );
    }

    #[test]
    fn a_new_version_that_fails_is_marked_bad_and_the_previous_one_runs() {
        let temp = TempDir::new();
        let previous = version_folder(temp.path(), "1.0.0", "app.exe");
        let broken = version_folder(temp.path(), "1.1.0", "app.exe");
        std::fs::write(broken.join("fail.flag"), "").unwrap();
        let launcher = fast(&temp);
        let outcome = launcher.apply(&exit_by_flag()).unwrap();
        let ApplyOutcome::RolledBack {
            failed,
            restored,
            mut child,
        } = outcome
        else {
            panic!("expected a rollback");
        };
        assert_eq!(
            (failed, restored),
            (Version::new(1, 1, 0), Version::new(1, 0, 0))
        );
        assert!(child.wait().unwrap().success());
        assert!(is_bad(&broken) && !is_bad(&previous));
        let again = launcher.apply(&exit_by_flag()).unwrap();
        assert!(
            matches!(again, ApplyOutcome::Started { version, .. } if version == Version::new(1, 0, 0))
        );
    }

    #[test]
    fn a_failure_with_no_earlier_version_is_an_error() {
        let temp = TempDir::new();
        let only = version_folder(temp.path(), "1.0.0", "app.exe");
        std::fs::write(only.join("fail.flag"), "").unwrap();
        assert!(fast(&temp).apply(&exit_by_flag()).is_err());
        assert!(is_bad(&only));
    }

    #[test]
    fn a_version_still_running_after_the_timeout_counts_as_started() {
        let temp = TempDir::new();
        version_folder(temp.path(), "1.0.0", "app.exe");
        let mut launcher = Launcher::new(Plain, temp.path().to_path_buf());
        launcher.startup_timeout = Duration::from_millis(300);
        let request = ApplyRequest {
            arguments: ["/c", "ping", "-n", "4", "127.0.0.1"]
                .iter()
                .map(ToString::to_string)
                .collect(),
            ..ApplyRequest::default()
        };
        let ApplyOutcome::Started { mut child, .. } = launcher.apply(&request).unwrap() else {
            panic!("expected a start");
        };
        let _ = child.kill();
        let _ = child.wait();
    }

    #[test]
    fn waits_for_the_parent_before_starting() {
        let temp = TempDir::new();
        version_folder(temp.path(), "1.0.0", "app.exe");
        let mut parent = std::process::Command::new("ping")
            .args(["-n", "2", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let request = ApplyRequest {
            parent_pid: Some(parent.id()),
            ..exit_by_flag()
        };
        let outcome = fast(&temp).apply(&request).unwrap();
        let _ = parent.wait();
        assert!(matches!(
            outcome,
            ApplyOutcome::Started {
                exit: Some(ExitOutcome::ExitedOnItsOwn),
                ..
            }
        ));
    }

    #[test]
    fn the_same_process_holding_the_lock_does_not_block_itself() {
        let temp = TempDir::new();
        version_folder(temp.path(), "1.0.0", "app.exe");
        let _held = InstallLock::acquire(temp.path()).unwrap();
        let result = fast(&temp).apply(&exit_by_flag());
        assert!(result.is_ok());
    }
}
