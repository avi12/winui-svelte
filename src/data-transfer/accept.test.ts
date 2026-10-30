import {
  DataKind,
  isFileAccepted,
  isFoldersOnly,
  isKindAccepted,
  pickerExtensionsOf
} from "./accept.ts";
import { FileKind } from "./native-file.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The `accept` filter of a drop zone and a picker, like <input accept>.

const picture = {
  name: "Holiday.PNG",
  type: "image/png",
  kind: FileKind.file
};
const notes = {
  name: "notes.txt",
  type: "text/plain",
  kind: FileKind.file
};
const folder = {
  name: "Photos",
  type: "",
  kind: FileKind.directory
};

test("nothing to accept means everything passes", () => {
  assert.equal(
    isFileAccepted({
      accept: undefined,
      file: notes
    }), true
  );
  assert.equal(
    isFileAccepted({
      accept: "",
      file: folder
    }), true
  );
});

test("extensions and media types are matched without regard to case", () => {
  assert.equal(
    isFileAccepted({
      accept: ".png, .jpg",
      file: picture
    }), true
  );
  assert.equal(
    isFileAccepted({
      accept: ".jpg",
      file: picture
    }), false
  );
  assert.equal(
    isFileAccepted({
      accept: ["image/*"],
      file: picture
    }), true
  );
  assert.equal(
    isFileAccepted({
      accept: "image/*",
      file: notes
    }), false
  );
  assert.equal(
    isFileAccepted({
      accept: "text/plain",
      file: notes
    }), true
  );
});

test("a folder passes only when directory is named", () => {
  assert.equal(
    isFileAccepted({
      accept: ".png",
      file: folder
    }), false
  );
  assert.equal(
    isFileAccepted({
      accept: "directory",
      file: folder
    }), true
  );
  assert.equal(
    isFileAccepted({
      accept: "directory",
      file: picture
    }), false
  );
  assert.equal(
    isFileAccepted({
      accept: "file",
      file: notes
    }), true
  );
});

test("a drag is judged by the kind of data before its files are known", () => {
  assert.equal(
    isKindAccepted({
      accept: ".png",
      kind: DataKind.file
    }), true
  );
  assert.equal(
    isKindAccepted({
      accept: ".png",
      kind: DataKind.text
    }), false
  );
  assert.equal(
    isKindAccepted({
      accept: "text/plain",
      kind: DataKind.text
    }), true
  );
  assert.equal(
    isKindAccepted({
      accept: "image/*",
      kind: DataKind.bitmap
    }), true
  );
  assert.equal(
    isKindAccepted({
      accept: "uri",
      kind: DataKind.uri
    }), true
  );
  assert.equal(
    isKindAccepted({
      accept: "directory",
      kind: DataKind.file
    }), false
  );
  assert.equal(
    isKindAccepted({
      accept: undefined,
      kind: DataKind.html
    }), true
  );
});

test("a picker gets the extensions of the accept, media types included", () => {
  assert.deepEqual(pickerExtensionsOf(".md,.png"), [".md", ".png"]);
  assert.ok(pickerExtensionsOf("image/png").includes(".png"));
  assert.ok(pickerExtensionsOf("image/*").includes(".jpg"));
  assert.deepEqual(pickerExtensionsOf(undefined), []);
});

test("only a folders-only accept picks a folder", () => {
  assert.equal(isFoldersOnly("directory"), true);
  assert.equal(isFoldersOnly("directory,.png"), false);
  assert.equal(isFoldersOnly(undefined), false);
});
