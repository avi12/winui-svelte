package dev.winui.svelte

/** A custom property written inside `var(...)`: where its name starts and ends in the text, and the name. */
internal data class ResourceReference(
  val start: Int,
  val end: Int,
  val property: String
) {
  fun textBefore(offset: Int) = property.take(offset - start)
}

internal object ResourceReferences {
  private val varCall = Regex("""var\(\s*(--[\w-]*)""")

  /** The `var(--name)` whose name the offset is in or at the end of, if any. */
  fun at(
    text: String,
    offset: Int
  ): ResourceReference? =
    varCall
      .findAll(text)
      .mapNotNull { call ->
        val name = call.groups[1] ?: return@mapNotNull null
        ResourceReference(name.range.first, name.range.last + 1, name.value)
      }.firstOrNull { offset in it.start..it.end }
}
