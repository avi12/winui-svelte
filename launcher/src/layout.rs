use crate::version::Version;
use std::io;
use std::path::{Path, PathBuf};

const APP_PREFIX: &str = "app-";
/// Where downloaded zips wait until they are unpacked
pub const PACKAGES_FOLDER: &str = "packages";
/// A version unpacks into `app-x.y.z.staging` and is renamed into place last,
/// so a folder with this suffix is never a version
pub const STAGING_SUFFIX: &str = ".staging";
/// Written into a version folder that failed to start; it is never picked again
pub const BAD_MARKER: &str = ".bad-version";

/// The folder of `version` under `root`
pub fn app_folder(root: &Path, version: Version) -> PathBuf {
    root.join(format!("{APP_PREFIX}{version}"))
}

fn version_of_folder(name: &str) -> Option<Version> {
    name.strip_prefix(APP_PREFIX)?.parse().ok()
}

/// The install root, when `directory` is one version's folder
pub fn install_root_of(directory: &Path) -> Option<PathBuf> {
    version_of_folder(directory.file_name()?.to_str()?)?;
    Some(directory.parent()?.to_path_buf())
}

/// The versions unpacked under `root`, newest first; empty when there is none.
/// Staging folders and every other name are skipped
pub fn installed_versions(root: &Path) -> Vec<Version> {
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut versions: Vec<Version> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| version_of_folder(&entry.file_name().to_string_lossy()))
        .collect();
    versions.sort_unstable_by(|left, right| right.cmp(left));
    versions
}

/// Whether `folder` was marked bad
pub fn is_bad(folder: &Path) -> bool {
    folder.join(BAD_MARKER).is_file()
}

/// Marks `folder` bad so it is never picked again
pub fn mark_bad(folder: &Path) -> io::Result<()> {
    std::fs::write(folder.join(BAD_MARKER), "")
}

/// The versions that hold `executable_name` and were not marked bad, newest first
pub(crate) fn runnable_versions(root: &Path, executable_name: &str) -> Vec<Version> {
    installed_versions(root)
        .into_iter()
        .filter(|version| {
            let folder = app_folder(root, *version);
            folder.join(executable_name).is_file() && !is_bad(&folder)
        })
        .collect()
}

/// The newest version that can be started, with its folder
pub fn newest_runnable(root: &Path, executable_name: &str) -> Option<(Version, PathBuf)> {
    let version = *runnable_versions(root, executable_name).first()?;
    Some((version, app_folder(root, version)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    fn folders(root: &Path, names: &[&str]) {
        for name in names {
            std::fs::create_dir_all(root.join(name)).unwrap();
        }
    }

    #[test]
    fn lists_newest_first_and_skips_staging_and_strangers() {
        let temp = TempDir::new();
        folders(
            temp.path(),
            &[
                "app-1.2.0",
                "app-1.10.0",
                "app-1.9.3",
                "packages",
                "app-2.0.0.staging",
                "app-x.y.z",
            ],
        );
        std::fs::write(temp.path().join("app-9.9.9"), "a file, not a folder").unwrap();
        let listed: Vec<String> = installed_versions(temp.path())
            .iter()
            .map(ToString::to_string)
            .collect();
        assert_eq!(listed, ["1.10.0", "1.9.3", "1.2.0"]);
    }

    #[test]
    fn a_missing_root_has_no_versions() {
        assert_eq!(
            installed_versions(Path::new(r"C:\no\such\root")),
            Vec::<Version>::new()
        );
    }

    #[test]
    fn a_version_folder_knows_its_root() {
        assert_eq!(
            install_root_of(Path::new(r"C:\Users\a\App\app-1.2.3")),
            Some(PathBuf::from(r"C:\Users\a\App"))
        );
        assert_eq!(install_root_of(Path::new(r"C:\Users\a\App")), None);
        assert_eq!(
            install_root_of(Path::new(r"C:\Users\a\App\app-1.2.3.staging")),
            None
        );
    }

    #[test]
    fn the_newest_runnable_needs_the_executable_and_no_bad_mark() {
        let temp = TempDir::new();
        folders(
            temp.path(),
            &["app-1.0.0", "app-2.0.0", "app-3.0.0", "app-4.0.0"],
        );
        for version in ["1.0.0", "2.0.0", "3.0.0"] {
            std::fs::write(
                temp.path().join(format!("app-{version}")).join("app.exe"),
                "",
            )
            .unwrap();
        }
        mark_bad(&temp.path().join("app-3.0.0")).unwrap();
        let (version, folder) = newest_runnable(temp.path(), "app.exe").unwrap();
        assert_eq!(version, Version::new(2, 0, 0));
        assert_eq!(folder, temp.path().join("app-2.0.0"));
        assert_eq!(newest_runnable(temp.path(), "other.exe"), None);
    }
}
