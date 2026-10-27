// The rules of CLAUDE.md ("Google style, in short", "Code style", "Naming"),
// one object per scope so eslint.config.js can hand each to the files it
// governs. Logic and correctness rules the oxlint config already owns are not
// repeated here, so a violation is reported once, by one tool.

// A compound or comparing `if` condition is extracted into a named boolean
// (CLAUDE.md, "Code style"). An `else if` condition stays inline, because
// hoisting it above the first branch changes short-circuiting.
const conditionIsNotElseIf = "IfStatement[parent.type!='IfStatement']";

const restrictedSyntax = [
  {
    selector: `${conditionIsNotElseIf} > LogicalExpression.test`,
    message: "Extract the condition into a descriptively-named const (is/has/can/should) right before the if."
  },
  {
    selector: `${conditionIsNotElseIf} > BinaryExpression.test`,
    message: "Extract the comparison into a descriptively-named const (is/has/can/should) right before the if."
  },
  {
    selector: "ConditionalExpression > LogicalExpression.test",
    message: "Extract the ternary's condition into a descriptively-named const (is/has/can/should)."
  },
  {
    selector: "CallExpression[callee.property.name='forEach']",
    message: "Use for...of instead of .forEach."
  },
  {
    selector: ":matches(CallExpression[callee.property.name='reduce'], CallExpression[callee.property.name='reduceRight'])",
    message: "Use a plain for loop instead of .reduce."
  },
  {
    selector: "ForInStatement",
    message: "Use for...of over Object.keys/entries instead of for...in (Google style)."
  },
  {
    // A function with two or more parameters takes one destructured object, so
    // every argument is documented at the call site. Callbacks (arrow
    // functions passed as arguments) and constructors keep positional
    // parameters; func-style keeps named functions declarations.
    selector: ":matches(FunctionDeclaration, TSDeclareFunction)[params.length>1]",
    message: "A function with 2+ parameters takes one destructured object parameter."
  },
  {
    selector: "MethodDefinition[kind!='constructor'] > FunctionExpression[params.length>1]",
    message: "A method with 2+ parameters takes one destructured object parameter."
  },
  {
    // House rule: return types are inferred. A type predicate (`x is T`,
    // `asserts x`) is the one return type TypeScript cannot infer.
    selector: ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[returnType]:not([returnType.typeAnnotation.type='TSTypePredicate'])",
    message: "Do not write a return type: let TypeScript infer it."
  }
];

// Applied to every .ts, .js and .svelte file.
export const everyFileRules = {
  // Google: named exports only. (A .svelte file's default export is Svelte's
  // own and is never written in its script.)
  "no-restricted-exports": ["error", {
    restrictDefaultExports: {
      direct: true,
      named: true,
      defaultFrom: true,
      namedFrom: true,
      namespaceFrom: true
    }
  }],
  "@typescript-eslint/ban-ts-comment": ["error", {
    "ts-ignore": true,
    "ts-nocheck": true,
    "ts-check": false,
    "ts-expect-error": "allow-with-description",
    minimumDescriptionLength: 10
  }],
  "@typescript-eslint/consistent-type-imports": ["error", {
    prefer: "type-imports",
    fixStyle: "separate-type-imports"
  }],
  "@typescript-eslint/no-non-null-assertion": "error",
  "@typescript-eslint/consistent-type-assertions": ["error", {
    assertionStyle: "as",
    objectLiteralTypeAssertions: "never"
  }],
  eqeqeq: ["error", "always", { null: "ignore" }],
  curly: ["error", "all"],
  "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: false }],
  "prefer-const": ["error", { destructuring: "all" }],
  "no-var": "error",
  "@typescript-eslint/prefer-for-of": "error",
  "@typescript-eslint/only-throw-error": "error",
  "@typescript-eslint/no-namespace": "error",
  "@typescript-eslint/no-require-imports": "error",
  "@typescript-eslint/no-wrapper-object-types": "error",
  "@typescript-eslint/no-unsafe-function-type": "error",
  "@typescript-eslint/no-empty-object-type": "error",
  "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
  "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
  "@typescript-eslint/parameter-properties": ["error", {
    prefer: "class-property",
    allow: ["readonly", "private readonly", "protected readonly"]
  }],
  "@typescript-eslint/explicit-member-accessibility": ["error", { accessibility: "no-public" }],
  "@typescript-eslint/no-magic-numbers": ["error", {
    ignore: [0, 1, -1, 2],
    ignoreEnums: true,
    ignoreReadonlyClassProperties: true,
    ignoreNumericLiteralTypes: true,
    ignoreTypeIndexes: true,
    enforceConst: true
  }],
  // Early returns: flat code.
  "no-else-return": ["error", { allowElseIf: false }],
  "no-lonely-if": "error",
  "max-depth": ["error", 3],
  "max-nested-callbacks": ["error", 3],
  "local/no-em-dash": "error"
};

// Rules that read type information (the typescript-eslint project service).
export const typeAwareRules = {
  "@typescript-eslint/no-for-in-array": "error",
  "@typescript-eslint/naming-convention": [
    "error",
    // Module constants of a plain value are CONSTANT_CASE; a boolean among
    // them still reads as is/has/can/should.
    {
      selector: "variable",
      modifiers: ["const", "global"],
      types: ["boolean"],
      format: ["UPPER_CASE"],
      custom: { regex: "^(IS|HAS|CAN|SHOULD)_", match: true }
    },
    {
      selector: "variable",
      modifiers: ["const", "global"],
      types: ["string", "number"],
      format: ["UPPER_CASE"]
    },
    {
      selector: ["variable", "parameter", "classProperty", "parameterProperty"],
      types: ["boolean"],
      format: ["PascalCase"],
      prefix: ["is", "has", "can", "should"]
    },
    {
      selector: "variable",
      modifiers: ["const", "global"],
      format: ["camelCase", "UPPER_CASE", "PascalCase"]
    },
    {
      selector: "variable",
      format: ["camelCase"]
    },
    {
      selector: "parameter",
      format: ["camelCase"],
      leadingUnderscore: "allow"
    },
    {
      selector: "function",
      format: ["camelCase"]
    },
    {
      selector: ["classProperty", "classMethod", "accessor", "parameterProperty", "typeProperty", "objectLiteralProperty", "objectLiteralMethod"],
      format: ["camelCase", "UPPER_CASE"],
      leadingUnderscore: "forbid"
    },
    {
      // Names an external shape dictates (a quoted key, an HTTP header).
      selector: ["objectLiteralProperty", "typeProperty", "classProperty"],
      modifiers: ["requiresQuotes"],
      format: null
    },
    {
      selector: "enumMember",
      format: ["UPPER_CASE"]
    },
    {
      selector: "interface",
      format: ["PascalCase"],
      custom: { regex: "^I[A-Z]", match: false }
    },
    {
      selector: ["class", "typeAlias", "enum", "typeParameter"],
      format: ["PascalCase"]
    }
  ]
};

export const syntaxRules = restrictedSyntax;

// src/**: the package's own code.
export const sourceRules = {
  // Google: every exported symbol has a JSDoc that says what the name and type
  // cannot. Only the public API is documented; nothing here asks for a comment
  // on internals.
  "jsdoc/require-jsdoc": ["error", {
    publicOnly: true,
    require: {
      FunctionDeclaration: true,
      ClassDeclaration: true,
      ArrowFunctionExpression: false,
      FunctionExpression: false,
      MethodDefinition: false
    },
    contexts: ["TSInterfaceDeclaration", "TSTypeAliasDeclaration", "TSEnumDeclaration"]
  }],
  "jsdoc/require-description": ["error", { contexts: ["any"] }],
  // The types are TypeScript's, not JSDoc's.
  "jsdoc/no-types": "error",
  "jsdoc/check-tag-names": ["error", { typed: true }]
};

// Tree shaking: importing a module does no work. A statement at the top of a
// module, other than a declaration, is work done on import.
export const treeShakingSyntax = [
  {
    selector: "Program > ExpressionStatement[directive=undefined]",
    message: "Importing a module must do no work: move this inside a function the caller runs."
  },
  {
    selector: "Program > :matches(IfStatement, ForStatement, ForOfStatement, WhileStatement, TryStatement, SwitchStatement)",
    message: "Importing a module must do no work: move this inside a function the caller runs."
  }
];
