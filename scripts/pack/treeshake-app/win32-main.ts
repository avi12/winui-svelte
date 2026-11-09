import { bindDll, hasPackageIdentity, wideMemory } from "winui-svelte/win32";

const user32 = bindDll({
  dll: "user32.dll",
  functions: {
    foreground: ["GetForegroundWindow", [], "pointer"]
  }
});
console.log(user32.foreground(), hasPackageIdentity(), wideMemory("x"));
