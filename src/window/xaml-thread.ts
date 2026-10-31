import { DynWinRtMethodSig, DynWinRtType, DynWinRtValue, WinGuid } from "@microsoft/dynwinrt";

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

/**
 * Gives this thread a dispatcher queue and the XAML framework on it, with
 * `createApplication` run in between: the application must exist before the
 * framework is initialized (the other order fails with a catastrophic error),
 * and the queue before both. Returns what keeps them alive, which the caller
 * holds until the application has ended.
 */
export function startXamlThread(createApplication: () => void) {
  const controller = createOnCurrentThread();
  createApplication();
  const manager = initializeForCurrentThread();
  return {
    controller,
    manager
  };
}
