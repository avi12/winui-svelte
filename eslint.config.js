import {
  everyFileRules,
  sourceRules,
  syntaxRules,
  treeShakingSyntax,
  typeAwareRules
} from "./eslint-config/google-style.js";
import expandNestedObjectExpression from "./eslint-rules/expand-nested-object-expression.js";
import expandNestedTypeLiteral from "./eslint-rules/expand-nested-type-literal.js";
import expandSvelteBlock from "./eslint-rules/expand-svelte-block.js";
import multilineArgumentParenthesisNewline from "./eslint-rules/multiline-arg-paren-newline.js";
import noEmDash from "./eslint-rules/no-em-dash.js";
import noPaddedTag from "./eslint-rules/no-padded-tag.js";
import stylistic from "@stylistic/eslint-plugin";
import importNewlines from "eslint-plugin-import-newlines";
import jsdoc from "eslint-plugin-jsdoc";
import perfectionist from "eslint-plugin-perfectionist";
import svelteEslint from "eslint-plugin-svelte";
import unusedImports from "eslint-plugin-unused-imports";
import { globalIgnores } from "eslint/config";
import globals from "globals";
import svelteParser from "svelte-eslint-parser";
import typescriptEslint from "typescript-eslint";

const projectSyntax = [
  {
    selector: "MemberExpression[object.name='Reflect']",
    message: "Do not use Reflect. Use direct property access instead."
  },
  {
    selector: "VariableDeclarator[init.type='ConditionalExpression'][init.consequent.type='ArrowFunctionExpression']",
    message: "Declare a named function instead of assigning an arrow function to a variable - fold the condition inside the function body."
  },
  {
    selector: "VariableDeclarator[init.type='ConditionalExpression'][init.alternate.type='ArrowFunctionExpression']",
    message: "Declare a named function instead of assigning an arrow function to a variable - fold the condition inside the function body."
  },
  {
    // Svelte content tags only: a `{cond ? a : b}` that outputs text reads as
    // markup in an {#if}/{:else} block. Attribute values may keep a ternary.
    selector: "SvelteMustacheTag:not([parent.type='SvelteAttribute']):not([parent.type='SvelteStyleDirective']) > ConditionalExpression",
    message: "Do not use a ternary in a template tag - use an {#if}/{:else} block instead."
  }
];

const restrictedSyntax = [...projectSyntax, ...syntaxRules];
// The Canvas 2D API and the Web APIs under src/web-apis are positional
// (context.moveTo(x, y), usb.requestDevice(options)), so that a library written
// for a browser calls them unchanged: their classes keep the platform's
// parameter lists (CLAUDE.md, "Which rules win").
const platformApiSyntax = restrictedSyntax.filter(({ message }) => !message.includes("with 2+ parameters"));
const platformApiFiles = [
  "src/win2d/context-2d/context.ts",
  "src/win2d/context-2d/path.ts",
  "src/win2d/context-2d/paint.ts",
  "src/win2d/context-2d/canvas-element.ts",
  "src/web-apis/*.ts"
];

// Adapted from avi/pade. Logic and correctness rules live in oxlint
// (.oxlintrc.json) - ESLint only carries what oxlint cannot: formatting,
// selector bans and the local custom rules
const tsStyleRules = {
  // Only the auto-removal of dead imports lives here: oxlint reports unused
  // variables, but its plain --fix does not remove an import.
  "unused-imports/no-unused-imports": "error",
  // oxlint bans it in .ts; this carries the ban into .svelte, which oxlint
  // does not read.
  "@typescript-eslint/no-explicit-any": "error",
  "perfectionist/sort-imports": [
    "error",
    {
      type: "alphabetical",
      order: "asc",
      newlinesBetween: "ignore",
      sortSideEffects: true,
      groups: [["side-effect", "builtin", "external", "internal", "parent", "sibling", "index", "unknown"]]
    }
  ],
  "perfectionist/sort-named-imports": ["error", {
    type: "alphabetical",
    order: "asc",
    ignoreCase: true
  }],
  "perfectionist/sort-named-exports": ["error", {
    type: "alphabetical",
    order: "asc",
    ignoreCase: true
  }],
  "@stylistic/quotes": ["error", "double", { allowTemplateLiterals: "always" }],
  "@stylistic/quote-props": ["error", "as-needed"],
  "@stylistic/semi": ["error"],
  "@stylistic/indent": ["error", 2],
  "@stylistic/arrow-parens": ["error", "as-needed"],
  "@stylistic/object-curly-spacing": ["error", "always"],
  "@stylistic/brace-style": "error",
  "@stylistic/comma-dangle": ["error", "never"],
  "@stylistic/no-trailing-spaces": "error",
  "@stylistic/eol-last": ["error", "always"],
  "@stylistic/no-multiple-empty-lines": [
    "error",
    {
      max: 1,
      maxEOF: 0,
      maxBOF: 0
    }
  ],
  "@stylistic/comma-spacing": ["error", {
    before: false,
    after: true
  }],
  "@stylistic/key-spacing": ["error", {
    beforeColon: false,
    afterColon: true
  }],
  "@stylistic/keyword-spacing": ["error", {
    before: true,
    after: true
  }],
  "@stylistic/space-before-blocks": "error",
  "@stylistic/space-before-function-paren": [
    "error",
    {
      named: "never",
      asyncArrow: "always",
      catch: "always"
    }
  ],
  "@stylistic/space-infix-ops": "error",
  "@stylistic/space-in-parens": ["error", "never"],
  "@stylistic/array-bracket-spacing": ["error", "never"],
  "@stylistic/computed-property-spacing": ["error", "never"],
  "@stylistic/template-curly-spacing": ["error", "never"],
  "@stylistic/block-spacing": ["error", "always"],
  "@stylistic/semi-spacing": ["error", {
    before: false,
    after: true
  }],
  "@stylistic/no-extra-semi": "error",
  "@stylistic/type-annotation-spacing": "error",
  "@stylistic/member-delimiter-style": [
    "error",
    {
      multiline: {
        delimiter: "semi",
        requireLast: true
      },
      singleline: {
        delimiter: "semi",
        requireLast: false
      }
    }
  ],
  "@stylistic/no-mixed-spaces-and-tabs": "error",
  "@stylistic/no-tabs": "error",
  "@stylistic/max-len": [
    "error",
    {
      code: 120,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
      // An SVG path, and the window's prose: a sentence in a markup attribute
      // is a string like any other, and a line break in it would be shown.
      ignorePattern: "d=\"[^\"]*\"|[\\w-]+=\"[^\"{}]{40,}\""
    }
  ],
  "@stylistic/padded-blocks": ["error", "never"],
  "@stylistic/rest-spread-spacing": ["error", "never"],
  "@stylistic/spaced-comment": ["error", "always"],
  "import-newlines/enforce": [
    "error",
    {
      items: 4,
      "max-len": 120,
      forceSingleLine: true
    }
  ],
  "@stylistic/object-curly-newline": [
    "error",
    {
      ObjectExpression: {
        consistent: true,
        multiline: true
      },
      ObjectPattern: {
        consistent: true,
        multiline: true
      },
      ExportDeclaration: {
        consistent: true,
        multiline: true
      }
    }
  ],
  "@stylistic/object-property-newline": ["error", { allowAllPropertiesOnSameLine: false }],
  "@stylistic/padding-line-between-statements": [
    "error",
    {
      blankLine: "always",
      prev: "import",
      next: ["const", "let", "function", "export", "type"]
    },
    {
      blankLine: "any",
      prev: "import",
      next: "import"
    },
    {
      blankLine: "always",
      prev: "*",
      next: "if"
    },
    {
      blankLine: "never",
      prev: ["const", "let"],
      next: "if"
    },
    {
      blankLine: "always",
      prev: "if",
      next: "*"
    }
  ],
  "perfectionist/sort-objects": [
    "error",
    {
      type: "unsorted",
      newlinesBetween: 0
    }
  ],
  "@stylistic/function-call-argument-newline": ["error", "consistent"],
  "@stylistic/function-paren-newline": ["error", "consistent"],
  "local/expand-nested-object-expression": "error",
  "local/expand-nested-type-literal": "error",
  "local/multiline-arg-paren-newline": "error",
  "local/no-padded-tag": "error",
  // Flat Win32 calls are bound in the native.ts files only (src/window/native.ts,
  // src/tray/native.ts, src/tray/standalone/native.ts, src/notice/native.ts
  // and src/devices/native.ts, src/app/activation/native.ts,
  // src/app/hotkeys/native.ts, src/app/jump-list/native.ts, and the shared src/win32-calls.ts,
  // exempt below), as a WinUI app keeps every
  // [DllImport] in its Native folder.
  "no-restricted-imports": [
    "error",
    {
      // CLAUDE.md: an import outside the current folder goes through #src/*,
      // never a ../ path.
      patterns: [
        {
          regex: "^\\.\\./",
          message: "Import through #src/* instead of a parent-relative ../ path."
        }
      ],
      paths: [
        {
          name: "@microsoft/dynwinrt/win32/unsafe",
          message: "Flat Win32 calls are bound in the native.ts files (and src/win32-calls.ts) only."
        },
        {
          name: "@microsoft/dynwinrt/win32",
          message: "Flat Win32 calls are bound in the native.ts files (and src/win32-calls.ts) only."
        }
      ]
    }
  ],
  // Arrow-function-to-variable is enforced by oxlint's func-style (allowArrowFunctions:
  // false), but that only catches a direct `const x = () => ...` - a ternary that
  // picks between two arrows evades it, so the selectors below close that gap.
  "no-restricted-syntax": ["error", ...restrictedSyntax],
  ...everyFileRules
};

const sharedPlugins = {
  "@stylistic": stylistic,
  "@typescript-eslint": typescriptEslint.plugin,
  "import-newlines": importNewlines,
  "unused-imports": unusedImports,
  jsdoc,
  perfectionist,
  local: {
    rules: {
      "expand-nested-object-expression": expandNestedObjectExpression,
      "expand-nested-type-literal": expandNestedTypeLiteral,
      "expand-svelte-block": expandSvelteBlock,
      "multiline-arg-paren-newline": multilineArgumentParenthesisNewline,
      "no-em-dash": noEmDash,
      "no-padded-tag": noPaddedTag
    }
  }
};

// Type-aware rules read the same tsconfig tsc does; a file it does not list
// (the config files) is linted by the default project.
const typeAwareParserOptions = {
  projectService: {
    allowDefaultProject: ["*.config.js", "eslint-config/*.js"]
  },
  tsconfigRootDir: import.meta.dirname
};

const testFiles = [
  "**/*.test.ts",
  "test/**",
  "**/*.fixture.svelte",
  "src/state/test-support/**",
  "src/devices/test-support/**",
  "src/renderer/testing/**"
];
const sourceFiles = ["src/**/*.ts", "src/**/*.svelte"];
// What runs on import by design: a command-line entry or a worker's first line.
const entryFiles = ["src/cli/main.ts", "src/window/bootstrap.ts", "src/window/thread.ts"];

// The window runs under Node, not in a webview.
export default [
  ...svelteEslint.configs["flat/recommended"],
  // The generated components are written by scripts/codegen from WinUI's
  // metadata, not by hand, so the style rules (naming, JSDoc, magic numbers,
  // return types, default exports) are not applied to them: the generator is
  // where they are fixed. What does apply is checked elsewhere: tsc and
  // svelte-check (strict flags), props-strictness.ts (no prop typed any or
  // unknown), the editor check (no any hint) and gen:components:check.
  globalIgnores(["node_modules/", "dist/", "eslint-rules/", "eslint-config/", ".winapp/", ".verify/", "src/components/generated/", "src/components/fluent-glyph.ts", ".claude/worktrees/", ".worktrees/", "ide/webstorm/", "ide/vscode/dist/"]),
  {
    files: ["**/*.{ts,js,mjs}"],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: typeAwareParserOptions,
      globals: globals.node
    },
    plugins: sharedPlugins,
    rules: {
      ...tsStyleRules,
      ...typeAwareRules
    }
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: typescriptEslint.parser,
        extraFileExtensions: [".svelte"],
        ...typeAwareParserOptions
      },
      globals: globals.node
    },
    plugins: sharedPlugins,
    rules: {
      ...tsStyleRules,
      ...typeAwareRules,
      "svelte/no-at-html-tags": "off",
      "svelte/indent": ["error", { indent: 2 }],
      "svelte/sort-attributes": "error",
      "svelte/shorthand-directive": "error",
      "svelte/first-attribute-linebreak": ["error"],
      "svelte/shorthand-attribute": ["error", { prefer: "always" }],
      "local/expand-svelte-block": "error"
    }
  },
  {
    // The package's own code: documented API, and no work at import time.
    files: sourceFiles,
    ignores: testFiles,
    rules: {
      ...sourceRules,
      "no-restricted-syntax": ["error", ...restrictedSyntax, ...treeShakingSyntax]
    }
  },
  {
    files: platformApiFiles,
    ignores: testFiles,
    rules: {
      "no-restricted-syntax": ["error", ...platformApiSyntax, ...treeShakingSyntax]
    }
  },
  {
    // Entry points run on import by design.
    files: entryFiles,
    rules: {
      "no-restricted-syntax": ["error", ...restrictedSyntax]
    }
  },
  {
    // A test names its numbers in the assertion they belong to, and nests
    // describe/it callbacks.
    files: testFiles,
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "max-nested-callbacks": "off"
    }
  },
  {
    // A tool's config file is its default export, and its keys are the
    // tool's own option names.
    files: ["*.config.{js,ts}", "**/vite.config.ts"],
    rules: {
      "no-restricted-exports": "off",
      "@typescript-eslint/naming-convention": "off"
    }
  },
  {
    // An app's tray entrypoint is found by its name and default-exports
    // `defineTray(...)`, like WXT's entrypoints.
    files: ["**/entrypoints/tray.ts", "**/entrypoints/tray/index.ts"],
    rules: {
      "no-restricted-exports": "off"
    }
  },
  {
    // The files that bind Win32 exports.
    files: ["src/window/native.ts", "src/notice/native.ts", "src/tray/native.ts", "src/tray/standalone/native.ts", "src/devices/native.ts", "src/web-apis/native.ts", "src/app/native.ts", "src/app/activation/native.ts", "src/app/jump-list/native.ts", "src/app/hotkeys/native.ts", "examples/hotkeys/native.ts", "src/win32-calls.ts", "src/win32-icons.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            regex: "^\\.\\./",
            message: "Import through #src/* instead of a parent-relative ../ path."
          }
        ]
      }]
    }
  },
  {
    // The VS Code extension is a package of its own (its package.json is the extension manifest), so
    // a "#src/*" import cannot reach the repository from it: it takes the shared tables, the
    // translator's colour parser and the generated JSON, by relative path.
    files: ["ide/vscode/src/**/*.ts"],
    rules: {
      "no-restricted-imports": "off"
    }
  }
];
