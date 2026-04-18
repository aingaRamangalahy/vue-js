# 08 — Modules

> **Difficulty**: Intermediate  
> **Key files**: `packages/shared/src/index.ts`, `packages/reactivity/src/index.ts`, `packages/vue/src/index.ts`

## What You'll Learn

- ES module syntax (`import`/`export`)
- Barrel files and re-exports
- How Vue.js organizes its package structure
- Tree-shaking and why module structure matters

---

## ES Modules Basics

JavaScript modules let you split code into separate files that can import from each other.

### Named Exports

```ts
// packages/shared/src/general.ts

export const EMPTY_OBJ = {}
export const NOOP = (): void => {}
export const isArray = Array.isArray

export const isFunction = (val: unknown): val is Function =>
  typeof val === 'function'

export function makeMap(str: string): (key: string) => boolean {
  // ...
}
```

Each `export` makes a value available for other files to import. You can export:

- Variables (`export const`)
- Functions (`export function`)
- Classes (`export class`)
- Types (`export type`, `export interface`) — TypeScript only

### Named Imports

```ts
// packages/reactivity/src/reactive.ts

import { def, hasOwn, isObject, toRawType } from '@vue/shared'
```

You import exactly what you need by name. This enables **tree-shaking** — bundlers can remove unused exports.

### Import Aliasing

```ts
// When you need to rename an import
import { ref as vueRef } from 'vue'
```

---

## Barrel Files (Re-exports)

A **barrel file** re-exports from multiple modules, creating a single entry point:

```ts
// packages/shared/src/index.ts

export { makeMap } from './makeMap'
export * from './general'
export * from './patchFlags'
export * from './shapeFlags'
export * from './slotFlags'
export * from './globalsAllowList'
export * from './codeframe'
export * from './normalizeProp'
export * from './domTagConfig'
export * from './domAttrConfig'
export * from './escapeHtml'
export * from './looseEqual'
export * from './toDisplayString'
export * from './typeUtils'
export * from './cssVars'
```

**Pattern types:**

- `export { makeMap } from './makeMap'` — re-exports specific names
- `export * from './general'` — re-exports EVERYTHING from that module
- `export { x as y } from './z'` — re-export with renaming

### Why Barrel Files?

Without barrel file:

```ts
import { isArray } from '@vue/shared/src/general'
import { makeMap } from '@vue/shared/src/makeMap'
import { ShapeFlags } from '@vue/shared/src/shapeFlags'
```

With barrel file:

```ts
import { isArray, makeMap, ShapeFlags } from '@vue/shared'
```

One import path instead of many. The internal file structure can change without breaking consumers.

---

## Vue's Package Structure

```ts
// packages/reactivity/src/index.ts

export {
  ref,
  shallowRef,
  isRef,
  toRef,
  toValue,
  toRefs,
  unref,
  proxyRefs,
  customRef,
  triggerRef,
  type Ref, // Type-only export!
  type MaybeRef,
  type MaybeRefOrGetter,
  type ToRef,
  type ToRefs,
  type UnwrapRef,
  type ShallowRef,
  type ShallowUnwrapRef,
  type RefUnwrapBailTypes,
  type CustomRefFactory,
} from './ref'

export {
  reactive,
  readonly,
  isReactive,
  isReadonly,
  isShallow,
  isProxy,
  shallowReactive,
  shallowReadonly,
  markRaw,
  toRaw,
  toReactive,
  toReadonly,
  type Raw,
  type DeepReadonly,
  type ShallowReactive,
  type UnwrapNestedRefs,
  type Reactive,
  type ReactiveMarker,
} from './reactive'
```

**Key observations:**

1. **Explicit exports** — each exported name is listed individually (not `export *`)
2. **`type` keyword** — `type Ref` exports only the TypeScript type, not a runtime value
3. **Grouped by source** — all ref-related exports come from `./ref`, reactive from `./reactive`

### Type-Only Exports

```ts
export { type Ref } from './ref'
```

The `type` keyword ensures this export is completely erased in the JavaScript output. It exists only for TypeScript consumers. This is important because:

- It doesn't add to bundle size
- It clearly documents what's a type vs a runtime value
- Bundlers can skip these entirely

---

## The Main Entry Point

```ts
// packages/vue/src/index.ts (simplified)

// Re-export everything from runtime
export * from '@vue/runtime-dom'

// Compiler-related exports
export { compile } from './compile'

// Version
export const version = __VERSION__
```

The `vue` package is essentially an aggregator — it pulls in runtime and compiler, adding only a few top-level utilities.

---

## Internal vs External Imports

Vue distinguishes between:

### External imports (from other packages)

```ts
import { isArray, isString, NOOP } from '@vue/shared'
```

These use the package name (`@vue/shared`) as configured in the monorepo.

### Internal imports (same package)

```ts
import { ReactiveFlags } from './constants'
import { warn } from './warning'
```

These use relative paths (`./`).

### Package Configuration

```json
// packages/shared/package.json (simplified)
{
  "name": "@vue/shared",
  "main": "index.js",
  "module": "dist/shared.esm-bundler.js"
}
```

The `"module"` field tells bundlers where to find the ES module version.

---

## Circular Dependencies

In a complex codebase, modules sometimes need to import from each other. Vue handles this carefully:

```ts
// packages/reactivity/src/ref.ts imports from ./reactive.ts
import { isShallow, isReadonly, toRaw, toReactive } from './reactive'

// packages/reactivity/src/reactive.ts imports from ./ref.ts
import type { Ref, UnwrapRefSimple } from './ref'
```

**Notice**: The import from `reactive.ts` to `ref.ts` is a **type-only import** (`import type`). This breaks the circular dependency at runtime because type imports are erased.

**Rules for handling circular imports:**

1. Use `import type` when you only need types
2. Be careful with initialization order
3. Avoid importing runtime values in a cycle

---

## Dynamic Imports

```ts
// Used for code splitting / lazy loading
const module = await import('./heavy-module')
```

Vue's compiler uses this pattern for optional features that shouldn't be bundled unless used. Dynamic `import()` returns a Promise that resolves to the module's exports.

---

## Side Effects and Pure Annotations

```ts
// packages/shared/src/general.ts

export const isReservedProp: (key: string) => boolean = /*@__PURE__*/ makeMap(
  ',key,ref,ref_for,ref_key,' +
    'onVnodeBeforeMount,onVnodeMounted,' +
    'onVnodeBeforeUpdate,onVnodeUpdated,' +
    'onVnodeBeforeUnmount,onVnodeUnmounted',
)
```

`/*@__PURE__*/` tells bundlers: "This function call has no side effects. If the result is unused, you can safely remove it." This is crucial for tree-shaking.

Without this annotation, bundlers must assume `makeMap(...)` might have side effects (logging, modifying globals) and keep it even if `isReservedProp` is never used.

---

## Exercises

1. **Map the dependency graph**: Starting from `packages/vue/src/index.ts`, list all the packages that Vue imports from. Draw the dependency tree.

2. **Find circular dependencies**: Look at the imports in `packages/reactivity/src/`. Which files import from each other? How do they avoid problems?

3. **Create a barrel file**: If you had these files:

   ```
   utils/math.ts    → exports add, subtract
   utils/string.ts  → exports capitalize, trim
   utils/array.ts   → exports unique, flatten
   ```

   Write a `utils/index.ts` barrel file.

4. **Search for `/*@__PURE__*/`** in the codebase. How many times is it used? What kinds of expressions does it annotate?

---

## Key Takeaways

1. Named exports + named imports enable tree-shaking
2. Barrel files (`index.ts`) provide clean public APIs hiding internal structure
3. `export type` ensures types are erased from runtime bundles
4. `import type` breaks circular dependencies at the runtime level
5. `/*@__PURE__*/` annotations help bundlers remove unused code
6. Vue's package structure is designed for optimal tree-shaking

**Next**: [09 — Promises & Async](./09-promises-and-async)
