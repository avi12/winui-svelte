use crate::application::Application;
use crate::version::Version;
use std::io;
use std::path::Path;
use std::process::{Command, ExitStatus, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

/// Set to `1` on the first start after an install
pub const FIRST_RUN_ENV: &str = "WINUI_SVELTE_FIRST_RUN";
/// Set to `1` on a start that replaces a running copy of the app (an update
/// applied, or the app restarting itself)
pub const RESTARTED_ENV: &str = "WINUI_SVELTE_RESTARTED";
const FLAG_ON: &str = "1";
const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// The moments an app may hook, after Velopack's: each is run as
/// `<executable> <switch> <version>` and should end quickly
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecycleEvent {
    /// Run in the new install, once, before its first start
    Install,
    /// Run in the new version after an update has unpacked it
    Updated,
    /// Run in the version an update replaced, before it is left behind
    Obsolete,
    /// Run in the installed version, from Add or remove programs
    Uninstall,
}

impl LifecycleEvent {
    pub const ALL: [Self; 4] = [
        Self::Install,
        Self::Updated,
        Self::Obsolete,
        Self::Uninstall,
    ];

    pub fn switch(self) -> &'static str {
        match self {
            Self::Install => "--install",
            Self::Updated => "--updated",
            Self::Obsolete => "--obsolete",
            Self::Uninstall => "--uninstall",
        }
    }
}

/// The two start flags, named like Velopack's first-run and restarted
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LaunchFlags {
    pub is_first_run: bool,
    pub is_restarted: bool,
}

impl LaunchFlags {
    pub fn from_environment() -> Self {
        let is_on = |name: &str| std::env::var_os(name).is_some_and(|value| value == FLAG_ON);
        Self {
            is_first_run: is_on(FIRST_RUN_ENV),
            is_restarted: is_on(RESTARTED_ENV),
        }
    }

    /// Sets what is on and removes what is off, so a flag never leaks from a
    /// parent that had it into a child that should not
    pub fn apply_to(self, command: &mut Command) {
        for (name, is_set) in [
            (FIRST_RUN_ENV, self.is_first_run),
            (RESTARTED_ENV, self.is_restarted),
        ] {
            if is_set {
                command.env(name, FLAG_ON);
                continue;
            }
            command.env_remove(name);
        }
    }
}

/// Runs the hook the arguments ask for, when they ask for one. The version is
/// the argument after the switch when it is a version, else `fallback_version`.
/// None means a normal start
pub fn dispatch(
    application: &impl Application,
    arguments: &[String],
    fallback_version: &Version,
) -> Option<io::Result<()>> {
    let (position, event) = arguments
        .iter()
        .enumerate()
        .find_map(|(position, argument)| {
            let event = LifecycleEvent::ALL
                .into_iter()
                .find(|event| event.switch() == argument)?;
            Some((position, event))
        })?;
    let version = arguments
        .get(position + 1)
        .and_then(|text| Version::parse(text).ok())
        .unwrap_or(*fallback_version);
    Some(application.on_lifecycle(event, &version))
}

/// Starts `executable` with the event's switch and the version, and waits up
/// to `timeout` for it; a hook that hangs is killed so an update never stalls.
/// The hook's status, or None when it was killed
pub fn run_hook(
    executable: &Path,
    event: LifecycleEvent,
    version: &Version,
    timeout: Duration,
) -> io::Result<Option<ExitStatus>> {
    let mut child = Command::new(executable)
        .arg(event.switch())
        .arg(version.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    let started = Instant::now();
    while started.elapsed() < timeout {
        if let Some(status) = child.try_wait()? {
            return Ok(Some(status));
        }
        sleep(POLL_INTERVAL);
    }
    let _ = child.kill();
    let _ = child.wait();
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{version_folder, TempDir};
    use std::cell::RefCell;

    struct Recorder(RefCell<Vec<(LifecycleEvent, Version)>>);

    impl Application for Recorder {
        fn executable_name(&self) -> &str {
            "app.exe"
        }

        fn on_lifecycle(&self, event: LifecycleEvent, version: &Version) -> io::Result<()> {
            self.0.borrow_mut().push((event, *version));
            Ok(())
        }
    }

    fn arguments(list: &[&str]) -> Vec<String> {
        list.iter().map(ToString::to_string).collect()
    }

    const FALLBACK: Version = Version::new(1, 0, 0);

    #[test]
    fn each_switch_dispatches_its_event_with_the_version_after_it() {
        for event in LifecycleEvent::ALL {
            let recorder = Recorder(RefCell::new(Vec::new()));
            let result = dispatch(
                &recorder,
                &arguments(&["--tray", event.switch(), "2.3.4"]),
                &FALLBACK,
            );
            assert!(result.unwrap().is_ok());
            assert_eq!(recorder.0.into_inner(), [(event, Version::new(2, 3, 4))]);
        }
    }

    #[test]
    fn a_switch_without_a_version_uses_the_fallback() {
        let recorder = Recorder(RefCell::new(Vec::new()));
        dispatch(
            &recorder,
            &arguments(&["--uninstall", "--quiet"]),
            &FALLBACK,
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            recorder.0.into_inner(),
            [(LifecycleEvent::Uninstall, FALLBACK)]
        );
    }

    #[test]
    fn a_normal_start_dispatches_nothing() {
        let recorder = Recorder(RefCell::new(Vec::new()));
        assert!(dispatch(&recorder, &arguments(&["--tray"]), &FALLBACK).is_none());
        assert!(recorder.0.into_inner().is_empty());
    }

    #[test]
    fn the_flags_are_set_and_cleared_on_the_command() {
        let mut command = Command::new("cmd");
        LaunchFlags {
            is_first_run: true,
            is_restarted: false,
        }
        .apply_to(&mut command);
        let environment: Vec<_> = command.get_envs().collect();
        let first_run = environment
            .iter()
            .find(|(name, _)| *name == FIRST_RUN_ENV)
            .unwrap();
        let restarted = environment
            .iter()
            .find(|(name, _)| *name == RESTARTED_ENV)
            .unwrap();
        assert_eq!(first_run.1, Some(std::ffi::OsStr::new("1")));
        assert_eq!(restarted.1, None);
    }

    #[test]
    fn a_hook_that_ends_returns_its_status_and_one_that_hangs_is_killed() {
        let temp = TempDir::new();
        let folder = version_folder(temp.path(), "1.0.0", "app.exe");
        let executable = folder.join("app.exe");
        let finished = run_hook(
            &executable,
            LifecycleEvent::Install,
            &FALLBACK,
            Duration::from_secs(20),
        );
        assert!(finished.unwrap().is_some());
        let killed = run_hook(
            &executable,
            LifecycleEvent::Install,
            &FALLBACK,
            Duration::ZERO,
        );
        assert!(killed.unwrap().is_none());
        assert!(run_hook(
            &folder.join("none.exe"),
            LifecycleEvent::Install,
            &FALLBACK,
            Duration::ZERO
        )
        .is_err());
    }
}
