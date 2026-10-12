export type JsonPrimitive = undefined | null | boolean | number | string;
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type ValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'unknown';

export interface Field {
  id: number;
  segments: string[];
  realSegments: string[];
  key: string;
  parentSegments: string[];
  depth: number;
  valueType: ValueType;
  value: JsonValue;
  isLeaf: boolean;
  childCount: number;
  arrayIndex: number | null;
  docIndex: number;
}

export interface PrimitiveSchemaNode {
  kind: 'primitive';
  type: 'string' | 'number' | 'boolean' | 'null';
  maxLength?: number;
}
export interface ObjectSchemaField { name: string; node: SchemaNode; count: number }
export interface ObjectSchemaNode { kind: 'object'; count: number; fields: Map<string, ObjectSchemaField> }
export interface ArraySchemaNode { kind: 'array'; count: number; element: SchemaNode }
export interface UnionSchemaNode { kind: 'union'; types: SchemaNode[] }
export interface UnknownSchemaNode { kind: 'unknown' }
export type SchemaNode = PrimitiveSchemaNode | ObjectSchemaNode | ArraySchemaNode | UnionSchemaNode | UnknownSchemaNode;

export interface KeyItem {
  id: number;
  field: Field;
  segments: string[];
  key: string;
  name: string;
  path: string;
  depth: number;
  valueType: ValueType;
  text: string;
}

export interface BuildStats {
  scanned: number;
  matched: number;
  unique: number;
  duplicates: number;
  maxDepth: number;
}

export interface EngineOptions {
  wrap: { left: string; right: string };
  caseMode: string;
  pathStyle: string;
  realIndices: boolean;
  nodeFilter: string;
  maxDepth: number | null;
  includePattern: string;
  excludePattern: string;
  search: string;
  selected: Set<number> | null;
  nameSource: string;
  dedupeBy: string;
  ignoreCase: boolean;
  sort: string;
  separator: string;
  indent: number | 'tab';
  typeName: string;
  tableName: string;
  tsReadonly: boolean;
  tsExported: boolean;
  jsonSkeletonTyped: boolean;
  template: string;
  templateHeader: string;
  templateFooter: string;
  [key: string]: unknown;
}

export interface FormatterContext {
  fields: Field[];
  items: KeyItem[];
  stats: BuildStats;
  docs: JsonValue[];
  schema: SchemaNode;
  options: EngineOptions;
}

export interface Formatter {
  id: string;
  label: string;
  group: string;
  hint: string;
  schema?: boolean;
  leafOnly?: boolean;
  run: (context: FormatterContext) => string;
}

export interface ParseDiagnostic {
  code: string;
  message: string;
  position: number;
  repairable: boolean;
  line: number;
  column: number;
  snippet: string;
  caret: string;
}

export type ParseDocumentsResult =
  | { ok: true; docs: JsonValue[]; format: 'json' | 'ndjson' | 'relaxed' }
  | { ok: false; docs: []; error: ParseDiagnostic; failedLine?: number };
