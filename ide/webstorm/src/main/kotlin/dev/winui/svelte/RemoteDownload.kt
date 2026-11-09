package dev.winui.svelte

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.http.HttpTimeoutException
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/** What a download came to: the picture's bytes with their extension, or the reason there are none. */
internal sealed interface Download {
  class Fetched(
    val bytes: ByteArray,
    val extension: String
  ) : Download

  data class Failed(
    val failure: RemoteFailure
  ) : Download
}

/**
 * One picture downloaded under the remote policy: http and https only, no credentials or cookies sent, redirects
 * followed by hand (each hop checked, never from https to http), one deadline for the whole exchange, and a size cap
 * that holds even when the server states no length. It blocks, so it runs off the editor thread.
 */
internal object RemoteDownload {
  private const val REDIRECT_FIRST = 300
  private const val REDIRECT_LAST = 399
  private const val HTTP_OK = 200
  private const val NANOS_PER_MILLI = 1_000_000L
  private const val CHUNK_BYTES = 8192

  private val client by lazy {
    HttpClient
      .newBuilder()
      .followRedirects(HttpClient.Redirect.NEVER)
      .connectTimeout(Duration.ofMillis(PictureSpec.remote.timeoutMillis.toLong()))
      .build()
  }

  fun fetch(url: String): Download {
    val deadline = System.nanoTime() + PictureSpec.remote.timeoutMillis * NANOS_PER_MILLI
    return follow(url, PictureSpec.remote.maxRedirects, deadline)
  }

  private fun follow(
    url: String,
    redirectsLeft: Int,
    deadline: Long
  ): Download {
    if (!RemoteUrls.isFetchable(url)) {
      return Download.Failed(RemoteFailure.BLOCKED)
    }

    val response =
      try {
        send(url, deadline)
      } catch (_: HttpTimeoutException) {
        return Download.Failed(RemoteFailure.TIMEOUT)
      } catch (_: IOException) {
        return Download.Failed(RemoteFailure.NETWORK)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
        return Download.Failed(RemoteFailure.NETWORK)
      }

    val location = response.headers().firstValue("location").orElse(null)
    val isRedirect = response.statusCode() in REDIRECT_FIRST..REDIRECT_LAST && location != null
    if (!isRedirect) {
      return finish(response, url, deadline)
    }

    response.body().close()
    val target = RemoteUrls.redirectTarget(url, location)
    return when {
      redirectsLeft == 0 || target == null -> Download.Failed(RemoteFailure.BLOCKED)
      else -> follow(target, redirectsLeft - 1, deadline)
    }
  }

  private fun send(
    url: String,
    deadline: Long
  ): HttpResponse<InputStream> {
    val remaining = Duration.ofNanos(maxOf(1L, deadline - System.nanoTime()))
    val request =
      HttpRequest
        .newBuilder(URI.create(url))
        .timeout(remaining)
        .header("Accept", "image/*")
        .GET()
        .build()
    return client.send(request, HttpResponse.BodyHandlers.ofInputStream())
  }

  private fun finish(
    response: HttpResponse<InputStream>,
    url: String,
    deadline: Long
  ): Download {
    val maxBytes = PictureSpec.remote.maxBytes
    val length = response.headers().firstValueAsLong("content-length").orElse(0)
    val isOverCap = length > maxBytes
    if (response.statusCode() != HTTP_OK || isOverCap) {
      response.body().close()
      val failure =
        when {
          isOverCap -> RemoteFailure.TOO_LARGE
          else -> RemoteFailure.STATUS
        }
      return Download.Failed(failure)
    }

    return when (val body = readBounded(response.body(), maxBytes, deadline)) {
      is Body.Stopped -> Download.Failed(body.failure)
      is Body.Bytes -> classified(body.bytes, response, url)
    }
  }

  private fun classified(
    bytes: ByteArray,
    response: HttpResponse<InputStream>,
    url: String
  ): Download {
    val extension =
      PictureSniffer.extensionOf(
        bytes,
        response.headers().firstValue("content-type").orElse(""),
        PicturePaths.targetOf(url, "/", "/").extension
      )
    return when {
      extension.isEmpty() -> Download.Failed(RemoteFailure.NOT_A_PICTURE)
      else -> Download.Fetched(bytes, extension)
    }
  }

  // Reads at most the cap, giving up at the deadline: a stalled server is cut off by closing the stream.
  private fun readBounded(
    stream: InputStream,
    maxBytes: Int,
    deadline: Long
  ): Body {
    val reading = CompletableFuture.supplyAsync { readCapped(stream, maxBytes) }
    val remaining = maxOf(1L, (deadline - System.nanoTime()) / NANOS_PER_MILLI)
    return try {
      val bytes = reading.get(remaining, TimeUnit.MILLISECONDS)
      when {
        bytes == null -> Body.Stopped(RemoteFailure.TOO_LARGE)
        else -> Body.Bytes(bytes)
      }
    } catch (_: TimeoutException) {
      Body.Stopped(RemoteFailure.TIMEOUT)
    } catch (_: ExecutionException) {
      Body.Stopped(RemoteFailure.NETWORK)
    } finally {
      stream.close()
    }
  }

  private fun readCapped(
    stream: InputStream,
    maxBytes: Int
  ): ByteArray? {
    val out = ByteArrayOutputStream()
    val chunk = ByteArray(CHUNK_BYTES)
    while (true) {
      val count = stream.read(chunk)
      if (count < 0) {
        return out.toByteArray()
      }

      out.write(chunk, 0, count)
      if (out.size() > maxBytes) {
        return null
      }
    }
  }

  private sealed interface Body {
    class Bytes(
      val bytes: ByteArray
    ) : Body

    data class Stopped(
      val failure: RemoteFailure
    ) : Body
  }
}
