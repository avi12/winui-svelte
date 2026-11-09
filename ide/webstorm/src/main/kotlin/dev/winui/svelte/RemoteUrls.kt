package dev.winui.svelte

import java.net.URI
import java.net.URISyntaxException

/** Which remote URLs may be fetched and where a redirect may lead, by the rules in `ide/picture-previews.spec.json`. */
internal object RemoteUrls {
  private val httpSchemes = setOf("http", "https")
  private val linkLocalHost = Regex("""^(169\.254\.|\[fe80:)""", RegexOption.IGNORE_CASE)

  /**
   * Whether a remote picture may be fetched at all: an http or https URL of a sane length, with a host, with no
   * credentials in it and not aimed at a link-local address (cloud metadata services live there).
   */
  fun isFetchable(value: String): Boolean {
    val uri = parsed(value)
    val isTooLong = value.length > PictureSpec.remote.maxUrlLength
    if (uri == null || isTooLong) {
      return false
    }

    val host = uri.host.orEmpty()
    val hasCredentials = uri.userInfo != null
    val isLinkLocal = linkLocalHost.containsMatchIn(host)
    val isHttp = uri.scheme?.lowercase() in httpSchemes
    return isHttp && host.isNotEmpty() && !hasCredentials && !isLinkLocal
  }

  /** Where a redirect leads: the absolute URL, or none when it is not fetchable or drops from https to http. */
  fun redirectTarget(
    from: String,
    location: String
  ): String? {
    val base = parsed(from) ?: return null
    val target =
      try {
        base.resolve(location)
      } catch (_: IllegalArgumentException) {
        return null
      }

    val isDowngrade = base.scheme.equals("https", true) && target.scheme.equals("http", true)
    val isAllowed = !isDowngrade && isFetchable(target.toString())
    return target.toString().takeIf { isAllowed }
  }

  private fun parsed(value: String) =
    try {
      URI(value)
    } catch (_: URISyntaxException) {
      null
    }
}
