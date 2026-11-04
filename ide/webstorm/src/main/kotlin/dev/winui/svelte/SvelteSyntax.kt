package dev.winui.svelte

internal object SvelteSyntax {
  const val CLASS_ATTRIBUTE = "class"
  const val CLASS_DIRECTIVE_PREFIX = "class:"
  const val STYLE_DIRECTIVE_PREFIX = "style:"
  const val MUSTACHE_START = "{"
  const val MANIFEST_NAME = "package.json"

  fun isComponent(tagName: String) = tagName.firstOrNull()?.isUpperCase() == true

  fun isQuoted(text: String) = text.length >= 2 && (text.first() == '"' || text.first() == '\'')

  fun isStaticQuoted(text: String) = isQuoted(text) && !text.contains(MUSTACHE_START)
}
