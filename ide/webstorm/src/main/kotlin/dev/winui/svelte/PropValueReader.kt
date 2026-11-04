package dev.winui.svelte

import com.intellij.lang.javascript.JSTokenTypes
import com.intellij.lang.javascript.psi.JSArrayLiteralExpression
import com.intellij.lang.javascript.psi.JSConditionalExpression
import com.intellij.lang.javascript.psi.JSExpression
import com.intellij.lang.javascript.psi.JSLiteralExpression
import com.intellij.lang.javascript.psi.JSParenthesizedExpression
import com.intellij.lang.javascript.psi.JSPrefixExpression
import com.intellij.lang.javascript.psi.JSReferenceExpression
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.xml.XmlAttribute

object PropValueReader {
  private const val MUSTACHE_START = "{"
  private const val MUSTACHE_END = "}"

  fun read(attribute: XmlAttribute): PropValue? {
    if (attribute.text.startsWith(MUSTACHE_START)) {
      return null
    }

    val valueElement = attribute.valueElement ?: return PropValue.Flag(true)
    val text = valueElement.text
    if (text.startsWith(MUSTACHE_START) && text.endsWith(MUSTACHE_END)) {
      val expression = PsiTreeUtil.findChildOfType(valueElement, JSExpression::class.java)
      return expression?.let { read(it) }
    }

    val isStatic = !text.contains(MUSTACHE_START)
    return if (isStatic) {
      PropValue.Text(attribute.value ?: return null)
    } else {
      null
    }
  }

  fun read(expression: JSExpression): PropValue? =
    when (expression) {
      is JSParenthesizedExpression -> expression.innerExpression?.let { read(it) }
      is JSLiteralExpression -> literal(expression)
      is JSPrefixExpression -> negative(expression)
      is JSReferenceExpression -> member(expression)
      is JSArrayLiteralExpression -> tuple(expression)
      is JSConditionalExpression -> conditional(expression)
      else -> null
    }

  private fun literal(expression: JSLiteralExpression): PropValue? =
    when {
      expression.isNumericLiteral -> PropValue.Number(expression.text)
      expression.isBooleanLiteral -> PropValue.Flag(expression.text == "true")
      expression.isQuotedLiteral -> expression.stringValue?.let { PropValue.Text(it) }
      else -> null
    }

  private fun negative(expression: JSPrefixExpression): PropValue? {
    val operand = expression.expression as? JSLiteralExpression ?: return null
    val isNegation = expression.operationSign == JSTokenTypes.MINUS && operand.isNumericLiteral
    return if (isNegation) {
      PropValue.Number("-${operand.text}")
    } else {
      null
    }
  }

  private fun member(expression: JSReferenceExpression): PropValue? {
    val qualifier = expression.qualifier as? JSReferenceExpression ?: return null
    val isPlainQualifier = qualifier.qualifier == null
    val qualifierName = qualifier.referenceName
    val name = expression.referenceName
    return if (isPlainQualifier && qualifierName != null && name != null) {
      PropValue.Member(qualifierName, name)
    } else {
      null
    }
  }

  private fun tuple(expression: JSArrayLiteralExpression): PropValue? {
    val numbers = expression.expressions.map { (read(it) as? PropValue.Number)?.literal }
    val isNumeric = numbers.isNotEmpty() && numbers.all { it != null }
    return if (isNumeric) {
      PropValue.Tuple(numbers.filterNotNull())
    } else {
      null
    }
  }

  private fun conditional(expression: JSConditionalExpression): PropValue? {
    val condition = expression.condition ?: return null
    val whenTrue = expression.thenBranch?.let { read(it) } ?: return null
    val whenFalse = expression.elseBranch?.let { read(it) } ?: return null
    return PropValue.Conditional(condition.text, whenTrue, whenFalse)
  }
}
