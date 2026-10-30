<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { batterySummary, inputSummary, marked, networkSummary } from "#examples/gallery/pages/devices-summary.ts";
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

  function scanLabel() {
    if (scanner.isScanning) {
      return "Stop the Bluetooth scan";
    }

    return "Scan for Bluetooth LE devices";
  }

  function toggleScan() {
    if (scanner.isScanning) {
      scanner.stop();
      return;
    }

    scanner.start();
  }
</script>

<PageFrame
  caption="Windows' own device APIs, live: the input devices, battery, network, audio endpoints, printers, radios and a Bluetooth LE scan."
  title="Devices"
>
  <StackPanel class="devices-block">
    <TextBlock {@attach keyControl("devices")} text={inputSummary(input)} />
    <TextBlock text={batterySummary(power)} />
    <TextBlock text={networkSummary(network)} />
    {#each audio.outputs.devices.items as device (device.id)}
      <TextBlock
        text={marked({
          name: `Output ${device.name}`,
          marks: {
            default: device.id === audio.defaultOutputId
          }
        })} />
    {/each}
    {#each installed.printers as printer (printer.name)}
      <TextBlock
        text={marked({
          name: `Printer ${printer.name}`,
          marks: {
            default: printer.isDefault,
            offline: printer.isOffline
          }
        })} />
    {/each}
    {#each wireless.radios as radio (radio.name)}
      <TextBlock text="Radio {radio.name}" />
    {/each}
    <Button onClick={toggleScan}>{scanLabel()}</Button>
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
