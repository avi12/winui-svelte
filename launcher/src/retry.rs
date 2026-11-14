use std::io;
use std::path::Path;
use std::thread::sleep;
use std::time::Duration;

const ERROR_ACCESS_DENIED: i32 = 5;
const ERROR_SHARING_VIOLATION: i32 = 32;
const ERROR_LOCK_VIOLATION: i32 = 33;

/// How a locked file is retried: the delay doubles from `first_delay` up to
/// `maximum_delay`, for at most `attempts` tries in all
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Backoff {
    /// How many times the operation is tried
    pub attempts: u32,
    /// The pause after the first failure
    pub first_delay: Duration,
    /// The longest pause
    pub maximum_delay: Duration,
}

impl Backoff {
    /// About ten seconds of patience, for an antivirus scan or an Explorer
    /// window that has the folder open
    pub const DEFAULT: Self = Self {
        attempts: 12,
        first_delay: Duration::from_millis(50),
        maximum_delay: Duration::from_secs(2),
    };

    fn delay_before(&self, retry_number: u32) -> Duration {
        let factor = 2u32.saturating_pow(retry_number);
        self.first_delay
            .saturating_mul(factor)
            .min(self.maximum_delay)
    }
}

/// A file another process has open or a scanner holds: worth waiting for
pub fn is_locked(error: &io::Error) -> bool {
    let is_denied = error.kind() == io::ErrorKind::PermissionDenied;
    let code = error.raw_os_error();
    let is_lock_code = matches!(
        code,
        Some(ERROR_ACCESS_DENIED | ERROR_SHARING_VIOLATION | ERROR_LOCK_VIOLATION)
    );
    is_denied || is_lock_code
}

/// Runs `operation` again after a locked-file error, with the backoff; any
/// other error, and the last locked one, is returned as it is
pub fn retry<T>(backoff: Backoff, mut operation: impl FnMut() -> io::Result<T>) -> io::Result<T> {
    let mut retry_number = 0;
    loop {
        let error = match operation() {
            Ok(value) => return Ok(value),
            Err(error) => error,
        };
        let is_out_of_attempts = retry_number + 1 >= backoff.attempts;
        if is_out_of_attempts || !is_locked(&error) {
            return Err(error);
        }
        sleep(backoff.delay_before(retry_number));
        retry_number += 1;
    }
}

/// Renames `from` to `to`, retrying while Windows holds either
pub fn rename_with_retry(backoff: Backoff, from: &Path, to: &Path) -> io::Result<()> {
    retry(backoff, || std::fs::rename(from, to))
}

/// A folder that is already gone counts as removed
pub fn remove_dir_all_with_retry(backoff: Backoff, folder: &Path) -> io::Result<()> {
    let result = retry(backoff, || std::fs::remove_dir_all(folder));
    match result {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    const FAST: Backoff = Backoff {
        attempts: 4,
        first_delay: Duration::from_millis(1),
        maximum_delay: Duration::from_millis(4),
    };

    fn locked() -> io::Error {
        io::Error::from_raw_os_error(ERROR_SHARING_VIOLATION)
    }

    #[test]
    fn the_delay_doubles_up_to_the_cap() {
        let backoff = Backoff {
            attempts: 9,
            first_delay: Duration::from_millis(50),
            maximum_delay: Duration::from_millis(300),
        };
        let delays: Vec<u128> = (0..5)
            .map(|number| backoff.delay_before(number).as_millis())
            .collect();
        assert_eq!(delays, [50, 100, 200, 300, 300]);
    }

    #[test]
    fn a_lock_that_lets_go_succeeds() {
        let mut calls = 0;
        let result = retry(FAST, || {
            calls += 1;
            if calls < 3 {
                return Err(locked());
            }
            Ok(calls)
        });
        assert_eq!(result.unwrap(), 3);
    }

    #[test]
    fn a_lock_that_stays_fails_after_the_attempts() {
        let mut calls = 0;
        let result: io::Result<()> = retry(FAST, || {
            calls += 1;
            Err(locked())
        });
        assert!(result.is_err());
        assert_eq!(calls, 4);
    }

    #[test]
    fn another_error_is_not_retried() {
        let mut calls = 0;
        let result: io::Result<()> = retry(FAST, || {
            calls += 1;
            Err(io::Error::from(io::ErrorKind::NotFound))
        });
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
        assert_eq!(calls, 1);
    }

    #[test]
    fn renames_and_removes_in_a_real_folder() {
        let temp = TempDir::new();
        let from = temp.path().join("from");
        let to = temp.path().join("to");
        std::fs::create_dir(&from).unwrap();
        rename_with_retry(FAST, &from, &to).unwrap();
        assert!(to.is_dir() && !from.exists());
        remove_dir_all_with_retry(FAST, &to).unwrap();
        assert!(!to.exists());
        remove_dir_all_with_retry(FAST, &to).unwrap();
    }
}
