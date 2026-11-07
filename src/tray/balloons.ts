import { BalloonIcon, NotifyOperation, OFFSET_FLAGS, writeWide } from "./native.ts";
import type { BalloonWriter } from "./native.ts";
import { TrayBalloonIcon } from "./tray-core.ts";
import type { BalloonsExtra } from "./tray-extras.ts";

const BALLOON_BODY_CHARS = 256;
const BALLOON_TITLE_CHARS = 64;
const OFFSET_BODY = 304;
const OFFSET_TITLE = 820;
const OFFSET_BALLOON_FLAGS = 948;
const FLAG_INFO = 0x10;
const BALLOON_SILENT = 0x10;

/** Writes the balloon fields of a NOTIFYICONDATAW: the info flag, the body, the title and the icon. */
function writeBalloon({ memory, balloon }: Parameters<BalloonWriter>[0]) {
  memory.writeU32(OFFSET_FLAGS, memory.readU32(OFFSET_FLAGS) | FLAG_INFO);
  writeWide({
    memory,
    offset: OFFSET_BODY,
    text: balloon.body,
    chars: BALLOON_BODY_CHARS
  });
  writeWide({
    memory,
    offset: OFFSET_TITLE,
    text: balloon.title,
    chars: BALLOON_TITLE_CHARS
  });
  memory.writeU32(OFFSET_BALLOON_FLAGS, balloon.icon | (balloon.isSilent ? BALLOON_SILENT : 0));
}

/**
 * The extra that adds `notify` to a tray icon: pass it in `extras` and the handle shows balloons over
 * the icon. Without it the balloon code is not in the bundle.
 */
export const balloons: BalloonsExtra = {
  kind: "balloons",
  writeBalloon,
  extend(context) {
    return {
      notify(balloon) {
        if (!context.isRegistered()) {
          return;
        }

        context.send({
          operation: NotifyOperation.modify,
          balloon: {
            title: balloon.title,
            body: balloon.body ?? "",
            icon: BalloonIcon[balloon.icon ?? TrayBalloonIcon.INFO],
            isSilent: balloon.isSilent ?? false
          }
        });
      }
    };
  }
};
