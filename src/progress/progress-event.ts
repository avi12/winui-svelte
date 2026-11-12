/** What `OperationProgressEvent` takes. */
export interface OperationProgressEventInit {
  readonly loaded: number;
  readonly total: number | undefined;
}

/**
 * The web's `ProgressEvent` (which Node has no global for): `lengthComputable`,
 * `loaded` and `total`, fired as `loadstart`, `progress`, `load`, `error`,
 * `abort` and `loadend`, as `XMLHttpRequest` and `FileReader` fire them.
 */
export class OperationProgressEvent extends Event {
  readonly lengthComputable: boolean;
  readonly loaded: number;
  readonly total: number;

  /** Made by `ProgressOperation`. */
  constructor(type: string, init: OperationProgressEventInit) {
    super(type);
    this.lengthComputable = init.total !== undefined && init.total > 0;
    this.loaded = init.loaded;
    this.total = init.total ?? 0;
  }
}
