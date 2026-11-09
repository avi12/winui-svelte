import type { NotificationContent, NotificationControl } from "./notification-content.ts";
import { scheduleToast } from "./notification-schedule.ts";
import type { NotificationBackend, NotificationSpec } from "./notify.ts";
import { ticksOf } from "./windows-time.ts";
import { hasPackageIdentity } from "#src/window/package-identity.js";
import {
  AppNotificationBuilder,
  AppNotificationButton,
  AppNotificationButtonStyle,
  AppNotificationComboBox,
  AppNotificationManager,
  AppNotificationProgressBar,
  AppNotificationProgressData,
  AppNotificationProgressResult,
  AppNotificationScenario,
  AppNotificationSetting,
  AppNotificationSoundEvent,
  Uri
} from "#src/winui.js";
import { pathToFileURL } from "node:url";

const ARGUMENT_SEPARATOR = ";";
const PAIR_SEPARATOR = "=";

const scenarios = {
  reminder: AppNotificationScenario.Reminder,
  alarm: AppNotificationScenario.Alarm,
  incomingCall: AppNotificationScenario.IncomingCall,
  urgent: AppNotificationScenario.Urgent
} as const;

const buttonStyles = {
  default: AppNotificationButtonStyle.Default,
  success: AppNotificationButtonStyle.Success,
  critical: AppNotificationButtonStyle.Critical
} as const;

/**
 * Reads the argument string a notification was built with back into pairs.
 *
 * @param argument - The `key=value;key=value` text.
 * @returns The pairs.
 */
export function argumentsOf(argument: string) {
  const pairs = argument.split(ARGUMENT_SEPARATOR).filter(pair => pair.length > 0).map(pair => {
    const iSeparator = pair.indexOf(PAIR_SEPARATOR);
    const isFlag = iSeparator < 0;
    if (isFlag) {
      return [pair, ""] as const;
    }

    return [pair.slice(0, iSeparator), pair.slice(iSeparator + 1)] as const;
  });
  return new Map<string, string>(pairs);
}

function soundEventOf(name: string) {
  const entry = Object.entries(AppNotificationSoundEvent).find(([key]) => key.toLowerCase() === name);
  return entry?.[1] ?? AppNotificationSoundEvent.Default;
}

function progressDataOf({ progress, sequence }: {
  progress: NonNullable<NotificationContent["progress"]>;
  sequence: number;
}) {
  const data = new AppNotificationProgressData(sequence);
  data.title = progress.title ?? "";
  data.status = progress.status ?? "";
  data.value = progress.value ?? 0;
  data.valueStringOverride = progress.valueStringOverride ?? "";
  return data;
}

// eslint-disable-next-line no-restricted-syntax -- reads as a conditional call; the pair is not a bag of options
function ifDefined<T>(value: T | undefined, apply: (defined: T) => void) {
  const isDefined = value !== undefined;
  if (isDefined) {
    apply(value);
  }
}

function addSelection({ builder, control }: {
  builder: AppNotificationBuilder;
  control: Extract<NotificationControl, { kind: "selection" }>;
}) {
  const box = new AppNotificationComboBox(control.id);
  box.setTitle(control.title ?? "");
  for (const item of control.items) {
    box.addItem(item.id, item.content);
  }

  ifDefined(control.selectedItem, selectedItem => box.setSelectedItem(selectedItem));
  builder.addComboBox(box);
}

function addButton({ builder, control }: {
  builder: AppNotificationBuilder;
  control: Extract<NotificationControl, { kind: "button" }>;
}) {
  const button = new AppNotificationButton(control.title);
  for (const [key, value] of control.arguments) {
    button.addArgument(key, value);
  }

  ifDefined(control.style, style => button.setButtonStyle(buttonStyles[style]));
  ifDefined(control.tooltip, tooltip => button.setToolTip(tooltip));
  ifDefined(control.iconUri, iconUri => button.setIcon(new Uri(iconUri)));
  ifDefined(control.inputId, inputId => button.setInputId(inputId));
  builder.addButton(button);
}

function addControl({ builder, control }: {
  builder: AppNotificationBuilder;
  control: NotificationControl;
}) {
  const isTextInput = control.kind === "text-input";
  if (isTextInput) {
    builder.addTextBox(control.id, control.placeholder ?? "", control.title ?? "");
    return;
  }

  const isSelection = control.kind === "selection";
  if (isSelection) {
    addSelection({
      builder,
      control
    });
    return;
  }

  addButton({
    builder,
    control
  });
}

function buildNotification(spec: NotificationSpec) {
  const builder = AppNotificationBuilder.create().addText(spec.title);
  ifDefined(spec.body, body => builder.addText(body));
  for (const [key, value] of spec.arguments) {
    builder.addArgument(key, value);
  }

  ifDefined(spec.tag, tag => builder.setTag(tag));
  ifDefined(spec.group, group => builder.setGroup(group));
  ifDefined(spec.iconUri, iconUri => builder.setAppLogoOverride(new Uri(iconUri)));
  ifDefined(spec.imageUri, imageUri => builder.setInlineImage(new Uri(imageUri)));
  ifDefined(spec.heroUri, heroUri => builder.setHeroImage(new Uri(heroUri)));
  ifDefined(spec.attribution, attribution => builder.setAttributionText(attribution));
  ifDefined(spec.timestamp, timestamp => builder.setTimeStamp(ticksOf(timestamp)));
  ifDefined(spec.scenario, scenario => builder.setScenario(scenarios[scenario]));
  const isMuted = spec.isSilent === true;
  if (isMuted) {
    builder.muteAudio();
  } else {
    ifDefined(spec.sound, sound => builder.setAudioEvent(soundEventOf(sound)));
  }

  for (const control of spec.controls ?? []) {
    addControl({
      builder,
      control
    });
  }

  const { progress } = spec;
  ifDefined(progress, () => builder.addProgressBar(
    AppNotificationProgressBar.create().bindTitle().bindStatus().bindValue().bindValueStringOverride()
  ));
  const notification = builder.buildNotification();
  ifDefined(spec.expiration, expiration => {
    notification.expiration = ticksOf(expiration);
  });
  ifDefined(progress, defined => {
    notification.progress = progressDataOf({
      progress: defined,
      sequence: 1
    });
  });
  return notification;
}

/**
 * The notification manager of the Windows App SDK as the source `notify` and
 * the web `Notification` show through.
 *
 * @returns The source, which reads \`AppNotificationManager\` when it is called.
 */
export function windowsNotificationSource() {
  function manager() {
    return AppNotificationManager.default_;
  }

  return {
    isSupported: () => AppNotificationManager.isSupported(),
    isEnabled: () => manager().setting === AppNotificationSetting.Enabled,
    register(identity) {
      const isUnidentified = identity === undefined;
      if (isUnidentified) {
        manager().register();
        return;
      }

      manager().register(identity.displayName, new Uri(pathToFileURL(identity.iconPath).href));
    },
    show(spec) {
      const notification = buildNotification(spec);
      manager().show(notification);
      return notification.id;
    },
    remove: id => manager().removeByIdAsync(id),
    async list() {
      const all = await manager().getAllAsync();
      return (all?.toArray() ?? []).map(item => ({
        id: item.id,
        tag: item.tag,
        group: item.group
      }));
    },
    removeAll: () => manager().removeAllAsync(),
    canSchedule: () => hasPackageIdentity(),
    schedule({ spec, showAt }) {
      return scheduleToast({
        payload: buildNotification(spec).payload,
        showAt,
        tag: spec.tag ?? "",
        group: spec.group ?? ""
      });
    },
    async updateProgress({ tag, group, sequence, progress }) {
      const data = progressDataOf({
        progress: progress ?? {},
        sequence
      });
      const result = await manager().updateAsync(data, tag, group);
      return result === AppNotificationProgressResult.Succeeded;
    },
    onInvoked(callback) {
      return manager().onNotificationInvoked((_sender, args) => {
        callback({
          argument: args.argument,
          arguments: argumentsOf(args.argument),
          readInput: id => args.userInput?.get(id)
        });
      });
    }
  } satisfies NotificationBackend;
}
