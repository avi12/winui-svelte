package dev.winui.svelte

/**
 * Every CSS and layout preview a Svelte file has, in text order: the gradient bar, the contrast ratio, the easing
 * curve and timeline, the box model and grid tracks, what a declaration becomes in WinUI, whether an `@media`
 * condition holds in the assumed environment, and the shadow depth or window material.
 */
internal object CssPreviews {
  private val gradientProperties = setOf("background", "background-image")
  private const val KEY_SPLINE = "key-spline"
  private val targets by lazy { ConversionTable.bundled.winuiTargets() }

  fun of(
    text: String,
    features: Set<PreviewFeature>,
    environment: MediaEnvironment
  ): List<CssPreview> {
    val declarations = CssDeclarations.of(text, ConversionTable.bundled.cssPropertiesByAttribute())
    val previews =
      buildList {
        if (PreviewFeature.GRADIENT in features) {
          addAll(gradients(text, declarations))
        }

        if (PreviewFeature.CONTRAST in features) {
          addAll(contrasts(declarations))
        }

        if (PreviewFeature.EASING in features) {
          addAll(easings(declarations))
        }

        if (PreviewFeature.BOX in features) {
          addAll(LayoutPreviews.boxes(declarations))
        }

        if (PreviewFeature.DECLARATION in features) {
          addAll(meanings(declarations))
        }

        if (PreviewFeature.MEDIA in features) {
          addAll(MediaPreviews.media(text, environment))
        }

        if (PreviewFeature.SHADOW in features) {
          addAll(LayoutPreviews.shadows(declarations))
        }
      }
    return previews.sortedBy { it.start }
  }

  private fun gradientPreview(
    gradient: GradientPreview,
    offset: Int
  ): CssPreview {
    val html =
      ColorPreviewHtml.gradientBar(gradient.stops) +
        "<p><b>${gradient.kind.label} gradient</b>, ${gradient.stops.size} stops, left to right</p>" +
        ColorPreviewHtml.stopList(gradient.stops)
    return CssPreview(
      PreviewFeature.GRADIENT,
      offset + gradient.start,
      offset + gradient.end,
      html,
      inline = InlineAt(offset + gradient.start, InlineVisual.Gradient(gradient.stops))
    )
  }

  private fun gradients(
    text: String,
    declarations: List<CssDeclaration>
  ): List<CssPreview> {
    val fromCss =
      declarations
        .filter { it.property in gradientProperties || it.source != DeclarationSource.RULE }
        .flatMap { declaration -> Gradients.of(declaration.value).map { gradientPreview(it, declaration.valueStart) } }
    return fromCss + Gradients.brushes(text).map { gradientPreview(it, 0) }
  }

  private fun contrasts(declarations: List<CssDeclaration>) =
    declarations.groupBy { it.group }.values.flatMap { group ->
      val pair = Contrast.ofGroup(group) ?: return@flatMap emptyList()
      val html =
        ColorPreviewHtml.sample(pair) +
          "<p><b>${pair.label}</b> between <code>${pair.foreground.value}</code> and <code>${pair.background.value}</code></p>" +
          "<p>AA needs 4.5:1 (3:1 for large text), AAA needs 7:1</p>"
      listOf(pair.foreground, pair.background).map { declaration ->
        val isForeground = declaration == pair.foreground
        CssPreview(
          PreviewFeature.CONTRAST,
          declaration.valueStart,
          declaration.valueEnd,
          html,
          hint =
            if (isForeground) {
              HintAt(declaration.valueEnd, pair.label)
            } else {
              null
            }
        )
      }
    }

  private fun easings(declarations: List<CssDeclaration>) =
    declarations.mapNotNull { declaration ->
      val isKeySpline = declaration.property == KEY_SPLINE
      val named = WinuiIdeData.easings
      val samples =
        if (isKeySpline) {
          Easings.keySplineOf(
            declaration.value
          )
        } else {
          Easings.of(declaration.value, named)?.samples
        }
      val isEasing = isKeySpline || Easings.isEasingProperty(declaration.property)
      if (samples == null || !isEasing) {
        return@mapNotNull null
      }

      val timings = Timings.of(declaration.property, declaration.value, named)
      val timeline =
        if (timings.isEmpty()) {
          ""
        } else {
          "<p>${MotionPreviewHtml.timeline(timings)}</p>"
        }
      CssPreview(
        PreviewFeature.EASING,
        declaration.valueStart,
        declaration.valueEnd,
        MotionPreviewHtml.curve(samples) + "<p><b>easing</b> progress against time</p>" + timeline,
        inline = InlineAt(declaration.valueStart, InlineVisual.Curve(samples))
      )
    }

  private fun meanings(declarations: List<CssDeclaration>) =
    declarations.mapNotNull { declaration ->
      val meaning =
        DeclarationInfo.of(
          declaration,
          WinuiIdeData.unsupportedReasons,
          targets,
          WinuiIdeData::isHandledProperty
        ) ?: return@mapNotNull null
      val becomes =
        if (meaning.targets.isEmpty()) {
          "is translated to WinUI"
        } else {
          "becomes " +
            meaning.targets.joinToString(", ") { "<code>$it</code>" }
        }
      val html =
        if (meaning.isSupported) {
          "<b>${meaning.property}</b> $becomes<p>${meaning.scope}</p>"
        } else {
          "<b>${meaning.property}</b> has no WinUI meaning<p>${meaning.reason}</p>"
        }
      CssPreview(PreviewFeature.DECLARATION, declaration.start, declaration.start + meaning.property.length, html)
    }
}
