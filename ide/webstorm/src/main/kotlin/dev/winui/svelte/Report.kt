package dev.winui.svelte

internal enum class SkipReason(
  val label: String
) {
  NO_DEPENDENCY("no winui-svelte dependency"),
  NOTHING_TO_CONVERT("nothing to convert"),
  NOT_SVELTE("not a Svelte file")
}

internal data class Report(
  val attributes: Int,
  val changedFiles: Int,
  val skipped: Map<SkipReason, Int>
) {
  fun summary(): String {
    val skippedText = skipped.entries.joinToString("; ") { "${it.value} (${it.key.label})" }
    val suffix =
      when {
        skipped.isEmpty() -> ""
        else -> ", skipped $skippedText"
      }
    return "$attributes attributes converted in $changedFiles files$suffix"
  }
}
