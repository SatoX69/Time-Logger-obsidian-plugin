# Time Logger 1.4.1

Time Logger automatically adds time/date prefixes to journal paragraphs inside configured Time Logger blocks.

## V1 and V2

Version 1.4.1 keeps the existing V1 implementation unchanged as the default.

### V1 — `timelgr` fenced blocks

V1 uses strict `timelgr` fenced blocks:

```text
```timelgr
user text.....

next paragraph.....
```
```

With **Use V2** disabled, only `timelgr` blocks are processed.

### V2 — prefix/suffix blocks

V2 does not use Markdown code fences. Instead, a block is delimited by standalone prefix and suffix lines.

The defaults are:

```text
{
user text.....

next paragraph.....
}
```

Any eligible paragraph inside a matched V2 block can receive a timestamp.

Multiple V2 blocks in the same note are supported and are evaluated independently.

The default prefix and suffix can be changed from **Advanced settings**. Custom markers are matched as standalone, trimmed lines; this prevents ordinary uses of `{` or `}` inside prose from becoming blocks.

Unmatched V2 markers are ignored.

## Use V2

The **Use V2** toggle selects the block implementation:

- **Off:** V1 only (` ```timelgr `).
- **On:** V2 only by default.
- **On + Backward compatibility:** V1 and V2 are both processed.

V1 remains the default so upgrading from 1.3.7 does not change existing note behavior.

## Advanced settings

Enable **Advanced settings** to reveal the V2 controls.

**Custom prefix** and **Custom suffix** replace the default `{` and `}` markers.

**Backward compatibility** is available when V2 is enabled. When enabled, V1 ` ```timelgr ` blocks and V2 blocks are both recognized.

## Automatic behaviour

Processing remains event-driven and debounced. There is no polling interval.

Normal automatic processing evaluates the paragraph containing the cursor. The timestamp is inserted at that paragraph's first non-empty line.

Use **Rescan current note** when you intentionally want every eligible paragraph in every configured V1/V2 scope evaluated.

The existing debounce behavior is preserved, with the default response debounce remaining 250 ms.

## Relative line protection

The existing relative protection behavior is preserved for both V1 and V2.

The setting supports `Off` through `5 lines`.

With `1`, the immediate physical line above and the immediate physical line below are checked. Blank lines count as physical lines when measuring that distance, but blank lines are never timestamp targets.

During a rescan, timestamps planned earlier in the same pass also become part of the protection set. This keeps the result deterministic.

## Formatting

Time tokens:

`HH`, `H`, `hh`, `h`, `mm`, `m`, `ss`, `s`, `A`, `a`.

Date tokens:

`YYYY`, `YY`, `MMMM`, `MMM`, `MM`, `M`, `Do`, `DD`, `D`, `dddd`, `ddd`, `d`.

Custom timestamp syntax supports `{TIME}` and `{DATE}`.

Example:

```text
[at {TIME} of Day, exactly at {TIME} minutes]:
```

## Commands

- **Insert timestamp at current line** — explicitly timestamp the current paragraph when it is inside an enabled Time Logger scope.
- **Rescan current note** — evaluate every eligible paragraph in every enabled scope.

## Upgrade notes

Upgrading from 1.3.7 is non-destructive:

- V2 is disabled by default.
- Existing V1 settings are retained.
- Existing `timelgr` blocks continue to work exactly as before when V2 is disabled.
- V2-specific settings are added with safe defaults.

###### Generated with AI, debugged and stabilized by me


## 1.4.1 changes

- Migrated the plugin settings tab to Obsidian's declarative `getSettingDefinitions()` API.
- Removed the deprecated `display()` settings implementation and manual settings refresh.
- Removed deprecated slider dynamic tooltips; Obsidian now displays slider values inline.
- Renamed the advanced section heading to **Advanced**, avoiding redundant “settings” wording in headings.
- V2 visibility is now declarative and refreshes automatically when its prerequisite toggles change.


## 1.4.1 changes

- Migrated the plugin settings tab to Obsidian's declarative `getSettingDefinitions()` API.
- Removed the deprecated `display()` settings implementation and manual settings refresh.
- Removed deprecated slider dynamic tooltips; Obsidian now displays slider values inline.
- Renamed the advanced section heading to **Advanced**, avoiding redundant “settings” wording in headings.
- V2 visibility is now declarative and refreshes automatically when its prerequisite toggles change.
