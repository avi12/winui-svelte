import { bytesOfBufferSource } from "./buffer-source.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { defineProperty } from "./install.ts";
import { registerFont, unregisterFont } from "#src/font-files.js";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// FontFace and document.fonts over the font registry: a face whose source is
// a font file (or the bytes of one) registers the file under its family, and
// the family then resolves wherever a font family is written. WinUI takes the
// weight, style and width of a face from the font file itself, so the
// descriptors are kept and read back but choose nothing.

const URL_SOURCE = /^url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)$/iu;
const BYTES_FOLDER = "winui-svelte-fonts";
const BYTES_EXTENSION = ".ttf";
const HASH_ALGORITHM = "sha1";
const DOCUMENT_PROPERTY = "document";

/** The values of `FontFace.status` and `FontFaceSet.status`. */
export const FontLoadStatus = {
  UNLOADED: "unloaded",
  LOADING: "loading",
  LOADED: "loaded",
  ERROR: "error"
} as const;
/** One of the values of `FontLoadStatus`. */
export type FontLoadStatus = (typeof FontLoadStatus)[keyof typeof FontLoadStatus];

/** The descriptors a `FontFace` is given and reads back. */
export interface FontFaceDescriptors {
  style?: string;
  weight?: string;
  stretch?: string;
  unicodeRange?: string;
  display?: string;
}

function fileOfSource(source: string) {
  const match = URL_SOURCE.exec(source.trim());
  const written = match?.slice(1).find(group => group !== undefined) ?? source;
  return written.trim();
}

// A face made from bytes has no file to point at, so the bytes get one, named by their hash.
function fileOfBytes(source: BufferSource) {
  const bytes = bytesOfBufferSource(source);
  const name = createHash(HASH_ALGORITHM).update(bytes).digest("hex");
  const folder = path.join(tmpdir(), BYTES_FOLDER);
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${name}${BYTES_EXTENSION}`);
  writeFileSync(file, bytes);
  return file;
}

/**
 * The web `FontFace`: a font family and the font file (`url(...)`, a path or
 * a `file:` URL) or bytes it comes from. `load()` registers the file under
 * the family; `document.fonts.add(face)` does the same at once. A relative
 * path is relative to the working folder.
 */
export class FontFace {
  readonly family: string;
  style: string;
  weight: string;
  stretch: string;
  unicodeRange: string;
  display: string;
  readonly loaded: Promise<FontFace>;
  private currentStatus: FontLoadStatus = FontLoadStatus.UNLOADED;
  private readonly source: string | BufferSource;
  private readonly settle = Promise.withResolvers<FontFace>();

  constructor(family: string, source: string | BufferSource, descriptors: FontFaceDescriptors = {}) {
    this.family = family;
    this.source = source;
    this.style = descriptors.style ?? "normal";
    this.weight = descriptors.weight ?? "normal";
    this.stretch = descriptors.stretch ?? "normal";
    this.unicodeRange = descriptors.unicodeRange ?? "U+0-10FFFF";
    this.display = descriptors.display ?? "auto";
    this.loaded = this.settle.promise;
    // A face nobody awaits, but whose load failed, is not an unhandled rejection.
    this.loaded.catch(() => undefined);
  }

  /** `"unloaded"`, `"loading"`, `"loaded"` or `"error"`. */
  get status() {
    return this.currentStatus;
  }

  /**
   * Registers the font file under the family.
   *
   * @returns This face once the family is usable.
   * @throws {DOMException} `NetworkError` (as a rejection) when there is no such file.
   */
  load() {
    const isSettled = this.currentStatus === FontLoadStatus.LOADED || this.currentStatus === FontLoadStatus.ERROR;
    if (isSettled) {
      return this.loaded;
    }

    this.currentStatus = FontLoadStatus.LOADING;
    try {
      const isBytes = typeof this.source !== "string";
      registerFont({
        family: this.family,
        source: isBytes ? fileOfBytes(this.source) : fileOfSource(this.source)
      });
      this.currentStatus = FontLoadStatus.LOADED;
      this.settle.resolve(this);
    } catch (error) {
      this.currentStatus = FontLoadStatus.ERROR;
      this.settle.reject(
        domException({
          name: DomErrorName.NETWORK,
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }

    return this.loaded;
  }
}

/** The web `FontFaceSet` (`document.fonts`): the faces added, whose families the app can use. */
export class FontFaceSet {
  readonly ready = Promise.resolve(this);
  private readonly faces = new Set<FontFace>();

  /** The number of faces. */
  get size() {
    return this.faces.size;
  }

  /** `"loaded"`: a face is registered as it is added. */
  get status() {
    return FontLoadStatus.LOADED;
  }

  /**
   * Adds a face and registers its file now.
   *
   * @param face - The face.
   * @returns This set.
   */
  add(face: FontFace) {
    this.faces.add(face);
    void face.load();
    return this;
  }

  /**
   * Removes a face. The family stops resolving to its file; a font WinUI has
   * already loaded stays usable by name for the life of the process.
   *
   * @param face - The face.
   * @returns Whether it was in the set.
   */
  delete(face: FontFace) {
    const isAdded = this.faces.delete(face);
    if (isAdded) {
      unregisterFont(face.family);
    }

    return isAdded;
  }

  /**
   * Whether a face is in the set.
   *
   * @param face - The face.
   * @returns True when it is.
   */
  has(face: FontFace) {
    return this.faces.has(face);
  }

  /** Removes every face. */
  clear() {
    for (const face of this.faces) {
      this.delete(face);
    }
  }

  /**
   * Whether the faces of the set that a font names are all loaded.
   *
   * @param font - A CSS font shorthand or family list.
   * @returns False when a face of the set named in it is not loaded.
   */
  check(font: string) {
    return this.matching(font).every(face => face.status === FontLoadStatus.LOADED);
  }

  /**
   * Loads the faces of the set that a font names.
   *
   * @param font - A CSS font shorthand or family list.
   * @returns The faces of the set named in it, once loaded.
   */
  async load(font: string) {
    const faces = this.matching(font);
    await Promise.all(faces.map(face => face.load()));
    return faces;
  }

  /**
   * Calls back for every face.
   *
   * @param callback - Called with each face, twice, then this set.
   */
  forEach(callback: (face: FontFace, again: FontFace, set: FontFaceSet) => void) {
    for (const face of this.faces) {
      callback(face, face, this);
    }
  }

  values() {
    return this.faces.values();
  }

  [Symbol.iterator]() {
    return this.faces.values();
  }

  private matching(font: string) {
    const text = font.toLowerCase();
    return [...this.faces].filter(face => text.includes(face.family.toLowerCase()));
  }
}

/**
 * Defines `FontFace` on the global scope and `document.fonts`, a `FontFaceSet`
 * whose faces are font files of the app (`new FontFace("Face", "url(./Face.ttf)")`
 * then `document.fonts.add(face)`). A family added is then usable in a style
 * sheet's `font-family` and in a `fontFamily` prop. Add the face before the
 * control that uses it is created. A `document` of the page module is reused;
 * without one a minimal one is defined.
 *
 * @returns A function that removes them again.
 */
export function installFontFaces() {
  const fonts = new FontFaceSet();
  const hasDocument = typeof globalThis.document === "object";
  const target = hasDocument ? globalThis.document : {};
  const restores = [
    defineProperty({
      name: "FontFace",
      value: FontFace
    }),
    defineProperty({
      name: "fonts",
      value: fonts,
      target
    })
  ];
  if (!hasDocument) {
    restores.push(
      defineProperty({
        name: DOCUMENT_PROPERTY,
        value: target
      })
    );
  }

  return () => {
    fonts.clear();
    for (const restore of restores.reverse()) {
      restore();
    }
  };
}
