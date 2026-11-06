package dev.winui.svelte

internal data class WinuiResource(
  val name: String,
  val property: String,
  val kind: String,
  val light: String?,
  val dark: String?
) {
  val isColor get() = light != null || dark != null
}
