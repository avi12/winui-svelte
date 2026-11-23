import { conversionsIn, convertText, Destination } from "./attribute-rewriter.ts";
import { applyEdits } from "./text-edit.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const TERNARY = "{on ? Visibility.Visible : Visibility.Collapsed}";

function moveOne({ before, attribute }: {
  before: string;
  attribute: string;
}) {
  const conversion = conversionsIn({
    fileText: before,
    destination: Destination.STYLE_BLOCK
  }).find(candidate => candidate.attribute.name === attribute);
  assert.ok(conversion, `${attribute} converts`);
  return applyEdits({
    text: before,
    edits: conversion.edits
  });
}

function convertAll({ before, destination }: {
  before: string;
  destination?: Destination;
}) {
  return convertText({
    fileText: before,
    destination: destination ?? Destination.STYLE_BLOCK
  });
}

test("a prop moves to a new rule when there is no class and no style block", () => {
  assert.equal(
    moveOne({
      before: "<TextBlock visibility=\"Collapsed\" />",
      attribute: "visibility"
    }),
    "<TextBlock class=\"text-block\" />\n\n<style>\n  .text-block {\n    display: none;\n  }\n</style>\n"
  );
});

test("a rule is added to an existing style block", () => {
  assert.equal(
    moveOne({
      before: "<TextBlock visibility=\"Collapsed\" />\n\n<style>\n  .other {\n    color: red;\n  }\n</style>\n",
      attribute: "visibility"
    }),
    "<TextBlock class=\"text-block\" />\n\n<style>\n  .other {\n    color: red;\n  }\n\n"
    + "  .text-block {\n    display: none;\n  }\n</style>\n"
  );
});

test("the first class is used when it has no rule yet", () => {
  assert.equal(
    moveOne({
      before: "<TextBlock class=\"note extra\" visibility=\"Collapsed\" />\n\n<style>\n</style>\n",
      attribute: "visibility"
    }),
    "<TextBlock class=\"note extra\" />\n\n<style>\n  .note {\n    display: none;\n  }\n</style>\n"
  );
});

test("a declaration is appended to the rule of the class, or replaces the same property", () => {
  assert.equal(
    moveOne({
      before: "<TextBlock class=\"note\" visibility=\"Collapsed\" />\n\n<style>\n  .note {\n    color: red;\n  }\n</style>\n",
      attribute: "visibility"
    }),
    "<TextBlock class=\"note\" />\n\n<style>\n  .note {\n    color: red;\n    display: none;\n  }\n</style>\n"
  );
  assert.equal(
    moveOne({
      before: "<TextBlock class=\"note\" visibility=\"Collapsed\" />\n\n"
      + "<style>\n  .note {\n    display: block;\n    color: red;\n  }\n</style>\n",
      attribute: "visibility"
    }),
    "<TextBlock class=\"note\" />\n\n<style>\n  .note {\n    display: none;\n    color: red;\n  }\n</style>\n"
  );
});

test("a fresh class name is made when the tag's name is taken", () => {
  assert.equal(
    moveOne({
      before: "<TextBlock class=\"text-block\" /><TextBlock visibility=\"Collapsed\" />",
      attribute: "visibility"
    }),
    "<TextBlock class=\"text-block\" /><TextBlock class=\"text-block-2\" />\n\n"
    + "<style>\n  .text-block-2 {\n    display: none;\n  }\n</style>\n"
  );
});

test("an enum member and a length convert, and the attributes around the one moved stay", () => {
  assert.equal(
    moveOne({
      before: "<TextBlock visibility={Visibility.Collapsed} />",
      attribute: "visibility"
    }),
    "<TextBlock class=\"text-block\" />\n\n<style>\n  .text-block {\n    display: none;\n  }\n</style>\n"
  );
  assert.equal(
    moveOne({
      before: "<Border\n  text=\"a\"\n  width={12}\n  height={3}\n/>",
      attribute: "width"
    }),
    "<Border class=\"border\"\n  text=\"a\"\n  height={3}\n/>\n\n<style>\n  .border {\n    width: 12px;\n  }\n</style>\n"
  );
});

test("a condition becomes a class directive and a rule", () => {
  assert.equal(
    moveOne({
      before: `<TextBlock visibility=${TERNARY} />`,
      attribute: "visibility"
    }),
    "<TextBlock class:text-block--collapsed={!on} />\n\n<style>\n  .text-block--collapsed {\n    display: none;\n  }\n</style>\n"
  );
  assert.equal(
    moveOne({
      before: "<TextBlock class=\"note\" visibility={hasNote ? Visibility.Visible : Visibility.Collapsed}>{note}</TextBlock>",
      attribute: "visibility"
    }),
    "<TextBlock class=\"note\" class:note--collapsed={!hasNote}>{note}</TextBlock>\n\n"
    + "<style>\n  .note--collapsed {\n    display: none;\n  }\n</style>\n"
  );
});

test("a complex condition is negated in parentheses, and a nested one joins the leaves of one modifier", () => {
  assert.equal(
    moveOne({
      before: "<TextBlock visibility={a && b ? Visibility.Visible : Visibility.Collapsed} />",
      attribute: "visibility"
    }),
    "<TextBlock class:text-block--collapsed={!(a && b)} />\n\n"
    + "<style>\n  .text-block--collapsed {\n    display: none;\n  }\n</style>\n"
  );
  assert.equal(
    moveOne({
      before: "<TextBlock visibility={a ? Visibility.Collapsed : b ? Visibility.Visible : Visibility.Collapsed} />",
      attribute: "visibility"
    }),
    "<TextBlock class:text-block--collapsed={(a) || (!a && !b)} />\n\n"
    + "<style>\n  .text-block--collapsed {\n    display: none;\n  }\n</style>\n"
  );
});

test("everything in a file converts, sharing the class and the rule of a tag", () => {
  const { text, count } = convertAll({ before: "<TextBlock visibility=\"Collapsed\" opacity={0.5} />" });
  assert.equal(count, 2);
  assert.equal(
    text,
    "<TextBlock class=\"text-block\" />\n\n<style>\n  .text-block {\n    display: none;\n    opacity: 0.5;\n  }\n</style>\n"
  );
});

test("the style: directive destination writes the value in the tag", () => {
  const { text } = convertAll({
    before: "<TextBlock visibility=\"Collapsed\" width={12} />",
    destination: Destination.STYLE_DIRECTIVE
  });
  assert.equal(text, "<TextBlock style:display=\"none\" style:width=\"12px\" />");
});

test("a computed value, an html element and a prop without a counterpart are left alone", () => {
  const before = "<TextBlock visibility={isShown} text=\"a\" /><div opacity=\"0.5\"></div>";
  const { text, count } = convertAll({ before });
  assert.equal(count, 0);
  assert.equal(text, before);
});
