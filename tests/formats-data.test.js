/**
 * Formatter contract tests.
 *
 * These run on `node:test`, not vitest: the bundler-based runners cannot spawn in
 * this sandbox, and these modules are plain ES modules with no dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAll } from '../src/core/extract.js';
import { buildSchema } from '../src/core/schema.js';
import { buildKeyItems } from '../src/core/decorate.js';
import { sqlFormatters } from '../src/formats/sql.js';
import { yamlFormatters } from '../src/formats/yaml.js';
import { codeFormatters } from '../src/formats/code-langs.js';

function context(docs, options = {}) {
  const fields = extractAll(docs);
  const { items, stats } = buildKeyItems(fields, options);
  return { fields, items, stats, docs, schema: buildSchema(docs), options };
}

const byId = (list, id) => list.find((formatter) => formatter.id === id);

const sql = (id) => byId(sqlFormatters, id);
const yaml = (id) => byId(yamlFormatters, id);
const lang = (id) => byId(codeFormatters, id);

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/**
 * The shape every language has to survive: an array of objects whose elements
 * disagree (a nullable key, a key missing from one element, an empty array), an
 * always-empty object and an always-empty array.
 */
const SMALL = {
  items: [
    { sku: 'a', qty: 2, note: null, tags: ['x', 'y'] },
    { sku: 'b', qty: 3, tags: [], meta: { deep: true } },
  ],
  nothing: {},
  blanks: [],
};

/** Adds a nested object two levels deep and a string long enough for VARCHAR. */
const NESTED = {
  users: [
    { id: 1, name: 'Ann', tags: ['a', 'bb'], address: { city: 'Oslo', geo: { lat: 1.5, lng: 2.5 } } },
    { id: 2, name: 'Bo', tags: [], address: { city: 'Bergen' }, nickname: null },
  ],
  meta: {},
  flags: [],
  created_at: '2024-01-01T00:00:00Z',
  title: 'Hello there',
};

const small = () => context([SMALL]);

/* ------------------------------------------------------------------ *
 * Formatter metadata
 * ------------------------------------------------------------------ */

test('formatter entries declare the documented contract', () => {
  assert.deepEqual(sqlFormatters.map((f) => f.id), ['sql-columns', 'sql-create-table']);
  assert.deepEqual(yamlFormatters.map((f) => f.id), ['yaml-keys', 'dotenv']);
  assert.deepEqual(codeFormatters.map((f) => f.id), [
    'csharp-class', 'kotlin-data', 'java-record', 'go-struct',
    'python-dataclass', 'python-typeddict', 'swift-struct', 'rust-struct',
  ]);

  for (const formatter of [...sqlFormatters, ...yamlFormatters, ...codeFormatters]) {
    assert.equal(typeof formatter.label, 'string');
    assert.equal(typeof formatter.hint, 'string');
    assert.equal(typeof formatter.run, 'function');
  }

  assert.equal(sql('sql-columns').group, 'sql');
  assert.equal(sql('sql-create-table').group, 'sql');
  assert.equal(yaml('yaml-keys').group, 'data');
  assert.equal(yaml('dotenv').group, 'data');
  for (const formatter of codeFormatters) assert.equal(formatter.group, 'lang');

  // Only the formatters that walk the schema tree ask for one.
  assert.equal(sql('sql-columns').schema, undefined);
  assert.equal(yaml('dotenv').schema, undefined);
  assert.equal(sql('sql-create-table').schema, true);
  assert.equal(yaml('yaml-keys').schema, true);
  for (const formatter of codeFormatters) assert.equal(formatter.schema, true);
});

/* ------------------------------------------------------------------ *
 * SQL
 * ------------------------------------------------------------------ */

test('sql-columns keeps leaves only and snake_cases them by default', () => {
  assert.equal(
    sql('sql-columns').run(context([NESTED], { tableName: 'users' })),
    'id,\nname,\ncity,\nlat,\nlng,\nnickname,\ncreated_at,\ntitle',
  );
});

test('sql-columns can keep containers and keep the original casing', () => {
  assert.equal(
    sql('sql-columns').run(context([NESTED], { sqlLeavesOnly: false })),
    'users,\nid,\nname,\ntags,\naddress,\ncity,\ngeo,\nlat,\nlng,\nnickname,\nmeta,\nflags,\ncreated_at,\ntitle',
  );
  assert.equal(
    sql('sql-columns').run(context([{ camelKey: 1, slug: 'x' }], { sqlSnakeCase: false })),
    'camelKey,\nslug',
  );
  assert.equal(
    sql('sql-columns').run(context([{ camelKey: 1, slug: 'x' }])),
    'camel_key,\nslug',
  );
});

test('sql-create-table annotates only a real id key and infers every column type', () => {
  const out = sql('sql-create-table').run(context(
    [{ id: 7, name: 'Ann', created_at: '2024-01-01T00:00:00Z' }],
    { tableName: 'users' },
  ));
  assert.equal(out, [
    'CREATE TABLE users (',
    '  id NUMERIC PRIMARY KEY,',
    '  name VARCHAR(32) NOT NULL,',
    '  created_at TIMESTAMP NOT NULL',
    ');',
  ].join('\n'));
});

test('sql-create-table drops NOT NULL for optional and nullable keys', () => {
  const out = sql('sql-create-table').run(context([{ a: 1, b: 'x', c: null, mixed: 1 }, { a: 2, mixed: 'y' }]));
  assert.equal(out, [
    'CREATE TABLE Root (',
    '  a NUMERIC NOT NULL,',
    '  b VARCHAR(32),',
    '  c TEXT,',
    '  mixed TEXT NOT NULL',
    ');',
  ].join('\n'));
});

test('sql-create-table collapses nested objects and arrays to JSON', () => {
  const out = sql('sql-create-table').run(context([NESTED], { tableName: 'users' }));
  assert.equal(out, [
    'CREATE TABLE users (',
    '  users JSON NOT NULL,',
    '  meta JSON NOT NULL,',
    '  flags JSON NOT NULL,',
    '  created_at TIMESTAMP NOT NULL,',
    '  title VARCHAR(32) NOT NULL',
    ');',
  ].join('\n'));
});

test('sql-create-table describes the element of a root-level array, and survives an empty root', () => {
  // Each record carries only one of the two keys, so neither column is required.
  const arrayRoot = sql('sql-create-table').run(context([[{ a: 1 }, { b: 'x' }]]));
  assert.match(arrayRoot, /CREATE TABLE Root \(\n {2}a NUMERIC,\n {2}b VARCHAR\(32\)\n\);/);

  // An empty object has no columns; the statement still comes out well formed.
  assert.equal(sql('sql-create-table').run(context([{}])), 'CREATE TABLE Root (\n);');
});

test('sql identifiers are quoted only when they are not bare names', () => {
  const out = sql('sql-create-table').run(context([{ 'user-name': 1 }], { tableName: 'odd table' }));
  assert.match(out, /CREATE TABLE "odd table" \(/);
  assert.match(out, /\n {2}"user-name" NUMERIC NOT NULL\n/);
});

/* ------------------------------------------------------------------ *
 * YAML and dotenv
 * ------------------------------------------------------------------ */

test('yaml-keys emits the real nesting with null placeholders', () => {
  assert.equal(yaml('yaml-keys').run(context([NESTED])), [
    '# Keys of Root',
    'users:',
    '  - id: null',
    '    name: null',
    '    tags:',
    '      - null',
    '    address:',
    '      city: null',
    '      geo:',
    '        lat: null',
    '        lng: null',
    '    nickname: null',
    'meta: {}',
    'flags: []',
    'created_at: null',
    'title: null',
  ].join('\n'));
});

test('yaml-keys quotes unsafe keys and can drop the header', () => {
  const out = yaml('yaml-keys').run(context([{ 'user name': 1, '2fa': 2, ok_key: 3, '': 4, 'a"b': 5 }], { yamlHeader: false }));
  assert.equal(out, [
    "'user name': null",
    "'2fa': null",
    'ok_key: null',
    "'': null",
    "'a\"b': null",
  ].join('\n'));
});

test('yaml-keys handles a root-level array and the configured root name', () => {
  assert.equal(
    yaml('yaml-keys').run(context([[{ a: 1 }, { a: 2, b: 'x' }]])),
    '# Keys of Root\n- a: null\n  b: null',
  );
  assert.equal(
    yaml('yaml-keys').run(context([{ a: [1, 2], b: [[]] }], { typeName: 'UserProfile', yamlHeader: false })),
    'a:\n  - null\nb:\n  - []',
  );
});

test('dotenv uppercases the keys and can keep containers', () => {
  assert.equal(
    yaml('dotenv').run(context([NESTED])),
    'ID=\nNAME=\nCITY=\nLAT=\nLNG=\nNICKNAME=\nCREATED_AT=\nTITLE=',
  );
  assert.equal(
    yaml('dotenv').run(context([NESTED], { dotenvLeavesOnly: false })),
    'USERS=\nID=\nNAME=\nTAGS=\nADDRESS=\nCITY=\nGEO=\nLAT=\nLNG=\nNICKNAME=\nMETA=\nFLAGS=\nCREATED_AT=\nTITLE=',
  );
});

/* ------------------------------------------------------------------ *
 * C#
 * ------------------------------------------------------------------ */

test('csharp-class extracts nested objects and marks optional keys', () => {
  assert.equal(lang('csharp-class').run(small()), [
    '// Requires: using System.Collections.Generic; using System.Text.Json; using System.Text.Json.Serialization;',
    '',
    'public class Root',
    '{',
    '  [JsonPropertyName("items")]',
    '  public List<RootItemsItem> Items { get; set; }',
    '  [JsonPropertyName("nothing")]',
    '  public RootNothing Nothing { get; set; }',
    '  [JsonPropertyName("blanks")]',
    '  public JsonElement Blanks { get; set; }',
    '}',
    '',
    'public class RootItemsItem',
    '{',
    '  [JsonPropertyName("sku")]',
    '  public string Sku { get; set; }',
    '  [JsonPropertyName("qty")]',
    '  public double Qty { get; set; }',
    '  [JsonPropertyName("note")]',
    '  public object? Note { get; set; }',
    '  [JsonPropertyName("tags")]',
    '  public List<string> Tags { get; set; }',
    '  [JsonPropertyName("meta")]',
    '  public RootItemsItemMeta? Meta { get; set; }',
    '}',
    '',
    'public class RootItemsItemMeta',
    '{',
    '  [JsonPropertyName("deep")]',
    '  public bool Deep { get; set; }',
    '}',
    '',
    'public class RootNothing',
    '{',
    '}',
  ].join('\n'));
});

test('csharp-class uses the configured type name and escapes renamed keys', () => {
  const out = lang('csharp-class').run(context([{ userId: 1, 'a"b': 2 }], { typeName: 'UserProfile' }));
  assert.match(out, /public class UserProfile\n\{/);
  assert.match(out, /\[JsonPropertyName\("userId"\)\]\n {2}public double UserId \{ get; set; \}/);
  assert.match(out, /\[JsonPropertyName\("a\\"b"\)\]\n {2}public double AB \{ get; set; \}/);
});

/* ------------------------------------------------------------------ *
 * Kotlin
 * ------------------------------------------------------------------ */

test('kotlin-data emits a data class with nullable defaults', () => {
  const out = lang('kotlin-data').run(small());
  assert.match(out, /data class Root\(\n {2}val items: List<RootItemsItem>,\n {2}val nothing: RootNothing,\n {2}val blanks: List<Any\?>,\n\)/);
  assert.match(out, /data class RootItemsItem\(\n {2}val sku: String,\n {2}val qty: Double,\n {2}val note: Any\? = null,/);
  assert.match(out, / {2}val meta: RootItemsItemMeta\? = null,\n\)/);
  // A Kotlin data class cannot have zero parameters, so the empty object degrades.
  assert.match(out, /class RootNothing/);
  assert.doesNotMatch(out, /Any\?\?/);
  assert.doesNotMatch(out, /data class RootNothing/);
});

test('kotlin-data annotates only keys that camelCase actually changed', () => {
  const out = lang('kotlin-data').run(context([{ user_name: 1, camelKey: 2 }]));
  assert.match(out, /@SerialName\("user_name"\)\n {2}val userName: Double,/);
  assert.doesNotMatch(out, /SerialName\("camelKey"\)/);
});

/* ------------------------------------------------------------------ *
 * Java
 * ------------------------------------------------------------------ */

test('java-record uses List for arrays, Object for unknown and no public modifier', () => {
  const out = lang('java-record').run(small());
  assert.match(out, /record Root\(\n {2}List<RootItemsItem> items,\n {2}RootNothing nothing,\n {2}List<Object> blanks,\n\) \{\}/);
  assert.match(out, /record RootItemsItem\(\n {2}String sku,\n {2}Double qty,\n {2}Object note,\n {2}List<String> tags,\n {2}RootItemsItemMeta meta,\n\) \{\}/);
  assert.equal(out.includes('public record'), false);
  assert.match(out, /record RootNothing\(\) \{\}/);
});

test('java-record adds JsonProperty when the component name differs', () => {
  const out = lang('java-record').run(context([{ user_name: 1 }]));
  assert.match(out, /@JsonProperty\("user_name"\) Double userName,/);
});

/* ------------------------------------------------------------------ *
 * Go
 * ------------------------------------------------------------------ */

test('go-struct exports fields and tags them with the original keys', () => {
  assert.equal(lang('go-struct').run(small()), [
    'type Root struct {',
    '  Items []RootItemsItem `json:"items"`',
    '  Nothing RootNothing `json:"nothing"`',
    '  Blanks []any `json:"blanks"`',
    '}',
    '',
    'type RootItemsItem struct {',
    '  Sku string `json:"sku"`',
    '  Qty float64 `json:"qty"`',
    '  Note any `json:"note,omitempty"`',
    '  Tags []string `json:"tags"`',
    '  Meta RootItemsItemMeta `json:"meta,omitempty"`',
    '}',
    '',
    'type RootItemsItemMeta struct {',
    '  Deep bool `json:"deep"`',
    '}',
    '',
    'type RootNothing struct {',
    '}',
  ].join('\n'));
});

test('go-struct keeps the original key in the tag when PascalCasing changes it', () => {
  const out = lang('go-struct').run(context([{ user_name: 1 }]));
  assert.match(out, /UserName float64 `json:"user_name"`/);
});

/* ------------------------------------------------------------------ *
 * Python
 * ------------------------------------------------------------------ */

test('python-dataclass orders defaults last and imports only what it uses', () => {
  assert.equal(lang('python-dataclass').run(small()), [
    'from __future__ import annotations',
    '',
    'from dataclasses import dataclass',
    'from typing import Any, Optional',
    '',
    '@dataclass',
    'class Root:',
    '  items: list[RootItemsItem]',
    '  nothing: RootNothing',
    '  blanks: list[Any]',
    '',
    '@dataclass',
    'class RootItemsItem:',
    '  sku: str',
    '  qty: float',
    '  tags: list[str]',
    '  note: Any = None',
    '  meta: Optional[RootItemsItemMeta] = None',
    '',
    '@dataclass',
    'class RootItemsItemMeta:',
    '  deep: bool',
    '',
    '@dataclass',
    'class RootNothing:',
    '  pass',
  ].join('\n'));
});

test('python-typeddict marks optional keys NotRequired and stays total', () => {
  const out = lang('python-typeddict').run(small());
  assert.match(out, /from typing import Any, NotRequired, TypedDict/);
  assert.match(out, /# NotRequired needs Python 3\.11\+/);
  assert.match(out, /class Root\(TypedDict, total=True\):\n {2}items: list\[RootItemsItem\]/);
  // `note` can be missing or null, `meta` can only be missing: it is never null.
  assert.match(out, / {2}note: NotRequired\[Any\]/);
  assert.match(out, / {2}meta: NotRequired\[RootItemsItemMeta\]/);
  assert.match(out, /class RootNothing\(TypedDict, total=True\):\n {2}pass/);
});

test('python property names are snake_cased and empty objects become pass', () => {
  const out = lang('python-dataclass').run(context([{ userId: 1, nothing: {} }]));
  assert.match(out, / {2}user_id: float/);
  assert.match(out, /class RootNothing:\n {2}pass/);
});

/* ------------------------------------------------------------------ *
 * Swift
 * ------------------------------------------------------------------ */

test('swift-struct uses let, ? for optional keys and AnyCodable for unknown', () => {
  const out = lang('swift-struct').run(small());
  assert.match(out, /struct Root: Codable \{\n {2}let items: \[RootItemsItem\]\n {2}let nothing: RootNothing\n {2}let blanks: \[AnyCodable\]\n\}/);
  assert.match(out, /struct RootItemsItem: Codable \{\n {2}let sku: String\n {2}let qty: Double\n {2}let note: AnyCodable\?\n {2}let tags: \[String\]\n {2}let meta: RootItemsItemMeta\?\n\}/);
  assert.match(out, /struct RootNothing: Codable \{\n\}/);
  assert.match(out, /AnyCodable is not in the standard library/);
  // Every key here is already camelCase, so no CodingKeys note is needed.
  assert.doesNotMatch(out, /CodingKeys/);
});

test('swift-struct notes where a renamed key needs CodingKeys', () => {
  const out = lang('swift-struct').run(context([{ user_name: 1 }]));
  assert.match(out, /let userName: Double/);
  assert.match(out, /CodingKeys/);
});

/* ------------------------------------------------------------------ *
 * Rust
 * ------------------------------------------------------------------ */

test('rust-struct wraps optional keys in Option and renames changed keys', () => {
  assert.equal(lang('rust-struct').run(small()), [
    '// Requires: use serde::{Deserialize, Serialize}; serde_json::Value needs the serde_json crate.',
    '',
    '#[derive(Serialize, Deserialize)]',
    'pub struct Root {',
    '  pub items: Vec<RootItemsItem>,',
    '  pub nothing: RootNothing,',
    '  pub blanks: Vec<serde_json::Value>,',
    '}',
    '',
    '#[derive(Serialize, Deserialize)]',
    'pub struct RootItemsItem {',
    '  pub sku: String,',
    '  pub qty: f64,',
    '  pub note: Option<serde_json::Value>,',
    '  pub tags: Vec<String>,',
    '  pub meta: Option<RootItemsItemMeta>,',
    '}',
    '',
    '#[derive(Serialize, Deserialize)]',
    'pub struct RootItemsItemMeta {',
    '  pub deep: bool,',
    '}',
    '',
    '#[derive(Serialize, Deserialize)]',
    'pub struct RootNothing {',
    '}',
  ].join('\n'));
});

test('rust-struct snakes camelCase keys, renames them and escapes keywords', () => {
  const out = lang('rust-struct').run(context([{ userId: 1, type: 'x' }]));
  assert.match(out, /#\[serde\(rename = "userId"\)\]\n {2}pub user_id: f64,/);
  // A raw identifier is still `type` on the wire, so no rename attribute is needed.
  assert.doesNotMatch(out, /rename = "type"/);
  assert.match(out, /\n {2}pub r#type: String,/);
});

/* ------------------------------------------------------------------ *
 * Cases every language must survive
 * ------------------------------------------------------------------ */

test('every language names nested types from the key path and de-duplicates them', () => {
  // `user-name` and `user_name` both collapse to `RootUserName` once cased.
  const ctx = context([{ 'user-name': { x: 1 }, user_name: { y: 2 } }]);
  const csharp = lang('csharp-class').run(ctx);
  assert.match(csharp, /public class RootUserName\n\{[\s\S]*public class RootUserName2\n\{/);
  assert.match(csharp, /public RootUserName UserName \{ get; set; \}/);
  assert.match(csharp, /public RootUserName2 UserName2 \{ get; set; \}/);

  const rust = lang('rust-struct').run(ctx);
  assert.match(rust, /pub struct RootUserName \{/);
  assert.match(rust, /pub struct RootUserName2 \{/);
  assert.match(rust, /pub user_name: RootUserName,/);
  assert.match(rust, /#\[serde\(rename = "user_name"\)\]\n {2}pub user_name2: RootUserName2,/);
});

test('unions of primitives degrade to the language top type', () => {
  const ctx = context([{ u: 1 }, { u: 'a' }]);
  // `string | number` is not `unknown`, so C# gets the top type, not the
  // `Dictionary<string, object>` that stands in for a value nothing is known about.
  assert.match(lang('csharp-class').run(ctx), /public object U \{ get; set; \}/);
  assert.match(lang('kotlin-data').run(ctx), /val u: Any\?/);
  assert.match(lang('java-record').run(ctx), /Object u,/);
  assert.match(lang('go-struct').run(ctx), /U any `json:"u"`/);
  assert.match(lang('python-dataclass').run(ctx), /u: Any/);
  assert.match(lang('python-typeddict').run(ctx), /u: Any/);
  assert.match(lang('swift-struct').run(ctx), /let u: AnyCodable/);
  assert.match(lang('rust-struct').run(ctx), /pub u: serde_json::Value,/);
});

test('an unknown field becomes the language fallback', () => {
  // `undefined` is the one value `schemaOf` maps to an unknown node.
  const ctx = context([{ known: 'abc', mystery: undefined }]);
  assert.match(lang('csharp-class').run(ctx), /public Dictionary<string, object> Mystery \{ get; set; \}/);
  assert.match(lang('go-struct').run(ctx), /Mystery map\[string\]any `json:"mystery"`/);
  assert.match(lang('python-dataclass').run(ctx), /mystery: Any/);
  assert.match(lang('swift-struct').run(ctx), /let mystery: AnyCodable/);
  assert.match(lang('rust-struct').run(ctx), /pub mystery: serde_json::Value,/);
});

test('a nullable array is optional at the container level too', () => {
  const ctx = context([{ tags: null }, { tags: ['a'] }]);
  assert.match(lang('csharp-class').run(ctx), /public List<string>\? Tags \{ get; set; \}/);
  assert.match(lang('kotlin-data').run(ctx), /val tags: List<String>\? = null,/);
  assert.match(lang('rust-struct').run(ctx), /pub tags: Option<Vec<String>>,/);
  assert.match(lang('python-dataclass').run(ctx), /tags: Optional\[list\[str\]\] = None/);
  assert.match(lang('swift-struct').run(ctx), /let tags: \[String\]\?/);
});

test('arrays of arrays keep their depth', () => {
  const ctx = context([{ grid: [[1, 2]] }]);
  assert.match(lang('csharp-class').run(ctx), /public List<List<double>> Grid \{ get; set; \}/);
  assert.match(lang('go-struct').run(ctx), /Grid \[\]\[\]float64 `json:"grid"`/);
  assert.match(lang('python-dataclass').run(ctx), /grid: list\[list\[float\]\]/);
  assert.match(lang('rust-struct').run(ctx), /pub grid: Vec<Vec<f64>>,/);
  assert.match(lang('swift-struct').run(ctx), /let grid: \[\[Double\]\]/);
});

test('arrays mixing objects with scalars never extract a type that is then dropped', () => {
  const ctx = context([{ stuff: [{ a: 1 }, 5] }]);
  const csharp = lang('csharp-class').run(ctx);
  assert.match(csharp, /public JsonElement Stuff \{ get; set; \}/);
  assert.doesNotMatch(csharp, /class RootStuffItem/);
  assert.match(lang('go-struct').run(ctx), /Stuff \[\]any `json:"stuff"`/);
});

test('the root may be an array of records or hold no keys at all', () => {
  const arrayRoot = context([[{ a: 1 }, { b: 'x' }]]);
  assert.match(lang('csharp-class').run(arrayRoot), /public class Root\n\{\n {2}\[JsonPropertyName\("a"\)\]\n {2}public double\? A \{ get; set; \}/);
  assert.match(lang('go-struct').run(arrayRoot), /A float64 `json:"a,omitempty"`/);

  const empty = context([{}]);
  assert.match(lang('csharp-class').run(empty), /public class Root\n\{\n\}/);
  assert.match(lang('java-record').run(empty), /record Root\(\) \{\}/);
  assert.match(lang('go-struct').run(empty), /type Root struct \{\n\}/);
  assert.match(lang('python-dataclass').run(empty), /@dataclass\nclass Root:\n {2}pass/);
  assert.match(lang('python-typeddict').run(empty), /class Root\(TypedDict, total=True\):\n {2}pass/);
  assert.match(lang('swift-struct').run(empty), /struct Root: Codable \{\n\}/);
  assert.match(lang('rust-struct').run(empty), /pub struct Root \{\n\}/);
});

test('no formatter throws on degenerate documents', () => {
  const documents = [
    null, 5, 'scalar', true, {}, [], [[]], [{}], [[[]]], [{ a: 1 }], [[{ a: 1 }]],
    [{ a: [1, 'x', null] }], [{ 'a b': { 'c"d': null } }], [{ a: undefined }], [null, { a: 1 }],
  ];
  const allFormatters = [...sqlFormatters, ...yamlFormatters, ...codeFormatters];

  for (const doc of documents) {
    const ctx = context([doc, { extra: doc }], { tableName: 'odd table' });
    for (const formatter of allFormatters) {
      const out = formatter.run(ctx);
      assert.equal(typeof out, 'string', `${formatter.id} must return a string for ${JSON.stringify(doc)}`);
    }
  }
  assert.equal(allFormatters.length, 12);
});
