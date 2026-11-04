package dev.winui.svelte

internal object ClassNaming {
  private val identifier = Regex("""-?[_a-zA-Z][\w-]*""")
  private val whitespace = Regex("""\s+""")
  private val classAttributes = Regex("""\bclass\s*=\s*["']([^"']*)["']""")
  private val classSelectors = Regex("""\.(-?[_a-zA-Z][\w-]*)""")
  private val upperAfterLower = Regex("""(?<=[a-z0-9])(?=[A-Z])""")
  private val unsafeInName = Regex("""[^\w-]+""")

  fun kebab(tagName: String) = tagName.replace('.', '-').replace(upperAfterLower, "-").lowercase()

  fun slug(value: String) = value.replace(unsafeInName, "-").trim('-')

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
      .split(whitespace)
      .firstOrNull()
      ?.takeIf { identifier.matches(it) }
}
