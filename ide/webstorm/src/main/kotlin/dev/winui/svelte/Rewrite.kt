package dev.winui.svelte

internal sealed interface Rewrite {
  val cssProperty: String

  val title: String

  data class Rule(
    val declaration: Declaration
  ) : Rewrite {
    override val cssProperty get() = declaration.property

    override val title get() = "Move to <style> as ${declaration.property}: ${declaration.value}"
  }

  data class Toggles(
    override val cssProperty: String,
    val leaves: List<Leaf>
  ) : Rewrite {
    override val title get() = "Move to <style> as $cssProperty: ${leaves.map { it.value }.distinct().joinToString(
      " / "
    )}"
  }

  data class Directive(
    override val cssProperty: String,
    val text: String
  ) : Rewrite {
    override val title get() = "Convert to ${SvelteSyntax.STYLE_DIRECTIVE_PREFIX}$cssProperty"
  }
}
