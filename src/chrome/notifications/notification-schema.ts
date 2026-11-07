import { NotificationTemplateType } from "./notification-types.ts";
import { z } from "zod";

const MAX_BUTTONS = 2;
const MIN_PRIORITY = -2;
const MAX_PRIORITY = 2;
const MAX_PROGRESS = 100;

const optionsSchema = z.object({
  type: z.enum(Object.values(NotificationTemplateType)),
  title: z.string(),
  message: z.string(),
  iconUrl: z.string(),
  contextMessage: z.string(),
  priority: z.number().int().min(MIN_PRIORITY).max(MAX_PRIORITY),
  eventTime: z.number(),
  buttons: z.array(
    z.object({
      title: z.string(),
      iconUrl: z.string().optional()
    })
  ).max(MAX_BUTTONS),
  imageUrl: z.string(),
  items: z.array(
    z.object({
      title: z.string(),
      message: z.string()
    })
  ),
  progress: z.number().int().min(0).max(MAX_PROGRESS),
  isClickable: z.boolean(),
  requireInteraction: z.boolean(),
  silent: z.boolean()
}).partial();

const requiredByType = new Map<string, "imageUrl" | "items" | "progress">([
  [NotificationTemplateType.IMAGE, "imageUrl"],
  [NotificationTemplateType.LIST, "items"],
  [NotificationTemplateType.PROGRESS, "progress"]
]);

function parseOrThrow(input: unknown) {
  const result = optionsSchema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }

  return result.data;
}

/** The options of an `update`, checked: every member is optional. */
export function parseChanges(input: unknown) {
  return parseOrThrow(input);
}

/**
 * The options of a complete notification, checked: `type`, `title` and
 * `message` are required, and so is the member the template reads.
 */
export function parseComplete(input: unknown) {
  const options = parseOrThrow(input);
  const { type, title, message } = options;
  const isMissing = type === undefined || title === undefined || message === undefined;
  if (isMissing) {
    throw new Error("Some of the required properties are missing: type, title and message");
  }

  const needed = requiredByType.get(type);
  const isTemplateMemberMissing = needed !== undefined && options[needed] === undefined;
  if (isTemplateMemberMissing) {
    throw new Error(`A ${type} notification needs ${needed}`);
  }

  return {
    ...options,
    type,
    title,
    message
  };
}
