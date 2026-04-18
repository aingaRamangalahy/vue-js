# 17 — Design Patterns

> **Difficulty**: Expert  
> **Key files**: `packages/reactivity/src/effect.ts`, `packages/runtime-core/src/vnode.ts`, `packages/compiler-core/src/transform.ts`

## What You'll Learn

- Design patterns used throughout Vue.js core
- Observer pattern (reactivity system)
- Factory pattern (VNode creation)
- Visitor pattern (compiler transforms)
- Strategy pattern (platform-specific handlers)
- Composite pattern (component tree)

---

## 1. Observer Pattern (Pub/Sub)

The **Observer pattern** establishes a one-to-many dependency: when one object changes, all dependents are notified.

Vue's entire reactivity system IS the Observer pattern.

```
┌─────────────┐       subscribes to       ┌─────────────┐
│   Effect     │ ◄───────────────────────► │     Dep      │
│ (Subscriber) │                           │ (Publisher)  │
│              │   notifies on change      │              │
└─────────────┘                            └─────────────┘
```

### Publisher: Dep

```ts
// packages/reactivity/src/dep.ts

export class Dep {
  version = 0
  activeLink?: Link = undefined
  subs?: Link = undefined // Linked list of subscribers

  track(): Link | undefined {
    if (!activeSub) return // No active effect? Nothing to track
    // Add activeSub as a subscriber
    let link = this.activeLink
    if (!link || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this)
      // ... insert into subscriber list
    }
    return link
  }

  trigger(): void {
    this.version++ // Increment version
    globalVersion++
    this.notify() // Notify all subscribers
  }

  notify(): void {
    startBatch()
    try {
      for (let link = this.subs; link; link = link.prevSub) {
        link.sub.notify() // Tell each subscriber to re-run
      }
    } finally {
      endBatch()
    }
  }
}
```

### Subscriber: ReactiveEffect

```ts
// packages/reactivity/src/effect.ts

export class ReactiveEffect<T = any> implements Subscriber {
  deps?: Link = undefined
  depsTail?: Link = undefined
  flags: EffectFlags = EffectFlags.ACTIVE | EffectFlags.TRACKING

  notify(): void {
    if (
      this.flags & EffectFlags.RUNNING &&
      !(this.flags & EffectFlags.ALLOW_RECURSE)
    ) {
      return // Prevent infinite recursion
    }
    if (!(this.flags & EffectFlags.NOTIFIED)) {
      batch(this) // Queue for re-execution
    }
  }
}
```

### The Connector: Link

```ts
// packages/reactivity/src/dep.ts

export class Link {
  nextDep?: Link // Next dep for this subscriber
  prevDep?: Link // Prev dep for this subscriber
  nextSub?: Link // Next subscriber for this dep
  prevSub?: Link // Prev subscriber for this dep

  constructor(
    public sub: Subscriber,
    public dep: Dep,
  ) {}
}
```

The `Link` forms a **doubly-linked list bridge** between Deps and Subscribers:

- Each Dep has a linked list of subscriber Links
- Each Subscriber has a linked list of dependency Links
- Links can be efficiently added and removed (O(1))

This is more memory-efficient than Map/Set-based approaches used in Vue 2.

---

## 2. Factory Pattern

The **Factory pattern** creates objects without specifying their exact class.

### VNode Factory: `createVNode`

```ts
// packages/runtime-core/src/vnode.ts (simplified)

export function createVNode(
  type: VNodeTypes,
  props?: VNodeProps | null,
  children?: unknown,
): VNode {
  // Normalize the type
  if (isString(type)) {
    // HTML element: 'div', 'span', etc.
  } else if (type === Fragment) {
    // Fragment: multiple children without wrapper
  }

  // Create the VNode object
  const vnode: VNode = {
    type,
    props,
    children,
    el: null,
    key: props?.key ?? null,
    shapeFlag: isString(type)
      ? ShapeFlags.ELEMENT
      : isObject(type)
        ? ShapeFlags.STATEFUL_COMPONENT
        : isFunction(type)
          ? ShapeFlags.FUNCTIONAL_COMPONENT
          : 0,
    // ... many more properties
  }

  return vnode
}
```

The factory handles all the complexity of:

- Determining the VNode type (element, component, fragment)
- Setting appropriate shape flags
- Normalizing children
- Handling special cases (teleport, suspense)

Callers just say `createVNode('div', { class: 'box' }, children)`.

---

## 3. Visitor Pattern (Compiler Transforms)

The **Visitor pattern** separates an algorithm from the object structure it operates on. Vue's compiler uses this for AST transformations.

### The Visitable: AST Nodes

```ts
// packages/compiler-core/src/ast.ts

export enum NodeTypes {
  ROOT,
  ELEMENT,
  TEXT,
  COMMENT,
  SIMPLE_EXPRESSION,
  INTERPOLATION,
  ATTRIBUTE,
  DIRECTIVE,
  IF,
  FOR,
  // ... many more
}

export interface ElementNode extends Node {
  type: NodeTypes.ELEMENT
  tag: string
  props: Array<AttributeNode | DirectiveNode>
  children: TemplateChildNode[]
}
```

### The Visitors: NodeTransform

```ts
// packages/compiler-core/src/transform.ts

export type NodeTransform = (
  node: RootNode | TemplateChildNode,
  context: TransformContext,
) => void | (() => void) | (() => void)[]
```

Each transform is a function that "visits" a node and optionally returns a cleanup/exit function.

### The Traversal

```ts
// packages/compiler-core/src/transform.ts (simplified)

function traverseNode(node, context) {
  context.currentNode = node

  // Apply all transforms (enter phase)
  const exitFns = []
  for (const transform of context.nodeTransforms) {
    const onExit = transform(node, context)
    if (onExit) exitFns.push(onExit)
  }

  // Traverse children
  switch (node.type) {
    case NodeTypes.ELEMENT:
    case NodeTypes.ROOT:
      traverseChildren(node, context)
      break
  }

  // Apply exit functions (reverse order)
  for (let i = exitFns.length - 1; i >= 0; i--) {
    exitFns[i]()
  }
}
```

**The enter/exit pattern is key:**

1. **Enter**: Transform runs, may return an exit function
2. **Traverse children**: Recursively visit children
3. **Exit**: Exit functions run in reverse order

This allows transforms to make changes after children have been processed.

### Directive Transforms

```ts
export type DirectiveTransform = (
  dir: DirectiveNode,
  node: ElementNode,
  context: TransformContext,
  augmentor?: (ret: DirectiveTransformResult) => DirectiveTransformResult,
) => DirectiveTransformResult

export interface DirectiveTransformResult {
  props: Property[]
  needRuntime?: boolean | symbol
}
```

Directive transforms handle specific directives (`v-if`, `v-for`, `v-on`, `v-bind`). Each directive has its own transform function — a clean separation of concerns.

---

## 4. Strategy Pattern

The **Strategy pattern** defines a family of algorithms and makes them interchangeable.

### Platform-Specific Handlers

Vue uses different proxy handlers for different object types:

```ts
// packages/reactivity/src/reactive.ts

function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>, // Strategy for plain objects
  collectionHandlers: ProxyHandler<any>, // Strategy for Map/Set
  proxyMap: WeakMap<Target, any>,
) {
  const targetType = getTargetType(target)
  const proxy = new Proxy(
    target,
    targetType === TargetType.COLLECTION
      ? collectionHandlers // Use Map/Set strategy
      : baseHandlers, // Use Object/Array strategy
  )
  return proxy
}
```

The four strategies created:

```ts
// packages/reactivity/src/baseHandlers.ts

export const mutableHandlers: ProxyHandler<object> =
  new MutableReactiveHandler()
export const readonlyHandlers: ProxyHandler<object> =
  new ReadonlyReactiveHandler()
export const shallowReactiveHandlers = new MutableReactiveHandler(true)
export const shallowReadonlyHandlers = new ReadonlyReactiveHandler(true)
```

Each handler strategy has different behavior for property reads and writes, but they're all interchangeable through the common `ProxyHandler` interface.

---

## 5. Composite Pattern (Component Tree)

The **Composite pattern** composes objects into tree structures. Vue's component tree IS a composite:

```ts
// packages/runtime-core/src/component.ts (simplified)

export interface ComponentInternalInstance {
  parent: ComponentInternalInstance | null // Parent in the tree
  root: ComponentInternalInstance // Root of the tree
  appContext: AppContext
  vnode: VNode // The VNode this component represents
  subTree: VNode // The rendered VNode tree
  // ...
}
```

Each component knows its parent, enabling patterns like:

- Error propagation (walking up to find error handlers)
- Provide/inject (walking up to find providers)
- Event handling (emitting to parent)

---

## 6. Scheduler Pattern (Job Queue)

```ts
// packages/runtime-core/src/scheduler.ts

export interface SchedulerJob extends Function {
  id?: number // Priority ordering
  pre?: boolean // Pre-flush or post-flush?
  active?: boolean // Is the job still active?
  flags?: SchedulerJobFlags
  allowRecurse?: boolean
}

const queue: SchedulerJob[] = []

export function queueJob(job: SchedulerJob): void {
  if (!queue.includes(job, flushIndex + 1)) {
    if (job.id == null) {
      queue.push(job)
    } else {
      queue.splice(findInsertionIndex(job.id), 0, job)
    }
    queueFlush()
  }
}
```

This is a **priority queue** pattern:

- Jobs are inserted by priority (`id`)
- Duplicate jobs are deduplicated
- The queue is flushed asynchronously (microtask)

---

## Pattern Summary

| Pattern         | Where in Vue          | Purpose                              |
| --------------- | --------------------- | ------------------------------------ |
| **Observer**    | Dep/Effect/Link       | Reactive dependency tracking         |
| **Factory**     | createVNode           | VNode creation with normalization    |
| **Visitor**     | Compiler transforms   | AST manipulation                     |
| **Strategy**    | Proxy handlers        | Platform-specific behavior           |
| **Composite**   | Component tree        | Parent-child relationships           |
| **Scheduler**   | Job queue             | Batched async updates                |
| **Decorator**   | callWithErrorHandling | Wrapping with cross-cutting concerns |
| **Memoization** | cacheStringFunction   | Caching expensive computations       |

---

## Exercises

1. **Identify the Observer pattern** in the reactivity code: Draw the relationship between `Dep`, `Link`, and `ReactiveEffect`.

2. **Track a compiler transform**: When a `div` with `v-if="show"` is compiled, which transforms visit the element? In what order?

3. **Compare strategies**: What's different about `MutableReactiveHandler` vs `ReadonlyReactiveHandler`? Check the `set` trap.

4. **Implement a simple Pub/Sub**:
   ```js
   class EventEmitter {
     constructor() {
       this.listeners = new Map()
     }
     on(event, fn) {
       /* ... */
     }
     emit(event, ...args) {
       /* ... */
     }
     off(event, fn) {
       /* ... */
     }
   }
   ```

---

## Key Takeaways

1. Vue's reactivity is the Observer pattern with a doubly-linked list optimization
2. The compiler uses the Visitor pattern — transforms are decoupled from the AST
3. Strategy pattern enables different behaviors for objects vs collections
4. Composite pattern enables tree-walking for errors, provide/inject, etc.
5. The Scheduler implements a priority-based job queue with deduplication
6. Design patterns in Vue aren't academic — they solve real architectural problems

**Next**: [18 — Compiler & AST](./18-compiler-and-ast)
