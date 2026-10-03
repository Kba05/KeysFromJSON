/**
 * Class/struct output for the languages a JSON model gets pasted into.
 *
 * Every target shares one walk over the merged schema. Nested objects are claimed
 * in a `TypeRegistry` and emitted as separate sibling declarations, exactly as
 * `src/formats/typescript.js` does, so the naming (`RootUsersItem`, de-duplicated
 * with a numeric suffix) is the same across all of them. Only the type spellings,
 * the optional markers and the field syntax differ, and those live in a language
 * descriptor.
 *
 * Two rules are deliberate and apply to every language here:
 *
 *  - optional and nullable collapse into the language's one "may be absent" form.
 *    Unlike TypeScript, none of these targets has a separate marker for a key
 *    that is missing versus a key whose value can be `null`.
 *  - a union that is not a single primitive kind degrades to the language's top
 *    type instead of guessing. `string | number` has no faithful spelling in a
 *    record component, so it becomes `object` / `Any` / `Object` / `any`.
 *
 * No `run()` throws: unknown input becomes the top type, empty objects become
 * empty declarations, and empty arrays become collections of the top type.
 */

import { applyCase, escapeDoubleQuoted, isValidIdentifier, toTypeName } from '../core/naming.js';
import {
  NodeKind,
  alternatives,
  isNullable,
  isUnknown,
  objectFields,
  objectNode,
  withoutNull,
} from '../core/schema.js';
import { indentUnit, joinBlocks } from './helpers.js';

/**
 * Collects the named object types discovered while walking the schema.
 * Names are derived from the key path that produced them and de-duplicated with
 * a numeric suffix, so two different `items` objects stay distinct.
 */
class TypeRegistry {
  constructor() {
    this.byName = new Map(); // name -> declaration body
    this.usedNames = new Set();
  }

  claim(preferred) {
    let name = preferred;
    let counter = 2;
    while (this.usedNames.has(name)) {
      name = `${preferred}${counter}`;
      counter += 1;
    }
    this.usedNames.add(name);
    return name;
  }

  declare(name, body) {
    this.byName.set(name, body);
  }

  render(indent) {
    const blocks = [];
    for (const [name, declaration] of this.byName) {
      blocks.push(declaration(name, indent));
    }
    return blocks;
  }
}

function typeNameFromPath(segments, fallback) {
  const cleaned = segments.filter(Boolean);
  if (cleaned.length === 0) return fallback;
  return toTypeName(cleaned.join(' '), fallback);
}

/* ------------------------------------------------------------------ *
 * Shared traversal
 * ------------------------------------------------------------------ */

function isNullAlt(alt) {
  return alt.kind === NodeKind.PRIMITIVE && alt.type === 'null';
}

function isArrayAlt(alt) {
  return alt.kind === NodeKind.ARRAY;
}

/** The type expression for a node, ignoring `null` (the field adds its own marker). */
function expression(node, state) {
  const concrete = alternatives(node).filter((alt) => !isNullAlt(alt));

  // A value that is only ever `null`: nothing is known, so use the top type.
  if (concrete.length === 0) return state.lang.mixedType(state);
  if (concrete.length === 1) return single(concrete[0], state);

  // Two or more alternatives. `string | number` has no faithful spelling in any
  // of these targets, and neither does a union that mixes a container with
  // anything else, so both degrade to the top type rather than to a wrong guess.
  return state.lang.mixedType(state);
}

function single(node, state) {
  switch (node.kind) {
    case NodeKind.PRIMITIVE:
      return state.lang.primitive(node.type, state);

    case NodeKind.ARRAY: {
      const element = node.element;
      // C# needs a dedicated escape hatch for arrays of mixed or unknown values.
      const specialized = state.lang.mixedArray ? state.lang.mixedArray(element, state) : null;
      if (specialized) return specialized;

      // An unknown element is what an always-empty array looks like, and there is
      // no item type to name: the collection holds the top type instead.
      if (isUnknown(element)) return state.lang.array(state.lang.mixedType(state), state);

      const inner = expression(element, { ...state, path: [...state.path, 'Item'] });
      // `[1, null]` needs the element's own marker as well as the collection's.
      const item = isNullable(element) ? state.lang.nullable(inner, state) : inner;
      return state.lang.array(item, state);
    }

    case NodeKind.OBJECT: {
      const name = state.registry.claim(typeNameFromPath(state.path, 'Nested'));
      if (!state.registry.byName.has(name)) {
        // Reserve the name first so a recursive-looking path cannot claim it twice.
        state.registry.declare(name, () => '');
        const entries = describeFields(node, state);
        state.registry.declare(name, (typeName, indent) => state.lang.declaration(typeName, indent, entries, state));
      }
      return name;
    }

    default:
      return state.lang.unknownType(state);
  }
}

/**
 * The fields of an object node, with a type and a target-language property name
 * for each. The type is computed eagerly so every nested declaration is claimed
 * before the registry starts rendering.
 */
function describeFields(node, state) {
  const used = new Set();

  return objectFields(node).map((field) => {
    const preferred = state.lang.propertyName(field.name, state);
    let propName = preferred;
    let counter = 2;
    // Two keys can collapse onto one identifier once cased (`user_name` and
    // `userName`); the second one is numbered, while the alias or tag still
    // carries the original JSON key.
    while (used.has(propName)) {
      propName = `${preferred}${counter}`;
      counter += 1;
    }
    used.add(propName);

    return {
      jsonName: field.name,
      propName,
      type: expression(field.node, { ...state, path: [...state.path, field.name] }),
      optional: field.optional,
      nullable: isNullable(field.node),
    };
  });
}

/**
 * The node that describes the root record.
 *
 * A root-level array is a list of records (see `extract.js`), so its element
 * object is the record shape; anything else has no fields and yields an empty
 * declaration rather than an error.
 */
function rootSchemaNode(schema) {
  if (objectNode(schema)) return schema;
  const array = alternatives(schema).find(isArrayAlt);
  if (array && objectNode(array.element)) return array.element;
  return schema;
}

function generate(schema, options, lang) {
  const settings = { typeName: 'Root', ...options };
  const registry = new TypeRegistry();
  const rootName = toTypeName(settings.typeName, 'Root');
  const state = {
    registry,
    lang,
    options: settings,
    unit: indentUnit(settings),
    flags: new Set(), // identifier the prologue has to import, filled in by `lang`
    path: [rootName],
  };

  // The root is always named explicitly, so claim its name up front.
  registry.usedNames.add(rootName);

  const entries = describeFields(rootSchemaNode(schema), state);
  const declaration = lang.declaration(rootName, '', entries, state);
  const nested = registry.render('');
  // The prologue is built last: it reports only what the declarations needed.
  const prologue = lang.prologue ? lang.prologue(state) : null;

  return joinBlocks([prologue, declaration, ...nested]);
}

/* ------------------------------------------------------------------ *
 * C#
 * ------------------------------------------------------------------ */

const CSHARP_PRIMITIVE = { string: 'string', number: 'double', boolean: 'bool' };

/** `user_name` -> `UserName`; a key that is already PascalCase keeps its name. */
function csharpProperty(key) {
  return toTypeName(key, 'Field');
}

function csharpMixedArray(element) {
  // `[1, "a"]` and `[]` have no usable element type; JsonElement keeps the raw
  // JSON around instead of pretending to a type that cannot be named.
  if (isUnknown(element)) return 'JsonElement';
  return alternatives(withoutNull(element)).length > 1 ? 'JsonElement' : null;
}

function csharpField(entry, indent) {
  const lines = [];
  // System.Text.Json matches property names case-sensitively, so the attribute
  // is required whenever PascalCasing changed the key.
  if (entry.propName !== entry.jsonName) {
    lines.push(`${indent}[JsonPropertyName("${escapeDoubleQuoted(entry.jsonName)}")]`);
  }
  const marker = entry.optional || entry.nullable ? '?' : '';
  lines.push(`${indent}public ${entry.type}${marker} ${entry.propName} { get; set; }`);
  return lines;
}

function csharpDeclaration(name, indent, entries, state) {
  const inner = indent + state.unit;
  const lines = entries.flatMap((entry) => state.lang.fieldLines(entry, inner, state));
  // Nested objects become sibling classes: one C# file may hold several types.
  if (lines.length === 0) return `${indent}public class ${name}\n${indent}{\n${indent}}`;
  return `${indent}public class ${name}\n${indent}{\n${lines.join('\n')}\n${indent}}`;
}

const csharpNotice = '// Requires: using System.Collections.Generic; using System.Text.Json;'
  + ' using System.Text.Json.Serialization;';

const csharpLang = {
  propertyName: csharpProperty,
  primitive: (type) => CSHARP_PRIMITIVE[type] ?? 'object',
  array: (inner) => `List<${inner}>`,
  nullable: (type) => (type.endsWith('?') ? type : `${type}?`),
  unknownType: () => 'Dictionary<string, object>',
  mixedType: () => 'object',
  mixedArray: csharpMixedArray,
  fieldLines: csharpField,
  declaration: csharpDeclaration,
  prologue: () => csharpNotice,
};

/* ------------------------------------------------------------------ *
 * Kotlin
 * ------------------------------------------------------------------ */

const KOTLIN_PRIMITIVE = { string: 'String', number: 'Double', boolean: 'Boolean' };

function kotlinProperty(key) {
  const name = applyCase(key, 'camel');
  // A key may start with a digit or lose every word once cased; keep it legal.
  return isValidIdentifier(name) ? name : `_${name}`;
}

function kotlinNullable(type) {
  return type.endsWith('?') ? type : `${type}?`;
}

function kotlinField(entry, indent) {
  const lines = [];
  if (entry.propName !== entry.jsonName) {
    lines.push(`${indent}@SerialName("${escapeDoubleQuoted(entry.jsonName)}")`);
  }
  // A default is what makes an optional key survivable for kotlinx.serialization.
  const defaulted = entry.optional || entry.nullable;
  const type = defaulted ? kotlinNullable(entry.type) : entry.type;
  lines.push(`${indent}val ${entry.propName}: ${type}${defaulted ? ' = null' : ''},`);
  return lines;
}

function kotlinDeclaration(name, indent, entries, state) {
  if (entries.length === 0) {
    // Kotlin rejects a data class without a primary-constructor parameter.
    return `${indent}// A data class needs at least one parameter, so this stays a plain class.\n`
      + `${indent}class ${name}`;
  }
  const inner = indent + state.unit;
  const lines = entries.flatMap((entry) => state.lang.fieldLines(entry, inner, state));
  return `data class ${name}(\n${lines.join('\n')}\n${indent})`;
}

const kotlinNotice = '// Requires: @Serializable on each class and'
  + ' `import kotlinx.serialization.SerialName` for the annotations to take effect.';

const kotlinLang = {
  propertyName: kotlinProperty,
  primitive: (type) => KOTLIN_PRIMITIVE[type] ?? 'Any',
  array: (inner) => `List<${inner}>`,
  nullable: kotlinNullable,
  unknownType: () => 'Any?',
  mixedType: () => 'Any?',
  fieldLines: kotlinField,
  declaration: kotlinDeclaration,
  prologue: () => kotlinNotice,
};

/* ------------------------------------------------------------------ *
 * Java
 * ------------------------------------------------------------------ */

const JAVA_PRIMITIVE = { string: 'String', number: 'Double', boolean: 'Boolean' };

function javaProperty(key) {
  const name = applyCase(key, 'camel');
  return isValidIdentifier(name) ? name : `_${name}`;
}

function javaField(entry, indent) {
  const annotation = entry.propName === entry.jsonName
    ? ''
    : `@JsonProperty("${escapeDoubleQuoted(entry.jsonName)}") `;
  return [`${indent}${annotation}${entry.type} ${entry.propName},`];
}

function javaDeclaration(name, indent, entries, state) {
  const inner = indent + state.unit;
  const lines = entries.flatMap((entry) => state.lang.fieldLines(entry, inner, state));
  // No `public`: Java allows one public top-level type per file, and every nested
  // object becomes its own record in this one file.
  if (lines.length === 0) return `${indent}record ${name}() {}`;
  return `record ${name}(\n${lines.join('\n')}\n${indent}) {}`;
}

const javaNotice = '// Requires: import com.fasterxml.jackson.annotation.JsonProperty;'
  + ' import java.util.List;';

const javaLang = {
  propertyName: javaProperty,
  primitive: (type) => JAVA_PRIMITIVE[type] ?? 'Object',
  array: (inner) => `List<${inner}>`,
  // Record components have no nullability syntax, so optional keys carry no
  // marker; `Optional<T>` would change the JSON contract, which is worse.
  nullable: (type) => type,
  unknownType: () => 'Object',
  mixedType: () => 'Object',
  fieldLines: javaField,
  declaration: javaDeclaration,
  prologue: () => javaNotice,
};

/* ------------------------------------------------------------------ *
 * Go
 * ------------------------------------------------------------------ */

const GO_PRIMITIVE = { string: 'string', number: 'float64', boolean: 'bool' };

/** Exported, or `encoding/json` cannot see the field at all. */
function goProperty(key) {
  return toTypeName(key, 'Field');
}

function goField(entry, indent) {
  const optional = entry.optional ? ',omitempty' : '';
  // The tag is a raw string, so a backtick in the key would end it early; the
  // other escape sequences are understood by reflect's tag parser.
  const tagName = escapeDoubleQuoted(entry.jsonName).replace(/`/g, '');
  return [`${indent}${entry.propName} ${entry.type} \`json:"${tagName}${optional}"\``];
}

function goDeclaration(name, indent, entries, state) {
  const inner = indent + state.unit;
  const lines = entries.flatMap((entry) => state.lang.fieldLines(entry, inner, state));
  if (lines.length === 0) return `${indent}type ${name} struct {\n${indent}}`;
  return `${indent}type ${name} struct {\n${lines.join('\n')}\n${indent}}`;
}

const goLang = {
  propertyName: goProperty,
  primitive: (type) => GO_PRIMITIVE[type] ?? 'any',
  array: (inner) => `[]${inner}`,
  // Every Go type has a zero value, so optionality only shows up in the tag.
  nullable: (type) => type,
  unknownType: () => 'map[string]any',
  mixedType: () => 'any',
  fieldLines: goField,
  declaration: goDeclaration,
};

/* ------------------------------------------------------------------ *
 * Python
 * ------------------------------------------------------------------ */

const PYTHON_PRIMITIVE = { string: 'str', number: 'float', boolean: 'bool' };

function pythonProperty(key) {
  const name = applyCase(key, 'snake');
  return isValidIdentifier(name) ? name : `_${name}`;
}

function pythonNullable(type, state) {
  // `Optional[Any]` says nothing that `Any` does not already say.
  if (type === 'Any') return 'Any';
  state.flags.add('Optional');
  return `Optional[${type}]`;
}

function pythonAny(state) {
  state.flags.add('Any');
  return 'Any';
}

/** The `from typing import ...` line, limited to what the declarations used. */
function pythonTypingImports(state, always) {
  const names = new Set(always);
  for (const flag of state.flags) {
    if (flag === 'Any' || flag === 'NotRequired' || flag === 'Optional') names.add(flag);
  }
  if (names.size === 0) return null;
  return `from typing import ${[...names].sort().join(', ')}`;
}

const PYTHON_FUTURE = 'from __future__ import annotations';

function pythonDataclassField(entry, indent, state) {
  const defaulted = entry.optional || entry.nullable;
  const type = defaulted ? pythonNullable(entry.type, state) : entry.type;
  return [`${indent}${entry.propName}: ${type}${defaulted ? ' = None' : ''}`];
}

function pythonDataclassDeclaration(name, indent, entries, state) {
  const inner = indent + state.unit;
  const head = `${indent}@dataclass\n${indent}class ${name}:`;
  if (entries.length === 0) return `${head}\n${inner}pass`;

  // Python requires defaulted fields to come after the required ones, so an
  // optional key is moved to the end of the dataclass.
  const ordered = [
    ...entries.filter((entry) => !entry.optional && !entry.nullable),
    ...entries.filter((entry) => entry.optional || entry.nullable),
  ];
  const lines = ordered.flatMap((entry) => state.lang.fieldLines(entry, inner, state));
  return `${head}\n${lines.join('\n')}`;
}

function pythonDataclassPrologue(state) {
  const lines = [PYTHON_FUTURE, '', 'from dataclasses import dataclass'];
  const typing = pythonTypingImports(state, []);
  if (typing) lines.push(typing);
  return lines.join('\n');
}

function pythonTypedDictField(entry, indent, state) {
  const base = entry.nullable ? pythonNullable(entry.type, state) : entry.type;
  if (!entry.optional) return [`${indent}${entry.propName}: ${base}`];
  state.flags.add('NotRequired');
  return [`${indent}${entry.propName}: NotRequired[${base}]`];
}

function pythonTypedDictDeclaration(name, indent, entries, state) {
  const inner = indent + state.unit;
  const head = `${indent}class ${name}(TypedDict, total=True):`;
  if (entries.length === 0) return `${head}\n${inner}pass`;
  const lines = entries.flatMap((entry) => state.lang.fieldLines(entry, inner, state));
  return `${head}\n${lines.join('\n')}`;
}

function pythonTypedDictPrologue(state) {
  const lines = [PYTHON_FUTURE];
  if (state.flags.has('NotRequired')) {
    // NotRequired is 3.11+; older interpreters import it from typing_extensions.
    lines.push('', '# NotRequired needs Python 3.11+, or typing_extensions on older versions.');
  }
  lines.push('', pythonTypingImports(state, ['TypedDict']));
  return lines.join('\n');
}

const pythonDataclassLang = {
  propertyName: pythonProperty,
  primitive: (type) => PYTHON_PRIMITIVE[type] ?? 'Any',
  array: (inner) => `list[${inner}]`,
  nullable: pythonNullable,
  unknownType: pythonAny,
  mixedType: pythonAny,
  fieldLines: pythonDataclassField,
  declaration: pythonDataclassDeclaration,
  prologue: pythonDataclassPrologue,
};

const pythonTypedDictLang = {
  propertyName: pythonProperty,
  primitive: (type) => PYTHON_PRIMITIVE[type] ?? 'Any',
  array: (inner) => `list[${inner}]`,
  nullable: pythonNullable,
  unknownType: pythonAny,
  mixedType: pythonAny,
  fieldLines: pythonTypedDictField,
  declaration: pythonTypedDictDeclaration,
  prologue: pythonTypedDictPrologue,
};

/* ------------------------------------------------------------------ *
 * Swift
 * ------------------------------------------------------------------ */

const SWIFT_PRIMITIVE = { string: 'String', number: 'Double', boolean: 'Bool' };

function swiftProperty(key) {
  const name = applyCase(key, 'camel');
  return isValidIdentifier(name) ? name : `_${name}`;
}

function swiftEmptyCodable(state) {
  // AnyCodable is not in the standard library, so the prologue has to say so.
  state.flags.add('AnyCodable');
  return 'AnyCodable';
}

function swiftField(entry, indent) {
  const marker = entry.optional || entry.nullable ? '?' : '';
  return [`${indent}let ${entry.propName}: ${entry.type}${marker}`];
}

function swiftDeclaration(name, indent, entries, state) {
  const inner = indent + state.unit;
  if (entries.some((entry) => entry.propName !== entry.jsonName)) {
    // CodingKeys would be needed for those keys; flag it once for the whole file.
    state.flags.add('Renamed');
  }
  const lines = entries.flatMap((entry) => state.lang.fieldLines(entry, inner, state));
  if (lines.length === 0) return `${indent}struct ${name}: Codable {\n${indent}}`;
  return `${indent}struct ${name}: Codable {\n${lines.join('\n')}\n${indent}}`;
}

function swiftPrologue(state) {
  const notes = [];
  if (state.flags.has('AnyCodable')) {
    notes.push('// AnyCodable is not in the standard library: supply a Codable wrapper for it.');
  }
  if (state.flags.has('Renamed')) {
    notes.push('// Names are camelCased; add CodingKeys (or a .convertFromSnakeCase decoder) where a key differs.');
  }
  return notes.length > 0 ? notes.join('\n') : null;
}

const swiftLang = {
  propertyName: swiftProperty,
  primitive: (type) => SWIFT_PRIMITIVE[type] ?? 'AnyCodable',
  array: (inner) => `[${inner}]`,
  nullable: (type) => (type.endsWith('?') ? type : `${type}?`),
  unknownType: swiftEmptyCodable,
  mixedType: swiftEmptyCodable,
  fieldLines: swiftField,
  declaration: swiftDeclaration,
  prologue: swiftPrologue,
};

/* ------------------------------------------------------------------ *
 * Rust
 * ------------------------------------------------------------------ */

const RUST_PRIMITIVE = { string: 'String', number: 'f64', boolean: 'bool' };

/** Field names that would not compile as a bare identifier. */
const RUST_KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'become', 'box', 'break', 'const', 'continue', 'crate', 'do',
  'dyn', 'else', 'enum', 'extern', 'false', 'final', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop',
  'macro', 'match', 'mod', 'move', 'mut', 'override', 'priv', 'pub', 'ref', 'return', 'self', 'static',
  'struct', 'super', 'trait', 'true', 'try', 'type', 'typeof', 'unsafe', 'unsized', 'use', 'virtual',
  'where', 'while', 'yield',
]);

function rustProperty(key) {
  const name = applyCase(key, 'snake');
  const safe = isValidIdentifier(name) ? name : `_${name}`;
  // Raw identifiers keep a key like `type` usable; serde still sees `type`.
  return RUST_KEYWORDS.has(safe) ? `r#${safe}` : safe;
}

function rustNullable(type) {
  return type.startsWith('Option<') ? type : `Option<${type}>`;
}

function rustField(entry, indent) {
  const lines = [];
  const bare = entry.propName.replace(/^r#/, '');
  if (bare !== entry.jsonName) {
    lines.push(`${indent}#[serde(rename = "${escapeDoubleQuoted(entry.jsonName)}")]`);
  }
  // Rust has no `null`; an absent or null key is the same `Option`.
  const defaulted = entry.optional || entry.nullable;
  const type = defaulted ? rustNullable(entry.type) : entry.type;
  lines.push(`${indent}pub ${entry.propName}: ${type},`);
  return lines;
}

function rustDeclaration(name, indent, entries, state) {
  const inner = indent + state.unit;
  const head = `${indent}#[derive(Serialize, Deserialize)]\n${indent}pub struct ${name} {`;
  if (entries.length === 0) return `${head}\n${indent}}`;
  const lines = entries.flatMap((entry) => state.lang.fieldLines(entry, inner, state));
  return `${head}\n${lines.join('\n')}\n${indent}}`;
}

const rustNotice = '// Requires: use serde::{Deserialize, Serialize};'
  + ' serde_json::Value needs the serde_json crate.';

const rustLang = {
  propertyName: rustProperty,
  primitive: (type) => RUST_PRIMITIVE[type] ?? 'serde_json::Value',
  array: (inner) => `Vec<${inner}>`,
  nullable: rustNullable,
  unknownType: () => 'serde_json::Value',
  mixedType: () => 'serde_json::Value',
  fieldLines: rustField,
  declaration: rustDeclaration,
  prologue: () => rustNotice,
};

/* ------------------------------------------------------------------ *
 * Formatter entries
 * ------------------------------------------------------------------ */

const LANGUAGES = [
  {
    id: 'csharp-class',
    label: 'C# class',
    hint: 'A `public class` per nested object, with `JsonPropertyName` where the key was renamed',
    lang: csharpLang,
  },
  {
    id: 'kotlin-data',
    label: 'Kotlin data class',
    hint: 'A `data class` per nested object, with `@SerialName` where the key was renamed',
    lang: kotlinLang,
  },
  {
    id: 'java-record',
    label: 'Java record',
    hint: 'A `record` per nested object, with `@JsonProperty` where the key was renamed',
    lang: javaLang,
  },
  {
    id: 'go-struct',
    label: 'Go struct',
    hint: 'A struct per nested object, with `json` tags carrying the original keys',
    lang: goLang,
  },
  {
    id: 'python-dataclass',
    label: 'Python @dataclass',
    hint: 'A `@dataclass` per nested object, with optional keys defaulted to `None`',
    lang: pythonDataclassLang,
  },
  {
    id: 'python-typeddict',
    label: 'Python TypedDict',
    hint: 'A `TypedDict` per nested object, with `NotRequired` for optional keys',
    lang: pythonTypedDictLang,
  },
  {
    id: 'swift-struct',
    label: 'Swift Codable struct',
    hint: 'A `Codable` struct per nested object, with `?` for optional keys',
    lang: swiftLang,
  },
  {
    id: 'rust-struct',
    label: 'Rust serde struct',
    hint: 'A serde struct per nested object, with `#[serde(rename)]` where the key was renamed',
    lang: rustLang,
  },
];

export const codeFormatters = LANGUAGES.map(({ id, label, hint, lang }) => ({
  id,
  label,
  group: 'lang',
  hint,
  schema: true,
  run: (ctx) => generate(
    ctx.schema,
    { typeName: ctx.options.typeName || 'Root', indent: ctx.options.indent },
    lang,
  ),
}));
