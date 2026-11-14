package dev.winui.svelte

import java.net.URLDecoder

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

  /** Whether a value names something a picture preview draws: a file or URL of an image, or a data URI. */
  fun isPicture(value: String) = targetOf(value, "/", "/").kind != PictureKind.NONE

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
          .orEmpty()
      return PictureTarget(PictureKind.DATA, extensionOfMime(mime), emptyList())
    }

    val isRemote = PictureSpec.remoteSchemes.any { value.lowercase().startsWith(it) }
    if (isRemote) {
      return PictureTarget(PictureKind.REMOTE, extensionIn(value.replace(query, "")), emptyList())
    }

    val isFileUrl = value.lowercase().startsWith(PictureSpec.fileScheme)
    val isAppx = value.startsWith(PictureSpec.appxScheme)
    val path =
      when {
        isFileUrl -> pathOfFileUrl(value)
        else -> value.removePrefix(PictureSpec.appxScheme).replace(query, "").replace('\\', '/')
      }
    val extension = extensionIn(path)
    if (extension !in PictureSpec.mimes) {
      return PictureTarget(PictureKind.NONE, "", emptyList())
    }

    val candidates =
      when {
        isFileUrl -> listOf(normalized(path))
        else -> candidatesOf(path, isAppx, file, root)
      }
    val kind =
      when {
        isAppx -> PictureKind.APPX
        else -> PictureKind.LOCAL
      }
    return PictureTarget(kind, extension, candidates)
  }

  /** The extension of the format a MIME subtype names (`svg+xml` is `svg`), or the subtype itself. */
  fun extensionOfMime(subtype: String): String {
    val lowered = subtype.lowercase()
    return mimeExtensions[lowered] ?: lowered
  }

  private fun pathOfFileUrl(value: String): String {
    val rest = decoded(value.substring(PictureSpec.fileScheme.length).replace(query, ""))
    return when {
      windowsAbsolute.containsMatchIn(rest) -> rest
      else -> "/$rest"
    }
  }

  private fun decoded(text: String) =
    try {
      URLDecoder.decode(text.replace("+", "%2B"), Charsets.UTF_8)
    } catch (_: IllegalArgumentException) {
      text
    }

  // The places a path may name, in order: an alias under the project, a leading slash first under the public
  // folder as a bundler serves it, a relative path beside the file and under the project.
  private fun candidatesOf(
    path: String,
    isAppx: Boolean,
    file: String,
    root: String
  ): List<String> {
    val alias = PictureSpec.aliases.firstOrNull { path.startsWith(it.prefix) }
    val isDrivePath = !isAppx && windowsAbsolute.containsMatchIn(path)
    val isRootedPath = !isAppx && path.startsWith("/")
    return when {
      alias != null && !isAppx -> {
        listOf(normalized("$root/${alias.folder}${path.removePrefix(alias.prefix)}"))
      }

      isDrivePath -> {
        listOf(normalized(path))
      }

      isRootedPath -> {
        listOf(
          normalized("$root/${PictureSpec.publicFolder}$path"),
          normalized("$root$path"),
          normalized(path)
        )
      }

      isAppx -> {
        listOf(root, directoryOf(file)).map { normalized("$it/$path") }
      }

      else -> {
        listOf(directoryOf(file), root).map { normalized("$it/$path") }
      }
    }
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

      val isParentStep = isUp && parts.isNotEmpty()
      val isSkipped = part == "." || isParentStep
      if (!isSkipped) {
        parts.add(part)
      }
    }

    return parts.joinToString("/")
  }
}
