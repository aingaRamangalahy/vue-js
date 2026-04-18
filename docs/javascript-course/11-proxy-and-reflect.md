# 11 — Proxy & Reflect

> **Difficulty**: Advanced  
> **Key files**: `packages/reactivity/src/baseHandlers.ts`, `packages/reactivity/src/reactive.ts`, `packages/reactivity/src/collectionHandlers.ts`

## What You'll Learn

- The Proxy API — intercepting object operations
- The Reflect API — performing default object operations
- All Proxy traps and when they fire
- How Vue.js builds its entire reactivity system on Proxy
- Collection (Map/Set) proxy handling

---

## What Is a Proxy?

A **Proxy** wraps an object and intercepts operations on it. It's JavaScript's meta-programming API.

```js
const handler = {
  get(target, key, receiver) {
    console.log(`Reading ${key}`)
    return Reflect.get(target, key, receiver)
  },
  set(target, key, value, receiver) {
    console.log(`Writing ${key} = ${value}`)
    return Reflect.set(target, key, value, receiver)
  },
}

const proxy = new Proxy({ name: 'Vue' }, handler)
proxy.name // logs: "Reading name", returns "Vue"
proxy.name = 3 // logs: "Writing name = 3"
```

**This is the foundation of Vue's reactivity.** When you access `reactive.value`, Vue's proxy trap knows you read it. When you write `reactive.value = x`, Vue knows you changed it.

---

## How Vue Creates Reactive Proxies

```ts
// packages/reactivity/src/reactive.ts

function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<Target, any>,
) {
  if (!isObject(target)) {
    return target
  }

  // Already a proxy? Return it
  if (
    target[ReactiveFlags.RAW] &&
    !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
  ) {
    return target
  }

  // Already has a proxy in our cache? Return the cached one
  const existingProxy = proxyMap.get(target)
  if (existingProxy) {
    return existingProxy
  }

  // Determine the type of proxy handler to use
  const targetType = getTargetType(target)
  if (targetType === TargetType.INVALID) {
    return target
  }

  const proxy = new Proxy(
    target,
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
  )

  proxyMap.set(target, proxy) // Cache it
  return proxy
}
```

**Key decisions:**

1. Non-objects can't be proxied — return as-is
2. Already proxied? Return existing proxy (avoid double-wrapping)
3. Collections (Map/Set) need different handlers than plain objects
4. Cache the proxy in a WeakMap for future lookups

---

## The Base Reactive Handler (GET trap)

```ts
// packages/reactivity/src/baseHandlers.ts

class BaseReactiveHandler implements ProxyHandler<Target> {
  constructor(
    protected readonly _isReadonly = false,
    protected readonly _isShallow = false,
  ) {}

  get(target: Target, key: string | symbol, receiver: object): any {
    // Handle internal flag checks
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !this._isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return this._isReadonly
    } else if (key === ReactiveFlags.IS_SHALLOW) {
      return this._isShallow
    } else if (key === ReactiveFlags.RAW) {
      // Return the original unwrapped object
      return target
    }

    const targetIsArray = isArray(target)

    if (!this._isReadonly) {
      let fn: Function | undefined
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn // Return patched array methods
      }
      if (key === 'hasOwnProperty') {
        return hasOwnProperty
      }
    }

    const res = Reflect.get(target, key, isRef(target) ? target : receiver)

    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKey(key)) {
      return res // Don't track built-in symbols
    }

    if (!this._isReadonly) {
      track(target, TrackOpTypes.GET, key) // TRACK THE READ!
    }

    if (this._isShallow) {
      return res
    }

    if (isRef(res)) {
      return targetIsArray && isIntegerKey(key) ? res : res.value
    }

    if (isObject(res)) {
      return this._isReadonly ? readonly(res) : reactive(res) // Lazy deep reactivity
    }

    return res
  }
}
```

**Let's trace a property read: `state.user.name`**

1. Reading `state.user` → GET trap fires
2. `track(target, 'get', 'user')` records this dependency
3. `user` is an object → `reactive(res)` wraps it lazily
4. Reading `.name` on the returned reactive → GET trap fires again
5. `track(userObj, 'get', 'name')` records this dependency too

**Lazy deep reactivity**: Vue doesn't recursively proxy the entire object tree upfront. It wraps nested objects only when they're accessed. This is a key performance optimization.

---

## The Mutable Handler (SET trap)

```ts
// packages/reactivity/src/baseHandlers.ts

class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow = false) {
    super(false, isShallow)
  }

  set(
    target: Record<string | symbol, unknown>,
    key: string | symbol,
    value: unknown,
    receiver: object,
  ): boolean {
    let oldValue = target[key]

    if (!this._isShallow) {
      const isOldValueReadonly = isReadonly(oldValue)
      if (!isShallow(value) && !isReadonly(value)) {
        oldValue = toRaw(oldValue)
        value = toRaw(value)
      }
    }

    const hadKey =
      isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwn(target, key)

    const result = Reflect.set(
      target,
      key,
      value,
      isRef(target) ? target : receiver,
    )

    // Only trigger if the target is the actual receiver (not prototype)
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }
}
```

**The SET trap distinguishes between ADD and SET:**

- New property? → `TriggerOpTypes.ADD` (might affect iteration)
- Changed property? → `TriggerOpTypes.SET` (only affects that key's watchers)
- Same value? → No trigger (optimization via `hasChanged`)

---

## DELETE and HAS Traps

```ts
// packages/reactivity/src/baseHandlers.ts

deleteProperty(
  target: Record<string | symbol, unknown>,
  key: string | symbol,
): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = target[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

has(target: Record<string | symbol, unknown>, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  if (!isSymbol(key) || !builtInSymbols.has(key)) {
    track(target, TrackOpTypes.HAS, key)
  }
  return result
}

ownKeys(target: Record<string | symbol, unknown>): (string | symbol)[] {
  track(
    target,
    TrackOpTypes.ITERATE,
    isArray(target) ? 'length' : ITERATE_KEY,
  )
  return Reflect.ownKeys(target)
}
```

**Every object operation is intercepted:**

- `delete obj.key` → `deleteProperty` trap → triggers dependents
- `'key' in obj` → `has` trap → tracks as dependency
- `Object.keys(obj)` → `ownKeys` trap → tracks iteration dependency

---

## Why Reflect?

Every trap uses `Reflect` for the default behavior:

```ts
const res = Reflect.get(target, key, receiver)
Reflect.set(target, key, value, receiver)
Reflect.deleteProperty(target, key)
Reflect.has(target, key)
Reflect.ownKeys(target)
```

`Reflect` methods mirror every Proxy trap. They perform the default operation. Why not just do `target[key]`?

```js
// Problem with target[key]:
const parent = {
  get name() {
    return this.firstName
  },
}
const child = { firstName: 'Vue' }
Object.setPrototypeOf(child, parent)

const proxy = new Proxy(child, {
  get(target, key) {
    track(target, key)
    return target[key] // WRONG: this === child, not proxy
  },
})

// With Reflect.get(target, key, receiver):
// receiver = proxy, so this === proxy inside getters
// This matters for prototype chain inheritance!
```

The `receiver` parameter ensures `this` is correct when getters are involved.

---

## All Proxy Traps

| Trap                       | Triggered By                        | Vue Uses?                 |
| -------------------------- | ----------------------------------- | ------------------------- |
| `get`                      | Property read                       | Yes — dependency tracking |
| `set`                      | Property write                      | Yes — trigger updates     |
| `deleteProperty`           | `delete obj.key`                    | Yes — trigger updates     |
| `has`                      | `key in obj`                        | Yes — dependency tracking |
| `ownKeys`                  | `Object.keys()`, `for...in`         | Yes — iteration tracking  |
| `apply`                    | Function call                       | No                        |
| `construct`                | `new` operator                      | No                        |
| `getPrototypeOf`           | `Object.getPrototypeOf()`           | No                        |
| `setPrototypeOf`           | `Object.setPrototypeOf()`           | No                        |
| `isExtensible`             | `Object.isExtensible()`             | No                        |
| `preventExtensions`        | `Object.preventExtensions()`        | No                        |
| `getOwnPropertyDescriptor` | `Object.getOwnPropertyDescriptor()` | No                        |
| `defineProperty`           | `Object.defineProperty()`           | No                        |

---

## Collection Handlers (Map & Set)

Maps and Sets can't be proxied with normal `get`/`set` traps because their data isn't stored as properties. Vue intercepts their methods instead:

```ts
// packages/reactivity/src/collectionHandlers.ts (conceptual)

function get(target, key, receiver) {
  // When user calls map.get(key):
  // 1. Track the specific key
  track(rawTarget, TrackOpTypes.GET, key)
  // 2. Call the original Map.prototype.get
  return target.get(key)
}

function set(target, key, value) {
  // When user calls map.set(key, value):
  // 1. Perform the set
  target.set(key, value)
  // 2. Trigger dependents
  trigger(rawTarget, hadKey ? TriggerOpTypes.SET : TriggerOpTypes.ADD, key)
}
```

---

## Exercises

1. **Create a simple reactive proxy**:

   ```js
   function reactive(target) {
     return new Proxy(target, {
       get(target, key, receiver) {
         console.log(`GET ${key}`)
         return Reflect.get(target, key, receiver)
       },
       set(target, key, value, receiver) {
         console.log(`SET ${key} = ${value}`)
         return Reflect.set(target, key, value, receiver)
       },
     })
   }
   ```

2. **Why `Reflect.get` over `target[key]`?** Create a test case with prototype inheritance and getters to demonstrate the difference.

3. **Trace a reactive operation**: When you write `delete reactiveObj.name`, list every function that gets called in sequence.

4. **Read `collectionHandlers.ts`**: How does Vue handle `map.forEach()`? Does it track dependencies for each entry?

---

## Key Takeaways

1. Proxy intercepts ALL object operations — the foundation of Vue 3's reactivity
2. Reflect performs the default operation — always use it in proxy traps
3. The `receiver` parameter ensures correct `this` in prototype chains
4. Vue creates proxies lazily (only wraps nested objects when accessed)
5. ADD vs SET vs DELETE triggers are different for optimal update tracking
6. Collections (Map/Set) need special proxy handlers that intercept methods

**Next**: [12 — Sets, Maps & WeakMap](./12-sets-maps-weakmap)
