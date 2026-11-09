/**
 * Raised when Windows refuses to seal or unseal; `code` is the Win32 error
 * (for example 87, `ERROR_INVALID_PARAMETER`, for bytes that are no blob, or
 * 13, `ERROR_INVALID_DATA`, for a blob another user sealed); the message never
 * holds the data.
 */
export class DataProtectionError extends Error {
  readonly code: number;

  constructor({ operation, code }: {
    readonly operation: string;
    readonly code: number;
  }) {
    super(`${operation} failed with Windows error ${code}`);
    this.name = "DataProtectionError";
    this.code = code;
  }
}
