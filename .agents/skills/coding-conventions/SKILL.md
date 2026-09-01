---
description: Enforce consistent file, folder, variable, function, type,
  class, and constant naming for TypeScript/JavaScript Node.js projects.
  Use this skill before creating any new file or directory, and when
  deciding names for new code artifacts.
disable-model-invocation: false
name: project-file-naming-standards
user-invocable: true
---

# Project File and Naming Standards

## Mandatory pre-creation check

Before creating **any new file or folder**, follow this skill.

1.  Inspect the existing repository structure near the intended
    location.
2.  Look for existing naming patterns in neighboring files and
    directories.
3.  Prefer the repository's established convention when it is consistent
    and reasonable.
4.  Do not introduce a new naming style just because another convention
    is also common.
5.  Before creating the artifact, determine:
    - What the artifact represents.
    - Which directory it belongs in.
    - Which naming convention applies.
    - Whether an existing file/module should be extended instead of
      creating a new one.
6.  Never create duplicate files or directories with alternate casing,
    separators, or synonyms.
7.  After deciding the name, use the same convention consistently for
    related files.
8.  If the project contains a zero byte file, safely delete it and update the files depending on it.
9.  If the project contains a zero file directory, delete it and update the files depending on it

## General principle

Use the most widely recognized convention for TypeScript/JavaScript
Node.js projects:

- **Directories:** lowercase `kebab-case`
- **Source files:** lowercase `kebab-case`
- **Variables:** `camelCase`
- **Functions:** `camelCase`
- **Parameters:** `camelCase`
- **Types:** `PascalCase`
- **Interfaces:** `PascalCase`
- **Classes:** `PascalCase`
- **Enums:** `PascalCase`
- **Enum members:** follow the project's existing convention; prefer
  `PascalCase` when defining a new enum style
- **Constants:** `UPPER_SNAKE_CASE` for true module-level constants;
  use `camelCase` for ordinary local bindings
- **Object properties:** `camelCase`
- **Private class members:** `camelCase`; do not add `_` prefixes
  unless the repository already uses them
- **Generic type parameters:** short descriptive `PascalCase` names
  such as `T`, `TValue`, `TEntity`
- **Test files:** follow the source filename and append the
  established test suffix, e.g. `foo.test.ts` or `foo.spec.ts`
- **Type declaration files:** use the normal filename plus `.d.ts`
  where appropriate

The repository's existing convention takes precedence when it is
deliberate and consistent.

## Directory naming

Prefer lowercase kebab-case:

```text
src/
  caption-engine/
  entity-system/
  preview-components/
  state-window/
```

Avoid:

```text
CaptionEngine/
caption_engine/
captionEngine/
CAPTION_ENGINE/
```

Do not create unnecessary nested directories. A new directory should
represent a meaningful module, feature, domain, or architectural
boundary.

## File naming

Prefer lowercase kebab-case:

```text
caption-engine.ts
state-window.ts
entity-transform.ts
preview-controller.ts
caption-parser.ts
```

Avoid:

```text
CaptionEngine.ts
caption_engine.ts
captionEngine.ts
STATE_WINDOW.ts
```

Use descriptive names. Do not abbreviate words unless the abbreviation
is universally understood or already established by the project.

Good:

```text
animation-track.ts
dependency-resolver.ts
resolved-transform.ts
```

Avoid:

```text
anim-trk.ts
dep-res.ts
xform.ts
```

### Related files

Keep related files predictably named:

```text
caption-parser.ts
caption-parser.test.ts

state-window.ts
state-window.test.ts

entity-transform.ts
entity-transform.test.ts
```

If the project uses `.spec.ts` instead of `.test.ts`, follow that
existing convention.

## TypeScript naming

Use `PascalCase` for types, interfaces, classes, and enums:

```ts
type StateWindowRange = ...
interface CaptionSequence { ... }
class EntityResolver { ... }
enum PreviewMode { ... }
```

Do not prefix interfaces with `I`:

```ts
// Prefer
interface EntityResolverOptions {}

// Avoid
interface IEntityResolverOptions {}
```

Names should describe the concept, not its implementation.

Prefer:

```ts
type StateWindowRange
type ResolvedTransform
interface CaptionSequence
```

Avoid:

```ts
type StateWindowType
type DataObject
interface IThing
```

## Variable naming

Use `camelCase`.

```ts
const currentWord = ...
const resolvedTransform = ...
let previousWordCount = ...
const sourceEntityId = ...
```

Use descriptive names.

Prefer:

```ts
const previousWordIndex = ...
const resolvedPosition = ...
const dependencyTree = ...
```

Avoid ambiguous abbreviations:

```ts
const prevIdx = ...
const resPos = ...
const depTree = ...
```

Short names are acceptable for very local, obvious scopes such as simple
loop indexes:

```ts
for (const i of indexes) {
  ...
}
```

Do not use meaningless names for values whose meaning matters outside a
tiny local scope.

## Boolean naming

Boolean variables should read naturally as predicates.

Prefer:

```ts
const isVisible = ...
const hasOverride = ...
const canPaste = ...
const shouldRender = ...
const supportsComponent = ...
```

Avoid:

```ts
const visible = ...
const override = ...
const paste = ...
const render = ...
```

When a boolean represents a capability, prefer `can`, `supports`, or
`allows`.

## Function naming

Use `camelCase`.

Function names should describe an action or computation.

Prefer:

```ts
resolveTransform();
calculateSegmentWidth();
createCaptionSequence();
parseCaptionText();
getResolvedValue();
findDependencyTree();
updateStateWindow();
```

Avoid:

```ts
transform();
thing();
doStuff();
processData();
handleIt();
```

Use a name that communicates the function's responsibility.

### Common function prefixes

Use prefixes that communicate intent:

- `get...` - retrieve a value without implying mutation
- `find...` - search and potentially return nothing
- `resolve...` - calculate the effective/resolved value from multiple
  sources
- `calculate...` - perform a calculation
- `create...` - construct a new object/entity
- `build...` - construct a derived structure
- `parse...` - convert external/text input into structured data
- `validate...` - validate and report a result
- `is...` / `has...` / `can...` / `should...` - boolean result
- `update...` - mutate/update existing state
- `set...` - explicitly assign a value
- `remove...` / `delete...` - remove something
- `register...` / `unregister...` - manage registration
- `serialize...` / `deserialize...` - convert persisted
  representations

Do not use a misleading prefix. For example, do not call a function
`getResolvedValue()` if it mutates state while resolving it.

## Async functions

Use the same `camelCase` naming convention. Do not add `Async` merely
because a function returns a Promise.

Prefer:

```ts
resolveCaptionSequence();
loadPreset();
saveProject();
```

Avoid:

```ts
resolveCaptionSequenceAsync();
loadPresetAsync();
```

Use `Async` only when needed to distinguish two genuinely different APIs
with the same conceptual operation.

## Constants

Use `UPPER_SNAKE_CASE` for true module-level constants that represent
fixed configuration or invariant values:

```ts
const MAX_PREVIEW_WIDTH = 1080;
const DEFAULT_STATE_WINDOW_COUNT = 1;
const EPSILON = 0.0001;
```

Do not turn every `const` binding into uppercase.

Prefer:

```ts
const currentWord = ...
const resolvedValue = ...
```

not:

```ts
const CURRENT_WORD = ...
const RESOLVED_VALUE = ...
```

## React / UI naming

For React components, use `PascalCase`:

```text
WordStateTimeline.tsx
PreviewControlBar.tsx
StateWindowEditor.tsx
```

Component names:

```ts
function WordStateTimeline() {}
function PreviewControlBar() {}
```

Hooks use `use` + `PascalCase`:

```ts
usePreviewState();
useResolvedTransform();
useStateWindow();
```

Event handlers should use `handle...` when they are internal handlers:

```ts
handleStateChange();
handlePaste();
handlePreviewResize();
```

Callback props should use `on...`:

```ts
onStateChange;
onPaste;
onPreviewResize;
```

## Node.js conventions

Use the same naming rules for Node.js modules.

Prefer:

```text
src/
  services/
    caption-renderer.ts
  repositories/
    project-repository.ts
  utils/
    time-utils.ts
```

Avoid generic directories such as:

```text
helpers/
misc/
stuff/
common/
```

unless the project already has a deliberate convention for them.

Do not use filesystem naming to encode implementation details
unnecessarily.

Prefer:

```text
caption-renderer.ts
```

over:

```text
caption-renderer-service.ts
```

unless the `service` distinction is meaningful in the architecture.

## Package and npm naming

When creating package names, prefer lowercase kebab-case:

```text
caption-engine
caption-engine-core
preview-renderer
```

Do not use uppercase letters or underscores in npm package names.

## Naming by domain concept

Names should use the project's established domain vocabulary.

If the codebase calls the concept `StateWindow`, do not introduce:

```text
StateRange
WindowConfig
TemporalRange
```

for the same concept unless they represent genuinely different
abstractions.

Before introducing a new name, search the repository for existing
terminology.

Consistency of domain language is more important than inventing a
theoretically "better" synonym.

## New file decision rule

Before creating a new file, ask:

1.  Does a file for this responsibility already exist?
2.  Can the functionality reasonably live in an existing module?
3.  Is the new file creating a meaningful architectural boundary?
4.  Does the proposed name match neighboring files?
5.  Does the name describe the domain responsibility rather than the
    implementation detail?

Do not create files merely to make files smaller.

## New folder decision rule

Before creating a new directory, ask:

1.  Does the directory represent a real module/domain/feature?
2.  Are there already similar directories?
3.  Would the new directory create unnecessary nesting?
4.  Does its name match sibling directories?
5.  Can the files live in an existing directory without reducing
    clarity?

Do not create folders such as `misc`, `temp`, `stuff`, or `new` as
permanent project structure.

## Comments, Documentation, TODOs, and Technical Text

Use **ASD-STE100 Simplified Technical English principles as a clarity guide**, not as a requirement for every comment.

The primary rule is:

> **Do not write a comment unless it adds information that the code, name, or surrounding context does not already communicate clearly.**

Comments are for intent, constraints, non-obvious behavior, decisions, and important context. They are not for narrating obvious code.

### When to write a comment

Write a comment when it explains something that a competent engineer could not reasonably infer from the code.

Good reasons include:

- Why the code is structured this way.
- An important engine or business rule.
- A non-obvious constraint or invariant.
- A performance reason.
- A compatibility requirement.
- A workaround for an external bug or limitation.
- A subtle lifecycle or ordering requirement.
- Why an apparently unusual implementation is necessary.
- A deferred task that is intentionally not being completed now.

Example:

```ts
// Keep Current at a constant width so it remains the visual reference
// point when Previous or Next windows change size.
```

### When NOT to write a comment

Do not comment code that is already self-explanatory.

Avoid:

```ts
// Get the current word.
const currentWord = getCurrentWord();
```

```ts
// Increment the index.
index++;
```

```ts
// Set the visibility to false.
isVisible = false;
```

Prefer clear names and code instead.

A good function or variable name should remove the need for many comments.

### Prefer code clarity over comments

Before adding a comment, ask:

1. Can a clearer variable or function name communicate this?
2. Can the code structure make the behavior obvious?
3. Is the comment explaining **why**, rather than repeating **what**?
4. Will the comment remain true when the implementation changes?

If the code can be made self-explanatory, improve the code instead of adding a comment.

### ASD-STE100 principles

When a comment or documentation is necessary:

- Use simple, direct language.
- Prefer short sentences.
- Use active voice.
- Use one idea per sentence.
- Use consistent terminology.
- Prefer precise technical terms over vague words.
- Avoid idioms, jokes, sarcasm, slang, and ambiguous language.
- Avoid unnecessary adjectives and filler.
- Explain the reason or constraint rather than restating the implementation.
- Keep the comment close to the code it explains.
- Remove or update stale comments when behavior changes.

ASD-STE100 does **not** require replacing precise engineering terminology with simpler but less accurate words.

Terms such as:

```text
resolved value
override
dependency
invariant
layout constraint
effective controller
```

should remain when they accurately describe the system.

Use STE principles to make technical language clearer, not less precise.

### TODO and FIXME comments

Use TODO/FIXME only for genuinely deferred or known work.

TODOs must be actionable and specific:

```ts
// TODO: Add support for negative spacing in horizontal layouts.
```

```ts
// FIXME: Recalculate overlay scale when the preview canvas is resized.
```

Avoid:

```ts
// TODO: Fix this later.
```

```ts
// TODO: Improve.
```

```ts
// FIXME: This is weird.
```

If the reason matters, include it:

```ts
// TODO: Cache resolved bounds to avoid recalculating them for each preview.
```

Do not add a TODO for work that should simply be completed as part of the current change.

### Documentation

Use ASD-STE principles for README files, API documentation, architectural notes, and other technical documentation.

Prefer:

```md
## Resolve Position

The engine calculates the final position from the entity transform and
active layout constraints.

The returned value is in parent coordinates.
```

Use documentation when the information is useful beyond what the code itself communicates.

Do not create documentation merely to describe obvious implementation details.

For API documentation, focus on:

1. What it does.
2. Important inputs or assumptions.
3. What it returns.
4. Important side effects or constraints.
5. Important failure conditions.

### Technical terminology

Use the project's established domain vocabulary consistently.

If the codebase calls a value a **resolved value**, do not alternate between:

```text
resolved value
computed value
final value
calculated value
```

unless those terms represent different concepts.

Before introducing a new term, search the repository for existing terminology.

### Documentation language

For instructions, prefer imperative wording:

```text
Select an entity.
Enable the effect.
Set the window to 3 words.
```

Avoid indirect wording:

```text
The user can select an entity.
The effect may then be enabled.
The window could be set to 3 words.
```

## Punctuation

Never use an em dash (`-`) anywhere in code comments, documentation, TODOs, FIXMEs, commit-style technical text, or other generated project text.

Always use a normal hyphen (`-`) instead.

Prefer:

```text
Resolve the value from the parent - then apply the local override.
```

Avoid:

```text
Resolve the value from the parent - then apply the local override.
```

This rule applies even when an em dash would otherwise be grammatically valid.

## Naming priority

When conventions conflict, use this priority order:

1.  Existing project convention
2.  Existing domain terminology
3.  Established TypeScript/Node.js conventions
4.  Broader industry convention
5.  Personal preference

Never rename existing files or symbols solely to satisfy this skill
unless the task explicitly asks for a naming cleanup.

## Final pre-creation checklist

Before creating a file or folder, verify:

- [ ] I inspected the surrounding directory.
- [ ] I checked for an existing module that could own this
      responsibility.
- [ ] The name matches neighboring files/directories.
- [ ] The name uses the correct casing and separator convention.
- [ ] The name describes the domain concept clearly.
- [ ] I am not creating a duplicate or synonym for an existing
      concept.
- [ ] Related test files will follow the same naming convention.
- [ ] The new directory is architecturally justified.

If any answer is unclear, inspect the repository before creating the
artifact.
