/** The `DOMException` names the Web APIs reject with. */
export const DomErrorName = {
  NOT_ALLOWED: "NotAllowedError",
  NOT_SUPPORTED: "NotSupportedError",
  SECURITY: "SecurityError",
  INVALID_STATE: "InvalidStateError",
  ABORT: "AbortError",
  NOT_FOUND: "NotFoundError",
  NETWORK: "NetworkError"
} as const;
/** One of the values of `DomErrorName`. */
export type DomErrorName = (typeof DomErrorName)[keyof typeof DomErrorName];

/**
 * A `DOMException`, the error type every Web API reports with.
 *
 * @param options - The error's name and message.
 * @returns The exception.
 */
export function domException({ name, message }: {
  name: DomErrorName;
  message: string;
}) {
  return new DOMException(message, name);
}
