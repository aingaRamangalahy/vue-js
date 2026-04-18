# 02 — Functions

> **Difficulty**: Beginner  
> **Key files**: `packages/shared/src/general.ts`, `packages/shared/src/makeMap.ts`

## What You'll Learn

- Arrow functions vs regular functions
- Higher-order functions (functions that take/return functions)
- Memoization and caching patterns
- Rest parameters and spreading arguments

---

## Arrow Functions vs Regular Functions

JavaScript has two function syntaxes. Vue.js uses both strategically.

### Arrow Functions (=>)

```ts
// packages/shared/src/general.ts

export const NOOP = (): void => {}
export const NO = () => false

export const isFunction = (val: unknown): val is Function =>
  typeof val === 'function'

export const isString = (val: unknown): val is string => typeof val === 'string'
```

**Arrow function characteristics:**

- Shorter syntax — perfect for small utility functions
- **No own `this`** — inherits `this` from surrounding scope
- Cannot be used as constructors (can't `new` them)
- Implicit return for single expressions (no `{}` and `return` needed)

### Regular Functions (`function` keyword)

```ts
// packages/shared/src/makeMap.ts

export function makeMap(str: string): (key: string) => boolean {
  const map = Object.create(null)
  for (const key of str.split(',')) map[key] = 1
  return val => val in map
}
```

**When Vue uses regular `function` declarations:**

- When the function needs to be hoisted (available before its line in code)
- For exported public API functions
- When `this` binding matters

---

## Higher-Order Functions

A **higher-order function** is a function that takes a function as an argument OR returns a function. This is one of the most powerful patterns in JavaScript.

### Functions That Return Functions

```ts
// packages/shared/src/makeMap.ts

export function makeMap(str: string): (key: string) => boolean {
  const map = Object.create(null) // 1. Create a lookup table
  for (const key of str.split(',')) {
    map[key] = 1 // 2. Fill it from comma-separated string
  }
  return val => val in map // 3. Return a function that checks the table
}
```

**How it's used:**

```ts
// packages/shared/src/domTagConfig.ts

export const isHTMLTag: (key: string) => boolean =
  /*@__PURE__*/ makeMap(HTML_TAGS)
export const isSVGTag: (key: string) => boolean =
  /*@__PURE__*/ makeMap(SVG_TAGS)
export const isMathMLTag: (key: string) => boolean =
  /*@__PURE__*/ makeMap(MATH_TAGS)
```

**What's happening:**

1. `makeMap` receives a long comma-separated string of tag names
2. It builds a lookup object from that string
3. It returns a function that can check if any string is in that set
4. The lookup object lives in a closure — fast O(1) lookups every time

This is the **factory pattern** — a function that creates and configures other functions.

### Functions That Take Functions

```ts
// packages/shared/src/general.ts

export const invokeArrayFns = (fns: Function[], ...arg: any[]): void => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg)
  }
}
```

This takes an array of functions and calls each one with the same arguments. It's used throughout Vue to invoke lifecycle hooks, event handlers, etc.

---

## Memoization / Caching Pattern

One of the most elegant patterns in the Vue.js codebase:

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

**Step by step:**

1. Takes a string→string function `fn`
2. Creates a `cache` object (using `Object.create(null)` for a clean, prototype-free map)
3. Returns a NEW function that:
   - First checks the cache for a result
   - If found (`hit`), returns the cached result
   - If not found, calls the original `fn`, stores the result, and returns it

### Functions Built With the Cache

```ts
// packages/shared/src/general.ts

const camelizeRE = /-\w/g
export const camelize: (str: string) => string = cacheStringFunction(
  (str: string): string => {
    return str.replace(camelizeRE, c => c.slice(1).toUpperCase())
  },
)

const hyphenateRE = /\B([A-Z])/g
export const hyphenate: (str: string) => string = cacheStringFunction(
  (str: string) => str.replace(hyphenateRE, '-$1').toLowerCase(),
)

export const capitalize: <T extends string>(str: T) => Capitalize<T> =
  cacheStringFunction(<T extends string>(str: T) => {
    return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<T>
  })
```

**Why cache?** These functions are called thousands of times with the same inputs (like converting prop names from kebab-case to camelCase). Caching avoids recalculating the regex replacement every time.

| Function     | Input       | Output      |
| ------------ | ----------- | ----------- |
| `camelize`   | `"my-prop"` | `"myProp"`  |
| `hyphenate`  | `"myProp"`  | `"my-prop"` |
| `capitalize` | `"hello"`   | `"Hello"`   |

---

## Rest Parameters and Spread

### Rest Parameters (`...args`)

```ts
// packages/shared/src/general.ts

export const invokeArrayFns = (fns: Function[], ...arg: any[]): void => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg) // spread the args when calling each function
  }
}
```

- `...arg` in the parameter list **collects** remaining arguments into an array
- `...arg` in the function call **spreads** the array back into individual arguments

### Another Example

```ts
// packages/runtime-core/src/errorHandling.ts

export function callWithErrorHandling(
  fn: Function,
  instance: ComponentInternalInstance | null | undefined,
  type: ErrorTypes,
  args?: unknown[], // Optional array of arguments
): any {
  try {
    return args ? fn(...args) : fn() // Spread if args exist, otherwise call bare
  } catch (err) {
    handleError(err, instance, type)
  }
}
```

---

## Pure Functions and Side Effects

Vue.js carefully separates pure functions (no side effects) from impure ones.

### Pure Function (same input → always same output)

```ts
// packages/shared/src/general.ts

export const hasChanged = (value: any, oldValue: any): boolean =>
  !Object.is(value, oldValue)
```

`Object.is()` is like `===` but correctly handles `NaN` and `-0`:

- `NaN === NaN` → `false` (broken!)
- `Object.is(NaN, NaN)` → `true` (correct!)

### Function Composition

```ts
// packages/shared/src/general.ts

export const toRawType = (value: unknown): string => {
  return toTypeString(value).slice(8, -1)
}
```

This composes `toTypeString` with `.slice()` — building a new function from existing building blocks.

---

## Default Parameters

```ts
// packages/shared/src/general.ts

export const def = (
  obj: object,
  key: string | symbol,
  value: any,
  writable = false, // Default parameter!
): void => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    writable,
    value,
  })
}
```

`writable = false` means if you don't pass a 4th argument, it defaults to `false`. This is cleaner than checking `if (writable === undefined)`.

---

## Exercises

1. **Write your own `cacheStringFunction`** that also tracks how many times the cache was hit vs missed
2. **Understand `makeMap`**: Why does it use `Object.create(null)` instead of `{}`?
   > **Hint**: `Object.create(null)` creates an object with NO prototype, so `"toString" in map` won't accidentally return `true`
3. **Trace the call chain**: When Vue converts `"my-component"` to `"MyComponent"`, which functions are called and in what order?
4. **Find `invokeArrayFns`** usage in the codebase — what lifecycle hooks does it invoke?

---

## Key Takeaways

1. Arrow functions are great for short utilities; `function` declarations for public APIs
2. Higher-order functions (functions returning/accepting functions) enable powerful composition
3. Memoization caches expensive computations — a critical performance pattern
4. `Object.create(null)` creates clean lookup tables with no prototype chain
5. `Object.is()` is more reliable than `===` for value comparison

**Next**: [03 — Objects & Prototypes](./03-objects-and-prototypes)
