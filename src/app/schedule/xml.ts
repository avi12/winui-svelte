import { alarmArgument } from "#src/app/activation/alarm-argument.js";
import { commandLineOf, quoteArgument } from "#src/app/activation/command.js";
import type { ProgramCommand } from "#src/app/activation/command.js";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const PAD_WIDTH = 2;
const MS_PER_DAY = 86_400_000;
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

function localTimestamp(time: number) {
  const date = new Date(time);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day}T${clock}`;
}

function durationOf(minutes: number) {
  const total = Math.round(minutes * SECONDS_PER_MINUTE);
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const restMinutes = Math.floor(total % SECONDS_PER_HOUR / SECONDS_PER_MINUTE);
  const seconds = total % SECONDS_PER_MINUTE;
  const hoursPart = hours === 0 ? "" : `${hours}H`;
  const minutesPart = restMinutes === 0 ? "" : `${restMinutes}M`;
  const secondsPart = seconds === 0 ? "" : `${seconds}S`;
  return `PT${hoursPart}${minutesPart}${secondsPart}`;
}

function triggerXml({ firstTime, periodInMinutes }: {
  firstTime: number;
  periodInMinutes: number | undefined;
}) {
  const start = `<StartBoundary>${localTimestamp(firstTime)}</StartBoundary>`;
  const isOneShot = periodInMinutes === undefined;
  if (isOneShot) {
    const end = `<EndBoundary>${localTimestamp(firstTime + MS_PER_DAY)}</EndBoundary>`;
    return `<TimeTrigger>${start}${end}<Enabled>true</Enabled></TimeTrigger>`;
  }

  return `<TimeTrigger>${start}<Enabled>true</Enabled><Repetition><Interval>${durationOf(periodInMinutes)}</Interval></Repetition></TimeTrigger>`;
}

/**
 * The Task Scheduler 1.2 definition of an alarm: a time trigger (repeating
 * for a periodic alarm) that starts the app again with the alarm's marker
 * argument, as the signed-in user with their normal rights, with no time
 * limit, and a start missed while the PC was off made up when it is next on.
 * A one-shot task deletes itself a day after its time. The `description`
 * carries what `Alarm` needs to be read back.
 *
 * @param options - The alarm (name, first time, period), the program with its
 *   leading arguments, the app's own arguments, whether it may start on
 *   battery, the description to store and the user (`DOMAIN\name`) the task
 *   belongs to.
 * @returns The XML text.
 * @throws {Error} When an argument holds a control character.
 */
export function alarmTaskXml({ alarm, command, extra, isBatteryAllowed, description, userId }: {
  alarm: {
    name: string;
    firstTime: number;
    periodInMinutes: number | undefined;
  };
  command: ProgramCommand;
  extra: readonly string[];
  isBatteryAllowed: boolean;
  description: string;
  userId: string;
}) {
  const program = commandLineOf({
    command: {
      program: command.program,
      arguments: []
    }
  });
  const marker = alarmArgument({
    name: alarm.name,
    firstTime: alarm.firstTime,
    ...alarm.periodInMinutes === undefined ? {} : { periodInMinutes: alarm.periodInMinutes }
  });
  const argumentLine = [...command.arguments, marker, ...extra].map(quoteArgument).join(" ");
  const isOneShot = alarm.periodInMinutes === undefined;
  const deleteXml = isOneShot ? "<DeleteExpiredTaskAfter>PT0S</DeleteExpiredTaskAfter>" : "";
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-16\"?>",
    "<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">",
    `<RegistrationInfo><Description>${escapeXml(description)}</Description></RegistrationInfo>`,
    `<Triggers>${triggerXml(alarm)}</Triggers>`,
    `<Principals><Principal id="Author"><UserId>${escapeXml(userId)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>`,
    `<Settings><MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy><DisallowStartIfOnBatteries>${!isBatteryAllowed}</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>${!isBatteryAllowed}</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT0S</ExecutionTimeLimit>${deleteXml}<Enabled>true</Enabled></Settings>`,
    `<Actions Context="Author"><Exec><Command>${escapeXml(program)}</Command><Arguments>${escapeXml(argumentLine)}</Arguments></Exec></Actions>`,
    "</Task>"
  ].join("\n");
}
