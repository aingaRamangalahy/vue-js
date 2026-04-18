# 05 — Destructuring & Spread

> **Difficulty**: Beginner → Intermediate  
> **Key files**: `packages/shared/src/normalizeProp.ts`, `packages/runtime-core/src/`

## What You'll Learn

- Object and array destructuring syntax
- Spread operator for objects and arrays
- Rest parameters in function signatures
- How Vue.js uses these patterns extensively

---

## Object Destructuring

Destructuring lets you extract values from objects into variables:

### Import Destructuring (Most Common in Vue)

```ts
// packages/runtime-core/src/componentProps.ts

import {
  EMPTY_OBJ,
  NOOP,
  extend,
  hasOwn,
  isFunction,
  isString,
} from '@vue/shared'
```

Every `import { ... } from` statement uses destructuring. You pick exactly the exports you need.

### Variable Destructuring

```ts
// packages/runtime-core/src/errorHandling.ts

const { errorHandler, throwUnhandledErrorInProduction } =
  (instance && instance.appContext.config) || EMPTY_OBJ
```

Instead of:

```ts
const errorHandler = instance.appContext.config.errorHandler
const throwUnhandled =
  instance.appContext.config.throwUnhandledErrorInProduction
```

Destructuring is shorter and reads as "extract these properties from this object."

### Nested Destructuring

```ts
// Conceptual example from transform context usage
const {
  scopes: { vFor, vSlot, vPre, vOnce },
} = context
```

You can destructure nested objects in a single expression. But don't go too deep — it becomes hard to read.

### Destructuring with Defaults

```ts
// Pattern used throughout Vue
function setup(options = {}) {
  const { immediate = false, deep = false, flush = 'pre' } = options
}
```

If a property is `undefined`, the default value kicks in.

### Destructuring with Renaming

```ts
// When the property name conflicts with a local variable
const { type: nodeType, children: nodeChildren } = node
```

`type: nodeType` means "extract `type` but call it `nodeType` locally."

---

## Array Destructuring

```ts
// Extracting specific elements from arrays
const [first, second] = someArray

// Skip elements with commas
const [, second, , fourth] = [1, 2, 3, 4]
// second = 2, fourth = 4
```

---

## Spread Operator (`...`)

The spread operator "unpacks" iterables (arrays, objects) into their individual elements.

### Object Spread — Merging & Copying

```ts
// Pattern used in Vue's normalization
const style = { ...baseStyle, ...overrideStyle }
```

This creates a new object with properties from both. Later properties override earlier ones (like CSS specificity).

### Array Spread — Deduplication

```ts
// packages/runtime-core/src/scheduler.ts

const deduped = [...new Set(pendingPostFlushCbs)].sort(compareCb)
```

**What's happening:**

1. `new Set(pendingPostFlushCbs)` — removes duplicate callbacks
2. `[...set]` — converts the Set back into an array
3. `.sort(compareCb)` — sorts by priority

### Spread in Function Calls

```ts
// packages/shared/src/general.ts

export const invokeArrayFns = (fns: Function[], ...arg: any[]): void => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg) // Spread array as individual arguments
  }
}
```

If `arg` is `[1, 'hello', true]`, then `fn(...arg)` becomes `fn(1, 'hello', true)`.

---

## Rest Parameters

Rest parameters collect remaining arguments into an array. They look the same as spread (`...`) but appear in function parameter positions.

```ts
// packages/shared/src/general.ts

export const invokeArrayFns = (fns: Function[], ...arg: any[]): void => {
  //                                               ^^^^^^^^^^^^^^^^
  //                                               Rest parameter: collects remaining args
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg) // Spread: unpacks array into args
  }
}
```

**The dual nature of `...`:**

- In **function parameters** → Rest (collects into array)
- In **function calls / literals** → Spread (unpacks from array/object)

### Rest in Destructuring

```ts
// Extract first, collect the rest
const [first, ...remaining] = [1, 2, 3, 4, 5]
// first = 1, remaining = [2, 3, 4, 5]

// Same with objects
const { key, ref, ...otherProps } = props
// key and ref extracted, everything else is in otherProps
```

---

## Real-World Pattern: Normalizing Props

```ts
// packages/shared/src/normalizeProp.ts

export function normalizeStyle(
  value: unknown,
): NormalizedStyle | string | undefined {
  if (isArray(value)) {
    const res: NormalizedStyle = {}
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      const normalized = isString(item)
        ? parseStringStyle(item)
        : (normalizeStyle(item) as NormalizedStyle)
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key] // Manual "spread" for merging
        }
      }
    }
    return res
  } else if (isString(value) || isObject(value)) {
    return value
  }
}
```

**Why manual copy instead of spread?** This function accepts nested arrays (recursion) and needs to merge results incrementally. A `for...in` loop is more explicit and handles each key one at a time.

---

## extend (Object.assign) vs Spread

```ts
// packages/shared/src/general.ts
export const extend: typeof Object.assign = Object.assign
```

Vue defines `extend` as an alias for `Object.assign`. Both do the same thing, but with a key difference:

```ts
// Object.assign MODIFIES the target
const target = { a: 1 }
extend(target, { b: 2 }) // target is now { a: 1, b: 2 }

// Spread creates a NEW object
const result = { ...target, b: 2 } // target is unchanged
```

**When Vue uses `extend` (mutating)**:

```ts
// Merging options into an existing object — intentional mutation
extend(instance.props, newProps)
```

**When to use spread (non-mutating)**:

```ts
// Creating a new options object without modifying the original
const merged = { ...defaults, ...userOptions }
```

---

## Exercises

1. **Rewrite with destructuring**: Convert this code to use destructuring:

   ```js
   const name = user.name
   const age = user.age
   const email = user.email
   ```

2. **Spread vs Object.assign**: What's the output?

   ```js
   const a = { x: 1, y: 2 }
   const b = { y: 3, z: 4 }
   console.log({ ...a, ...b }) // ?
   console.log({ ...b, ...a }) // ?
   ```

3. **Rest parameters**: Write a function that takes any number of arguments and returns their sum:

   ```js
   function sum(...numbers) {
     // your code here
   }
   ```

4. **Search the codebase** for `...args` patterns. How many different places use rest parameters?

---

## Key Takeaways

1. Destructuring extracts values concisely — essential for imports and options
2. Spread (`...`) copies/merges without mutation — safe for creating new objects
3. Rest parameters (`...args`) collect arguments — flexible function signatures
4. `Object.assign` / `extend` mutates the target — use when mutation is intended
5. Later spread properties override earlier ones — useful for defaults + overrides

**Next**: [06 — Closures & Scope](./06-closures-and-scope)
