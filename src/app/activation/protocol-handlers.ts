import { contextOf } from "./context.ts";
import type { RegistrationOptions } from "./context.ts";
import { createWindowsRegistry } from "./native.ts";
import { addProtocol, removeProtocol } from "./registration.ts";
import { DomErrorName, domException } from "#src/web-apis/dom-exception.js";
import { defineNavigatorProperty } from "#src/web-apis/install.js";

const URL_PLACEHOLDER = "%s";

interface ProtocolHandlerExtras {
  /** Makes links of `scheme` start this app; `url` is the web API's template and must hold `%s`. */
  registerProtocolHandler(scheme: string, url: string): void;

  /** Takes the registration of `scheme` away again. */
  unregisterProtocolHandler(scheme: string, url: string): void;
}

declare global {
  // The methods join the standard Navigator wherever this module is imported.
  interface Navigator extends ProtocolHandlerExtras {}
}

function requireTemplate(url: string) {
  const hasPlaceholder = url.includes(URL_PLACEHOLDER);
  if (!hasPlaceholder) {
    throw domException({
      name: DomErrorName.SYNTAX,
      message: `the handler URL must hold ${URL_PLACEHOLDER}, where the address goes`
    });
  }
}

/**
 * Defines `navigator.registerProtocolHandler(scheme, url)` and
 * `navigator.unregisterProtocolHandler(scheme, url)` over the per-user
 * registry (`HKEY_CURRENT_USER\Software\Classes`), so that links of the
 * scheme start this app and reach it as a `protocol` activation (see
 * `startActivation`). `url` is the web API's template and must hold `%s`; the
 * handler is always this app, so it is not used further. A scheme the system
 * or the browsers own (`http`, `file`, `mailto`, `ms-...`) is a `SecurityError`; a
 * scheme another program already owns is an `InvalidStateError`. Nothing is
 * registered by calling this: only `navigator.registerProtocolHandler` writes.
 * Taking the API away again leaves the registrations; unregister them.
 *
 * @param options - The registry and command, for a test or a bundled app.
 * @returns The function that takes the two methods away again.
 */
export function installProtocolHandlers(options: RegistrationOptions = {}) {
  function registerProtocolHandler(scheme: string, url: string) {
    requireTemplate(url);
    addProtocol({
      scheme,
      ...contextOf(options)
    });
  }

  function unregisterProtocolHandler(scheme: string, url: string) {
    requireTemplate(url);
    removeProtocol({
      scheme,
      registry: options.registry ?? createWindowsRegistry()
    });
  }

  const uninstallers = [
    defineNavigatorProperty({
      name: "registerProtocolHandler",
      value: registerProtocolHandler
    }),
    defineNavigatorProperty({
      name: "unregisterProtocolHandler",
      value: unregisterProtocolHandler
    })
  ];
  return () => {
    for (const uninstall of uninstallers.reverse()) {
      uninstall();
    }
  };
}
