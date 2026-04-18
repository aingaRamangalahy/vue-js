# Learning JavaScript & TypeScript Through the Vue.js Core Source Code

Welcome! This learning series teaches JavaScript and TypeScript concepts from beginner to expert level, using **real code examples from the Vue.js core repository** you're working in.

## Why Learn From Vue.js Source Code?

Vue.js core is one of the best-written JavaScript/TypeScript codebases in the open-source world. It demonstrates:

- Clean, idiomatic JavaScript patterns
- Advanced TypeScript usage
- Performance-critical code optimization
- Compiler design and AST manipulation
- Reactive programming patterns

## Learning Path

### Beginner (Foundations)

| #   | Topic                                                      | File                             | What You'll Learn                                |
| --- | ---------------------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| 01  | [Variables & Types](./01-variables-and-types)           | `packages/shared/src/general.ts` | `const`, `let`, `typeof`, type checking          |
| 02  | [Functions](./02-functions)                             | `packages/shared/src/general.ts` | Arrow functions, higher-order functions, caching |
| 03  | [Objects & Prototypes](./03-objects-and-prototypes)     | `packages/shared/src/general.ts` | Object.create, defineProperty, prototypes        |
| 04  | [Arrays & Iteration](./04-arrays-and-iteration)         | `packages/runtime-core/src/`     | Array methods, for loops, iteration patterns     |
| 05  | [Destructuring & Spread](./05-destructuring-and-spread) | Throughout codebase              | Destructuring, spread, rest parameters           |

### Intermediate (Language Mastery)

| #   | Topic                                                | File                                     | What You'll Learn                        |
| --- | ---------------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| 06  | [Closures & Scope](./06-closures-and-scope)       | `packages/reactivity/src/effect.ts`      | Closures, lexical scope, module patterns |
| 07  | [Classes](./07-classes)                           | `packages/reactivity/src/`               | ES6 classes, inheritance, private fields |
| 08  | [Modules](./08-modules)                           | `packages/*/src/index.ts`                | ES modules, re-exports, barrel files     |
| 09  | [Promises & Async](./09-promises-and-async)       | `packages/runtime-core/src/scheduler.ts` | Promises, microtasks, nextTick           |
| 10  | [Symbols & Iterators](./10-symbols-and-iterators) | `packages/runtime-core/src/vnode.ts`     | Symbols, iterators, generators           |

### Advanced (Deep JavaScript)

| #   | Topic                                             | File                                         | What You'll Learn                              |
| --- | ------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| 11  | [Proxy & Reflect](./11-proxy-and-reflect)      | `packages/reactivity/src/baseHandlers.ts`    | Proxy traps, Reflect API, meta-programming     |
| 12  | [Sets, Maps & WeakMap](./12-sets-maps-weakmap) | `packages/reactivity/src/`                   | Map, Set, WeakMap, WeakSet, memory management  |
| 13  | [Bitwise Operations](./13-bitwise-operations)  | `packages/shared/src/shapeFlags.ts`          | Bit flags, bitwise AND/OR, efficient enums     |
| 14  | [Error Handling](./14-error-handling)          | `packages/runtime-core/src/errorHandling.ts` | try/catch, error propagation, error boundaries |
| 15  | [Regular Expressions](./15-regex)              | `packages/compiler-core/src/`                | RegExp patterns, parsing, string matching      |

### Expert (Vue.js Contributor Level)

| #   | Topic                                                  | File                               | What You'll Learn                         |
| --- | ------------------------------------------------------ | ---------------------------------- | ----------------------------------------- |
| 16  | [TypeScript Essentials](./16-typescript-essentials) | `packages/shared/src/typeUtils.ts` | Generics, conditional types, type guards  |
| 17  | [Design Patterns](./17-design-patterns)             | Throughout codebase                | Observer, Factory, Visitor, Strategy      |
| 18  | [Compiler & AST](./18-compiler-and-ast)             | `packages/compiler-core/src/`      | AST nodes, transforms, code generation    |
| 19  | [Reactivity Deep Dive](./19-reactivity-deep-dive)   | `packages/reactivity/src/`         | Dependency tracking, scheduling, batching |
| 20  | [Performance Patterns](./20-performance-patterns)   | Throughout codebase                | Tree-shaking, caching, linked lists       |

## Repository Structure Overview

```
packages/
├── shared/           # Shared utilities used everywhere
├── reactivity/       # The reactivity system (ref, reactive, computed, effect)
├── compiler-core/    # Platform-agnostic template compiler
├── compiler-dom/     # DOM-specific compiler transforms
├── compiler-sfc/     # Single File Component (.vue) compiler
├── compiler-ssr/     # SSR-specific compiler transforms
├── runtime-core/     # Platform-agnostic runtime (vnode, components, scheduler)
├── runtime-dom/      # DOM-specific runtime (events, attributes, DOM ops)
├── runtime-test/     # Lightweight runtime for testing
├── server-renderer/  # Server-side rendering
├── vue/              # Main entry point (bundles everything)
└── vue-compat/       # Vue 2 compatibility layer
```

## How to Use This Guide

1. **Read in order** if you're a beginner — each lesson builds on the previous
2. **Jump to any topic** if you already know the basics
3. **Open the referenced files** in your editor to explore the full context
4. **Run the tests** to see concepts in action: `pnpm test <package-name>`
5. **Modify code and test** — that's the best way to learn!

## Prerequisites

- Basic understanding of HTML and how web pages work
- A code editor (you're already in VS Code!)
- Node.js and pnpm installed (for running tests)
