import { protectData, unprotectData } from "winui-svelte/security";

const sealed = protectData({ data: new Uint8Array(1) });
process.stdout.write(String(unprotectData({ data: sealed }).length));
