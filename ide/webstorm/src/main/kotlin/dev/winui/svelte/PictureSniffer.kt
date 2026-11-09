package dev.winui.svelte

/** The format of a fetched picture, by the rules in `ide/picture-previews.spec.json`. */
internal object PictureSniffer {
  private val genericTypes = setOf("application/octet-stream", "binary/octet-stream")
  private val svgRoot = Regex("""<svg[\s>]""", RegexOption.IGNORE_CASE)
  private const val SVG_SCAN_BYTES = 1024
  private const val IMAGE_PREFIX = "image/"

  /**
   * The extension of a fetched picture, from what is the most certain: its first bytes, then the response's content
   * type, then (only when the type is missing or generic) the extension the URL ends with; empty when nothing says it
   * is a picture, such as an HTML page.
   */
  fun extensionOf(
    bytes: ByteArray,
    contentType: String,
    urlExtension: String
  ): String {
    val signed = PictureSpec.signatures.firstOrNull { hasSignature(bytes, it) }
    if (signed != null) {
      return signed.extension
    }

    val head = String(bytes, 0, minOf(bytes.size, SVG_SCAN_BYTES), Charsets.UTF_8)
    if (svgRoot.containsMatchIn(head)) {
      return "svg"
    }

    val type = contentType.substringBefore(';').trim().lowercase()
    val fromType = PicturePaths.extensionOfMime(type.removePrefix(IMAGE_PREFIX))
    val isKnownImageType = type.startsWith(IMAGE_PREFIX) && fromType in PictureSpec.mimes
    if (isKnownImageType) {
      return fromType
    }

    val isUnspecific = type.isEmpty() || type in genericTypes
    val isKnownUrlExtension = urlExtension in PictureSpec.mimes
    return when {
      isUnspecific && isKnownUrlExtension -> urlExtension
      else -> ""
    }
  }

  private fun hasSignature(
    bytes: ByteArray,
    signature: PictureSignature
  ): Boolean {
    val end = signature.offset + signature.hex.length / 2
    val actual = bytes.copyOfRange(minOf(signature.offset, bytes.size), minOf(end, bytes.size))
    return actual.joinToString("") { "%02x".format(it) } == signature.hex
  }
}
