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
    <TextBlock {@attach keyControl("devices")}>{inputSummary(input)}</TextBlock>
    <TextBlock>{batterySummary(power)}</TextBlock>
    <TextBlock>{networkSummary(network)}</TextBlock>
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
      <TextBlock>Radio {radio.name}</TextBlock>
    {/each}
    <Button onclick={toggleScan}>{scanLabel()}</Button>
    {#each scanner.advertisements.items as advertisement (advertisement.addressText)}
      <TextBlock>{advertisement.localName || advertisement.addressText} {advertisement.rssi} dBm</TextBlock>
    {/each}
  </StackPanel>
</PageFrame>

<style>
  .devices-block {
    gap: 6px;
  }
</style>
