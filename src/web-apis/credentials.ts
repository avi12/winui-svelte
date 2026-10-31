import { deleteCredential, getAssertion, makeCredential, resolveRelyingParty } from "./credentials-authenticator.ts";
import type { AccountChooser, AuthenticatorContext, CredentialsBackend } from "./credentials-authenticator.ts";
import { arrayBufferOf, base64urlOf } from "./credentials-codec.ts";
import { windowsCredentialsBackend } from "./credentials-windows.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { defineNavigatorProperty, defineProperty } from "./install.ts";

const DEFAULT_ORIGIN = "https://localhost";
const PASSWORD_TYPE = "password";
const PUBLIC_KEY_TYPE = "public-key";
const PLATFORM_ATTACHMENT = "platform";
const INTERNAL_TRANSPORT = "internal";
const CONDITIONAL_MEDIATION = "conditional";
const SILENT_MEDIATION = "silent";

/**
 * What Windows adds to the standard options of `navigator.credentials.create`
 * and `get`. Optional, and a browser ignores it.
 */
export interface CredentialsExtras {
  /** For a `publicKey` request: ask Windows Hello to verify the user first, showing this message. */
  readonly userVerificationMessage?: string;
}

declare global {
  // The extras join the standard options wherever this module is imported.

  interface CredentialCreationOptions extends CredentialsExtras {
    password?: PasswordCredentialData | PasswordCredential;
  }
  interface CredentialRequestOptions extends CredentialsExtras {
    password?: boolean;
  }
}

/** What `installCredentials` takes. */
export interface CredentialsInstallOptions {
  /** The origin the page claims: the relying party id derives from it, and password entries are kept under it. `https://localhost` by default. */
  readonly origin?: string;

  /** The window Windows Hello's prompts belong to: a handle, or a function giving it; the foreground one by default. */
  readonly windowHandle?: bigint | (() => bigint);

  /** Asks the user which account to use when there are several; the first is used when none is given. */
  readonly chooseAccount?: AccountChooser;

  /** Stands in for Windows (the vault and Windows Hello); the tests give one. */
  readonly backend?: CredentialsBackend;
}

interface InstalledCredentials {
  readonly backend: CredentialsBackend;
  readonly authenticator: AuthenticatorContext;
  isSilentAccessPrevented: boolean;
}

let installed: InstalledCredentials | undefined;

function requireInstalled() {
  if (!installed) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "Credentials are not installed: call installCredentials() first"
    });
  }

  return installed;
}

/** The base of every credential: an `id` and a `type`. */
export class Credential {
  readonly id: string;
  readonly type: string;

  /** Made by `navigator.credentials` and the subclasses. */
  constructor(id: string, type: string) {
    this.id = id;
    this.type = type;
  }

  get [Symbol.toStringTag]() {
    return "Credential";
  }
}

/** The data `new PasswordCredential` takes. */
export interface PasswordCredentialData {
  readonly id: string;
  readonly password: string;
  readonly name?: string;
  readonly iconURL?: string;
}

/** A user name and password, kept in the Windows PasswordVault by `navigator.credentials.store`. */
export class PasswordCredential extends Credential {
  readonly name: string;
  readonly iconURL: string;
  readonly password: string;

  constructor(data: PasswordCredentialData) {
    const isValid = typeof data.id === "string" && typeof data.password === "string";
    if (!isValid) {
      throw new TypeError("PasswordCredential needs a string id and a string password");
    }

    super(data.id, PASSWORD_TYPE);
    this.name = data.name ?? "";
    this.iconURL = data.iconURL ?? "";
    this.password = data.password;
  }

  override get [Symbol.toStringTag]() {
    return "PasswordCredential";
  }
}

/** The base of the responses of a public key credential. */
export class AuthenticatorResponse {
  readonly clientDataJSON: ArrayBuffer;

  constructor(clientDataJson: ArrayBuffer) {
    this.clientDataJSON = clientDataJson;
  }

  get [Symbol.toStringTag]() {
    return "AuthenticatorResponse";
  }
}

/** The response to `create({ publicKey })`. */
export class AuthenticatorAttestationResponse extends AuthenticatorResponse {
  readonly attestationObject: ArrayBuffer;
  private readonly authenticatorData: ArrayBuffer;
  private readonly publicKey: ArrayBuffer;
  private readonly publicKeyAlgorithm: number;

  constructor(init: {
    clientDataJson: ArrayBuffer;
    attestationObject: ArrayBuffer;
    authenticatorData: ArrayBuffer;
    publicKey: ArrayBuffer;
    publicKeyAlgorithm: number;
  }) {
    super(init.clientDataJson);
    this.attestationObject = init.attestationObject;
    this.authenticatorData = init.authenticatorData;
    this.publicKey = init.publicKey;
    this.publicKeyAlgorithm = init.publicKeyAlgorithm;
  }

  getTransports() {
    return [INTERNAL_TRANSPORT];
  }

  getAuthenticatorData() {
    return this.authenticatorData;
  }

  /** The DER `SubjectPublicKeyInfo` of the new key. */
  getPublicKey() {
    return this.publicKey;
  }

  getPublicKeyAlgorithm() {
    return this.publicKeyAlgorithm;
  }

  override get [Symbol.toStringTag]() {
    return "AuthenticatorAttestationResponse";
  }
}

/** The response to `get({ publicKey })`. */
export class AuthenticatorAssertionResponse extends AuthenticatorResponse {
  readonly authenticatorData: ArrayBuffer;
  readonly signature: ArrayBuffer;
  readonly userHandle: ArrayBuffer | null;

  constructor(init: {
    clientDataJson: ArrayBuffer;
    authenticatorData: ArrayBuffer;
    signature: ArrayBuffer;
    userHandle: ArrayBuffer | null;
  }) {
    super(init.clientDataJson);
    this.authenticatorData = init.authenticatorData;
    this.signature = init.signature;
    this.userHandle = init.userHandle;
  }

  override get [Symbol.toStringTag]() {
    return "AuthenticatorAssertionResponse";
  }
}

/** A WebAuthn credential: a Windows Hello key, shaped as the spec has it. */
export class PublicKeyCredential extends Credential {
  readonly rawId: ArrayBuffer;
  readonly response: AuthenticatorResponse;
  readonly authenticatorAttachment = PLATFORM_ATTACHMENT;

  constructor(init: {
    rawId: ArrayBuffer;
    id: string;
    response: AuthenticatorResponse;
  }) {
    super(init.id, PUBLIC_KEY_TYPE);
    this.rawId = init.rawId;
    this.response = init.response;
  }

  /** Whether Windows Hello is set up, so that a platform credential can be made. */
  static async isUserVerifyingPlatformAuthenticatorAvailable() {
    return requireInstalled().backend.keys.isAvailable();
  }

  static async isConditionalMediationAvailable() {
    return false;
  }

  /**
   * Windows only: asks Windows Hello to check the user, showing the message.
   *
   * @param message - What the prompt says.
   * @returns How the check ended.
   */
  static async verifyUser(message: string) {
    return requireInstalled().backend.keys.verifyUser(message);
  }

  /**
   * Windows only: forgets a credential and deletes its Windows Hello key.
   *
   * @param options - The credential's id (base64url) and the relying party id it was made for (the host by default).
   * @returns Whether it existed.
   */
  static async deleteCredential({ id, rpId }: {
    id: string;
    rpId?: string;
  }) {
    const { authenticator } = requireInstalled();
    return deleteCredential({
      context: authenticator,
      relyingParty: resolveRelyingParty({
        origin: authenticator.origin,
        requested: rpId
      }),
      credentialId: id
    });
  }

  getClientExtensionResults() {
    return {};
  }

  override get [Symbol.toStringTag]() {
    return "PublicKeyCredential";
  }
}

async function getPasswordCredential(mediation: CredentialMediationRequirement | undefined) {
  const known = requireInstalled();
  const { backend, authenticator } = known;
  const accounts = backend.vault.list(authenticator.origin);
  const isSilent = mediation === SILENT_MEDIATION;
  const isRefused = isSilent && (known.isSilentAccessPrevented || accounts.length !== 1);
  const [first] = accounts;
  const isEmpty = first === undefined;
  if (isRefused) {
    return null;
  }

  if (isEmpty) {
    return null;
  }

  const { chooseAccount } = authenticator;
  const isAsking = accounts.length > 1 && chooseAccount !== undefined;
  const chosenName = isAsking ? await chooseAccount(
    accounts.map(account => ({
      id: account.userName,
      name: account.userName,
      displayName: account.userName
    }))
  ) : first.userName;
  const chosen = accounts.find(account => account.userName === chosenName);
  const isUnchosen = chosen === undefined;
  if (isUnchosen) {
    return null;
  }

  known.isSilentAccessPrevented = false;
  return new PasswordCredential({
    id: chosen.userName,
    password: chosen.password
  });
}

async function getPublicKeyCredential({ publicKey, verification }: {
  publicKey: PublicKeyCredentialRequestOptions;
  verification: string | undefined;
}) {
  const { authenticator } = requireInstalled();
  const assertion = await getAssertion({
    context: authenticator,
    options: publicKey,
    verification
  });
  return new PublicKeyCredential({
    id: base64urlOf(assertion.credentialId),
    rawId: arrayBufferOf(assertion.credentialId),
    response: new AuthenticatorAssertionResponse({
      clientDataJson: arrayBufferOf(assertion.clientDataJson),
      authenticatorData: arrayBufferOf(assertion.authenticatorData),
      signature: arrayBufferOf(assertion.signature),
      userHandle: arrayBufferOf(assertion.userHandle)
    })
  });
}

/** The `navigator.credentials` object. */
export class CredentialsContainer {
  /**
   * Reads a stored password, or signs in with a Windows Hello credential when
   * `publicKey` is given.
   *
   * @param options - The standard options (`password`, `publicKey`, `mediation`, `signal`) and the extras.
   * @returns The credential, or null when there is none to give.
   * @throws {DOMException} `NotAllowedError`, `NotSupportedError`, `SecurityError` or the signal's reason.
   */
  async get(options: CredentialRequestOptions = {}) {
    options.signal?.throwIfAborted();
    const isConditional = options.mediation === CONDITIONAL_MEDIATION;
    if (isConditional) {
      throw domException({
        name: DomErrorName.NOT_SUPPORTED,
        message: "Conditional mediation is not available"
      });
    }

    if (options.publicKey) {
      const credential = await getPublicKeyCredential({
        publicKey: options.publicKey,
        verification: options.userVerificationMessage
      });
      options.signal?.throwIfAborted();
      return credential;
    }

    if (options.password) {
      return getPasswordCredential(options.mediation);
    }

    return null;
  }

  /**
   * Keeps a password credential in the Windows PasswordVault, under the origin.
   *
   * @param credential - A `PasswordCredential`.
   * @returns Nothing, once it is kept.
   * @throws {DOMException} `NotSupportedError` for a public key credential.
   * @throws {TypeError} For anything that is not a credential.
   */
  async store(credential: Credential) {
    const known = requireInstalled();
    const isPublicKey = credential instanceof PublicKeyCredential;
    if (isPublicKey) {
      throw domException({
        name: DomErrorName.NOT_SUPPORTED,
        message: "A public key credential is stored by creating it"
      });
    }

    if (!(credential instanceof PasswordCredential)) {
      throw new TypeError("store() needs a PasswordCredential");
    }

    known.backend.vault.add({
      resource: known.authenticator.origin,
      userName: credential.id,
      password: credential.password
    });
  }

  /**
   * Makes a credential: a `PasswordCredential` from `password`, or a Windows
   * Hello credential from `publicKey`.
   *
   * @param options - The standard options (`password`, `publicKey`, `signal`) and the extras.
   * @returns The new credential.
   * @throws {DOMException} `NotAllowedError`, `NotSupportedError`, `InvalidStateError`, `SecurityError`, `AbortError`.
   */
  async create(options: CredentialCreationOptions = {}) {
    options.signal?.throwIfAborted();

    if (options.publicKey) {
      const { authenticator } = requireInstalled();
      const made = await makeCredential({
        context: authenticator,
        options: options.publicKey,
        verification: options.userVerificationMessage
      });
      options.signal?.throwIfAborted();
      return new PublicKeyCredential({
        id: base64urlOf(made.credentialId),
        rawId: arrayBufferOf(made.credentialId),
        response: new AuthenticatorAttestationResponse({
          clientDataJson: arrayBufferOf(made.clientDataJson),
          attestationObject: arrayBufferOf(made.attestationObject),
          authenticatorData: arrayBufferOf(made.authenticatorData),
          publicKey: arrayBufferOf(made.publicKey),
          publicKeyAlgorithm: made.publicKeyAlgorithm
        })
      });
    }

    if (options.password) {
      const data = options.password;
      const isCredential = data instanceof PasswordCredential;
      return isCredential ? data : new PasswordCredential(data);
    }

    throw domException({
      name: DomErrorName.NOT_SUPPORTED,
      message: "Only password and publicKey credentials can be created"
    });
  }

  /** The next silent `get` returns nothing until the user has been asked again. */
  async preventSilentAccess() {
    requireInstalled().isSilentAccessPrevented = true;
  }

  get [Symbol.toStringTag]() {
    return "CredentialsContainer";
  }
}

const globalClasses = [
  ["Credential", Credential],
  ["PasswordCredential", PasswordCredential],
  ["PublicKeyCredential", PublicKeyCredential],
  ["CredentialsContainer", CredentialsContainer],
  ["AuthenticatorResponse", AuthenticatorResponse],
  ["AuthenticatorAttestationResponse", AuthenticatorAttestationResponse],
  ["AuthenticatorAssertionResponse", AuthenticatorAssertionResponse]
] as const;

/**
 * Defines `navigator.credentials` and the credential classes
 * (`PasswordCredential` over the Windows PasswordVault, `PublicKeyCredential`
 * over Windows Hello). Nothing is defined until this is called.
 *
 * WebAuthn covers platform credentials with RS256 keys, `none` attestation,
 * user verification always, and discoverable credentials; roaming
 * authenticators, extensions and conditional mediation are not available.
 * `FederatedCredential` is not defined.
 *
 * @param options - The origin, window and test stand-ins.
 * @returns The function that takes it away again.
 */
export function installCredentials(options: CredentialsInstallOptions = {}) {
  const previous = installed;
  const backend = options.backend ?? windowsCredentialsBackend({ windowHandle: options.windowHandle });
  installed = {
    backend,
    authenticator: {
      backend,
      origin: options.origin ?? DEFAULT_ORIGIN,
      chooseAccount: options.chooseAccount
    },
    isSilentAccessPrevented: false
  };
  const uninstalls = [
    defineNavigatorProperty({
      name: "credentials",
      value: new CredentialsContainer()
    }),
    ...globalClasses.map(([name, value]) => defineProperty({
      name,
      value
    }))
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }

    installed = previous;
  };
}
