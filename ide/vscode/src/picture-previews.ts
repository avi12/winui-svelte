import { pictureCaption, PLACEHOLDER_SVG } from "winui-svelte-ide/picture-image.ts";
import { PictureState } from "winui-svelte-ide/picture-load.ts";
import { createRemotePictures } from "winui-svelte-ide/picture-remote.ts";
import { backgroundOf, hoverGroup, resolvedPictures } from "winui-svelte-ide/picture-resolve.ts";
import type { ResolvedPicture } from "winui-svelte-ide/picture-resolve.ts";
import { pictureTables } from "winui-svelte-ide/picture-spec.ts";
import { Setting, SVELTE_LANGUAGE } from "./ids.ts";
import path from "node:path";
import {
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  languages,
  MarkdownString,
  Range,
  Uri,
  window,
  workspace
} from "vscode";
import type { ExtensionContext, TextDocument, ThemableDecorationAttachmentRenderOptions } from "vscode";

const SVELTE = { language: SVELTE_LANGUAGE };
const PICTURES = "picture";
const REMOTE_PICTURES = "remotePictures";
const INLINE_GAP = "0 3px 0 0";
const WARNING_SOURCE = "winui-svelte";
const PLACEHOLDER = `data:image/svg+xml;base64,${Buffer.from(PLACEHOLDER_SVG).toString("base64")}`;

type Resolved = ResolvedPicture[];

const cache = new Map<string, {
  version: number;
  resolved: Resolved;
}>();

function configuration() {
  return workspace.getConfiguration(Setting.SECTION);
}

function isEnabled() {
  return configuration().get<boolean>(`${Setting.PREVIEWS}.${PICTURES}`, true);
}

function isRemoteEnabled() {
  return configuration().get<boolean>(`${Setting.PREVIEWS}.${REMOTE_PICTURES}`, true) && workspace.isTrusted;
}

function lineOf({ resolved, theme }: {
  resolved: ResolvedPicture;
  theme: string;
}) {
  const { picture, spot } = resolved;
  const hasPicture = picture.state === PictureState.SHOWN && picture.dataUri !== undefined;
  if (!hasPicture) {
    const lookedIn = picture.candidates.length > 0 ? `, looked in ${picture.candidates.join(", ")}` : "";
    return `**${picture.name}**${theme}: ${picture.note}${lookedIn}`;
  }

  const background = backgroundOf(spot.variant);
  const style = background === undefined ? "" : `background-color:${background};`;
  const caption = picture.size === undefined ? picture.name : pictureCaption({
    name: picture.name,
    size: picture.size,
    byteSize: picture.byteSize
  });
  return `<span style="${style}"><img src="${picture.dataUri}" height="${pictureTables.limits.hoverSize}"></span>\n\n${caption}${theme}`;
}

// The hover of one picture; a light or dark taskbar picture shows with its partner of the same object.
function hoverMarkdown({ resolved, target }: {
  resolved: Resolved;
  target: ResolvedPicture;
}) {
  return hoverGroup({
    resolved,
    target
  }).map(({ entry, theme }) => lineOf({
    resolved: entry,
    theme
  })).join("\n\n");
}

function beforeOf(resolved: ResolvedPicture) {
  const { picture, spot } = resolved;
  const isShown = picture.state === PictureState.SHOWN && picture.dataUri !== undefined;
  const background = backgroundOf(spot.variant);
  if (isShown) {
    return {
      contentIconPath: Uri.parse(picture.dataUri ?? ""),
      width: `${pictureTables.limits.inlineSize}px`,
      height: `${pictureTables.limits.inlineSize}px`,
      margin: INLINE_GAP,
      ...background === undefined ? {} : { backgroundColor: background }
    } satisfies ThemableDecorationAttachmentRenderOptions;
  }

  return {
    contentIconPath: Uri.parse(PLACEHOLDER),
    width: `${pictureTables.limits.inlineSize}px`,
    height: `${pictureTables.limits.inlineSize}px`,
    margin: INLINE_GAP
  } satisfies ThemableDecorationAttachmentRenderOptions;
}

/**
 * The picture previews: the picture beside the path of every prop, option and object key the library types as a
 * picture (found in the shared IDE data), a larger hover with the name, size and, for an .ico, its frames, the light
 * and dark taskbar pictures side by side on their backgrounds, and a warning for a file that is not there.
 * Remote pictures are fetched only with winuiSvelte.previews.remotePictures on, with a timeout, a size cap and an
 * on-disk cache.
 */
export function registerPictureViews(context: ExtensionContext) {
  const type = window.createTextEditorDecorationType({});
  const diagnostics = languages.createDiagnosticCollection("winui-svelte-pictures");
  const cacheFolder = path.join(context.globalStorageUri.fsPath, pictureTables.remote.cacheFolder);
  const remote = createRemotePictures({
    cacheFolder,
    onSettled: refreshAll
  });

  async function resolve(document: TextDocument) {
    const key = document.uri.toString();
    const cached = cache.get(key);
    const isFresh = cached?.version === document.version;
    if (isFresh) {
      return cached.resolved;
    }

    const resolved = isEnabled() ? await resolvedPictures({
      text: document.getText(),
      file: document.uri.fsPath,
      isRemoteEnabled: isRemoteEnabled(),
      remote,
      isMarkup: true
    }) : [];
    cache.set(key, {
      version: document.version,
      resolved
    });
    return resolved;
  }

  async function refresh(document: TextDocument) {
    const resolved = await resolve(document);
    for (const editor of window.visibleTextEditors.filter(visible => visible.document === document)) {
      editor.setDecorations(
        type, resolved.map(entry => {
          const position = document.positionAt(entry.spot.start);
          return {
            range: new Range(position, position),
            renderOptions: {
              before: beforeOf(entry)
            }
          };
        })
      );
    }

    diagnostics.set(
      document.uri, resolved.filter(entry => entry.picture.state === PictureState.MISSING).map(entry => {
        const range = new Range(document.positionAt(entry.spot.start), document.positionAt(entry.spot.end));
        const diagnostic = new Diagnostic(range, `Picture file not found: ${entry.picture.name}`, DiagnosticSeverity.Warning);
        diagnostic.source = WARNING_SOURCE;
        return diagnostic;
      })
    );
  }

  function refreshQuietly(document: TextDocument) {
    refresh(document).catch(error => window.showErrorMessage(String(error)));
  }

  function refreshAll() {
    cache.clear();
    for (const editor of window.visibleTextEditors) {
      refreshQuietly(editor.document);
    }
  }

  refreshAll();
  context.subscriptions.push(
    type,
    diagnostics,
    window.onDidChangeVisibleTextEditors(refreshAll),
    workspace.onDidChangeTextDocument(change => refreshQuietly(change.document)),
    workspace.onDidChangeConfiguration(event => event.affectsConfiguration(Setting.SECTION) && refreshAll()),
    languages.registerHoverProvider(SVELTE, {
      async provideHover(document, position) {
        const resolved = await resolve(document);
        const offset = document.offsetAt(position);
        const found = resolved.find(entry => entry.spot.start <= offset && offset <= entry.spot.end);
        const hasNoPicture = found === undefined;
        if (hasNoPicture) {
          return undefined;
        }

        const markdown = new MarkdownString(hoverMarkdown({
          resolved,
          target: found
        }));
        markdown.supportHtml = true;
        const range = new Range(document.positionAt(found.spot.start), document.positionAt(found.spot.end));
        return new Hover(markdown, range);
      }
    })
  );
}
