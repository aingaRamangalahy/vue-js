# 06 — Closures & Scope

> **Difficulty**: Intermediate  
> **Key files**: `packages/reactivity/src/effect.ts`, `packages/shared/src/general.ts`

## What You'll Learn

- What closures are and why they matter
- Lexical scope vs dynamic scope
- Module-level variables as shared state
- How Vue.js uses closures as the foundation of its reactivity system

---

## What Is a Closure?

A **closure** is a function that remembers the variables from the scope where it was created, even after that scope has finished executing.

### Simple Example from Vue

```ts
// packages/shared/src/general.ts

const cacheStringFunction = <T extends (str: string) => string>(fn: T): T => {
  const cache: Record<string, string> = Object.create(null)
  //    ^^^^^ This variable lives in the closure
  return ((str: string) => {
    const hit = cache[str]
    //          ^^^^^ The returned function "closes over" cache
    return hit || (cache[str] = fn(str))
  }) as T
}
```

**What happens:**

1. `cacheStringFunction` is called, creating `cache`
2. A new function is created that references `cache`
3. `cacheStringFunction` returns and its stack frame is gone
4. But `cache` **survives** because the returned function still references it
5. Every call to the returned function can read/write that same `cache`

This is a closure: the returned function "closes over" the `cache` variable.

---

## Closures in `makeMap`

```ts
// packages/shared/src/makeMap.ts

export function makeMap(str: string): (key: string) => boolean {
  const map = Object.create(null) // Enclosed variable
  for (const key of str.split(',')) {
    map[key] = 1 // Populated during setup
  }
  return val => val in map // Returned function has access to `map`
}

// Usage:
const isHTMLTag = makeMap('div,span,p,a,img')

isHTMLTag('div') // true  — `map` still exists in the closure
isHTMLTag('foo') // false — the lookup table persists
```

Each call to `makeMap` creates a **separate** closure with its own `map`. The `isHTMLTag` function and `isSVGTag` function each have their own private lookup tables.

---

## Module-Level Closures: Shared Mutable State

This is how Vue's reactivity system tracks the "currently running effect":

```ts
// packages/reactivity/src/effect.ts

// Module-level variables — shared by ALL functions in this file
export let activeSub: Subscriber | undefined
export let shouldTrack = true
let batchDepth = 0
let batchedSub: Subscriber | undefined
let batchedComputed: Subscriber | undefined
```

These module-level variables act as **shared mutable state**. Every function in the module can read and write them.

### Save-and-Restore Pattern

```ts
// packages/reactivity/src/effect.ts

run(): T {
  if (!(this.flags & EffectFlags.ACTIVE)) {
    return this.fn()
  }

  this.flags |= EffectFlags.RUNNING
  cleanupEffect(this)
  prepareDeps(this)

  const prevEffect = activeSub         // SAVE the current value
  const prevShouldTrack = shouldTrack  // SAVE the current value
  activeSub = this                     // SET new value
  shouldTrack = true

  try {
    return this.fn()                   // Run user code
  } finally {
    cleanupDeps(this)
    activeSub = prevEffect             // RESTORE previous value
    shouldTrack = prevShouldTrack      // RESTORE previous value
    this.flags &= ~EffectFlags.RUNNING
  }
}
```

**This is a critical pattern!** It enables nesting:

```
effect A starts:
  save activeSub (undefined)
  activeSub = A
    effect B starts:
      save activeSub (A)     ← saved via closure
      activeSub = B
      ... B runs ...
      activeSub = A          ← restored!
    effect B ends
  ... A runs ...
  activeSub = undefined      ← restored!
effect A ends
```

The `prevEffect` and `prevShouldTrack` variables form a closure within the `try/finally` block, ensuring cleanup always happens — even if `this.fn()` throws an error.

---

## Closure as Private State

```ts
// packages/reactivity/src/effect.ts

export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions,
): ReactiveEffectRunner<T> {
  const e = new ReactiveEffect(fn)

  if (options) {
    extend(e, options)
  }

  try {
    e.run()
  } catch (err) {
    e.stop()
    throw err
  }

  const runner = e.run.bind(e) as ReactiveEffectRunner<T>
  runner.effect = e
  return runner
}
```

The `runner` function closes over the `e` (ReactiveEffect) instance via `.bind()`. When you call `runner()`, it always runs the effect — the effect instance is permanently attached.

---

## Closures in Event Handlers

```ts
// Conceptual pattern used in Vue's runtime-dom

function patchEvent(el, name, nextValue) {
  // Each element gets its own invoker via closure
  let invoker = el._vei || (el._vei = {})

  const existingInvoker = invoker[name]
  if (nextValue && existingInvoker) {
    // Update the handler without removing/adding event listener
    existingInvoker.value = nextValue
  } else if (nextValue) {
    // Create new invoker
    invoker[name] = createInvoker(nextValue)
    el.addEventListener(name, invoker[name])
  }
}

function createInvoker(initialValue) {
  const invoker = e => {
    invoker.value(e) // The handler is on the function itself!
  }
  invoker.value = initialValue
  return invoker
}
```

**Clever closure trick**: Instead of removing and re-adding event listeners when the handler changes, Vue creates a stable invoker function. The actual handler is stored on `invoker.value` and can be swapped out without touching the DOM.

---

## Immediately Invoked Function Expressions (IIFE)

```ts
// Pattern used for one-time initialization
const resolvedPromise = /*@__PURE__*/ Promise.resolve() as Promise<any>
```

The `/*@__PURE__*/` annotation tells bundlers this expression has no side effects and can be tree-shaken if unused. While not a traditional IIFE, it serves the same purpose: compute a value once at module load time.

---

## The Scope Chain

When JavaScript resolves a variable, it walks up the scope chain:

```
Function scope → Enclosing function scope → ... → Module scope → Global scope
```

```ts
// packages/reactivity/src/effect.ts

let activeSub: Subscriber | undefined // Module scope

export class ReactiveEffect<T = any> {
  run(): T {
    // Method scope
    const prevEffect = activeSub // Reads from module scope
    activeSub = this // Writes to module scope
    try {
      return this.fn() // this.fn may trigger track()
    } finally {
      activeSub = prevEffect // Writes to module scope
    }
  }
}

// In dep.ts:
export function track(target, type, key) {
  if (!activeSub) return // Reads module-level activeSub
  // ... tracking logic
}
```

The `track` function can read `activeSub` because it's exported from the module scope. This is how reactive accesses (like reading `obj.name`) know WHICH effect to associate with.

---

## Common Closure Pitfall: Loop Variables

```ts
// WRONG — all callbacks share the same `i`
for (var i = 0; i < 5; i++) {
  setTimeout(() => console.log(i), 100) // Prints 5, 5, 5, 5, 5
}

// RIGHT — let creates a new scope per iteration
for (let i = 0; i < 5; i++) {
  setTimeout(() => console.log(i), 100) // Prints 0, 1, 2, 3, 4
}
```

Vue avoids this by always using `let` or `const` in loops.

---

## Exercises

1. **Build a counter factory** using closures:

   ```js
   function createCounter(initial = 0) {
     // Return an object with increment(), decrement(), and getCount()
     // The count should be private (not directly accessible)
   }
   ```

2. **Trace the save-restore pattern**: In the `ReactiveEffect.run()` method, what happens if `this.fn()` throws? Does `activeSub` get restored?

   > **Hint**: Look at the `finally` block

3. **Search for `let` at module level** in `packages/reactivity/src/effect.ts`. List all shared mutable state variables and explain their purpose.

4. **Why is the closure pattern critical for Vue's reactivity?** If `activeSub` didn't exist, how would `track()` know which effect is currently running?

---

## Key Takeaways

1. Closures = functions that remember their creation scope
2. Vue uses closures for caching (memoization), private state, and the reactivity system
3. The save-and-restore pattern enables nested effects
4. Module-level variables provide shared mutable state for the entire module
5. `let` in loops prevents the classic closure-over-variable bug
6. `try/finally` ensures cleanup happens even when errors occur

**Next**: [07 — Classes](./07-classes)
