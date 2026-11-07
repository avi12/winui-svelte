import { Setting, SVELTE_LANGUAGE } from "./ids.ts";
import { scanAttributes, scanExpressionAttributes } from "./markup-scan.ts";
import { isPictureAttribute, pictureNames, WRAPPER_TYPE } from "./picture-data.ts";
import { pictureCaption } from "./picture-image.ts";
import { loadPicture, PictureState } from "./picture-load.ts";
import { pictureTables } from "./picture-spec.ts";
import {
  expressionSpots,
  keySpots,
  plainSpots,
  uniqueSpots,
  Variant
} from "./picture-spots.ts";
import { isTypedProp } from "./typed-prop.ts";
import { isWinuiFile, projectRootOf } from "./winui-project.ts";
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
const HINT_COLOR = "#888888";
const WARNING_SOURCE = "winui-svelte";

const HINTS = {
  [PictureState.MISSING]: "file not found",
  [PictureState.REMOTE_OFF]: "remote picture, previews are off",
  [PictureState.REMOTE_FAILED]: "remote picture not fetched",
  [PictureState.TOO_LARGE]: "too large to preview",
  [PictureState.SHOWN]: ""
} as const satisfies Record<PictureState, string>;

type Resolved = Awaited<ReturnType<typeof resolvedSpots>>;

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
  return configuration().get<boolean>(`${Setting.PREVIEWS}.${REMOTE_PICTURES}`, false);
}

async function attributeSpots({ text, file }: {
  text: string;
  file: string;
}) {
  const names = pictureNames();
  function isPicture({ tag, attribute }: {
    tag: string;
    attribute: string;
  }) {
    return isTypedProp({
      isOwn: isPictureAttribute({
        tag,
        attribute
      }),
      inputType: WRAPPER_TYPE,
      tag,
      attribute,
      documentText: text,
      documentFile: file
    });
  }

  const plain = await Promise.all(
    scanAttributes(text).map(async found => {
      const isPictureProp = await isPicture(found);
      return isPictureProp ? plainSpots({
        attribute: found.attribute,
        value: found.value,
        start: found.valueStart,
        names
      }) : [];
    })
  );
  const expressions = await Promise.all(
    scanExpressionAttributes(text).map(async found => {
      const isPictureProp = await isPicture(found);
      return isPictureProp ? expressionSpots({
        attribute: found.attribute,
        expression: found.value,
        start: found.valueStart,
        names
      }) : [];
    })
  );
  return [...plain.flat(), ...expressions.flat()];
}

async function resolvedSpots({ document, cacheFolder }: {
  document: TextDocument;
  cacheFolder: string;
}) {
  const file = document.uri.fsPath;
  const isWinui = await isWinuiFile(file);
  if (!isWinui) {
    return [];
  }

  const text = document.getText();
  const root = await projectRootOf(file);
  const spots = uniqueSpots([
    ...await attributeSpots({
      text,
      file
    }),
    ...keySpots({
      text,
      names: pictureNames()
    })
  ]);
  return Promise.all(
    spots.map(async spot => ({
      spot,
      picture: await loadPicture({
        value: spot.value,
        file,
        root,
        isRemoteEnabled: isRemoteEnabled(),
        cacheFolder
      })
    }))
  );
}

function backgroundOf(variant: Variant) {
  return variant === Variant.ANY ? undefined : pictureTables.backgrounds[variant];
}

function lineOf({ resolved, theme }: {
  resolved: Resolved[number];
  theme: string;
}) {
  const { picture, spot } = resolved;
  const hasPicture = picture.state === PictureState.SHOWN && picture.dataUri !== undefined;
  if (!hasPicture) {
    const lookedIn = picture.candidates.length > 0 ? `, looked in ${picture.candidates.join(", ")}` : "";
    return `**${picture.name}**${theme}: ${HINTS[picture.state]}${lookedIn}`;
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

function isPartner({ other, target }: {
  other: Resolved[number];
  target: Resolved[number];
}) {
  const isSameObject = other.spot.group === target.spot.group;
  return isSameObject && other.spot.variant !== Variant.ANY;
}

// The hover of one picture; a light or dark taskbar picture shows with its partner of the same object.
function hoverMarkdown({ resolved, target }: {
  resolved: Resolved;
  target: Resolved[number];
}) {
  const isPaired = target.spot.variant !== Variant.ANY;
  const shown = resolved.filter(other => other === target || isPaired && isPartner({
    other,
    target
  }));
  return shown.map(other => lineOf({
    resolved: other,
    theme: other.spot.variant === Variant.ANY ? "" : ` (for the ${other.spot.variant} taskbar)`
  })).join("\n\n");
}

function beforeOf(resolved: Resolved[number]) {
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
    contentText: `[${HINTS[picture.state]}] `,
    color: HINT_COLOR,
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

  async function resolve(document: TextDocument) {
    const key = document.uri.toString();
    const cached = cache.get(key);
    const isFresh = cached?.version === document.version;
    if (isFresh) {
      return cached.resolved;
    }

    const resolved = isEnabled() ? await resolvedSpots({
      document,
      cacheFolder
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
