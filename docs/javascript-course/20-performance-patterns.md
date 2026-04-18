# 20 — Performance Patterns

> **Difficulty**: Expert  
> **Key files**: Throughout the codebase

## What You'll Learn

- Tree-shaking and dead code elimination
- Caching strategies
- Efficient data structures
- Dev-mode vs production optimizations
- Compiler-assisted runtime optimization
- Memory management patterns

---

## 1. Tree-Shaking: `/*@__PURE__*/` Annotations

Tree-shaking removes unused code from bundles. But bundlers can't always tell if a function call has side effects. Vue helps with explicit annotations:

```ts
// packages/shared/src/general.ts

export const isReservedProp: (key: string) => boolean = /*@__PURE__*/ makeMap(
  ',key,ref,ref_for,ref_key,' +
    'onVnodeBeforeMount,onVnodeMounted,' +
    'onVnodeBeforeUpdate,onVnodeUpdated,' +
    'onVnodeBeforeUnmount,onVnodeUnmounted',
)
```

Without `/*@__PURE__*/`, the bundler sees `makeMap(...)` being called and thinks "this might have side effects, I must keep it." With the annotation, the bundler knows "if nobody uses `isReservedProp`, I can remove this entire call."

### More Examples

```ts
// packages/runtime-core/src/scheduler.ts
const resolvedPromise = /*@__PURE__*/ Promise.resolve() as Promise<any>

// packages/runtime-core/src/componentProps.ts
const isSimpleType = /*@__PURE__*/ makeMap(
  'String,Number,Boolean,Function,Symbol,BigInt',
)
```

**Rule**: Any module-level function call that produces a constant should be annotated with `/*@__PURE__*/`.

---

## 2. `__DEV__` — Conditional Compilation

```ts
// packages/shared/src/general.ts

export const EMPTY_OBJ: { readonly [key: string]: any } = __DEV__
  ? Object.freeze({})
  : {}
export const EMPTY_ARR: readonly never[] = __DEV__ ? Object.freeze([]) : []
```

`__DEV__` is replaced at build time:

- **Development**: `__DEV__` → `true` → includes warnings, freezing, detailed errors
- **Production**: `__DEV__` → `false` → dead code elimination removes the dev branch

### Entire Blocks Removed

```ts
if (__DEV__) {
  // This entire block is removed in production:
  // - Validation checks
  // - Warning messages
  // - Detailed error info
  // - Performance tracing
  warn(`Component ${name} is missing required prop: ${key}`)
}
```

In production, the bundler sees `if (false) { ... }` and removes it entirely. This means:

- **Zero runtime cost** for dev-only features
- **Smaller bundle size** in production
- **Detailed errors** during development

### Error Messages: Dev vs Production

```ts
// packages/runtime-core/src/errorHandling.ts

const errorInfo = __DEV__
  ? ErrorTypeStrings[type] // "setup function"
  : `https://vuejs.org/error-reference/#runtime-${type}` // Short URL
```

Dev: human-readable string. Production: a URL. The URL is shorter, reducing bundle size, but still lets developers look up the error.

---

## 3. Caching Strategies

### String Function Cache

```ts
// packages/shared/src/general.ts

const cacheStringFunction = <T extends (str: string) => string>(fn: T): T => {
  const cache: Record<string, string> = Object.create(null)
  return ((str: string) => {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  }) as T
}

export const camelize = cacheStringFunction(...)
export const hyphenate = cacheStringFunction(...)
export const capitalize = cacheStringFunction(...)
```

These transform functions are called thousands of times with the same inputs (prop names, event names). Caching avoids regex processing on repeated calls.

### WeakMap Cache for Object Association

```ts
// packages/reactivity/src/reactive.ts

export const reactiveMap: WeakMap<Target, any> = new WeakMap()
```

Associates objects with their proxies. WeakMap ensures garbage collection works properly — no memory leaks.

### Props Normalization Cache

```ts
// packages/runtime-core/src/componentProps.ts

const mixinPropsCache = new WeakMap<ConcreteComponent, NormalizedPropsOptions>()
```

Props are normalized once per component definition and cached. Since many instances share the same definition, this avoids redundant work.

---

## 4. Efficient Data Structures

### Doubly-Linked Lists (Dep Tracking)

```ts
// packages/reactivity/src/dep.ts

export class Link {
  nextDep?: Link
  prevDep?: Link
  nextSub?: Link
  prevSub?: Link

  constructor(
    public sub: Subscriber,
    public dep: Dep,
  ) {
    this.version = dep.version
  }
}
```

**Why linked lists instead of arrays?**

- O(1) insertion and removal (vs O(n) for array splice)
- No memory reallocation when growing
- Efficient bidirectional traversal

**Why not Map/Set?**

- Lower memory overhead (no hash table)
- No garbage collection pressure from rehashing
- Version-based stale detection is simpler

### Bitwise Flags (State Machine)

```ts
// packages/reactivity/src/effect.ts

flags: EffectFlags = EffectFlags.ACTIVE | EffectFlags.TRACKING

// Check: single CPU instruction
if (this.flags & EffectFlags.RUNNING) { ... }

// Set: single CPU instruction
this.flags |= EffectFlags.RUNNING

// Clear: single CPU instruction
this.flags &= ~EffectFlags.RUNNING
```

One number stores 8+ boolean states. Faster than checking object properties.

---

## 5. Lazy Evaluation

### Lazy Deep Reactivity

```ts
// packages/reactivity/src/baseHandlers.ts

get(target, key, receiver) {
  const res = Reflect.get(target, key, receiver)

  if (isObject(res)) {
    return isReadonly ? readonly(res) : reactive(res)  // Wrap on access!
  }

  return res
}
```

Vue doesn't recursively proxy an entire object tree upfront. It only wraps nested objects when they're accessed. If you have a deeply nested object but only read the top-level properties, the deep properties are never proxied.

### Lazy Computed

```ts
// packages/reactivity/src/computed.ts

get value(): T {
  refreshComputed(this)    // Only recompute if dirty!
  return this._value
}
```

Computed values don't recompute when dependencies change. They mark themselves as DIRTY and recompute only when `.value` is read.

---

## 6. Compiler-Assisted Optimizations

### Static Hoisting

The compiler moves static content out of render functions:

```js
// Static VNode created once, reused on every render
const _hoisted_1 = createVNode('p', null, 'This never changes')

function render() {
  return createVNode('div', null, [
    _hoisted_1, // Reused, not recreated
    createVNode('p', null, toDisplayString(_ctx.dynamic)),
  ])
}
```

### PatchFlags — Targeted Diffing

```ts
// packages/shared/src/patchFlags.ts

export enum PatchFlags {
  TEXT = 1, // Only text content can change
  CLASS = 1 << 1, // Only class can change
  STYLE = 1 << 2, // Only style can change
  PROPS = 1 << 3, // Specific props can change
}
```

The compiler tells the runtime EXACTLY what can change:

```js
// <div :class="cls">{{ text }}</div>
createVNode(
  'div',
  { class: _ctx.cls },
  toDisplayString(_ctx.text),
  PatchFlags.TEXT | PatchFlags.CLASS, // Only check text and class
)
```

Without PatchFlags, the runtime would check all attributes, styles, event listeners, and children. With PatchFlags, it only checks what the compiler detected as dynamic.

### Block Tree Optimization

Vue tracks "dynamic children" in blocks. Instead of diffing the entire VNode tree, it only diffs nodes that are actually dynamic:

```js
function render() {
  return (
    openBlock(),
    createBlock('div', null, [
      // These 100 static nodes are SKIPPED during diff
      _hoisted_1,
      _hoisted_2 /* ... */,
      ,
      // Only this dynamic node is diffed
      createVNode('span', null, toDisplayString(_ctx.count), PatchFlags.TEXT),
    ])
  )
}
```

---

## 7. `charCodeAt` over Regex

```ts
// packages/shared/src/general.ts

export const isOn = (key: string): boolean =>
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */ &&
  (key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97)
```

For simple pattern checks, `charCodeAt` is ~5x faster than regex. In hot paths, this matters.

---

## 8. Object.create(null) for Lookup Tables

```ts
// packages/shared/src/makeMap.ts

const map = Object.create(null)
for (const key of str.split(',')) map[key] = 1
return val => val in map
```

- No prototype overhead
- `in` operator is O(1) for string keys
- Faster than `Set.has()` for pure string lookups

---

## 9. Pre-allocated Arrays

```ts
// packages/runtime-core/src/helpers/renderList.ts

ret = new Array(source.length)
for (let i = 0, l = source.length; i < l; i++) {
  ret[i] = renderItem(source[i], i)
}
```

Pre-allocating with known size avoids dynamic array growth (which requires copying to a larger buffer).

---

## 10. Global Version Counter

```ts
// packages/reactivity/src/dep.ts

export let globalVersion = 0

// In Dep.trigger():
this.version++
globalVersion++
```

The `globalVersion` lets computed values quickly check "has anything changed since my last computation?" without walking their dependency list:

```ts
// In refreshComputed():
if (computed.globalVersion === globalVersion) {
  return // Nothing changed globally — skip recomputation
}
```

---

## Performance Pattern Summary

| Pattern          | Benefit                         | Example                          |
| ---------------- | ------------------------------- | -------------------------------- |
| `/*@__PURE__*/`  | Tree-shaking unused code        | `makeMap()`, `Promise.resolve()` |
| `__DEV__` guards | Zero-cost dev features          | Warnings, Object.freeze          |
| String caching   | Avoid repeated regex            | `camelize`, `hyphenate`          |
| WeakMap caching  | No memory leaks                 | `reactiveMap`, `mixinPropsCache` |
| Linked lists     | O(1) insert/remove              | Dep/Effect tracking              |
| Bit flags        | Single-instruction state checks | ShapeFlags, EffectFlags          |
| Lazy wrapping    | Only proxy what's accessed      | Deep reactivity                  |
| Static hoisting  | Reuse unchanging VNodes         | Compiler optimization            |
| PatchFlags       | Targeted diffing                | Only check what can change       |
| `charCodeAt`     | Faster than regex               | `isOn`, simple patterns          |
| Global version   | Fast staleness check            | Computed skip optimization       |

---

## Exercises

1. **Measure the `__DEV__` impact**: Compare the production and development bundle sizes of Vue. How much code is dev-only?

2. **Build a caching benchmark**: Compare `Object.create(null)` + `in` vs `Set.has()` vs `Map.has()` for 10,000 lookups.

3. **Count `/*@__PURE__*/`** annotations in the codebase. What percentage of module-level calls are annotated?

4. **Trace PatchFlags**: Write a template and predict what PatchFlags the compiler will generate. Then verify with the template explorer.

5. **Profile the linked list**: In `packages/reactivity/src/dep.ts`, trace how `addSub` and `removeSub` work. Compare with an array-based approach.

---

## Key Takeaways

1. Tree-shaking annotations (`/*@__PURE__*/`) enable dead code elimination
2. `__DEV__` guards have ZERO production cost — entire branches are removed
3. The right data structure matters — linked lists beat arrays for tracking
4. Lazy evaluation prevents work that may never be needed
5. The compiler does heavy lifting so the runtime can be fast
6. Every micro-optimization (charCodeAt, bitwise) compounds in hot paths
7. Vue's performance comes from **all layers working together**: compiler, runtime, and reactivity

---

## Congratulations!

You've completed the entire learning series — from JavaScript basics to expert-level Vue.js internals. You now understand:

- The JavaScript language features used throughout the codebase
- TypeScript patterns for reading and contributing to Vue
- Core architectures: reactivity, compiler, runtime
- Design patterns and performance optimizations

**Next steps:**

1. Run the tests: `pnpm test` — see the concepts in action
2. Read issues on GitHub — understand what's being worked on
3. Pick a small bug fix — apply what you've learned
4. Use the template explorer to experiment with the compiler

Happy contributing!
