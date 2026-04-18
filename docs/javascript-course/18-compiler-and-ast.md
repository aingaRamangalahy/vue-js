# 18 — Compiler & AST

> **Difficulty**: Expert  
> **Key files**: `packages/compiler-core/src/ast.ts`, `packages/compiler-core/src/transform.ts`, `packages/compiler-core/src/codegen.ts`

## What You'll Learn

- What an AST (Abstract Syntax Tree) is
- How Vue's template compiler works (parse → transform → codegen)
- AST node types and their structure
- How transforms modify the AST
- How code generation produces JavaScript

---

## The Compiler Pipeline

Vue's template compiler converts HTML-like templates into JavaScript render functions:

```text
Template String → Parse → AST → Transform → AST' → CodeGen → JavaScript
```

```text
<div class="box">
  {{ message }}
</div>
```

Becomes:

```js
function render(_ctx) {
  return createVNode('div', { class: 'box' }, toDisplayString(_ctx.message))
}
```

---

## Phase 1: The AST (Abstract Syntax Tree)

An AST represents source code as a tree of nodes. Each node has a type and properties.

### Node Types

```ts
// packages/compiler-core/src/ast.ts

export enum NodeTypes {
  ROOT, // The root of the template
  ELEMENT, // <div>, <MyComponent>
  TEXT, // Plain text
  COMMENT, // <!-- comment -->
  SIMPLE_EXPRESSION, // foo, foo.bar
  INTERPOLATION, // {{ expression }}
  ATTRIBUTE, // class="box"
  DIRECTIVE, // v-if, v-for, @click, :prop

  // Generated during transform:
  COMPOUND_EXPRESSION, // Concatenated expressions
  IF, // v-if/v-else-if/v-else group
  IF_BRANCH, // Single branch of v-if
  FOR, // v-for node
  TEXT_CALL, // createTextVNode() call
  VNODE_CALL, // createVNode() call

  // Code generation nodes:
  JS_CALL_EXPRESSION, // fn(args)
  JS_OBJECT_EXPRESSION, // { key: value }
  JS_PROPERTY, // key: value
  JS_ARRAY_EXPRESSION, // [items]
  JS_FUNCTION_EXPRESSION, // (args) => body
  JS_CONDITIONAL_EXPRESSION, // a ? b : c
  JS_CACHE_EXPRESSION, // _cache[n]
}
```

### Core Node Interfaces

```ts
// packages/compiler-core/src/ast.ts

export interface Node {
  type: NodeTypes
  loc: SourceLocation // Where in the source this node comes from
}

export interface SourceLocation {
  start: Position
  end: Position
  source: string // The raw source text
}

export interface Position {
  offset: number // Byte offset in the source
  line: number // Line number (1-indexed)
  column: number // Column number (1-indexed)
}
```

Every node knows its source location. This enables:

- Accurate error messages ("Error on line 42, column 10")
- Source maps for debugging
- Dev tools integration

### The Root Node

```ts
export interface RootNode extends Node {
  type: NodeTypes.ROOT
  source: string // Full template source
  children: TemplateChildNode[] // Top-level children
  helpers: Set<symbol> // Runtime helpers needed
  components: string[] // Component names used
  directives: string[] // Custom directives used
  hoists: (JSChildNode | null)[] // Static nodes to hoist
  imports: ImportItem[] // Imports needed
  cached: (CacheExpression | null)[] // Cached expressions
  temps: number // Temp variable count
  codegenNode?: TemplateChildNode | JSChildNode // Code gen entry point
}
```

The RootNode is the entry point. It tracks everything the codegen phase needs:

- What helper functions are needed (`createVNode`, `toDisplayString`, etc.)
- What components and directives are used
- What static content can be hoisted out of render functions

---

## Phase 2: Transforms

Transforms modify the AST to prepare it for code generation.

### Transform Types

```ts
// packages/compiler-core/src/transform.ts

// General node transform — can handle any node
export type NodeTransform = (
  node: RootNode | TemplateChildNode,
  context: TransformContext,
) => void | (() => void) | (() => void)[]

// Directive-specific transform
export type DirectiveTransform = (
  dir: DirectiveNode,
  node: ElementNode,
  context: TransformContext,
) => DirectiveTransformResult

// Structural directive transform (v-if, v-for)
export type StructuralDirectiveTransform = (
  node: ElementNode,
  dir: DirectiveNode,
  context: TransformContext,
) => void | (() => void)
```

### The Transform Context

```ts
export interface TransformContext {
  // State
  root: RootNode
  parent: ParentNode | null
  currentNode: RootNode | TemplateChildNode | null
  childIndex: number

  // Scope tracking
  scopes: {
    vFor: number // Nesting depth of v-for
    vSlot: number // Nesting depth of v-slot
    vPre: number // Nesting depth of v-pre
    vOnce: number // Nesting depth of v-once
  }

  // Methods
  helper<T extends symbol>(name: T): T // Register a runtime helper
  removeHelper<T extends symbol>(name: T): void
  replaceNode(node: TemplateChildNode): void
  removeNode(node?: TemplateChildNode): void
  hoist(exp: JSChildNode): SimpleExpressionNode
  cache(exp: JSChildNode): CacheExpression
}
```

The context provides transforms with everything they need:

- Access to the current position in the tree
- Methods to modify the tree (replace nodes, remove nodes)
- Scope information (are we inside a v-for? a v-slot?)
- Helper registration (tell codegen what runtime functions are needed)

### How Traversal Works

```
traverseNode(rootNode, context)
  ├── Apply nodeTransforms (enter phase)
  │   ├── transformElement entered
  │   ├── transformText entered
  │   └── ... collect exit functions
  │
  ├── Traverse children recursively
  │   ├── traverseNode(child1, context)
  │   ├── traverseNode(child2, context)
  │   └── ...
  │
  └── Apply exit functions (reverse order)
      ├── transformText exited
      └── transformElement exited
```

**Enter phase**: Set up, gather information  
**Exit phase**: Generate final code gen nodes (children are already processed)

---

## Phase 3: Code Generation

The codegen phase walks the transformed AST and produces JavaScript source code.

### Key Concepts

The AST is transformed into "code generation nodes" that map directly to JavaScript constructs:

```
AST Node (ELEMENT)          →  JS_CALL_EXPRESSION (createVNode/createBlock)
AST Node (INTERPOLATION)    →  JS_CALL_EXPRESSION (toDisplayString)
AST Node (IF)               →  JS_CONDITIONAL_EXPRESSION (ternary)
AST Node (FOR)              →  JS_CALL_EXPRESSION (renderList)
```

### Static Hoisting

One of the most important optimizations:

```text
<div>
  <p>This is static</p>
  <p>{{ dynamic }}</p>
</div>
```

The compiler detects that the first `<p>` never changes and **hoists** it:

```js
const _hoisted_1 = createVNode('p', null, 'This is static')

function render(_ctx) {
  return createVNode('div', null, [
    _hoisted_1, // Reused across renders!
    createVNode('p', null, toDisplayString(_ctx.dynamic)),
  ])
}
```

The static VNode is created once and reused forever.

---

## Putting It All Together: A Complete Example

**Input template:**

```text
<div id="app">
  <p v-if="show">Hello {{ name }}</p>
  <p v-else>Goodbye</p>
</div>
```

**After parsing (AST):**

```text
ROOT
└── ELEMENT (div, id="app")
    ├── ELEMENT (p, v-if="show")
    │   ├── TEXT "Hello "
    │   └── INTERPOLATION {{ name }}
    └── ELEMENT (p, v-else)
        └── TEXT "Goodbye"
```

**After transform (modified AST):**

```text
ROOT
└── VNODE_CALL (createVNode, "div", { id: "app" })
    └── IF_NODE
        ├── IF_BRANCH (show === true)
        │   └── VNODE_CALL (createVNode, "p")
        │       └── COMPOUND_EXPRESSION ["Hello ", toDisplayString(name)]
        └── IF_BRANCH (else)
            └── VNODE_CALL (createVNode, "p")
                └── TEXT "Goodbye"
```

**Generated JavaScript:**

```js
function render(_ctx, _cache) {
  return (
    openBlock(),
    createBlock('div', { id: 'app' }, [
      _ctx.show
        ? (openBlock(),
          createBlock('p', { key: 0 }, 'Hello ' + toDisplayString(_ctx.name)))
        : (openBlock(), createBlock('p', { key: 1 }, 'Goodbye')),
    ])
  )
}
```

---

## Exercises

1. **Use the template explorer**: Open `packages-private/template-explorer/` and inspect what templates compile to

2. **Read the AST types**: In `packages/compiler-core/src/ast.ts`, how many different node types are there? Group them by category (template nodes, JS nodes, etc.)

3. **Trace a v-for transform**: When a list item combines `v-for`, `:key`, and text interpolation in its children, what AST transformations happen? Sketch the nodes before and after transform.

4. **Find PatchFlags in codegen**: Search for `PatchFlags` usage in the compiler. How does the compiler determine which flags to set?

---

## Key Takeaways

1. The compiler is a 3-phase pipeline: Parse → Transform → CodeGen
2. AST nodes have source locations for error reporting and debugging
3. Transforms use enter/exit phases — exit runs after children are processed
4. The TransformContext provides tree mutation methods and scope tracking
5. Static hoisting moves unchanging nodes outside the render function
6. PatchFlags tell the runtime exactly what can change — enabling fast diffing

**Next**: [19 — Reactivity Deep Dive](./19-reactivity-deep-dive)
