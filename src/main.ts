import {
  App,
  Editor,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  TFile,
  WorkspaceLeaf,
} from "obsidian";

interface TimeLoggerSettings {
  timeFormat: string;
  includeDate: boolean;
  dateFormat: string;
  customSyntax: string;
  contextMode: number;
  triggerMode: "typing" | "paragraph" | "both";
  debounceMs: number;
  useV2: boolean;
  advancedSettings: boolean;
  v2Prefix: string;
  v2Suffix: string;
  backwardCompatibility: boolean;
}

const DEFAULT_SETTINGS: TimeLoggerSettings = {
  timeFormat: "HH:mm",
  includeDate: false,
  dateFormat: "YYYY-MM-DD",
  customSyntax: "[{TIME}]: ",
  contextMode: 1,
  triggerMode: "both",
  debounceMs: 250,
  useV2: false,
  advancedSettings: false,
  v2Prefix: "{",
  v2Suffix: "}",
  backwardCompatibility: false,
};

const MAX_CONTEXT = 5;
const STRICT_LANGUAGE = "timelgr";

const TIMESTAMP_FALLBACK_RE = /^\s*\[[^\]\n]+\]:\s*/;
const FENCE_RE = /^\s*```([^\s`]*)\s*$/;
const ANY_FENCE_RE = /^\s*```/;

interface LineRange {
  start: number;
  end: number;
}

interface PlannedInsertion {
  line: number;
  text: string;
}

interface CursorSnapshot {
  line: number;
  ch: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function formatTime(date: Date, format: string): string {
  const h24 = date.getHours();
  const h12 = h24 % 12 || 12;
  const tokens: Record<string, string> = {
    HH: pad2(h24),
    H: String(h24),
    hh: pad2(h12),
    h: String(h12),
    mm: pad2(date.getMinutes()),
    m: String(date.getMinutes()),
    ss: pad2(date.getSeconds()),
    s: String(date.getSeconds()),
    A: h24 >= 12 ? "PM" : "AM",
    a: h24 >= 12 ? "pm" : "am",
  };

  return format.replace(/HH|hh|mm|ss|A|a|H|h|m|s/g, (token) => tokens[token]);
}

function formatDate(date: Date, format: string): string {
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MMMM: date.toLocaleString(undefined, { month: "long" }),
    MMM: date.toLocaleString(undefined, { month: "short" }),
    MM: pad2(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    DD: pad2(date.getDate()),
    D: String(date.getDate()),
    Do: ordinal(date.getDate()),
    dddd: date.toLocaleString(undefined, { weekday: "long" }),
    ddd: date.toLocaleString(undefined, { weekday: "short" }),
    d: String(date.getDay()),
  };

  return format.replace(
    /YYYY|MMMM|MMM|YY|MM|Do|DD|dddd|ddd|M|D|d/g,
    (token) => tokens[token],
  );
}

function buildTimeFormatRegex(format: string): string {
  const tokenRe = /HH|hh|mm|ss|A|a|H|h|m|s/g;
  const fragments: Record<string, string> = {
    HH: "\\d{2}",
    H: "\\d{1,2}",
    hh: "\\d{2}",
    h: "\\d{1,2}",
    mm: "\\d{2}",
    m: "\\d{1,2}",
    ss: "\\d{2}",
    s: "\\d{1,2}",
    A: "(?:AM|PM|am|pm)",
    a: "(?:am|pm)",
  };

  let pattern = "";
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(format)) !== null) {
    pattern += escapeRegExp(format.slice(last, match.index));
    pattern += fragments[match[0]];
    last = match.index + match[0].length;
  }

  pattern += escapeRegExp(format.slice(last));
  return pattern;
}

function buildDateFormatRegex(format: string): string {
  const tokenRe = /YYYY|MMMM|MMM|YY|MM|Do|DD|dddd|ddd|M|D|d/g;
  const fragments: Record<string, string> = {
    YYYY: "\\d{4}",
    YY: "\\d{2}",
    MMMM: "[^\\d\\n]+",
    MMM: "[^\\d\\n]+",
    MM: "\\d{2}",
    M: "\\d{1,2}",
    Do: "\\d{1,2}(?:st|nd|rd|th)",
    DD: "\\d{2}",
    D: "\\d{1,2}",
    dddd: "[^\\d\\n]+",
    ddd: "[^\\d\\n]+",
    d: "\\d",
  };

  let pattern = "";
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(format)) !== null) {
    pattern += escapeRegExp(format.slice(last, match.index));
    pattern += fragments[match[0]];
    last = match.index + match[0].length;
  }

  pattern += escapeRegExp(format.slice(last));
  return pattern;
}

function buildTimestampRegex(settings: TimeLoggerSettings): RegExp {
  const syntax = settings.customSyntax || DEFAULT_SETTINGS.customSyntax;
  const tokenRe = /\{(TIME|DATE)\}/gi;

  let pattern = "^\\s*";
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(syntax)) !== null) {
    pattern += escapeRegExp(syntax.slice(last, match.index));

    const token = match[1].toUpperCase();
    if (token === "TIME") {
      pattern += buildTimeFormatRegex(
        settings.timeFormat || DEFAULT_SETTINGS.timeFormat,
      );
    } else if (settings.includeDate) {
      pattern += buildDateFormatRegex(
        settings.dateFormat || DEFAULT_SETTINGS.dateFormat,
      );
    }

    last = match.index + match[0].length;
  }

  pattern += escapeRegExp(syntax.slice(last));

  try {
    return new RegExp(pattern);
  } catch {
    return TIMESTAMP_FALLBACK_RE;
  }
}

function isTimelgrFence(line: string): boolean {
  const match = line.match(FENCE_RE);
  return Boolean(match && match[1]?.toLowerCase() === STRICT_LANGUAGE);
}

/** Inclusive content-line ranges inside every ```timelgr fence. */
function findTimelgrScopes(lines: string[]): LineRange[] {
  const scopes: LineRange[] = [];
  let start = -1;

  for (let line = 0; line < lines.length; line++) {
    const value = lines[line] ?? "";

    if (start === -1) {
      if (isTimelgrFence(value)) start = line + 1;
      continue;
    }

    if (ANY_FENCE_RE.test(value)) {
      if (start <= line - 1) {
        scopes.push({ start, end: line - 1 });
      }
      start = -1;
    }
  }

  if (start !== -1 && start < lines.length) {
    scopes.push({ start, end: lines.length - 1 });
  }

  return scopes;
}

/**
 * V2 scopes are created by exact, trimmed marker lines.
 *
 * Example:
 * {
 * Paragraph
 *
 * Another paragraph
 * }
 *
 * Markers must be standalone lines. Every matched pair is treated as an
 * independent scope. Unmatched opening/closing markers are ignored.
 */
function findV2Scopes(
  lines: string[],
  prefix: string,
  suffix: string,
): LineRange[] {
  const scopes: LineRange[] = [];
  const normalizedPrefix = prefix.trim();
  const normalizedSuffix = suffix.trim();

  if (!normalizedPrefix || !normalizedSuffix) return scopes;

  let start = -1;

  for (let line = 0; line < lines.length; line++) {
    const value = (lines[line] ?? "").trim();

    if (start === -1) {
      if (value === normalizedPrefix) start = line + 1;
      continue;
    }

    if (value === normalizedSuffix) {
      if (start <= line - 1) {
        scopes.push({ start, end: line - 1 });
      }
      start = -1;
    }
  }

  return scopes;
}

function getScopes(settings: TimeLoggerSettings, lines: string[]): LineRange[] {
  const scopes: LineRange[] = [];

  if (!settings.useV2 || settings.backwardCompatibility) {
    scopes.push(...findTimelgrScopes(lines));
  }

  if (settings.useV2) {
    scopes.push(
      ...findV2Scopes(
        lines,
        settings.v2Prefix || DEFAULT_SETTINGS.v2Prefix,
        settings.v2Suffix || DEFAULT_SETTINGS.v2Suffix,
      ),
    );
  }

  return mergeRanges(scopes);
}

/**
 * Merges overlapping/adjacent scopes so compatibility mode cannot process
 * a paragraph twice when V1 and V2 scopes overlap.
 */
function mergeRanges(scopes: LineRange[]): LineRange[] {
  if (scopes.length <= 1) return scopes;

  const sorted = [...scopes].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const merged: LineRange[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = merged[merged.length - 1];

    if (current.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function lineInScopes(line: number, scopes: LineRange[]): boolean {
  for (const scope of scopes) {
    if (line < scope.start) return false;
    if (line <= scope.end) return true;
  }

  return false;
}

function meaningful(line: string): boolean {
  return line.trim().length > 0;
}

function clampContext(value: unknown): number {
  return Math.max(0, Math.min(MAX_CONTEXT, Math.round(Number(value) || 0)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validNonEmptyString(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function normalizeMarker(value: unknown, fallback: string): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate.length > 0 ? candidate : fallback;
}

export default class TimeLoggerPlugin extends Plugin {
  settings: TimeLoggerSettings = { ...DEFAULT_SETTINGS };

  private timers = new Map<string, number>();
  private updatingEditors = new WeakSet<Editor>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new TimeLoggerSettingTab(this.app, this));

    this.registerMarkdownPostProcessor((element) =>
      this.styleRenderedTimestamps(element),
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf) this.scheduleLeaf(leaf, "focus");
      }),
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, info) => {
        this.scheduleEditor(editor, info.file, "change");
      }),
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        const view =
          this.app.workspace.getActiveViewOfType<MarkdownView>(MarkdownView);

        if (view) this.scheduleEditor(view.editor, view.file, "layout");
      }),
    );

    this.addCommand({
      id: "timestamp-current-line",
      name: "Insert timestamp at current line",
      editorCallback: (editor: Editor) =>
        this.processEditor(
          editor,
          this.app.workspace.getActiveFile(),
          true,
          true,
        ),
    });

    this.addCommand({
      id: "rescan-current-note",
      name: "Rescan current note",
      editorCallback: (editor: Editor) =>
        this.processEditor(
          editor,
          this.app.workspace.getActiveFile(),
          true,
          false,
        ),
    });

    const view =
      this.app.workspace.getActiveViewOfType<MarkdownView>(MarkdownView);

    if (view) this.scheduleEditor(view.editor, view.file, "startup");
  }

  onunload(): void {
    for (const timer of this.timers.values()) {
      window.clearTimeout(timer);
    }

    this.timers.clear();
  }

  async loadSettings(): Promise<void> {
    const stored: unknown = await this.loadData();
    const data = isRecord(stored) ? stored : {};

    this.settings = {
      timeFormat: validNonEmptyString(
        data.timeFormat,
        DEFAULT_SETTINGS.timeFormat,
      ),
      includeDate:
        typeof data.includeDate === "boolean"
          ? data.includeDate
          : DEFAULT_SETTINGS.includeDate,
      dateFormat: validNonEmptyString(
        data.dateFormat,
        DEFAULT_SETTINGS.dateFormat,
      ),
      customSyntax: validNonEmptyString(
        data.customSyntax,
        DEFAULT_SETTINGS.customSyntax,
      ),
      contextMode: clampContext(data.contextMode),
      triggerMode:
        data.triggerMode === "typing" ||
        data.triggerMode === "paragraph" ||
        data.triggerMode === "both"
          ? data.triggerMode
          : DEFAULT_SETTINGS.triggerMode,
      debounceMs: Math.max(
        100,
        Math.min(
          1500,
          Math.round(
            Number(data.debounceMs) || DEFAULT_SETTINGS.debounceMs,
          ),
        ),
      ),
      useV2:
        typeof data.useV2 === "boolean"
          ? data.useV2
          : DEFAULT_SETTINGS.useV2,
      advancedSettings:
        typeof data.advancedSettings === "boolean"
          ? data.advancedSettings
          : DEFAULT_SETTINGS.advancedSettings,
      v2Prefix: normalizeMarker(
        data.v2Prefix,
        DEFAULT_SETTINGS.v2Prefix,
      ),
      v2Suffix: normalizeMarker(
        data.v2Suffix,
        DEFAULT_SETTINGS.v2Suffix,
      ),
      backwardCompatibility:
        typeof data.backwardCompatibility === "boolean"
          ? data.backwardCompatibility
          : DEFAULT_SETTINGS.backwardCompatibility,
    };

    await this.saveData(this.settings);
  }

  private styleRenderedTimestamps(element: HTMLElement): void {
    const timestampRegex = buildTimestampRegex(this.settings);
    const selector = "p, li, blockquote, h1, h2, h3, h4, h5, h6";

    element.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      const first = node.firstChild;

      if (
        !first ||
        first.nodeType !== Node.TEXT_NODE ||
        !first.textContent
      ) {
        return;
      }

      const value = first.textContent;
      const match = value.match(timestampRegex);

      if (!match || match[0].length === 0) return;

      const span = node.createSpan({
        cls: "timelgr-preview-timestamp",
        text: match[0],
      });

      first.replaceWith(span);

      if (value.length > match[0].length) {
        span.insertAdjacentText("afterend", value.slice(match[0].length));
      }
    });
  }

  private scheduleLeaf(leaf: WorkspaceLeaf, reason: string): void {
    if (!(leaf.view instanceof MarkdownView)) return;
    this.scheduleEditor(leaf.view.editor, leaf.view.file, reason);
  }

  private scheduleEditor(
    editor: Editor,
    file: TFile | null,
    reason: string,
  ): void {
    if (
      !file ||
      this.updatingEditors.has(editor) ||
      !this.shouldHandleReason(reason)
    ) {
      return;
    }

    if (!this.isActiveEditor(editor, file)) return;

    const existing = this.timers.get(file.path);
    if (existing) window.clearTimeout(existing);

    const timer = window.setTimeout(() => {
      this.timers.delete(file.path);
      this.processEditor(editor, file, false, true);
    }, this.settings.debounceMs);

    this.timers.set(file.path, timer);
  }

  private shouldHandleReason(reason: string): boolean {
    switch (this.settings.triggerMode) {
      case "typing":
        return reason === "change" || reason === "startup";
      case "paragraph":
        return (
          reason === "focus" ||
          reason === "layout" ||
          reason === "startup"
        );
      default:
        return true;
    }
  }

  private isActiveEditor(editor: Editor, file: TFile): boolean {
    const view =
      this.app.workspace.getActiveViewOfType<MarkdownView>(MarkdownView);

    return Boolean(
      view &&
        view.editor === editor &&
        view.file?.path === file.path,
    );
  }

  /**
   * Automatic processing works on the cursor's logical paragraph only.
   * Explicit rescan processes every eligible paragraph in every configured
   * scope. The relative context rule is identical for V1 and V2.
   */
  private processEditor(
    editor: Editor,
    file: TFile | null,
    force: boolean,
    cursorOnly: boolean,
  ): void {
    if (
      !file ||
      this.updatingEditors.has(editor) ||
      !this.isActiveEditor(editor, file)
    ) {
      return;
    }

    const source = editor.getValue();
    const lines = source.split("\n");
    const scopes = getScopes(this.settings, lines);

    if (scopes.length === 0) return;

    const paragraphs = this.getParagraphs(lines, scopes);
    const cursor = editor.getCursor();

    const candidates = cursorOnly
      ? this.getCursorParagraph(paragraphs, cursor.line)
      : paragraphs;

    if (candidates.length === 0) return;

    // Updated during planning so the relative rule remains deterministic
    // even when multiple insertions are created during one rescan.
    const timestampLines = new Set<number>();

    for (const paragraph of paragraphs) {
      for (let line = paragraph.start; line <= paragraph.end; line++) {
        if (this.isTimestampedLine(lines[line] ?? "")) {
          timestampLines.add(line);
        }
      }
    }

    const planned: PlannedInsertion[] = [];
    const context = this.settings.contextMode;

    for (const paragraph of candidates) {
      const target = paragraph.start;

      if (!meaningful(lines[target] ?? "")) continue;
      if (this.paragraphHasTimestamp(paragraph, timestampLines)) continue;

      if (
        context > 0 &&
        this.hasNearbyTimestamp(
          timestampLines,
          target,
          context,
          lines.length,
          scopes,
        )
      ) {
        continue;
      }

      planned.push({
        line: target,
        text: this.makeTimestamp(new Date()),
      });

      timestampLines.add(target);

      if (cursorOnly && force) break;
    }

    if (planned.length === 0) return;
    this.applyInsertions(editor, cursor, planned);
  }

  /** Groups consecutive non-empty lines; blank lines separate paragraphs. */
  private getParagraphs(
    lines: string[],
    scopes: LineRange[],
  ): LineRange[] {
    const result: LineRange[] = [];

    for (const scope of scopes) {
      let start = -1;

      for (let line = scope.start; line <= scope.end; line++) {
        if (meaningful(lines[line] ?? "")) {
          if (start === -1) start = line;
        } else if (start !== -1) {
          result.push({ start, end: line - 1 });
          start = -1;
        }
      }

      if (start !== -1) {
        result.push({ start, end: scope.end });
      }
    }

    return result;
  }

  private getCursorParagraph(
    paragraphs: LineRange[],
    cursorLine: number,
  ): LineRange[] {
    for (const paragraph of paragraphs) {
      if (cursorLine >= paragraph.start && cursorLine <= paragraph.end) {
        return [paragraph];
      }
    }

    return [];
  }

  private paragraphHasTimestamp(
    paragraph: LineRange,
    timestampLines: Set<number>,
  ): boolean {
    for (let line = paragraph.start; line <= paragraph.end; line++) {
      if (timestampLines.has(line)) return true;
    }

    return false;
  }

  /**
   * Physical-line context preserved from V1.
   * Blank lines count toward distance but are never timestamped.
   */
  private hasNearbyTimestamp(
    timestampLines: Set<number>,
    targetLine: number,
    distance: number,
    lineCount: number,
    scopes: LineRange[],
  ): boolean {
    for (let offset = 1; offset <= distance; offset++) {
      const before = targetLine - offset;
      const after = targetLine + offset;

      if (
        before >= 0 &&
        lineInScopes(before, scopes) &&
        timestampLines.has(before)
      ) {
        return true;
      }

      if (
        after < lineCount &&
        lineInScopes(after, scopes) &&
        timestampLines.has(after)
      ) {
        return true;
      }
    }

    return false;
  }

  private isTimestampedLine(line: string): boolean {
    return buildTimestampRegex(this.settings).test(line);
  }

  private applyInsertions(
    editor: Editor,
    cursor: CursorSnapshot,
    insertions: PlannedInsertion[],
  ): void {
    // Reverse order preserves all original line positions during insertion.
    insertions.sort((a, b) => b.line - a.line);

    this.updatingEditors.add(editor);

    try {
      for (const item of insertions) {
        editor.replaceRange(
          item.text,
          { line: item.line, ch: 0 },
          { line: item.line, ch: 0 },
        );
      }

      const cursorShift = insertions
        .filter((item) => item.line === cursor.line)
        .reduce((total, item) => total + item.text.length, 0);

      editor.setCursor({
        line: cursor.line,
        ch: cursor.ch + cursorShift,
      });
    } finally {
      this.updatingEditors.delete(editor);
    }
  }

  private makeTimestamp(date: Date): string {
    const time = formatTime(
      date,
      this.settings.timeFormat || DEFAULT_SETTINGS.timeFormat,
    );

    const dateText = this.settings.includeDate
      ? formatDate(
          date,
          this.settings.dateFormat || DEFAULT_SETTINGS.dateFormat,
        )
      : "";

    return (this.settings.customSyntax || DEFAULT_SETTINGS.customSyntax)
      .replace(/\{TIME\}/gi, time)
      .replace(/\{DATE\}/gi, dateText);
  }
}

class TimeLoggerSettingTab extends PluginSettingTab {
  plugin: TimeLoggerPlugin;

  constructor(
    app: App,
    plugin: TimeLoggerPlugin,
  ) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions() {
    return [
      {
        type: "group" as const,
        heading: "Timestamp format",
        items: [
          {
            name: "Time format",
            desc: "Format used for timestamps.",
            control: {
              type: "text" as const,
              key: "timeFormat",
              placeholder: "HH:mm",
              validate: (value: string) =>
                value.trim() ? undefined : "Enter a time format.",
            },
          },
          {
            name: "Include date",
            desc: "Add a formatted date to the timestamp.",
            control: {
              type: "toggle" as const,
              key: "includeDate",
            },
          },
          {
            name: "Date format",
            desc: "Format used for dates.",
            control: {
              type: "text" as const,
              key: "dateFormat",
              placeholder: "YYYY-MM-DD",
              validate: (value: string) =>
                value.trim() ? undefined : "Enter a date format.",
            },
          },
          {
            name: "Custom syntax",
            desc: "Use {TIME} and {DATE}. Example: [{DATE} {TIME}]: or [at {TIME} of Day]:.",
            control: {
              type: "text" as const,
              key: "customSyntax",
              placeholder: "[{TIME}]: ",
              validate: (value: string) =>
                /\{TIME\}/i.test(value)
                  ? undefined
                  : "Include the {TIME} placeholder.",
            },
          },
        ],
      },
      {
        type: "group" as const,
        heading: "Insertion behavior",
        items: [
          {
            name: "Use V2",
            desc: "V1 uses ```timelgr code blocks. V2 does not use code blocks; it uses a configurable prefix/suffix block, defaulting to { and }.",
            control: {
              type: "toggle" as const,
              key: "useV2",
            },
          },
          {
            name: "Relative line protection",
            desc: `Check 0–${MAX_CONTEXT} physical lines before and after. Blank lines count toward distance but are never timestamped.`,
            control: {
              type: "slider" as const,
              key: "contextMode",
              min: 0,
              max: MAX_CONTEXT,
              step: 1,
            },
          },
          {
            name: "Trigger mode",
            desc: "Typing reacts to editor changes; focus reacts when the active note changes or the layout changes.",
            control: {
              type: "dropdown" as const,
              key: "triggerMode",
              options: {
                typing: "Typing",
                paragraph: "Focus",
                both: "Typing + focus",
              },
            },
          },
          {
            name: "Response debounce",
            desc: "Delay after an editor event before evaluating the current line.",
            control: {
              type: "slider" as const,
              key: "debounceMs",
              min: 100,
              max: 1500,
              step: 50,
            },
          },
        ],
      },
      {
        type: "group" as const,
        heading: "Advanced",
        items: [
          {
            name: "Advanced settings",
            desc: "Show additional V2 block controls and backward-compatibility options.",
            control: {
              type: "toggle" as const,
              key: "advancedSettings",
            },
          },
          {
            name: "Custom prefix",
            desc: "Standalone line used to open a V2 block.",
            visible: () =>
              this.plugin.settings.advancedSettings && this.plugin.settings.useV2,
            control: {
              type: "text" as const,
              key: "v2Prefix",
              placeholder: "{",
              validate: (value: string) =>
                value.trim() ? undefined : "Enter a prefix.",
            },
          },
          {
            name: "Custom suffix",
            desc: "Standalone line used to close a V2 block.",
            visible: () =>
              this.plugin.settings.advancedSettings && this.plugin.settings.useV2,
            control: {
              type: "text" as const,
              key: "v2Suffix",
              placeholder: "}",
              validate: (value: string) =>
                value.trim() ? undefined : "Enter a suffix.",
            },
          },
          {
            name: "Backward compatibility",
            desc: "When enabled with V2, both V1 ```timelgr``` blocks and V2 blocks are processed.",
            visible: () =>
              this.plugin.settings.advancedSettings && this.plugin.settings.useV2,
            control: {
              type: "toggle" as const,
              key: "backwardCompatibility",
            },
          },
        ],
      },
    ];
  }
}
