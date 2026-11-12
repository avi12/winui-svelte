import {
  addEditTo,
  conversionsOfDocument,
  convertedDocument,
  editTo,
  isWinuiDocument
} from "./convert-document.ts";
import { Command, SVELTE_LANGUAGE } from "./ids.ts";
import { reportSummary, SkipReason } from "./report.ts";
import {
  commands,
  FileType,
  Uri,
  window,
  workspace,
  WorkspaceEdit
} from "vscode";
import type { ExtensionContext } from "vscode";

const SVELTE_EXTENSION = ".svelte";
const SKIPPED_FOLDERS = new Set(["node_modules", ".git", "dist", ".verify", ".winapp"]);

// A function that calls itself needs its return type written: TypeScript cannot infer one that refers to itself
async function svelteFilesIn(uri: Uri): Promise<Uri[]>;
async function svelteFilesIn(uri: Uri) {
  const { type } = await workspace.fs.stat(uri);
  const isFolder = (type & FileType.Directory) !== 0;
  if (!isFolder) {
    return uri.path.endsWith(SVELTE_EXTENSION) ? [uri] : [];
  }

  const entries = await workspace.fs.readDirectory(uri);
  const nested = await Promise.all(
    entries
      .filter(([name]) => !SKIPPED_FOLDERS.has(name))
      .map(([name]) => svelteFilesIn(Uri.joinPath(uri, name)))
  );
  return nested.flat();
}

async function convertActiveFile() {
  const document = window.activeTextEditor?.document;
  const isNotSvelte = document === undefined || document.languageId !== SVELTE_LANGUAGE;
  if (isNotSvelte) {
    await window.showInformationMessage("Open a Svelte file to convert its winui-svelte attributes");
    return;
  }

  const conversions = await conversionsOfDocument(document);
  const hasNothing = conversions.length === 0;
  if (hasNothing) {
    await window.showInformationMessage("Nothing to convert in this file");
    return;
  }

  const { text, count } = convertedDocument(document);
  await workspace.applyEdit(
    editTo({
      document,
      after: text
    })
  );
  await window.showInformationMessage(`${count} attributes converted`);
}

async function convertSelection({ clicked, selected }: {
  clicked: Uri | undefined;
  selected: Uri[] | undefined;
}) {
  const targets = selected ?? (clicked === undefined ? [] : [clicked]);
  const files = (await Promise.all(targets.map(svelteFilesIn))).flat();
  const edit = new WorkspaceEdit();
  const skipped = new Map<SkipReason, number>();
  let attributes = 0;
  let changedFiles = 0;
  for (const file of files) {
    const document = await workspace.openTextDocument(file);
    const isWinui = await isWinuiDocument(document);
    const { text, count } = isWinui ? convertedDocument(document) : {
      text: "",
      count: 0
    };
    const hasChange = count > 0;
    if (!hasChange) {
      const reason = isWinui ? SkipReason.NOTHING_TO_CONVERT : SkipReason.NO_DEPENDENCY;
      skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
      continue;
    }

    addEditTo({
      workspaceEdit: edit,
      document,
      after: text
    });
    attributes += count;
    changedFiles += 1;
  }

  await workspace.applyEdit(edit);
  await window.showInformationMessage(
    reportSummary({
      attributes,
      changedFiles,
      skipped
    })
  );
}

function runConvertSelection(clicked: Uri | undefined, selected: Uri[] | undefined) {
  return convertSelection({
    clicked,
    selected
  });
}

/**
 * Registers the commands that convert the open file and the files and folders selected in the explorer.
 */
export function registerConvertCommands(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand(Command.CONVERT_FILE, convertActiveFile),
    commands.registerCommand(Command.CONVERT_SELECTION, runConvertSelection)
  );
}
