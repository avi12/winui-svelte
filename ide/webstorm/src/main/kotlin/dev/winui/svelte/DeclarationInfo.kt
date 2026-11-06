package dev.winui.svelte

internal data class DeclarationMeaning(
  val property: String,
  val isSupported: Boolean,
  val targets: List<String>,
  val reason: String,
  val scope: String
)

/**
 * What a CSS declaration becomes in WinUI: the properties it sets and the place it applies, or why it has no meaning
 * there and what to write; null for a declaration the translation does not know at all (a prop or an app's own custom
 * property).
 */
internal object DeclarationInfo {
  private const val MEDIA = "@media"
  private const val RULE_SCOPE =
    "the rule `%s` is written against the component's markup, scoped by the component's own class"
  private const val TAG_SCOPE = "a style written on the tag applies to this element only"

  fun of(
    declaration: CssDeclaration,
    unsupported: Map<String, String>,
    targets: Map<String, List<String>>,
    isHandled: (String) -> Boolean
  ): DeclarationMeaning? {
    val property = declaration.property
    if (declaration.source == DeclarationSource.ATTRIBUTE) {
      return null
    }

    val reason = unsupported[property]
    if (reason != null) {
      return DeclarationMeaning(property, false, emptyList(), reason, "")
    }

    val known = targets[property].orEmpty()
    val isKnown = known.isNotEmpty() || isHandled(property)
    if (!isKnown) {
      return null
    }

    val where =
      if (declaration.source == DeclarationSource.RULE) {
        RULE_SCOPE.format(declaration.selector)
      } else {
        TAG_SCOPE
      }
    val scope =
      if (declaration.media.isEmpty()) {
        where
      } else {
        "$where, inside $MEDIA ${declaration.media.joinToString(
          " and "
        )}"
      }
    return DeclarationMeaning(property, true, known, "", scope)
  }
}
