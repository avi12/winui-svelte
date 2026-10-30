<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { Button, StackPanel, TextBlock } from "winui-svelte/components";
  import { audioDevices } from "winui-svelte/devices/audio";
  import { bluetoothScanner, radios } from "winui-svelte/devices/bluetooth";
  import { inputDevices } from "winui-svelte/devices/input";
  import { networkInformation } from "winui-svelte/devices/network";
  import { battery } from "winui-svelte/devices/power";
  import { printers } from "winui-svelte/devices/printers";

  const input = inputDevices();
  const power = battery();
  const network = networkInformation();
  const audio = audioDevices();
  const installed = printers();
  const wireless = radios();
  const scanner = bluetoothScanner();
</script>

<PageFrame
  caption="Windows' own device APIs, live: the input devices, battery, network, audio endpoints, printers, radios and a Bluetooth LE scan."
  title="Devices"
>
  <StackPanel class="devices-block">
    <TextBlock {@attach keyControl("devices")} text="Mouse {input.hasMouse ? `${input.mouseButtons} buttons` : "none"}, keyboard {input.hasKeyboard ? "yes" : "no"}, touch {input.hasTouch ? `${input.touchContacts} contacts` : "none"}, pen {input.hasPen ? "yes" : "no"}" />
    <TextBlock text="Battery {power.hasBattery ? `${power.percent}%` : "none"}, {power.isOnAcPower ? "on AC power" : "on battery"}" />
    <TextBlock text="Network {network.isOnline ? network.profileName : "offline"}{network.isMetered ? " (metered)" : ""}" />
    {#each audio.outputs.devices.items as device (device.id)}
      <TextBlock text="Output {device.name}{device.id === audio.defaultOutputId ? " (default)" : ""}" />
    {/each}
    {#each installed.printers as printer (printer.name)}
      <TextBlock text="Printer {printer.name}{printer.isDefault ? " (default)" : ""}{printer.isOffline ? " (offline)" : ""}" />
    {/each}
    {#each wireless.radios as radio (radio.name)}
      <TextBlock text="Radio {radio.name}" />
    {/each}
    <Button onClick={() => (scanner.isScanning ? scanner.stop() : scanner.start())}>
      {scanner.isScanning ? "Stop the Bluetooth scan" : "Scan for Bluetooth LE devices"}
    </Button>
    {#each scanner.advertisements.items as advertisement (advertisement.addressText)}
      <TextBlock text="{advertisement.localName || advertisement.addressText} {advertisement.rssi} dBm" />
    {/each}
  </StackPanel>
</PageFrame>

<style>
  :global(.devices-block) {
    gap: 6px;
  }
</style>
