import { UiaElementUnavailableError } from "./backend.ts";
import type { UiaBackend, UiaChild, UiaHandle, UiaProperties } from "./backend.ts";
import { HEADING_LEVEL_FIRST, HEADING_LEVEL_NONE, UiaPatternId, UiaPropertyId } from "./ids.ts";
import type { UiaControlType } from "./ids.ts";
import { DynWinRtValue, WinGuid } from "@microsoft/dynwinrt";
import { DynCom, DynComMethodSig, DynComUnsafe } from "@microsoft/dynwinrt/com/unsafe";
import { DynComRawCleanup, DynComRawMemory, DynComRawPointer } from "@microsoft/dynwinrt/com/unsafe/raw";

// IUIAutomation and its neighbours (UIAutomationClient.h) have no WinRT form,
// so the methods are declared at their vtable slots, counted in the order the
// header declares them after IUnknown's three. Every argument crosses as a
// raw pointer or integer and every result comes back through memory this file
// owns, so no BSTR, VARIANT or SAFEARRAY marshalling is trusted: a BSTR is
// read through its length prefix and freed, a VARIANT is read at its value
// offset and cleared, and the two arrays are read through their own
// get_Length and GetElement.

const CLSID_UI_AUTOMATION = "ff48dba4-60ef-4201-aa87-54103eef594e";
const IID_AUTOMATION = WinGuid.parse("30cbe57d-d9d0-452a-ab13-7ac5ac4825ee");
const IID_ELEMENT = WinGuid.parse("d22108aa-8ac5-49a5-837b-37bbb3d7591e");
const IID_CACHE_REQUEST = WinGuid.parse("b32a92b5-bc25-4078-9c08-d7ee95c48e03");
const IID_ELEMENT_ARRAY = WinGuid.parse("14314595-b4bc-4055-95f2-58f2e42c9855");
const IID_TEXT_PATTERN = WinGuid.parse("32eba289-3583-42c9-9c59-3b6d9a1e9b6a");
const IID_TEXT_RANGE = WinGuid.parse("a543cc6a-f4ae-494b-8239-c814481187a8");
const IID_TEXT_RANGE_ARRAY = WinGuid.parse("ce4ae76a-e717-4c98-81ea-47371d028eb6");
const IID_VALUE_PATTERN = WinGuid.parse("a94cd8b1-0844-4cd6-9d2d-640537ab39e9");
const IID_CONDITION = WinGuid.parse("352ffba8-0973-437c-a61f-f64cafd81df9");

const AUTOMATION_ELEMENT_FROM_HANDLE_SLOT = 6;
const AUTOMATION_FOCUSED_ELEMENT_SLOT = 8;
const AUTOMATION_CONTROL_VIEW_CONDITION_SLOT = 18;
const AUTOMATION_CREATE_CACHE_REQUEST_SLOT = 20;

const ELEMENT_FIND_ALL_BUILD_CACHE_SLOT = 8;
const ELEMENT_GET_CURRENT_PATTERN_AS_SLOT = 14;
const ELEMENT_GET_CACHED_PROPERTY_VALUE_SLOT = 12;
const ELEMENT_GET_CURRENT_PROPERTY_VALUE_SLOT = 10;

const CACHE_REQUEST_ADD_PROPERTY_SLOT = 3;
const CACHE_REQUEST_PUT_TREE_FILTER_SLOT = 9;

const ARRAY_LENGTH_SLOT = 3;
const ARRAY_GET_ELEMENT_SLOT = 4;

const TEXT_PATTERN_VISIBLE_RANGES_SLOT = 6;
const TEXT_PATTERN_DOCUMENT_RANGE_SLOT = 7;
const TEXT_RANGE_GET_TEXT_SLOT = 12;
const VALUE_PATTERN_VALUE_SLOT = 4;

const CACHED_OFFSET = 32;
const ELEMENT_PROCESS_ID_SLOT = 20;
const ELEMENT_CONTROL_TYPE_SLOT = 21;
const ELEMENT_NAME_SLOT = 23;
const ELEMENT_AUTOMATION_ID_SLOT = 29;
const ELEMENT_CLASS_NAME_SLOT = 30;
const ELEMENT_IS_OFFSCREEN_SLOT = 38;
const ELEMENT_BOUNDING_RECTANGLE_SLOT = 43;

const GETTER_SLOTS = [
  ELEMENT_PROCESS_ID_SLOT,
  ELEMENT_CONTROL_TYPE_SLOT,
  ELEMENT_NAME_SLOT,
  ELEMENT_AUTOMATION_ID_SLOT,
  ELEMENT_CLASS_NAME_SLOT,
  ELEMENT_IS_OFFSCREEN_SLOT,
  ELEMENT_BOUNDING_RECTANGLE_SLOT
];
const TREE_SCOPE_CHILDREN = 2;
const POINTER_BYTES = 8;
const RECT_BYTES = 16;
const RECT_TOP_OFFSET = 4;
const RECT_RIGHT_OFFSET = 8;
const RECT_BOTTOM_OFFSET = 12;
const VARIANT_BYTES = 24;
const VARIANT_VALUE_OFFSET = 8;
const BSTR_LENGTH_BYTES = 4;
const VT_I4 = 3;
const VT_BOOL = 11;
const VT_EMPTY = 0;
const NO_ADDRESS = 0n;
const UIA_E_ELEMENTNOTAVAILABLE = "80040201";
const UIA_E_ELEMENTNOTENABLED = "80040200";
const MAX_BSTR_BYTES = 0x7fffffff;

type DynComMethodSigStep = "int" | "pointer";

interface Held {
  readonly value: DynWinRtValue;
  readonly address: bigint;
}

function signatureOf(steps: readonly DynComMethodSigStep[]) {
  let signature = new DynComMethodSig();
  for (const step of steps) {
    signature = signature.addIn(step === "int" ? DynCom.i32Type() : DynComUnsafe.unclassifiedPointerType());
  }

  return signature;
}

function interfaceOf({ name, iid, slots }: {
  readonly name: string;
  readonly iid: WinGuid;
  readonly slots: Readonly<Record<number, readonly DynComMethodSigStep[]>>;
}) {
  let registered = DynComUnsafe.registerIUnknownInterface(name, iid);
  for (const [slot, steps] of Object.entries(slots)) {
    registered = registered.addMethodAt(Number(slot), `${name}${slot}`, signatureOf(steps));
  }

  return registered;
}

function isUnavailableMessage(message: string) {
  const lower = message.toLowerCase();
  return lower.includes(UIA_E_ELEMENTNOTAVAILABLE) || lower.includes(UIA_E_ELEMENTNOTENABLED);
}

function addressOf(memory: DynComRawMemory) {
  return DynComUnsafe.pointer(memory.pointer().address);
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The real UI Automation calls, over `CUIAutomation`. The COM objects are made
 * on the first call and every pointer is released by `dispose`; the thread
 * that calls must already be in a COM apartment (a worker that called
 * `DynCom.initialize`).
 *
 * @returns A backend for `runUiaClient`.
 */
export function createUiaNativeBackend() {
  const automationInterface = interfaceOf({
    name: "IUIAutomation",
    iid: IID_AUTOMATION,
    slots: {
      [AUTOMATION_ELEMENT_FROM_HANDLE_SLOT]: ["pointer", "pointer"],
      [AUTOMATION_FOCUSED_ELEMENT_SLOT]: ["pointer"],
      [AUTOMATION_CONTROL_VIEW_CONDITION_SLOT]: ["pointer"],
      [AUTOMATION_CREATE_CACHE_REQUEST_SLOT]: ["pointer"]
    }
  });
  const elementSlots: Record<number, readonly DynComMethodSigStep[]> = {
    [ELEMENT_FIND_ALL_BUILD_CACHE_SLOT]: ["int", "pointer", "pointer", "pointer"],
    [ELEMENT_GET_CURRENT_PATTERN_AS_SLOT]: ["int", "pointer", "pointer"],
    [ELEMENT_GET_CACHED_PROPERTY_VALUE_SLOT]: ["int", "pointer"],
    [ELEMENT_GET_CURRENT_PROPERTY_VALUE_SLOT]: ["int", "pointer"]
  };
  for (const base of GETTER_SLOTS) {
    elementSlots[base] = ["pointer"];
    elementSlots[base + CACHED_OFFSET] = ["pointer"];
  }

  const elementInterface = interfaceOf({
    name: "IUIAutomationElement",
    iid: IID_ELEMENT,
    slots: elementSlots
  });
  const cacheRequestInterface = interfaceOf({
    name: "IUIAutomationCacheRequest",
    iid: IID_CACHE_REQUEST,
    slots: {
      [CACHE_REQUEST_ADD_PROPERTY_SLOT]: ["int"],
      [CACHE_REQUEST_PUT_TREE_FILTER_SLOT]: ["pointer"]
    }
  });
  const arrayInterface = interfaceOf({
    name: "IUIAutomationElementArray",
    iid: IID_ELEMENT_ARRAY,
    slots: {
      [ARRAY_LENGTH_SLOT]: ["pointer"],
      [ARRAY_GET_ELEMENT_SLOT]: ["int", "pointer"]
    }
  });
  const rangeArrayInterface = interfaceOf({
    name: "IUIAutomationTextRangeArray",
    iid: IID_TEXT_RANGE_ARRAY,
    slots: {
      [ARRAY_LENGTH_SLOT]: ["pointer"],
      [ARRAY_GET_ELEMENT_SLOT]: ["int", "pointer"]
    }
  });
  const textPatternInterface = interfaceOf({
    name: "IUIAutomationTextPattern",
    iid: IID_TEXT_PATTERN,
    slots: {
      [TEXT_PATTERN_VISIBLE_RANGES_SLOT]: ["pointer"],
      [TEXT_PATTERN_DOCUMENT_RANGE_SLOT]: ["pointer"]
    }
  });
  const textRangeInterface = interfaceOf({
    name: "IUIAutomationTextRange",
    iid: IID_TEXT_RANGE,
    slots: {
      [TEXT_RANGE_GET_TEXT_SLOT]: ["int", "pointer"]
    }
  });
  const valuePatternInterface = interfaceOf({
    name: "IUIAutomationValuePattern",
    iid: IID_VALUE_PATTERN,
    slots: {
      [VALUE_PATTERN_VALUE_SLOT]: ["pointer"]
    }
  });

  const held: Held[] = [];
  const handles: Held[] = [];
  let automation: Held | null = null;
  let cacheRequest: Held | null = null;
  let conditionHeld: Held | null = null;

  function hold({ address, iid }: {
    readonly address: bigint;
    readonly iid: WinGuid;
  }) {
    const value = DynComUnsafe.adoptOwnedComPointer(address, iid);
    const entry = {
      value,
      address
    };
    held.push(entry);
    return entry;
  }

  function outPointer(call: (out: DynWinRtValue) => void) {
    const memory = DynComRawMemory.allocate(POINTER_BYTES, POINTER_BYTES);
    try {
      call(addressOf(memory));
      return memory.readU64(0);
    } finally {
      memory.release();
    }
  }

  function outMemory<T>({ size, read }: {
    readonly size: number;
    readonly read: (memory: DynComRawMemory) => T;
  }) {
    const memory = DynComRawMemory.allocate(size, POINTER_BYTES);
    try {
      return read(memory);
    } finally {
      memory.release();
    }
  }

  function guard<T>(call: () => T) {
    try {
      return call();
    } catch (error) {
      const message = describe(error);
      const isUnavailable = isUnavailableMessage(message);
      if (isUnavailable) {
        throw new UiaElementUnavailableError(message);
      }

      throw error;
    }
  }

  function readBstr(address: bigint) {
    const isAddressNOADDRESS = address === NO_ADDRESS;
    if (isAddressNOADDRESS) {
      return "";
    }

    const prefix = address - BigInt(BSTR_LENGTH_BYTES);
    const length = DynComRawMemory.fromUnsafeAddress(prefix, BSTR_LENGTH_BYTES, 1).readU32(0);
    const isSane = length <= MAX_BSTR_BYTES;
    const isReadable = isSane && length > 0;
    const text = isReadable
      ? DynComRawMemory.fromUnsafeAddress(address, length, 1).readBytes(0, length).toString("utf16le")
      : "";
    DynComRawCleanup.sysFreeString(DynComRawPointer.fromAddress(address));
    return text;
  }

  function bstrOf({ object, interfaceType, slot, steps }: {
    readonly object: Held;
    readonly interfaceType: ReturnType<typeof interfaceOf>;
    readonly slot: number;
    readonly steps?: readonly DynWinRtValue[];
  }) {
    return guard(() => readBstr(
      outPointer(out => {
        interfaceType.method(slot).invoke(object.value, [...steps ?? [], out]);
      })
    ));
  }

  function numberOut({ object, slot }: {
    readonly object: Held;
    readonly slot: number;
  }) {
    return guard(() => outMemory({
      size: POINTER_BYTES,
      read(memory) {
        elementInterface.method(slot).invoke(object.value, [addressOf(memory)]);
        return memory.readI32(0);
      }
    }));
  }

  function getAutomation() {
    if (automation) {
      return automation;
    }

    const created = DynComUnsafe.coCreateInstance(CLSID_UI_AUTOMATION, IID_AUTOMATION);
    const address = DynComRawPointer.fromManagedBorrowed(created).address;
    const entry = {
      value: created,
      address
    };
    held.push(entry);
    automation = entry;
    return entry;
  }

  function getCacheRequest() {
    if (cacheRequest) {
      return cacheRequest;
    }

    const root = getAutomation();
    const request = hold({
      address: outPointer(out => {
        automationInterface.method(AUTOMATION_CREATE_CACHE_REQUEST_SLOT).invoke(root.value, [out]);
      }),
      iid: IID_CACHE_REQUEST
    });
    const condition = hold({
      address: outPointer(out => {
        automationInterface.method(AUTOMATION_CONTROL_VIEW_CONDITION_SLOT).invoke(root.value, [out]);
      }),
      iid: IID_CONDITION
    });
    const cached = [
      UiaPropertyId.name, UiaPropertyId.className, UiaPropertyId.automationId, UiaPropertyId.controlType,
      UiaPropertyId.processId, UiaPropertyId.isOffscreen, UiaPropertyId.boundingRectangle,
      UiaPropertyId.headingLevel, UiaPropertyId.isTextPatternAvailable, UiaPropertyId.isValuePatternAvailable
    ];
    for (const property of cached) {
      cacheRequestInterface.method(CACHE_REQUEST_ADD_PROPERTY_SLOT).invoke(request.value, [
        DynWinRtValue.i32(property)
      ]);
    }

    cacheRequestInterface.method(CACHE_REQUEST_PUT_TREE_FILTER_SLOT).invoke(request.value, [
      DynComUnsafe.pointer(condition.address)
    ]);
    cacheRequest = request;
    conditionHeld = condition;
    return request;
  }

  function register(entry: Held) {
    handles.push(entry);
    return handles.length - 1;
  }

  function entryOf(handle: UiaHandle) {
    const entry = handles[handle];
    const isEntryUndefined = entry === undefined;
    if (isEntryUndefined) {
      throw new UiaElementUnavailableError("the handle is not of this scope");
    }

    return entry;
  }

  function variantOf({ element, property, isCached }: {
    readonly element: Held;
    readonly property: number;
    readonly isCached: boolean;
  }) {
    return guard(() => outMemory({
      size: VARIANT_BYTES,
      read(memory) {
        memory.writeBytes(0, Buffer.alloc(VARIANT_BYTES));
        const slot = isCached ? ELEMENT_GET_CACHED_PROPERTY_VALUE_SLOT : ELEMENT_GET_CURRENT_PROPERTY_VALUE_SLOT;
        elementInterface.method(slot).invoke(element.value, [DynWinRtValue.i32(property), addressOf(memory)]);
        const type = memory.readU16(0);
        const raw = memory.readI32(VARIANT_VALUE_OFFSET);
        DynComRawCleanup.variantClear(memory, 0);
        const isNumber = type === VT_I4;
        const isBoolean = type === VT_BOOL;
        const isEmpty = type === VT_EMPTY;
        return {
          number: isNumber ? raw : 0,
          boolean: isBoolean ? memory.readI16(VARIANT_VALUE_OFFSET) !== 0 : false,
          isEmpty
        };
      }
    }));
  }

  function propertiesOf({ element, isCached }: {
    readonly element: Held;
    readonly isCached: boolean;
  }) {
    const offset = isCached ? CACHED_OFFSET : 0;
    const rectangle = guard(() => outMemory({
      size: RECT_BYTES,
      read(memory) {
        elementInterface.method(ELEMENT_BOUNDING_RECTANGLE_SLOT + offset).invoke(element.value, [addressOf(memory)]);
        const left = memory.readI32(0);
        const top = memory.readI32(RECT_TOP_OFFSET);
        return {
          left,
          top,
          width: memory.readI32(RECT_RIGHT_OFFSET) - left,
          height: memory.readI32(RECT_BOTTOM_OFFSET) - top
        };
      }
    }));
    const level = variantOf({
      element,
      property: UiaPropertyId.headingLevel,
      isCached
    }).number;
    const isHeading = level > HEADING_LEVEL_NONE;
    const properties: UiaProperties = {
      name: bstrOf({
        object: element,
        interfaceType: elementInterface,
        slot: ELEMENT_NAME_SLOT + offset
      }),
      className: bstrOf({
        object: element,
        interfaceType: elementInterface,
        slot: ELEMENT_CLASS_NAME_SLOT + offset
      }),
      automationId: bstrOf({
        object: element,
        interfaceType: elementInterface,
        slot: ELEMENT_AUTOMATION_ID_SLOT + offset
      }),
      // oxlint-disable-next-line typescript/consistent-type-assertions -- the answer is a control type id of the header
      controlType: numberOut({
        object: element,
        slot: ELEMENT_CONTROL_TYPE_SLOT + offset
      }) as UiaControlType,
      processId: numberOut({
        object: element,
        slot: ELEMENT_PROCESS_ID_SLOT + offset
      }),
      isOffscreen: numberOut({
        object: element,
        slot: ELEMENT_IS_OFFSCREEN_SLOT + offset
      }) !== 0,
      boundingRectangle: rectangle,
      headingLevel: isHeading ? level - HEADING_LEVEL_FIRST + 1 : 0,
      hasTextPattern: variantOf({
        element,
        property: UiaPropertyId.isTextPatternAvailable,
        isCached
      }).boolean,
      hasValuePattern: variantOf({
        element,
        property: UiaPropertyId.isValuePatternAvailable,
        isCached
      }).boolean
    };
    return properties;
  }

  function patternOf({ element, pattern, iid }: {
    readonly element: Held;
    readonly pattern: number;
    readonly iid: WinGuid;
  }) {
    const address = guard(() => outPointer(out => {
      elementInterface.method(ELEMENT_GET_CURRENT_PATTERN_AS_SLOT).invoke(element.value, [
        DynWinRtValue.i32(pattern),
        DynComUnsafe.iidPointer(iid),
        out
      ]);
    }));
    return address === NO_ADDRESS ? null : hold({
      address,
      iid
    });
  }

  const backend: UiaBackend = {
    elementFromHandle(hwnd) {
      const root = getAutomation();
      const address = guard(() => outPointer(out => {
        automationInterface.method(AUTOMATION_ELEMENT_FROM_HANDLE_SLOT).invoke(root.value, [
          DynComUnsafe.pointer(hwnd),
          out
        ]);
      }));
      return address === NO_ADDRESS ? null : register(
        hold({
          address,
          iid: IID_ELEMENT
        })
      );
    },
    focusedElement() {
      const root = getAutomation();
      const address = guard(() => outPointer(out => {
        automationInterface.method(AUTOMATION_FOCUSED_ELEMENT_SLOT).invoke(root.value, [out]);
      }));
      return address === NO_ADDRESS ? null : register(
        hold({
          address,
          iid: IID_ELEMENT
        })
      );
    },
    properties(handle) {
      return propertiesOf({
        element: entryOf(handle),
        isCached: false
      });
    },
    children(handle) {
      const parent = entryOf(handle);
      const request = getCacheRequest();
      const condition = conditionHeld;
      const isConditionNull = condition === null;
      if (isConditionNull) {
        return [];
      }

      const arrayAddress = guard(() => outPointer(out => {
        elementInterface.method(ELEMENT_FIND_ALL_BUILD_CACHE_SLOT).invoke(parent.value, [
          DynWinRtValue.i32(TREE_SCOPE_CHILDREN),
          DynComUnsafe.pointer(condition.address),
          DynComUnsafe.pointer(request.address),
          out
        ]);
      }));
      const isArrayAddressNOADDRESS = arrayAddress === NO_ADDRESS;
      if (isArrayAddressNOADDRESS) {
        return [];
      }

      const array = hold({
        address: arrayAddress,
        iid: IID_ELEMENT_ARRAY
      });
      const count = guard(() => outMemory({
        size: POINTER_BYTES,
        read(memory) {
          arrayInterface.method(ARRAY_LENGTH_SLOT).invoke(array.value, [addressOf(memory)]);
          return memory.readI32(0);
        }
      }));
      const children: UiaChild[] = [];
      for (let i = 0; i < count; i += 1) {
        const childAddress = guard(() => outPointer(out => {
          arrayInterface.method(ARRAY_GET_ELEMENT_SLOT).invoke(array.value, [DynWinRtValue.i32(i), out]);
        }));
        const child = hold({
          address: childAddress,
          iid: IID_ELEMENT
        });
        try {
          children.push({
            handle: register(child),
            properties: propertiesOf({
              element: child,
              isCached: true
            })
          });
        } catch (error) {
          const isUnavailable = error instanceof UiaElementUnavailableError;
          if (!isUnavailable) {
            throw error;
          }
        }
      }

      return children;
    },
    visibleRanges(handle) {
      const pattern = patternOf({
        element: entryOf(handle),
        pattern: UiaPatternId.text,
        iid: IID_TEXT_PATTERN
      });
      const isPatternNull = pattern === null;
      if (isPatternNull) {
        return null;
      }

      const arrayAddress = guard(() => outPointer(out => {
        textPatternInterface.method(TEXT_PATTERN_VISIBLE_RANGES_SLOT).invoke(pattern.value, [out]);
      }));
      const isArrayAddressNOADDRESS = arrayAddress === NO_ADDRESS;
      if (isArrayAddressNOADDRESS) {
        return [];
      }

      const array = hold({
        address: arrayAddress,
        iid: IID_TEXT_RANGE_ARRAY
      });
      const count = guard(() => outMemory({
        size: POINTER_BYTES,
        read(memory) {
          rangeArrayInterface.method(ARRAY_LENGTH_SLOT).invoke(array.value, [addressOf(memory)]);
          return memory.readI32(0);
        }
      }));
      const ranges: UiaHandle[] = [];
      for (let i = 0; i < count; i += 1) {
        const address = guard(() => outPointer(out => {
          rangeArrayInterface.method(ARRAY_GET_ELEMENT_SLOT).invoke(array.value, [DynWinRtValue.i32(i), out]);
        }));
        ranges.push(
          register(
            hold({
              address,
              iid: IID_TEXT_RANGE
            })
          )
        );
      }

      return ranges;
    },
    documentRange(handle) {
      const pattern = patternOf({
        element: entryOf(handle),
        pattern: UiaPatternId.text,
        iid: IID_TEXT_PATTERN
      });
      const isPatternNull = pattern === null;
      if (isPatternNull) {
        return null;
      }

      const address = guard(() => outPointer(out => {
        textPatternInterface.method(TEXT_PATTERN_DOCUMENT_RANGE_SLOT).invoke(pattern.value, [out]);
      }));
      return address === NO_ADDRESS ? null : register(
        hold({
          address,
          iid: IID_TEXT_RANGE
        })
      );
    },
    rangeText({ range, maxLength }) {
      return bstrOf({
        object: entryOf(range),
        interfaceType: textRangeInterface,
        slot: TEXT_RANGE_GET_TEXT_SLOT,
        steps: [DynWinRtValue.i32(maxLength)]
      });
    },
    value(handle) {
      const pattern = patternOf({
        element: entryOf(handle),
        pattern: UiaPatternId.value,
        iid: IID_VALUE_PATTERN
      });
      const isPatternNull = pattern === null;
      if (isPatternNull) {
        return null;
      }

      return bstrOf({
        object: pattern,
        interfaceType: valuePatternInterface,
        slot: VALUE_PATTERN_VALUE_SLOT
      });
    },
    dispose() {
      for (const entry of held.reverse()) {
        entry.value.release();
      }

      held.length = 0;
      handles.length = 0;
      automation = null;
      cacheRequest = null;
      conditionHeld = null;
    }
  };
  return backend;
}
