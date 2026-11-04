package dev.winui.svelte

internal data class Declaration(
  val property: String,
  val value: String
) {
  val text get() = "$property: $value;"
}
