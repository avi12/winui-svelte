package dev.winui.svelte

internal object StyleDirectiveText {
  fun render(
    cssProperty: String,
    value: CssValue
  ) = when (value) {
    is CssValue.Plain -> "${SvelteSyntax.STYLE_DIRECTIVE_PREFIX}$cssProperty=\"${value.text}\""
    is CssValue.Conditional -> "${SvelteSyntax.STYLE_DIRECTIVE_PREFIX}$cssProperty={${expression(value)}}"
  }

  private fun expression(value: CssValue): String =
    when (value) {
      is CssValue.Plain -> "\"${value.text}\""
      is CssValue.Conditional -> "${value.condition} ? ${expression(value.whenTrue)} : ${expression(value.whenFalse)}"
    }
}
