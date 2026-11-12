use crate::process::is_alive;
use std::fmt;
use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::Duration;

/// The lock file in the install root
pub const LOCK_FILE: &str = ".launcher.lock";
const UNWRITTEN_GRACE: Duration = Duration::from_millis(100);
const CLAIM_ATTEMPTS: u32 = 3;

#[derive(Debug)]
pub enum LockError {
    /// Another live process holds it
    Held(u32),
    Io(io::Error),
}

impl fmt::Display for LockError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LockError::Held(pid) => {
                write!(formatter, "another install step is running (process {pid})")
            }
            LockError::Io(error) => write!(formatter, "the lock file failed: {error}"),
        }
    }
}

impl std::error::Error for LockError {}

/// An exclusive lock on an install root, so two launches never unpack or
/// swap versions at once; released when dropped. A file naming a process that
/// has exited (a crash) is stale and is taken over
#[derive(Debug)]
pub struct InstallLock {
    path: PathBuf,
}

fn read_pid(path: &Path) -> Option<u32> {
    std::fs::read_to_string(path).ok()?.trim().parse().ok()
}

fn read_pid_after_creation(path: &Path) -> Option<u32> {
    let pid = read_pid(path);
    if pid.is_some() {
        return pid;
    }
    // The owner may sit between creating the file and writing its pid
    sleep(UNWRITTEN_GRACE);
    read_pid(path)
}

impl InstallLock {
    pub fn acquire(root: &Path) -> Result<Self, LockError> {
        let path = root.join(LOCK_FILE);
        for _ in 0..CLAIM_ATTEMPTS {
            let created = OpenOptions::new().write(true).create_new(true).open(&path);
            match created {
                Ok(mut file) => {
                    write!(file, "{}", std::process::id()).map_err(LockError::Io)?;
                    return Ok(Self { path });
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                    let owner = read_pid_after_creation(&path);
                    let is_held =
                        owner.is_some_and(|pid| pid != std::process::id() && is_alive(pid));
                    if let (true, Some(pid)) = (is_held, owner) {
                        return Err(LockError::Held(pid));
                    }
                    let _ = std::fs::remove_file(&path);
                }
                Err(error) => return Err(LockError::Io(error)),
            }
        }
        Err(LockError::Io(io::Error::other(
            "the lock file kept reappearing",
        )))
    }
}

impl Drop for InstallLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;
    use std::process::{Command, Stdio};

    #[test]
    fn a_second_acquire_is_refused_until_the_first_is_dropped() {
        let temp = TempDir::new();
        let own_pid = std::process::id();
        let other = Command::new("ping")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(Stdio::null())
            .spawn();
        let mut other = other.unwrap();
        std::fs::write(temp.path().join(LOCK_FILE), other.id().to_string()).unwrap();
        let refused = InstallLock::acquire(temp.path());
        assert!(matches!(refused, Err(LockError::Held(pid)) if pid == other.id()));
        let _ = other.kill();
        let _ = other.wait();
        let lock = InstallLock::acquire(temp.path()).unwrap();
        assert_eq!(read_pid(&temp.path().join(LOCK_FILE)), Some(own_pid));
        drop(lock);
        assert!(!temp.path().join(LOCK_FILE).exists());
    }

    #[test]
    fn a_stale_pid_is_taken_over() {
        let temp = TempDir::new();
        std::fs::write(temp.path().join(LOCK_FILE), "2147483000").unwrap();
        let lock = InstallLock::acquire(temp.path());
        assert!(lock.is_ok());
    }

    #[test]
    fn a_file_with_no_pid_is_taken_over() {
        let temp = TempDir::new();
        std::fs::write(temp.path().join(LOCK_FILE), "garbage").unwrap();
        assert!(InstallLock::acquire(temp.path()).is_ok());
    }

    #[test]
    fn the_lock_of_this_process_does_not_lock_it_out() {
        let temp = TempDir::new();
        std::fs::write(temp.path().join(LOCK_FILE), std::process::id().to_string()).unwrap();
        assert!(InstallLock::acquire(temp.path()).is_ok());
    }
}
