# 04 — Arrays & Iteration

> **Difficulty**: Beginner → Intermediate  
> **Key files**: `packages/shared/src/general.ts`, `packages/runtime-core/src/helpers/renderList.ts`

## What You'll Learn

- Array creation and manipulation methods
- Different loop styles and when to use each
- How Vue.js renders lists efficiently
- Performance considerations for array operations

---

## Array Basics

### Creating Arrays

```ts
// packages/runtime-core/src/helpers/renderList.ts

ret = new Array(source.length)
```

`new Array(n)` creates a pre-allocated array of length `n`. Vue uses this when it knows the exact output size — pre-allocation is faster than pushing items one by one.

### Array.isArray

```ts
// packages/shared/src/general.ts

export const isArray: typeof Array.isArray = Array.isArray
```

Vue aliases `Array.isArray` for consistency. This is the **only** reliable way to check if something is an array:

```js
typeof []           // "object" — not helpful!
[] instanceof Array // true, but breaks across iframes
Array.isArray([])   // true — always correct
```

---

## Loop Patterns in Vue.js

Vue uses different loop styles for different situations. Understanding why is key to writing performant code.

### Classic `for` Loop — Maximum Performance

```ts
// packages/runtime-core/src/helpers/renderList.ts

if (sourceIsArray || isString(source)) {
  ret = new Array(source.length)
  for (let i = 0, l = source.length; i < l; i++) {
    ret[i] = renderItem(
      needsWrap ? toReactive(source[i]) : source[i],
      i,
      undefined,
      cached && cached[i],
    )
  }
}
```

**Why classic `for`?**

- Fastest loop style in JavaScript engines
- Caches `.length` in variable `l` to avoid re-reading on each iteration
- Direct index access (`source[i]`) is faster than iterator protocol
- Used in hot paths (code that runs thousands of times)

### `for...of` Loop — Clean Iteration

```ts
// packages/shared/src/makeMap.ts

export function makeMap(str: string): (key: string) => boolean {
  const map = Object.create(null)
  for (const key of str.split(',')) map[key] = 1
  return val => val in map
}
```

**`for...of`** iterates over any iterable (arrays, strings, Maps, Sets, generators):

- Cleaner syntax than classic `for`
- Works with any iterable object
- Slightly slower than classic `for` for arrays (iterator overhead)

### `for...in` Loop — Object Keys

```ts
// packages/shared/src/normalizeProp.ts

if (normalized) {
  for (const key in normalized) {
    res[key] = normalized[key]
  }
}
```

**`for...in`** iterates over enumerable property **keys** of an object:

- Returns string keys
- Includes inherited properties (prototype chain!)
- Use `hasOwn` to filter if needed

---

## Array Methods

### splice — Removing Elements

```ts
// packages/shared/src/general.ts

export const remove = <T>(arr: T[], el: T): void => {
  const i = arr.indexOf(el)
  if (i > -1) {
    arr.splice(i, 1)
  }
}
```

**Array.splice(index, deleteCount)** modifies the array in place:

- `arr.splice(2, 1)` — removes 1 element at index 2
- Returns an array of removed elements
- Vue needs this to remove items from arrays of hooks, watchers, etc.

### indexOf — Finding Elements

The `remove` function first uses `indexOf` to find the element:

- Returns the index of the first match
- Returns `-1` if not found
- Uses `===` for comparison

### Pre-allocated Array with Direct Assignment

```ts
// packages/runtime-core/src/helpers/renderList.ts

ret = new Array(source.length)
for (let i = 0, l = source.length; i < l; i++) {
  ret[i] = renderItem(source[i], i) // Direct index assignment
}
```

This is faster than:

```ts
const ret = []
for (...) {
  ret.push(renderItem(source[i], i))  // push has overhead
}
```

Pre-allocating with `new Array(n)` and assigning by index avoids the overhead of `push()` (which needs to grow the internal buffer dynamically).

---

## Array Destructuring

```ts
// Destructuring array elements
const [first, ...rest] = [1, 2, 3, 4]
// first = 1, rest = [2, 3, 4]
```

Used in Vue's compiler:

```ts
// Array spread to create fresh copies
const deduped = [...new Set(pendingPostFlushCbs)].sort(compareCb)
```

This pattern:

1. Creates a `Set` from the array (removes duplicates)
2. Spreads the Set back into an array with `[...]`
3. Sorts the deduplicated array

---

## Rendering Lists: A Complete Example

This is how Vue's `v-for` works under the hood:

```ts
// packages/runtime-core/src/helpers/renderList.ts

export function renderList(
  source: any,
  renderItem: (...args: any[]) => VNodeChild,
  cache?: any[],
  index?: number,
): VNodeChild[] {
  let ret: VNodeChild[]
  const cached = (cache && cache[index!]) as VNode[] | undefined
  const sourceIsArray = isArray(source)

  if (sourceIsArray || isString(source)) {
    // Arrays and strings — iterate by index
    ret = new Array(source.length)
    for (let i = 0, l = source.length; i < l; i++) {
      ret[i] = renderItem(source[i], i, undefined, cached && cached[i])
    }
  } else if (typeof source === 'number') {
    // Numbers — v-for="n in 10"
    ret = new Array(source)
    for (let i = 0; i < source; i++) {
      ret[i] = renderItem(i + 1, i, undefined, cached && cached[i])
    }
  } else if (isObject(source)) {
    if (source[Symbol.iterator as any]) {
      // Iterables (Map, Set, generators)
      ret = Array.from(source as Iterable<any>, (item, i) => {
        return renderItem(item, i, undefined, cached && cached[i])
      })
    } else {
      // Plain objects — iterate keys
      const keys = Object.keys(source)
      ret = new Array(keys.length)
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i]
        ret[i] = renderItem(source[key], key, i, cached && cached[i])
      }
    }
  }

  return ret
}
```

**Key patterns:**

1. **Type checking first** — determine what kind of source we have
2. **Pre-allocate** — `new Array(n)` when size is known
3. **Array.from with mapper** — for iterables, converts + transforms in one pass
4. **Object.keys()** — for plain objects, gets enumerable string keys

---

## Invoking Arrays of Functions

```ts
// packages/shared/src/general.ts

export const invokeArrayFns = (fns: Function[], ...arg: any[]): void => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg)
  }
}
```

Vue stores lifecycle hooks (like `onMounted`, `onUpdated`) as arrays of functions. When it's time to trigger them, it iterates and calls each one.

---

## Exercises

1. **Compare performance**: Write a benchmark for `push()` vs pre-allocated array:

   ```js
   // Version A
   const a = []
   for (let i = 0; i < 10000; i++) a.push(i)

   // Version B
   const b = new Array(10000)
   for (let i = 0; i < 10000; i++) b[i] = i
   ```

2. **Understand `renderList`**: What happens when you write `v-for="n in 5"` in a Vue template? Trace through the renderList code.

3. **Find `remove()` usage**: Search the codebase for where `remove` is called. What kinds of things get removed?

4. **Deduplication**: Why does `[...new Set(array)]` work? What's the Set doing here?

---

## Key Takeaways

1. Classic `for` loops are fastest — use them in hot paths
2. `for...of` works with any iterable — cleaner for non-performance-critical code
3. Pre-allocate arrays with `new Array(n)` when you know the size
4. `Array.isArray()` is the only reliable array check
5. `splice` modifies arrays in place — be careful with reactivity!

**Next**: [05 — Destructuring & Spread](./05-destructuring-and-spread)
