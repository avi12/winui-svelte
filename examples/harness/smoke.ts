import type { ExampleCommand, ExampleHost } from "./contract.ts";
import { control } from "winui-svelte";
import { exitApplication } from "winui-svelte/window";

// What the example apps share: the commands every app answers, and a registry
// of the key controls an app has on screen, which test/examples.test.ts reads.

const present = new Set<string>();

/** An attachment that lists the control as present while it is on screen. */
export function keyControl(name: string) {
  return control(() => {
    present.add(name);
    return () => {
      present.delete(name);
    };
  });
}

/**
 * Answers `stats` (the key controls on screen) and `close`, and the app's own
 * commands, which are looked up by their `cmd`.
 */
export function serveExample({ host, commands = new Map() }: {
  host: ExampleHost;
  commands?: ReadonlyMap<string, (command: ExampleCommand) => void>;
}) {
  const answers = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      present: [...present].sort()
    })],
    ["close", () => exitApplication()],
    ...commands
  ]);
  host.onCommand(command => answers.get(String(command["cmd"]))?.(command));
}
