# 12 — Sets, Maps & WeakMap

> **Difficulty**: Advanced  
> **Key files**: `packages/reactivity/src/reactive.ts`, `packages/reactivity/src/dep.ts`, `packages/reactivity/src/collectionHandlers.ts`

## What You'll Learn

- Map and Set collections
- WeakMap and WeakSet — weak references and garbage collection
- How Vue uses these data structures for critical infrastructure
- Choosing the right data structure for the job

---

## Map — Key-Value Pairs with Any Key Type

Unlike plain objects (which only support string/symbol keys), **Map** supports any value as a key:

```js
const map = new Map()
map.set('string', 1) // string key
map.set(42, 2) // number key
map.set(document.body, 3) // object key!
map.set(true, 4) // boolean key
```

### Map in Vue's Transform Context

```ts
// packages/compiler-core/src/transform.ts

export interface TransformContext {
  helpers: Map<symbol, number> // Symbol → usage count
  // ...
}
```

The compiler tracks how many times each helper function is used. A `Map<symbol, number>` is perfect because the keys are symbols (not strings).

---

## Set — Unique Values

A **Set** stores unique values — no duplicates allowed.

```ts
// packages/runtime-core/src/scheduler.ts

const deduped = [...new Set(pendingPostFlushCbs)].sort(compareCb)
```

**Pattern**: Convert array to Set (removes duplicates), spread back into array, then sort.

### Set in Vue's Compiler

```ts
// packages/compiler-core/src/transform.ts

export interface TransformContext {
  components: Set<string> // Unique component names
  directives: Set<string> // Unique directive names
  // ...
}
```

Sets are used to collect unique names. Adding the same component twice has no effect — Sets automatically deduplicate.

### Map and Set Methods

| Map Method            | Set Method          | Description     |
| --------------------- | ------------------- | --------------- |
| `map.set(key, value)` | `set.add(value)`    | Add entry       |
| `map.get(key)`        | `set.has(value)`    | Read/check      |
| `map.has(key)`        | —                   | Check existence |
| `map.delete(key)`     | `set.delete(value)` | Remove entry    |
| `map.size`            | `set.size`          | Count entries   |
| `map.clear()`         | `set.clear()`       | Remove all      |
| `map.forEach(fn)`     | `set.forEach(fn)`   | Iterate         |

---

## WeakMap — The Memory-Safe Map

A **WeakMap** holds "weak" references to its keys. If nothing else references the key, it gets garbage collected automatically.

### Vue's Reactive Cache

```ts
// packages/reactivity/src/reactive.ts

export const reactiveMap: WeakMap<Target, any> = new WeakMap<Target, any>()
export const shallowReactiveMap: WeakMap<Target, any> = new WeakMap<
  Target,
  any
>()
export const readonlyMap: WeakMap<Target, any> = new WeakMap<Target, any>()
export const shallowReadonlyMap: WeakMap<Target, any> = new WeakMap<
  Target,
  any
>()
```

**This is critically important.** When Vue calls `reactive(obj)`, it stores the mapping `obj → proxy` in `reactiveMap`. Using a WeakMap means:

1. If `obj` is garbage collected (no longer referenced), the cache entry is automatically removed
2. No memory leaks! The proxy map doesn't prevent objects from being freed
3. Calling `reactive(obj)` twice returns the same proxy (cache lookup)

### Why Not a Regular Map?

```js
// Regular Map — MEMORY LEAK!
const cache = new Map()
function process(obj) {
  cache.set(obj, expensiveComputation(obj))
  // Even after obj goes out of scope, the Map keeps a strong reference
  // obj can NEVER be garbage collected!
}

// WeakMap — no memory leak
const cache = new WeakMap()
function process(obj) {
  cache.set(obj, expensiveComputation(obj))
  // When obj goes out of scope, the WeakMap entry is automatically cleaned up
}
```

### Props Cache

```ts
// packages/runtime-core/src/componentProps.ts

const mixinPropsCache = new WeakMap<ConcreteComponent, NormalizedPropsOptions>()
```

Normalized props options are cached per component. When a component is unloaded and garbage collected, its cache entry disappears automatically.

---

## WeakMap Limitations

| Feature                | Map                 | WeakMap           |
| ---------------------- | ------------------- | ----------------- |
| Key types              | Any                 | Objects only      |
| Iterable               | Yes (`for...of`)    | No                |
| `.size`                | Yes                 | No                |
| `.clear()`             | Yes                 | No                |
| `.keys()`, `.values()` | Yes                 | No                |
| Garbage collection     | Prevents GC of keys | Allows GC of keys |

WeakMaps are intentionally limited. You can't iterate or count entries because entries might disappear at any time due to GC.

---

## WeakSet — Set with Weak References

```ts
// Conceptual usage in Vue
const pausedQueueEffects = new Set<ReactiveEffect>()
```

While Vue primarily uses `Set` for effects tracking (since effects are actively managed), `WeakSet` follows the same pattern as `WeakMap`:

```js
const seen = new WeakSet()

function process(obj) {
  if (seen.has(obj)) return // Already processed
  seen.add(obj)
  // ... process obj
  // When obj is GC'd, it's automatically removed from seen
}
```

---

## Collection Handlers: Reactive Maps and Sets

Vue needs to make Map and Set reactive. Since Maps/Sets store data internally (not as properties), normal Proxy traps don't work. Vue intercepts their methods:

```ts
// packages/reactivity/src/collectionHandlers.ts

type CollectionTypes = IterableCollections | WeakCollections

type IterableCollections = (Map<any, any> | Set<any>) & Target
type WeakCollections = (WeakMap<any, any> | WeakSet<any>) & Target
```

### Intercepted Operations

```ts
// packages/reactivity/src/collectionHandlers.ts

function createIterableMethod(
  method: string | symbol,
  isReadonly: boolean,
  isShallow: boolean,
) {
  return function (this: IterableCollections, ...args: unknown[]) {
    const target = this[ReactiveFlags.RAW]
    const rawTarget = toRaw(target)
    const targetIsMap = isMap(rawTarget)

    const isPair =
      method === 'entries' || (method === Symbol.iterator && targetIsMap)
    const isKeyOnly = method === 'keys' && targetIsMap

    const innerIterator = target[method](...args)

    // Track iteration dependency
    track(
      rawTarget,
      TrackOpTypes.ITERATE,
      isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY,
    )

    // Return a custom iterator that wraps values reactively
    return {
      next() {
        const { value, done } = innerIterator.next()
        return done
          ? { value, done }
          : {
              value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
              done,
            }
      },
      [Symbol.iterator]() {
        return this
      },
    }
  }
}
```

**What this does:**

1. Gets the raw (un-proxied) target
2. Tracks iteration as a dependency
3. Returns a custom iterator that wraps each yielded value in `reactive()` / `readonly()`

---

## Choosing the Right Data Structure

| Use Case              | Data Structure        | Why                           |
| --------------------- | --------------------- | ----------------------------- |
| Cache object→value    | `WeakMap`             | Auto-cleanup when objects die |
| Track unique strings  | `Set`                 | Fast `.has()`, auto-dedup     |
| Count by key          | `Map`                 | Supports any key type         |
| Cache by component    | `WeakMap`             | No memory leaks on unmount    |
| Deduplicate callbacks | `new Set(array)`      | One-step dedup                |
| Track "seen" objects  | `WeakSet`             | No memory leaks               |
| Store by string key   | `Object.create(null)` | Fastest for string keys       |

---

## Exercises

1. **Build a memoize function** using WeakMap:

   ```js
   function memoize(fn) {
     const cache = new WeakMap()
     return function (obj) {
       if (cache.has(obj)) return cache.get(obj)
       const result = fn(obj)
       cache.set(obj, result)
       return result
     }
   }
   ```

2. **Why does `reactiveMap` use WeakMap?** What would happen if it used a regular Map and you created 10,000 reactive objects that later went out of scope?

3. **Search for `new Map(`** and **`new Set(`** in the codebase. Categorize the use cases.

4. **Think about iteration tracking**: When you call `reactiveMap.forEach()`, what dependency is tracked? What triggers when you `map.set(newKey, value)`?

---

## Key Takeaways

1. `Map` supports any key type; `Set` stores unique values
2. `WeakMap`/`WeakSet` hold weak references — entries are GC'd when keys die
3. Vue's `reactiveMap` is a WeakMap to prevent memory leaks
4. Collections need special proxy handlers (can't use normal `get`/`set` traps)
5. `Object.create(null)` is still preferred for pure string→value caches
6. Choose your data structure based on key types, GC needs, and iteration requirements

**Next**: [13 — Bitwise Operations](./13-bitwise-operations)
