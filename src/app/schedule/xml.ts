import { TriggerKind } from "./trigger.ts";
import type { ScheduleTrigger } from "./trigger.ts";
import { commandLineOf, quoteArgument } from "#src/app/activation/command.js";
import type { ProgramCommand } from "#src/app/activation/command.js";

const MINUTES_PER_HOUR = 60;
const PAD_WIDTH = 2;
const ANCHOR_DATE = "2000-01-01";
const MIDNIGHT = "00:00";
const XML_ESCAPES = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ["\"", "&quot;"],
  ["'", "&apos;"]
]);
const XML_SPECIAL = /[&<>"']/gu;

/**
 * Escapes text for an XML element.
 *
 * @param text - The text.
 * @returns The text, safe between tags.
 */
function escapeXml(text: string) {
  return text.replace(XML_SPECIAL, character => XML_ESCAPES.get(character) ?? character);
}

function pad(value: number) {
  return String(value).padStart(PAD_WIDTH, "0");
}

function localTimestamp(date: Date) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day}T${time}`;
}

function durationOf(minutes: number) {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  const hoursPart = hours === 0 ? "" : `${hours}H`;
  const minutesPart = rest === 0 ? "" : `${rest}M`;
  return `PT${hoursPart}${minutesPart}`;
}

function triggerXml({ trigger, userId }: {
  trigger: ScheduleTrigger;
  userId: string;
}) {
  switch (trigger.kind) {
    case TriggerKind.logon: {
      const delay = trigger.delaySeconds ?? 0;
      const delayXml = delay === 0 ? "" : `<Delay>PT${delay}S</Delay>`;
      return `<LogonTrigger><Enabled>true</Enabled><UserId>${escapeXml(userId)}</UserId>${delayXml}</LogonTrigger>`;
    }
    case TriggerKind.daily: {
      const interval = trigger.everyDays ?? 1;
      return `<CalendarTrigger><StartBoundary>${ANCHOR_DATE}T${trigger.at}:00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>${interval}</DaysInterval></ScheduleByDay></CalendarTrigger>`;
    }
    case TriggerKind.interval:
      return `<TimeTrigger><StartBoundary>${ANCHOR_DATE}T${MIDNIGHT}:00</StartBoundary><Enabled>true</Enabled><Repetition><Interval>${durationOf(trigger.everyMinutes)}</Interval></Repetition></TimeTrigger>`;
    case TriggerKind.once:
      return `<TimeTrigger><StartBoundary>${localTimestamp(trigger.at)}</StartBoundary><Enabled>true</Enabled></TimeTrigger>`;
  }
}

/**
 * The Task Scheduler 1.2 definition of a task that starts a program when the
 * trigger fires: as the signed-in user with their normal rights, on battery
 * too, with no time limit, and a missed start made up when the PC is next on.
 *
 * @param options - The trigger, the program with its leading arguments, the
 *   app's own arguments, and the user (`DOMAIN\name`) the task belongs to.
 * @returns The XML text.
 * @throws {Error} When an argument holds a control character.
 */
export function taskXml({ trigger, command, extra, userId }: {
  trigger: ScheduleTrigger;
  command: ProgramCommand;
  extra: readonly string[];
  userId: string;
}) {
  const program = commandLineOf({
    command: {
      program: command.program,
      arguments: []
    }
  });
  const argumentLine = [...command.arguments, ...extra].map(quoteArgument).join(" ");
  const argumentsXml = argumentLine === "" ? "" : `<Arguments>${escapeXml(argumentLine)}</Arguments>`;
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-16\"?>",
    "<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">",
    `<Triggers>${triggerXml({
      trigger,
      userId
    })}</Triggers>`,
    `<Principals><Principal id="Author"><UserId>${escapeXml(userId)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>`,
    "<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Enabled>true</Enabled></Settings>",
    `<Actions Context="Author"><Exec><Command>${escapeXml(program)}</Command>${argumentsXml}</Exec></Actions>`,
    "</Task>"
  ].join("\n");
}
