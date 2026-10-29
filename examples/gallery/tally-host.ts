import { startMemoryHost } from "#examples/harness/memory-host.ts";
import { z } from "zod";

// The host of the state page: it owns a tally, and the window shows and
// changes it only through actions. A real app's host is another process; the
// link here is in memory, so the page runs on its own.

export const TALLY_NAME = "tally";

const tallySchema = z.object({
  clicks: z.number(),
  log: z.array(z.string())
});
const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("click") }),
  z.object({ kind: z.literal("reset") }),
  z.object({ kind: z.literal("refuse") })
]);

export type Tally = z.infer<typeof tallySchema>;
export type TallyAction = z.infer<typeof actionSchema>;

const MAXIMUM_LOG = 4;

export function startTallyHost() {
  return startMemoryHost<Tally>({
    name: TALLY_NAME,
    initial: {
      clicks: 0,
      log: []
    },
    reduce({ state, action }) {
      const parsed = actionSchema.parse(action);
      if (parsed.kind === "refuse") {
        throw new Error("the host refuses this one");
      }

      if (parsed.kind === "reset") {
        return {
          clicks: 0,
          log: []
        };
      }

      const clicks = state.clicks + 1;
      return {
        clicks,
        log: [...state.log, `click ${clicks}`].slice(-MAXIMUM_LOG)
      };
    }
  });
}
