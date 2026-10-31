import { roInitialize } from "@microsoft/dynwinrt";
import { installMediaDevices } from "#src/web-apis/media-devices.js";
import { installSpeechSynthesis, renderSpeech } from "#src/web-apis/speech.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The read-only parts of the media Web APIs over the real Windows classes:
// the device list, the camera formats (read from capture profiles, no camera
// starts), the installed voices, and speech rendered into a stream that is
// never played. No camera, microphone or screen is opened, no picker shown,
// no sound made.

initWindowsAppSdk();
roInitialize();

test("enumerateDevices lists the real devices and getSupportedConstraints answers", async context => {
  const uninstall = installMediaDevices();
  try {
    const infos = await navigator.mediaDevices.enumerateDevices();
    assert.ok(Array.isArray(infos));
    for (const info of infos) {
      assert.ok(["audioinput", "audiooutput", "videoinput"].includes(info.kind));
    }

    assert.equal(navigator.mediaDevices.getSupportedConstraints().frameRate, true);
    context.diagnostic(`${infos.length} devices listed: ${infos.map(info => info.kind).join(", ")}`);
  } finally {
    uninstall();
  }
});

test("speechSynthesis lists the installed voices", context => {
  const uninstall = installSpeechSynthesis();
  try {
    const voices = speechSynthesis.getVoices();
    assert.ok(voices.length > 0);
    const [voice] = voices;
    assert.ok(voice);
    assert.ok(voice.name.length > 0);
    assert.ok(voice.lang.length > 0);
    assert.match(String(voice.gender), /^(male|female)$/u);
    assert.equal(voices.filter(candidate => candidate.default).length, 1);
    context.diagnostic(`${voices.length} voices, first: ${voice.name} (${voice.lang})`);
  } finally {
    uninstall();
  }
});

test("renderSpeech synthesizes into a stream with word boundaries and plays nothing", async context => {
  const rendered = await renderSpeech({
    text: "Hello brave new world",
    isSsml: false,
    voiceId: undefined,
    language: "",
    rate: 1,
    pitch: 1,
    volume: 1,
    punctuationSilence: "default",
    appendedSilence: "default"
  });
  assert.ok(rendered.byteLength > 0);
  assert.ok(rendered.contentType.startsWith("audio/"));
  const words = rendered.boundaries.filter(boundary => boundary.kind === "word").map(boundary => boundary.text);
  assert.deepEqual(words, ["Hello", "brave", "new", "world"]);
  const times = rendered.boundaries.map(boundary => boundary.milliseconds);
  assert.deepEqual(times, [...times].sort((first, second) => first - second));
  context.diagnostic(`${rendered.byteLength} bytes of ${rendered.contentType}, ${words.length} words`);
});

test("renderSpeech reads SSML and reports sentence boundaries", async () => {
  const rendered = await renderSpeech({
    text: "<speak version='1.0' xml:lang='en-US' xmlns='http://www.w3.org/2001/10/synthesis'>One two. Three four.</speak>",
    isSsml: true,
    voiceId: undefined,
    language: "",
    rate: 1,
    pitch: 1,
    volume: 1,
    punctuationSilence: "default",
    appendedSilence: "default"
  });
  const sentences = rendered.boundaries.filter(boundary => boundary.kind === "sentence").map(boundary => boundary.text);
  assert.deepEqual(sentences, ["One two.", "Three four."]);
  const words = rendered.boundaries.filter(boundary => boundary.kind === "word").map(boundary => boundary.text);
  assert.deepEqual(words, ["One", "two", "Three", "four"]);
});
