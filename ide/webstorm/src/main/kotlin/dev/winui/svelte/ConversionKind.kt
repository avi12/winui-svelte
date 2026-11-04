package dev.winui.svelte

internal enum class ConversionKind(
  val jsonName: String
) {
  KEYWORD("keyword"),
  LENGTH("length"),
  NUMBER("number"),
  COLOR("color"),
  THICKNESS("thickness"),
  CORNER_RADIUS("cornerRadius"),
  TEXT("text"),
  UNSUPPORTED("unsupported");

  companion object {
    fun named(jsonName: String) = entries.firstOrNull { it.jsonName == jsonName } ?: UNSUPPORTED
  }
}
