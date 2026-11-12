# Migrating the apps

Nothing is wired yet; this lists what each app's launcher code becomes
Each app keeps its own `Application` implementation and the parts below that
the crate does not cover

## any-stt (`winui/src-tauri/launcher`)

Replaced:

- `src/stub.rs` (`parse_version`, `install_root`, `newest_folder`,
  `newest_launcher`): `Version`, `install_root_of`, `newest_runnable`
- `src/main.rs`, the `hand_over_to_newest_version` function: `Launcher::forward`
- `src/main.rs`, `RESTART_GRACE` and `is_first_instance_within` for restarts:
  `WINUI_SVELTE_RESTARTED` plus `InstallLock` or the app's own mutex wait
- `src/main.rs`, the `--install` and `--uninstall` switch scan: `dispatch`
- `src/host.rs`, `RESTART_ENV` and `INSTALL_ROOT_ENV`: the crate's variables
- `src/host.rs`, `stop`: `Application::request_exit` and `ensure_exited`

Stays: the Node host, `variant.rs`, `launch_mode.rs`, Store licence and
updates, the startup task, notices and the show signal

## cyberpunk-2077-new-tab (`companion/winui/src-tauri/launcher`)

Replaced:

- `src/launch_mode.rs`, `newest_version_folder`: `newest_runnable`
- `src/main.rs`, `forward_to_newest`: `Launcher::forward`
- `src/main.rs`, `LAUNCHER_ENV` and `APP_DIRECTORY_ENV`:
  `WINUI_SVELTE_APP_DIR` and `WINUI_SVELTE_INSTALL_ROOT`

Stays: the Node start, `app_arguments`, `is_host_launch` and the message box

## edge-plus (`app/panel/src-tauri`)

Replaced:

- `launcher/src/main.rs` in full (`version_of`, `newest_core`, `main`):
  `Launcher::forward`
- `src/setup/install_layout.rs`: `version_of_folder`, `installed_versions`,
  `app_folder`, `STAGING_SUFFIX`, `PACKAGES_FOLDER`; the `Version` type of
  `update_feed.rs` becomes the crate's
- `src/setup/installation.rs`: the switch constants and the order of
  `install_here` and `uninstall` (`LifecycleEvent`, `dispatch`), and the
  staging rename (`promote_staging`)
- `src/setup/update_watch.rs`: the `.staging` handling at the end of a
  download; no apply step existed, `Launcher::apply` is the new one

Stays: the release feed, the download and digest check, the poll thread,
registry and shortcut writing, the removal script

## gemini-live-windows (`launcher`)

Replaced:

- `src/main.rs` in full (`version_of`, `newest_core`, `main`):
  `Launcher::forward`

Stays: `CORE_EXE` as the `Application::executable_name`

## All four

Gained without code of their own: rollback to the previous version, the bad
version mark, the install lock, retried renames, the hook switches and the
`WINUI_SVELTE_*` variables
Two behaviours differ from today and are worth a look when wiring: a stub now
sets the working directory to the version folder, and `forward` returns the
child instead of waiting on it
