package dev.winui.svelte

internal sealed interface StyleLocation {
  data object Unsupported : StyleLocation

  data object Missing : StyleLocation

  data class Found(
    val bodyStart: Int,
    val bodyEnd: Int
  ) : StyleLocation

  companion object {
    private const val CLOSING_TAG = "</style>"
    private const val CSS = "css"
    private val opening = Regex("""<style\b([^>]*)>""")
    private val language = Regex("""\blang\s*=\s*["']?([\w-]+)""")

    fun of(fileText: String): StyleLocation {
      val open = opening.find(fileText) ?: return Missing
      val written = language.find(open.groupValues[1])?.groupValues?.get(1)
      val isOtherLanguage = written != null && !written.equals(CSS, ignoreCase = true)
      val bodyStart = open.range.last + 1
      val bodyEnd = fileText.indexOf(CLOSING_TAG, bodyStart)
      return when {
        isOtherLanguage || bodyEnd < 0 -> Unsupported
        else -> Found(bodyStart, bodyEnd)
      }
    }
  }
}
