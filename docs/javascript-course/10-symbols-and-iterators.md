# 10 — Symbols & Iterators

> **Difficulty**: Intermediate → Advanced  
> **Key files**: `packages/runtime-core/src/vnode.ts`, `packages/reactivity/src/constants.ts`

## What You'll Learn

- What Symbols are and why they exist
- `Symbol()` vs `Symbol.for()` — local vs global symbols
- Well-known symbols (`Symbol.iterator`, `Symbol.toStringTag`)
- The iterator and iterable protocols
- How Vue uses symbols extensively for internal markers

---

## What Are Symbols?

A **Symbol** is a unique, immutable primitive value. Even two symbols with the same description are different:

```js
const a = Symbol('id')
const b = Symbol('id')
a === b // false! Each Symbol() call creates a unique value
```

Symbols are used as:

1. **Unique property keys** that can't collide with string keys
2. **Internal markers** that don't show up in normal iteration
3. **Well-known hooks** that customize object behavior

---

## Symbols in Vue: Internal Markers

### VNode Type Symbols

```ts
// packages/runtime-core/src/vnode.ts

export const Fragment = Symbol.for('v-fgt') as any as {
  __isFragment: true
  new (): { $props: VNodeProps }
}
export const Text: unique symbol = Symbol.for('v-txt')
export const Comment: unique symbol = Symbol.for('v-cmt')
export const Static: unique symbol = Symbol.for('v-stc')
```

Vue uses these symbols to identify different types of virtual nodes:

- `Fragment` — a group of children without a wrapper element
- `Text` — a text node
- `Comment` — an HTML comment node
- `Static` — a static (never changing) subtree

### Why Symbols Instead of Strings?

```js
// With strings — risk of collision
vnode.type = 'text' // Could conflict with an HTML tag named "text"!

// With symbols — guaranteed unique
vnode.type = Text // Symbol.for('v-txt') — no collision possible
```

---

## `Symbol()` vs `Symbol.for()`

### `Symbol()` — Creates a Unique, Local Symbol

```ts
// packages/runtime-core/src/components/BaseTransition.ts

export const leaveCbKey: unique symbol = Symbol('_leaveCb')
const enterCbKey: unique symbol = Symbol('_enterCb')
```

`Symbol('_leaveCb')` creates a brand new symbol every time. The string is just a description for debugging.

### `Symbol.for()` — Creates/Reuses a Global Symbol

```ts
// packages/runtime-core/src/vnode.ts

export const Text: unique symbol = Symbol.for('v-txt')
```

`Symbol.for('v-txt')` checks a **global symbol registry**:

- If a symbol with key `'v-txt'` already exists, return it
- Otherwise, create one and register it

This is useful when the same symbol needs to be shared across different bundles or iframes.

### When to Use Which

| Use Case                     | Symbol Type             |
| ---------------------------- | ----------------------- |
| Private internal markers     | `Symbol('description')` |
| Cross-bundle/iframe identity | `Symbol.for('key')`     |
| Well-known protocols         | `Symbol.iterator`, etc. |

---

## Reactive Flags — Symbols as Object Markers

```ts
// packages/reactivity/src/constants.ts

export enum ReactiveFlags {
  SKIP = '__v_skip',
  IS_REACTIVE = '__v_isReactive',
  IS_READONLY = '__v_isReadonly',
  IS_SHALLOW = '__v_isShallow',
  RAW = '__v_raw',
  IS_REF = '__v_isRef',
}
```

While these are strings (not symbols), they serve the same purpose — internal markers. Vue prefixes them with `__v_` to avoid collisions with user properties.

They're checked in proxy handlers:

```ts
// packages/reactivity/src/baseHandlers.ts

get(target: Target, key: string | symbol, receiver: object): any {
  if (key === ReactiveFlags.IS_REACTIVE) {
    return !isReadonly
  } else if (key === ReactiveFlags.IS_READONLY) {
    return isReadonly
  } else if (key === ReactiveFlags.IS_SHALLOW) {
    return isShallow
  } else if (key === ReactiveFlags.RAW) {
    return target   // Return the original object
  }
  // ... normal property access
}
```

---

## SSR Context Key

```ts
// packages/runtime-core/src/helpers/useSsrContext.ts

export const ssrContextKey: unique symbol = Symbol.for('v-scx')
```

Used with Vue's `provide`/`inject` system. Symbols ensure injection keys never collide with user-defined keys.

---

## Well-Known Symbols

JavaScript has built-in symbols that let you customize object behavior:

### `Symbol.iterator` — Making Objects Iterable

```ts
// packages/runtime-core/src/helpers/renderList.ts

if (source[Symbol.iterator as any]) {
  // Source is iterable — use Array.from
  ret = Array.from(source as Iterable<any>, (item, i) => {
    return renderItem(item, i, undefined, cached && cached[i])
  })
}
```

Vue checks for `Symbol.iterator` to determine if a value can be iterated with `for...of`. Maps, Sets, and custom iterables all have this symbol.

### The Iterator Protocol

An object is **iterable** if it has a `[Symbol.iterator]()` method that returns an **iterator**:

```js
const iterable = {
  [Symbol.iterator]() {
    let i = 0
    return {
      next() {
        return i < 3 ? { value: i++, done: false } : { done: true }
      },
    }
  },
}

for (const val of iterable) {
  console.log(val) // 0, 1, 2
}
```

### Where Vue Uses Iterators

```ts
// packages/reactivity/src/collectionHandlers.ts

function createIterableMethod(
  method: string | symbol,
  isReadonly: boolean,
  isShallow: boolean,
) {
  return function (
    this: IterableCollections,
    ...args: unknown[]
  ): Iterable<unknown> & Iterator<unknown> {
    const target = this[ReactiveFlags.RAW]
    const rawTarget = toRaw(target)
    const targetIsMap = isMap(rawTarget)
    const isPair =
      method === 'entries' || (method === Symbol.iterator && targetIsMap)
    // ...returns a reactive iterator
  }
}
```

Vue wraps the native iterator of reactive Maps/Sets so that iteration automatically tracks dependencies.

---

## Built-in Symbols Used in Vue

```ts
// packages/reactivity/src/baseHandlers.ts

const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .filter(key => key !== 'arguments' && key !== 'caller')
    .map(key => (Symbol as any)[key])
    .filter(isSymbol),
)
```

Vue collects ALL built-in symbols (`Symbol.iterator`, `Symbol.toPrimitive`, `Symbol.toStringTag`, etc.) into a Set. When a reactive proxy's `get` trap is triggered with a built-in symbol, Vue skips dependency tracking — these are internal operations that shouldn't trigger reactivity.

---

## `unique symbol` — TypeScript Type Narrowing

```ts
export const Text: unique symbol = Symbol.for('v-txt')
```

`unique symbol` is a TypeScript type that represents a specific, individual symbol. It provides stronger type checking:

```ts
const a: unique symbol = Symbol('a')
const b: unique symbol = Symbol('b')
// TypeScript knows a and b are DIFFERENT types
```

---

## Exercises

1. **Create a custom iterable** that yields Fibonacci numbers:

   ```js
   const fibonacci = {
     [Symbol.iterator]() {
       let [a, b] = [0, 1]
       return {
         next() {
           ;[a, b] = [b, a + b]
           return { value: a, done: false }
         },
       }
     },
   }
   // for (const n of fibonacci) { ... } — careful, it's infinite!
   ```

2. **Find all `Symbol.for` calls** in the codebase. What naming convention does Vue use for global symbols?

3. **Why does Vue use `Symbol.for` for VNode types** but `Symbol()` for transition callbacks?

4. **Check the builtInSymbols Set**: What happens when you access `reactiveObj[Symbol.iterator]`? Does it trigger dependency tracking?

---

## Key Takeaways

1. Symbols are unique primitives — perfect for collision-free property keys
2. `Symbol()` creates a unique local symbol; `Symbol.for()` uses a global registry
3. `Symbol.iterator` makes objects work with `for...of`, spread, and destructuring
4. Vue uses symbols for VNode types, injection keys, and internal markers
5. Built-in symbols are excluded from reactive dependency tracking
6. `unique symbol` in TypeScript provides individual symbol type checking

**Next**: [11 — Proxy & Reflect](./11-proxy-and-reflect)
