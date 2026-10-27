import {
  attachedOwners,
  bindableEvents,
  COMPONENT_WINMD,
  coreClasses,
  kindOfType,
  neverBindable,
  nonConstructible,
  numericPrimitives,
  PropertyKind,
  referenceWinmds,
  reservedKeys,
  rootClasses,
  skippedProperties,
  subclassInterfaceSuffixes,
  supportClasses,
  supportEnums,
  unimplementedEvents
} from "./tables.ts";
import type {
  AttributeInfo,
  AttributeValue,
  TypeInfo,
  TypeName,
  TypeSignature
} from "./winmd.ts";
import { fullName, TypeAttribute, TypeIndex, WinMdFile } from "./winmd.ts";
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
const ATTACHED_SETTER_PARAMETERS = 2;
const CHANGED_SUFFIX = "Changed";
const EVENT_PREFIX = "on";
const FACTORY_PARAMETERS = 2;
const targetTypes = new Set(["DependencyObject", "UIElement", "FrameworkElement"]);
const ENUM_BASE = "Enum";
const NULLABLE_NAME = "IReference`1";

export interface PropertyModel {
  winName: string;
  key: string;
  kind: PropertyKind;
  enumType: TypeName | null;
  // The property the markup's content stands for: a child writes it.
  isContent: boolean;
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
  setter: string;
  kind: PropertyKind;
  enumType: TypeName | null;
  // The class whose level holds it: the narrowest type the setter takes.
  target: string;
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
}

export interface Model {
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

// The index of the metadata `winapp restore` locked, and the file the
// components are in.
function loadMetadata(lockPath: string) {
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

  return {
    index,
    components
  };
}

export function kebabCase(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1-$2")
    .toLowerCase();
}

export function camelCase(name: string) {
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
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

class Builder {
  private readonly index: TypeIndex;
  private readonly classes = new Map<string, ClassModel>();
  private readonly enums = new Map<string, TypeName>();
  private readonly owners = new Map<string, TypeName>();
  private readonly attachedByTarget = new Map<string, AttachedModel[]>();
  readonly excluded: Model["excluded"] = [];

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

    // dynwinrt boxes a JavaScript boolean for IReference<bool> badly: the
    // call fails, so the value is boxed here.
    const isNullableBoolean = signature.kind === "generic"
      && signature.type.name === NULLABLE_NAME
      && signature.args[0]?.kind === "primitive"
      && signature.args[0].name === "Boolean";
    if (isNullableBoolean) {
      return {
        kind: PropertyKind.NULLABLE_BOOLEAN,
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
      bindables: []
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
      const isSkipped = skippedProperties.has(member.name) || reservedKeys.has(key);
      const isNew = !seenProperties.has(member.name);
      const isWritableProperty = member.hasSetter && !isSkipped && isNew;
      if (isWritableProperty) {
        seenProperties.add(member.name);
        const { kind, enumType } = this.classify(member.type);
        model.properties.push({
          winName: member.name,
          key,
          kind,
          enumType,
          isContent: member.name === model.contentProperty && model.contentProperty !== null
        });
      }
    }

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
    for (const property of model.properties.filter(entry => !neverBindable.has(entry.winName))) {
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

  // The attached properties, grouped by the level that takes them.
  collectAttached() {
    for (const { owner, prefix } of attachedOwners) {
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
            method
          });
        }
      }
    }
  }

  private collectSetter({ owner, prefix, method }: {
    owner: TypeName;
    prefix: string;
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
      setter: `set${name}`,
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

  build(components: WinMdFile) {
    this.collectAttached();
    const candidates = components.types.filter(type => this.isCandidate(type));
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
    }

    this.checkNames(classes);
    return {
      classes,
      enums: [...this.enums.values()].sort((left, right) => fullName(left).localeCompare(fullName(right))),
      owners: [...this.owners.values()],
      excluded: this.excluded
    };
  }

  // A class that is a component: not an interface or a static class, below a
  // root, and made by a default constructor.
  private isCandidate(type: TypeInfo) {
    const isInterface = (type.flags & TypeAttribute.INTERFACE) !== 0;
    const isStaticClass = (type.flags & TypeAttribute.ABSTRACT) !== 0 && (type.flags & TypeAttribute.SEALED) !== 0;
    const isClass = !isInterface && !isStaticClass && type.base !== null && !isEnumType(type);
    const hasValueBase = type.base?.name === "ValueType" || type.base?.name === "MulticastDelegate";
    const isBelowRoot = this.ancestry(type).some(ancestor => this.isRoot(ancestor) && ancestor !== type);
    return isClass && !hasValueBase && isBelowRoot && this.isActivatable(type);
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

export function buildModel(lockPath: string) {
  const { index, components } = loadMetadata(lockPath);
  return new Builder(index).build(components);
}

// Every class the bindings must hold for the model: the hierarchy, the
// enums, the owners of the attached properties and what conversions use.
export function bindingClasses(model: Model) {
  const all = new Map<string, TypeName>();
  for (const level of model.classes) {
    all.set(fullName(level.type), level.type);
  }

  for (const type of [...model.enums, ...model.owners, ...supportClasses, ...supportEnums]) {
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
  for (const type of [...bindingClasses(model), ...coreClasses]) {
    classes.set(fullName(type), type);
  }

  return [...classes.values()].filter(type => !enums.has(fullName(type)));
}
