/** The folder of Task Scheduler that holds every task this package makes. */
export const TASK_FOLDER = "\\winui-svelte\\";

/** What Task Scheduler is asked to do; a test gives a fake. */
export interface TaskBackend {
  /** The user (`DOMAIN\name` or a SID) the tasks belong to. */
  userId(): string;

  /** Registers a task from its XML, replacing one of the same name. */
  create(options: {
    name: string;
    xml: string;
  }): void;

  /** The full names of the tasks in `TASK_FOLDER`. */
  list(): readonly string[];

  /** Deletes a task by its full name; false when there is none. */
  remove(name: string): boolean;
}
