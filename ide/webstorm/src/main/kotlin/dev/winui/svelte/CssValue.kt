package dev.winui.svelte

internal sealed interface CssValue {
  data class Plain(
    val text: String,
    val label: String? = null
  ) : CssValue

  data class Conditional(
    val condition: String,
    val whenTrue: CssValue,
    val whenFalse: CssValue
  ) : CssValue
}

internal data class Leaf(
  val condition: String,
  val value: String,
  val modifier: String
)
