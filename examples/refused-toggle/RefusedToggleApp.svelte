<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { nullableBooleanOf } from "#src/components/convert.js";
  import type { CheckBox as CheckBoxControl } from "#winui/microsoft/ui/xaml/controls/CheckBox";
  import type { ToggleSwitch as ToggleSwitchControl } from "#winui/microsoft/ui/xaml/controls/ToggleSwitch";
  import { control } from "winui-svelte";
  import { CheckBox, StackPanel, ToggleSwitch, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 300;
  const WINDOW_WIDTH = 300;

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();
  let switchControl: ToggleSwitchControl | undefined;
  let checkControl: CheckBoxControl | undefined;
  // The app holds both off and refuses every change.
  const IS_SWITCH_ON = false;
  const IS_CHECKED = false;
  let switchAsked = 0;
  let checkAsked = 0;

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["flip", () => {
      Object.assign(switchControl ?? {}, { isOn: true });
      Object.assign(checkControl ?? {}, { isChecked: nullableBooleanOf(true) });
      host.report({ kind: "flipped" });
    }],
    ["stats", () => host.report({
      kind: "stats",
      isSwitchOn: switchControl?.isOn ?? null,
      isChecked: checkControl?.isChecked ?? null,
      switchAsked,
      checkAsked
    })],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window height={WINDOW_HEIGHT} onclosed={exitApplication} title="Refused toggle example" width={WINDOW_WIDTH}>
  <StackPanel>
    <ToggleSwitch
      {@attach control<ToggleSwitchControl>(native => {
        switchControl = native;
      })}
      bind:isOn={() => IS_SWITCH_ON, () => {
        switchAsked++;
      }}
    />
    <CheckBox
      {@attach control<CheckBoxControl>(native => {
        checkControl = native;
      })}
      bind:isChecked={() => IS_CHECKED, () => {
        checkAsked++;
      }}
    />
  </StackPanel>
</Window>
