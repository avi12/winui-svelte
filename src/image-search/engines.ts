/** The reverse image search engines the helper knows. */
export const ImageSearchEngine = {
  GOOGLE_LENS: "google-lens",
  BING: "bing",
  YANDEX: "yandex",
  TINEYE: "tineye"
} as const;
/** One of the engines in `ImageSearchEngine`. */
export type ImageSearchEngine = typeof ImageSearchEngine[keyof typeof ImageSearchEngine];

/** How an uploaded image travels in a multipart field. */
export const UploadEncoding = {
  FILE: "file",
  BASE64: "base64"
} as const;
/** One of the encodings in `UploadEncoding`. */
export type UploadEncoding = typeof UploadEncoding[keyof typeof UploadEncoding];

/** Where and how an engine takes an uploaded image. */
export interface EngineUpload {
  readonly url: string;
  readonly field: string;
  readonly encoding: UploadEncoding;
}

/** What the helper knows of one engine: its upload, if any, and its result page for a hosted image. */
interface EngineDefinition {
  readonly upload: EngineUpload | undefined;
  readonly resultUrlForImageUrl: (imageUrl: string) => string;
}

export const ENGINES = {
  [ImageSearchEngine.GOOGLE_LENS]: {
    upload: {
      url: "https://lens.google.com/v3/upload",
      field: "encoded_image",
      encoding: UploadEncoding.FILE
    },
    resultUrlForImageUrl: imageUrl => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`
  },
  [ImageSearchEngine.BING]: {
    upload: {
      url: "https://www.bing.com/images/search?view=detailv2&iss=sbiupload&FORM=IRSBIQ",
      field: "imageBin",
      encoding: UploadEncoding.BASE64
    },
    resultUrlForImageUrl: imageUrl =>
      `https://www.bing.com/images/searchbyimage?FORM=IRSBIQ&cbir=sbi&imgurl=${encodeURIComponent(imageUrl)}`
  },
  [ImageSearchEngine.YANDEX]: {
    upload: undefined,
    resultUrlForImageUrl: imageUrl =>
      `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}`
  },
  [ImageSearchEngine.TINEYE]: {
    upload: undefined,
    resultUrlForImageUrl: imageUrl => `https://tineye.com/search?url=${encodeURIComponent(imageUrl)}`
  }
} as const satisfies Record<ImageSearchEngine, EngineDefinition>;
