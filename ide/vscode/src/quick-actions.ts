import { conversionsOfDocument, convertedDocument, editTo } from "./convert-document.ts";
import { titleOf } from "./css-rewrite.ts";
import { Command, SVELTE_LANGUAGE } from "./ids.ts";
import { applyEdits } from "./text-edit.ts";
import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  DiagnosticSeverity,
  languages,
  Range,
  window,
  workspace
} from "vscode";
import type { ExtensionContext, TextDocument } from "vscode";

const SVELTE = { language: SVELTE_LANGUAGE };
const FIX_ALL_KIND = CodeActionKind.SourceFixAll.append("winuiSvelte");
const FIX_ALL_TITLE = "Convert all winui-svelte attributes to CSS in this file";
const DIAGNOSTIC_SOURCE = "winui-svelte";
const DIAGNOSTIC_CODE = "cssCounterpart";

function rangeOf({ document, start, end }: {
  document: TextDocument;
  start: number;
  end: number;
}) {
  return new Range(document.positionAt(start), document.positionAt(end));
}

async function refreshDiagnostics({ document, collection }: {
  document: TextDocument;
  collection: ReturnType<typeof languages.createDiagnosticCollection>;
}) {
  const isSvelte = document.languageId === SVELTE.language;
  if (!isSvelte) {
    return;
  }

  const conversions = await conversionsOfDocument(document);
  collection.set(
    document.uri, conversions.map(conversion => {
      const { attribute } = conversion;
      const diagnostic = new Diagnostic(
        rangeOf({
          document,
          start: attribute.start,
          end: attribute.end
        }),
        `${attribute.name} has a CSS counterpart`,
        DiagnosticSeverity.Hint
      );
      diagnostic.source = DIAGNOSTIC_SOURCE;
      diagnostic.code = DIAGNOSTIC_CODE;
      return diagnostic;
    })
  );
}

async function provideCodeActions({ document, range }: {
  document: TextDocument;
  range: Range;
}) {
  const conversions = await conversionsOfDocument(document);
  const hasNothing = conversions.length === 0;
  if (hasNothing) {
    return [];
  }

  const text = document.getText();
  const here = conversions.filter(conversion => range.intersection(
    rangeOf({
      document,
      start: conversion.attribute.start,
      end: conversion.attribute.end
    })
  ) !== undefined);
  const fixes = here.map(conversion => {
    const action = new CodeAction(titleOf(conversion.rewrite), CodeActionKind.QuickFix);
    action.edit = editTo({
      document,
      after: applyEdits({
        text,
        edits: conversion.edits
      })
    });
    return action;
  });
  const fixAll = new CodeAction(FIX_ALL_TITLE, FIX_ALL_KIND);
  fixAll.edit = editTo({
    document,
    after: convertedDocument(document).text
  });
  const convertAll = new CodeAction(FIX_ALL_TITLE, CodeActionKind.QuickFix);
  convertAll.command = {
    command: Command.CONVERT_FILE,
    title: FIX_ALL_TITLE
  };
  return [...fixes, convertAll, fixAll];
}

/**
 * Registers the quick fixes (one prop, or everything in the file), the fix-all-on-save kind and the hints that
 * mark the props that have a CSS counterpart.
 */
export function registerQuickActions(context: ExtensionContext) {
  const collection = languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  function refresh(document: TextDocument) {
    refreshDiagnostics({
      document,
      collection
    }).catch(error => window.showErrorMessage(String(error)));
  }

  for (const document of workspace.textDocuments) {
    refresh(document);
  }

  context.subscriptions.push(
    collection,
    workspace.onDidOpenTextDocument(refresh),
    workspace.onDidChangeTextDocument(change => refresh(change.document)),
    workspace.onDidCloseTextDocument(document => collection.delete(document.uri)),
    languages.registerCodeActionsProvider(SVELTE, {
      provideCodeActions: (document, range) => provideCodeActions({
        document,
        range
      })
    }, { providedCodeActionKinds: [CodeActionKind.QuickFix, FIX_ALL_KIND] })
  );
}
