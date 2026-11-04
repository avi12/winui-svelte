package dev.winui.svelte

internal object ConditionLeaves {
  private val simpleCondition = Regex("""[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*""")

  fun negated(condition: String) =
    when {
      simpleCondition.matches(condition) -> "!$condition"
      else -> "!($condition)"
    }

  fun togglesOf(
    mapping: Mapping,
    value: CssValue
  ): List<Leaf> = collect(value, emptyList(), mapping.cssProperty).filter { it.value != mapping.defaultValue }

  private fun collect(
    value: CssValue,
    path: List<Guard>,
    cssProperty: String
  ): List<Leaf> =
    when (value) {
      is CssValue.Plain -> {
        listOf(Leaf(conditionOf(path), value.text, modifierOf(value, cssProperty)))
      }

      is CssValue.Conditional -> {
        collect(value.whenTrue, path + Guard(value.condition, isNegated = false), cssProperty) +
          collect(value.whenFalse, path + Guard(value.condition, isNegated = true), cssProperty)
      }
    }

  private fun modifierOf(
    value: CssValue.Plain,
    cssProperty: String
  ) = value.label?.let { ClassNaming.kebab(it) }
    ?: "$cssProperty-${ClassNaming.slug(value.text.removeSuffix(SidesValue.UNIT))}"

  private fun conditionOf(path: List<Guard>) =
    path.joinToString(" && ") { guard ->
      when {
        guard.isNegated -> negated(guard.text)
        path.size > 1 && !simpleCondition.matches(guard.text) -> "(${guard.text})"
        else -> guard.text
      }
    }

  private data class Guard(
    val text: String,
    val isNegated: Boolean
  )
}
