import type { EngineUpload } from "./engines.ts";
import { ENGINES, ImageSearchEngine, UploadEncoding } from "./engines.ts";
import { z } from "zod";

const UPLOAD_FILE_NAME = "image.png";
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

const engineSchema = z.enum(Object.values(ImageSearchEngine));

const hostedUrlSchema = z.url().refine(value => HTTP_PROTOCOLS.has(new URL(value).protocol), {
  message: "an image address must be http or https"
});

const imageSchema = z.union([
  z.object({ blob: z.instanceof(Blob) }).strict(),
  z.object({ url: hostedUrlSchema }).strict()
]);

/** The image to look up: bytes to upload, or the address of a hosted image. */
export type ImageSearchImage = z.infer<typeof imageSchema>;

/** One multipart form field of an upload request. */
export interface ImageSearchField {
  readonly name: string;
  readonly value: string | Blob;
  readonly fileName: string | undefined;
}

/**
 * A search as data: where to send it and what to send. A `GET` request's
 * `url` is the result page itself; a `POST` request answers with a redirect to
 * the result page.
 */
export interface ImageSearchRequest {
  readonly engine: ImageSearchEngine;
  readonly method: "GET" | "POST";
  readonly url: string;
  readonly fields: readonly ImageSearchField[];
}

/** Thrown when an engine cannot take an uploaded image. */
export class ImageSearchUnsupportedError extends Error {
  override readonly name = "ImageSearchUnsupportedError";
}

async function uploadField({ upload, blob }: {
  upload: EngineUpload;
  blob: Blob;
}) {
  const isBase64 = upload.encoding === UploadEncoding.BASE64;
  if (isBase64) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      name: upload.field,
      value: bytes.toBase64(),
      fileName: undefined
    };
  }

  return {
    name: upload.field,
    value: blob,
    fileName: UPLOAD_FILE_NAME
  };
}

/**
 * Builds the request that searches for an image on an engine, without sending
 * it. Google Lens and Bing take an uploaded image (a multipart `POST`);
 * Yandex and TinEye take only the address of a hosted image (a `GET`), because
 * their upload forms need a browser page.
 *
 * @param options - The engine and the image (`{ blob }` or `{ url }`).
 * @returns The request as data.
 * @throws {ImageSearchUnsupportedError} A blob was given to an engine that takes only addresses.
 */
export async function buildImageSearchRequest(options: {
  engine: ImageSearchEngine;
  image: ImageSearchImage;
}) {
  const engine = engineSchema.parse(options.engine);
  const image = imageSchema.parse(options.image);
  const definition = ENGINES[engine];
  const isAddress = "url" in image;
  if (isAddress) {
    return {
      engine,
      method: "GET",
      url: definition.resultUrlForImageUrl(image.url),
      fields: []
    } satisfies ImageSearchRequest;
  }

  const { upload } = definition;
  const isUploadUnsupported = upload === undefined;
  if (isUploadUnsupported) {
    throw new ImageSearchUnsupportedError(`${engine} takes only the address of a hosted image`);
  }

  const field = await uploadField({
    upload,
    blob: image.blob
  });
  return {
    engine,
    method: "POST",
    url: upload.url,
    fields: [field]
  } satisfies ImageSearchRequest;
}
