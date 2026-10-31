import { UserVerificationResult } from "./credentials-authenticator.ts";
import type { CredentialsBackend, CredentialVault, PlatformKeyStore } from "./credentials-authenticator.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { bufferOf, bytesOf } from "#src/devices/buffers.js";
import { addressOf, bind } from "#src/win32-calls.js";
import { KeyCredentialCreationOption } from "#winui/windows/security/credentials/KeyCredentialCreationOption";
import { KeyCredentialManager } from "#winui/windows/security/credentials/KeyCredentialManager";
import { KeyCredentialStatus } from "#winui/windows/security/credentials/KeyCredentialStatus";
import { PasswordCredential } from "#winui/windows/security/credentials/PasswordCredential";
import { PasswordVault } from "#winui/windows/security/credentials/PasswordVault";
import { UserConsentVerificationResult } from "#winui/windows/security/credentials/ui/UserConsentVerificationResult";
import { UserConsentVerifier } from "#winui/windows/security/credentials/ui/UserConsentVerifier";
import {
  UserConsentVerifierAvailability
} from "#winui/windows/security/credentials/ui/UserConsentVerifierAvailability";
import {
  CryptographicPublicKeyBlobType
} from "#winui/windows/security/cryptography/core/CryptographicPublicKeyBlobType";

const verificationResults = new Map<UserConsentVerificationResult, UserVerificationResult>([
  [UserConsentVerificationResult.Verified, UserVerificationResult.VERIFIED],
  [UserConsentVerificationResult.Canceled, UserVerificationResult.CANCELED],
  [UserConsentVerificationResult.DeviceBusy, UserVerificationResult.BUSY],
  [UserConsentVerificationResult.RetriesExhausted, UserVerificationResult.RETRIES_EXHAUSTED]
]);

/**
 * The Windows PasswordVault as a `CredentialVault`. It works for an
 * unpackaged app; entries belong to the user.
 *
 * @returns The vault.
 */
export function windowsVault() {
  const vault = new PasswordVault();
  function credentialsOf(resource: string) {
    try {
      return [...vault.findAllByResource(resource) ?? []];
    } catch {
      // PasswordVault throws "Element not found" for a resource with no entries
      return [];
    }
  }

  return {
    add({ resource, userName, password }) {
      vault.add(new PasswordCredential(resource, userName, password));
    },
    list(resource) {
      return credentialsOf(resource).map(credential => {
        credential.retrievePassword();
        return {
          userName: credential.userName,
          password: credential.password
        };
      });
    },
    remove({ resource, userName }) {
      const match = credentialsOf(resource).find(credential => credential.userName === userName);
      const isFound = match !== undefined;
      if (isFound) {
        vault.remove(match);
      }
    }
  } satisfies CredentialVault;
}

function foregroundWindow() {
  const getForegroundWindow = bind({
    dll: "user32.dll",
    entryPoint: "GetForegroundWindow",
    parameters: [],
    returnType: "pointer"
  });
  return addressOf(getForegroundWindow.invoke([]).returnValue);
}

function requireSuccess({ status, action }: {
  status: KeyCredentialStatus;
  action: string;
}) {
  const isSuccess = status === KeyCredentialStatus.Success;
  if (!isSuccess) {
    throw domException({
      name: DomErrorName.NOT_ALLOWED,
      message: `Windows Hello could not ${action} (status ${status})`
    });
  }
}

/**
 * Windows Hello keys (`KeyCredentialManager`) and the Hello check
 * (`UserConsentVerifier`) as a `PlatformKeyStore`. Every call that signs or
 * makes a key shows a Windows Hello prompt.
 *
 * @param options - The window the prompts belong to.
 * @returns The key store.
 */
export function windowsKeyStore({ windowHandle }: {
  windowHandle: bigint | (() => bigint) | undefined;
}) {
  function windowId() {
    const isLazy = typeof windowHandle === "function";
    const value = isLazy ? windowHandle() : windowHandle ?? foregroundWindow();
    return { value };
  }

  return {
    async isAvailable() {
      const [isSupported, availability] = await Promise.all([
        KeyCredentialManager.isSupportedAsync(),
        UserConsentVerifier.checkAvailabilityAsync()
      ]);
      return isSupported && availability === UserConsentVerifierAvailability.Available;
    },
    async createKey({ name }) {
      const created = await KeyCredentialManager.requestCreateForWindowAsync(
        windowId(),
        name,
        KeyCredentialCreationOption.FailIfExists
      );
      requireSuccess({
        status: created.status,
        action: "create the key"
      });
      return bytesOf(created.credential.retrievePublicKey(CryptographicPublicKeyBlobType.X509SubjectPublicKeyInfo));
    },
    async sign({ name, data }) {
      const opened = await KeyCredentialManager.openAsync(name);
      requireSuccess({
        status: opened.status,
        action: "open the key"
      });
      const signed = await opened.credential.requestSignForWindowAsync(windowId(), bufferOf(data));
      requireSuccess({
        status: signed.status,
        action: "sign"
      });
      return bytesOf(signed.result);
    },
    async deleteKey(name) {
      await KeyCredentialManager.deleteAsync(name);
    },
    async verifyUser(message) {
      const result = await UserConsentVerifier.requestVerificationAsync(message);
      return verificationResults.get(result) ?? UserVerificationResult.UNAVAILABLE;
    }
  } satisfies PlatformKeyStore;
}

/**
 * The real credentials backend: the PasswordVault and Windows Hello.
 *
 * @param options - The window the Hello prompts belong to.
 * @returns The backend.
 */
export function windowsCredentialsBackend({ windowHandle }: {
  windowHandle: bigint | (() => bigint) | undefined;
}) {
  return {
    vault: windowsVault(),
    keys: windowsKeyStore({ windowHandle })
  } satisfies CredentialsBackend;
}
