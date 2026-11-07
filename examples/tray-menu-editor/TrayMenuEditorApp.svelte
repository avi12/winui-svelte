<script lang="ts">
  import { items } from "./menu.ts";
  import type { MenuId } from "./menu.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { writeIconFile } from "#examples/tray/icon-file.ts";
  import type { StackPanel as StackPanelControl } from "#winui/microsoft/ui/xaml/controls/StackPanel";
  import { existsSync, readFileSync } from "node:fs";
  import { tmpdir } from "node:os";
  import path from "node:path";
  import { elementRef, flush } from "winui-svelte";
  import { auditAccessibility } from "winui-svelte/accessibility/audit";
  import { ScrollViewer, StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { TrayIcon } from "winui-svelte/tray";
  import { describeMenu, loadProfile, MenuLevel, saveProfile } from "winui-svelte/tray/menu";
  import { TrayMenuEditor } from "winui-svelte/tray/menu/svelte";
  import { exitApplication } from "winui-svelte/window";

  // How an app wires the editor: the profile is loaded from a settings file
  // when the app starts, the editor changes it, the app saves every change,
  // and the tray icon reads the same profile each time its menu opens.
  const WINDOW_WIDTH = 520;
  const WINDOW_HEIGHT = 760;
  const { host }: { host: ExampleHost } = $props();
  // svelte-ignore state_referenced_locally
  const SETTINGS_FILE = host.options["file"] ?? path.join(tmpdir(), "winui-svelte-tray-menu-editor", "tray-menu.json");
  const ICON = writeIconFile({
    name: "tray-menu-editor",
    red: 20,
    green: 40,
    blue: 160
  });

  let profile = $state(loadProfile<MenuId>({ file: SETTINGS_FILE }));
  const editor = elementRef<StackPanelControl>();

  function hideFromCode(id: string) {
    const known = describeMenu({ items }).find(description => description.id === id);
    const isKnown = known !== undefined;
    if (!isKnown) {
      return;
    }

    profile = {
      ...profile,
      hidden: [...profile.hidden, known.id]
    };
    saveProfile({
      file: SETTINGS_FILE,
      profile
    });
  }

  function report() {
    flush();
    const { current } = editor;
    host.report({
      kind: "info",
      profile: $state.snapshot(profile),
      saved: existsSync(SETTINGS_FILE) ? readFileSync(SETTINGS_FILE, "utf8") : "",
      findings: current === undefined ? [] : auditAccessibility(current).map(finding => finding.ruleId)
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["info", report],
    ["level", command => {
      profile = {
        ...profile,
        level: command["level"] === MenuLevel.FULL ? MenuLevel.FULL : MenuLevel.STANDARD
      };
      report();
    }],
    ["hide", command => {
      hideFromCode(String(command["id"]));
      report();
    }],
    ["close", () => exitApplication()]
  ]);

  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={() => exitApplication()}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Tray menu editor"
  width={WINDOW_WIDTH}
>
  <ScrollViewer>
    <StackPanel class="page">
      <TextBlock>Right-click the tray icon to see the menu as the user has set it.</TextBlock>
      <StackPanel {@attach editor.attach}>
        <TrayMenuEditor
          isPreviewShown
          {items}
          onchange={next => saveProfile({
            file: SETTINGS_FILE,
            profile: next
          })}
          bind:profile
        />
      </StackPanel>
    </StackPanel>
  </ScrollViewer>
</Window>

<TrayIcon
  guid="0d5a7a43-2f5b-4d2c-9e53-0f6b3a1f8c21"
  icon={ICON}
  menu={items}
  {profile}
  tooltip="Tray menu editor"
/>

<style>
  .page {
    gap: 16px;
    padding: 24px;
  }
</style>
