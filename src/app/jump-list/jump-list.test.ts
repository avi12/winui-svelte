import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

// The jump list over a stand-in for the shell: the shell link of each task
// (order, quoting, the marker), the AppUserModelID check, the validation
// errors, and the id coming back through a classified activation.

const { clearJumpList, setJumpListTasks } = await import("./index.ts");
const { classifyActivation } = await import("#src/app/activation/classify.js");
const { ActivationKind } = await import("#src/app/activation/kinds.js");

const APP_ID = "dev.example.notes";
const COMMAND = {
  program: path.join("C:", "node", "node.exe"),
  arguments: ["--no-warnings", path.join("C:", "apps", "my notes", "main.js")]
};

function fakeShell(current: string | null = APP_ID) {
  const calls: string[] = [];
  const replaced: Array<{
    appUserModelId: string;
    links: ReadonlyArray<{
      arguments: string;
      title: string;
      path: string;
      iconPath: string | null;
      iconIndex: number;
      description: string | null;
    }>;
  }> = [];
  return {
    calls,
    replaced,
    backend: {
      currentAppUserModelId: () => current,
      replaceTasks(options: (typeof replaced)[number]) {
        calls.push("replace");
        replaced.push(options);
      },
      deleteList: (id: string) => calls.push(`delete ${id}`)
    }
  };
}

test("each task becomes a shell link in order, led by the launch command and the marker", () => {
  const { backend, replaced } = fakeShell();
  setJumpListTasks({
    tasks: [
      {
        id: "new-note",
        title: "New note",
        arguments: ["--new", "two words"],
        description: "Starts a note"
      },
      {
        id: "inbox",
        title: "Inbox",
        arguments: [],
        icon: "app.ico",
        iconIndex: 2
      }
    ],
    command: COMMAND,
    backend
  });
  const [call] = replaced;
  assert.equal(call?.appUserModelId, APP_ID);
  assert.deepEqual(call?.links.map(link => link.title), ["New note", "Inbox"]);
  assert.equal(call?.links[0]?.path, COMMAND.program);
  assert.equal(call?.links[0]?.arguments, "--no-warnings \"C:\\apps\\my notes\\main.js\" --winui-svelte-jump-list=new-note --new \"two words\"");
  assert.equal(call?.links[0]?.description, "Starts a note");
  assert.equal(call?.links[1]?.iconPath, path.resolve("app.ico"));
  assert.equal(call?.links[1]?.iconIndex, 2);
});

test("an argument with a quote or a trailing backslash is escaped so it reads back whole", () => {
  const { backend, replaced } = fakeShell();
  setJumpListTasks({
    tasks: [
      {
        id: "odd",
        title: "Odd",
        arguments: ["say \"hi\"", "C:\\folder with space\\"]
      }
    ],
    command: COMMAND,
    backend
  });
  assert.match(replaced[0]?.links[0]?.arguments ?? "", /--winui-svelte-jump-list=odd "say \\"hi\\"" "C:\\folder with space\\\\"$/u);
});

test("the AppUserModelID must be the process's own", () => {
  const tasks = [
    {
      id: "a",
      title: "A",
      arguments: []
    }
  ] as const;
  assert.throws(() => setJumpListTasks({
    tasks,
    command: COMMAND,
    backend: fakeShell(null).backend
  }), /needs the process's AppUserModelID/u);
  assert.throws(() => setJumpListTasks({
    tasks,
    appUserModelId: "other.id",
    command: COMMAND,
    backend: fakeShell().backend
  }), /differs from the process's/u);
  const { backend, replaced } = fakeShell();
  setJumpListTasks({
    tasks,
    appUserModelId: APP_ID,
    command: COMMAND,
    backend
  });
  assert.equal(replaced.length, 1);
});

test("a bad id, a repeated id, an empty title and a remote icon are refused before the shell is called", () => {
  const { backend, calls } = fakeShell();
  function refuse({ tasks, message }: {
    tasks: ReadonlyArray<{
      id: string;
      title: string;
      arguments: readonly string[];
      icon?: string;
    }>;
    message: RegExp;
  }) {
    assert.throws(() => setJumpListTasks({
      tasks,
      command: COMMAND,
      backend
    }), message);
  }
  const base = {
    title: "T",
    arguments: []
  };
  refuse({
    tasks: [{
      ...base,
      id: "has space"
    }],
    message: /not a valid jump list task id/u
  });
  refuse({
    tasks: [{
      ...base,
      id: "x"
    }, {
      ...base,
      id: "x"
    }],
    message: /used twice/u
  });
  refuse({
    tasks: [{
      id: "x",
      title: "",
      arguments: []
    }],
    message: /title of task 'x'/u
  });
  refuse({
    tasks: [{
      ...base,
      id: "x",
      icon: "https://example.com/a.ico"
    }],
    message: /must be a file path/u
  });
  assert.deepEqual(calls, []);
});

test("the task id comes back through the activation and matches the task", async () => {
  const { backend } = fakeShell();
  const list = setJumpListTasks({
    tasks: [
      {
        id: "new-note",
        title: "New note",
        arguments: ["--new"]
      },
      {
        id: "inbox",
        title: "Inbox",
        arguments: []
      }
    ],
    command: COMMAND,
    backend
  });
  const event = await classifyActivation({
    activation: {
      arguments: ["--winui-svelte-jump-list=new-note", "--new"],
      workingDirectory: process.cwd()
    },
    isRedirect: true
  });
  assert.equal(event.kind, ActivationKind.jumpList);
  assert.deepEqual(event.arguments, ["--new"]);
  assert.equal(list.taskOf(event)?.id, "new-note");
  const plain = await classifyActivation({
    activation: {
      arguments: [],
      workingDirectory: process.cwd()
    },
    isRedirect: true
  });
  assert.equal(list.taskOf(plain), undefined);
  const forged = await classifyActivation({
    activation: {
      arguments: ["--winui-svelte-jump-list=not a task"],
      workingDirectory: process.cwd()
    },
    isRedirect: true
  });
  assert.equal(forged.kind, ActivationKind.redirect);
});

test("clearing deletes the list of the process's AppUserModelID", () => {
  const { backend, calls } = fakeShell();
  clearJumpList({ backend });
  clearJumpList({
    appUserModelId: APP_ID,
    backend
  });
  assert.deepEqual(calls, [`delete ${APP_ID}`, `delete ${APP_ID}`]);
  assert.throws(() => clearJumpList({
    appUserModelId: "other",
    backend
  }), /differs/u);
});
