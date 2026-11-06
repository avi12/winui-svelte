package dev.winui.svelte

internal enum class DeclarationSource {
  RULE,
  STYLE,
  DIRECTIVE,
  ATTRIBUTE
}

internal data class CssDeclaration(
  val property: String,
  val value: String,
  val start: Int,
  val valueStart: Int,
  val valueEnd: Int,
  val group: Int,
  val source: DeclarationSource,
  val selector: String,
  val media: List<String>
)

internal data class MediaQuery(
  val condition: String,
  val start: Int,
  val end: Int
)
