import type { MediaRecorderBackend, RecordingHandle, RecordingQuality, RecordingRequest } from "./media-recorder.ts";
import { bytesOf } from "#src/devices/buffers.js";
import { MediaCapturePauseBehavior } from "#winui/windows/media/devices/MediaCapturePauseBehavior";
import { AudioEncodingQuality } from "#winui/windows/media/media-properties/AudioEncodingQuality";
import { MediaEncodingProfile } from "#winui/windows/media/media-properties/MediaEncodingProfile";
import { VideoEncodingQuality } from "#winui/windows/media/media-properties/VideoEncodingQuality";
import { Buffer as WinRtBuffer } from "#winui/windows/storage/streams/Buffer";
import { InMemoryRandomAccessStream } from "#winui/windows/storage/streams/InMemoryRandomAccessStream";
import { InputStreamOptions } from "#winui/windows/storage/streams/InputStreamOptions";

const STREAM_START = 0n;
const PARAMETERS_PATTERN = /;.*$/u;

const videoQualities = {
  auto: VideoEncodingQuality.Auto,
  hd1080p: VideoEncodingQuality.HD1080p,
  hd720p: VideoEncodingQuality.HD720p,
  vga: VideoEncodingQuality.Vga,
  qvga: VideoEncodingQuality.Qvga
} satisfies Record<RecordingQuality, number>;

function baseTypeOf(mimeType: string) {
  return mimeType.replace(PARAMETERS_PATTERN, "").trim().toLowerCase();
}

function profileOf(request: RecordingRequest) {
  const quality = videoQualities[request.videoQuality];
  switch (baseTypeOf(request.mimeType)) {
    case "video/mp4":
      return MediaEncodingProfile.createMp4(quality);
    case "audio/mp4":
      return MediaEncodingProfile.createM4a(AudioEncodingQuality.Auto);
    case "audio/mpeg":
      return MediaEncodingProfile.createMp3(AudioEncodingQuality.Auto);
    default:
      return MediaEncodingProfile.createWav(AudioEncodingQuality.Auto);
  }
}

const SUPPORTED_TYPES: ReadonlySet<string> = new Set(["video/mp4", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav"]);

async function start(request: RecordingRequest) {
  const { capture } = request;
  const hasCapture = capture !== undefined;
  if (!hasCapture) {
    throw new Error("the stream has no MediaCapture to record: only a camera or microphone stream can be recorded");
  }

  const stream = new InMemoryRandomAccessStream();
  await capture.startRecordToStreamAsync(profileOf(request), stream);
  const handle = {
    pause: () => capture.pauseRecordAsync(MediaCapturePauseBehavior.RetainHardwareResources),
    resume: () => capture.resumeRecordAsync(),
    async stop() {
      await capture.stopRecordAsync();
      const size = Number(stream.size);
      stream.seek(STREAM_START);
      const buffer = await stream.readAsync(new WinRtBuffer(size), size, InputStreamOptions.None);
      stream.close();
      return bytesOf(buffer);
    }
  } satisfies RecordingHandle;
  return handle;
}

/**
 * The backend over `MediaCapture`'s recording: MP4 (H.264 and AAC), M4A, MP3
 * or WAV into memory, with `VideoEncodingQuality` for the picture. Needs the
 * stream's `mediaCapture`, which only `getUserMedia` streams have.
 *
 * @returns The backend.
 */
export function windowsMediaRecorderBackend() {
  const backend = {
    isTypeSupported: (mimeType: string) => SUPPORTED_TYPES.has(baseTypeOf(mimeType)),
    start
  } satisfies MediaRecorderBackend;
  return backend;
}
