# winui-svelte-launcher

The Rust half of winui-svelte's per-user install: one install root holding a
stable launcher and one `app-x.y.z` folder per version, the layout that
`Updater` and `createRelease` speak
It is a cargo crate for an app's own launcher; it is not part of the npm
package (`files` in `package.json` is an allowlist and leaves it out)

## Depend on it

```toml
[dependencies]
winui-svelte-launcher = { git = "https://github.com/avi12/winui-svelte", path = "launcher" }
```

Pin `rev` or `tag` in a released app
Windows only; the crate has no other dependencies

## Use it

An app implements `Application`, the only app-specific part, and builds a
`Launcher` over its install root:

```rust
use winui_svelte_launcher::{Application, LaunchFlags, LifecycleEvent, Launcher, Version};

struct MyApp;

impl Application for MyApp {
    fn executable_name(&self) -> &str {
        "myapp.exe"
    }

    fn on_lifecycle(&self, event: LifecycleEvent, version: &Version) -> std::io::Result<()> {
        // register or remove the Start menu shortcut, the startup entry, and so on
        Ok(())
    }
}

fn main() {
    let executable = std::env::current_exe().unwrap();
    let launcher = Launcher::for_executable(MyApp, &executable).unwrap();
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    launcher.forward(&arguments, LaunchFlags::default()).unwrap();
}
```

## What it holds

| Piece | Items |
|---|---|
| Versions | `Version` (same grammar and order as `src/updater/version.ts`), `installed_versions`, `newest_runnable`, `install_root_of`, `.staging` folders ignored |
| Stub | `Launcher::forward` starts the newest folder's executable with the arguments passed through |
| Update | `Launcher::apply` waits for the parent, then asks, then kills; starts the newest version; on a failed start marks it bad (`BAD_MARKER`) and starts the previous one |
| Staging | `Launcher::promote_staging`, built on `retry`, `rename_with_retry`, `remove_dir_all_with_retry` |
| Lock | `InstallLock`, a lock file that names its process and is taken over when that process has exited |
| Hooks | `LifecycleEvent` (`--install`, `--updated`, `--obsolete`, `--uninstall`), `dispatch`, `run_hook` |
| Flags | `LaunchFlags`, the environment variables `WINUI_SVELTE_FIRST_RUN` and `WINUI_SVELTE_RESTARTED`, and `WINUI_SVELTE_INSTALL_ROOT` and `WINUI_SVELTE_APP_DIR` on every child |

## Check

```text
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

The tests use temporary folders and copies of `cmd.exe` as stand-in apps
