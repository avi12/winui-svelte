package dev.winui.svelte

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress

class RemoteDownloadTest {
  private val png = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d)
  private lateinit var server: HttpServer
  private val authorizations = mutableListOf<String?>()
  private val base get() = "http://127.0.0.1:${server.address.port}"

  @BeforeEach
  fun start() {
    server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    server.createContext("/") { exchange ->
      authorizations.add(exchange.requestHeaders.getFirst("Authorization"))
      val path = exchange.requestURI.path
      when (path) {
        "/a.png" -> reply(exchange, 200, "image/png", png)
        "/hop" -> redirect(exchange, "/a.png")
        "/loop" -> redirect(exchange, "/loop")
        "/page" -> reply(exchange, 200, "text/html", "<html></html>".toByteArray())
        "/huge" -> reply(exchange, 200, "image/png", ByteArray(PictureSpec.remote.maxBytes + 1))
        else -> reply(exchange, 404, "text/plain", ByteArray(0))
      }
    }
    server.start()
  }

  @AfterEach
  fun stop() {
    server.stop(0)
  }

  private fun reply(
    exchange: HttpExchange,
    status: Int,
    type: String,
    body: ByteArray
  ) {
    exchange.responseHeaders.add("Content-Type", type)
    exchange.sendResponseHeaders(status, body.size.toLong().takeIf { it > 0 } ?: -1)
    exchange.responseBody.use { it.write(body) }
  }

  private fun redirect(
    exchange: HttpExchange,
    location: String
  ) {
    exchange.responseHeaders.add("Location", location)
    exchange.sendResponseHeaders(302, -1)
    exchange.close()
  }

  private fun failureOf(path: String) = (RemoteDownload.fetch("$base$path") as? Download.Failed)?.failure

  @Test
  fun `a picture is downloaded through a redirect with no credentials sent`() {
    val result = RemoteDownload.fetch("$base/hop")
    assertEquals("png", (result as Download.Fetched).extension)
    assertEquals(png.toList(), result.bytes.toList())
    assertEquals(listOf<String?>(null, null), authorizations)
  }

  @Test
  fun `a download fails with the reason`() {
    assertEquals(RemoteFailure.STATUS, failureOf("/missing.png"))
    assertEquals(RemoteFailure.NOT_A_PICTURE, failureOf("/page"))
    assertEquals(RemoteFailure.TOO_LARGE, failureOf("/huge"))
    assertEquals(RemoteFailure.BLOCKED, failureOf("/loop"))
  }

  @Test
  fun `an address that is not allowed is refused before any request`() {
    val refused = RemoteDownload.fetch("https://user:secret@example.com/a.png")
    assertEquals(RemoteFailure.BLOCKED, (refused as Download.Failed).failure)
    assertNull((RemoteDownload.fetch("ftp://example.com/a.png") as? Download.Fetched))
    assertEquals(emptyList<String?>(), authorizations)
  }
}
