use std::fmt;
use std::str::FromStr;

/// `major.minor.patch`, ordered numerically; the same grammar and order as
/// `parseVersion` and `compareVersions` in `src/updater/version.ts`: exactly
/// three all-digit parts, so `1.10.0` is newer than `1.9.0`, and `1.2.3.4`,
/// `1.2` and `1.2.3-beta` are not versions
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Version {
    /// The major number
    pub major: u64,
    /// The minor number
    pub minor: u64,
    /// The patch number
    pub patch: u64,
}

/// The text that is not a `major.minor.patch` version
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionError(pub String);

impl fmt::Display for VersionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "Not a major.minor.patch version: {}", self.0)
    }
}

impl std::error::Error for VersionError {}

fn parse_part(text: &str) -> Option<u64> {
    let is_digits = !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit());
    if !is_digits {
        return None;
    }
    text.parse().ok()
}

impl Version {
    /// The version with these parts
    pub const fn new(major: u64, minor: u64, patch: u64) -> Self {
        Self {
            major,
            minor,
            patch,
        }
    }

    /// Reads `major.minor.patch`; an error holding the text when it is anything else
    pub fn parse(text: &str) -> Result<Self, VersionError> {
        let error = || VersionError(text.to_string());
        let mut parts = text.split('.');
        let major = parts.next().and_then(parse_part).ok_or_else(error)?;
        let minor = parts.next().and_then(parse_part).ok_or_else(error)?;
        let patch = parts.next().and_then(parse_part).ok_or_else(error)?;
        let has_extra = parts.next().is_some();
        if has_extra {
            return Err(error());
        }
        Ok(Self::new(major, minor, patch))
    }
}

impl FromStr for Version {
    type Err = VersionError;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        Self::parse(text)
    }
}

impl fmt::Display for Version {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_numbers_not_text() {
        assert!(Version::parse("1.10.0").unwrap() > Version::parse("1.9.3").unwrap());
        assert!(Version::parse("2.0.0").unwrap() > Version::parse("1.99.99").unwrap());
        assert_eq!(Version::parse("1.2.3"), Version::parse("1.2.3"));
    }

    #[test]
    fn matches_the_typescript_grammar() {
        for text in [
            "1.2",
            "1.2.3.4",
            "1.2.3-beta",
            "a.b.c",
            "",
            "1..3",
            "+1.2.3",
            "1.2.-3",
            " 1.2.3",
        ] {
            assert!(Version::parse(text).is_err(), "{text} is not a version");
        }
        assert_eq!(Version::parse("01.2.3").unwrap(), Version::new(1, 2, 3));
    }

    #[test]
    fn displays_what_it_parsed() {
        assert_eq!(Version::new(0, 10, 2).to_string(), "0.10.2");
    }

    #[test]
    fn the_error_names_the_text() {
        assert_eq!(
            Version::parse("x").unwrap_err().to_string(),
            "Not a major.minor.patch version: x"
        );
    }
}
