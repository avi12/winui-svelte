package dev.winui.svelte

import com.google.gson.JsonElement
import com.google.gson.JsonParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.io.File

/** The logic spec both editors implement: `ide/css-previews.spec.json`, which the VS Code core is tested against too. */
class CssPreviewSpecTest {
  private val spec = JsonParser.parseString(File("../css-previews.spec.json").readText()).asJsonObject
  private val sampleIndexes = listOf(0, 5, 10, 15, 20)

  private fun JsonElement.plain(): Any? =
    when {
      isJsonNull -> null
      isJsonArray -> asJsonArray.map { it.plain() }
      isJsonObject -> asJsonObject.entrySet().associate { (key, value) -> key to value.plain() }
      asJsonPrimitive.isBoolean -> asBoolean
      asJsonPrimitive.isNumber -> asDouble
      else -> asString
    }

  private fun cases(section: String) = spec.getAsJsonArray(section).map { it.asJsonObject }

  private fun at(
    case: com.google.gson.JsonObject,
    key: String
  ) = case.get(key).asString

  private fun gradientsPlain(gradients: List<GradientPreview>) =
    gradients.map { gradient ->
      mapOf(
        "kind" to gradient.kind.label,
        "stops" to gradient.stops.map { listOf(it.color.toHexWithAlpha(), it.position) }
      )
    }

  private fun sampled(samples: List<Double>?) = samples?.let { all -> sampleIndexes.map { all[it] } }

  private fun declarationOf(
    property: String,
    source: DeclarationSource,
    media: List<String>
  ) = CssDeclaration(property, "x", 0, 0, 1, 0, source, ".a", media)

  @Test
  fun `a gradient has its stops resolved to colors and positions`() {
    for (case in cases("gradients")) {
      assertEquals(case.get("expected").plain(), gradientsPlain(Gradients.of(at(case, "value"))), at(case, "value"))
    }
  }

  @Test
  fun `a brush of gradient stops reads like a CSS gradient`() {
    for (case in cases("brushes")) {
      assertEquals(case.get("expected").plain(), gradientsPlain(Gradients.brushes(at(case, "text"))), at(case, "text"))
    }
  }

  @Test
  fun `a pair of colors has its WCAG ratio and verdict`() {
    for (case in cases("contrasts")) {
      val foreground = requireNotNull(CssColors.parse(at(case, "foreground")))
      val background = requireNotNull(CssColors.parse(at(case, "background")))
      val ratio = Contrast.ratio(foreground, background)
      assertEquals(
        at(case, "label"),
        "${Contrast.ratioText(ratio)} ${Contrast.verdictOf(ratio).label}",
        at(case, "foreground")
      )
    }
  }

  @Test
  fun `an easing is sampled into the curve it draws`() {
    for (case in cases("easings")) {
      val curve = Easings.of(at(case, "value"), WinuiIdeData.easings)
      assertEquals(case.get("samples").plain(), sampled(curve?.samples), at(case, "value"))
    }

    for (case in cases("keySplines")) {
      assertEquals(case.get("samples").plain(), sampled(Easings.keySplineOf(at(case, "value"))), at(case, "value"))
    }
  }

  @Test
  fun `a transition and an animation have their durations and delays`() {
    for (case in cases("timings")) {
      val timings = Timings.of(at(case, "property"), at(case, "value"), WinuiIdeData.easings)
      val plain =
        timings.map {
          mapOf(
            "name" to it.name,
            "durationMs" to it.durationMs,
            "delayMs" to it.delayMs,
            "easing" to it.easing
          )
        }
      assertEquals(case.get("expected").plain(), plain, at(case, "value"))
    }
  }

  @Test
  fun `a box value is expanded to four sides in pixels and any other unit is refused`() {
    for (case in cases("boxes")) {
      val box = BoxModel.boxOf(at(case, "property"), at(case, "value"))
      val plain = box?.let { mapOf("kind" to it.kind.name.lowercase(), "values" to it.values) }
      assertEquals(case.get("expected").plain(), plain, at(case, "value"))
    }
  }

  @Test
  fun `grid tracks get a share of the bar`() {
    for (case in cases("tracks")) {
      val plain = BoxModel.tracksOf(at(case, "value"))?.map { listOf(it.kind.id, it.amount, it.share) }
      assertEquals(case.get("expected").plain(), plain, at(case, "value"))
    }
  }

  @Test
  fun `a media condition is evaluated against the assumed environment`() {
    for (case in cases("media")) {
      val environment = case.getAsJsonObject("environment")
      val answer =
        MediaConditions.evaluate(
          at(case, "condition"),
          MediaEnvironment(
            Theme.named(at(environment, "theme")),
            environment.get("isReducedMotion").asBoolean,
            environment.get("width").asInt,
            environment.get("height").asInt
          )
        )
      assertEquals(case.get("matches").plain(), answer.isMatching, at(case, "condition"))
      assertEquals(
        case.get("parts").plain(),
        answer.parts.map { listOf(it.text, it.isMatching) },
        at(case, "condition")
      )
    }
  }

  @Test
  fun `a shadow has a depth and a depth is placed on the ladder`() {
    for (case in cases("shadows")) {
      assertEquals(
        case.get("depth").plain(),
        ShadowDepths.depthOf(at(case, "property"), at(case, "value")),
        at(case, "value")
      )
    }

    for (case in cases("ladder")) {
      val nearest = ShadowDepths.nearestStep(case.get("depth").asDouble, WinuiIdeData.shadowDepths)
      assertEquals(case.get("nearest").asInt, nearest, case.get("depth").toString())
    }

    for (case in cases("materials")) {
      val material = ShadowDepths.materialOf("backdrop", at(case, "value"), WinuiIdeData.materials)
      assertEquals(case.get("name").plain(), material?.name, at(case, "value"))
    }
  }

  @Test
  fun `the declarations of a file are found in the style block the style attribute and the props`() {
    val properties =
      spec.getAsJsonObject("attributeProperties").entrySet().associate { (key, value) ->
        key to
          value.asString
      }
    for (case in cases("declarations")) {
      val text = at(case, "text")
      val plain =
        CssDeclarations.of(text, properties).map {
          listOf(
            it.property,
            it.value,
            it.group.toDouble(),
            it.source.name.lowercase(),
            it.selector,
            it.media,
            text.substring(it.valueStart, it.valueEnd)
          )
        }
      assertEquals(case.get("expected").plain(), plain, text)
    }

    for (case in cases("mediaQueries")) {
      val text = at(case, "text")
      val plain = CssDeclarations.mediaQueriesOf(text).map { listOf(it.condition, text.substring(it.start, it.end)) }
      assertEquals(case.get("expected").plain(), plain, text)
    }
  }

  @Test
  fun `a declaration says what it becomes in WinUI or why it cannot`() {
    val targets = ConversionTable.bundled.winuiTargets()
    for (case in cases("infos")) {
      val media = case.getAsJsonArray("media")?.map { it.asString }.orEmpty()
      val source = DeclarationSource.valueOf(at(case, "source").uppercase())
      val info =
        DeclarationInfo.of(
          declarationOf(at(case, "property"), source, media),
          WinuiIdeData.unsupportedReasons,
          targets,
          WinuiIdeData::isHandledProperty
        )
      val plain =
        info?.let {
          mapOf(
            "isSupported" to it.isSupported,
            "targets" to it.targets,
            "reason" to it.reason,
            "scope" to it.scope
          )
        }
      assertEquals(case.get("expected").plain(), plain, at(case, "property"))
    }
  }
}
