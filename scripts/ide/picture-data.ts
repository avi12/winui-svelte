import type { EntryApi } from "./attachment-data.ts";
import typescript from "typescript";

// Every prop, option and object key an app writes a picture in: the members
// of the sources typed with `PictureSource` (`src/picture-source.ts`), found
// through the checker so that a new picture-taking member reaches both editors
// with no edit to them. Each is listed with the forms it takes and the
// components whose props include it.

const PICTURE_ALIAS = "PictureSource";
const COMPONENT_FILE = ".d.svelte.ts";
const THEME_TAG = "taskbarTheme";
const PAIR_FORM = "pair";
const PIXELS_FORM = "pixels";
const STRING_FORM = "string";
const PIXELS_MEMBER = "bgra";
const SOURCE_FOLDER = "/src/";
const PROPS_PARAMETER = 1;

const PictureForm = {
  STRING: STRING_FORM,
  PAIR: PAIR_FORM,
  PIXELS: PIXELS_FORM
} as const;
type PictureForm = (typeof PictureForm)[keyof typeof PictureForm];

interface PictureProp {
  owner: string;
  name: string;
  forms: PictureForm[];
  components: string[];
}

interface PictureVariant {
  name: string;
  theme: "light" | "dark";
}

// A function that calls itself needs its return type written: TypeScript cannot infer one that refers to itself
function isPictureNode(options: {
  node: typescript.TypeNode;
  checker: typescript.TypeChecker;
}): boolean;
function isPictureNode({ node, checker }: {
  node: typescript.TypeNode;
  checker: typescript.TypeChecker;
}) {
  if (typescript.isParenthesizedTypeNode(node)) {
    return isPictureNode({
      node: node.type,
      checker
    });
  }

  if (typescript.isUnionTypeNode(node)) {
    return node.types.some(member => isPictureNode({
      node: member,
      checker
    }));
  }

  if (!typescript.isTypeReferenceNode(node)) {
    return false;
  }

  const isAlias = node.typeName.getText() === PICTURE_ALIAS;
  if (isAlias) {
    return true;
  }

  const named = checker.getSymbolAtLocation(node.typeName);
  const isImport = named !== undefined && (named.flags & typescript.SymbolFlags.Alias) !== 0;
  const symbol = isImport ? checker.getAliasedSymbol(named) : named;
  const declaration = symbol?.declarations?.find(typescript.isTypeAliasDeclaration);
  return declaration !== undefined && isPictureNode({
    node: declaration.type,
    checker
  });
}

function isPictureMember({ member, checker }: {
  member: typescript.Node;
  checker: typescript.TypeChecker;
}): member is typescript.PropertySignature {
  return typescript.isPropertySignature(member)
    && member.type !== undefined
    && isPictureNode({
      node: member.type,
      checker
    });
}

function ownerName(member: typescript.Node) {
  for (let parent = member.parent; !typescript.isSourceFile(parent); parent = parent.parent) {
    const isNamed = typescript.isInterfaceDeclaration(parent) || typescript.isTypeAliasDeclaration(parent);
    if (isNamed) {
      return parent.name.text;
    }
  }

  return undefined;
}

function formsOf({ member, checker }: {
  member: typescript.PropertySignature;
  checker: typescript.TypeChecker;
}) {
  const type = checker.getTypeFromTypeNode(member.type ?? member);
  const parts = type.isUnion() ? type.types : [type];
  const forms = new Set<PictureForm>([PictureForm.STRING]);
  for (const part of parts) {
    const names = part.getProperties().map(property => property.name);
    const isPixels = names.includes(PIXELS_MEMBER);
    const isPair = part.getProperties().some(property => property.declarations?.some(hasTheme) === true);
    if (isPixels) {
      forms.add(PictureForm.PIXELS);
    }

    if (isPair) {
      forms.add(PictureForm.PAIR);
    }
  }

  return [...forms];
}

function themeOf(declaration: typescript.Declaration) {
  const tag = typescript.getJSDocTags(declaration).find(candidate => candidate.tagName.text === THEME_TAG);
  const hasNoTag = tag === undefined;
  const text = hasNoTag ? undefined : typescript.getTextOfJSDocComment(tag.comment)?.trim();
  const isTheme = text === "light" || text === "dark";
  return isTheme ? text : undefined;
}

function hasTheme(declaration: typescript.Declaration) {
  return themeOf(declaration) !== undefined;
}

function sourcesOf(program: typescript.Program) {
  return program.getSourceFiles().filter(source => source.fileName.includes(SOURCE_FOLDER) && !source.isDeclarationFile
    || source.fileName.endsWith(COMPONENT_FILE));
}

function membersOf({ program, checker }: Pick<EntryApi, "program" | "checker">) {
  const found: Array<{
    owner: string;
    member: typescript.PropertySignature;
  }> = [];
  function visit(node: typescript.Node) {
    const isPicture = isPictureMember({
      member: node,
      checker
    });
    const owner = isPicture ? ownerName(node) : undefined;
    const isOwned = isPicture && owner !== undefined;
    if (isOwned) {
      found.push({
        owner,
        member: node
      });
    }

    node.forEachChild(visit);
  }

  for (const source of sourcesOf(program)) {
    visit(source);
  }

  return found;
}

// `declare const Image: Component<ImageProps, ...>` in a .d.svelte.ts: the tag and the type of its props, which
// are the second parameter of the component's call signature.
function componentsOf({ program, checker }: Pick<EntryApi, "program" | "checker">) {
  return program.getSourceFiles().filter(source => source.fileName.endsWith(COMPONENT_FILE)).flatMap(source =>
    source.statements.filter(typescript.isVariableStatement).flatMap(statement =>
      statement.declarationList.declarations.flatMap(declaration => {
        const props = checker.getTypeAtLocation(declaration).getCallSignatures()[0]?.parameters[PROPS_PARAMETER];
        const isComponent = props !== undefined && typescript.isIdentifier(declaration.name);
        return isComponent ? [{
          tag: declaration.name.getText(),
          propsType: checker.getTypeOfSymbolAtLocation(props, declaration)
        }] : [];
      })));
}

/** The members typed `PictureSource`, with the components that take each as a prop. */
export function pictureData({ program, checker }: Pick<EntryApi, "program" | "checker">) {
  const members = membersOf({
    program,
    checker
  });
  const tags = new Map<string, Set<string>>();
  for (const { tag, propsType } of componentsOf({
    program,
    checker
  })) {
    for (const property of checker.getPropertiesOfType(propsType)) {
      const declaration = property.declarations?.find(candidate => isPictureMember({
        member: candidate,
        checker
      }));
      const owner = declaration === undefined ? undefined : ownerName(declaration);
      const isOwned = owner !== undefined;
      if (isOwned) {
        const key = `${owner}.${property.name}`;
        tags.set(key, (tags.get(key) ?? new Set()).add(tag));
      }
    }
  }

  const props = new Map<string, PictureProp>();
  for (const { owner, member } of members) {
    const name = member.name.getText();
    props.set(`${owner}.${name}`, {
      owner,
      name,
      forms: formsOf({
        member,
        checker
      }),
      components: [...tags.get(`${owner}.${name}`) ?? []].toSorted()
    });
  }

  return [...props.values()];
}

/** The keys of a light and dark pair, with the taskbar theme each is for. */
export function pictureVariantData({ program }: Pick<EntryApi, "program">) {
  const found = new Map<string, PictureVariant>();
  function visit(node: typescript.Node) {
    const theme = typescript.isPropertySignature(node) ? themeOf(node) : undefined;
    const isVariant = theme !== undefined && typescript.isPropertySignature(node);
    if (isVariant) {
      found.set(node.name.getText(), {
        name: node.name.getText(),
        theme
      });
    }

    node.forEachChild(visit);
  }

  for (const source of sourcesOf(program)) {
    visit(source);
  }

  return [...found.values()];
}
