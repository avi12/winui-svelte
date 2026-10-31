// pnpm sets npm_execpath to what started it: its own script (run through Node)
// or, for the standalone build, the pnpm executable itself.

const EXECUTABLE_SUFFIX = ".exe";

export function invocationOf({ execPath, nodePath, args }: {
  execPath: string;
  nodePath: string;
  args: string[];
}) {
  const isExecutable = execPath.toLowerCase().endsWith(EXECUTABLE_SUFFIX);
  if (isExecutable) {
    return {
      command: execPath,
      args
    };
  }

  return {
    command: nodePath,
    args: [execPath, ...args]
  };
}

export function pnpmInvocation(args: string[]) {
  const execPath = process.env["npm_execpath"];
  const isRunThroughPnpm = execPath !== undefined;
  if (!isRunThroughPnpm) {
    return undefined;
  }

  return invocationOf({
    execPath,
    nodePath: process.execPath,
    args
  });
}
