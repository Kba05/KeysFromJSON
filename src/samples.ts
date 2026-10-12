/**
 * Sample documents.
 *
 * Each one exists to make a different behaviour visible: nested objects, arrays
 * of objects whose keys disagree, primitives in arrays, nulls, NDJSON, and a
 * root-level array. The Sample button cycles through them.
 */

export const SAMPLES = [
  {
    id: 'api-response',
    label: 'API response',
    note: 'Nested objects, an array of records and a nullable field',
    text: `{
  "id": 1042,
  "created_at": "2024-05-11T09:12:44Z",
  "user": {
    "id": 7,
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "address": {
      "city": "London",
      "postcode": "N1 9GU",
      "geo": { "lat": 51.5338, "lon": -0.1055 }
    }
  },
  "items": [
    { "sku": "A-1", "title": "Keyboard", "qty": 1, "price": 89.9, "discount": null },
    { "sku": "B-2", "title": "Mouse", "qty": 2, "price": 24.5 }
  ],
  "tags": ["hardware", "peripherals"],
  "meta": { "page": 1, "per_page": 25, "total": 2 }
}`,
  },
  {
    id: 'heterogeneous',
    label: 'Messy records',
    note: 'Keys that only appear in some array elements, plus mixed types',
    text: `{
  "records": [
    { "id": 1, "name": "first", "score": 10, "active": true },
    { "id": 2, "name": "second", "score": "n/a", "note": "text instead of a number" },
    { "id": 3, "name": "third", "score": 30, "active": null, "nested": { "deep": { "value": 1 } } }
  ],
  "empty_object": {},
  "empty_array": [],
  "numbers": [1, 2, 3]
}`,
  },
  {
    id: 'config',
    label: 'Config file',
    note: 'Deep nesting, the shape most often turned into a TypeScript type',
    text: `{
  "server": {
    "host": "0.0.0.0",
    "port": 8080,
    "tls": { "enabled": true, "cert": "/etc/ssl/cert.pem", "key": "/etc/ssl/key.pem" },
    "timeouts": { "read": 30, "write": 30, "idle": 120 }
  },
  "database": {
    "primary": { "url": "postgres://localhost/app", "pool": { "min": 2, "max": 10 } },
    "replicas": [{ "url": "postgres://replica-1/app" }, { "url": "postgres://replica-2/app" }]
  },
  "features": { "new_checkout": false, "beta_search": true },
  "logging": { "level": "info", "handlers": ["stdout", "file"] }
}`,
  },
  {
    id: 'ndjson',
    label: 'NDJSON log',
    note: 'One document per line — parsed as several documents',
    text: `{"level":"info","ts":1715412345,"msg":"started","service":"api","port":8080}
{"level":"warn","ts":1715412350,"msg":"slow query","service":"api","duration_ms":812,"query":"SELECT 1"}
{"level":"error","ts":1715412360,"msg":"request failed","service":"api","status":500,"path":"/orders","err":{"code":"ECONNRESET","retryable":true}}`,
  },
  {
    id: 'root-array',
    label: 'Root array',
    note: 'A top-level array of records, with no wrapping object',
    text: `[
  { "id": 1, "login": "kba", "roles": ["admin"], "profile": { "avatar": null, "bio": "" } },
  { "id": 2, "login": "guest", "roles": [], "profile": { "avatar": "a.png" } }
]`,
  },
];
