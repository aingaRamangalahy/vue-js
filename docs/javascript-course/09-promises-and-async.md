# 09 — Promises & Async

> **Difficulty**: Intermediate  
> **Key files**: `packages/runtime-core/src/scheduler.ts`, `packages/runtime-core/src/errorHandling.ts`

## What You'll Learn

- How Promises work and why they matter
- The microtask queue and event loop
- How Vue's `nextTick` works under the hood
- Async error handling patterns

---

## Promises: The Basics

A **Promise** represents a value that will be available in the future. It can be:

- **Pending** — not yet resolved
- **Fulfilled** — resolved with a value
- **Rejected** — rejected with an error

```js
const promise = new Promise((resolve, reject) => {
  // async operation
  if (success) resolve(value)
  else reject(error)
})

promise
  .then(value => {
    /* fulfilled */
  })
  .catch(error => {
    /* rejected */
  })
```

---

## Vue's nextTick — A Microtask Masterpiece

```ts
// packages/runtime-core/src/scheduler.ts

const resolvedPromise = /*@__PURE__*/ Promise.resolve() as Promise<any>
let currentFlushPromise: Promise<void> | null = null

export function nextTick(): Promise<void>
export function nextTick<T, R>(
  this: T,
  fn: (this: T) => R | Promise<R>,
): Promise<R>
export function nextTick<T, R>(
  this: T,
  fn?: (this: T) => R | Promise<R>,
): Promise<void | R> {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}
```

**Let's break this down line by line:**

### 1. The Pre-resolved Promise

```ts
const resolvedPromise = /*@__PURE__*/ Promise.resolve() as Promise<any>
```

`Promise.resolve()` creates a Promise that's **already fulfilled**. `.then()` on this promise runs its callback in the next **microtask**.

### 2. The currentFlushPromise

```ts
let currentFlushPromise: Promise<void> | null = null
```

When Vue is flushing its update queue, this holds the Promise. This means `nextTick()` during a flush will wait until the flush completes.

### 3. Function Overloads

```ts
export function nextTick(): Promise<void> // No args → returns Promise
export function nextTick<T, R>( // With callback → returns Promise<R>
  this: T,
  fn: (this: T) => R | Promise<R>,
): Promise<R>
```

These are **TypeScript overload signatures**. They define multiple ways to call the function with different types.

### 4. The Implementation

```ts
export function nextTick(this, fn?) {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}
```

- If there's a current flush, wait for it (`currentFlushPromise`)
- Otherwise, use the pre-resolved promise (run in next microtask)
- If a callback was passed, chain it with `.then()`
- Otherwise, return the promise so the caller can `await` it

---

## The Microtask Queue and Event Loop

Understanding the event loop is crucial for understanding Vue's scheduler.

```
┌──────────────────────────┐
│      Call Stack           │  ← Synchronous code runs here
└──────────┬───────────────┘
           │ (when empty)
           ▼
┌──────────────────────────┐
│    Microtask Queue        │  ← Promise.then, queueMicrotask
│    (highest priority)     │  ← Vue's nextTick callbacks
└──────────┬───────────────┘
           │ (when empty)
           ▼
┌──────────────────────────┐
│    Macrotask Queue        │  ← setTimeout, setInterval, I/O
│    (lower priority)       │
└──────────┬───────────────┘
           │ (when empty)
           ▼
┌──────────────────────────┐
│    Render / Paint         │  ← Browser updates the screen
└──────────────────────────┘
```

**Microtasks always run before macrotasks.** This is why Vue uses `Promise.resolve().then()` for scheduling — updates happen as soon as possible, before the browser paints.

---

## Vue's Scheduler: Batching Updates

```ts
// packages/runtime-core/src/scheduler.ts

const queue: SchedulerJob[] = []
let flushIndex = -1
let isFlushing = false
let isFlushPending = false

export function queueJob(job: SchedulerJob): void {
  if (
    !queue.length ||
    !queue.includes(job, flushIndex + 1) // Don't queue duplicates
  ) {
    if (job.id == null) {
      queue.push(job)
    } else {
      queue.splice(findInsertionIndex(job.id), 0, job)
    }
    queueFlush()
  }
}

function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true
    currentFlushPromise = resolvedPromise.then(flushJobs)
    //                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //                    Schedule flush in next microtask
  }
}
```

**The batching pattern:**

1. When a reactive value changes, a component update job is queued
2. Multiple changes in the same synchronous block only queue the job ONCE
3. After all synchronous code finishes, the microtask runs `flushJobs`
4. All queued updates happen in a single batch

This is why this works efficiently:

```ts
count.value = 1
count.value = 2
count.value = 3
// Only ONE component update happens, not three!
```

---

## Promise Chaining

```ts
// packages/runtime-core/src/scheduler.ts

const p = currentFlushPromise || resolvedPromise
return fn ? p.then(this ? fn.bind(this) : fn) : p
```

`.then()` creates a new Promise that runs after the previous one resolves. This is **chaining**:

```js
Promise.resolve()
  .then(() => console.log('first'))
  .then(() => console.log('second'))
  .then(() => console.log('third'))
// Output: first, second, third (in order)
```

---

## Async Error Handling

```ts
// packages/runtime-core/src/errorHandling.ts

export function callWithAsyncErrorHandling(
  fn: Function | Function[],
  instance: ComponentInternalInstance | null,
  type: ErrorTypes,
  args?: unknown[],
): any {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args)
    if (res && isPromise(res)) {
      res.catch(err => {
        handleError(err, instance, type)
      })
    }
    return res
  }

  if (isArray(fn)) {
    const values = []
    for (let i = 0; i < fn.length; i++) {
      values.push(callWithAsyncErrorHandling(fn[i], instance, type, args))
    }
    return values
  }
}
```

**Key insight**: When a component lifecycle hook returns a Promise (is async), Vue attaches a `.catch()` handler to it. This catches async errors that would otherwise go unhandled.

```js
// Without Vue's error handling:
async function setup() {
  const data = await fetch('/api') // If this throws, it's an unhandled rejection!
}

// With Vue's error handling:
// The same error gets caught and routed to errorHandler
```

---

## Promise Detection (Duck Typing)

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

Instead of `val instanceof Promise`, Vue checks for `.then` and `.catch` methods. This handles:

- Native Promises
- Polyfilled Promises
- Any "thenable" (like Bluebird promises)

---

## async/await — Syntactic Sugar

`async/await` is syntactic sugar over Promises:

```ts
// These are equivalent:
function fetchData() {
  return fetch('/api').then(res => res.json())
}

async function fetchData() {
  const res = await fetch('/api')
  return res.json()
}
```

Vue's codebase rarely uses `async/await` internally because:

1. The scheduler operates on raw Promise primitives for precise control
2. `async` functions always return Promises, which has allocation overhead
3. Error handling needs to be explicit and routable to Vue's error system

---

## `Promise.resolve()` vs `new Promise()`

```ts
// Pre-resolved — no allocation of executor function
const resolvedPromise = Promise.resolve()

// New Promise — allocates executor function
const p = new Promise(resolve => resolve())
```

`Promise.resolve()` is cheaper because it doesn't need an executor function. Vue creates it once and reuses it.

---

## Function Binding with Promises

```ts
// packages/runtime-core/src/scheduler.ts

return fn ? p.then(this ? fn.bind(this) : fn) : p
//                         ^^^^^^^^^^
//                         Bind the callback to maintain correct `this`
```

`.bind(this)` creates a new function where `this` is permanently set. This ensures the callback runs with the correct context even though it executes asynchronously.

---

## Exercises

1. **Understand the event loop**: What's the output order?

   ```js
   console.log('1')
   setTimeout(() => console.log('2'), 0)
   Promise.resolve().then(() => console.log('3'))
   console.log('4')
   ```

   > Answer: 1, 4, 3, 2

2. **Trace `nextTick`**: If you call `nextTick(() => console.log('tick'))` while Vue is flushing, when does the callback run?

3. **Why batching matters**: Without batching, changing 3 reactive values would cause 3 DOM updates. How does Vue's scheduler prevent this?

4. **Search for `async`** keyword in `packages/runtime-core/src/`. Where does Vue use actual `async` functions?

---

## Key Takeaways

1. `Promise.resolve().then()` schedules code in the microtask queue
2. Microtasks run before macrotasks and before the browser paints
3. Vue batches multiple reactive changes into a single update flush
4. `nextTick` waits for the current flush to complete
5. Async errors are caught with `.catch()` and routed to Vue's error handler
6. Duck typing (`isPromise`) is more flexible than `instanceof`

**Next**: [10 — Symbols & Iterators](./10-symbols-and-iterators)
