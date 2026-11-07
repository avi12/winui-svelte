import { runOnUiThread } from "winui-svelte/thread";

await runOnUiThread(async () => {
  const { createWindow, runWindow } = await import("winui-svelte/window");
  const { default: appComponent } = await import("./App.svelte");
  await runWindow({
    onStart() {
      createWindow({
        component: appComponent,
        props: {},
        title: "tray-entrypoint-svelte",
        isBackground: process.env["WINUI_SVELTE_BACKGROUND"] === "1"
      });
    }
  });
});
