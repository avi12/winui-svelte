import { conversionsIn, convertText, Destination } from "./attribute-rewriter.ts";
import { Setting } from "./ids.ts";
import { minimalEdit } from "./minimal-edit.ts";
import { isWinuiFile } from "./winui-project.ts";
import { Range, workspace, WorkspaceEdit } from "vscode";
import type { TextDocument } from "vscode";

/**
 * Where a converted prop goes, as the user chose in the settings: a rule in `<style>` or a `style:` directive.
 */
export function destinationSetting() {
  const chosen = workspace.getConfiguration(Setting.SECTION).get(Setting.DESTINATION);
  return chosen === Destination.STYLE_DIRECTIVE ? Destination.STYLE_DIRECTIVE : Destination.STYLE_BLOCK;
}

/**
 * Adds to the edit what makes the document the text after: only the part that differs is replaced.
 */
export function addEditTo({ workspaceEdit, document, after }: {
  workspaceEdit: WorkspaceEdit;
  document: TextDocument;
  after: string;
}) {
  const edit = minimalEdit({
    before: document.getText(),
    after
  });
  const range = new Range(document.positionAt(edit.start), document.positionAt(edit.end));
  workspaceEdit.replace(document.uri, range, edit.text);
}

/**
 * The edit that makes the document the text after.
 */
export function editTo({ document, after }: {
  document: TextDocument;
  after: string;
}) {
  const workspaceEdit = new WorkspaceEdit();
  addEditTo({
    workspaceEdit,
    document,
    after
  });
  return workspaceEdit;
}

/**
 * Whether the document is in a project that depends on winui-svelte.
 */
export async function isWinuiDocument(document: TextDocument) {
  return isWinuiFile(document.uri.fsPath);
}

/**
 * What a document of a project that depends on winui-svelte can convert now; nothing in any other.
 */
export async function conversionsOfDocument(document: TextDocument) {
  const isWinui = await isWinuiDocument(document);
  return isWinui ? conversionsIn({
    fileText: document.getText(),
    destination: destinationSetting()
  }) : [];
}

/**
 * The document with everything convertible converted, and how many attributes moved.
 */
export function convertedDocument(document: TextDocument) {
  return convertText({
    fileText: document.getText(),
    destination: destinationSetting()
  });
}
