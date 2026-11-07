import { splitJumpListArgument } from "./jump-list-argument.ts";
import { ActivationKind } from "./kinds.ts";
import type { ActivationEvent } from "./kinds.ts";
import { STARTUP_ARGUMENT } from "./registration.ts";
import { isRegistrableScheme } from "./scheme.ts";
import type { Activation } from "#src/app/redirect.js";
import { stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const MAX_ARGUMENTS = 1024;
const MAX_ARGUMENT_LENGTH = 32_767;
const MAX_URI_LENGTH = 8192;
const SCHEME_END = ":";
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;

// What a command line may hold: strings of the length Windows allows, none
// with a NUL. They are data: nothing here ever runs one.
const argumentsSchema = z.array(z.string().max(MAX_ARGUMENT_LENGTH).refine(text => !text.includes("\0"))).max(MAX_ARGUMENTS);

function protocolOf(argument: string) {
  const end = argument.indexOf(SCHEME_END);
  const hasScheme = end > 0;
  if (!hasScheme) {
    return undefined;
  }

  const scheme = argument.slice(0, end).toLowerCase();
  const isAddress = isRegistrableScheme(scheme) && argument.length <= MAX_URI_LENGTH && !CONTROL_PATTERN.test(argument);
  return isAddress ? scheme : undefined;
}

function firstProtocol(values: readonly string[]) {
  for (const uri of values) {
    const scheme = protocolOf(uri);
    const isAddress = scheme !== undefined;
    if (isAddress) {
      return {
        uri,
        scheme
      };
    }
  }

  return undefined;
}

async function isFile(candidate: string) {
  const status = await stat(candidate).catch(() => undefined);
  return status?.isFile() ?? false;
}

async function existingFiles({ candidates, workingDirectory, extensions }: {
  candidates: readonly string[];
  workingDirectory: string;
  extensions: ReadonlySet<string> | undefined;
}) {
  const files: string[] = [];
  for (const candidate of candidates) {
    const full = path.resolve(workingDirectory, candidate);
    const isWanted = extensions === undefined || extensions.has(path.extname(full).toLowerCase());
    const isExisting = isWanted && await isFile(full);
    if (isExisting) {
      files.push(full);
    }
  }

  return files;
}

/**
 * Turns what a start or a redirect carried into the one typed event: a jump
 * list task marker is a `jumpList` activation, else the first valid address is
 * a `protocol` activation, else existing files are a `file` one, else
 * `startup` when the startup marker is there, else `redirect` or `launch` by
 * who sent it. An argument that fits none is left in `arguments`.
 *
 * @param options - The raw activation, whether a later copy sent it, and the
 *   extensions a file must have (any when omitted).
 * @returns The event.
 * @throws {z.ZodError} When the arguments are too many, too long or hold a NUL.
 */
export async function classifyActivation({ activation, isRedirect, extensions }: {
  activation: Activation;
  isRedirect: boolean;
  extensions?: ReadonlySet<string>;
}) {
  const { workingDirectory } = activation;
  const all = argumentsSchema.parse(activation.arguments);
  const isStartup = !isRedirect && all.includes(STARTUP_ARGUMENT);
  const { taskId, rest: values } = splitJumpListArgument(all.filter(value => value !== STARTUP_ARGUMENT));
  const base = {
    isRedirect,
    arguments: values,
    workingDirectory
  };
  const isJumpListTask = taskId !== undefined;
  if (isJumpListTask) {
    return {
      ...base,
      taskId,
      kind: ActivationKind.jumpList
    } satisfies ActivationEvent;
  }

  const address = firstProtocol(values);
  const isProtocol = address !== undefined;
  if (isProtocol) {
    return {
      ...base,
      ...address,
      kind: ActivationKind.protocol
    } satisfies ActivationEvent;
  }

  const files = await existingFiles({
    candidates: values,
    workingDirectory,
    extensions
  });
  const hasFiles = files.length > 0;
  if (hasFiles) {
    return {
      ...base,
      kind: ActivationKind.file,
      files
    } satisfies ActivationEvent;
  }

  if (isStartup) {
    return {
      ...base,
      kind: ActivationKind.startup
    } satisfies ActivationEvent;
  }

  return {
    ...base,
    kind: isRedirect ? ActivationKind.redirect : ActivationKind.launch
  } satisfies ActivationEvent;
}
