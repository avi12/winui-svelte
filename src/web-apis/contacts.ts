import { DomErrorName, domException } from "./dom-exception.ts";
import { defineNavigatorProperty, defineProperty } from "./install.ts";
import type { Contact } from "#winui/windows/application-model/contacts/Contact";
import { ContactPicker } from "#winui/windows/application-model/contacts/ContactPicker";
import { ContactSelectionMode } from "#winui/windows/application-model/contacts/ContactSelectionMode";

/** The properties `navigator.contacts.select` can return. */
export const ContactProperty = {
  ADDRESS: "address",
  EMAIL: "email",
  ICON: "icon",
  NAME: "name",
  TEL: "tel"
} as const;
/** One of the values of `ContactProperty`. */
export type ContactProperty = (typeof ContactProperty)[keyof typeof ContactProperty];

const contactProperties: readonly string[] = Object.values(ContactProperty);

/** A postal address as the web has it. */
export interface ContactAddress {
  readonly addressLine: readonly string[];
  readonly city: string;
  readonly country: string;
  readonly dependentLocality: string;
  readonly organization: string;
  readonly phone: string;
  readonly postalCode: string;
  readonly recipient: string;
  readonly region: string;
  readonly sortingCode: string;
}

/** A contact the user picked, in the shape a chooser reports it. */
export interface PickedContact {
  readonly names: readonly string[];
  readonly emails: readonly string[];
  readonly phones: readonly string[];
  readonly addresses: readonly ContactAddress[];
}

/** One contact as `select` resolves it: only the properties asked for, each a list. */
export interface ContactInfo {
  readonly address?: readonly ContactAddress[];
  readonly email?: readonly string[];
  readonly icon?: readonly Blob[];
  readonly name?: readonly string[];
  readonly tel?: readonly string[];
}

/** What a chooser is asked to do. */
export interface ContactChoice {
  /** The properties the page asked for. */
  readonly properties: readonly ContactProperty[];
  readonly isMultiple: boolean;

  /** Windows only: the text of the picker's confirm button. */
  readonly commitButtonText: string | undefined;
}

/** Shows the contact picker; the Windows `ContactPicker`, or a fake. */
export interface ContactChooser {
  /** The properties it can fill in. */
  readonly properties: readonly ContactProperty[];
  isSupported(): Promise<boolean>;

  /** Resolves with the picked contacts, or none when the user cancels. */
  choose(choice: ContactChoice): Promise<readonly PickedContact[]>;
}

/** The standard options of `select`, with the Windows extra. */
export interface ContactsSelectOptions {
  readonly multiple?: boolean;

  /** Windows only: the text of the picker's confirm button. */
  readonly commitButtonText?: string;
}

/** What `installContacts` takes. */
export interface ContactsInstallOptions {
  /** Stands in for the Windows contact picker; the tests give one. */
  readonly chooser?: ContactChooser;
}

function listed(value: string) {
  return value === "" ? [] : [value];
}

function pickedOf(contact: Contact) {
  const displayName = contact.displayName === "" ? contact.name : contact.displayName;
  return {
    names: listed(displayName),
    emails: [...contact.emails ?? []].map(email => email.address),
    phones: [...contact.phones ?? []].map(phone => phone.number),
    addresses: [...contact.addresses ?? []].map(address => ({
      addressLine: listed(address.streetAddress),
      city: address.locality,
      country: address.country,
      dependentLocality: "",
      organization: "",
      phone: "",
      postalCode: address.postalCode,
      recipient: "",
      region: address.region,
      sortingCode: ""
    }))
  } satisfies PickedContact;
}

/**
 * The Windows contact picker as a `ContactChooser`. It is a user interface:
 * it needs a window and, for most apps, package identity; where Windows
 * refuses, `choose` rejects with `NotSupportedError`. Contact photos are not
 * returned.
 *
 * @returns The chooser.
 */
export function windowsContactChooser() {
  return {
    properties: [ContactProperty.ADDRESS, ContactProperty.EMAIL, ContactProperty.NAME, ContactProperty.TEL],
    async isSupported() {
      try {
        return await ContactPicker.isSupportedAsync();
      } catch {
        return false;
      }
    },
    async choose({ isMultiple, commitButtonText }) {
      try {
        const picker = new ContactPicker();
        picker.selectionMode = ContactSelectionMode.Contacts;

        const hasCommitText = commitButtonText !== undefined;
        if (hasCommitText) {
          picker.commitButtonText = commitButtonText;
        }

        if (isMultiple) {
          return [...await picker.pickContactsAsync() ?? []].map(pickedOf);
        }

        const contact = await picker.pickContactAsync();
        return contact ? [pickedOf(contact)] : [];
      } catch (error) {
        throw domException({
          name: DomErrorName.NOT_SUPPORTED,
          message: `The Windows contact picker could not open: ${String(error)}`
        });
      }
    }
  } satisfies ContactChooser;
}

interface InstalledContacts {
  readonly chooser: ContactChooser;
  isOpen: boolean;
}

let installed: InstalledContacts | undefined;

function requireInstalled() {
  if (!installed) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "Contacts are not installed: call installContacts() first"
    });
  }

  return installed;
}

function isContactProperty(value: string): value is ContactProperty {
  return contactProperties.includes(value);
}

function validatedProperties(properties: readonly string[]) {
  const isEmpty = properties.length === 0;
  if (isEmpty) {
    throw new TypeError("select() needs at least one property");
  }

  const unknown = properties.find(property => !isContactProperty(property));
  const hasUnknown = unknown !== undefined;
  if (hasUnknown) {
    throw new TypeError(`'${unknown}' is not a valid value for enumeration ContactProperty`);
  }

  return properties.filter(isContactProperty);
}

function infoOf({ contact, properties }: {
  contact: PickedContact;
  properties: readonly ContactProperty[];
}) {
  const wanted = new Set(properties);
  return {
    ...wanted.has(ContactProperty.ADDRESS) ? { address: contact.addresses } : {},
    ...wanted.has(ContactProperty.EMAIL) ? { email: contact.emails } : {},
    ...wanted.has(ContactProperty.ICON) ? { icon: [] } : {},
    ...wanted.has(ContactProperty.NAME) ? { name: contact.names } : {},
    ...wanted.has(ContactProperty.TEL) ? { tel: contact.phones } : {}
  } satisfies ContactInfo;
}

declare global {
  interface Navigator {
    /** Defined by `installContacts`. */
    readonly contacts: ContactsManager;
  }
}

/** The `navigator.contacts` object. */
export class ContactsManager {
  /**
   * Which properties `select` can fill in on this device.
   *
   * @returns The property names.
   */
  async getProperties() {
    return [...requireInstalled().chooser.properties];
  }

  /**
   * Shows the contact picker.
   *
   * @param properties - What to return for each contact: `name`, `email`, `tel`, `address` or `icon`.
   * @param options - `multiple` allows several contacts; `commitButtonText` is the Windows extra.
   * @returns The picked contacts; an empty list when the user cancels.
   * @throws {TypeError} For no property or an unknown one.
   * @throws {DOMException} `InvalidStateError` while another picker is open, `NotSupportedError` without a picker.
   */
  // eslint-disable-next-line no-restricted-syntax -- the spec's select(properties, options) is positional
  async select(properties: readonly string[], options: ContactsSelectOptions = {}) {
    const known = requireInstalled();
    const wanted = validatedProperties(properties);
    if (known.isOpen) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "A contact picker is already open"
      });
    }

    known.isOpen = true;
    try {
      const isSupported = await known.chooser.isSupported();
      if (!isSupported) {
        throw domException({
          name: DomErrorName.NOT_SUPPORTED,
          message: "There is no contact picker on this device"
        });
      }

      const picked = await known.chooser.choose({
        properties: wanted,
        isMultiple: options.multiple ?? false,
        commitButtonText: options.commitButtonText
      });
      return picked.map(contact => infoOf({
        contact,
        properties: wanted
      }));
    } finally {
      known.isOpen = false;
    }
  }

  get [Symbol.toStringTag]() {
    return "ContactsManager";
  }
}

/**
 * Defines `navigator.contacts` and `ContactsManager`. Nothing is defined
 * until this is called.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes it away again.
 */
export function installContacts(options: ContactsInstallOptions = {}) {
  const previous = installed;
  installed = {
    chooser: options.chooser ?? windowsContactChooser(),
    isOpen: false
  };
  const uninstallManager = defineProperty({
    name: "ContactsManager",
    value: ContactsManager
  });
  const uninstallNavigator = defineNavigatorProperty({
    name: "contacts",
    value: new ContactsManager()
  });
  return () => {
    uninstallNavigator();
    uninstallManager();
    installed = previous;
  };
}
