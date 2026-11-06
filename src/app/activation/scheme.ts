import { DomErrorName, domException } from "#src/web-apis/dom-exception.js";

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/u;
const MAX_SCHEME_LENGTH = 64;
const MIN_SCHEME_LENGTH = 2;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const MAX_IDENTIFIER_LENGTH = 64;
const EXTENSION_PATTERN = /^\.[a-z0-9_-]+$/u;
const MAX_EXTENSION_LENGTH = 32;
const RESERVED_PREFIXES = ["ms-", "microsoft", "windows", "ie."] as const;

// Schemes the system or a browser owns: a link of these must never reach an
// app by a registration this package makes.
const RESERVED_SCHEMES = new Set([
  "about", "blob", "callto", "data", "feed", "file", "ftp", "ftps", "gopher", "http", "https", "irc", "javascript",
  "ldap", "ldaps", "mailto", "mk", "mms", "news", "nntp", "res", "rtsp", "search", "search-ms", "shell", "sms",
  "ssh", "tel", "telnet", "view-source", "vbscript", "webcal", "ws", "wss"
]);

// Extensions that run code or change the system when opened.
const EXECUTABLE_EXTENSIONS = new Set([
  ".appx", ".bat", ".cmd", ".com", ".cpl", ".dll", ".exe", ".hta", ".inf", ".js", ".jse", ".lnk", ".msc", ".msi",
  ".msix", ".pif", ".ps1", ".reg", ".scr", ".sys", ".url", ".vbe", ".vbs", ".wsf", ".wsh"
]);

function isReserved(scheme: string) {
  const isListed = RESERVED_SCHEMES.has(scheme);
  const hasReservedPrefix = RESERVED_PREFIXES.some(prefix => scheme.startsWith(prefix));
  return isListed || hasReservedPrefix;
}

function rejected(message: string) {
  return domException({
    name: DomErrorName.SECURITY,
    message
  });
}

/**
 * Checks a URL scheme against RFC 3986 (a letter, then letters, digits, `+`,
 * `-` and `.`), the system's and the browsers' schemes, and drive letters
 * (a scheme is two characters or more).
 *
 * @param scheme - The scheme, without the colon; any case.
 * @returns The scheme in lower case.
 * @throws {DOMException} `SecurityError` when it is malformed, too long or reserved.
 */
export function normalizeScheme(scheme: string) {
  const lower = scheme.toLowerCase();
  const isLengthValid = lower.length >= MIN_SCHEME_LENGTH && lower.length <= MAX_SCHEME_LENGTH;
  const isWellFormed = SCHEME_PATTERN.test(lower) && isLengthValid;
  if (!isWellFormed) {
    throw rejected(`'${scheme}' is not a URL scheme: a letter, then letters, digits, + - or ., ${MIN_SCHEME_LENGTH} to ${MAX_SCHEME_LENGTH} characters`);
  }

  if (isReserved(lower)) {
    throw rejected(`the scheme '${lower}' belongs to the system or the browsers and cannot be registered`);
  }

  return lower;
}

/**
 * Checks a file extension: a dot and lower case letters, digits, `_` or `-`,
 * and not one that runs code.
 *
 * @param extension - The extension with its dot, any case.
 * @returns The extension in lower case.
 * @throws {DOMException} `SecurityError` when it is malformed or executable.
 */
export function normalizeExtension(extension: string) {
  const lower = extension.toLowerCase();
  const isWellFormed = EXTENSION_PATTERN.test(lower) && lower.length <= MAX_EXTENSION_LENGTH;
  if (!isWellFormed) {
    throw rejected(`'${extension}' is not a file extension: a dot, then letters, digits, _ or -`);
  }

  if (EXECUTABLE_EXTENSIONS.has(lower)) {
    throw rejected(`the extension '${lower}' runs code and cannot be registered`);
  }

  return lower;
}

/**
 * Checks the name an app picks for itself (a startup entry, a file type's
 * ProgID prefix): letters, digits, `.`, `_` and `-`, starting with a letter or digit.
 *
 * @param identifier - The name.
 * @returns The same name.
 * @throws {TypeError} When it is empty, too long or has another character.
 */
export function requireIdentifier(identifier: string) {
  const isValid = IDENTIFIER_PATTERN.test(identifier) && identifier.length <= MAX_IDENTIFIER_LENGTH;
  if (!isValid) {
    throw new TypeError(`'${identifier}' is not an identifier: letters, digits, . _ and -, up to ${MAX_IDENTIFIER_LENGTH} characters`);
  }

  return identifier;
}

/**
 * Whether a scheme is acceptable, without throwing.
 *
 * @param scheme - The scheme.
 * @returns True when `normalizeScheme` would accept it.
 */
export function isRegistrableScheme(scheme: string) {
  try {
    normalizeScheme(scheme);
    return true;
  } catch {
    return false;
  }
}
