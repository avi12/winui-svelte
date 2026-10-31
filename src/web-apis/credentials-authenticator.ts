import {
  base64urlOf,
  bytesOfBase64url,
  bytesOfSource,
  concatenate,
  encodeCbor,
  parseRsaPublicKey,
  sha256Of
} from "./credentials-codec.ts";
import type { CborValue } from "./credentials-codec.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const COSE_RS256 = -257;
const COSE_KEY_TYPE = 1;
const COSE_ALGORITHM = 3;
const COSE_RSA_MODULUS = -1;
const COSE_RSA_EXPONENT = -2;
const COSE_KEY_TYPE_RSA = 3;
const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED = 0x40;
const AAGUID_BYTES = 16;
const CREDENTIAL_ID_BYTES = 32;
const COUNTER_BYTES = 4;
const LENGTH_BYTES = 2;
const RECORD_RESOURCE_PREFIX = "webauthn:";
const KEY_NAME_PREFIX = "winui-svelte:";
const LOCAL_HOST = "localhost";

/** What asking Windows to check the user came back with. */
export const UserVerificationResult = {
  VERIFIED: "verified",
  CANCELED: "canceled",
  UNAVAILABLE: "unavailable",
  BUSY: "busy",
  RETRIES_EXHAUSTED: "retries-exhausted"
} as const;
/** One of the values of `UserVerificationResult`. */
export type UserVerificationResult = (typeof UserVerificationResult)[keyof typeof UserVerificationResult];

/** A secret store keyed by resource and user name: the Windows PasswordVault, or a fake. */
export interface CredentialVault {
  /** Adds an entry, replacing one with the same resource and user name. */
  add(entry: {
    readonly resource: string;
    readonly userName: string;
    readonly password: string;
  }): void;

  /** The entries of a resource, passwords included; none when the resource is unknown. */
  list(resource: string): ReadonlyArray<{
    readonly userName: string;
    readonly password: string;
  }>;

  remove(entry: {
    readonly resource: string;
    readonly userName: string;
  }): void;
}

/** Keys that live in the platform's hardware or Windows Hello: `KeyCredentialManager`, or a fake. */
export interface PlatformKeyStore {
  /** Whether Windows Hello is set up and can make keys. */
  isAvailable(): Promise<boolean>;

  /** Makes an RSA key and returns its DER `SubjectPublicKeyInfo`; rejects with a `DOMException` on cancel. */
  createKey(options: { readonly name: string }): Promise<Uint8Array>;

  /** Signs with RSASSA-PKCS1-v1_5 and SHA-256; rejects with a `DOMException` when the user cancels. */
  sign(options: {
    readonly name: string;
    readonly data: Uint8Array;
  }): Promise<Uint8Array>;
  deleteKey(name: string): Promise<void>;

  /** Asks Windows to check the user (a Hello prompt) showing the message. */
  verifyUser(message: string): Promise<UserVerificationResult>;
}

/** Everything the credentials need from Windows. */
export interface CredentialsBackend {
  readonly vault: CredentialVault;
  readonly keys: PlatformKeyStore;
}

/** One account the user can pick among. */
export interface AccountChoice {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
}

/** Shows an account chooser; resolves to the chosen `id`, or nothing when the user cancels. */
export type AccountChooser = (accounts: readonly AccountChoice[]) => Promise<string | undefined>;

const passkeySchema = z.object({
  keyName: z.string(),
  userHandle: z.string(),
  userName: z.string(),
  displayName: z.string(),
  counter: z.number()
});
type Passkey = z.infer<typeof passkeySchema>;

interface PasskeyEntry extends Passkey {
  readonly credentialId: string;
}

/** What the authenticator runs against: Windows, the page's origin and the chooser. */
export interface AuthenticatorContext {
  readonly backend: CredentialsBackend;
  readonly origin: string;
  readonly chooseAccount: AccountChooser | undefined;
}

/**
 * The relying party id for a request: the one asked for when it is a suffix of
 * the origin's host, otherwise the host.
 *
 * @param options - The page's origin and the id the page asked for.
 * @returns The id.
 * @throws {DOMException} `SecurityError` for an insecure origin or an unrelated id.
 */
export function resolveRelyingParty({ origin, requested }: {
  origin: string;
  requested: string | undefined;
}) {
  const url = new URL(origin);
  const host = url.hostname;
  const isSecure = url.protocol === "https:" || host === LOCAL_HOST;
  if (!isSecure) {
    throw domException({
      name: DomErrorName.SECURITY,
      message: "WebAuthn needs a secure origin"
    });
  }

  const isDefault = requested === undefined;
  if (isDefault) {
    return host;
  }

  const isRelated = host === requested || host.endsWith(`.${requested}`);
  if (!isRelated) {
    throw domException({
      name: DomErrorName.SECURITY,
      message: `The relying party ID '${requested}' is not a registrable domain suffix of '${host}'`
    });
  }

  return requested;
}

function resourceOf(relyingParty: string) {
  return `${RECORD_RESOURCE_PREFIX}${relyingParty}`;
}

function entriesOf({ backend, relyingParty }: {
  backend: CredentialsBackend;
  relyingParty: string;
}) {
  const entries: PasskeyEntry[] = [];
  for (const stored of backend.vault.list(resourceOf(relyingParty))) {
    const parsed = passkeySchema.safeParse(JSON.parse(stored.password));
    if (parsed.success) {
      entries.push({
        credentialId: stored.userName,
        ...parsed.data
      });
    }
  }

  return entries;
}

function saveEntry({ backend, relyingParty, entry }: {
  backend: CredentialsBackend;
  relyingParty: string;
  entry: PasskeyEntry;
}) {
  const { credentialId, ...passkey } = entry;
  backend.vault.add({
    resource: resourceOf(relyingParty),
    userName: credentialId,
    password: JSON.stringify(passkey)
  });
}

function clientDataOf({ type, challenge, origin }: {
  type: string;
  challenge: BufferSource;
  origin: string;
}) {
  const json = JSON.stringify({
    type,
    challenge: base64urlOf(bytesOfSource(challenge)),
    origin,
    crossOrigin: false
  });
  return new Uint8Array(Buffer.from(json, "utf8"));
}

function relyingPartyHash(relyingParty: string) {
  return sha256Of(new Uint8Array(Buffer.from(relyingParty, "utf8")));
}

function counterBytes(counter: number) {
  const bytes = Buffer.alloc(COUNTER_BYTES);
  bytes.writeUInt32BE(counter);
  return new Uint8Array(bytes);
}

function coseKeyOf(spki: Uint8Array) {
  const key = parseRsaPublicKey(spki);
  const entries: Array<[CborValue, CborValue]> = [
    [COSE_KEY_TYPE, COSE_KEY_TYPE_RSA],
    [COSE_ALGORITHM, COSE_RS256],
    [COSE_RSA_MODULUS, key.modulus],
    [COSE_RSA_EXPONENT, key.exponent]
  ];
  return encodeCbor(new Map(entries));
}

function attestedDataOf({ credentialId, spki }: {
  credentialId: Uint8Array;
  spki: Uint8Array;
}) {
  const length = Buffer.alloc(LENGTH_BYTES);
  length.writeUInt16BE(credentialId.length);
  return concatenate([new Uint8Array(AAGUID_BYTES), new Uint8Array(length), credentialId, coseKeyOf(spki)]);
}

function notAllowed(message: string) {
  return domException({
    name: DomErrorName.NOT_ALLOWED,
    message
  });
}

async function checkUser({ backend, message }: {
  backend: CredentialsBackend;
  message: string | undefined;
}) {
  const isRequested = message !== undefined;
  if (!isRequested) {
    return;
  }

  const result = await backend.keys.verifyUser(message);
  const isVerified = result === UserVerificationResult.VERIFIED;
  if (!isVerified) {
    throw notAllowed(`The user was not verified: ${result}`);
  }
}

/**
 * Registers a credential: a Windows Hello key for the relying party, with a
 * `none` attestation and an RS256 public key, as the spec shapes them.
 *
 * @param options - The environment, the web's creation options and an optional consent message.
 * @returns The pieces of the registration response.
 * @throws {DOMException} `SecurityError`, `NotSupportedError`, `InvalidStateError` or `NotAllowedError`.
 */
export async function makeCredential({ context, options, verification }: {
  context: AuthenticatorContext;
  options: PublicKeyCredentialCreationOptions;
  verification: string | undefined;
}) {
  const { backend, origin } = context;
  const relyingParty = resolveRelyingParty({
    origin,
    requested: options.rp.id
  });
  const algorithms = options.pubKeyCredParams.map(parameter => parameter.alg);
  const isAlgorithmSupported = algorithms.length === 0 || algorithms.includes(COSE_RS256);
  if (!isAlgorithmSupported) {
    throw domException({
      name: DomErrorName.NOT_SUPPORTED,
      message: "Only RS256 (-257) keys can be made on Windows"
    });
  }

  const isRoaming = options.authenticatorSelection?.authenticatorAttachment === "cross-platform";
  if (isRoaming) {
    throw domException({
      name: DomErrorName.NOT_SUPPORTED,
      message: "Only the platform authenticator is available"
    });
  }

  const known = new Set(entriesOf({
    backend,
    relyingParty
  }).map(entry => entry.credentialId));
  const isExcluded = options.excludeCredentials?.some(excluded => known.has(base64urlOf(bytesOfSource(excluded.id))));
  if (isExcluded) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "A credential for this account already exists"
    });
  }

  const isAvailable = await backend.keys.isAvailable();
  if (!isAvailable) {
    throw notAllowed("Windows Hello is not set up");
  }

  await checkUser({
    backend,
    message: verification
  });
  const credentialId = new Uint8Array(randomBytes(CREDENTIAL_ID_BYTES));
  const encodedId = base64urlOf(credentialId);
  const keyName = `${KEY_NAME_PREFIX}${relyingParty}:${encodedId}`;
  const publicKey = await backend.keys.createKey({ name: keyName });
  saveEntry({
    backend,
    relyingParty,
    entry: {
      credentialId: encodedId,
      keyName,
      userHandle: base64urlOf(bytesOfSource(options.user.id)),
      userName: options.user.name,
      displayName: options.user.displayName,
      counter: 0
    }
  });
  const authenticatorData = concatenate([
    relyingPartyHash(relyingParty),
    Uint8Array.of(FLAG_USER_PRESENT | FLAG_USER_VERIFIED | FLAG_ATTESTED),
    counterBytes(0),
    attestedDataOf({
      credentialId,
      spki: publicKey
    })
  ]);
  const attestation = new Map<CborValue, CborValue>([
    ["fmt", "none"],
    ["attStmt", new Map<CborValue, CborValue>()],
    ["authData", authenticatorData]
  ]);
  return {
    credentialId,
    clientDataJson: clientDataOf({
      type: "webauthn.create",
      challenge: options.challenge,
      origin
    }),
    attestationObject: encodeCbor(attestation),
    authenticatorData,
    publicKey,
    publicKeyAlgorithm: COSE_RS256
  };
}

async function pickEntry({ context, candidates, isOrdered }: {
  context: AuthenticatorContext;
  candidates: readonly PasskeyEntry[];
  isOrdered: boolean;
}) {
  const [first] = candidates;
  const { chooseAccount } = context;
  const isDecided = candidates.length === 1 || isOrdered || chooseAccount === undefined;
  if (isDecided) {
    return first;
  }

  const chosen = await chooseAccount(
    candidates.map(entry => ({
      id: entry.credentialId,
      name: entry.userName,
      displayName: entry.displayName
    }))
  );
  return candidates.find(entry => entry.credentialId === chosen);
}

/**
 * Authenticates with a credential made by `makeCredential`.
 *
 * @param options - The environment, the web's request options and an optional consent message.
 * @returns The pieces of the assertion response.
 * @throws {DOMException} `SecurityError` or `NotAllowedError`.
 */
export async function getAssertion({ context, options, verification }: {
  context: AuthenticatorContext;
  options: PublicKeyCredentialRequestOptions;
  verification: string | undefined;
}) {
  const { backend, origin } = context;
  const relyingParty = resolveRelyingParty({
    origin,
    requested: options.rpId
  });
  const entries = entriesOf({
    backend,
    relyingParty
  });
  const allowed = (options.allowCredentials ?? []).map(descriptor => base64urlOf(bytesOfSource(descriptor.id)));
  const isOrdered = allowed.length > 0;
  const candidates = isOrdered ? allowed.flatMap(id => entries.filter(entry => entry.credentialId === id)) : entries;
  const entry = await pickEntry({
    context,
    candidates,
    isOrdered
  });
  const isMissing = entry === undefined;
  if (isMissing) {
    throw notAllowed("No credential is available for this site");
  }

  await checkUser({
    backend,
    message: verification
  });
  const clientDataJson = clientDataOf({
    type: "webauthn.get",
    challenge: options.challenge,
    origin
  });
  const counter = entry.counter + 1;
  const authenticatorData = concatenate([
    relyingPartyHash(relyingParty),
    Uint8Array.of(FLAG_USER_PRESENT | FLAG_USER_VERIFIED),
    counterBytes(counter)
  ]);
  const signature = await backend.keys.sign({
    name: entry.keyName,
    data: concatenate([authenticatorData, sha256Of(clientDataJson)])
  });
  saveEntry({
    backend,
    relyingParty,
    entry: {
      ...entry,
      counter
    }
  });
  return {
    credentialId: bytesOfBase64url(entry.credentialId),
    clientDataJson,
    authenticatorData,
    signature,
    userHandle: bytesOfBase64url(entry.userHandle)
  };
}

/**
 * Forgets a credential made by `makeCredential`: its record and its Windows Hello key.
 *
 * @param options - The environment, the relying party and the credential id.
 * @returns Whether a credential was found.
 */
export async function deleteCredential({ context, relyingParty, credentialId }: {
  context: AuthenticatorContext;
  relyingParty: string;
  credentialId: string;
}) {
  const { backend } = context;
  const entry = entriesOf({
    backend,
    relyingParty
  }).find(candidate => candidate.credentialId === credentialId);
  const isMissing = entry === undefined;
  if (isMissing) {
    return false;
  }

  backend.vault.remove({
    resource: resourceOf(relyingParty),
    userName: credentialId
  });
  await backend.keys.deleteKey(entry.keyName);
  return true;
}
