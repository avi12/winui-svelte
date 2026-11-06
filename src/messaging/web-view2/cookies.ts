import { waitForCoreWebView2 } from "./core.ts";
import type { CookieLike, WebView2Like } from "./core.ts";
import { CoreWebView2CookieSameSiteKind } from "#winui/microsoft/web/web-view2/core/CoreWebView2CookieSameSiteKind";

/** The `SameSite` attribute of a cookie. */
export const CookieSameSite = {
  NONE: "none",
  LAX: "lax",
  STRICT: "strict"
} as const;
/** One of the values of `CookieSameSite`. */
export type CookieSameSite = (typeof CookieSameSite)[keyof typeof CookieSameSite];

const SAME_SITE_KINDS = new Map<CookieSameSite, number>([
  [CookieSameSite.NONE, CoreWebView2CookieSameSiteKind.None],
  [CookieSameSite.LAX, CoreWebView2CookieSameSiteKind.Lax],
  [CookieSameSite.STRICT, CoreWebView2CookieSameSiteKind.Strict]
]);
const SAME_SITE_NAMES = new Map<number, CookieSameSite>(
  [...SAME_SITE_KINDS].map(([name, kind]) => [kind, name])
);

/** A cookie, as plain data. */
export interface Cookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;

  /** Seconds since the Unix epoch; absent for a session cookie. */
  readonly expires?: number;
  readonly isHttpOnly: boolean;
  readonly isSecure: boolean;
  readonly sameSite: CookieSameSite;
}

/** What `setCookie` takes: a cookie without the attributes that have defaults. */
export interface CookieInit {
  readonly name: string;
  readonly value: string;
  readonly domain: string;

  /** Default `/`. */
  readonly path?: string;

  /** Seconds since the Unix epoch; absent for a session cookie. */
  readonly expires?: number;
  readonly isHttpOnly?: boolean;
  readonly isSecure?: boolean;

  /** Default `CookieSameSite.LAX`, the browser's own. */
  readonly sameSite?: CookieSameSite;
}

const DEFAULT_PATH = "/";

function plainCookie(cookie: CookieLike) {
  const result: Cookie = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    isHttpOnly: cookie.isHttpOnly,
    isSecure: cookie.isSecure,
    sameSite: SAME_SITE_NAMES.get(cookie.sameSite) ?? CookieSameSite.LAX,
    ...cookie.isSession ? {} : { expires: cookie.expires }
  };
  return result;
}

/** The cookies that would be sent to `uri`. */
export async function getCookies({ control, uri }: {
  control: WebView2Like;
  uri: string;
}) {
  const core = await waitForCoreWebView2(control);
  const cookies = await core.cookieManager.getCookiesAsync(uri);
  return (cookies?.toArray() ?? []).map(plainCookie);
}

/** Adds the cookie, or replaces the one with the same name, domain and path. */
export async function setCookie({ control, cookie }: {
  control: WebView2Like;
  cookie: CookieInit;
}) {
  const core = await waitForCoreWebView2(control);
  const { name, value, domain, path = DEFAULT_PATH, expires } = cookie;
  const created = core.cookieManager.createCookie(name, value, domain, path);
  const hasExpiry = expires !== undefined;
  if (hasExpiry) {
    created.expires = expires;
  }

  created.isHttpOnly = cookie.isHttpOnly ?? false;
  created.isSecure = cookie.isSecure ?? false;
  created.sameSite = SAME_SITE_KINDS.get(cookie.sameSite ?? CookieSameSite.LAX) ?? CoreWebView2CookieSameSiteKind.Lax;
  core.cookieManager.addOrUpdateCookie(created);
}

/** Deletes the cookie with this name, domain and path. */
export async function deleteCookie({ control, name, domain, path = DEFAULT_PATH }: {
  control: WebView2Like;
  name: string;
  domain: string;
  path?: string;
}) {
  const core = await waitForCoreWebView2(control);
  core.cookieManager.deleteCookiesWithDomainAndPath(name, domain, path);
}
