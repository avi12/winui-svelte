import type { JumpListBackend, ShellLinkSpec } from "./tasks.ts";
import { DynWinRtValue, WinGuid } from "@microsoft/dynwinrt";
import { DynCom, DynComMethodSig, DynComUnsafe } from "@microsoft/dynwinrt/com/unsafe";
import { DynComRawMemory, DynComRawOwnedComPointer, DynComRawPointer } from "@microsoft/dynwinrt/com/unsafe/raw";
import { bindDll, POINTER_BYTES, wideMemory } from "#src/win32-calls.js";

// ICustomDestinationList, IObjectCollection, IShellLinkW and IPropertyStore
// (shobjidl_core.h, propsys.h) have no WinRT form, so their methods are
// declared here by hand at their vtable slots, which count IUnknown's three
// first. Each object is made with CoCreateInstance on a thread with COM.

const CLSID_DESTINATION_LIST = "77f10cf0-3db5-4966-b520-b7c54fd35ed6";
const CLSID_OBJECT_COLLECTION = "2d3468c1-36a7-43b6-ac24-d3f02fd9607a";
const CLSID_SHELL_LINK = "00021401-0000-0000-c000-000000000046";
const IID_DESTINATION_LIST = WinGuid.parse("6332debf-87b5-4670-90c0-5e57b408a49e");
const IID_OBJECT_COLLECTION = WinGuid.parse("5632b1a4-e38a-400a-928a-d4cd63230295");
const IID_OBJECT_ARRAY = WinGuid.parse("92ca9dcd-5622-4bba-a805-5e9f541bd8c9");
const IID_SHELL_LINK = WinGuid.parse("000214f9-0000-0000-c000-000000000046");
const IID_PROPERTY_STORE = WinGuid.parse("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99");

const SET_APP_ID_SLOT = 3;
const BEGIN_LIST_SLOT = 4;
const ADD_USER_TASKS_SLOT = 7;
const COMMIT_LIST_SLOT = 8;
const DELETE_LIST_SLOT = 10;
const ABORT_LIST_SLOT = 11;
const ADD_OBJECT_SLOT = 5;
const SET_DESCRIPTION_SLOT = 7;
const SET_WORKING_DIRECTORY_SLOT = 9;
const SET_ARGUMENTS_SLOT = 11;
const SET_ICON_LOCATION_SLOT = 17;
const SET_PATH_SLOT = 20;
const SET_VALUE_SLOT = 6;
const COMMIT_SLOT = 7;

const PROPERTY_KEY_BYTES = 24;
const PROPVARIANT_BYTES = 24;
const VT_LPWSTR = 31;
const OFFSET_VARIANT_VALUE = 8;
const OFFSET_KEY_PROPERTY = 16;
const PKEY_TITLE_DATA1 = 0xF2_9F_85_E0;
const PKEY_TITLE_DATA2 = 0x4F_F9;
const PKEY_TITLE_DATA3 = 0x10_68;
const PKEY_TITLE_DATA4 = Buffer.from("AB9108002B27B3D9", "hex");
const PKEY_TITLE_PROPERTY = 2;
const OFFSET_KEY_DATA2 = 4;
const OFFSET_KEY_DATA3 = 6;
const OFFSET_KEY_DATA4 = 8;
const MAX_APP_ID_CHARACTERS = 128;
const BEGIN_LIST_PARAMETERS = 3;

function pointer() {
  return DynComUnsafe.unclassifiedPointerType();
}

function pointers(count: number) {
  let signature = new DynComMethodSig();
  for (let i = 0; i < count; i += 1) {
    signature = signature.addIn(pointer());
  }

  return signature;
}

function destinationListMethods() {
  return DynComUnsafe.registerIUnknownInterface("ICustomDestinationList", IID_DESTINATION_LIST)
    .addMethodAt(SET_APP_ID_SLOT, "SetAppID", pointers(1))
    .addMethodAt(BEGIN_LIST_SLOT, "BeginList", pointers(BEGIN_LIST_PARAMETERS))
    .addMethodAt(ADD_USER_TASKS_SLOT, "AddUserTasks", pointers(1))
    .addMethodAt(COMMIT_LIST_SLOT, "CommitList", new DynComMethodSig())
    .addMethodAt(DELETE_LIST_SLOT, "DeleteList", pointers(1))
    .addMethodAt(ABORT_LIST_SLOT, "AbortList", new DynComMethodSig());
}

function collectionMethods() {
  return DynComUnsafe.registerIUnknownInterface("IObjectCollection", IID_OBJECT_COLLECTION)
    .addMethodAt(ADD_OBJECT_SLOT, "AddObject", pointers(1));
}

function shellLinkMethods() {
  return DynComUnsafe.registerIUnknownInterface("IShellLinkW", IID_SHELL_LINK)
    .addMethodAt(SET_DESCRIPTION_SLOT, "SetDescription", pointers(1))
    .addMethodAt(SET_WORKING_DIRECTORY_SLOT, "SetWorkingDirectory", pointers(1))
    .addMethodAt(SET_ARGUMENTS_SLOT, "SetArguments", pointers(1))
    .addMethodAt(SET_ICON_LOCATION_SLOT, "SetIconLocation", pointers(1).addIn(DynCom.i32Type()))
    .addMethodAt(SET_PATH_SLOT, "SetPath", pointers(1));
}

function propertyStoreMethods() {
  return DynComUnsafe.registerIUnknownInterface("IPropertyStore", IID_PROPERTY_STORE)
    .addMethodAt(SET_VALUE_SLOT, "SetValue", pointers(2))
    .addMethodAt(COMMIT_SLOT, "Commit", new DynComMethodSig());
}

function text(value: string | null) {
  return DynComUnsafe.wideStringPointer(value);
}

function addressOf(value: DynWinRtValue) {
  return DynComUnsafe.pointer(DynComRawPointer.fromManagedBorrowed(value).address);
}

function appUserModelIdCalls() {
  const shell = bindDll({
    dll: "shell32.dll",
    functions: {
      currentId: ["GetCurrentProcessExplicitAppUserModelID", ["pointer"], "i32"]
    }
  });
  const kernel = bindDll({
    dll: "kernel32.dll",
    functions: {
      length: ["lstrlenW", ["pointer"], "i32"]
    }
  });
  const ole = bindDll({
    dll: "ole32.dll",
    functions: {
      free: ["CoTaskMemFree", ["pointer"], "i32"]
    }
  });
  return {
    shell,
    kernel,
    ole
  };
}

/**
 * The real jump list: `ICustomDestinationList` over dynwinrt. The Win32
 * functions are bound when this is called, never when the module loads.
 *
 * @returns A backend for `setJumpListTasks` and `clearJumpList`.
 */
export function createJumpListNative() {
  const destinationList = destinationListMethods();
  const collection = collectionMethods();
  const shellLink = shellLinkMethods();
  const propertyStore = propertyStoreMethods();
  const calls = appUserModelIdCalls();

  function create({ clsid, iid }: {
    clsid: string;
    iid: WinGuid;
  }) {
    return DynComUnsafe.coCreateInstance(clsid, iid);
  }

  function setTitle({ store, title }: {
    store: DynWinRtValue;
    title: string;
  }) {
    const key = DynComRawMemory.allocate(PROPERTY_KEY_BYTES, POINTER_BYTES);
    const variant = DynComRawMemory.allocate(PROPVARIANT_BYTES, POINTER_BYTES);
    const value = wideMemory(title);
    try {
      key.writeU32(0, PKEY_TITLE_DATA1);
      key.writeU16(OFFSET_KEY_DATA2, PKEY_TITLE_DATA2);
      key.writeU16(OFFSET_KEY_DATA3, PKEY_TITLE_DATA3);
      key.writeBytes(OFFSET_KEY_DATA4, PKEY_TITLE_DATA4);
      key.writeU32(OFFSET_KEY_PROPERTY, PKEY_TITLE_PROPERTY);
      variant.writeBytes(0, Buffer.alloc(PROPVARIANT_BYTES));
      variant.writeU16(0, VT_LPWSTR);
      variant.writeU64(OFFSET_VARIANT_VALUE, value.pointer().address);
      propertyStore.method(SET_VALUE_SLOT).invoke(store, [
        DynComUnsafe.pointer(key.pointer().address),
        DynComUnsafe.pointer(variant.pointer().address)
      ]);
      propertyStore.method(COMMIT_SLOT).invoke(store, []);
    } finally {
      value.release();
      variant.release();
      key.release();
    }
  }

  function linkOf(spec: ShellLinkSpec) {
    const link = create({
      clsid: CLSID_SHELL_LINK,
      iid: IID_SHELL_LINK
    });
    const store = DynComRawOwnedComPointer.queryInterface(link, IID_PROPERTY_STORE).intoManaged(IID_PROPERTY_STORE);
    try {
      shellLink.method(SET_PATH_SLOT).invoke(link, [text(spec.path)]);
      shellLink.method(SET_ARGUMENTS_SLOT).invoke(link, [text(spec.arguments)]);

      const { description, workingDirectory, iconPath } = spec;
      const hasDescription = description !== null;
      if (hasDescription) {
        shellLink.method(SET_DESCRIPTION_SLOT).invoke(link, [text(description)]);
      }

      const hasWorkingDirectory = workingDirectory !== null;
      if (hasWorkingDirectory) {
        shellLink.method(SET_WORKING_DIRECTORY_SLOT).invoke(link, [text(workingDirectory)]);
      }

      const hasIcon = iconPath !== null;
      if (hasIcon) {
        shellLink.method(SET_ICON_LOCATION_SLOT).invoke(link, [text(iconPath), DynWinRtValue.i32(spec.iconIndex)]);
      }

      setTitle({
        store,
        title: spec.title
      });
      return link;
    } catch (error) {
      link.release();
      throw error;
    } finally {
      store.release();
    }
  }

  function beginList(list: DynWinRtValue) {
    const slots = DynComRawMemory.allocate(POINTER_BYTES * 2, POINTER_BYTES);
    try {
      const minimumSlots = slots.pointer().address;
      const removed = slots.pointer(POINTER_BYTES).address;
      destinationList.method(BEGIN_LIST_SLOT).invoke(list, [
        DynComUnsafe.pointer(minimumSlots),
        DynComUnsafe.iidPointer(IID_OBJECT_ARRAY),
        DynComUnsafe.pointer(removed)
      ]);
      DynComUnsafe.adoptOwnedComPointer(slots.readU64(POINTER_BYTES), IID_OBJECT_ARRAY).release();
    } finally {
      slots.release();
    }
  }

  function fill({ tasks, links }: {
    tasks: DynWinRtValue;
    links: readonly ShellLinkSpec[];
  }) {
    for (const spec of links) {
      const link = linkOf(spec);
      try {
        collection.method(ADD_OBJECT_SLOT).invoke(tasks, [addressOf(link)]);
      } finally {
        link.release();
      }
    }
  }

  const backend: JumpListBackend = {
    currentAppUserModelId() {
      const out = DynComRawMemory.allocate(POINTER_BYTES, POINTER_BYTES);
      try {
        const status = calls.shell.currentId(out);
        const isUnset = status !== 0;
        if (isUnset) {
          return null;
        }

        const address = out.readU64(0);
        try {
          const length = Math.min(calls.kernel.length(address), MAX_APP_ID_CHARACTERS);
          return DynComRawMemory.fromUnsafeAddress(address, length * 2 + 2, 2).readBytes(0, length * 2).toString("utf16le");
        } finally {
          calls.ole.free(address);
        }
      } finally {
        out.release();
      }
    },
    replaceTasks({ appUserModelId, links }) {
      const list = create({
        clsid: CLSID_DESTINATION_LIST,
        iid: IID_DESTINATION_LIST
      });
      const tasks = create({
        clsid: CLSID_OBJECT_COLLECTION,
        iid: IID_OBJECT_COLLECTION
      });
      try {
        destinationList.method(SET_APP_ID_SLOT).invoke(list, [text(appUserModelId)]);
        beginList(list);
        try {
          fill({
            tasks,
            links
          });
          destinationList.method(ADD_USER_TASKS_SLOT).invoke(list, [addressOf(tasks)]);
          destinationList.method(COMMIT_LIST_SLOT).invoke(list, []);
        } catch (error) {
          destinationList.method(ABORT_LIST_SLOT).invoke(list, []);
          throw error;
        }
      } finally {
        tasks.release();
        list.release();
      }
    },
    deleteList(appUserModelId) {
      const list = create({
        clsid: CLSID_DESTINATION_LIST,
        iid: IID_DESTINATION_LIST
      });
      try {
        destinationList.method(DELETE_LIST_SLOT).invoke(list, [text(appUserModelId)]);
      } finally {
        list.release();
      }
    }
  };
  return backend;
}
