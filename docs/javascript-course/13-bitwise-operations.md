# 13 — Bitwise Operations

> **Difficulty**: Advanced  
> **Key files**: `packages/shared/src/shapeFlags.ts`, `packages/shared/src/patchFlags.ts`, `packages/reactivity/src/effect.ts`

## What You'll Learn

- Binary numbers and bitwise operators
- Bit flags — storing multiple booleans in a single number
- How Vue uses bitwise ops for ultra-fast type checks
- The flag manipulation pattern (set, clear, toggle, check)

---

## Why Bitwise Operations?

Vue.js uses bitwise operations **extensively** for performance. Instead of checking multiple boolean properties, Vue packs multiple flags into a single number:

```ts
// Slow: multiple boolean checks
if (node.isElement && node.hasChildren && !node.isComponent) { ... }

// Fast: single bitwise check
if (shapeFlag & ShapeFlags.ELEMENT) { ... }
```

Bitwise operations are single CPU instructions — the fastest possible check.

---

## Binary Numbers Primer

Every number is stored as bits (0s and 1s):

```
Decimal  Binary
1        00000001
2        00000010
4        00000100
8        00001000
16       00010000
```

Each position is a power of 2. This means each bit can independently represent a true/false flag.

---

## Vue's ShapeFlags

```ts
// packages/shared/src/shapeFlags.ts

export enum ShapeFlags {
  ELEMENT = 1, // 000000001
  FUNCTIONAL_COMPONENT = 1 << 1, // 000000010
  STATEFUL_COMPONENT = 1 << 2, // 000000100
  TEXT_CHILDREN = 1 << 3, // 000001000
  ARRAY_CHILDREN = 1 << 4, // 000010000
  SLOTS_CHILDREN = 1 << 5, // 000100000
  TELEPORT = 1 << 6, // 001000000
  SUSPENSE = 1 << 7, // 010000000
  COMPONENT_SHOULD_KEEP_ALIVE = 1 << 8, // 100000000
  COMPONENT_KEPT_ALIVE = 1 << 9,
  COMPONENT = ShapeFlags.STATEFUL_COMPONENT | ShapeFlags.FUNCTIONAL_COMPONENT,
}
```

### The `<<` Operator (Left Shift)

`1 << n` shifts the binary `1` left by `n` positions:

```
1 << 0  =  1  =  00000001
1 << 1  =  2  =  00000010
1 << 2  =  4  =  00000100
1 << 3  =  8  =  00001000
```

Each flag occupies a unique bit position. This means they can be **combined**:

```ts
// COMPONENT is both STATEFUL and FUNCTIONAL
COMPONENT = STATEFUL_COMPONENT | FUNCTIONAL_COMPONENT
//        = 000000100 | 000000010
//        = 000000110
```

---

## PatchFlags — Optimization Hints

```ts
// packages/shared/src/patchFlags.ts

export enum PatchFlags {
  TEXT = 1, // Dynamic text content
  CLASS = 1 << 1, // Dynamic class binding
  STYLE = 1 << 2, // Dynamic style binding
  PROPS = 1 << 3, // Dynamic non-class/style props
  FULL_PROPS = 1 << 4, // Props with dynamic keys
  HYDRATE_EVENTS = 1 << 5, // SSR hydration events
  STABLE_FRAGMENT = 1 << 6, // Children order won't change
  KEYED_FRAGMENT = 1 << 7, // Children with keys
  UNKEYED_FRAGMENT = 1 << 8, // Children without keys
  NEED_PATCH = 1 << 9, // Non-props reactive bindings
  DYNAMIC_SLOTS = 1 << 10, // Dynamic slot content
  DEV_ROOT_FRAGMENT = 1 << 11,
  HOISTED = -1, // Static content (never changes)
  BAIL = -2, // Disable optimization
}
```

The compiler generates these flags to tell the runtime **exactly** what can change. If only text is dynamic, the runtime only diffs the text — skipping class, style, and attribute checks entirely.

---

## The Four Bitwise Operations

### 1. Check a Flag: `&` (AND)

```ts
// packages/reactivity/src/effect.ts

if (!(this.flags & EffectFlags.ACTIVE)) {
  return this.fn()
}
```

**Bitwise AND** (`&`) returns 1 only where both bits are 1:

```
flags    = 00000101  (ACTIVE | TRACKING)
ACTIVE   = 00000001
&        = 00000001  (truthy — flag IS set)
```

```
flags    = 00000100  (only TRACKING)
ACTIVE   = 00000001
&        = 00000000  (falsy — flag is NOT set)
```

### 2. Set a Flag: `|=` (OR-assign)

```ts
// packages/reactivity/src/effect.ts

this.flags |= EffectFlags.RUNNING
```

**Bitwise OR** (`|`) returns 1 where either bit is 1:

```
flags    = 00000101  (ACTIVE | TRACKING)
RUNNING  = 00001000
|=       = 00001101  (RUNNING is now set, others preserved)
```

### 3. Clear a Flag: `&= ~` (AND-NOT-assign)

```ts
// packages/reactivity/src/effect.ts

this.flags &= ~EffectFlags.RUNNING
```

`~` (NOT) flips all bits. `&=` then clears only the target bit:

```
RUNNING  = 00001000
~RUNNING = 11110111
flags    = 00001101
&=       = 00000101  (RUNNING cleared, others preserved)
```

### 4. Toggle a Flag: `^=` (XOR-assign)

```ts
// Less common, but useful:
this.flags ^= EffectFlags.PAUSED // If set, clear it. If clear, set it.
```

---

## EffectFlags — Reactivity State Machine

```ts
// packages/reactivity/src/effect.ts

export enum EffectFlags {
  ACTIVE = 1 << 0, // 00000001 - Effect is active (not stopped)
  RUNNING = 1 << 1, // 00000010 - Currently executing
  TRACKING = 1 << 2, // 00000100 - Tracking dependencies
  NOTIFIED = 1 << 3, // 00001000 - Queued for re-run
  DIRTY = 1 << 4, // 00010000 - Needs recomputation (computed)
  ALLOW_RECURSE = 1 << 5, // 00100000 - Can trigger itself
  PAUSED = 1 << 6, // 01000000 - Temporarily disabled
  NO_BATCH = 1 << 7, // 10000000 - Not batchable
}
```

### Flag Combinations in Practice

```ts
// packages/reactivity/src/effect.ts

export class ReactiveEffect<T = any> {
  flags: EffectFlags = EffectFlags.ACTIVE | EffectFlags.TRACKING
  //                 = 00000001 | 00000100
  //                 = 00000101  (active AND tracking)

  run(): T {
    // Check if active
    if (!(this.flags & EffectFlags.ACTIVE)) {
      return this.fn()
    }

    // Set RUNNING flag
    this.flags |= EffectFlags.RUNNING
    // flags is now 00001101 (ACTIVE | TRACKING | RUNNING)

    try {
      return this.fn()
    } finally {
      // Clear RUNNING flag
      this.flags &= ~EffectFlags.RUNNING
      // flags is back to 00000101 (ACTIVE | TRACKING)
    }
  }

  pause(): void {
    this.flags |= EffectFlags.PAUSED
  }

  resume(): void {
    if (this.flags & EffectFlags.PAUSED) {
      this.flags &= ~EffectFlags.PAUSED
      // ... additional logic
    }
  }

  stop(): void {
    if (this.flags & EffectFlags.ACTIVE) {
      // ... cleanup
      this.flags &= ~EffectFlags.ACTIVE
    }
  }

  notify(): void {
    if (
      this.flags & EffectFlags.RUNNING &&
      !(this.flags & EffectFlags.ALLOW_RECURSE)
    ) {
      return // Don't re-trigger if running (unless explicitly allowed)
    }
    if (!(this.flags & EffectFlags.NOTIFIED)) {
      batch(this)
    }
  }
}
```

---

## Combining Flags for Complex Checks

```ts
// Check if COMPONENT (stateful OR functional)
ShapeFlags.COMPONENT =
  ShapeFlags.STATEFUL_COMPONENT | ShapeFlags.FUNCTIONAL_COMPONENT

// Check:
if (shapeFlag & ShapeFlags.COMPONENT) {
  // True for EITHER stateful or functional components
}
```

This is much faster than:

```ts
if (type === 'stateful' || type === 'functional') { ... }
```

---

## Visualization: A Complete Flag Lifecycle

```
Effect created:    flags = ACTIVE | TRACKING       = 00000101

effect.pause():    flags |= PAUSED                 = 01000101
                   (set PAUSED bit)

effect.resume():   flags &= ~PAUSED                = 00000101
                   (clear PAUSED bit)

effect.run():      flags |= RUNNING                = 00001101
  fn() executes...
  finally:         flags &= ~RUNNING               = 00000101

effect.stop():     flags &= ~ACTIVE                = 00000100
                   (only TRACKING remains)
```

---

## Performance: Why Bitwise?

```
Operation                 Time
typeof check              ~2 ns
=== comparison            ~1 ns
Bitwise AND (&)           ~0.3 ns  ← 3-6x faster!
Object property access    ~5 ns
```

In hot paths (called millions of times during rendering), these savings add up.

---

## Exercises

1. **Implement a permission system** using bit flags:

   ```js
   const READ = 1 << 0 // 001
   const WRITE = 1 << 1 // 010
   const EXECUTE = 1 << 2 // 100

   let permissions = READ | WRITE // 011

   // Check if can read:
   if (permissions & READ) {
     /* true */
   }

   // Add execute:
   permissions |= EXECUTE // 111

   // Remove write:
   permissions &= ~WRITE // 101
   ```

2. **Trace through the ShapeFlags**: If a VNode has `shapeFlag = 12`, which flags are set?

   ```
   12 = 00001100 = STATEFUL_COMPONENT (4) | TEXT_CHILDREN (8)
   ```

3. **Search for `& ShapeFlags`** in the codebase. List 5 places where shape flag checks are used.

4. **Why not just use booleans?** Calculate memory: 8 boolean properties × 1 byte each = 8 bytes. One number with 8 flags = 4 bytes. Plus, checking is faster.

---

## Key Takeaways

1. `1 << n` creates a flag at bit position `n`
2. `flags & FLAG` checks if a flag is set (AND)
3. `flags |= FLAG` sets a flag (OR-assign)
4. `flags &= ~FLAG` clears a flag (AND-NOT-assign)
5. Multiple flags in one number = fast, memory-efficient state
6. Vue uses this for ShapeFlags, PatchFlags, and EffectFlags — core performance technique

**Next**: [14 — Error Handling](./14-error-handling)
