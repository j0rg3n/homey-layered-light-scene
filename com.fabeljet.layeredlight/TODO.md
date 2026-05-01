# TODO

## Parser strictness

**Make `parseLightValue` reject bare separators**

The grammar defines only two valid transition forms:
- `/<duration>/` — linear fade
- `|<duration>|` — step/hold

The parser currently accepts bare `/` and `|` tokens (without duration) silently,
treating them as no-ops. These were never intended to be valid. The parser should
reject them with a parse error instead.

Affected code: `SceneManager.parseLightValue` in `scene-manager.ts`, tokenizer loop
and token-processing loop. The `sepWithDurMatch` already requires a duration and
both delimiters; the fallback single-char match (`remaining[0] === '/'`) is what
allows bare separators through.
