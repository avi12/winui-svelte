import { DynWinRtMethodSig, DynWinRtType, DynWinRtValue, WinGuid } from "@microsoft/dynwinrt";
import { reportUiError } from "#src/ui-errors.js";

// What `Application.Start` does before its loop, done by hand because the
// loop is ours (message-pump.ts): a dispatcher queue on this thread, then the
// XAML framework on that queue. Neither class is in the generated bindings
// (the app's `winapp.jsBindings` list does not carry them), so each is the one
// method the setup needs, by its vtable slot: the first method of an
// interface is slot 6, after IInspectable.

const CONTROLLER_CLASS = "Microsoft.UI.Dispatching.DispatcherQueueController";
const CONTROLLER_STATICS_IID = "f18d6145-722b-593d-bcf2-a61e713f0037";
const CONTROLLER_IID = "bce8178d-2183-584c-9e5b-f9366f6ae484";
// CreateOnDedicatedThread is slot 6, CreateOnCurrentThread slot 7.
const CREATE_ON_CURRENT_THREAD_SLOT = 7;
const MANAGER_CLASS = "Microsoft.UI.Xaml.Hosting.WindowsXamlManager";
const MANAGER_STATICS_IID = "56cb591d-de97-539f-881d-8ccdc44fa6c4";
const MANAGER_IID = "85a2e562-7e8f-5333-a104-a3e672a2ffee";
const INITIALIZE_FOR_CURRENT_THREAD_SLOT = 6;
// IClosable.Close, the first method after IInspectable's.
const CLOSABLE_IID = "30d5a829-7fa4-4026-83bb-d75bae4ea99e";
const CLOSE_SLOT = 6;

function createOnCurrentThread() {
  const controller = DynWinRtType.runtimeClass(CONTROLLER_CLASS, DynWinRtType.interface(WinGuid.parse(CONTROLLER_IID)));
  const statics = DynWinRtType.registerInterface("IDispatcherQueueControllerStatics", WinGuid.parse(CONTROLLER_STATICS_IID))
    .addMethod("CreateOnDedicatedThread", new DynWinRtMethodSig().addOut(controller))
    .addMethod("CreateOnCurrentThread", new DynWinRtMethodSig().addOut(controller));
  const factory = DynWinRtValue.activationFactory(CONTROLLER_CLASS).cast(WinGuid.parse(CONTROLLER_STATICS_IID));
  return statics.method(CREATE_ON_CURRENT_THREAD_SLOT).invoke(factory, []);
}

function initializeForCurrentThread() {
  const manager = DynWinRtType.runtimeClass(MANAGER_CLASS, DynWinRtType.interface(WinGuid.parse(MANAGER_IID)));
  const statics = DynWinRtType.registerInterface("IWindowsXamlManagerStatics", WinGuid.parse(MANAGER_STATICS_IID))
    .addMethod("InitializeForCurrentThread", new DynWinRtMethodSig().addOut(manager));
  const factory = DynWinRtValue.activationFactory(MANAGER_CLASS).cast(WinGuid.parse(MANAGER_STATICS_IID));
  return statics.method(INITIALIZE_FOR_CURRENT_THREAD_SLOT).invoke(factory, []);
}

function closeManager(manager: ReturnType<typeof initializeForCurrentThread>) {
  const closable = DynWinRtType.registerInterface("IClosable", WinGuid.parse(CLOSABLE_IID))
    .addMethod("Close", new DynWinRtMethodSig());
  closable.method(CLOSE_SLOT).invoke(manager.cast(WinGuid.parse(CLOSABLE_IID)), []);
}

/**
 * Gives this thread a dispatcher queue and the XAML framework on it, with
 * `createApplication` run in between: the application must exist before the
 * framework is initialized (the other order fails with a catastrophic error),
 * and the queue before both. Returns what keeps them alive, which the caller
 * holds until the application has ended, and releases with `release`.
 */
export function startXamlThread(createApplication: () => void) {
  const controller = createOnCurrentThread();
  createApplication();
  const manager = initializeForCurrentThread();
  return {
    // The manager is closed, not just released: closing is what shuts XAML
    // down, here, while the Node environment can still take the callbacks it
    // raises; released alone it is shut down when the thread is torn down.
    release() {
      try {
        closeManager(manager);
      } catch (error) {
        reportUiError({
          error,
          origin: "closing XAML"
        });
      }

      manager.release();
      controller.release();
    }
  };
}
