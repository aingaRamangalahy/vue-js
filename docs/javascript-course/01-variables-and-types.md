# 01 — Variables & Types

> **Difficulty**: Beginner  
> **Key files**: `packages/shared/src/general.ts`

## What You'll Learn

- How to declare variables with `const` and `let`
- JavaScript's primitive types
- How to check types at runtime
- How Vue.js builds robust type-checking utility functions

---

## Variable Declarations: `const` vs `let`

JavaScript has two modern ways to declare variables:

- **`const`** — cannot be reassigned after creation
- **`let`** — can be reassigned

> **Note**: You'll almost never see `var` in modern code. It has scoping issues that `const` and `let` fix.

### From the Vue.js Source

```ts
// packages/shared/src/general.ts

export const EMPTY_OBJ: { readonly [key: string]: any } = __DEV__
  ? Object.freeze({})
  : {}
export const EMPTY_ARR: readonly never[] = __DEV__ ? Object.freeze([]) : []

export const NOOP = (): void => {}

export const NO = () => false
```

**What's happening here?**

- `EMPTY_OBJ` is a constant reference to an empty object — it can never point to a different object
- `NOOP` is a "no operation" function — it does nothing. It's used as a default/placeholder
- `NO` is a function that always returns `false` — used as a default predicate

**Why `const`?** These values should never change. Using `const` communicates intent AND prevents accidental reassignment.

### When to use `let`

```ts
// packages/shared/src/escapeHtml.ts

export function escapeHtml(string: unknown): string {
  const str = '' + string // const - this won't change
  const match = escapeRE.exec(str)

  let html = '' // let - this will be reassigned in the loop
  let escaped: string // let - changes on each iteration
  let index: number
  let lastIndex = 0

  for (index = match.index; index < str.length; index++) {
    // html gets reassigned here:
    html += escaped
  }

  return html
}
```

**Rule of thumb**: Use `const` by default. Only use `let` when you need to reassign.

---

## JavaScript Types

JavaScript has **7 primitive types** and **1 object type**:

| Type        | Example                    | `typeof` result              |
| ----------- | -------------------------- | ---------------------------- |
| `string`    | `"hello"`                  | `"string"`                   |
| `number`    | `42`, `3.14`               | `"number"`                   |
| `boolean`   | `true`, `false`            | `"boolean"`                  |
| `undefined` | `undefined`                | `"undefined"`                |
| `null`      | `null`                     | `"object"` (historical bug!) |
| `symbol`    | `Symbol('id')`             | `"symbol"`                   |
| `bigint`    | `9007199254740991n`        | `"bigint"`                   |
| `object`    | `{}`, `[]`, `function(){}` | `"object"` or `"function"`   |

---

## Type Checking: How Vue.js Does It

Vue.js defines a comprehensive set of type-checking functions. Let's study each one:

### Simple `typeof` Checks

```ts
// packages/shared/src/general.ts

export const isFunction = (val: unknown): val is Function =>
  typeof val === 'function'

export const isString = (val: unknown): val is string => typeof val === 'string'

export const isSymbol = (val: unknown): val is symbol => typeof val === 'symbol'

export const isObject = (val: unknown): val is Record<any, any> =>
  val !== null && typeof val === 'object'
```

**Key concepts:**

1. **`typeof` operator** returns a string describing the type
2. **`val is Function`** is a TypeScript "type guard" — it tells TypeScript "if this returns true, treat `val` as a Function"
3. **`isObject` checks for `null`** because `typeof null === 'object'` is a known JavaScript quirk

### The `Object.prototype.toString` Trick

For more specific type checks, `typeof` isn't enough — `typeof []` returns `"object"`, not `"array"`. Vue uses `Object.prototype.toString`:

```ts
// packages/shared/src/general.ts

export const objectToString: typeof Object.prototype.toString =
  Object.prototype.toString
export const toTypeString = (value: unknown): string =>
  objectToString.call(value)

export const isMap = (val: unknown): val is Map<any, any> =>
  toTypeString(val) === '[object Map]'

export const isSet = (val: unknown): val is Set<any> =>
  toTypeString(val) === '[object Set]'

export const isDate = (val: unknown): val is Date =>
  toTypeString(val) === '[object Date]'

export const isRegExp = (val: unknown): val is RegExp =>
  toTypeString(val) === '[object RegExp]'

export const isArray: typeof Array.isArray = Array.isArray
```

**Why `Object.prototype.toString.call(value)`?**

- Calling `.toString()` directly on an object might use a custom `toString()` method
- `Object.prototype.toString.call(value)` always gives the internal `[[Class]]` tag
- This reliably produces strings like `"[object Map]"`, `"[object Set]"`, etc.

### Extracting the Raw Type

```ts
// packages/shared/src/general.ts

export const toRawType = (value: unknown): string => {
  return toTypeString(value).slice(8, -1)
}
```

This slices `"[object Map]"` → `"Map"`. The `8` skips `"[object "` and `-1` removes the trailing `]`.

### Checking for Promises

```ts
// packages/shared/src/general.ts

export const isPromise = <T = any>(val: unknown): val is Promise<T> => {
  return (
    (isObject(val) || isFunction(val)) &&
    isFunction((val as any).then) &&
    isFunction((val as any).catch)
  )
}
```

**Duck typing**: Instead of checking `val instanceof Promise`, Vue checks if the value has `.then` and `.catch` methods. This works with any "thenable" — not just native Promises.

### Integer Key Check

```ts
// packages/shared/src/general.ts

export const isIntegerKey = (key: unknown): boolean =>
  isString(key) &&
  key !== 'NaN' &&
  key[0] !== '-' &&
  '' + parseInt(key, 10) === key
```

This checks if a string represents a valid array index (`"0"`, `"1"`, `"42"`). Converting `parseInt` result back to string and comparing ensures no floating point or weird values sneak through.

---

## The `unknown` type

Notice how all these functions accept `unknown` instead of `any`:

```ts
export const isString = (val: unknown): val is string => typeof val === 'string'
//                            ^^^^^^^
```

- **`any`** — disables all type checking (dangerous)
- **`unknown`** — the type-safe counterpart. You MUST check the type before using it

This is a best practice: use `unknown` at system boundaries where you don't know what you'll receive.

---

## Exercises

1. **Find all `isX` functions** in `packages/shared/src/general.ts` and understand what each checks
2. **Try `Object.prototype.toString.call()`** with different values in a Node.js console:
   ```js
   Object.prototype.toString.call([]) // ?
   Object.prototype.toString.call(null) // ?
   Object.prototype.toString.call(42) // ?
   ```
3. **Look at how `isOn` works** — it checks character codes instead of using a regex. Why might that be faster?

```ts
export const isOn = (key: string): boolean =>
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */ &&
  // make sure the 3rd character is uppercase
  (key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97)
```

> **Answer**: `charCodeAt` comparisons are faster than regex for simple patterns. This checks if a string starts with "on" followed by an uppercase letter (like `onClick`, `onMount`).

---

## Key Takeaways

1. Use `const` by default, `let` only when reassignment is needed
2. `typeof` works for primitives but not for specific object types
3. `Object.prototype.toString.call()` gives reliable type identification
4. Duck typing (checking for methods) is more flexible than `instanceof`
5. Use `unknown` instead of `any` at system boundaries

**Next**: [02 — Functions](./02-functions)
