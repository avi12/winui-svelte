use std::ffi::c_void;
use std::thread::sleep;
use std::time::{Duration, Instant};

type Handle = *mut c_void;

const SYNCHRONIZE: u32 = 0x0010_0000;
const PROCESS_TERMINATE: u32 = 0x0001;
const WAIT_OBJECT_0: u32 = 0;
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const KILLED_EXIT_CODE: u32 = 1;

#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(access: u32, is_inheritable: i32, process_id: u32) -> Handle;
    fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
    fn TerminateProcess(handle: Handle, exit_code: u32) -> i32;
    fn CloseHandle(handle: Handle) -> i32;
}

/// Runs `action` on the process's handle; None when it cannot be opened,
/// which is also what an exited process looks like
fn with_process<T>(pid: u32, access: u32, action: impl FnOnce(Handle) -> T) -> Option<T> {
    // SAFETY: plain Win32 calls; the handle is closed once, after the action
    let handle = unsafe { OpenProcess(access, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let result = action(handle);
    // SAFETY: the handle was just returned by OpenProcess
    unsafe { CloseHandle(handle) };
    Some(result)
}

fn has_exited(handle: Handle) -> bool {
    // SAFETY: a zero-millisecond wait only reads the signal state
    unsafe { WaitForSingleObject(handle, 0) == WAIT_OBJECT_0 }
}

/// False once the process has exited, or when it cannot be opened (a process
/// of another user included, which a per-user install never waits for)
pub fn is_alive(pid: u32) -> bool {
    with_process(pid, SYNCHRONIZE, |handle| !has_exited(handle)).unwrap_or(false)
}

/// Asks Windows to terminate the process; whether it did
pub fn terminate(pid: u32) -> bool {
    // SAFETY: the handle comes from OpenProcess with the terminate right
    with_process(pid, PROCESS_TERMINATE | SYNCHRONIZE, |handle| unsafe {
        TerminateProcess(handle, KILLED_EXIT_CODE) != 0
    })
    .unwrap_or(false)
}

fn wait_until_gone(pid: u32, limit: Duration) -> bool {
    let started = Instant::now();
    while is_alive(pid) {
        if started.elapsed() >= limit {
            return false;
        }
        sleep(POLL_INTERVAL);
    }
    true
}

/// How long the old process gets: `wait` to end by itself, then `grace` after
/// the app was asked to end, then it is killed
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExitPolicy {
    /// How long it gets to end by itself
    pub wait: Duration,
    /// How long it gets after being asked, and again after being killed
    pub grace: Duration,
}

impl ExitPolicy {
    /// The policy the launcher uses
    pub const DEFAULT: Self = Self {
        wait: Duration::from_secs(10),
        grace: Duration::from_secs(2),
    };
}

/// How the old process ended
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExitOutcome {
    /// It was not running
    AlreadyGone,
    /// It ended by itself within `wait`
    ExitedOnItsOwn,
    /// It ended within `grace` of being asked
    ExitedWhenAsked,
    /// It had to be killed
    Killed,
    /// Neither asking nor killing ended it
    Survived,
}

/// Waits for `pid` to end, then asks through `request_exit` and waits again,
/// then kills it
pub fn ensure_exited(pid: u32, policy: ExitPolicy, request_exit: impl FnOnce()) -> ExitOutcome {
    if !is_alive(pid) {
        return ExitOutcome::AlreadyGone;
    }
    if wait_until_gone(pid, policy.wait) {
        return ExitOutcome::ExitedOnItsOwn;
    }
    request_exit();
    if wait_until_gone(pid, policy.grace) {
        return ExitOutcome::ExitedWhenAsked;
    }
    let is_killed = terminate(pid) && wait_until_gone(pid, policy.grace);
    if is_killed {
        return ExitOutcome::Killed;
    }
    ExitOutcome::Survived
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Child, Command, Stdio};

    const SHORT: Duration = Duration::from_millis(200);

    fn sleeper(seconds: u32) -> Child {
        Command::new("ping")
            .args(["-n", &(seconds + 1).to_string(), "127.0.0.1"])
            .stdout(Stdio::null())
            .spawn()
            .unwrap()
    }

    #[test]
    fn this_process_is_alive_and_a_missing_one_is_not() {
        assert!(is_alive(std::process::id()));
        assert!(!is_alive(0x7fff_fff0));
    }

    #[test]
    fn a_process_that_ends_by_itself_is_not_asked() {
        let mut child = sleeper(1);
        let policy = ExitPolicy {
            wait: Duration::from_secs(10),
            grace: SHORT,
        };
        let outcome = ensure_exited(child.id(), policy, || panic!("not asked"));
        let _ = child.wait();
        assert_eq!(outcome, ExitOutcome::ExitedOnItsOwn);
    }

    #[test]
    fn a_process_that_ignores_the_timeout_is_asked_then_killed() {
        let mut child = sleeper(30);
        let policy = ExitPolicy {
            wait: SHORT,
            grace: SHORT,
        };
        let mut was_asked = false;
        let outcome = ensure_exited(child.id(), policy, || was_asked = true);
        let _ = child.wait();
        assert!(was_asked);
        assert_eq!(outcome, ExitOutcome::Killed);
    }

    #[test]
    fn a_process_that_ends_when_asked_is_not_killed() {
        let mut child = sleeper(30);
        let pid = child.id();
        let policy = ExitPolicy {
            wait: SHORT,
            grace: Duration::from_secs(5),
        };
        let outcome = ensure_exited(pid, policy, || {
            terminate(pid);
        });
        let _ = child.wait();
        assert_eq!(outcome, ExitOutcome::ExitedWhenAsked);
    }

    #[test]
    fn a_gone_process_returns_at_once() {
        let policy = ExitPolicy {
            wait: SHORT,
            grace: SHORT,
        };
        assert_eq!(
            ensure_exited(0x7fff_fff0, policy, || panic!("not asked")),
            ExitOutcome::AlreadyGone
        );
    }
}
