import {
  PickerLocation,
  pickFile,
  pickFiles,
  pickFolder,
  saveFile
} from "./pickers.ts";
import { PickerLocationId } from "#src/winui.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The pickers' argument mapping on stand-ins for the WinUI pickers: what the
// options set, what is left alone, and what a cancelled picker gives back.

class FakePicker {
  title = "";
  commitButtonText = "";
  suggestedStartLocation: PickerLocationId = PickerLocationId.Unspecified;
  suggestedStartFolder = "";
  settingsIdentifier = "";
  suggestedFileName = "";
  defaultFileExtension = "";
  isOverwritePrompted = true;
  get showOverwritePrompt() {
    return this.isOverwritePrompted;
  }

  set showOverwritePrompt(isPrompted: boolean) {
    this.isOverwritePrompted = isPrompted;
  }

  readonly filter: string[] = [];
  readonly choices = new Map<string, string[]>();
  readonly fileTypeFilter = {
    append: (extension: string) => {
      this.filter.push(extension);
    }
  };

  readonly fileTypeChoices = {
    insert: (label: string, extensions: string[]) => {
      this.choices.set(label, extensions);
      return true;
    }
  };

  private readonly paths: string[];

  constructor(paths: string[] = []) {
    this.paths = paths;
  }

  pickSingleFileAsync() {
    const [first] = this.paths;
    return Promise.resolve(first === undefined ? null : { path: first });
  }

  pickMultipleFilesAsync() {
    const isCancelled = this.paths.length === 0;
    if (isCancelled) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      toArray: () => this.paths.map(path => ({ path }))
    });
  }

  pickSingleFolderAsync() {
    return this.pickSingleFileAsync();
  }

  pickSaveFileAsync() {
    return this.pickSingleFileAsync();
  }
}

test("a file picked comes back as its path, with the options on the picker", async () => {
  const picker = new FakePicker(["C:\\notes\\a.txt"]);
  const path = await pickFile({
    picker,
    options: {
      title: "Open notes",
      commitButtonText: "Read",
      startIn: PickerLocation.downloads,
      settingsIdentifier: "notes",
      fileTypes: [".txt", ".md"]
    }
  });
  assert.equal(path, "C:\\notes\\a.txt");
  assert.equal(picker.title, "Open notes");
  assert.equal(picker.commitButtonText, "Read");
  assert.equal(picker.suggestedStartLocation, PickerLocationId.Downloads);
  assert.equal(picker.settingsIdentifier, "notes");
  assert.deepEqual(picker.filter, [".txt", ".md"]);
});

test("an option left out leaves the picker's own value", async () => {
  const picker = new FakePicker();
  await pickFile({
    picker,
    options: {}
  });
  assert.equal(picker.title, "");
  assert.equal(picker.suggestedStartLocation, PickerLocationId.Unspecified);
  assert.deepEqual(picker.filter, []);
});

test("a cancelled picker gives null, or no paths", async () => {
  assert.equal(
    await pickFile({
      picker: new FakePicker(),
      options: {}
    }), null
  );
  assert.deepEqual(
    await pickFiles({
      picker: new FakePicker(),
      options: {}
    }), []
  );
  assert.equal(
    await pickFolder({
      picker: new FakePicker(),
      options: {}
    }), null
  );
  assert.equal(
    await saveFile({
      picker: new FakePicker(),
      options: {}
    }), null
  );
});

test("several files come back in the order picked", async () => {
  const paths = await pickFiles({
    picker: new FakePicker(["C:\\b.png", "C:\\a.png"]),
    options: {
      fileTypes: [".png"]
    }
  });
  assert.deepEqual(paths, ["C:\\b.png", "C:\\a.png"]);
});

test("a folder is opened in the path given, and comes back as its path", async () => {
  const picker = new FakePicker(["C:\\projects"]);
  const path = await pickFolder({
    picker,
    options: {
      startFolder: "C:\\",
      title: "Choose a project"
    }
  });
  assert.equal(path, "C:\\projects");
  assert.equal(picker.suggestedStartFolder, "C:\\");
  assert.equal(picker.title, "Choose a project");
});

test("a save picker takes the name, the extension and the types on offer", async () => {
  const picker = new FakePicker(["C:\\out\\report.txt"]);
  const path = await saveFile({
    picker,
    options: {
      suggestedFileName: "report",
      defaultFileExtension: ".txt",
      shouldPromptOverwrite: false,
      fileTypeChoices: {
        text: [".txt"],
        markdown: [".md", ".markdown"]
      }
    }
  });
  assert.equal(path, "C:\\out\\report.txt");
  assert.equal(picker.suggestedFileName, "report");
  assert.equal(picker.defaultFileExtension, ".txt");
  assert.equal(picker.showOverwritePrompt, false);
  assert.deepEqual([...picker.choices], [["text", [".txt"]], ["markdown", [".md", ".markdown"]]]);
});
