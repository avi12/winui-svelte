import { readFileSync } from "node:fs";

// A reader for the ECMA-335 metadata inside a .winmd, enough for the
// generator: types, their interfaces, properties, events, methods and custom
// attributes. dynwinrt-codegen parses the same files, but it is a native
// program that only writes bindings (it has no way to dump what it read), so
// the generator reads the metadata itself.

const DOS_HEADER_PE_OFFSET = 0x3c;
const PE_SIGNATURE_SIZE = 4;
const COFF_HEADER_SIZE = 20;
const COFF_SECTION_COUNT_OFFSET = 2;
const COFF_OPTIONAL_SIZE_OFFSET = 16;
const SECTION_HEADER_SIZE = 40;
const SECTION_VIRTUAL_SIZE_OFFSET = 8;
const SECTION_RVA_OFFSET = 12;
const SECTION_RAW_SIZE_OFFSET = 16;
const SECTION_RAW_POINTER_OFFSET = 20;
const OPTIONAL_HEADER_MAGIC_PE32_PLUS = 0x20b;
const DATA_DIRECTORIES_OFFSET_PE32 = 96;
const DATA_DIRECTORIES_OFFSET_PE32_PLUS = 112;
const DATA_DIRECTORY_SIZE = 8;
const CLI_HEADER_DIRECTORY_INDEX = 14;
const CLI_HEADER_METADATA_RVA_OFFSET = 8;
const METADATA_ROOT_SIGNATURE = 0x424a5342;
const METADATA_VERSION_LENGTH_OFFSET = 12;
const METADATA_VERSION_OFFSET = 16;
const METADATA_STREAM_COUNT_OFFSET = 2;
const STREAM_COUNT_SIZE = 4;
const STREAM_HEADER_FIXED_SIZE = 8;
const STREAM_SIZE_OFFSET = 4;
const STREAM_NAME_ALIGNMENT = 4;
const TABLES_HEAP_SIZES_OFFSET = 6;
const TABLES_VALID_LOW_OFFSET = 8;
const TABLES_VALID_HIGH_OFFSET = 12;
const TABLES_ROW_COUNTS_OFFSET = 24;
const ROW_COUNT_SIZE = 4;
const TABLE_COUNT = 64;
const BITS_PER_WORD = 32;
const WIDE_STRINGS_FLAG = 0x01;
const WIDE_GUIDS_FLAG = 0x02;
const WIDE_BLOBS_FLAG = 0x04;
const SMALL_INDEX_LIMIT = 0x10000;
const SMALL_INDEX_SIZE = 2;
const WIDE_INDEX_SIZE = 4;
const NULL_STRING_MARKER = 0xff;
const BYTE_BITS = 8;
const ONE_BYTE_LENGTH_FLAG = 0x80;
const TWO_BYTE_LENGTH_FLAG = 0x40;
const TWO_BYTE_LENGTH_MASK = 0x3f;
const FOUR_BYTE_LENGTH_MASK = 0x1f;
const TRAILING_LENGTH_BYTES = 3;
const BYTES_PER_INT64 = 8;
const BYTES_PER_INT32 = 4;
const BYTES_PER_INT16 = 2;
const BYTES_PER_INT8 = 1;
const TYPE_DEF_OR_REF_TAG_BITS = 2;
const TYPE_REF_TAG = 1;
const METHOD_GENERIC_CONVENTION = 0x10;
const FIELD_LITERAL = 0x40;
const ATTRIBUTE_PROLOG = 1;
const HEX_RADIX = 16;
const UNKNOWN_TYPE_NAME = "?";
const TABLE_PREFIX = "t:";
const CODED_PREFIX = "c:";

/** The id of each metadata table (ECMA-335 II.22). */
const TABLE_ID = {
  MODULE: 0x00,
  TYPE_REF: 0x01,
  TYPE_DEF: 0x02,
  FIELD_PTR: 0x03,
  FIELD: 0x04,
  METHOD_PTR: 0x05,
  METHOD_DEF: 0x06,
  PARAM_PTR: 0x07,
  PARAM: 0x08,
  INTERFACE_IMPL: 0x09,
  MEMBER_REF: 0x0a,
  CONSTANT: 0x0b,
  CUSTOM_ATTRIBUTE: 0x0c,
  FIELD_MARSHAL: 0x0d,
  DECL_SECURITY: 0x0e,
  CLASS_LAYOUT: 0x0f,
  FIELD_LAYOUT: 0x10,
  STAND_ALONE_SIG: 0x11,
  EVENT_MAP: 0x12,
  EVENT_PTR: 0x13,
  EVENT: 0x14,
  PROPERTY_MAP: 0x15,
  PROPERTY_PTR: 0x16,
  PROPERTY: 0x17,
  METHOD_SEMANTICS: 0x18,
  METHOD_IMPL: 0x19,
  MODULE_REF: 0x1a,
  TYPE_SPEC: 0x1b,
  IMPL_MAP: 0x1c,
  FIELD_RVA: 0x1d,
  ENC_LOG: 0x1e,
  ENC_MAP: 0x1f,
  ASSEMBLY: 0x20,
  ASSEMBLY_PROCESSOR: 0x21,
  ASSEMBLY_OS: 0x22,
  ASSEMBLY_REF: 0x23,
  ASSEMBLY_REF_PROCESSOR: 0x24,
  ASSEMBLY_REF_OS: 0x25,
  FILE: 0x26,
  EXPORTED_TYPE: 0x27,
  MANIFEST_RESOURCE: 0x28,
  NESTED_CLASS: 0x29,
  GENERIC_PARAM: 0x2a,
  METHOD_SPEC: 0x2b,
  GENERIC_PARAM_CONSTRAINT: 0x2c
} as const;

/** The `TypeAttributes` flags the generator reads. */
export const TypeAttribute = {
  INTERFACE: 0x20,
  ABSTRACT: 0x80,
  SEALED: 0x100
} as const;

const METHOD_ATTRIBUTE_STATIC = 0x10;

const METHOD_SEMANTIC = {
  SETTER: 0x01,
  GETTER: 0x02
} as const;

/** The element type codes a signature blob uses (ECMA-335 II.23.1.16). */
const ELEMENT_TYPE = {
  VOID: 0x01,
  BOOLEAN: 0x02,
  CHAR: 0x03,
  SBYTE: 0x04,
  BYTE: 0x05,
  INT16: 0x06,
  UINT16: 0x07,
  INT32: 0x08,
  UINT32: 0x09,
  INT64: 0x0a,
  UINT64: 0x0b,
  SINGLE: 0x0c,
  DOUBLE: 0x0d,
  STRING: 0x0e,
  BY_REFERENCE: 0x10,
  VALUE_TYPE: 0x11,
  CLASS: 0x12,
  VARIABLE: 0x13,
  GENERIC_INSTANCE: 0x15,
  INT_PTR: 0x18,
  UINT_PTR: 0x19,
  OBJECT: 0x1c,
  SZ_ARRAY: 0x1d,
  METHOD_VARIABLE: 0x1e,
  REQUIRED_MODIFIER: 0x1f,
  OPTIONAL_MODIFIER: 0x20
} as const;

/** The type tags before a custom attribute's named argument. */
const SERIALIZATION_TAG = {
  BOOLEAN: 0x02,
  STRING: 0x0e,
  SYSTEM_TYPE: 0x50,
  ENUM: 0x55
} as const;

const PRIMITIVE_NAMES = new Map<number, string>([
  [ELEMENT_TYPE.VOID, "Void"],
  [ELEMENT_TYPE.BOOLEAN, "Boolean"],
  [ELEMENT_TYPE.CHAR, "Char"],
  [ELEMENT_TYPE.SBYTE, "SByte"],
  [ELEMENT_TYPE.BYTE, "Byte"],
  [ELEMENT_TYPE.INT16, "Int16"],
  [ELEMENT_TYPE.UINT16, "UInt16"],
  [ELEMENT_TYPE.INT32, "Int32"],
  [ELEMENT_TYPE.UINT32, "UInt32"],
  [ELEMENT_TYPE.INT64, "Int64"],
  [ELEMENT_TYPE.UINT64, "UInt64"],
  [ELEMENT_TYPE.SINGLE, "Single"],
  [ELEMENT_TYPE.DOUBLE, "Double"],
  [ELEMENT_TYPE.STRING, "String"],
  [ELEMENT_TYPE.INT_PTR, "IntPtr"],
  [ELEMENT_TYPE.UINT_PTR, "UIntPtr"],
  [ELEMENT_TYPE.OBJECT, "Object"]
]);

const PRIMITIVE_WIDTHS = new Map<string, number>([
  ["Boolean", BYTES_PER_INT8],
  ["Byte", BYTES_PER_INT8],
  ["SByte", BYTES_PER_INT8],
  ["Int16", BYTES_PER_INT16],
  ["UInt16", BYTES_PER_INT16],
  ["Int32", BYTES_PER_INT32],
  ["UInt32", BYTES_PER_INT32],
  ["Int64", BYTES_PER_INT64],
  ["UInt64", BYTES_PER_INT64]
]);

type ColumnKind = string;

// A column is a fixed width in bytes, a heap index, a plain index into
// another table (`t:<id>`) or a coded index (`c:<name>`).
const WORD = String(BYTES_PER_INT16);
const DWORD = String(BYTES_PER_INT32);
const STRING_HEAP = "str";
const GUID_HEAP = "guid";
const BLOB_HEAP = "blob";

function tableIndex(table: number) {
  return `${TABLE_PREFIX}${table}`;
}

function codedIndex(name: string) {
  return `${CODED_PREFIX}${name}`;
}

const TABLE_COLUMNS = new Map<number, ColumnKind[]>([
  [TABLE_ID.MODULE, [WORD, STRING_HEAP, GUID_HEAP, GUID_HEAP, GUID_HEAP]],
  [TABLE_ID.TYPE_REF, [codedIndex("ResolutionScope"), STRING_HEAP, STRING_HEAP]],
  [TABLE_ID.TYPE_DEF, [DWORD, STRING_HEAP, STRING_HEAP, codedIndex("TypeDefOrRef"), tableIndex(TABLE_ID.FIELD), tableIndex(TABLE_ID.METHOD_DEF)]],
  [TABLE_ID.FIELD_PTR, [tableIndex(TABLE_ID.FIELD)]],
  [TABLE_ID.FIELD, [WORD, STRING_HEAP, BLOB_HEAP]],
  [TABLE_ID.METHOD_PTR, [tableIndex(TABLE_ID.METHOD_DEF)]],
  [TABLE_ID.METHOD_DEF, [DWORD, WORD, WORD, STRING_HEAP, BLOB_HEAP, tableIndex(TABLE_ID.PARAM)]],
  [TABLE_ID.PARAM_PTR, [tableIndex(TABLE_ID.PARAM)]],
  [TABLE_ID.PARAM, [WORD, WORD, STRING_HEAP]],
  [TABLE_ID.INTERFACE_IMPL, [tableIndex(TABLE_ID.TYPE_DEF), codedIndex("TypeDefOrRef")]],
  [TABLE_ID.MEMBER_REF, [codedIndex("MemberRefParent"), STRING_HEAP, BLOB_HEAP]],
  [TABLE_ID.CONSTANT, [WORD, codedIndex("HasConstant"), BLOB_HEAP]],
  [TABLE_ID.CUSTOM_ATTRIBUTE, [codedIndex("HasCustomAttribute"), codedIndex("CustomAttributeType"), BLOB_HEAP]],
  [TABLE_ID.FIELD_MARSHAL, [codedIndex("HasFieldMarshal"), BLOB_HEAP]],
  [TABLE_ID.DECL_SECURITY, [WORD, codedIndex("HasDeclSecurity"), BLOB_HEAP]],
  [TABLE_ID.CLASS_LAYOUT, [WORD, DWORD, tableIndex(TABLE_ID.TYPE_DEF)]],
  [TABLE_ID.FIELD_LAYOUT, [DWORD, tableIndex(TABLE_ID.FIELD)]],
  [TABLE_ID.STAND_ALONE_SIG, [BLOB_HEAP]],
  [TABLE_ID.EVENT_MAP, [tableIndex(TABLE_ID.TYPE_DEF), tableIndex(TABLE_ID.EVENT)]],
  [TABLE_ID.EVENT_PTR, [tableIndex(TABLE_ID.EVENT)]],
  [TABLE_ID.EVENT, [WORD, STRING_HEAP, codedIndex("TypeDefOrRef")]],
  [TABLE_ID.PROPERTY_MAP, [tableIndex(TABLE_ID.TYPE_DEF), tableIndex(TABLE_ID.PROPERTY)]],
  [TABLE_ID.PROPERTY_PTR, [tableIndex(TABLE_ID.PROPERTY)]],
  [TABLE_ID.PROPERTY, [WORD, STRING_HEAP, BLOB_HEAP]],
  [TABLE_ID.METHOD_SEMANTICS, [WORD, tableIndex(TABLE_ID.METHOD_DEF), codedIndex("HasSemantics")]],
  [TABLE_ID.METHOD_IMPL, [tableIndex(TABLE_ID.TYPE_DEF), codedIndex("MethodDefOrRef"), codedIndex("MethodDefOrRef")]],
  [TABLE_ID.MODULE_REF, [STRING_HEAP]],
  [TABLE_ID.TYPE_SPEC, [BLOB_HEAP]],
  [TABLE_ID.IMPL_MAP, [WORD, codedIndex("MemberForwarded"), STRING_HEAP, tableIndex(TABLE_ID.MODULE_REF)]],
  [TABLE_ID.FIELD_RVA, [DWORD, tableIndex(TABLE_ID.FIELD)]],
  [TABLE_ID.ENC_LOG, [DWORD, DWORD]],
  [TABLE_ID.ENC_MAP, [DWORD]],
  [TABLE_ID.ASSEMBLY, [DWORD, WORD, WORD, WORD, WORD, DWORD, BLOB_HEAP, STRING_HEAP, STRING_HEAP]],
  [TABLE_ID.ASSEMBLY_PROCESSOR, [DWORD]],
  [TABLE_ID.ASSEMBLY_OS, [DWORD, DWORD, DWORD]],
  [TABLE_ID.ASSEMBLY_REF, [WORD, WORD, WORD, WORD, DWORD, BLOB_HEAP, STRING_HEAP, STRING_HEAP, BLOB_HEAP]],
  [TABLE_ID.ASSEMBLY_REF_PROCESSOR, [DWORD, tableIndex(TABLE_ID.ASSEMBLY_REF)]],
  [TABLE_ID.ASSEMBLY_REF_OS, [DWORD, DWORD, DWORD, tableIndex(TABLE_ID.ASSEMBLY_REF)]],
  [TABLE_ID.FILE, [DWORD, STRING_HEAP, BLOB_HEAP]],
  [TABLE_ID.EXPORTED_TYPE, [DWORD, DWORD, STRING_HEAP, STRING_HEAP, codedIndex("Implementation")]],
  [TABLE_ID.MANIFEST_RESOURCE, [DWORD, DWORD, STRING_HEAP, codedIndex("Implementation")]],
  [TABLE_ID.NESTED_CLASS, [tableIndex(TABLE_ID.TYPE_DEF), tableIndex(TABLE_ID.TYPE_DEF)]],
  [TABLE_ID.GENERIC_PARAM, [WORD, WORD, codedIndex("TypeOrMethodDef"), STRING_HEAP]],
  [TABLE_ID.METHOD_SPEC, [codedIndex("MethodDefOrRef"), BLOB_HEAP]],
  [TABLE_ID.GENERIC_PARAM_CONSTRAINT, [tableIndex(TABLE_ID.GENERIC_PARAM), codedIndex("TypeDefOrRef")]]
]);

// The tables a coded index can point into, in tag order (ECMA-335 II.24.2.6).
const CODED_INDEX_TABLES = new Map<string, Array<number | null>>([
  ["TypeDefOrRef", [TABLE_ID.TYPE_DEF, TABLE_ID.TYPE_REF, TABLE_ID.TYPE_SPEC]],
  ["HasConstant", [TABLE_ID.FIELD, TABLE_ID.PARAM, TABLE_ID.PROPERTY]],
  ["HasCustomAttribute", [
    TABLE_ID.METHOD_DEF,
    TABLE_ID.FIELD,
    TABLE_ID.TYPE_REF,
    TABLE_ID.TYPE_DEF,
    TABLE_ID.PARAM,
    TABLE_ID.INTERFACE_IMPL,
    TABLE_ID.MEMBER_REF,
    TABLE_ID.MODULE,
    TABLE_ID.DECL_SECURITY,
    TABLE_ID.PROPERTY,
    TABLE_ID.EVENT,
    TABLE_ID.STAND_ALONE_SIG,
    TABLE_ID.MODULE_REF,
    TABLE_ID.TYPE_SPEC,
    TABLE_ID.ASSEMBLY,
    TABLE_ID.ASSEMBLY_REF,
    TABLE_ID.FILE,
    TABLE_ID.EXPORTED_TYPE,
    TABLE_ID.MANIFEST_RESOURCE,
    TABLE_ID.GENERIC_PARAM,
    TABLE_ID.GENERIC_PARAM_CONSTRAINT,
    TABLE_ID.METHOD_SPEC
  ]],
  ["HasFieldMarshal", [TABLE_ID.FIELD, TABLE_ID.PARAM]],
  ["HasDeclSecurity", [TABLE_ID.TYPE_DEF, TABLE_ID.METHOD_DEF, TABLE_ID.ASSEMBLY]],
  ["MemberRefParent", [TABLE_ID.TYPE_DEF, TABLE_ID.TYPE_REF, TABLE_ID.MODULE_REF, TABLE_ID.METHOD_DEF, TABLE_ID.TYPE_SPEC]],
  ["HasSemantics", [TABLE_ID.EVENT, TABLE_ID.PROPERTY]],
  ["MethodDefOrRef", [TABLE_ID.METHOD_DEF, TABLE_ID.MEMBER_REF]],
  ["MemberForwarded", [TABLE_ID.FIELD, TABLE_ID.METHOD_DEF]],
  ["Implementation", [TABLE_ID.FILE, TABLE_ID.ASSEMBLY_REF, TABLE_ID.EXPORTED_TYPE]],
  ["CustomAttributeType", [null, null, TABLE_ID.METHOD_DEF, TABLE_ID.MEMBER_REF, null]],
  ["ResolutionScope", [TABLE_ID.MODULE, TABLE_ID.MODULE_REF, TABLE_ID.ASSEMBLY_REF, TABLE_ID.TYPE_REF]],
  ["TypeOrMethodDef", [TABLE_ID.TYPE_DEF, TABLE_ID.METHOD_DEF]]
]);

/** A type's namespace and name. */
export interface TypeName {
  namespace: string;
  name: string;
}

/** A type as a signature writes it. */
export type TypeSignature =
  | {
    kind: "primitive";
    name: string;
  }
  | {
    kind: "named";
    type: TypeName;
    isValueType: boolean;
  }
  | {
    kind: "generic";
    type: TypeName;
    args: TypeSignature[];
  }
  | {
    kind: "array";
    element: TypeSignature;
  }
  | {
    kind: "parameter";
    index: number;
  };

/** A property of a type, with the accessors it has. */
export interface PropertyInfo {
  name: string;
  type: TypeSignature;
  hasGetter: boolean;
  hasSetter: boolean;
}

/** An event of a type. */
export interface EventInfo {
  name: string;
  /** The delegate type the event raises: a named delegate, or a generic instance (`TypedEventHandler<A, B>`). */
  handler: TypeSignature | null;
}

/** A method of a type with its signature. */
export interface MethodInfo {
  name: string;
  isStatic: boolean;
  parameters: Array<{
    name: string;
    type: TypeSignature;
  }>;
  returns: TypeSignature;
}

/** What an attribute argument holds: a string or type name, or an integer. */
export type AttributeValue = string | number | null;

/** A custom attribute applied to a type or an interface. */
export interface AttributeInfo {
  type: TypeName;
  fixed: AttributeValue[];
  named: Map<string, AttributeValue>;
}

/** An interface a type implements, with the attributes on that implementation. */
export interface InterfaceReference {
  // Null for a generic instance (IVector<UIElement>), which `signature` spells.
  type: TypeName | null;
  signature: TypeSignature | null;
  attributes: AttributeInfo[];
}

/** A type read from a .winmd. */
export interface TypeInfo {
  namespace: string;
  name: string;
  flags: number;
  base: TypeName | null;
  interfaces: InterfaceReference[];
  properties: PropertyInfo[];
  events: EventInfo[];
  methods: MethodInfo[];
  enumMembers: Array<{
    name: string;
    value: number;
  }>;
  attributes: AttributeInfo[];
}

/** The dotted name of a type. */
export function fullName(type: TypeName) {
  return `${type.namespace}.${type.name}`;
}

interface TableData {
  rowCount: number;
  rowSize: number;
  offset: number;
  columnSizes: number[];
}

// What the type definitions of one file are read through.
interface TypeLookups {
  byParent: Map<string, AttributeInfo[]>;
  propertyRanges: Map<number, [number, number]>;
  eventRanges: Map<number, [number, number]>;
  semantics: Map<string, number>;
  interfaces: Map<number, InterfaceReference[]>;
}

class BlobReader {
  readonly bytes: Uint8Array;
  position: number;

  constructor(bytes: Uint8Array, position = 0) {
    this.bytes = bytes;
    this.position = position;
  }

  get isDone() {
    return this.position >= this.bytes.length;
  }

  byte() {
    const value = this.bytes[this.position] ?? 0;
    this.position++;
    return value;
  }

  // A length or count: 1, 2 or 4 bytes, by the leading bits of the first.
  compressed() {
    const first = this.byte();
    const isOneByte = (first & ONE_BYTE_LENGTH_FLAG) === 0;
    if (isOneByte) {
      return first;
    }

    const isTwoBytes = (first & TWO_BYTE_LENGTH_FLAG) === 0;
    if (isTwoBytes) {
      return ((first & TWO_BYTE_LENGTH_MASK) << BYTE_BITS) | this.byte();
    }

    let value = first & FOUR_BYTE_LENGTH_MASK;
    for (let index = 0; index < TRAILING_LENGTH_BYTES; index++) {
      value = (value << BYTE_BITS) | this.byte();
    }

    return value;
  }

  integer(width: number) {
    let value = 0;
    for (let index = 0; index < width; index++) {
      value += this.byte() * 2 ** (BYTE_BITS * index);
    }

    return value;
  }

  text() {
    const isNull = this.bytes[this.position] === NULL_STRING_MARKER;
    if (isNull) {
      this.position++;
      return null;
    }

    const length = this.compressed();
    const text = Buffer.from(this.bytes.subarray(this.position, this.position + length)).toString("utf8");
    this.position += length;
    return text;
  }
}

/** A .winmd read into its types. */
export class WinMdFile {
  readonly types: TypeInfo[] = [];
  private readonly buffer: Buffer;
  private readonly tables = new Map<number, TableData>();
  private readonly strings: Buffer;
  private readonly blobs: Buffer;
  private readonly hasWideStrings: boolean;
  private readonly hasWideBlobs: boolean;
  private readonly hasWideGuids: boolean;
  private readonly rowCounts = new Map<number, number>();
  private metadataOffset = 0;
  private fieldConstants: Map<number, number> | null = null;

  constructor(filePath: string) {
    this.buffer = readFileSync(filePath);
    const root = this.locateMetadata();
    const streams = this.readStreams(root);
    const tables = streams.get("#~");
    const strings = streams.get("#Strings");
    const blobs = streams.get("#Blob");
    const hasAllStreams = tables !== undefined && strings !== undefined && blobs !== undefined;
    if (!hasAllStreams) {
      throw new Error(`${filePath} is missing a metadata stream`);
    }

    this.strings = this.buffer.subarray(strings.offset, strings.offset + strings.size);
    this.blobs = this.buffer.subarray(blobs.offset, blobs.offset + blobs.size);
    const heapSizes = this.buffer.readUInt8(tables.offset + TABLES_HEAP_SIZES_OFFSET);
    this.hasWideStrings = (heapSizes & WIDE_STRINGS_FLAG) !== 0;
    this.hasWideGuids = (heapSizes & WIDE_GUIDS_FLAG) !== 0;
    this.hasWideBlobs = (heapSizes & WIDE_BLOBS_FLAG) !== 0;
    this.layOutTables(tables.offset);
    this.readTypes();
  }

  private locateMetadata() {
    const peOffset = this.buffer.readUInt32LE(DOS_HEADER_PE_OFFSET);
    const coffOffset = peOffset + PE_SIGNATURE_SIZE;
    const sectionCount = this.buffer.readUInt16LE(coffOffset + COFF_SECTION_COUNT_OFFSET);
    const optionalSize = this.buffer.readUInt16LE(coffOffset + COFF_OPTIONAL_SIZE_OFFSET);
    const optionalOffset = coffOffset + COFF_HEADER_SIZE;
    const isPe32Plus = this.buffer.readUInt16LE(optionalOffset) === OPTIONAL_HEADER_MAGIC_PE32_PLUS;
    const directoriesOffset = optionalOffset
      + (isPe32Plus ? DATA_DIRECTORIES_OFFSET_PE32_PLUS : DATA_DIRECTORIES_OFFSET_PE32);
    const cliRva = this.buffer.readUInt32LE(directoriesOffset + CLI_HEADER_DIRECTORY_INDEX * DATA_DIRECTORY_SIZE);
    const sectionsOffset = optionalOffset + optionalSize;
    const sections: Array<{
      rva: number;
      size: number;
      raw: number;
    }> = [];
    for (let index = 0; index < sectionCount; index++) {
      const headerOffset = sectionsOffset + index * SECTION_HEADER_SIZE;
      sections.push({
        rva: this.buffer.readUInt32LE(headerOffset + SECTION_RVA_OFFSET),
        size: Math.max(
          this.buffer.readUInt32LE(headerOffset + SECTION_VIRTUAL_SIZE_OFFSET),
          this.buffer.readUInt32LE(headerOffset + SECTION_RAW_SIZE_OFFSET)
        ),
        raw: this.buffer.readUInt32LE(headerOffset + SECTION_RAW_POINTER_OFFSET)
      });
    }

    function toOffset(rva: number) {
      const section = sections.find(candidate => rva >= candidate.rva && rva < candidate.rva + candidate.size);
      const isInSection = section !== undefined;
      if (!isInSection) {
        throw new Error(`RVA ${rva} is in no section`);
      }

      return section.raw + (rva - section.rva);
    }

    const cliOffset = toOffset(cliRva);
    this.metadataOffset = toOffset(this.buffer.readUInt32LE(cliOffset + CLI_HEADER_METADATA_RVA_OFFSET));
    return this.metadataOffset;
  }

  private readStreams(root: number) {
    const isMetadataRoot = this.buffer.readUInt32LE(root) === METADATA_ROOT_SIGNATURE;
    if (!isMetadataRoot) {
      throw new Error("not a metadata root");
    }

    const versionLength = this.buffer.readUInt32LE(root + METADATA_VERSION_LENGTH_OFFSET);
    const versionEnd = root + METADATA_VERSION_OFFSET + versionLength;
    const streamCount = this.buffer.readUInt16LE(versionEnd + METADATA_STREAM_COUNT_OFFSET);
    let cursor = versionEnd + STREAM_COUNT_SIZE;
    const streams = new Map<string, {
      offset: number;
      size: number;
    }>();
    for (let index = 0; index < streamCount; index++) {
      const offset = this.buffer.readUInt32LE(cursor);
      const size = this.buffer.readUInt32LE(cursor + STREAM_SIZE_OFFSET);
      const nameStart = cursor + STREAM_HEADER_FIXED_SIZE;
      let nameEnd = nameStart;
      while (this.buffer[nameEnd] !== 0) {
        nameEnd++;
      }

      const name = this.buffer.toString("ascii", nameStart, nameEnd);
      streams.set(name, {
        offset: root + offset,
        size
      });
      const nameBytes = nameEnd - nameStart + 1;
      cursor += STREAM_HEADER_FIXED_SIZE + Math.ceil(nameBytes / STREAM_NAME_ALIGNMENT) * STREAM_NAME_ALIGNMENT;
    }

    return streams;
  }

  private layOutTables(start: number) {
    const validLow = this.buffer.readUInt32LE(start + TABLES_VALID_LOW_OFFSET);
    const validHigh = this.buffer.readUInt32LE(start + TABLES_VALID_HIGH_OFFSET);
    let cursor = start + TABLES_ROW_COUNTS_OFFSET;
    for (let id = 0; id < TABLE_COUNT; id++) {
      const word = id < BITS_PER_WORD ? validLow : validHigh;
      const isPresent = ((word >>> id % BITS_PER_WORD) & 1) === 1;
      if (isPresent) {
        this.rowCounts.set(id, this.buffer.readUInt32LE(cursor));
        cursor += ROW_COUNT_SIZE;
      }
    }

    for (let id = 0; id < TABLE_COUNT; id++) {
      const rowCount = this.rowCounts.get(id);
      const columns = TABLE_COLUMNS.get(id);
      const isUnsupported = rowCount !== undefined && columns === undefined;
      if (isUnsupported) {
        throw new Error(`metadata table ${id} is not supported`);
      }

      const isSupported = rowCount !== undefined && columns !== undefined;
      if (isSupported) {
        const columnSizes = columns.map(column => this.columnSize(column));
        let rowSize = 0;
        for (const size of columnSizes) {
          rowSize += size;
        }

        this.tables.set(id, {
          rowCount,
          rowSize,
          offset: cursor,
          columnSizes
        });
        cursor += rowCount * rowSize;
      }
    }
  }

  private tableIndexSize(table: number) {
    const rows = this.rowCounts.get(table) ?? 0;
    return rows < SMALL_INDEX_LIMIT ? SMALL_INDEX_SIZE : WIDE_INDEX_SIZE;
  }

  private codedIndexSize(name: string) {
    const targets = CODED_INDEX_TABLES.get(name) ?? [];
    const tagBits = Math.ceil(Math.log2(targets.length));
    const largest = Math.max(...targets.map(target => target === null ? 0 : this.rowCounts.get(target) ?? 0));
    return largest < SMALL_INDEX_LIMIT >> tagBits ? SMALL_INDEX_SIZE : WIDE_INDEX_SIZE;
  }

  private columnSize(column: ColumnKind) {
    const isHeapWide = new Map([
      [STRING_HEAP, this.hasWideStrings],
      [GUID_HEAP, this.hasWideGuids],
      [BLOB_HEAP, this.hasWideBlobs]
    ]).get(column);
    const isHeap = isHeapWide !== undefined;
    if (isHeap) {
      return isHeapWide ? WIDE_INDEX_SIZE : SMALL_INDEX_SIZE;
    }

    const isTableIndex = column.startsWith(TABLE_PREFIX);
    if (isTableIndex) {
      return this.tableIndexSize(Number(column.slice(TABLE_PREFIX.length)));
    }

    const isCodedIndex = column.startsWith(CODED_PREFIX);
    if (isCodedIndex) {
      return this.codedIndexSize(column.slice(CODED_PREFIX.length));
    }

    return Number(column);
  }

  /** The number of rows in a table. */
  rowCount(table: number) {
    return this.rowCounts.get(table) ?? 0;
  }

  /** One cell of a 1-based row. */
  cell({ table, row, column }: {
    table: number;
    row: number;
    column: number;
  }) {
    const data = this.tables.get(table);
    const hasTable = data !== undefined;
    if (!hasTable) {
      return 0;
    }

    let cellOffset = data.offset + (row - 1) * data.rowSize;
    for (let index = 0; index < column; index++) {
      cellOffset += data.columnSizes[index] ?? 0;
    }

    const width = data.columnSizes[column] ?? 0;
    const isSmall = width === SMALL_INDEX_SIZE;
    return isSmall ? this.buffer.readUInt16LE(cellOffset) : this.buffer.readUInt32LE(cellOffset);
  }

  /** A string from the strings heap. */
  string(index: number) {
    let end = index;
    while (this.strings[end] !== 0) {
      end++;
    }

    return this.strings.toString("utf8", index, end);
  }

  /** A reader over one blob of the blob heap. */
  blob(index: number) {
    const reader = new BlobReader(this.blobs, index);
    const length = reader.compressed();
    return new BlobReader(this.blobs.subarray(reader.position, reader.position + length));
  }

  /** A coded index as its table and 1-based row. */
  decode({ coded, value }: {
    coded: string;
    value: number;
  }) {
    const targets = CODED_INDEX_TABLES.get(coded) ?? [];
    const tagBits = Math.ceil(Math.log2(targets.length));
    const tag = value & ((1 << tagBits) - 1);
    return {
      table: targets[tag] ?? null,
      row: value >>> tagBits
    };
  }

  /** The name a TypeDefOrRef coded index points at, or null when it is none. */
  typeNameOf(coded: number) {
    const { table, row } = this.decode({
      coded: "TypeDefOrRef",
      value: coded
    });
    const isNone = row === 0;
    if (isNone) {
      return null;
    }

    const isTypeDefinition = table === TABLE_ID.TYPE_DEF;
    if (isTypeDefinition) {
      return {
        namespace: this.string(
          this.cell({
            table: TABLE_ID.TYPE_DEF,
            row,
            column: 2
          })
        ),
        name: this.string(
          this.cell({
            table: TABLE_ID.TYPE_DEF,
            row,
            column: 1
          })
        )
      };
    }

    const isTypeReference = table === TABLE_ID.TYPE_REF;
    if (isTypeReference) {
      return {
        namespace: this.string(
          this.cell({
            table: TABLE_ID.TYPE_REF,
            row,
            column: 2
          })
        ),
        name: this.string(
          this.cell({
            table: TABLE_ID.TYPE_REF,
            row,
            column: 1
          })
        )
      };
    }

    return null;
  }

  /** The type a TypeDefOrRef coded index points at, a generic instance included. */
  typeSignatureOf(coded: number) {
    const { table, row } = this.decode({
      coded: "TypeDefOrRef",
      value: coded
    });
    const isSpecification = table === TABLE_ID.TYPE_SPEC && row !== 0;
    if (isSpecification) {
      return this.readType(
        this.blob(
          this.cell({
            table: TABLE_ID.TYPE_SPEC,
            row,
            column: 0
          })
        )
      );
    }

    const type = this.typeNameOf(coded);
    return type === null ? null : {
      kind: "named" as const,
      type,
      isValueType: false
    };
  }

  private readType(reader: BlobReader): TypeSignature {
    const element = reader.byte();
    const primitive = PRIMITIVE_NAMES.get(element);
    const isPrimitive = primitive !== undefined;
    if (isPrimitive) {
      return {
        kind: "primitive",
        name: primitive
      };
    }

    const isValueType = element === ELEMENT_TYPE.VALUE_TYPE;
    const isClass = element === ELEMENT_TYPE.CLASS;
    const isNamedType = isValueType || isClass;
    if (isNamedType) {
      const type = this.typeNameOf(reader.compressed());
      return {
        kind: "named",
        type: type ?? {
          namespace: "",
          name: UNKNOWN_TYPE_NAME
        },
        isValueType
      };
    }

    const isGenericInstance = element === ELEMENT_TYPE.GENERIC_INSTANCE;
    if (isGenericInstance) {
      reader.byte();
      const type = this.typeNameOf(reader.compressed()) ?? {
        namespace: "",
        name: UNKNOWN_TYPE_NAME
      };
      const count = reader.compressed();
      const args: TypeSignature[] = [];
      for (let index = 0; index < count; index++) {
        args.push(this.readType(reader));
      }

      return {
        kind: "generic",
        type,
        args
      };
    }

    const isArray = element === ELEMENT_TYPE.SZ_ARRAY;
    if (isArray) {
      return {
        kind: "array",
        element: this.readType(reader)
      };
    }

    const isParameter = element === ELEMENT_TYPE.VARIABLE || element === ELEMENT_TYPE.METHOD_VARIABLE;
    if (isParameter) {
      return {
        kind: "parameter",
        index: reader.compressed()
      };
    }

    const isByReference = element === ELEMENT_TYPE.BY_REFERENCE;
    if (isByReference) {
      return this.readType(reader);
    }

    const isModifier = element === ELEMENT_TYPE.REQUIRED_MODIFIER || element === ELEMENT_TYPE.OPTIONAL_MODIFIER;
    if (isModifier) {
      reader.compressed();
      return this.readType(reader);
    }

    throw new Error(`signature element 0x${element.toString(HEX_RADIX)} is not supported`);
  }

  private readProperty(row: number) {
    const reader = this.blob(
      this.cell({
        table: TABLE_ID.PROPERTY,
        row,
        column: 2
      })
    );
    reader.byte();
    const parameterCount = reader.compressed();
    const type = this.readType(reader);
    for (let index = 0; index < parameterCount; index++) {
      this.readType(reader);
    }

    return {
      name: this.string(
        this.cell({
          table: TABLE_ID.PROPERTY,
          row,
          column: 1
        })
      ),
      type,
      hasGetter: false,
      hasSetter: false
    };
  }

  private readMethod(row: number) {
    const reader = this.blob(
      this.cell({
        table: TABLE_ID.METHOD_DEF,
        row,
        column: 4
      })
    );
    const convention = reader.byte();
    const hasGenericParameters = (convention & METHOD_GENERIC_CONVENTION) !== 0;
    if (hasGenericParameters) {
      reader.compressed();
    }

    const parameterCount = reader.compressed();
    const returns = this.readType(reader);
    const firstParameter = this.cell({
      table: TABLE_ID.METHOD_DEF,
      row,
      column: 5
    });
    const parameters: MethodInfo["parameters"] = [];
    for (let index = 0; index < parameterCount; index++) {
      const type = this.readType(reader);
      const parameterRow = firstParameter + index;
      const isDescribed = parameterRow <= this.rowCount(TABLE_ID.PARAM);
      const name = isDescribed
        ? this.string(
          this.cell({
            table: TABLE_ID.PARAM,
            row: parameterRow,
            column: 2
          })
        )
        : "";
      parameters.push({
        name,
        type
      });
    }

    const flags = this.cell({
      table: TABLE_ID.METHOD_DEF,
      row,
      column: 2
    });
    return {
      name: this.string(
        this.cell({
          table: TABLE_ID.METHOD_DEF,
          row,
          column: 3
        })
      ),
      isStatic: (flags & METHOD_ATTRIBUTE_STATIC) !== 0,
      parameters,
      returns
    };
  }

  private attributeValue({ reader, type }: {
    reader: BlobReader;
    type: TypeSignature;
  }) {
    const isPrimitive = type.kind === "primitive";
    if (isPrimitive) {
      const isString = type.name === "String";
      if (isString) {
        return reader.text();
      }

      const width = PRIMITIVE_WIDTHS.get(type.name);
      const hasWidth = width !== undefined;
      if (hasWidth) {
        return reader.integer(width);
      }
    }

    const isNamed = type.kind === "named";
    const isSystemType = isNamed && type.type.name === "Type";
    if (isSystemType) {
      return reader.text();
    }

    if (isNamed) {
      return reader.integer(BYTES_PER_INT32);
    }

    throw new Error("an attribute argument of this type is not supported");
  }

  // The attribute's class and the blob of its constructor's signature; null
  // for an attribute whose constructor is in this file or whose class is not
  // among the types read.
  private attributeConstructor(row: number) {
    const { table, row: constructorRow } = this.decode({
      coded: "CustomAttributeType",
      value: this.cell({
        table: TABLE_ID.CUSTOM_ATTRIBUTE,
        row,
        column: 1
      })
    });
    let typeCoded = 0;
    let signatureIndex = 0;
    const isMemberReference = table === TABLE_ID.MEMBER_REF;
    const isMethodDefinition = table === TABLE_ID.METHOD_DEF;
    if (isMemberReference) {
      const parent = this.decode({
        coded: "MemberRefParent",
        value: this.cell({
          table: TABLE_ID.MEMBER_REF,
          row: constructorRow,
          column: 0
        })
      });
      const isTypeReference = parent.table === TABLE_ID.TYPE_REF;
      const parentTag = isTypeReference ? TYPE_REF_TAG : 0;
      typeCoded = (parent.row << TYPE_DEF_OR_REF_TAG_BITS) | parentTag;
      signatureIndex = this.cell({
        table: TABLE_ID.MEMBER_REF,
        row: constructorRow,
        column: 2
      });
    } else if (isMethodDefinition) {
      return null;
    }

    const type = this.typeNameOf(typeCoded);
    const hasType = type !== null;
    if (!hasType) {
      return null;
    }

    return {
      type,
      signatureIndex
    };
  }

  private constructorParameters(signatureIndex: number) {
    const signature = this.blob(signatureIndex);
    signature.byte();
    const parameterCount = signature.compressed();
    signature.compressed();
    const parameterTypes: TypeSignature[] = [];
    for (let index = 0; index < parameterCount; index++) {
      parameterTypes.push(this.readType(signature));
    }

    return parameterTypes;
  }

  // The type of a named argument, from the serialization tag before its name.
  private namedArgumentType(tag: number) {
    const isString = tag === SERIALIZATION_TAG.STRING || tag === SERIALIZATION_TAG.SYSTEM_TYPE;
    const primitive = tag === SERIALIZATION_TAG.BOOLEAN ? "Boolean" : "Int32";
    return {
      kind: "primitive" as const,
      name: isString ? "String" : primitive
    };
  }

  private readNamedArguments({ value, named }: {
    value: BlobReader;
    named: Map<string, AttributeValue>;
  }) {
    const namedCount = value.integer(BYTES_PER_INT16);
    for (let index = 0; index < namedCount; index++) {
      value.byte();
      const tag = value.byte();
      const isEnum = tag === SERIALIZATION_TAG.ENUM;
      if (isEnum) {
        value.text();
      }

      const name = value.text() ?? "";
      named.set(
        name, this.attributeValue({
          reader: value,
          type: this.namedArgumentType(tag)
        })
      );
    }
  }

  private readAttribute(row: number) {
    const constructed = this.attributeConstructor(row);
    const hasConstructor = constructed !== null;
    if (!hasConstructor) {
      return null;
    }

    const parameterTypes = this.constructorParameters(constructed.signatureIndex);
    const value = this.blob(
      this.cell({
        table: TABLE_ID.CUSTOM_ATTRIBUTE,
        row,
        column: 2
      })
    );
    const prolog = value.integer(BYTES_PER_INT16);
    const hasProlog = prolog === ATTRIBUTE_PROLOG;
    const fixed: AttributeValue[] = [];
    const named = new Map<string, AttributeValue>();
    if (hasProlog) {
      try {
        for (const parameterType of parameterTypes) {
          fixed.push(
            this.attributeValue({
              reader: value,
              type: parameterType
            })
          );
        }

        this.readNamedArguments({
          value,
          named
        });
      } catch {
        // An argument this reader does not decode: the attributes the generator
        // reads have only strings, types and integers.
      }
    }

    return {
      type: constructed.type,
      fixed,
      named
    };
  }

  private attributesOf({ table, row, byParent }: {
    table: number;
    row: number;
    byParent: Map<string, AttributeInfo[]>;
  }) {
    return byParent.get(`${table}:${row}`) ?? [];
  }

  private groupAttributes() {
    const byParent = new Map<string, AttributeInfo[]>();
    const tagged = CODED_INDEX_TABLES.get("HasCustomAttribute") ?? [];
    for (let row = 1; row <= this.rowCount(TABLE_ID.CUSTOM_ATTRIBUTE); row++) {
      const parent = this.decode({
        coded: "HasCustomAttribute",
        value: this.cell({
          table: TABLE_ID.CUSTOM_ATTRIBUTE,
          row,
          column: 0
        })
      });
      const isOfInterest = parent.table === TABLE_ID.TYPE_DEF || parent.table === TABLE_ID.INTERFACE_IMPL;
      const isTagged = isOfInterest && tagged.includes(parent.table);
      if (isTagged) {
        const attribute = this.readAttribute(row);
        const hasAttribute = attribute !== null;
        if (hasAttribute) {
          const key = `${parent.table}:${parent.row}`;
          const list = byParent.get(key) ?? [];
          list.push(attribute);
          byParent.set(key, list);
        }
      }
    }

    return byParent;
  }

  private rangeEnd({ table, row, column, ownerTable }: {
    table: number;
    row: number;
    column: number;
    ownerTable: number;
  }) {
    const nextRow = row + 1;
    const total = this.rowCount(ownerTable);
    const hasNextRow = nextRow <= this.rowCount(table);
    return hasNextRow
      ? this.cell({
        table,
        row: nextRow,
        column
      })
      : total + 1;
  }

  // Each map row's owner row to the first and one past the last row it owns.
  private rangesOf({ mapTable, ownerTable }: {
    mapTable: number;
    ownerTable: number;
  }) {
    const ranges = new Map<number, [number, number]>();
    for (let row = 1; row <= this.rowCount(mapTable); row++) {
      ranges.set(
        this.cell({
          table: mapTable,
          row,
          column: 0
        }), [
          this.cell({
            table: mapTable,
            row,
            column: 1
          }),
          this.rangeEnd({
            table: mapTable,
            row,
            column: 1,
            ownerTable
          })
        ]
      );
    }

    return ranges;
  }

  private readTypes() {
    const byParent = this.groupAttributes();
    const propertyRanges = this.rangesOf({
      mapTable: TABLE_ID.PROPERTY_MAP,
      ownerTable: TABLE_ID.PROPERTY
    });
    const eventRanges = this.rangesOf({
      mapTable: TABLE_ID.EVENT_MAP,
      ownerTable: TABLE_ID.EVENT
    });
    const semantics = new Map<string, number>();
    for (let row = 1; row <= this.rowCount(TABLE_ID.METHOD_SEMANTICS); row++) {
      const association = this.decode({
        coded: "HasSemantics",
        value: this.cell({
          table: TABLE_ID.METHOD_SEMANTICS,
          row,
          column: 2
        })
      });
      const key = `${association.table}:${association.row}`;
      const flags = this.cell({
        table: TABLE_ID.METHOD_SEMANTICS,
        row,
        column: 0
      });
      semantics.set(key, (semantics.get(key) ?? 0) | flags);
    }

    const interfaces = new Map<number, InterfaceReference[]>();
    for (let row = 1; row <= this.rowCount(TABLE_ID.INTERFACE_IMPL); row++) {
      const owner = this.cell({
        table: TABLE_ID.INTERFACE_IMPL,
        row,
        column: 0
      });
      const list = interfaces.get(owner) ?? [];
      const implemented = this.cell({
        table: TABLE_ID.INTERFACE_IMPL,
        row,
        column: 1
      });
      list.push({
        type: this.typeNameOf(implemented),
        signature: this.typeSignatureOf(implemented),
        attributes: this.attributesOf({
          table: TABLE_ID.INTERFACE_IMPL,
          row,
          byParent
        })
      });
      interfaces.set(owner, list);
    }

    const lookups: TypeLookups = {
      byParent,
      propertyRanges,
      eventRanges,
      semantics,
      interfaces
    };
    for (let row = 1; row <= this.rowCount(TABLE_ID.TYPE_DEF); row++) {
      this.types.push(
        this.readTypeDefinition({
          row,
          lookups
        })
      );
    }
  }

  private readTypeDefinition({ row, lookups }: {
    row: number;
    lookups: TypeLookups;
  }) {
    const properties: PropertyInfo[] = [];
    const [firstProperty, endProperty] = lookups.propertyRanges.get(row) ?? [1, 1];
    for (let property = firstProperty; property < endProperty; property++) {
      const info = this.readProperty(property);
      const flags = lookups.semantics.get(`${TABLE_ID.PROPERTY}:${property}`) ?? 0;
      info.hasGetter = (flags & METHOD_SEMANTIC.GETTER) !== 0;
      info.hasSetter = (flags & METHOD_SEMANTIC.SETTER) !== 0;
      properties.push(info);
    }

    const events: EventInfo[] = [];
    const [firstEvent, endEvent] = lookups.eventRanges.get(row) ?? [1, 1];
    for (let event = firstEvent; event < endEvent; event++) {
      events.push({
        name: this.string(
          this.cell({
            table: TABLE_ID.EVENT,
            row: event,
            column: 1
          })
        ),
        handler: this.typeSignatureOf(
          this.cell({
            table: TABLE_ID.EVENT,
            row: event,
            column: 2
          })
        )
      });
    }

    const methods: MethodInfo[] = [];
    const firstMethod = this.cell({
      table: TABLE_ID.TYPE_DEF,
      row,
      column: 5
    });
    const endMethod = this.rangeEnd({
      table: TABLE_ID.TYPE_DEF,
      row,
      column: 5,
      ownerTable: TABLE_ID.METHOD_DEF
    });
    for (let method = firstMethod; method < endMethod; method++) {
      methods.push(this.readMethod(method));
    }

    const flags = this.cell({
      table: TABLE_ID.TYPE_DEF,
      row,
      column: 0
    });
    const base = this.typeNameOf(
      this.cell({
        table: TABLE_ID.TYPE_DEF,
        row,
        column: 3
      })
    );
    const isEnum = base?.name === "Enum";
    const enumMembers: TypeInfo["enumMembers"] = [];
    if (isEnum) {
      const firstField = this.cell({
        table: TABLE_ID.TYPE_DEF,
        row,
        column: 4
      });
      const endField = this.rangeEnd({
        table: TABLE_ID.TYPE_DEF,
        row,
        column: 4,
        ownerTable: TABLE_ID.FIELD
      });
      for (let field = firstField; field < endField; field++) {
        const fieldFlags = this.cell({
          table: TABLE_ID.FIELD,
          row: field,
          column: 0
        });
        const isLiteral = (fieldFlags & FIELD_LITERAL) !== 0;
        if (isLiteral) {
          enumMembers.push({
            name: this.string(
              this.cell({
                table: TABLE_ID.FIELD,
                row: field,
                column: 1
              })
            ),
            value: this.constantOf(field)
          });
        }
      }
    }

    return {
      namespace: this.string(
        this.cell({
          table: TABLE_ID.TYPE_DEF,
          row,
          column: 2
        })
      ),
      name: this.string(
        this.cell({
          table: TABLE_ID.TYPE_DEF,
          row,
          column: 1
        })
      ),
      flags,
      base,
      interfaces: lookups.interfaces.get(row) ?? [],
      properties,
      events,
      methods,
      enumMembers,
      attributes: this.attributesOf({
        table: TABLE_ID.TYPE_DEF,
        row,
        byParent: lookups.byParent
      })
    };
  }

  private constantOf(field: number) {
    const hasConstants = this.fieldConstants !== null;
    if (!hasConstants) {
      this.fieldConstants = new Map();
      for (let row = 1; row <= this.rowCount(TABLE_ID.CONSTANT); row++) {
        const parent = this.decode({
          coded: "HasConstant",
          value: this.cell({
            table: TABLE_ID.CONSTANT,
            row,
            column: 1
          })
        });
        const isField = parent.table === TABLE_ID.FIELD;
        if (isField) {
          const bytes = Buffer.from(
            this.blob(
              this.cell({
                table: TABLE_ID.CONSTANT,
                row,
                column: 2
              })
            ).bytes
          );
          const is64Bit = bytes.length === BYTES_PER_INT64;
          this.fieldConstants.set(parent.row, is64Bit ? Number(bytes.readBigInt64LE(0)) : bytes.readInt32LE(0));
        }
      }
    }

    return this.fieldConstants?.get(field) ?? 0;
  }
}

/** Every type of a set of .winmd files, found by namespace and name. */
export class TypeIndex {
  private readonly byName = new Map<string, TypeInfo>();

  /** Adds the types of one file. */
  add(file: WinMdFile) {
    for (const type of file.types) {
      this.byName.set(`${type.namespace}.${type.name}`, type);
    }
  }

  /** The type with that namespace and name, if a file added it. */
  find(type: TypeName) {
    return this.byName.get(fullName(type));
  }
}
