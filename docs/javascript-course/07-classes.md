# 07 — Classes

> **Difficulty**: Intermediate  
> **Key files**: `packages/reactivity/src/effect.ts`, `packages/reactivity/src/ref.ts`, `packages/reactivity/src/dep.ts`

## What You'll Learn

- ES6 class syntax and how it maps to prototypes
- Constructors, methods, getters, and setters
- Implementing interfaces with classes
- How Vue.js uses classes for its core reactivity primitives

---

## Why Classes?

Vue.js uses classes for its core data structures — `ReactiveEffect`, `RefImpl`, `ComputedRefImpl`, `Dep`, `Link`. Classes provide:

- Clear structure for objects with methods
- Efficient method sharing via the prototype
- Good support from JavaScript engines for optimization

---

## Anatomy of a Class

### The Dep Class — Dependency Tracking

```ts
// packages/reactivity/src/dep.ts

export class Dep {
  version = 0 // Instance property with default
  activeLink?: Link = undefined // Optional property
  subs?: Link = undefined // Subscribers list (tail)
  subsHead?: Link // Subscribers list (head) — no default

  // Reference to associated computed value (if any)
  computed?: ComputedRefImpl | null = undefined

  constructor(computed?: ComputedRefImpl | null) {
    this.computed = computed
  }

  track(): Link | undefined {
    // ... tracking logic
  }

  trigger(): void {
    // ... triggering logic
  }
}
```

**Key concepts:**

- **Instance properties** (`version = 0`): each instance gets its own copy
- **Constructor**: runs when you `new Dep()` — initializes the instance
- **Methods** (`track()`, `trigger()`): shared on the prototype — all instances use the same function

### Memory Layout

```
Dep.prototype: {
  track: [Function],      ← shared between ALL Dep instances
  trigger: [Function],    ← shared between ALL Dep instances
}

dep1: { version: 0, subs: undefined, __proto__: Dep.prototype }
dep2: { version: 3, subs: Link{...}, __proto__: Dep.prototype }
```

Methods live on the prototype, not on each instance. This is memory-efficient.

---

## The Link Class — Doubly Linked List Node

```ts
// packages/reactivity/src/dep.ts

export class Link {
  version: number

  // Pointers for doubly-linked lists
  nextDep?: Link
  prevDep?: Link
  nextSub?: Link
  prevSub?: Link
  prevActiveLink?: Link

  constructor(
    public sub: Subscriber, // public = auto-assigned from parameter
    public dep: Dep, // public = auto-assigned from parameter
  ) {
    this.version = dep.version
    this.nextDep =
      this.prevDep =
      this.nextSub =
      this.prevSub =
      this.prevActiveLink =
        undefined
  }
}
```

**`public` parameter shorthand:**

```ts
constructor(public sub: Subscriber, public dep: Dep)
```

is equivalent to:

```ts
sub: Subscriber
dep: Dep
constructor(sub: Subscriber, dep: Dep) {
  this.sub = sub
  this.dep = dep
}
```

TypeScript's `public` keyword in constructor parameters automatically creates and assigns instance properties.

---

## Class with Getters and Setters

```ts
// packages/reactivity/src/ref.ts

class RefImpl<T = any> {
  _value: T // Internal cached value
  private _rawValue: T // Original unwrapped value

  dep: Dep = new Dep()

  public readonly [ReactiveFlags.IS_REF] = true
  public readonly [ReactiveFlags.IS_SHALLOW]: boolean = false

  constructor(value: T, isShallow: boolean) {
    this._rawValue = isShallow ? value : toRaw(value)
    this._value = isShallow ? value : toReactive(value)
    this[ReactiveFlags.IS_SHALLOW] = isShallow
  }

  get value() {
    // GETTER — runs when you read .value
    this.dep.track()
    return this._value
  }

  set value(newValue) {
    // SETTER — runs when you write .value
    const oldValue = this._rawValue
    const useDirectValue =
      this[ReactiveFlags.IS_SHALLOW] ||
      isShallow(newValue) ||
      isReadonly(newValue)
    newValue = useDirectValue ? newValue : toRaw(newValue)
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue
      this._value = useDirectValue ? newValue : toReactive(newValue)
      this.dep.trigger() // Notify subscribers!
    }
  }
}
```

**This is the heart of `ref()`!**

When you write:

```ts
const count = ref(0)
count.value++
```

1. Reading `count.value` triggers the **getter** → `dep.track()` records the dependency
2. Writing `count.value = 1` triggers the **setter** → `dep.trigger()` notifies effects

Getters and setters look like regular property access to the user, but run custom logic underneath.

---

## Class with Implements

```ts
// packages/reactivity/src/effect.ts

export class ReactiveEffect<T = any>
  implements Subscriber, ReactiveEffectOptions
{
  // Implements interfaces
  deps?: Link = undefined
  depsTail?: Link = undefined
  flags: EffectFlags = EffectFlags.ACTIVE | EffectFlags.TRACKING
  next?: Subscriber = undefined
  cleanup?: () => void = undefined

  scheduler?: EffectScheduler = undefined
  onStop?: () => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void

  constructor(public fn: () => T) {
    if (activeEffectScope && activeEffectScope.active) {
      activeEffectScope.effects.push(this)
    }
  }
}
```

**`implements`** is a TypeScript concept:

- The class promises to have all properties/methods defined by the interface
- The compiler verifies this at compile time
- No runtime effect — interfaces are erased in JavaScript output

---

## Class Methods

```ts
// packages/reactivity/src/effect.ts (ReactiveEffect class)

pause(): void {
  this.flags |= EffectFlags.PAUSED
}

resume(): void {
  if (this.flags & EffectFlags.PAUSED) {
    this.flags &= ~EffectFlags.PAUSED
    if (pausedQueueEffects.has(this)) {
      pausedQueueEffects.delete(this)
      this.trigger()
    }
  }
}

notify(): void {
  if (
    this.flags & EffectFlags.RUNNING &&
    !(this.flags & EffectFlags.ALLOW_RECURSE)
  ) {
    return
  }
  if (!(this.flags & EffectFlags.NOTIFIED)) {
    batch(this)
  }
}

stop(): void {
  if (this.flags & EffectFlags.ACTIVE) {
    for (let link = this.deps; link; link = link.nextDep) {
      removeSub(link)
    }
    this.deps = this.depsTail = undefined
    cleanupEffect(this)
    this.onStop && this.onStop()
    this.flags &= ~EffectFlags.ACTIVE
  }
}
```

Notice:

- **No `function` keyword** in method definitions
- Methods use bitwise operations on `this.flags` (covered in lesson 13)
- `stop()` walks the linked list of dependencies to clean up

---

## Computed Values with `get`/`set`

```ts
// packages/reactivity/src/computed.ts

export class ComputedRefImpl<T = any> implements Subscriber {
  _value: any = undefined
  readonly dep: Dep = new Dep(this)
  readonly __v_isRef = true
  readonly __v_isReadonly: boolean

  flags: EffectFlags = EffectFlags.DIRTY
  globalVersion: number = globalVersion - 1

  constructor(
    public fn: ComputedGetter<T>,
    private readonly setter: ComputedSetter<T> | undefined,
    isSSR: boolean,
  ) {
    this[ReactiveFlags.IS_READONLY] = !setter
  }

  get value(): T {
    const link = this.dep.track()
    refreshComputed(this) // Recompute if dirty
    if (link) {
      link.version = this.dep.version
    }
    return this._value
  }

  set value(newValue) {
    if (this.setter) {
      this.setter(newValue)
    }
  }
}
```

Computed values are **lazy** — they only recompute when:

1. They're marked as `DIRTY` (a dependency changed)
2. Someone actually reads `.value` (the getter is called)

---

## Computed Symbol Properties

```ts
// packages/reactivity/src/ref.ts

class RefImpl<T = any> {
  public readonly [ReactiveFlags.IS_REF] = true
  public readonly [ReactiveFlags.IS_SHALLOW]: boolean = false
}
```

`[ReactiveFlags.IS_REF]` is a **computed property name** — the key is the value of the constant, not the string `"ReactiveFlags.IS_REF"`. Vue uses this to mark objects as refs, reactives, etc.

---

## When Vue Doesn't Use Classes

Not everything is a class. Vue uses plain objects and functions when:

- The object is a simple data container (VNodes are plain objects)
- There's no shared behavior to put on a prototype
- The "class" would only have a constructor (just use a factory function)

---

## Exercises

1. **Create a simple Ref** class:

   ```js
   class SimpleRef {
     constructor(value) {
       /* ... */
     }
     get value() {
       /* ... track ... */
     }
     set value(v) {
       /* ... trigger ... */
     }
   }
   ```

2. **Trace what happens** when you call `ref(42)`:
   - What class is instantiated?
   - What does the constructor do?
   - What happens when you read `.value`?

3. **Search for `class`** in `packages/reactivity/src/`. List all classes in the reactivity package. Why are these things classes but VNodes aren't?

4. **Understand getters**: How is `get value()` different from a `getValue()` method? What's the user-facing difference?

---

## Key Takeaways

1. Classes provide structured objects with shared methods (via prototype)
2. `constructor(public x: T)` is TypeScript shorthand for declaring and assigning
3. Getters (`get`) and setters (`set`) intercept property access — key to Vue's reactivity
4. `implements` enforces interface contracts at compile time
5. Vue uses classes for core primitives (Dep, Link, RefImpl, ComputedRefImpl, ReactiveEffect)
6. Not everything should be a class — use them when you need shared behavior

**Next**: [08 — Modules](./08-modules)
