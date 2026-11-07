const JUMP_LIST_PREFIX = "--winui-svelte-jump-list=";

/** What a jump list task id may hold: it travels in a command line and comes back as it was. */
export const JUMP_LIST_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/u;

/**
 * The argument a jump list task puts first on its command line, naming the task.
 *
 * @param taskId - The task's id.
 * @returns The argument.
 */
export function jumpListArgument(taskId: string) {
  return `${JUMP_LIST_PREFIX}${taskId}`;
}

/**
 * Splits the task marker off an activation's arguments.
 *
 * @param values - The arguments.
 * @returns The task id (undefined when no task started this) and the other arguments.
 */
export function splitJumpListArgument(values: readonly string[]) {
  const marker = values.find(value => value.startsWith(JUMP_LIST_PREFIX));
  const taskId = marker?.slice(JUMP_LIST_PREFIX.length);
  const isTask = taskId !== undefined && JUMP_LIST_ID_PATTERN.test(taskId);
  return {
    taskId: isTask ? taskId : undefined,
    rest: isTask ? values.filter(value => value !== marker) : values
  };
}
