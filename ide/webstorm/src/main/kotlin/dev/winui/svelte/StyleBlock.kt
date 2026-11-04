package dev.winui.svelte

data class TextEdit(
  val start: Int,
  val end: Int,
  val text: String
)

data class ClassAttribute(
  val valueStart: Int,
  val valueEnd: Int,
  val value: String
)

data class TagContext(
  val tagName: String,
  val tagNameEnd: Int,
  val attributeStart: Int,
  val attributeEnd: Int,
  val classAttribute: ClassAttribute?,
  val hasDynamicClass: Boolean = false
)

object StyleBlock {
  private const val STYLE_CLOSE = "</style>"
  private const val DEFAULT_UNIT = "  "
  private val identifier = Regex("""-?[_a-zA-Z][\w-]*""")
  private val styleOpen = Regex("""<style\b([^>]*)>""")
  private val langAttribute = Regex("""\blang\s*=\s*["']?([\w-]+)""")
  private val classAttributes = Regex("""\bclass\s*=\s*["']([^"']*)["']""")
  private val classSelectors = Regex("""\.(-?[_a-zA-Z][\w-]*)""")
  private val upperAfterLower = Regex("""(?<=[a-z0-9])(?=[A-Z])""")

  fun kebab(tagName: String) = tagName.replace('.', '-').replace(upperAfterLower, "-").lowercase()

  fun unusedClass(
    base: String,
    taken: Set<String>
  ): String {
    if (base !in taken) {
      return base
    }

    return generateSequence(2) { it + 1 }.map { "$base-$it" }.first { it !in taken }
  }

  fun classesIn(fileText: String): Set<String> {
    val written = classAttributes.findAll(fileText).flatMap { it.groupValues[1].split(' ') }
    val selected = classSelectors.findAll(fileText).map { it.groupValues[1] }
    return (written + selected).filter { it.isNotEmpty() }.toSet()
  }

  fun firstClassOf(value: String): String? =
    value
      .trim()
      .split(Regex("""\s+"""))
      .firstOrNull()
      ?.takeIf { identifier.matches(it) }

  fun plan(
    fileText: String,
    tag: TagContext,
    declaration: Declaration
  ): List<TextEdit>? {
    val style = locate(fileText)
    if (style == StyleLocation.Unsupported || tag.hasDynamicClass) {
      return null
    }

    val existing = tag.classAttribute?.let { firstClassOf(it.value) }
    if (tag.classAttribute != null && tag.classAttribute.value.isNotBlank() && existing == null) {
      return null
    }

    val className = existing ?: unusedClass(kebab(tag.tagName), classesIn(fileText))
    val edits = mutableListOf(removal(fileText, tag))
    if (existing == null) {
      edits += classEdit(tag, className)
    }

    edits += styleEdit(fileText, style, listOf(Rule(className, declaration)))
    return edits
  }

  fun planToggles(
    fileText: String,
    tag: TagContext,
    property: String,
    leaves: List<Leaf>
  ): List<TextEdit>? {
    val style = locate(fileText)
    if (style == StyleLocation.Unsupported || leaves.isEmpty()) {
      return null
    }

    val base = tag.classAttribute?.let { firstClassOf(it.value) } ?: kebab(tag.tagName)
    val toggles =
      leaves
        .groupBy { it.modifier }
        .map { (modifier, same) ->
          Toggle("$base--$modifier", same.map { it.condition }, Declaration(property, same.first().value))
        }
    val directives = toggles.joinToString(" ") { "class:${it.name}={${it.condition}}" }
    return listOf(
      TextEdit(tag.attributeStart, tag.attributeEnd, directives),
      styleEdit(fileText, style, toggles.map { Rule(it.name, it.declaration) })
    )
  }

  fun slug(value: String) = value.replace(Regex("""[^\w-]+"""), "-").trim('-')

  private class Toggle(
    val name: String,
    conditions: List<String>,
    val declaration: Declaration
  ) {
    val condition =
      if (conditions.size == 1) {
        conditions.first()
      } else {
        conditions.joinToString(" || ") { "($it)" }
      }
  }

  private class Rule(
    val className: String,
    val declaration: Declaration
  )

  fun apply(
    fileText: String,
    edits: List<TextEdit>
  ): String {
    val ordered = edits.sortedWith(compareByDescending<TextEdit> { it.start }.thenByDescending { it.end })
    return ordered.fold(fileText) { text, edit -> text.replaceRange(edit.start, edit.end, edit.text) }
  }

  private fun removal(
    fileText: String,
    tag: TagContext
  ): TextEdit {
    var start = tag.attributeStart
    while (start > 0 && fileText[start - 1].isWhitespace()) {
      start -= 1
    }

    return TextEdit(start, tag.attributeEnd, "")
  }

  private fun classEdit(
    tag: TagContext,
    className: String
  ): TextEdit {
    val attribute = tag.classAttribute
    if (attribute != null) {
      return TextEdit(attribute.valueStart, attribute.valueEnd, className)
    }

    return TextEdit(tag.tagNameEnd, tag.tagNameEnd, " class=\"$className\"")
  }

  private sealed interface StyleLocation {
    data object Unsupported : StyleLocation

    data object Missing : StyleLocation

    data class Found(
      val bodyStart: Int,
      val bodyEnd: Int
    ) : StyleLocation
  }

  private fun locate(fileText: String): StyleLocation {
    val open = styleOpen.find(fileText) ?: return StyleLocation.Missing
    val language = langAttribute.find(open.groupValues[1])?.groupValues?.get(1)
    if (language != null && !language.equals("css", ignoreCase = true)) {
      return StyleLocation.Unsupported
    }

    val bodyStart = open.range.last + 1
    val bodyEnd = fileText.indexOf(STYLE_CLOSE, bodyStart)
    return if (bodyEnd < 0) {
      StyleLocation.Unsupported
    } else {
      StyleLocation.Found(bodyStart, bodyEnd)
    }
  }

  private fun styleEdit(
    fileText: String,
    style: StyleLocation,
    rules: List<Rule>
  ): TextEdit {
    val newline =
      if (fileText.contains("\r\n")) {
        "\r\n"
      } else {
        "\n"
      }
    if (style is StyleLocation.Found) {
      val body = fileText.substring(style.bodyStart, style.bodyEnd)
      val edited = rules.fold(body) { text, rule -> withDeclaration(text, rule.className, rule.declaration, newline) }
      return TextEdit(style.bodyStart, style.bodyEnd, edited)
    }

    val trimmedEnd = fileText.trimEnd().length
    val written =
      rules.joinToString("$newline$newline") {
        rule(DEFAULT_UNIT, DEFAULT_UNIT, it.className, it.declaration, newline)
      }
    return TextEdit(trimmedEnd, fileText.length, "$newline$newline<style>$newline$written$newline</style>$newline")
  }

  private fun rule(
    ruleIndent: String,
    unit: String,
    className: String,
    declaration: Declaration,
    newline: String
  ) = "$ruleIndent.$className {$newline$ruleIndent$unit${declaration.text}$newline$ruleIndent}"

  private fun withDeclaration(
    body: String,
    className: String,
    declaration: Declaration,
    newline: String
  ): String {
    val ruleIndent = firstIndent(body)
    val existing = Regex("""(?m)^([ \t]*)\.${Regex.escape(className)}\s*\{([^}]*)\}""").find(body)
    if (existing == null) {
      val trimmed = body.trimEnd()
      val separator =
        if (trimmed.isBlank()) {
          newline
        } else {
          "$newline$newline"
        }
      val added = rule(ruleIndent, unitOf(body, ruleIndent), className, declaration, newline)
      return "${trimmed.ifBlank { "" }}$separator$added$newline"
    }

    val indent = existing.groupValues[1]
    val inner = existing.groupValues[2]
    val unit = unitOf(inner, indent)
    val propertyPattern = Regex("""(?<![\w-])${Regex.escape(declaration.property)}\s*:[^;]*;?""")
    val replaced =
      if (propertyPattern.containsMatchIn(inner)) {
        propertyPattern.replaceFirst(inner, Regex.escapeReplacement(declaration.text))
      } else {
        val content = inner.trimEnd()
        val closed =
          if (content.isEmpty() || content.endsWith(";")) {
            content
          } else {
            "$content;"
          }
        "$closed$newline$indent$unit${declaration.text}$newline$indent"
      }
    val groupStart = existing.groups[2]!!.range
    return body.replaceRange(groupStart.first, groupStart.last + 1, replaced)
  }

  private fun firstIndent(body: String): String {
    val line = body.lines().firstOrNull { it.isNotBlank() } ?: return DEFAULT_UNIT
    return line.takeWhile { it == ' ' || it == '\t' }
  }

  private fun unitOf(
    text: String,
    ruleIndent: String
  ): String {
    val declarationIndent =
      text
        .lines()
        .filter { it.isNotBlank() && it.startsWith(ruleIndent) && it.length > ruleIndent.length }
        .map { it.takeWhile { char -> char == ' ' || char == '\t' } }
        .firstOrNull { it.length > ruleIndent.length }
    return declarationIndent?.removePrefix(ruleIndent) ?: DEFAULT_UNIT
  }
}

data class Declaration(
  val property: String,
  val value: String
) {
  val text get() = "$property: $value;"
}
