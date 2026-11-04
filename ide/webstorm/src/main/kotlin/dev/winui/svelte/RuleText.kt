package dev.winui.svelte

internal object RuleText {
  const val DEFAULT_UNIT = "  "

  fun rule(
    ruleIndent: String,
    unit: String,
    className: String,
    declaration: Declaration,
    newline: String
  ) = "$ruleIndent.$className {$newline$ruleIndent$unit${declaration.text}$newline$ruleIndent}"

  fun withDeclaration(
    body: String,
    className: String,
    declaration: Declaration,
    newline: String
  ): String {
    val existing = ruleOf(className).find(body) ?: return withNewRule(body, className, declaration, newline)
    val indent = existing.groupValues[1]
    val inner = existing.groups[2] ?: return body
    val updated = withDeclarationInside(inner.value, indent, declaration, newline)
    return body.replaceRange(inner.range.first, inner.range.last + 1, updated)
  }

  private fun ruleOf(className: String) = Regex("""(?m)^([ \t]*)\.${Regex.escape(className)}\s*\{([^}]*)\}""")

  private fun withNewRule(
    body: String,
    className: String,
    declaration: Declaration,
    newline: String
  ): String {
    val ruleIndent = firstIndent(body)
    val trimmed = body.trimEnd()
    val separator =
      when {
        trimmed.isBlank() -> newline
        else -> "$newline$newline"
      }
    val added = rule(ruleIndent, unitOf(body, ruleIndent), className, declaration, newline)
    return "${trimmed.ifBlank { "" }}$separator$added$newline"
  }

  private fun withDeclarationInside(
    inner: String,
    indent: String,
    declaration: Declaration,
    newline: String
  ): String {
    val property = Regex("""(?<![\w-])${Regex.escape(declaration.property)}\s*:[^;]*;?""")
    if (property.containsMatchIn(inner)) {
      return property.replaceFirst(inner, Regex.escapeReplacement(declaration.text))
    }

    val content = inner.trimEnd()
    val isClosed = content.isEmpty() || content.endsWith(";")
    val closed =
      when {
        isClosed -> content
        else -> "$content;"
      }
    return "$closed$newline$indent${unitOf(inner, indent)}${declaration.text}$newline$indent"
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
