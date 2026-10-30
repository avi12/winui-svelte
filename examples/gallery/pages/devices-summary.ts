const AFFIRMATIVE = "yes";
const NEGATIVE = "no";
const NONE = "none";

function yesOrNo(isTrue: boolean) {
  return isTrue ? AFFIRMATIVE : NEGATIVE;
}

function countOr(options: {
  isPresent: boolean;
  count: number;
  unit: string;
}) {
  return options.isPresent ? `${options.count} ${options.unit}` : NONE;
}

/** The input devices as one line of text. */
export function inputSummary(input: {
  hasMouse: boolean;
  mouseButtons: number;
  hasKeyboard: boolean;
  hasTouch: boolean;
  touchContacts: number;
  hasPen: boolean;
}) {
  const mouse = countOr({
    isPresent: input.hasMouse,
    count: input.mouseButtons,
    unit: "buttons"
  });
  const touch = countOr({
    isPresent: input.hasTouch,
    count: input.touchContacts,
    unit: "contacts"
  });
  return `Mouse ${mouse}, keyboard ${yesOrNo(input.hasKeyboard)}, touch ${touch}, pen ${yesOrNo(input.hasPen)}`;
}

/** The battery as one line of text. */
export function batterySummary(power: {
  hasBattery: boolean;
  percent: number;
  isOnAcPower: boolean;
}) {
  const charge = power.hasBattery ? `${power.percent}%` : NONE;
  return `Battery ${charge}, ${power.isOnAcPower ? "on AC power" : "on battery"}`;
}

/** The network as one line of text. */
export function networkSummary(network: {
  isOnline: boolean;
  profileName: string;
  isMetered: boolean;
}) {
  const name = network.isOnline ? network.profileName : "offline";
  return `Network ${name}${network.isMetered ? " (metered)" : ""}`;
}

/** A name with the marks that apply to it, such as "(default)". */
export function marked(options: {
  name: string;
  marks: Record<string, boolean>;
}) {
  const applied = Object.entries(options.marks).filter(([, isOn]) => isOn).map(([mark]) => ` (${mark})`);
  return `${options.name}${applied.join("")}`;
}
