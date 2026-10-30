import {
  attachedOwners,
  bindableEvents,
  bindingsAfterWinapp,
  COMPONENT_WINMD,
  componentWinmds,
  coreClasses,
  createdCollections,
  featureClasses,
  hostOwnedBindables,
  kindOfType,
  neverBindable,
  nonConstructible,
  nullableKindOfType,
  numericPrimitives,
  observedProperties,
  PropertyKind,
  referenceWinmds,
  reservedKeys,
  rootClasses,
  skippedProperties,
  subclassInterfaceSuffixes,
  supportClasses,
  supportEnums,
  unimplementedEvents,
  unslottedProperties,
  unslottedSuffixes
} from "./tables.ts";
import type {
  AttributeInfo,
  AttributeValue,
  PropertyInfo,
  TypeInfo,
  TypeName,
  TypeSignature
} from "./winmd.ts";
import { fullName, TypeAttribute, TypeIndex, WinMdFile } from "./winmd.ts";
import { hasStyleTarget } from "#src/components/style-targets.js";
import { camelCase, kebabCase } from "#src/renderer/tree/markup.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// The components, read from WinUI's metadata: every activatable class below
// UIElement or TextElement, with the properties, events and attached
// properties each level of the hierarchy adds.

const CONTENT_PROPERTY_ATTRIBUTE = "Microsoft.UI.Xaml.Markup.ContentPropertyAttribute";
const ACTIVATABLE_ATTRIBUTE = "Windows.Foundation.Metadata.ActivatableAttribute";
const COMPOSABLE_ATTRIBUTE = "Windows.Foundation.Metadata.ComposableAttribute";
const STATIC_ATTRIBUTE = "Windows.Foundation.Metadata.StaticAttribute";
const PUBLIC_COMPOSITION = 2;
const ATTACHED_SETTER_PREFIX = "Set";
const ATTACHED_SEPARATOR = ".";
const ATTACHED_SETTER_PARAMETERS = 2;
const CHANGED_SUFFIX = "Changed";
const EVENT_PREFIX = "on";
const FACTORY_PARAMETERS = 2;
const targetTypes = new Set(["DependencyObject", "UIElement", "FrameworkElement", "Timeline"]);
const ENUM_BASE = "Enum";
const NULLABLE_NAME = "IReference`1";
const nullablePrimitiveKinds = new Map<string, PropertyKind>([
  ["Boolean", PropertyKind.NULLABLE_BOOLEAN],
  ["Double", PropertyKind.NULLABLE_DOUBLE]
]);

// The kind of an IReference<T>: a primitive the bindings box badly, or a value
// type with a converter of its own. Undefined for any other.
function nullableKindOf(signature: TypeSignature) {
  const isNullable = signature.kind === "generic" && signature.type.name === NULLABLE_NAME;
  const argument = isNullable ? signature.args[0] : undefined;
  const isPrimitive = argument?.kind === "primitive";
  if (isPrimitive) {
    return nullablePrimitiveKinds.get(argument.name);
  }

  const isNamed = argument?.kind === "named";
  return isNamed ? nullableKindOfType.get(fullName(argument.type)) : undefined;
}
const OBJECT_NAME = "Object";
// Image.Source is a snippet slot like ImageBrush.ImageSource, though "Source" names state elsewhere.
const IMAGE_SOURCE_NAME = "Microsoft.UI.Xaml.Media.ImageSource";
// The collections whose items markup can fill.
const vectorNames = new Set(["IVector`1", "IObservableVector`1"]);

export interface PropertyModel {
  winName: string;
  key: string;
  kind: PropertyKind;
  enumType: TypeName | null;
  // The property the markup's content stands for: a child writes it.
  isContent: boolean;
}

/** How a <property> element fills a property: with one value, or a collection's items. */
export const SlotKind = {
  VALUE: "value",
  COLLECTION: "collection"
} as const;

export type SlotKind = (typeof SlotKind)[keyof typeof SlotKind];

// A property markup fills with controls, through a <property> element the
// component renders a snippet prop in: a value (Pane, Header, Flyout) or the
// items of a collection the class holds (MenuItems, PrimaryCommands).
export interface SlotModel {
  key: string;
  winName: string;
  kind: SlotKind;
  // The name of the <property> element that carries the snippet: the prop's
  // own, or for an attached property `owner.property` in kebab case, which
  // the renderer sets through the owner.
  elementName: string;
  // The class of the collection the renderer makes when the property holds
  // none (createdCollections in tables.ts), or null.
  collection: TypeName | null;
}

export interface EventModel {
  winName: string;
  key: string;
}

export interface BindableModel {
  key: string;
  winName: string;
  events: string[];
}

export interface AttachedModel {
  key: string;
  owner: TypeName;
  // The attached property's name as WinUI has it (ToolTip, AttachedFlyout).
  name: string;
  setter: string;
  // Whether a snippet fills it (attachedOwners in tables.ts).
  isSlot: boolean;
  kind: PropertyKind;
  enumType: TypeName | null;
  // The class whose level holds it: the narrowest type the setter takes.
  target: string;
}

// Read-only state the control exposes one-way (observedProperties in tables.ts):
// the prop is bindable, written by the control and never to it.
export interface ObservedModel {
  key: string;
  winName: string;
  kind: PropertyKind;
  enumType: TypeName | null;
  events: string[];
}

export interface ClassModel {
  type: TypeName;
  tag: string;
  parent: ClassModel | null;
  isComponent: boolean;
  // The property the class's children are, own or inherited.
  contentProperty: string | null;
  declaresContent: boolean;
  properties: PropertyModel[];
  events: EventModel[];
  attached: AttachedModel[];
  bindables: BindableModel[];
  observed: ObservedModel[];
  slots: SlotModel[];
  // The class is itself a collection of controls (SwipeItems): its children
  // are its items.
  holdsItems: boolean;
  // The collection classes the component registers beside its own: those
  // whose items it can be.
  registers: TypeName[];
  // The folder of src/components/generated the level is written to: empty for
  // WinUI, the component winmd's own for an extra package (Win2D).
  folder: string;
}

export interface Model {
  // Empty for the WinUI components, else the folder of the extra package they are for.
  folder: string;
  classes: ClassModel[];
  // Every enum the properties name, for the bindings.
  enums: TypeName[];
  // Statics-only classes the attached properties are set through.
  owners: TypeName[];
  // Components the metadata activates but the generator leaves out.
  excluded: Array<{
    name: string;
    reason: string;
  }>;
}

const lockFileSchema = z.object({
  packages: z.array(z.object({ winmds: z.array(z.string()) }))
});

// The index of the metadata `winapp restore` locked, the file the WinUI
// components are in and the files of the extra packages' (componentWinmds).
export function loadMetadata(lockPath: string) {
  const parsedLock = lockFileSchema.safeParse(JSON.parse(readFileSync(lockPath, "utf8")));
  if (!parsedLock.success) {
    throw new Error(`${lockPath} is not a winapp lock file`);
  }

  const files = parsedLock.data.packages.flatMap(entry => entry.winmds);
  function find(name: string) {
    const found = files.find(file => path.basename(file).toLowerCase() === name.toLowerCase());
    const isFound = found !== undefined;
    if (!isFound) {
      throw new Error(`${name} is not among the winmds in ${lockPath}`);
    }

    return found;
  }
  const index = new TypeIndex();
  const components = new WinMdFile(find(COMPONENT_WINMD));
  index.add(components);
  for (const name of referenceWinmds) {
    index.add(new WinMdFile(find(name)));
  }

  const extras = componentWinmds.map(extra => {
    const file = new WinMdFile(find(extra.winmd));
    index.add(file);
    return {
      extra,
      file
    };
  });
  return {
    index,
    components,
    extras
  };
}

function sameType({ left, right }: {
  left: TypeName;
  right: TypeName;
}) {
  return fullName(left) === fullName(right);
}

function isEnumType(type: TypeInfo | undefined) {
  return type?.base?.name === ENUM_BASE;
}

function findAttribute({ attributes, name }: {
  attributes: AttributeInfo[];
  name: string;
}) {
  return attributes.filter(attribute => fullName(attribute.type) === name);
}

function nameOfString(full: AttributeValue | undefined) {
  const isText = typeof full === "string";
  if (!isText) {
    return null;
  }

  const split = full.lastIndexOf(".");
  return {
    namespace: full.slice(0, split),
    name: full.slice(split + 1)
  };
}

interface SlotCandidate {
  model: ClassModel;
  member: PropertyInfo;
}

class Builder {
  private readonly index: TypeIndex;
  private readonly classes = new Map<string, ClassModel>();
  private readonly enums = new Map<string, TypeName>();
  private readonly owners = new Map<string, TypeName>();
  private readonly attachedByTarget = new Map<string, AttachedModel[]>();
  readonly excluded: Model["excluded"] = [];
  private readonly controlInterfaces = new Set<string>();

  constructor(index: TypeIndex) {
    this.index = index;
  }

  classify(signature: TypeSignature) {
    const isPrimitive = signature.kind === "primitive";
    if (isPrimitive) {
      return {
        kind: this.classifyPrimitive(signature.name),
        enumType: null
      };
    }

    const isNamed = signature.kind === "named";
    if (isNamed) {
      const special = kindOfType.get(fullName(signature.type));
      const isSpecial = special !== undefined;
      if (isSpecial) {
        return {
          kind: special,
          enumType: null
        };
      }

      const isEnum = signature.isValueType && isEnumType(this.index.find(signature.type));
      if (isEnum) {
        this.enums.set(fullName(signature.type), signature.type);
        return {
          kind: PropertyKind.ENUM,
          enumType: signature.type
        };
      }
    }

    // dynwinrt boxes a JavaScript boolean or number for IReference<bool> and
    // IReference<double> badly: the call fails, so the value is boxed here.
    const nullableKind = nullableKindOf(signature);
    const isNullablePrimitive = nullableKind !== undefined;
    if (isNullablePrimitive) {
      return {
        kind: nullableKind,
        enumType: null
      };
    }

    return {
      kind: PropertyKind.PASSTHROUGH,
      enumType: null
    };
  }

  private classifyPrimitive(name: string) {
    const isBoolean = name === "Boolean";
    if (isBoolean) {
      return PropertyKind.BOOLEAN;
    }

    const isString = name === "String";
    if (isString) {
      return PropertyKind.STRING;
    }

    const isObject = name === "Object";
    if (isObject) {
      return PropertyKind.OBJECT;
    }

    return numericPrimitives.has(name) ? PropertyKind.NUMBER : PropertyKind.PASSTHROUGH;
  }

  private instanceInterfaces(type: TypeInfo) {
    const found: TypeInfo[] = [];
    for (const reference of type.interfaces) {
      const interfaceType = reference.type === null ? undefined : this.index.find(reference.type);
      const isForSubclasses = subclassInterfaceSuffixes.some(suffix => interfaceType?.name.endsWith(suffix));
      const isRequired = interfaceType !== undefined && !isForSubclasses;
      if (isRequired) {
        found.push(interfaceType);
      }
    }

    return found;
  }

  private isActivatable(type: TypeInfo) {
    const isDefaultActivation = findAttribute({
      attributes: type.attributes,
      name: ACTIVATABLE_ATTRIBUTE
    }).some(attribute => typeof attribute.fixed[0] === "number");
    if (isDefaultActivation) {
      return true;
    }

    return findAttribute({
      attributes: type.attributes,
      name: COMPOSABLE_ATTRIBUTE
    }).some(attribute => {
      const factoryName = nameOfString(attribute.fixed[0]);
      const factory = factoryName === null ? undefined : this.index.find(factoryName);
      const isPublic = attribute.fixed[1] === PUBLIC_COMPOSITION;
      const hasDefaultFactory = factory?.methods
        .some(method => method.parameters.length === FACTORY_PARAMETERS) === true;
      return isPublic && hasDefaultFactory;
    });
  }

  private contentPropertyOf(type: TypeInfo) {
    const [attribute] = findAttribute({
      attributes: type.attributes,
      name: CONTENT_PROPERTY_ATTRIBUTE
    });
    const name = attribute?.named.get("Name");
    return typeof name === "string" ? name : null;
  }

  private ancestry(type: TypeInfo) {
    const chain: TypeInfo[] = [];
    for (let current: TypeInfo | undefined = type; current !== undefined;) {
      chain.push(current);
      current = current.base === null ? undefined : this.index.find(current.base);
    }

    return chain;
  }

  private isRoot(type: TypeInfo) {
    return rootClasses.some(root => sameType({
      left: root,
      right: type
    }));
  }

  private levelOf(type: TypeInfo) {
    const key = fullName(type);
    const known = this.classes.get(key);
    const isKnown = known !== undefined;
    if (isKnown) {
      return known;
    }

    const parentType = type.base === null ? undefined : this.index.find(type.base);
    const isTopLevel = this.isRoot(type) || parentType === undefined;
    const parent = isTopLevel ? null : this.levelOf(parentType);
    const declared = this.contentPropertyOf(type);
    const model: ClassModel = {
      type: {
        namespace: type.namespace,
        name: type.name
      },
      tag: kebabCase(type.name),
      parent,
      isComponent: false,
      contentProperty: declared ?? parent?.contentProperty ?? null,
      declaresContent: declared !== null,
      properties: [],
      events: [],
      attached: this.attachedByTarget.get(type.name) ?? [],
      bindables: [],
      observed: [],
      slots: [],
      holdsItems: false,
      registers: [],
      folder: folderOf(type.namespace)
    };
    this.classes.set(key, model);
    this.fillMembers({
      model,
      type
    });
    return model;
  }

  private fillMembers({ model, type }: {
    model: ClassModel;
    type: TypeInfo;
  }) {
    const interfaces = this.instanceInterfaces(type);
    const seenProperties = new Set<string>();
    for (const member of interfaces.flatMap(entry => entry.properties)) {
      const key = camelCase(member.name);
      const isFilled = createdCollections.has(member.name);
      const isSkippedByName = skippedProperties.has(member.name)
        || skippedProperties.has(`${model.type.name}.${member.name}`);
      const isSkipped = isSkippedByName || reservedKeys.has(key) || isFilled;
      const isNew = !seenProperties.has(member.name);
      const isWritableProperty = member.hasSetter && !isSkipped && isNew;
      if (isWritableProperty) {
        seenProperties.add(member.name);
        const { kind, enumType } = this.classify(member.type);
        const isStyleWithoutElement = kind === PropertyKind.STYLE && !hasStyleTarget(key);
        if (isStyleWithoutElement) {
          throw new Error(`${model.type.name}.${key} takes a Style: add the element it styles to src/components/style-targets.ts`);
        }

        model.properties.push({
          winName: member.name,
          key,
          kind,
          enumType,
          isContent: member.name === model.contentProperty && model.contentProperty !== null
        });
      }
    }

    this.fillObserved({
      model,
      type,
      seenProperties
    });

    const seenEvents = new Set<string>(unimplementedEvents.get(fullName(model.type)));
    for (const member of interfaces.flatMap(entry => entry.events)) {
      if (!seenEvents.has(member.name)) {
        seenEvents.add(member.name);
        model.events.push({
          winName: member.name,
          key: `${EVENT_PREFIX}${member.name}`
        });
      }
    }

    model.properties.sort((left, right) => left.key.localeCompare(right.key));
    model.events.sort((left, right) => left.key.localeCompare(right.key));
  }

  // The read-only properties the control reports changes of
  // (observedProperties in tables.ts).
  private fillObserved({ model, type, seenProperties }: {
    model: ClassModel;
    type: TypeInfo;
    seenProperties: Set<string>;
  }) {
    for (const member of this.instanceInterfaces(type).flatMap(entry => entry.properties)) {
      const events = observedProperties.get(`${type.name}.${member.name}`);
      const isObserved = !member.hasSetter && events !== undefined && !seenProperties.has(member.name);
      if (isObserved) {
        seenProperties.add(member.name);
        const { kind, enumType } = this.classify(member.type);
        model.observed.push({
          winName: member.name,
          key: camelCase(member.name),
          kind,
          enumType,
          events
        });
      }
    }
  }

  private eventsAvailable(model: ClassModel) {
    const names = new Set<string>();
    for (let level: ClassModel | null = model; level !== null; level = level.parent) {
      for (const event of level.events) {
        names.add(event.winName);
      }
    }

    return names;
  }

  private deriveBindables(model: ClassModel) {
    const available = this.eventsAvailable(model);
    const hostOwned = hostOwnedBindables.get(model.type.name) ?? [];
    const candidatesOf = model.properties
      .filter(entry => !neverBindable.has(entry.winName))
      .filter(entry => !hostOwned.includes(entry.winName));
    for (const property of candidatesOf) {
      const candidates = [...bindableEvents.get(property.winName) ?? [], `${property.winName}${CHANGED_SUFFIX}`];
      const events = candidates.filter(name => available.has(name));
      const hasEvents = events.length > 0;
      if (hasEvents) {
        model.bindables.push({
          key: property.key,
          winName: property.winName,
          events
        });
      }
    }
  }

  // The events of an observed property that the class has, and none of the
  // property's when it has none to say it changed.
  private deriveObserved(model: ClassModel) {
    const available = this.eventsAvailable(model);
    const observed = model.observed.map(property => ({
      ...property,
      events: property.events.filter(name => available.has(name))
    }));
    model.observed = observed.filter(property => property.events.length > 0);
  }

  // The attached properties, grouped by the level that takes them.
  collectAttached() {
    for (const { owner, prefix, slots = [] } of attachedOwners) {
      const type = this.index.find(owner);
      const isInMetadata = type !== undefined;
      if (!isInMetadata) {
        throw new Error(`${fullName(owner)} is not in the metadata`);
      }

      this.owners.set(fullName(owner), owner);
      for (const attribute of findAttribute({
        attributes: type.attributes,
        name: STATIC_ATTRIBUTE
      })) {
        const statics = nameOfString(attribute.fixed[0]);
        const staticsType = statics === null ? undefined : this.index.find(statics);
        for (const method of staticsType?.methods ?? []) {
          this.collectSetter({
            owner,
            prefix,
            slots,
            method
          });
        }
      }
    }
  }

  private collectSetter({ owner, prefix, slots, method }: {
    owner: TypeName;
    prefix: string;
    slots: string[];
    method: TypeInfo["methods"][number];
  }) {
    const target = method.parameters[0]?.type;
    const value = method.parameters[1]?.type;
    const isSetter = method.name.startsWith(ATTACHED_SETTER_PREFIX)
      && method.parameters.length === ATTACHED_SETTER_PARAMETERS;
    const targetName = target?.kind === "named" ? target.type.name : "";
    const isAttachedSetter = isSetter && value !== undefined && targetTypes.has(targetName);
    if (!isAttachedSetter) {
      return;
    }

    const name = method.name.slice(ATTACHED_SETTER_PREFIX.length);
    const isPrefixed = name.toLowerCase().startsWith(prefix.toLowerCase());
    const key = isPrefixed ? camelCase(name) : `${prefix}${name}`;
    const { kind, enumType } = this.classify(value);
    const model: AttachedModel = {
      key,
      owner,
      name,
      setter: `set${name}`,
      isSlot: slots.includes(name),
      kind,
      enumType,
      target: targetName
    };
    // A DependencyObject target is every element's; a text element is not one
    // of the automation tree's, so it is left to UIElement.
    const level = targetName === "DependencyObject" ? "UIElement" : targetName;
    const list = this.attachedByTarget.get(level) ?? [];
    list.push(model);
    this.attachedByTarget.set(level, list);
  }

  // `wanted` limits the components to the classes it names (an extra package's).
  build({ components, wanted }: {
    components: WinMdFile;
    wanted?: Set<string>;
  }) {
    this.collectAttached();
    function isWanted(type: TypeInfo) {
      return wanted === undefined || wanted.has(fullName(type));
    }

    const candidates = components.types.filter(type => isWanted(type) && this.isCandidate(type));
    for (const type of candidates) {
      const reason = nonConstructible.get(fullName(type));
      const isExcluded = reason !== undefined;
      if (isExcluded) {
        this.excluded.push({
          name: fullName(type),
          reason
        });
      } else {
        this.levelOf(type).isComponent = true;
      }
    }

    const classes = [...this.classes.values()].sort((left, right) => left.type.name.localeCompare(right.type.name));
    for (const model of classes) {
      this.deriveBindables(model);
      this.deriveObserved(model);
      this.noteInterfaces(model);
    }

    for (const model of classes) {
      this.deriveSlots(model);
      this.deriveHoldsItems(model);
      this.deriveRegisters(model);
    }

    this.checkNames(classes);
    return {
      folder: "",
      classes,
      enums: [...this.enums.values()].sort((left, right) => fullName(left).localeCompare(fullName(right))),
      owners: [...this.owners.values()],
      excluded: this.excluded
    };
  }

  // The interfaces the classes of the hierarchy implement: a collection of
  // ICommandBarElement takes the controls that implement it.
  private noteInterfaces(model: ClassModel) {
    const references = this.index.find(model.type)?.interfaces ?? [];
    for (const name of references.flatMap(reference => reference.type === null ? [] : [fullName(reference.type)])) {
      this.controlInterfaces.add(name);
    }
  }

  // A type a control can be: Object, a class of the hierarchy, or an
  // interface one implements.
  private takesControl(signature: TypeSignature) {
    const isObject = signature.kind === "primitive" && signature.name === OBJECT_NAME;
    if (isObject) {
      return true;
    }

    const isClassReference = signature.kind === "named" && !signature.isValueType;
    if (!isClassReference) {
      return false;
    }

    const type = this.index.find(signature.type);
    const isInHierarchy = type !== undefined && this.ancestry(type).some(ancestor => this.isRoot(ancestor));
    return isInHierarchy || this.controlInterfaces.has(fullName(signature.type));
  }

  // The item type of a collection: an IVector<T> property, or a class that
  // implements one (a panel's UIElementCollection).
  private itemTypeOf(signature: TypeSignature) {
    const isNamed = signature.kind === "named";
    const declared = isNamed ? this.index.find(signature.type) : undefined;
    const implemented = isNamed ? declared?.interfaces.map(reference => reference.signature) : [signature];
    const vector = implemented?.find(candidate => candidate?.kind === "generic" && vectorNames.has(candidate.type.name));
    return vector?.kind === "generic" ? vector.args[0] ?? null : null;
  }

  private isSlotted({ name, type }: {
    name: string;
    type: TypeSignature;
  }) {
    const isImageSource = type.kind === "named" && fullName(type.type) === IMAGE_SOURCE_NAME;
    const isUnslottedName = !isImageSource && unslottedProperties.has(name);
    const isUnslotted = isUnslottedName || unslottedSuffixes.some(suffix => name.endsWith(suffix));
    return !isUnslotted && !reservedKeys.has(camelCase(name));
  }

  // A settable property typed as a control or Object, or as a collection of
  // controls (MapControl.Layers): a snippet of controls fills it, in the
  // collection it holds.
  private valueSlotOf({ model, member }: SlotCandidate) {
    const property = model.properties.find(candidate => candidate.winName === member.name);
    const item = member.type.kind === "generic" ? this.itemTypeOf(member.type) : null;
    const isControlCollection = item !== null && this.takesControl(item);
    const isValueSlot = property !== undefined && (this.takesControl(member.type) || isControlCollection);
    if (!isValueSlot) {
      return null;
    }

    return {
      key: property.key,
      winName: member.name,
      kind: SlotKind.VALUE,
      elementName: property.key,
      collection: null
    };
  }

  // The collection classes a component registers: the renderer makes them
  // from the registry, and only a component that can be one of their items
  // needs them there.
  private deriveRegisters(model: ClassModel) {
    const levels: string[] = [];
    for (let level: ClassModel | null = model; level !== null; level = level.parent) {
      levels.push(fullName(level.type));
    }

    const collections = new Map([...createdCollections.values()].map(type => [fullName(type), type]));
    for (const collection of collections.values()) {
      const item = this.itemTypeOf({
        kind: "named",
        type: collection,
        isValueType: false
      });
      const isItem = item?.kind === "named" && levels.includes(fullName(item.type));
      const isRegistered = isItem && model.isComponent;
      if (isRegistered) {
        model.registers.push(collection);
      }
    }
  }

  // A collection of controls the class holds, but not the one its children
  // fill.
  private collectionSlotOf({ model, member }: SlotCandidate) {
    // A settable property is a value, unless the renderer makes its collection;
    // the content is the children.
    const collection = createdCollections.get(member.name) ?? null;
    const isValue = member.hasSetter && collection === null;
    const isFilledElsewhere = isValue || member.name === model.contentProperty;
    if (isFilledElsewhere) {
      return null;
    }

    const item = this.itemTypeOf(member.type);
    const isCollectionSlot = item !== null && this.takesControl(item);
    if (!isCollectionSlot) {
      return null;
    }

    return {
      key: camelCase(member.name),
      winName: member.name,
      kind: SlotKind.COLLECTION,
      elementName: camelCase(member.name),
      collection
    };
  }

  // The properties of a level markup fills with controls.
  private deriveSlots(model: ClassModel) {
    const type = this.index.find(model.type);
    const members = type === undefined ? [] : this.instanceInterfaces(type).flatMap(entry => entry.properties);
    const seen = new Set<string>();
    for (const member of members.filter(entry => this.isSlotted(entry))) {
      const candidate = {
        model,
        member
      };
      const slot = this.valueSlotOf(candidate) ?? this.collectionSlotOf(candidate);
      const isNew = slot !== null && !seen.has(slot.winName);
      if (isNew) {
        seen.add(slot.winName);
        model.slots.push(slot);
      }
    }

    for (const attached of model.attached.filter(entry => entry.isSlot)) {
      model.slots.push({
        key: attached.key,
        winName: attached.name,
        kind: SlotKind.VALUE,
        elementName: `${kebabCase(attached.owner.name)}${ATTACHED_SEPARATOR}${kebabCase(attached.name)}`,
        collection: null
      });
    }
  }

  // A class that is a vector of controls itself, below a root: SwipeItems.
  private deriveHoldsItems(model: ClassModel) {
    const type = this.index.find(model.type);
    const item = type === undefined ? null : this.itemTypeOf({
      kind: "named",
      type: model.type,
      isValueType: false
    });
    model.holdsItems = item !== null && this.takesControl(item);
  }

  // A class that is a component: not an interface or a static class, below a
  // root, and made by a default constructor.
  private isCandidate(type: TypeInfo) {
    const isInterface = (type.flags & TypeAttribute.INTERFACE) !== 0;
    const isStaticClass = (type.flags & TypeAttribute.ABSTRACT) !== 0 && (type.flags & TypeAttribute.SEALED) !== 0;
    const isClass = !isInterface && !isStaticClass && type.base !== null && !isEnumType(type);
    const hasValueBase = type.base?.name === "ValueType" || type.base?.name === "MulticastDelegate";
    const isInHierarchy = this.ancestry(type).some(ancestor => this.isRoot(ancestor));
    return isClass && !hasValueBase && isInHierarchy && this.isActivatable(type);
  }

  // Two classes of one name in different namespaces cannot share the one
  // import site of the bindings.
  private checkNames(classes: ClassModel[]) {
    const names = new Map<string, string>();
    for (const model of classes) {
      const other = names.get(model.type.name);
      const isDuplicate = other !== undefined;
      if (isDuplicate) {
        throw new Error(`${other} and ${fullName(model.type)} share a name; give one an alias in tables.ts`);
      }

      names.set(model.type.name, fullName(model.type));
    }
  }
}

function folderOf(namespace: string) {
  const extra = componentWinmds.find(entry => namespace === entry.namespace || namespace.startsWith(`${entry.namespace}.`));
  return extra?.folder ?? "";
}

export function buildModel(lockPath: string) {
  const { index, components } = loadMetadata(lockPath);
  return new Builder(index).build({ components });
}

// The components of each extra package (componentWinmds) as a model of their
// own: only the levels of the package's namespace, whose parents are the
// WinUI levels they derive from.
export function buildExtraModels(lockPath: string) {
  const { index, extras } = loadMetadata(lockPath);
  return extras.map(({ extra, file }) => {
    const model = new Builder(index).build({
      components: file,
      wanted: new Set(extra.classes)
    });
    return {
      ...model,
      folder: extra.folder,
      classes: model.classes.filter(level => level.folder === extra.folder)
    };
  });
}

// Every class the bindings must hold for the model: the hierarchy, the
// enums, the owners of the attached properties and what conversions use.
export function bindingClasses(model: Model) {
  const all = new Map<string, TypeName>();
  for (const level of model.classes) {
    all.set(fullName(level.type), level.type);
  }

  const isExtra = model.folder !== "";
  if (isExtra) {
    return [...all.values(), ...model.enums.filter(type => folderOf(type.namespace) === model.folder)]
      .sort((left, right) => fullName(left).localeCompare(fullName(right)));
  }

  const created = createdCollections.values();
  for (const type of [...model.enums, ...model.owners, ...supportClasses, ...supportEnums, ...created]) {
    all.set(fullName(type), type);
  }

  return [...all.values()].sort((left, right) => fullName(left).localeCompare(fullName(right)));
}

// What `winapp restore` is asked to generate: the same classes without the
// enums, which the generator pulls in as the dependencies of the classes that
// use them (asked for by name as well, it generates them twice and stops).
export function requestedClasses(model: Model) {
  const enums = new Set([...model.enums, ...supportEnums].map(fullName));
  const classes = new Map<string, TypeName>();
  for (const type of [...bindingClasses(model), ...coreClasses, ...featureClasses]) {
    classes.set(fullName(type), type);
  }

  return [...classes.values()].filter(type => !enums.has(fullName(type)) && !bindingsAfterWinapp.has(fullName(type)));
}
