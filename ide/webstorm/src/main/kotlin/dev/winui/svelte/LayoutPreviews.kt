package dev.winui.svelte

/** The box model, grid track, shadow depth and material previews of the declarations of a file. */
internal object LayoutPreviews {
  fun boxes(declarations: List<CssDeclaration>) =
    declarations.mapNotNull { declaration ->
      val box = BoxModel.boxOf(declaration.property, declaration.value)
      val tracks =
        if (BoxModel.isTrackProperty(declaration.property)) {
          BoxModel.tracksOf(declaration.value)
        } else {
          null
        }
      val html =
        when {
          box != null -> {
            boxHtml(box)
          }

          tracks != null -> {
            LayoutPreviewHtml.tracks(tracks) +
              "<p><b>${declaration.property}</b> ${tracks.size} tracks, drawn in proportion</p>"
          }

          else -> {
            return@mapNotNull null
          }
        }
      CssPreview(PreviewFeature.BOX, declaration.valueStart, declaration.valueEnd, html)
    }

  private fun boxHtml(box: Box): String {
    val order =
      if (box.kind ==
        BoxKind.CORNERS
      ) {
        "top left, top right, bottom right, bottom left"
      } else {
        "top, right, bottom, left"
      }
    return LayoutPreviewHtml.box(box) +
      "<p><b>${box.property}</b> ${box.values.joinToString(", ") { PreviewText.number(it) }} px ($order)</p>"
  }

  fun shadows(declarations: List<CssDeclaration>) =
    declarations.mapNotNull { declaration ->
      val material = ShadowDepths.materialOf(declaration.property, declaration.value, WinuiIdeData.materials)
      val html = material?.let { materialHtml(it) } ?: depthHtml(declaration) ?: return@mapNotNull null
      CssPreview(PreviewFeature.SHADOW, declaration.valueStart, declaration.valueEnd, html)
    }

  private fun materialHtml(material: WindowMaterial): String {
    val translucent =
      if (material.isTranslucent) {
        ", translucent"
      } else {
        ""
      }
    return ColorPreviewHtml.material(material) +
      "<p><b>${material.name}</b> light ${material.light}, dark ${material.dark}$translucent</p>"
  }

  private fun depthHtml(declaration: CssDeclaration): String? {
    val steps = WinuiIdeData.shadowDepths
    val depth = ShadowDepths.depthOf(declaration.property, declaration.value) ?: return null
    val nearest = ShadowDepths.nearestStep(depth, steps)
    val step = steps.getOrNull(nearest) ?: return null
    return LayoutPreviewHtml.ladder(steps, nearest) +
      "<p><b>depth ${PreviewText.number(depth)}</b>, nearest to ${step.use} (${step.depth})</p>"
  }
}
