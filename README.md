# Time Logger 1.1.0

Time Logger automatically adds time/date prefixes to journal paragraphs inside `timelgr` fenced blocks.

## Scope

Strict mode is permanently enabled in this release. There is no non-strict toggle or command.

Only content between `timelgr` fences is processed:

![Time Logger](/images/time-logger.jpg)

```text
```timelgr
user text.....

next paragraph.....
```
```

Everything outside a `timelgr` block is untouched.

## Automatic behaviour

Processing is event-driven and debounced. There is no fixed polling interval.

Normal automatic processing evaluates the paragraph containing the cursor. The timestamp is inserted at that paragraph's first non-empty line, so reopening a journal does not unexpectedly rewrite its entire history.

Use **Rescan current note** when you intentionally want every eligible paragraph in every `timelgr` scope evaluated.

## Relative line protection

The setting supports `Off` through `5 lines`.

With `1`, the immediate physical line above and the immediate physical line below are checked. Blank lines count as physical lines when measuring that distance, but blank lines are never timestamp insertion targets.

For example, with `1`:

```text
[04:45]: previous entry

new entry
```

`new entry` is two physical lines after the timestamp, so the blank line does not cause it to be skipped.

During a rescan, timestamps planned earlier in the same pass also become part of the protection set. This makes the rule deterministic instead of depending on which editor change happened first.

## Formatting

Time tokens: `HH`, `H`, `hh`, `h`, `mm`, `m`, `ss`, `s`, `A`, `a`.

Date tokens: `YYYY`, `YY`, `MMMM`, `MMM`, `MM`, `M`, `Do`, `DD`, `D`, `dddd`, `ddd`, `d`.

Custom syntax supports `{TIME}` and `{DATE}`. Surrounding text is preserved.

Example:

```text
[at {TIME} of Day, exactly at {TIME} minutes]:
```

## Commands

- **Insert timestamp at current line** — explicitly timestamp the current paragraph when it is inside a `timelgr` block.
- **Rescan current note** — evaluate every non-empty paragraph inside `timelgr` blocks.



###### This was completely generated using AI and have been tested for practical usage. It works as intended
