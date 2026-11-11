import type { ImageSearchEngine } from "./engines.ts";
import type { ImageSearchImage, ImageSearchRequest } from "./image-search-request.ts";
import { buildImageSearchRequest } from "./image-search-request.ts";

const RedirectStatus = {
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308
} as const;
const REDIRECT_STATUSES = new Set<number>(Object.values(RedirectStatus));

/** Thrown when an engine does not answer an upload with a result page. */
export class ImageSearchError extends Error {
  override readonly name = "ImageSearchError";
}

/** The `fetch` shape the helper needs; a stand-in can replace it. */
export type ImageSearchFetch = (input: string, init: RequestInit) => Promise<Response>;

/** What `imageSearchUrl` and `openImageSearch` take. */
export interface ImageSearchOptions {
  readonly engine: ImageSearchEngine;
  readonly image: ImageSearchImage;
  readonly fetch?: ImageSearchFetch;
}

function toFormData(request: ImageSearchRequest) {
  const form = new FormData();
  for (const { name, value, fileName } of request.fields) {
    const isText = typeof value === "string";
    if (isText) {
      form.append(name, value);
      continue;
    }

    form.append(name, value, fileName);
  }
  return form;
}

/**
 * Finds the result page of an image on an engine. An address needs no
 * network call; an upload is sent once and the redirect it gets back is the
 * result page. The helper does not follow it, so no result page is fetched.
 *
 * @param options - The engine, the image, and optionally a `fetch` stand-in.
 * @returns The address of the result page.
 * @throws {ImageSearchError} The engine answered without a redirect.
 */
export async function imageSearchUrl(options: ImageSearchOptions) {
  const request = await buildImageSearchRequest(options);
  const isAddressSearch = request.method === "GET";
  if (isAddressSearch) {
    return request.url;
  }

  const send = options.fetch ?? fetch;
  const response = await send(request.url, {
    method: "POST",
    body: toFormData(request),
    redirect: "manual"
  });
  const location = response.headers.get("location");
  const isRedirect = REDIRECT_STATUSES.has(response.status) && location !== null;
  if (!isRedirect) {
    throw new ImageSearchError(`${request.engine} answered ${response.status} instead of a result page`);
  }

  return new URL(location, request.url).href;
}

/**
 * Searches for an image and opens the result page in the user's default
 * browser.
 *
 * @param options - As for `imageSearchUrl`.
 * @returns The address that was opened.
 */
export async function openImageSearch(options: ImageSearchOptions) {
  const url = await imageSearchUrl(options);
  const { launchUri } = await import("#src/data-transfer/launcher.js");
  await launchUri(url);
  return url;
}
