package dev.winui.svelte

private class Block(
  val isRule: Boolean,
  val media: List<String>,
  val selector: String,
  val key: String
)

private class Groups {
  private val ids = mutableMapOf<String, Int>()

  fun idOf(key: String) = ids.getOrPut(key) { ids.size }
}

/**
 * Every CSS declaration a Svelte file writes, in order: the rules of its style block with the media conditions around
 * each, the declarations of `style="..."`, the `style:property="..."` directives and the props whose CSS counterpart
 * the lookup names. Declarations of one rule or one tag share a group, numbered from 0 in order of appearance.
 */
internal object CssDeclarations {
  private val styleBlock = Regex("""<style\b[^>]*>([\s\S]*?)</style>""", RegexOption.IGNORE_CASE)
  private val scriptBlock = Regex("""<script\b[^>]*>[\s\S]*?</script>""", RegexOption.IGNORE_CASE)
  private val tag = Regex("""<([A-Za-z][\w.:-]*)((?:"[^"]*"|'[^']*'|\{[^}]*\}|[^>"'{])*+)>""")
  private val styleAttribute = Regex("""(?<=\s)style=(["'])([^"']*)\1""")
  private val directiveAttribute = Regex("""(?<=\s)style:(?<name>[\w-]+)=(["'])(?<value>[^"']*)\2""")
  private val literalAttribute = Regex("""(?<=\s)(?<name>[A-Za-z][\w-]*)=(["'])(?<value>[^"']*)\2""")
  private val comment = Regex("""/\*[\s\S]*?\*/""")
  private val important = Regex("""\s*!important\s*$""", RegexOption.IGNORE_CASE)
  private val mediaRule = Regex("""@media\s+(?<condition>[^{;]+?)\s*\{""", RegexOption.IGNORE_CASE)
  private const val MEDIA_PREFIX = "@media"
  private const val AT_PREFIX = "@"
  private const val STYLE_EQUALS = "style="
  private val extraAttributes =
    mapOf(
      "backdrop" to "backdrop",
      "keySpline" to "key-spline",
      "columns" to "grid-template-columns",
      "rows" to "grid-template-rows"
    )

  fun of(
    text: String,
    attributeProperties: Map<String, String>
  ): List<CssDeclaration> {
    val groups = Groups()
    val fromStyles =
      styleBlock.findAll(text).flatMap { block ->
        scanStyleBody(
          body = block.groupValues[1],
          base = block.range.first + block.value.indexOf('>') + 1,
          groups = groups
        )
      }
    val markup =
      text
        .replace(styleBlock) {
          " ".repeat(it.value.length)
        }.replace(scriptBlock) { " ".repeat(it.value.length) }
    val fromTags = tag.findAll(markup).flatMap { tagDeclarations(it, attributeProperties, groups) }
    val order = mutableMapOf<Int, Int>()
    return (fromStyles + fromTags)
      .sortedBy { it.start }
      .map { declaration ->
        declaration.copy(group = order.getOrPut(declaration.group) { order.size })
      }.toList()
  }

  /** The condition of every `@media` rule in the style blocks of a Svelte file, with its range. */
  fun mediaQueriesOf(text: String) =
    styleBlock
      .findAll(text)
      .flatMap { block ->
        val body = block.groupValues[1].replace(comment) { " ".repeat(it.value.length) }
        val base = block.range.first + block.value.indexOf('>') + 1
        mediaRule.findAll(body).map { match ->
          val condition = match.groups["condition"]?.value.orEmpty()
          val start = base + match.range.first + match.value.indexOf(condition)
          MediaQuery(condition, start, start + condition.length)
        }
      }.toList()

  private fun declarationOf(
    statement: String,
    offset: Int,
    block: Block,
    groups: Groups
  ): CssDeclaration? {
    val colon = statement.indexOf(':')
    val rawValue = statement.substring(colon + 1).replace(important, "")
    val leading = rawValue.length - rawValue.trimStart().length
    val value = rawValue.trim()
    val isDeclaration = colon != -1 && value.isNotEmpty()
    if (!isDeclaration) {
      return null
    }

    val valueStart = offset + colon + 1 + leading
    return CssDeclaration(
      property = statement.substring(0, colon).trim().lowercase(),
      value = value,
      start = offset + statement.length - statement.trimStart().length,
      valueStart = valueStart,
      valueEnd = valueStart + value.length,
      group = groups.idOf(block.key),
      source = DeclarationSource.RULE,
      selector = block.selector,
      media = block.media
    )
  }

  private fun blockOf(
    prelude: String,
    parent: Block?,
    key: String
  ): Block {
    val inherited = parent?.media.orEmpty()
    val isMedia = prelude.lowercase().startsWith(MEDIA_PREFIX)
    if (isMedia) {
      return Block(false, inherited + prelude.substring(MEDIA_PREFIX.length).trim(), "", key)
    }

    return Block(!prelude.startsWith(AT_PREFIX), inherited, prelude, key)
  }

  private fun scanStyleBody(
    body: String,
    base: Int,
    groups: Groups
  ): List<CssDeclaration> {
    val text = body.replace(comment) { " ".repeat(it.value.length) }
    val stack = mutableListOf<Block>()
    val found = mutableListOf<CssDeclaration>()
    var statementStart = 0
    var parentheses = 0
    for ((i, char) in text.withIndex()) {
      parentheses += parenthesisChange(char)
      val isBoundary = parentheses <= 0 && (char == '{' || char == '}' || char == ';')
      if (!isBoundary) {
        continue
      }

      val statement = text.substring(statementStart, i)
      val parent = stack.lastOrNull()
      if (char == '{') {
        stack.add(blockOf(statement.trim(), parent, "$base:$statementStart"))
      }

      val isDeclaration = char != '{' && parent?.isRule == true
      if (isDeclaration) {
        declarationOf(statement, base + statementStart, parent, groups)?.let { found.add(it) }
      }

      if (char == '}') {
        stack.removeLastOrNull()
      }

      statementStart = i + 1
    }

    return found
  }

  private fun parenthesisChange(char: Char) =
    when (char) {
      '(' -> 1
      ')' -> -1
      else -> 0
    }

  private fun single(
    property: String,
    value: String,
    base: Int,
    group: Int,
    source: DeclarationSource
  ) = CssDeclaration(property, value, base, base, base + value.length, group, source, "", emptyList())

  private fun styleDeclarations(
    value: String,
    base: Int,
    key: String,
    groups: Groups
  ): List<CssDeclaration> {
    val block = Block(true, emptyList(), "", key)
    var cursor = 0
    return value.split(";").mapNotNull { statement ->
      val offset = base + cursor
      cursor += statement.length + 1
      declarationOf(statement, offset, block, groups)?.copy(source = DeclarationSource.STYLE)
    }
  }

  private fun tagDeclarations(
    match: MatchResult,
    attributeProperties: Map<String, String>,
    groups: Groups
  ): List<CssDeclaration> {
    val name = match.groupValues[1]
    val attributes = match.groupValues[2]
    val base = match.range.first + match.value.indexOf(attributes, name.length)
    val key = "tag:${match.range.first}"
    val group = groups.idOf(key)
    val fromStyle =
      styleAttribute.findAll(attributes).flatMap {
        styleDeclarations(it.groupValues[2], base + it.range.first + STYLE_EQUALS.length + 1, key, groups)
      }
    val fromDirectives =
      directiveAttribute.findAll(attributes).map {
        val value = it.groups["value"]?.value.orEmpty()
        single(
          property =
            it.groups["name"]
              ?.value
              .orEmpty()
              .lowercase(),
          value = value,
          base = base + it.range.first + it.value.lastIndexOf(value),
          group = group,
          source = DeclarationSource.DIRECTIVE
        )
      }
    val fromProps =
      literalAttribute.findAll(attributes).mapNotNull {
        val attribute = it.groups["name"]?.value.orEmpty()
        val value = it.groups["value"]?.value.orEmpty()
        val property = attributeProperties[attribute] ?: extraAttributes[attribute] ?: return@mapNotNull null
        single(
          property,
          value,
          base + it.range.first + it.value.lastIndexOf(value),
          group,
          DeclarationSource.ATTRIBUTE
        )
      }
    return (fromStyle + fromDirectives + fromProps).toList()
  }
}
