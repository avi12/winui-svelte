package dev.winui.svelte

internal object StyleBlock {
  private const val SPACE = " "

  fun plan(
    fileText: String,
    tag: TagContext,
    declaration: Declaration
  ): List<TextEdit>? {
    val style = StyleLocation.of(fileText)
    val written = tag.classAttribute
    val existing = written?.let { ClassNaming.firstClassOf(it.value) }
    val isUnusable =
      style == StyleLocation.Unsupported ||
        tag.hasDynamicClass ||
        (written != null && written.value.isNotBlank() && existing == null)
    if (isUnusable) {
      return null
    }

    val className = existing ?: ClassNaming.unusedClass(ClassNaming.kebab(tag.tagName), ClassNaming.classesIn(fileText))
    val edits = mutableListOf(removal(fileText, tag))
    if (existing == null) {
      edits += classEdit(tag, className)
    }

    edits += styleEdit(fileText, style, listOf(StyleRule(className, declaration)))
    return edits
  }

  fun planToggles(
    fileText: String,
    tag: TagContext,
    property: String,
    leaves: List<Leaf>
  ): List<TextEdit>? {
    val style = StyleLocation.of(fileText)
    if (style == StyleLocation.Unsupported || leaves.isEmpty()) {
      return null
    }

    val base = tag.classAttribute?.let { ClassNaming.firstClassOf(it.value) } ?: ClassNaming.kebab(tag.tagName)
    val toggles =
      leaves
        .groupBy { it.modifier }
        .map { (modifier, same) ->
          Toggle("$base--$modifier", same.map { it.condition }, Declaration(property, same.first().value))
        }
    val directives =
      toggles.joinToString(
        SPACE
      ) { "${SvelteSyntax.CLASS_DIRECTIVE_PREFIX}${it.name}={${it.condition}}" }
    return listOf(
      TextEdit(tag.attributeStart, tag.attributeEnd, directives),
      styleEdit(fileText, style, toggles.map { StyleRule(it.name, it.declaration) })
    )
  }

  private class Toggle(
    val name: String,
    conditions: List<String>,
    val declaration: Declaration
  ) {
    val condition =
      when (conditions.size) {
        1 -> conditions.first()
        else -> conditions.joinToString(" || ") { "($it)" }
      }
  }

  private fun removal(
    fileText: String,
    tag: TagContext
  ): TextEdit {
    val start = (tag.attributeStart downTo 1).firstOrNull { !fileText[it - 1].isWhitespace() } ?: 0
    return TextEdit(start, tag.attributeEnd, "")
  }

  private fun classEdit(
    tag: TagContext,
    className: String
  ): TextEdit {
    val attribute = tag.classAttribute ?: return TextEdit(tag.tagNameEnd, tag.tagNameEnd, " class=\"$className\"")
    return TextEdit(attribute.valueStart, attribute.valueEnd, className)
  }

  private fun styleEdit(
    fileText: String,
    style: StyleLocation,
    rules: List<StyleRule>
  ): TextEdit {
    val newline =
      when {
        fileText.contains("\r\n") -> "\r\n"
        else -> "\n"
      }
    if (style is StyleLocation.Found) {
      val body = fileText.substring(style.bodyStart, style.bodyEnd)
      val edited =
        rules.fold(
          body
        ) { text, rule -> RuleText.withDeclaration(text, rule.className, rule.declaration, newline) }
      return TextEdit(style.bodyStart, style.bodyEnd, edited)
    }

    val written =
      rules.joinToString("$newline$newline") {
        RuleText.rule(RuleText.DEFAULT_UNIT, RuleText.DEFAULT_UNIT, it.className, it.declaration, newline)
      }
    return TextEdit(
      fileText.trimEnd().length,
      fileText.length,
      "$newline$newline<style>$newline$written$newline</style>$newline"
    )
  }
}

private class StyleRule(
  val className: String,
  val declaration: Declaration
)
