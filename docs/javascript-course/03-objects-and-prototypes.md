# 03 — Objects & Prototypes

> **Difficulty**: Beginner → Intermediate  
> **Key files**: `packages/shared/src/general.ts`, `packages/shared/src/makeMap.ts`

## What You'll Learn

- How JavaScript objects really work
- The prototype chain
- `Object.create`, `Object.defineProperty`, `Object.freeze`
- Property descriptors and why they matter for Vue's reactivity

---

## Objects: The Foundation

In JavaScript, almost everything is an object. Objects are collections of key-value pairs (called "properties").

### Object Literals

```ts
// packages/shared/src/general.ts

export const EMPTY_OBJ: { readonly [key: string]: any } = __DEV__
  ? Object.freeze({})
  : {}
```

`{}` is an object literal — the simplest way to create an object. But notice Vue does something special: in development mode (`__DEV__`), it freezes the object so any accidental writes throw an error.

---

## Object.create(null) — The Prototype-Free Object

This is one of the most important patterns in Vue:

```ts
// packages/shared/src/makeMap.ts

export function makeMap(str: string): (key: string) => boolean {
  const map = Object.create(null) // No prototype!
  for (const key of str.split(',')) map[key] = 1
  return val => val in map
}
```

### Why `Object.create(null)` instead of `{}`?

```js
// Regular object inherits from Object.prototype
const regular = {}
'toString' in regular // true! (inherited from prototype)
'constructor' in regular // true! (inherited from prototype)

// Object.create(null) has NO prototype
const clean = Object.create(null)
'toString' in clean // false (no prototype chain)
'constructor' in clean // false (truly empty)
```

When using `in` to check membership (like `val in map`), inherited properties from `Object.prototype` would cause false positives. `Object.create(null)` creates a truly empty lookup table.

### Caching with Object.create(null)

```ts
// packages/shared/src/general.ts

const cacheStringFunction = <T extends (str: string) => string>(fn: T): T => {
  const cache: Record<string, string> = Object.create(null)
  return ((str: string) => {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  }) as T
}
```

The cache uses `Object.create(null)` because cached keys could be ANY string — including `"toString"`, `"constructor"`, etc.

---

## Object.defineProperty — Controlling Properties

This is **critical** for understanding Vue's internals. `Object.defineProperty` lets you control exactly how a property behaves.

```ts
// packages/shared/src/general.ts

export const def = (
  obj: object,
  key: string | symbol,
  value: any,
  writable = false,
): void => {
  Object.defineProperty(obj, key, {
    configurable: true, // Can this property be deleted/reconfigured?
    enumerable: false, // Will it show up in for...in loops?
    writable, // Can the value be changed?
    value, // The actual value
  })
}
```

### Property Descriptor Fields

Every property has a "descriptor" with these fields:

| Field          | Default     | Meaning                                                     |
| -------------- | ----------- | ----------------------------------------------------------- |
| `value`        | `undefined` | The property's value                                        |
| `writable`     | `true`      | Can the value be changed?                                   |
| `enumerable`   | `true`      | Visible in `for...in` and `Object.keys()`?                  |
| `configurable` | `true`      | Can the descriptor be changed? Can the property be deleted? |
| `get`          | `undefined` | Getter function (accessor descriptor)                       |
| `set`          | `undefined` | Setter function (accessor descriptor)                       |

> **Important**: A descriptor is either a "data descriptor" (`value`/`writable`) OR an "accessor descriptor" (`get`/`set`) — never both.

### Why Vue's `def` Sets `enumerable: false`

```ts
Object.defineProperty(obj, key, {
  enumerable: false, // HIDDEN property
  value,
})
```

Vue attaches internal metadata to objects (like `__v_isReactive`, `__v_skip`). These should be invisible when users iterate over the object with `for...in` or `Object.keys()`.

---

## Object.freeze — Immutability

```ts
// packages/shared/src/general.ts

export const EMPTY_OBJ: { readonly [key: string]: any } = __DEV__
  ? Object.freeze({})
  : {}
export const EMPTY_ARR: readonly never[] = __DEV__ ? Object.freeze([]) : []
```

**`Object.freeze()`** makes an object completely immutable:

- Can't add new properties
- Can't remove existing properties
- Can't change existing property values

Vue uses it for `EMPTY_OBJ` and `EMPTY_ARR` in development mode so that accidentally mutating these shared sentinel values throws an error instead of causing subtle bugs.

**Why only in `__DEV__`?** `Object.freeze` has a small performance cost. In production, the objects are left unfrozen since the code should already be bug-free.

---

## hasOwn — Safe Property Checking

```ts
// packages/shared/src/general.ts

const hasOwnProperty = Object.prototype.hasOwnProperty
export const hasOwn = (
  val: object,
  key: string | symbol,
): key is keyof typeof val => hasOwnProperty.call(val, key)
```

### Why not just `obj.hasOwnProperty(key)`?

```js
// This can BREAK:
const obj = Object.create(null)
obj.hasOwnProperty('key') // TypeError! obj has no prototype, so no hasOwnProperty

// This is SAFE:
Object.prototype.hasOwnProperty.call(obj, 'key') // Always works
```

Vue caches the reference to `Object.prototype.hasOwnProperty` and uses `.call()` to invoke it safely on any object, even those created with `Object.create(null)`.

---

## extend (Object.assign)

```ts
// packages/shared/src/general.ts

export const extend: typeof Object.assign = Object.assign
```

Vue aliases `Object.assign` as `extend` — a shorter name used throughout the codebase.

```ts
// How Object.assign works:
const target = { a: 1 }
const source = { b: 2, c: 3 }
Object.assign(target, source)
// target is now { a: 1, b: 2, c: 3 }
```

**Key behavior**:

- Copies properties from source(s) to target
- Returns the target object
- Performs **shallow** copy (nested objects are still references)
- Later sources override earlier ones for same keys

---

## Prototype Chain

Every JavaScript object has a hidden link to another object called its **prototype**. When you access a property, JavaScript walks up this chain:

```
myObject → Object.prototype → null
```

### How Vue uses prototypes

```ts
// packages/reactivity/src/collectionHandlers.ts

const getProto = <T extends CollectionTypes>(v: T): any =>
  Reflect.getPrototypeOf(v)
```

When intercepting Map/Set operations with Proxy, Vue needs to access the original prototype methods. `Reflect.getPrototypeOf` is the modern, reliable way to get an object's prototype.

---

## The `in` Operator

```ts
// packages/shared/src/makeMap.ts

return val => val in map
```

The `in` operator checks if a property exists anywhere in the prototype chain:

```js
const obj = { name: 'Vue' }
'name' in obj // true (own property)
'toString' in obj // true (inherited from Object.prototype)
```

That's why `Object.create(null)` matters — no prototype means no false positives.

---

## Object.is — Reliable Equality

```ts
// packages/shared/src/general.ts

export const hasChanged = (value: any, oldValue: any): boolean =>
  !Object.is(value, oldValue)
```

`Object.is` is like `===`, but handles edge cases correctly:

| Comparison | `===`   | `Object.is` |
| ---------- | ------- | ----------- |
| `NaN, NaN` | `false` | `true`      |
| `+0, -0`   | `true`  | `false`     |
| `1, 1`     | `true`  | `true`      |

Vue uses this to detect when a reactive value has actually changed. Since `NaN === NaN` is `false`, using `===` would cause infinite update loops when a computed value produces `NaN`.

---

## Exercises

1. **Experiment with `Object.create(null)`**:

   ```js
   const clean = Object.create(null)
   clean.hello = 'world'
   console.log(Object.keys(clean)) // ?
   console.log('toString' in clean) // ?
   ```

2. **Use `Object.defineProperty`** to add a hidden counter to an object:

   ```js
   const obj = {}
   Object.defineProperty(obj, '_count', {
     value: 0,
     writable: true,
     enumerable: false,
   })
   console.log(Object.keys(obj)) // [] - _count is hidden!
   ```

3. **Find `def()` usage** in the codebase — what internal properties does Vue attach to objects?

4. **Understand the difference**: What would happen if `EMPTY_OBJ` wasn't frozen and two components both checked `props === EMPTY_OBJ` after one accidentally mutated it?

---

## Key Takeaways

1. `Object.create(null)` creates prototype-free objects, perfect for lookup tables
2. `Object.defineProperty` controls property visibility and mutability
3. `Object.freeze` makes objects immutable — great for dev-mode safety checks
4. Always use `Object.prototype.hasOwnProperty.call()` for safe property checking
5. `Object.is()` handles `NaN` and `-0` correctly, unlike `===`

**Next**: [04 — Arrays & Iteration](./04-arrays-and-iteration)
