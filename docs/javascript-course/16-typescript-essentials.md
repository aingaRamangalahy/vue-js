# 16 — TypeScript Essentials

> **Difficulty**: Advanced  
> **Key files**: `packages/shared/src/typeUtils.ts`, `packages/reactivity/src/index.ts`, `packages/runtime-core/src/helpers/renderList.ts`

## What You'll Learn

- TypeScript basics for reading the Vue codebase
- Generics — parameterized types
- Type guards and type narrowing
- Conditional types and mapped types
- Advanced utility types used in Vue
- Enums and const enums

---

## Why TypeScript?

The Vue.js codebase is written entirely in TypeScript. TypeScript adds **static types** to JavaScript — catching bugs at compile time instead of runtime. You need to understand TypeScript to read or contribute to this codebase.

---

## Basic Type Annotations

```ts
// packages/shared/src/general.ts

export const isString = (val: unknown): val is string => typeof val === 'string'
//     ^^^^^^^^            ^^^^^^^^^^^^^^^^
//     parameter type      return type (type guard)
```

| Syntax          | Meaning                                            |
| --------------- | -------------------------------------------------- |
| `val: unknown`  | Parameter `val` is type `unknown`                  |
| `=> boolean`    | Function returns a boolean                         |
| `val is string` | Type guard: if true, `val` is narrowed to `string` |

---

## Type Guards

Type guards are functions that narrow types. Vue defines many:

```ts
// packages/shared/src/general.ts

export const isFunction = (val: unknown): val is Function =>
  typeof val === 'function'

export const isObject = (val: unknown): val is Record<any, any> =>
  val !== null && typeof val === 'object'

export const isPromise = <T = any>(val: unknown): val is Promise<T> => {
  return (
    (isObject(val) || isFunction(val)) &&
    isFunction((val as any).then) &&
    isFunction((val as any).catch)
  )
}
```

After calling a type guard, TypeScript narrows the type:

```ts
function process(val: unknown) {
  if (isString(val)) {
    val.toUpperCase() // TypeScript knows val is string here!
  }
  if (isArray(val)) {
    val.length // TypeScript knows val is array here!
  }
}
```

---

## Generics

Generics are "type parameters" — they let you write code that works with any type:

```ts
// packages/reactivity/src/ref.ts

class RefImpl<T = any> {
  // T is a type parameter, defaults to any
  _value: T // _value has the same type as the ref
  private _rawValue: T

  constructor(value: T, isShallow: boolean) {
    this._rawValue = isShallow ? value : toRaw(value)
    this._value = isShallow ? value : toReactive(value)
  }

  get value(): T {
    // Returns T
    this.dep.track()
    return this._value
  }

  set value(newValue: T) {
    // Accepts T
    // ...
  }
}
```

When you write `ref(42)`, TypeScript infers `T = number`, so `ref.value` is typed as `number`.

### Generic Functions

```ts
// packages/shared/src/general.ts

const cacheStringFunction = <T extends (str: string) => string>(fn: T): T => {
  // T is constrained to functions that take and return strings
  const cache: Record<string, string> = Object.create(null)
  return ((str: string) => {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  }) as T
}
```

`<T extends (str: string) => string>` means: "T must be a function that takes a string and returns a string."

---

## Function Overloads

```ts
// packages/runtime-core/src/helpers/renderList.ts

// Multiple signatures (overloads)
export function renderList(
  source: string,
  renderItem: (value: string, index: number) => VNodeChild,
): VNodeChild[]

export function renderList(
  source: number,
  renderItem: (value: number, index: number) => VNodeChild,
): VNodeChild[]

export function renderList<T>(
  source: T[],
  renderItem: (value: T, index: number) => VNodeChild,
): VNodeChild[]

// Implementation signature (not visible to callers)
export function renderList(
  source: any,
  renderItem: (...args: any[]) => VNodeChild,
  cache?: any[],
  index?: number,
): VNodeChild[] {
  // ... implementation
}
```

Overloads let you define different type relationships for different arguments. When called with a string source, the renderItem callback receives strings. When called with an array, it receives array elements.

---

## Advanced Utility Types

Vue defines powerful type utilities:

```ts
// packages/shared/src/typeUtils.ts

export type Prettify<T> = { [K in keyof T]: T[K] } & {}
```

`Prettify` forces TypeScript to expand/flatten an intersection type in tooltips. Instead of seeing `Pick<A, 'x'> & Omit<B, 'y'>`, you see the actual resolved shape.

### UnionToIntersection

```ts
export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never
```

This transforms `A | B | C` into `A & B & C`. It uses a clever trick:

1. Distributes the union through a contravariant position (function parameter)
2. Infers the intersection from the resulting function type

### IfAny

```ts
export type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N
```

Detects if `T` is `any`. If `T` is `any`, then `1 & T` is `any`, and `0 extends any` is true. For any other type, `0 extends 1 & T` is false.

### LooseRequired

```ts
export type LooseRequired<T> = { [P in keyof (T & Required<T>)]: T[P] }
```

Makes all properties required while keeping their original types (including `undefined`).

---

## Enums

```ts
// packages/shared/src/shapeFlags.ts

export enum ShapeFlags {
  ELEMENT = 1,
  FUNCTIONAL_COMPONENT = 1 << 1,
  STATEFUL_COMPONENT = 1 << 2,
  // ...
}
```

**Enums** create named constants. At runtime, they become objects:

```js
// Compiled output:
var ShapeFlags
;(function (ShapeFlags) {
  ShapeFlags[(ShapeFlags['ELEMENT'] = 1)] = 'ELEMENT'
  // ...
})(ShapeFlags || (ShapeFlags = {}))
```

### Const Enums (Inlined)

```ts
// If declared as:
const enum ShapeFlags {
  ELEMENT = 1,
}

// Usage: if (flag & ShapeFlags.ELEMENT)
// Compiles to: if (flag & 1)  — no runtime enum object!
```

Vue uses regular enums (not const) because const enums don't work across package boundaries.

---

## Type-Only Imports

```ts
// packages/reactivity/src/reactive.ts

import type { Ref, UnwrapRefSimple } from './ref'
```

`import type` imports ONLY the TypeScript type — nothing at runtime. This:

- Eliminates the import from compiled JavaScript
- Breaks circular dependency chains
- Makes it clear what's used for types vs values

---

## The `as` Keyword (Type Assertion)

```ts
// packages/runtime-core/src/scheduler.ts

const resolvedPromise = /*@__PURE__*/ Promise.resolve() as Promise<any>
```

`as Promise<any>` tells TypeScript: "Trust me, I know what type this is." Use sparingly — it bypasses type checking.

### Double Assertion

```ts
export const Fragment = Symbol.for('v-fgt') as any as {
  __isFragment: true
  new (): { $props: VNodeProps }
}
```

`as any as { ... }` is a double assertion — first to `any` (which accepts everything), then to the target type. This is needed when the original and target types are incompatible. Vue uses this to give `Fragment` (a symbol) a component-like type interface.

---

## Conditional Types

```ts
// packages/reactivity/src/reactive.ts

export type DeepReadonly<T> = T extends Builtin
  ? T // Primitives are returned as-is
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends Set<infer U>
      ? ReadonlySet<DeepReadonly<U>>
      : T extends Promise<infer U>
        ? Promise<DeepReadonly<U>>
        : T extends {}
          ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
          : Readonly<T>
```

Conditional types (`A extends B ? X : Y`) enable type-level branching. `DeepReadonly` recursively makes every property `readonly`, handling Maps, Sets, Promises, and plain objects differently.

`infer` captures a type variable inside a conditional:

```ts
T extends Map<infer K, infer V>
//                     ^^^^^^^
// If T is a Map, capture its key type as K and value type as V
```

---

## Mapped Types

```ts
// A Mapped Type transforms each property
type Readonly<T> = { readonly [K in keyof T]: T[K] }

// Prettify uses a mapped type
export type Prettify<T> = { [K in keyof T]: T[K] } & {}
```

`[K in keyof T]` iterates over every key `K` of `T`, applying a transformation.

---

## Exercises

1. **Read a complex type**: What does this compute?

   ```ts
   type Result = UnionToIntersection<{ a: 1 } | { b: 2 }>
   // Answer: { a: 1 } & { b: 2 } = { a: 1, b: 2 }
   ```

2. **Write a type guard** for checking if a value is a non-empty array:

   ```ts
   function isNonEmpty<T>(arr: T[]): arr is [T, ...T[]] {
     return arr.length > 0
   }
   ```

3. **Find all `export type`** declarations in `packages/reactivity/src/index.ts`. Which types are exported alongside their runtime values?

4. **Why `import type`?** Find a circular import in the reactivity package and explain how `import type` resolves it.

---

## Key Takeaways

1. Type guards (`val is T`) narrow types after conditional checks
2. Generics (`<T>`) make functions/classes work with any type
3. Function overloads define different type relationships per call pattern
4. `import type` eliminates runtime imports — crucial for circular dependencies
5. Conditional types enable type-level logic (`T extends X ? A : B`)
6. Vue's utility types (`Prettify`, `UnionToIntersection`, `IfAny`) solve common type problems

**Next**: [17 — Design Patterns](./17-design-patterns)
