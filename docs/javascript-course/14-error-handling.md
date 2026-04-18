# 14 — Error Handling

> **Difficulty**: Intermediate → Advanced  
> **Key files**: `packages/runtime-core/src/errorHandling.ts`

## What You'll Learn

- `try`/`catch`/`finally` fundamentals
- How Vue creates a unified error handling system
- Error propagation up the component tree
- Handling sync vs async errors
- Custom error boundaries

---

## try/catch/finally Basics

```js
try {
  // Code that might throw
  riskyOperation()
} catch (err) {
  // Handle the error
  console.error(err)
} finally {
  // Always runs, whether error occurred or not
  cleanup()
}
```

**`finally` is crucial** — Vue uses it to restore state even when errors occur:

```ts
// packages/reactivity/src/effect.ts

run(): T {
  this.flags |= EffectFlags.RUNNING
  activeSub = this

  try {
    return this.fn()           // User code might throw
  } finally {
    activeSub = prevEffect     // ALWAYS restore, even on error
    this.flags &= ~EffectFlags.RUNNING
  }
}
```

---

## Vue's Error Handling System

Vue has a sophisticated error handling system that catches errors from component lifecycle and routes them through user-defined handlers.

### Error Categories

```ts
// packages/runtime-core/src/errorHandling.ts

export enum ErrorCodes {
  SETUP_FUNCTION,
  RENDER_FUNCTION,
  NATIVE_EVENT_HANDLER = 5,
  COMPONENT_EVENT_HANDLER,
  VNODE_HOOK,
  DIRECTIVE_HOOK,
  TRANSITION_HOOK,
  APP_ERROR_HANDLER,
  APP_WARN_HANDLER,
  FUNCTION_REF,
  ASYNC_COMPONENT_LOADER,
  SCHEDULER,
  COMPONENT_UPDATE,
  APP_UNMOUNT_CLEANUP,
}
```

Every error in Vue is tagged with a category. This helps identify WHERE the error came from.

### Synchronous Error Wrapper

```ts
// packages/runtime-core/src/errorHandling.ts

export function callWithErrorHandling(
  fn: Function,
  instance: ComponentInternalInstance | null | undefined,
  type: ErrorTypes,
  args?: unknown[],
): any {
  try {
    return args ? fn(...args) : fn()
  } catch (err) {
    handleError(err, instance, type)
  }
}
```

**Simple but powerful**: Wraps any function call in try/catch and routes errors to the handler. Vue uses this for:

- Component render functions
- Lifecycle hooks
- Event handlers
- Directive hooks

### Async Error Wrapper

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

**Key insight**: This function:

1. Catches synchronous errors via `try/catch` (through `callWithErrorHandling`)
2. Catches **async** errors by attaching `.catch()` to the returned Promise
3. Handles arrays of functions (for lifecycle hooks — a component can have multiple `onMounted` callbacks)

---

## Error Propagation Up the Component Tree

```ts
// packages/runtime-core/src/errorHandling.ts

export function handleError(
  err: unknown,
  instance: ComponentInternalInstance | null | undefined,
  type: ErrorTypes,
  throwInDev = true,
): void {
  const contextVNode = instance ? instance.vnode : null
  const { errorHandler, throwUnhandledErrorInProduction } =
    (instance && instance.appContext.config) || EMPTY_OBJ

  if (instance) {
    let cur = instance.parent
    const exposedInstance = instance.proxy
    const errorInfo = __DEV__
      ? ErrorTypeStrings[type]
      : `https://vuejs.org/error-reference/#runtime-${type}`

    // Walk up the component tree
    while (cur) {
      const errorCapturedHooks = cur.ec // onErrorCaptured hooks
      if (errorCapturedHooks) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          // If hook returns false, stop propagation
          if (
            errorCapturedHooks[i](err, exposedInstance, errorInfo) === false
          ) {
            return
          }
        }
      }
      cur = cur.parent // Move to parent component
    }
  }

  // If no component caught it, try the app-level error handler
  if (errorHandler) {
    callWithErrorHandling(errorHandler, null, ErrorCodes.APP_ERROR_HANDLER, [
      err,
      exposedInstance,
      errorInfo,
    ])
    return
  }

  // Last resort: log to console
  logError(err, type, contextVNode, throwInDev)
}
```

**The error propagation chain:**

```
Component D throws error
  → Component C's onErrorCaptured (can return false to stop)
  → Component B's onErrorCaptured
  → Component A's onErrorCaptured
  → App-level errorHandler
  → console.error (last resort)
```

This is similar to DOM event bubbling, but for errors.

---

## Error Info in Dev vs Production

```ts
const errorInfo = __DEV__
  ? ErrorTypeStrings[type]
  : `https://vuejs.org/error-reference/#runtime-${type}`
```

In development, you get a human-readable string like `"setup function"`. In production, you get a short URL to reduce bundle size.

---

## Safe Error Handler Execution

```ts
if (errorHandler) {
  callWithErrorHandling(errorHandler, null, ErrorCodes.APP_ERROR_HANDLER, [
    err,
    exposedInstance,
    errorInfo,
  ])
  return
}
```

Notice: the error handler itself is called with `callWithErrorHandling`! This means if YOUR error handler throws, that error is also caught and logged — preventing infinite error loops.

---

## Pattern: Error Handling Decorator

Vue's approach is effectively a decorator pattern — wrapping functions with error handling:

```ts
// Before (no error handling)
component.render()

// After (with error handling)
callWithErrorHandling(component.render, instance, ErrorCodes.RENDER_FUNCTION)
```

The actual function doesn't need to know about error handling. The wrapper takes care of it.

---

## Exercises

1. **Implement a simplified error handler**:

   ```js
   function callSafe(fn, errorHandler) {
     try {
       const result = fn()
       if (result instanceof Promise) {
         result.catch(err => errorHandler(err))
       }
       return result
     } catch (err) {
       errorHandler(err)
     }
   }
   ```

2. **Why does `finally` matter?** What would happen in `ReactiveEffect.run()` if `finally` wasn't used and the user's effect function throws?

3. **Trace error propagation**: Create a component tree in your mind (App → Parent → Child). If Child's setup function throws, what functions are called in what order?

4. **Search for `callWithErrorHandling`** in the codebase. List all the places Vue wraps calls with this function.

---

## Key Takeaways

1. `try/catch` handles synchronous errors; `.catch()` handles async errors
2. `finally` ensures cleanup regardless of success/failure — critical for state restoration
3. Vue propagates errors up the component tree like DOM events
4. Error handlers are themselves wrapped in error handling (prevents infinite loops)
5. Error codes categorize where errors originate
6. Dev mode provides readable errors; production provides URLs (smaller bundles)

**Next**: [15 — Regular Expressions](./15-regex)
