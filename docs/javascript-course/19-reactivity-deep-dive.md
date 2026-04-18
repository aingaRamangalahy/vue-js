# 19 — Reactivity Deep Dive

> **Difficulty**: Expert  
> **Key files**: `packages/reactivity/src/reactive.ts`, `packages/reactivity/src/ref.ts`, `packages/reactivity/src/effect.ts`, `packages/reactivity/src/computed.ts`, `packages/reactivity/src/dep.ts`

## What You'll Learn

- How the entire reactivity system works end-to-end
- The dependency tracking algorithm
- Computed values and lazy evaluation
- Batching and scheduling
- The doubly-linked list optimization

---

## The Big Picture

Vue's reactivity can be summarized in two operations:

1. **Track**: When a reactive value is READ, record which effect depends on it
2. **Trigger**: When a reactive value is WRITTEN, re-run all dependent effects

```
                    ┌──────────────────┐
      reads from    │                  │   notifies
   ┌───────────────►│   Dep (source)   ├──────────────┐
   │                │                  │              │
   │                └──────────────────┘              ▼
┌──┴───────────┐         Link ◄──►         ┌─────────────────┐
│   Effect     │ ─────────────────────────► │  Re-run effect  │
│ (subscriber) │                            │                 │
└──────────────┘                            └─────────────────┘
```

---

## Layer 1: reactive() — Wrapping Objects

```ts
// packages/reactivity/src/reactive.ts

export function reactive(target: object) {
  if (isReadonly(target)) {
    return target
  }
  return createReactiveObject(
    target,
    false, // not readonly
    mutableHandlers, // proxy handlers for objects/arrays
    mutableCollectionHandlers, // proxy handlers for Map/Set
    reactiveMap, // WeakMap cache
  )
}

function createReactiveObject(
  target,
  isReadonly,
  baseHandlers,
  collectionHandlers,
  proxyMap,
) {
  // 1. Already proxied? Return from cache
  const existingProxy = proxyMap.get(target)
  if (existingProxy) return existingProxy

  // 2. Determine handler type (object vs collection)
  const targetType = getTargetType(target)
  if (targetType === TargetType.INVALID) return target

  // 3. Create proxy
  const proxy = new Proxy(
    target,
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
  )

  // 4. Cache the proxy
  proxyMap.set(target, proxy)
  return proxy
}
```

**Key points:**

- Every raw object gets exactly ONE proxy (cached in WeakMap)
- `reactive()` is idempotent — calling it twice returns the same proxy
- Collections (Map/Set) need different proxy handlers

---

## Layer 2: ref() — Wrapping Primitives

Primitives can't be proxied, so `ref()` wraps them in an object:

```ts
// packages/reactivity/src/ref.ts

class RefImpl<T = any> {
  _value: T
  private _rawValue: T
  dep: Dep = new Dep() // Each ref has its own Dep

  constructor(value: T, isShallow: boolean) {
    this._rawValue = isShallow ? value : toRaw(value)
    this._value = isShallow ? value : toReactive(value)
  }

  get value() {
    this.dep.track() // TRACK on read
    return this._value
  }

  set value(newValue) {
    const oldValue = this._rawValue
    newValue = toRaw(newValue)
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue
      this._value = toReactive(newValue)
      this.dep.trigger() // TRIGGER on write
    }
  }
}
```

**ref vs reactive:**
| | `ref()` | `reactive()` |
|---|---------|-------------|
| Works with | Any value (primitives + objects) | Objects only |
| Access via | `.value` | Direct property access |
| Tracking | Single Dep per ref | One Dep per property per object |

---

## Layer 3: Dep — The Dependency Hub

```ts
// packages/reactivity/src/dep.ts

export let globalVersion = 0

export class Dep {
  version = 0
  activeLink?: Link = undefined
  subs?: Link = undefined // Subscribers linked list (tail)
  subsHead?: Link // Subscribers linked list (head)

  track(): Link | undefined {
    if (!activeSub || !shouldTrack) return

    let link = this.activeLink
    if (!link || link.sub !== activeSub) {
      // Create a new link between this dep and the active subscriber
      link = this.activeLink = new Link(activeSub, this)

      // Add to subscriber's dep list
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link
      } else {
        link.prevDep = activeSub.depsTail
        activeSub.depsTail!.nextDep = link
        activeSub.depsTail = link
      }

      // Add to this dep's subscriber list
      addSub(link)
    }

    link.version = this.version
    return link
  }

  trigger(): void {
    this.version++
    globalVersion++
    this.notify()
  }

  notify(): void {
    startBatch()
    try {
      for (let link = this.subs; link; link = link.prevSub) {
        link.sub.notify()
      }
    } finally {
      endBatch()
    }
  }
}
```

**The tracking algorithm:**

1. When `dep.track()` is called, `activeSub` tells us WHICH effect is running
2. A `Link` is created connecting the dep to the subscriber
3. The link is added to BOTH the dep's subscriber list AND the effect's dep list
4. When `dep.trigger()` fires, it walks its subscriber list and notifies each

---

## Layer 4: ReactiveEffect — The Runner

```ts
// packages/reactivity/src/effect.ts

export let activeSub: Subscriber | undefined // Currently running effect

export class ReactiveEffect<T = any> implements Subscriber {
  deps?: Link = undefined
  depsTail?: Link = undefined
  flags: EffectFlags = EffectFlags.ACTIVE | EffectFlags.TRACKING

  constructor(public fn: () => T) {
    // Register in active effect scope
    if (activeEffectScope && activeEffectScope.active) {
      activeEffectScope.effects.push(this)
    }
  }

  run(): T {
    // If not active, just run without tracking
    if (!(this.flags & EffectFlags.ACTIVE)) {
      return this.fn()
    }

    this.flags |= EffectFlags.RUNNING
    cleanupEffect(this)
    prepareDeps(this) // Mark all existing deps for cleanup

    const prevEffect = activeSub // Save current
    const prevShouldTrack = shouldTrack
    activeSub = this // Set THIS as the active subscriber
    shouldTrack = true

    try {
      return this.fn() // Run the user function — this triggers track()!!
    } finally {
      cleanupDeps(this) // Remove deps that weren't accessed
      activeSub = prevEffect // Restore previous
      shouldTrack = prevShouldTrack
      this.flags &= ~EffectFlags.RUNNING
    }
  }
}
```

**The magic moment**: When `this.fn()` runs, it reads reactive properties. Each read triggers a proxy's `get` trap, which calls `dep.track()`, which sees `activeSub = this` and creates a Link.

```
effect.run()
  activeSub = this         ← "I'm the active subscriber"
  this.fn()
    reads state.count      ← Proxy GET trap fires
      dep.track()          ← "activeSub wants to know about me"
        new Link(activeSub, dep)   ← Connection established!
```

---

## Layer 5: computed() — Lazy Evaluation

```ts
// packages/reactivity/src/computed.ts

export class ComputedRefImpl<T = any> implements Subscriber {
  _value: any = undefined
  readonly dep: Dep = new Dep(this)
  flags: EffectFlags = EffectFlags.DIRTY // Starts dirty!
  globalVersion: number = globalVersion - 1 // Force initial compute

  constructor(
    public fn: ComputedGetter<T>,
    private readonly setter: ComputedSetter<T> | undefined,
  ) {}

  notify(): true | void {
    this.flags |= EffectFlags.DIRTY // Mark as needs recomputation
    if (!(this.flags & EffectFlags.NOTIFIED) && activeSub !== this) {
      batch(this, true) // Propagate to OUR subscribers
      return true
    }
  }

  get value(): T {
    const link = this.dep.track() // Track who reads US
    refreshComputed(this) // Recompute if dirty
    return this._value
  }
}
```

**Computed values are both subscribers AND dependencies:**

```
                     subscribes to         subscribes to
    Component Effect ──────────────► Computed ──────────────► Dep (state.count)
                     (reads computed.value)  (reads state.count in getter)
```

When `state.count` changes:

1. `state.count`'s Dep notifies Computed → marks as DIRTY
2. Computed's Dep notifies Component Effect → queues re-render
3. During re-render, `computed.value` is read → recomputes because DIRTY
4. New value returned

**Lazy evaluation**: The computed doesn't recompute immediately. It only recalculates when someone reads `.value`.

---

## The Batching System

```ts
// packages/reactivity/src/effect.ts

let batchDepth = 0
let batchedSub: Subscriber | undefined

export function startBatch(): void {
  batchDepth++
}

export function endBatch(): void {
  if (--batchDepth > 0) return

  // Process all batched subscribers
  while (batchedSub) {
    let e: Subscriber | undefined = batchedSub
    batchedSub = undefined

    while (e) {
      const next: Subscriber | undefined = e.next
      e.next = undefined
      e.flags &= ~EffectFlags.NOTIFIED
      if (e.flags & EffectFlags.ACTIVE) {
        e.trigger() // Actually run the effect
      }
      e = next
    }
  }
}

export function batch(sub: Subscriber, isComputed = false): void {
  sub.flags |= EffectFlags.NOTIFIED
  sub.next = batchedSub // Add to front of singly-linked list
  batchedSub = sub
}
```

**Why batching?** If changing `state.a` and `state.b` both affect the same component, we only want ONE re-render, not two.

```
startBatch()
  dep1.notify() → batch(effectA)         (added to batchedSub list)
  dep2.notify() → effectA already NOTIFIED, skip!
endBatch()
  effectA.trigger()                       (runs once!)
```

---

## The Doubly-Linked List: Why Not Map/Set?

Vue 3.5 switched from Map/Set to a doubly-linked list for dependency tracking:

```ts
export class Link {
  nextDep?: Link // Next dep for this subscriber →
  prevDep?: Link // ← Prev dep for this subscriber
  nextSub?: Link // Next subscriber for this dep →
  prevSub?: Link // ← Prev subscriber for this dep
}
```

**Advantages:**

1. **O(1) insertion and removal** — no hashing overhead
2. **Lower memory** — no Map/Set internal structures
3. **No garbage collection pressure** — Links can be pooled
4. **Version-based cleanup** — stale links detected by version mismatch

---

## Complete Flow: A Reactive Update

```ts
const count = ref(0)

effect(() => {
  console.log(count.value) // Reads count
})

count.value++ // Triggers update
```

**Step by step:**

1. `ref(0)` → creates `RefImpl { _value: 0, dep: new Dep() }`

2. `effect(fn)` → creates `ReactiveEffect(fn)`
   - Calls `effect.run()`
   - Sets `activeSub = effect`
   - Runs `fn()`
   - `fn` reads `count.value`
   - RefImpl getter calls `this.dep.track()`
   - `track()` sees `activeSub = effect`, creates `Link(effect, dep)`
   - `fn` returns, `activeSub` restored

3. `count.value++` (which is `count.value = count.value + 1`)
   - RefImpl setter fires
   - `hasChanged(1, 0)` → true
   - `this.dep.trigger()`
   - `trigger()` calls `notify()`
   - `notify()` walks subscriber list, finds our effect
   - `effect.notify()` → `batch(effect)`
   - `endBatch()` → `effect.trigger()` → `effect.run()` → `fn()` → logs `1`

---

## Exercises

1. **Build a mini reactive system**: Implement `reactive()`, `effect()`, and `track()`/`trigger()` using just Proxy and a Map. Don't worry about the linked list.

2. **Trace a computed update**: Given `const double = computed(() => count.value * 2)`, trace what happens when `count.value` changes from 1 to 2.

3. **Read `prepareDeps` and `cleanupDeps`**: These handle the case where a dependency is no longer needed. If `v-if` hides a section, its dependencies should be cleaned up.

4. **Search for `startBatch` and `endBatch`**: Where else does Vue use batching besides the reactive system?

---

## Key Takeaways

1. **reactive()** wraps objects with Proxy; **ref()** wraps values in a class with getter/setter
2. **track()** records which effect depends on which dep (via Links)
3. **trigger()** notifies all subscribers when a dep changes
4. **Computed** is both a subscriber (to its deps) and a dependency (to its readers)
5. **Batching** deduplicates notifications — one change = one re-run
6. **Doubly-linked lists** provide O(1) tracking with minimal memory overhead
7. **Lazy evaluation** means computed values only recompute when read

**Next**: [20 — Performance Patterns](./20-performance-patterns)
