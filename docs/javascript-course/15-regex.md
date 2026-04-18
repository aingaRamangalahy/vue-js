# 15 — Regular Expressions

> **Difficulty**: Intermediate → Advanced  
> **Key files**: `packages/shared/src/general.ts`, `packages/shared/src/escapeHtml.ts`, `packages/compiler-core/src/utils.ts`

## What You'll Learn

- Regular expression syntax and patterns
- Common regex methods (`test`, `exec`, `match`, `replace`)
- How Vue uses regex for template parsing and string manipulation
- Performance considerations for regex vs alternatives

---

## Regex Basics

A regular expression (regex) is a pattern for matching text:

```js
const pattern = /hello/ // Literal syntax
const pattern = new RegExp('hello') // Constructor syntax
```

### Common Methods

| Method                            | Returns       | Description            |
| --------------------------------- | ------------- | ---------------------- |
| `regex.test(str)`                 | `boolean`     | Does the string match? |
| `regex.exec(str)`                 | `array\|null` | Match with details     |
| `str.match(regex)`                | `array\|null` | Find matches           |
| `str.replace(regex, replacement)` | `string`      | Replace matches        |
| `str.search(regex)`               | `number`      | Index of first match   |

---

## Regex in Vue: String Case Conversion

```ts
// packages/shared/src/general.ts

const camelizeRE = /-\w/g
export const camelize = cacheStringFunction((str: string): string => {
  return str.replace(camelizeRE, c => c.slice(1).toUpperCase())
})
```

**The regex**: `/-\w/g`

- `-` — literal hyphen
- `\w` — any word character (letter, digit, underscore)
- `g` — global flag (find ALL matches, not just first)

**What it does**: Finds every hyphen-followed-by-letter and replaces with the uppercase letter:

- `"my-component"` → matches `"-c"` → replaces with `"C"` → `"myComponent"`

```ts
const hyphenateRE = /\B([A-Z])/g
export const hyphenate = cacheStringFunction((str: string) =>
  str.replace(hyphenateRE, '-$1').toLowerCase(),
)
```

**The regex**: `/\B([A-Z])/g`

- `\B` — NOT a word boundary (prevents matching at start)
- `([A-Z])` — capture group: an uppercase letter
- `g` — global

`'$1'` in the replacement refers to the captured group. So `"myComponent"` → `"my-Component"` → `.toLowerCase()` → `"my-component"`.

---

## HTML Escaping

```ts
// packages/shared/src/escapeHtml.ts

const escapeRE = /["'&<>]/

export function escapeHtml(string: unknown): string {
  const str = '' + string
  const match = escapeRE.exec(str)

  if (!match) {
    return str // No dangerous characters found
  }

  let html = ''
  let escaped: string
  let index: number
  let lastIndex = 0
  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escaped = '&quot;'
        break
      case 38: // &
        escaped = '&amp;'
        break
      case 39: // '
        escaped = '&#39;'
        break
      case 60: // <
        escaped = '&lt;'
        break
      case 62: // >
        escaped = '&gt;'
        break
      default:
        continue
    }

    if (lastIndex !== index) {
      html += str.slice(lastIndex, index)
    }

    lastIndex = index + 1
    html += escaped
  }

  return lastIndex !== index ? html + str.slice(lastIndex, index) : html
}
```

**Pattern**: Uses regex only for the initial check (`exec`), then switches to `charCodeAt` for the actual processing. This is a performance optimization — `charCodeAt` is faster than regex for character-by-character processing.

```ts
const commentStripRE = /^-?>|<!--|-->|--!>|<!-$/g

export function escapeHtmlComment(src: string): string {
  return src.replace(commentStripRE, '')
}
```

**The regex**: `/^-?>|<!--|-->|--!>|<!-$/g`  
Uses `|` (alternation) to match multiple patterns:

- `^-?>` — starts with `->` or `>`
- `<!--` — opening comment
- `-->` — closing comment
- `--!>` — malformed closing comment
- `<!-$` — ends with `<!-`

This strips HTML comment markers from content.

---

## Performance: Regex vs charCodeAt

```ts
// packages/shared/src/general.ts

export const isOn = (key: string): boolean =>
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */ &&
  // make sure the 3rd character is uppercase
  (key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97)
```

**Why `charCodeAt` instead of regex?**

This could be written as:

```ts
const isOn = (key: string) => /^on[A-Z]/.test(key)
```

But `charCodeAt` is ~5x faster for simple patterns. Since `isOn` is called for every prop on every element, the difference adds up.

Character code reference:

- `111` = `'o'`
- `110` = `'n'`
- `97-122` = `'a'-'z'` (lowercase letters)
- So `> 122 || < 97` means "not lowercase" = uppercase or special

---

## Compiler Regex: Parsing Expressions

```ts
// packages/compiler-core/src/utils.ts

const nonIdentifierRE = /^$|^\d|[^\$\w\xA0-\uFFFF]/
export const isSimpleIdentifier = (name: string): boolean =>
  !nonIdentifierRE.test(name)
```

**The regex**: `/^$|^\d|[^\$\w\xA0-\uFFFF]/`

This checks if something is NOT a valid JavaScript identifier:

- `^$` — empty string
- `^\d` — starts with a digit
- `[^\$\w\xA0-\uFFFF]` — contains a non-identifier character

If none of these match, it's a valid identifier (like `foo`, `myVar`, `$data`).

```ts
export const validFirstIdentCharRE: RegExp = /[A-Za-z_$\xA0-\uFFFF]/
const validIdentCharRE = /[\.\?\w$\xA0-\uFFFF]/
const whitespaceRE = /\s+[.[]\s*|\s*[.[]\s+/g
```

These regex patterns help the compiler parse template expressions like `foo.bar[0]?.baz`.

---

## Regex Flags

| Flag | Meaning                                       | Example                    |
| ---- | --------------------------------------------- | -------------------------- |
| `g`  | Global — find ALL matches                     | `/a/g` matches every `a`   |
| `i`  | Case insensitive                              | `/hello/i` matches `HELLO` |
| `m`  | Multiline — `^` and `$` match line boundaries |                            |
| `s`  | Dotall — `.` matches newlines                 |                            |
| `u`  | Unicode — correct Unicode handling            |                            |

Vue mostly uses `g` (global) for `replace` operations.

---

## Regex Patterns Cheat Sheet (with Vue examples)

| Pattern    | Meaning                   | Vue Usage                            |
| ---------- | ------------------------- | ------------------------------------ |
| `-\w`      | Hyphen + word char        | `camelizeRE` — kebab-case conversion |
| `\B[A-Z]`  | Uppercase not at boundary | `hyphenateRE` — camelCase conversion |
| `["'&<>]`  | Character class           | `escapeRE` — HTML escaping           |
| `^on[A-Z]` | Event handler prop        | Event detection                      |
| `^\d`      | Starts with digit         | Invalid identifier check             |
| `\s+`      | Whitespace                | String normalization                 |

---

## Regex Performance Tips from Vue

1. **Cache regex objects**: Define them as module-level constants, not inside functions

   ```ts
   // GOOD: compiled once
   const camelizeRE = /-\w/g

   // BAD: recompiled on every call
   function camelize(str) {
     return str.replace(/-\w/g, c => c.slice(1).toUpperCase())
   }
   ```

2. **Use `charCodeAt` for simple checks**: When checking 1-3 characters, `charCodeAt` beats regex

3. **Use `exec` for early exit**: If you only need to know IF a match exists (not where), use `test`. If you need the position, use `exec` once then switch to manual processing.

4. **Be careful with `g` flag and `exec`**: The `g` flag makes `exec` stateful — it remembers where it left off. Vue avoids this by using `replace` instead.

---

## Exercises

1. **Write a regex** that matches Vue template interpolation: `{{ expression }}`:

   ```js
   const interpolationRE = /\{\{(.+?)\}\}/g
   '{{ count }} items'.match(interpolationRE) // ['{{ count }}']
   ```

2. **Convert `isOn` back to regex**: Write the regex version and benchmark both approaches.

3. **Search for `/.*RE\b/`** (variables ending in "RE") across the codebase. List 10 regex constants Vue defines.

4. **Understand the escapeHtml optimization**: Why does it use `exec` first and then `charCodeAt`, instead of just `replace`?
   > Hint: If no dangerous characters exist, `exec` returns `null` immediately — avoiding any replacement logic.

---

## Key Takeaways

1. Regex is powerful for pattern matching but has performance costs
2. Vue caches regex as module-level constants — compiled once
3. For simple character checks, `charCodeAt` is faster than regex
4. `replace` with a callback function enables complex transformations
5. Character classes (`[...]`) match any character in the set
6. The `g` flag enables global matching — required for `replace` to replace all occurrences

**Next**: [16 — TypeScript Essentials](./16-typescript-essentials)
