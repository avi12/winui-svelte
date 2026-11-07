package dev.winui.svelte

internal enum class PictureKind { LOCAL, APPX, DATA, REMOTE, NONE }

internal data class PictureTarget(
  val kind: PictureKind,
  val extension: String,
  val candidates: List<String>
)

/** What a picture value names, resolved by the rules in `ide/picture-previews.spec.json`. */
internal object PicturePaths {
  private val windowsAbsolute = Regex("^[A-Za-z]:/")
  private val extensionPattern = Regex("\\.([A-Za-z0-9]+)$")
  private val dataMime = Regex("^data:image/([a-z0-9.+-]+)", RegexOption.IGNORE_CASE)
  private val query = Regex("[?#].*$")
  private val mimeExtensions =
    mapOf("x-icon" to "ico", "vnd.microsoft.icon" to "ico", "svg+xml" to "svg", "jpeg" to "jpg")

  fun targetOf(
    value: String,
    file: String,
    root: String
  ): PictureTarget {
    if (value.startsWith(PictureSpec.dataScheme)) {
      val mime =
        dataMime
          .find(value)
          ?.groupValues
          ?.get(1)
          ?.lowercase()
          .orEmpty()
      return PictureTarget(PictureKind.DATA, mimeExtensions[mime] ?: mime, emptyList())
    }

    val isRemote = PictureSpec.remoteSchemes.any { value.lowercase().startsWith(it) }
    if (isRemote) {
      return PictureTarget(PictureKind.REMOTE, extensionIn(value.replace(query, "")), emptyList())
    }

    val isAppx = value.startsWith(PictureSpec.appxScheme)
    val path = value.removePrefix(PictureSpec.appxScheme).replace(query, "").replace('\\', '/')
    val extension = extensionIn(path)
    if (extension !in PictureSpec.mimes) {
      return PictureTarget(PictureKind.NONE, "", emptyList())
    }

    val isFromRoot = !isAppx && (path.startsWith("/") || windowsAbsolute.containsMatchIn(path))
    val places =
      when {
        isAppx -> listOf(root, directoryOf(file))
        else -> listOf(directoryOf(file), root)
      }
    val candidates =
      when {
        isFromRoot -> listOf(normalized(path))
        else -> places.map { normalized("$it/$path") }
      }
    val kind =
      when {
        isAppx -> PictureKind.APPX
        else -> PictureKind.LOCAL
      }
    return PictureTarget(kind, extension, candidates)
  }

  private fun extensionIn(path: String) =
    extensionPattern
      .find(path)
      ?.groupValues
      ?.get(1)
      ?.lowercase()
      .orEmpty()

  private fun directoryOf(file: String): String {
    val slashed = file.replace('\\', '/')
    val slash = slashed.lastIndexOf('/')
    return when {
      slash <= 0 -> "/"
      else -> slashed.substring(0, slash)
    }
  }

  private fun normalized(value: String): String {
    val parts = mutableListOf<String>()
    for (part in value.replace('\\', '/').split('/')) {
      val isUp = part == ".."
      val isInsideRoot = isUp && parts.size > 1
      if (isInsideRoot) {
        parts.removeAt(parts.lastIndex)
        continue
      }

      val isSkipped = part == "." || (isUp && parts.isNotEmpty())
      if (!isSkipped) {
        parts.add(part)
      }
    }

    return parts.joinToString("/")
  }
}
