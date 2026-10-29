import { startMemoryHost } from "#examples/harness/memory-host.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

// The todo list's host: it owns the list, applies the actions the window
// sends and saves the list to a file after each change. A real app's host is
// another process (the window would reach it through a stdio or MessagePort
// transport); here it is in memory, so the app runs on its own.

export const TODO_NAME = "todos";

const todoSchema = z.object({
  id: z.number(),
  title: z.string(),
  isDone: z.boolean()
});
const listSchema = z.object({
  todos: z.array(todoSchema),
  nextId: z.number()
});
const actionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("add"),
    title: z.string().trim().min(1, "A task needs a title")
  }),
  z.object({
    kind: z.literal("toggle"),
    id: z.number()
  }),
  z.object({
    kind: z.literal("remove"),
    id: z.number()
  }),
  z.object({ kind: z.literal("clear") })
]);

export type Todo = z.infer<typeof todoSchema>;
export type TodoList = z.infer<typeof listSchema>;
export type TodoAction = z.infer<typeof actionSchema>;

const EMPTY: TodoList = {
  todos: [],
  nextId: 1
};

function load(file: string) {
  const isSaved = existsSync(file);
  if (!isSaved) {
    return EMPTY;
  }

  const parsed = listSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  return parsed.success ? parsed.data : EMPTY;
}

function apply({ state, action }: {
  state: TodoList;
  action: TodoAction;
}) {
  const isAdd = action.kind === "add";
  if (isAdd) {
    return {
      todos: [...state.todos, {
        id: state.nextId,
        title: action.title,
        isDone: false
      }],
      nextId: state.nextId + 1
    };
  }

  const isToggle = action.kind === "toggle";
  if (isToggle) {
    return {
      ...state,
      todos: state.todos.map(todo => todo.id === action.id ? {
        ...todo,
        isDone: !todo.isDone
      } : todo)
    };
  }

  const isRemove = action.kind === "remove";
  if (isRemove) {
    return {
      ...state,
      todos: state.todos.filter(todo => todo.id !== action.id)
    };
  }

  return {
    ...state,
    todos: state.todos.filter(todo => !todo.isDone)
  };
}

/** Starts the host over the list saved in `file` and returns the window's end of the link. */
export function startTodoHost(file: string) {
  return startMemoryHost<TodoList>({
    name: TODO_NAME,
    initial: load(file),
    reduce: ({ state, action }) => apply({
      state,
      action: actionSchema.parse(action)
    }),
    onChange: state => writeFileSync(file, JSON.stringify(state))
  });
}
