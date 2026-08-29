"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const DEFAULT_SETTINGS = {
    timeFormat: "HH:mm",
    includeDate: false,
    dateFormat: "YYYY-MM-DD",
    customSyntax: "[{TIME}]: ",
    contextMode: 1,
    triggerMode: "both",
    debounceMs: 250,
};
const MAX_CONTEXT = 5;
const STRICT_LANGUAGE = "timelgr";
const TIMESTAMP_FALLBACK_RE = /^\s*\[[^\]\n]+\]:\s*/;
const FENCE_RE = /^\s*```([^\s`]*)\s*$/;
const ANY_FENCE_RE = /^\s*```/;
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function pad2(value) {
    return String(value).padStart(2, "0");
}
function ordinal(value) {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13)
        return `${value}th`;
    switch (value % 10) {
        case 1: return `${value}st`;
        case 2: return `${value}nd`;
        case 3: return `${value}rd`;
        default: return `${value}th`;
    }
}
function formatTime(date, format) {
    const h24 = date.getHours();
    const h12 = h24 % 12 || 12;
    const tokens = {
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
    return format.replace(/HH|hh|mm|ss|A|a|H|h|m|s/g, token => tokens[token]);
}
function formatDate(date, format) {
    const tokens = {
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
    return format.replace(/YYYY|MMMM|MMM|YY|MM|Do|DD|dddd|ddd|M|D|d/g, token => tokens[token]);
}
function buildTimeFormatRegex(format) {
    const tokenRe = /HH|hh|mm|ss|A|a|H|h|m|s/g;
    let pattern = "";
    let last = 0;
    let match;
    const fragments = {
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
    while ((match = tokenRe.exec(format)) !== null) {
        pattern += escapeRegExp(format.slice(last, match.index));
        pattern += fragments[match[0]];
        last = match.index + match[0].length;
    }
    pattern += escapeRegExp(format.slice(last));
    return pattern;
}
function buildDateFormatRegex(format) {
    const tokenRe = /YYYY|MMMM|MMM|YY|MM|Do|DD|dddd|ddd|M|D|d/g;
    let pattern = "";
    let last = 0;
    let match;
    const fragments = {
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
    while ((match = tokenRe.exec(format)) !== null) {
        pattern += escapeRegExp(format.slice(last, match.index));
        pattern += fragments[match[0]];
        last = match.index + match[0].length;
    }
    pattern += escapeRegExp(format.slice(last));
    return pattern;
}
function buildTimestampRegex(settings) {
    const syntax = settings.customSyntax || DEFAULT_SETTINGS.customSyntax;
    const tokenRe = /\{(TIME|DATE)\}/gi;
    let pattern = "^\\s*";
    let last = 0;
    let match;
    while ((match = tokenRe.exec(syntax)) !== null) {
        pattern += escapeRegExp(syntax.slice(last, match.index));
        const token = match[1].toUpperCase();
        if (token === "TIME") {
            pattern += buildTimeFormatRegex(settings.timeFormat || DEFAULT_SETTINGS.timeFormat);
        }
        else if (settings.includeDate) {
            pattern += buildDateFormatRegex(settings.dateFormat || DEFAULT_SETTINGS.dateFormat);
        }
        last = match.index + match[0].length;
    }
    pattern += escapeRegExp(syntax.slice(last));
    try {
        return new RegExp(pattern);
    }
    catch (_a) {
        return TIMESTAMP_FALLBACK_RE;
    }
}
function isTimelgrFence(line) {
    var _a;
    const match = line.match(FENCE_RE);
    return Boolean(match && ((_a = match[1]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === STRICT_LANGUAGE);
}
/** Inclusive content-line ranges inside every ```timelgr fence. */
function findTimelgrScopes(lines) {
    var _a;
    const scopes = [];
    let start = -1;
    for (let line = 0; line < lines.length; line++) {
        const value = (_a = lines[line]) !== null && _a !== void 0 ? _a : "";
        if (start === -1) {
            if (isTimelgrFence(value))
                start = line + 1;
            continue;
        }
        if (ANY_FENCE_RE.test(value)) {
            if (start <= line - 1)
                scopes.push({ start, end: line - 1 });
            start = -1;
        }
    }
    if (start !== -1 && start < lines.length) {
        scopes.push({ start, end: lines.length - 1 });
    }
    return scopes;
}
function lineInScopes(line, scopes) {
    for (const scope of scopes) {
        if (line < scope.start)
            return false;
        if (line <= scope.end)
            return true;
    }
    return false;
}
function meaningful(line) {
    return line.trim().length > 0;
}
function clampContext(value) {
    return Math.max(0, Math.min(MAX_CONTEXT, Math.round(Number(value) || 0)));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
class TimeLoggerPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        this.timers = new Map();
        this.updatingEditors = new WeakSet();
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            this.addSettingTab(new TimeLoggerSettingTab(this.app, this));
            this.registerMarkdownPostProcessor(element => this.styleRenderedTimestamps(element));
            this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
                if (leaf)
                    this.scheduleLeaf(leaf, "focus");
            }));
            this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => {
                this.scheduleEditor(editor, info.file, "change");
            }));
            this.registerEvent(this.app.workspace.on("layout-change", () => {
                const view = this.app.workspace.getActiveViewOfType(obsidian_1.MarkdownView);
                if (view)
                    this.scheduleEditor(view.editor, view.file, "layout");
            }));
            this.addCommand({
                id: "timestamp-current-line",
                name: "Insert timestamp at current line",
                editorCallback: (editor) => this.processEditor(editor, this.app.workspace.getActiveFile(), true, true),
            });
            this.addCommand({
                id: "rescan-current-note",
                name: "Rescan current note",
                editorCallback: (editor) => this.processEditor(editor, this.app.workspace.getActiveFile(), true, false),
            });
            const view = this.app.workspace.getActiveViewOfType(obsidian_1.MarkdownView);
            if (view)
                this.scheduleEditor(view.editor, view.file, "startup");
        });
    }
    onunload() {
        for (const timer of this.timers.values())
            window.clearTimeout(timer);
        this.timers.clear();
    }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            const stored = yield this.loadData();
            const data = isRecord(stored) ? stored : {};
            this.settings = {
                timeFormat: typeof data.timeFormat === "string" && data.timeFormat.length > 0
                    ? data.timeFormat
                    : DEFAULT_SETTINGS.timeFormat,
                includeDate: typeof data.includeDate === "boolean"
                    ? data.includeDate
                    : DEFAULT_SETTINGS.includeDate,
                dateFormat: typeof data.dateFormat === "string" && data.dateFormat.length > 0
                    ? data.dateFormat
                    : DEFAULT_SETTINGS.dateFormat,
                customSyntax: typeof data.customSyntax === "string" && data.customSyntax.length > 0
                    ? data.customSyntax
                    : DEFAULT_SETTINGS.customSyntax,
                contextMode: clampContext(data.contextMode),
                triggerMode: data.triggerMode === "typing" || data.triggerMode === "paragraph" || data.triggerMode === "both"
                    ? data.triggerMode
                    : DEFAULT_SETTINGS.triggerMode,
                debounceMs: Math.max(100, Math.min(1500, Math.round(Number(data.debounceMs) || DEFAULT_SETTINGS.debounceMs))),
            };
            // Strict mode is intentionally hard-coded. Older strictMode values are ignored.
            yield this.saveData(this.settings);
        });
    }
    styleRenderedTimestamps(element) {
        const timestampRegex = buildTimestampRegex(this.settings);
        const selector = "p, li, blockquote, h1, h2, h3, h4, h5, h6";
        element.querySelectorAll(selector).forEach(node => {
            const first = node.firstChild;
            if (!first || first.nodeType !== Node.TEXT_NODE || !first.textContent)
                return;
            const value = first.textContent;
            const match = value.match(timestampRegex);
            if (!match || match[0].length === 0)
                return;
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
    scheduleLeaf(leaf, reason) {
        if (!(leaf.view instanceof obsidian_1.MarkdownView))
            return;
        this.scheduleEditor(leaf.view.editor, leaf.view.file, reason);
    }
    scheduleEditor(editor, file, reason) {
        if (!file || this.updatingEditors.has(editor) || !this.shouldHandleReason(reason))
            return;
        if (!this.isActiveEditor(editor, file))
            return;
        const existing = this.timers.get(file.path);
        if (existing)
            window.clearTimeout(existing);
        const timer = window.setTimeout(() => {
            this.timers.delete(file.path);
            this.processEditor(editor, file, false, true);
        }, this.settings.debounceMs);
        this.timers.set(file.path, timer);
    }
    shouldHandleReason(reason) {
        switch (this.settings.triggerMode) {
            case "typing":
                return reason === "change" || reason === "startup";
            case "paragraph":
                return reason === "focus" || reason === "layout" || reason === "startup";
            default:
                return true;
        }
    }
    isActiveEditor(editor, file) {
        var _a;
        const view = this.app.workspace.getActiveViewOfType(obsidian_1.MarkdownView);
        return Boolean(view && view.editor === editor && ((_a = view.file) === null || _a === void 0 ? void 0 : _a.path) === file.path);
    }
    /**
     * Automatic processing works on the cursor's logical paragraph only.
     * Explicit rescan processes every paragraph in every timelgr scope.
     */
    processEditor(editor, file, force, cursorOnly) {
        var _a, _b;
        if (!file || this.updatingEditors.has(editor) || !this.isActiveEditor(editor, file))
            return;
        const source = editor.getValue();
        const lines = source.split("\n");
        const scopes = findTimelgrScopes(lines);
        if (scopes.length === 0)
            return;
        const paragraphs = this.getParagraphs(lines, scopes);
        const cursor = editor.getCursor();
        const candidates = cursorOnly
            ? this.getCursorParagraph(paragraphs, cursor.line)
            : paragraphs;
        if (candidates.length === 0)
            return;
        // This set is updated as a rescan plans insertions. Therefore the relative
        // rule remains true even between newly planned timestamps.
        const timestampLines = new Set();
        for (const paragraph of paragraphs) {
            for (let line = paragraph.start; line <= paragraph.end; line++) {
                if (this.isTimestampedLine((_a = lines[line]) !== null && _a !== void 0 ? _a : ""))
                    timestampLines.add(line);
            }
        }
        const planned = [];
        const context = this.settings.contextMode;
        for (const paragraph of candidates) {
            const target = paragraph.start;
            if (!meaningful((_b = lines[target]) !== null && _b !== void 0 ? _b : ""))
                continue;
            if (this.paragraphHasTimestamp(paragraph, timestampLines))
                continue;
            if (context > 0 && this.hasNearbyTimestamp(timestampLines, target, context, lines.length, scopes))
                continue;
            planned.push({ line: target, text: this.makeTimestamp(new Date()) });
            timestampLines.add(target);
            if (cursorOnly && force)
                break;
        }
        if (planned.length === 0)
            return;
        this.applyInsertions(editor, cursor, planned);
    }
    /** Groups consecutive non-empty lines; blank lines separate paragraphs. */
    getParagraphs(lines, scopes) {
        var _a;
        const result = [];
        for (const scope of scopes) {
            let start = -1;
            for (let line = scope.start; line <= scope.end; line++) {
                if (meaningful((_a = lines[line]) !== null && _a !== void 0 ? _a : "")) {
                    if (start === -1)
                        start = line;
                }
                else if (start !== -1) {
                    result.push({ start, end: line - 1 });
                    start = -1;
                }
            }
            if (start !== -1)
                result.push({ start, end: scope.end });
        }
        return result;
    }
    getCursorParagraph(paragraphs, cursorLine) {
        for (const paragraph of paragraphs) {
            if (cursorLine >= paragraph.start && cursorLine <= paragraph.end)
                return [paragraph];
        }
        return [];
    }
    paragraphHasTimestamp(paragraph, timestampLines) {
        for (let line = paragraph.start; line <= paragraph.end; line++) {
            if (timestampLines.has(line))
                return true;
        }
        return false;
    }
    /**
     * Physical-line context: blank lines count toward the distance but do not
     * themselves block insertion because they are not timestamped.
     */
    hasNearbyTimestamp(timestampLines, targetLine, distance, lineCount, scopes) {
        for (let offset = 1; offset <= distance; offset++) {
            const before = targetLine - offset;
            const after = targetLine + offset;
            if (before >= 0 && lineInScopes(before, scopes) && timestampLines.has(before))
                return true;
            if (after < lineCount && lineInScopes(after, scopes) && timestampLines.has(after))
                return true;
        }
        return false;
    }
    isTimestampedLine(line) {
        return buildTimestampRegex(this.settings).test(line);
    }
    applyInsertions(editor, cursor, insertions) {
        // Reverse order preserves all original line positions during insertion.
        insertions.sort((a, b) => b.line - a.line);
        this.updatingEditors.add(editor);
        try {
            for (const item of insertions) {
                editor.replaceRange(item.text, { line: item.line, ch: 0 }, { line: item.line, ch: 0 });
            }
            const cursorShift = insertions
                .filter(item => item.line === cursor.line)
                .reduce((total, item) => total + item.text.length, 0);
            editor.setCursor({ line: cursor.line, ch: cursor.ch + cursorShift });
        }
        finally {
            this.updatingEditors.delete(editor);
        }
    }
    makeTimestamp(date) {
        const time = formatTime(date, this.settings.timeFormat || DEFAULT_SETTINGS.timeFormat);
        const dateText = this.settings.includeDate
            ? formatDate(date, this.settings.dateFormat || DEFAULT_SETTINGS.dateFormat)
            : "";
        return (this.settings.customSyntax || DEFAULT_SETTINGS.customSyntax)
            .replace(/\{TIME\}/gi, time)
            .replace(/\{DATE\}/gi, dateText);
    }
}
exports.default = TimeLoggerPlugin;
class TimeLoggerSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    getSettingDefinitions() {
        return [
            {
                type: "group",
                heading: "Timestamp format",
                items: [
                    {
                        name: "Time format",
                        desc: "Tokens: HH/H, hh/h, mm/m, ss/s, A/a. Ordinary text is also allowed.",
                        control: {
                            type: "text",
                            key: "timeFormat",
                            placeholder: "HH:mm",
                            validate: (value) => value.trim().length > 0 ? undefined : "Time format cannot be empty.",
                        },
                    },
                    {
                        name: "Include date",
                        desc: "Add a formatted date to the timestamp.",
                        control: { type: "toggle", key: "includeDate" },
                    },
                    {
                        name: "Date format",
                        desc: "Tokens: YYYY, YY, MMMM, MMM, MM, M, Do, DD, D, dddd, ddd, d.",
                        visible: () => this.plugin.settings.includeDate,
                        control: {
                            type: "text",
                            key: "dateFormat",
                            placeholder: "YYYY-MM-DD",
                            validate: (value) => value.trim().length > 0 ? undefined : "Date format cannot be empty.",
                        },
                    },
                    {
                        name: "Custom syntax",
                        desc: "Use {TIME} and {DATE}. Example: [{DATE} {TIME}]: or [at {TIME} of Day]:.",
                        control: {
                            type: "text",
                            key: "customSyntax",
                            placeholder: "[{TIME}]: ",
                            validate: (value) => /\{TIME\}/i.test(value) ? undefined : "Custom syntax must contain {TIME}.",
                        },
                    },
                ],
            },
            {
                type: "group",
                heading: "Insertion behavior",
                items: [
                    {
                        name: "Relative line protection",
                        desc: "Check 0–5 physical lines before and after. Blank lines count toward distance but are never timestamped.",
                        control: {
                            type: "slider",
                            key: "contextMode",
                            min: 0,
                            max: MAX_CONTEXT,
                            step: 1,
                            defaultValue: DEFAULT_SETTINGS.contextMode,
                        },
                    },
                    {
                        name: "Trigger mode",
                        desc: "Typing reacts to editor changes; focus reacts when the active note changes or the layout changes.",
                        control: {
                            type: "dropdown",
                            key: "triggerMode",
                            defaultValue: DEFAULT_SETTINGS.triggerMode,
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
                            type: "slider",
                            key: "debounceMs",
                            min: 100,
                            max: 1500,
                            step: 50,
                            defaultValue: DEFAULT_SETTINGS.debounceMs,
                        },
                    },
                ],
            },
            {
                type: "group",
                heading: "Scope",
                items: [
                    {
                        name: "Strict scope",
                        desc: "Time Logger only processes content inside ```timelgr fenced blocks. This is always enabled.",
                    },
                    {
                        name: "Blank lines",
                        desc: "Blank lines are never timestamped, but they still count as physical lines for relative protection.",
                    },
                ],
            },
        ];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUEsdUNBUWtCO0FBWWxCLE1BQU0sZ0JBQWdCLEdBQXVCO0lBQzNDLFVBQVUsRUFBRSxPQUFPO0lBQ25CLFdBQVcsRUFBRSxLQUFLO0lBQ2xCLFVBQVUsRUFBRSxZQUFZO0lBQ3hCLFlBQVksRUFBRSxZQUFZO0lBQzFCLFdBQVcsRUFBRSxDQUFDO0lBQ2QsV0FBVyxFQUFFLE1BQU07SUFDbkIsVUFBVSxFQUFFLEdBQUc7Q0FDaEIsQ0FBQztBQUVGLE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBQztBQUN0QixNQUFNLGVBQWUsR0FBRyxTQUFTLENBQUM7QUFDbEMsTUFBTSxxQkFBcUIsR0FBRyxzQkFBc0IsQ0FBQztBQUNyRCxNQUFNLFFBQVEsR0FBRyxzQkFBc0IsQ0FBQztBQUN4QyxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUM7QUFpQi9CLFNBQVMsWUFBWSxDQUFDLEtBQWE7SUFDakMsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLHFCQUFxQixFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ3RELENBQUM7QUFFRCxTQUFTLElBQUksQ0FBQyxLQUFhO0lBQ3pCLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDeEMsQ0FBQztBQUVELFNBQVMsT0FBTyxDQUFDLEtBQWE7SUFDNUIsTUFBTSxNQUFNLEdBQUcsS0FBSyxHQUFHLEdBQUcsQ0FBQztJQUMzQixJQUFJLE1BQU0sSUFBSSxFQUFFLElBQUksTUFBTSxJQUFJLEVBQUU7UUFBRSxPQUFPLEdBQUcsS0FBSyxJQUFJLENBQUM7SUFDdEQsUUFBUSxLQUFLLEdBQUcsRUFBRSxFQUFFLENBQUM7UUFDbkIsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxJQUFJLENBQUM7UUFDNUIsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxJQUFJLENBQUM7UUFDNUIsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxJQUFJLENBQUM7UUFDNUIsT0FBTyxDQUFDLENBQUMsT0FBTyxHQUFHLEtBQUssSUFBSSxDQUFDO0lBQy9CLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsSUFBVSxFQUFFLE1BQWM7SUFDNUMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQzVCLE1BQU0sR0FBRyxHQUFHLEdBQUcsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFDO0lBQzNCLE1BQU0sTUFBTSxHQUEyQjtRQUNyQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQztRQUNiLENBQUMsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ2QsRUFBRSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUM7UUFDYixDQUFDLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNkLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzNCLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzVCLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzNCLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzVCLENBQUMsRUFBRSxHQUFHLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDMUIsQ0FBQyxFQUFFLEdBQUcsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSTtLQUMzQixDQUFDO0lBQ0YsT0FBTyxNQUFNLENBQUMsT0FBTyxDQUFDLDBCQUEwQixFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFD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LG1CQUFtQjt3QkFDekIsSUFBSSxFQUFFLGlFQUFpRTt3QkFDdkUsT0FBTyxFQUFFOzRCQUNQLElBQUksRUFBRSxRQUFROzRCQUNkLEdBQUcsRUFBRSxZQUFZOzRCQUNqQixHQUFHLEVBQUUsR0FBRzs0QkFDUixHQUFHLEVBQUUsSUFBSTs0QkFDVCxJQUFJLEVBQUUsRUFBRTs0QkFDUixZQUFZLEVBQUUsZ0JBQWdCLENBQUMsVUFBVTt5QkFDMUM7cUJBQ0Y7aUJBQ0Y7YUFDRjtZQUNEO2dCQUNFLElBQUksRUFBRSxPQUFPO2dCQUNiLE9BQU8sRUFBRSxPQUFPO2dCQUNoQixLQUFLLEVBQUU7b0JBQ0w7d0JBQ0UsSUFBSSxFQUFFLGNBQWM7d0JBQ3BCLElBQUksRUFBRSw2RkFBNkY7cUJBQ3BHO29CQUNEO3dCQUNFLElBQUksRUFBRSxhQUFhO3dCQUNuQixJQUFJLEVBQUUsb0dBQW9HO3FCQUMzRztpQkFDRjthQUNGO1NBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBNYXJrZG93blZpZXcsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgVEZpbGUsXG4gIFdvcmtzcGFjZUxlYWYsXG59IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbnRlcmZhY2UgVGltZUxvZ2dlclNldHRpbmdzIHtcbiAgdGltZUZvcm1hdDogc3RyaW5nO1xuICBpbmNsdWRlRGF0ZTogYm9vbGVhbjtcbiAgZGF0ZUZvcm1hdDogc3RyaW5nO1xuICBjdXN0b21TeW50YXg6IHN0cmluZztcbiAgY29udGV4dE1vZGU6IG51bWJlcjtcbiAgdHJpZ2dlck1vZGU6IFwidHlwaW5nXCIgfCBcInBhcmFncmFwaFwiIHwgXCJib3RoXCI7XG4gIGRlYm91bmNlTXM6IG51bWJlcjtcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogVGltZUxvZ2dlclNldHRpbmdzID0ge1xuICB0aW1lRm9ybWF0OiBcIkhIOm1tXCIsXG4gIGluY2x1ZGVEYXRlOiBmYWxzZSxcbiAgZGF0ZUZvcm1hdDogXCJZWVlZLU1NLUREXCIsXG4gIGN1c3RvbVN5bnRheDogXCJbe1RJTUV9XTogXCIsXG4gIGNvbnRleHRNb2RlOiAxLFxuICB0cmlnZ2VyTW9kZTogXCJib3RoXCIsXG4gIGRlYm91bmNlTXM6IDI1MCxcbn07XG5cbmNvbnN0IE1BWF9DT05URVhUID0gNTtcbmNvbnN0IFNUUklDVF9MQU5HVUFHRSA9IFwidGltZWxnclwiO1xuY29uc3QgVElNRVNUQU1QX0ZBTExCQUNLX1JFID0gL15cXHMqXFxbW15cXF1cXG5dK1xcXTpcXHMqLztcbmNvbnN0IEZFTkNFX1JFID0gL15cXHMqYGBgKFteXFxzYF0qKVxccyokLztcbmNvbnN0IEFOWV9GRU5DRV9SRSA9IC9eXFxzKmBgYC87XG5cbmludGVyZmFjZSBMaW5lUmFuZ2Uge1xuICBzdGFydDogbnVtYmVyO1xuICBlbmQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFBsYW5uZWRJbnNlcnRpb24ge1xuICBsaW5lOiBudW1iZXI7XG4gIHRleHQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEN1cnNvclNuYXBzaG90IHtcbiAgbGluZTogbnVtYmVyO1xuICBjaDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVSZWdFeHAodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XG59XG5cbmZ1bmN0aW9uIHBhZDIodmFsdWU6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBTdHJpbmcodmFsdWUpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbn1cblxuZnVuY3Rpb24gb3JkaW5hbCh2YWx1ZTogbnVtYmVyKTogc3RyaW5nIHtcbiAgY29uc3QgbW9kMTAwID0gdmFsdWUgJSAxMDA7XG4gIGlmIChtb2QxMDAgPj0gMTEgJiYgbW9kMTAwIDw9IDEzKSByZXR1cm4gYCR7dmFsdWV9dGhgO1xuICBzd2l0Y2ggKHZhbHVlICUgMTApIHtcbiAgICBjYXNlIDE6IHJldHVybiBgJHt2YWx1ZX1zdGA7XG4gICAgY2FzZSAyOiByZXR1cm4gYCR7dmFsdWV9bmRgO1xuICAgIGNhc2UgMzogcmV0dXJuIGAke3ZhbHVlfXJkYDtcbiAgICBkZWZhdWx0OiByZXR1cm4gYCR7dmFsdWV9dGhgO1xuICB9XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFRpbWUoZGF0ZTogRGF0ZSwgZm9ybWF0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBoMjQgPSBkYXRlLmdldEhvdXJzKCk7XG4gIGNvbnN0IGgxMiA9IGgyNCAlIDEyIHx8IDEyO1xuICBjb25zdCB0b2tlbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgSEg6IHBhZDIoaDI0KSxcbiAgICBIOiBTdHJpbmcoaDI0KSxcbiAgICBoaDogcGFkMihoMTIpLFxuICAgIGg6IFN0cmluZyhoMTIpLFxuICAgIG1tOiBwYWQyKGRhdGUuZ2V0TWludXRlcygpKSxcbiAgICBtOiBTdHJpbmcoZGF0ZS5nZXRNaW51dGVzKCkpLFxuICAgIHNzOiBwYWQyKGRhdGUuZ2V0U2Vjb25kcygpKSxcbiAgICBzOiBTdHJpbmcoZGF0ZS5nZXRTZWNvbmRzKCkpLFxuICAgIEE6IGgyNCA+PSAxMiA/IFwiUE1cIiA6IFwiQU1cIixcbiAgICBhOiBoMjQgPj0gMTIgPyBcInBtXCIgOiBcImFtXCIsXG4gIH07XG4gIHJldHVybiBmb3JtYXQucmVwbGFjZSgvSEh8aGh8bW18c3N8QXxhfEh8aHxtfHMvZywgdG9rZW4gPT4gdG9rZW5zW3Rva2VuXSk7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdERhdGUoZGF0ZTogRGF0ZSwgZm9ybWF0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCB0b2tlbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgWVlZWTogU3RyaW5nKGRhdGUuZ2V0RnVsbFllYXIoKSksXG4gICAgWVk6IFN0cmluZyhkYXRlLmdldEZ1bGxZZWFyKCkpLnNsaWNlKC0yKSxcbiAgICBNTU1NOiBkYXRlLnRvTG9jYWxlU3RyaW5nKHVuZGVmaW5lZCwgeyBtb250aDogXCJsb25nXCIgfSksXG4gICAgTU1NOiBkYXRlLnRvTG9jYWxlU3RyaW5nKHVuZGVmaW5lZCwgeyBtb250aDogXCJzaG9ydFwiIH0pLFxuICAgIE1NOiBwYWQyKGRhdGUuZ2V0TW9udGgoKSArIDEpLFxuICAgIE06IFN0cmluZyhkYXRlLmdldE1vbnRoKCkgKyAxKSxcbiAgICBERDogcGFkMihkYXRlLmdldERhdGUoKSksXG4gICAgRDogU3RyaW5nKGRhdGUuZ2V0RGF0ZSgpKSxcbiAgICBEbzogb3JkaW5hbChkYXRlLmdldERhdGUoKSksXG4gICAgZGRkZDogZGF0ZS50b0xvY2FsZVN0cmluZyh1bmRlZmluZWQsIHsgd2Vla2RheTogXCJsb25nXCIgfSksXG4gICAgZGRkOiBkYXRlLnRvTG9jYWxlU3RyaW5nKHVuZGVmaW5lZCwgeyB3ZWVrZGF5OiBcInNob3J0XCIgfSksXG4gICAgZDogU3RyaW5nKGRhdGUuZ2V0RGF5KCkpLFxuICB9O1xuICByZXR1cm4gZm9ybWF0LnJlcGxhY2UoL1lZWVl8TU1NTXxNTU18WVl8TU18RG98RER8ZGRkZHxkZGR8TXxEfGQvZywgdG9rZW4gPT4gdG9rZW5zW3Rva2VuXSk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkVGltZUZvcm1hdFJlZ2V4KGZvcm1hdDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgdG9rZW5SZSA9IC9ISHxoaHxtbXxzc3xBfGF8SHxofG18cy9nO1xuICBsZXQgcGF0dGVybiA9IFwiXCI7XG4gIGxldCBsYXN0ID0gMDtcbiAgbGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuICBjb25zdCBmcmFnbWVudHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgSEg6IFwiXFxcXGR7Mn1cIixcbiAgICBIOiBcIlxcXFxkezEsMn1cIixcbiAgICBoaDogXCJcXFxcZHsyfVwiLFxuICAgIGg6IFwiXFxcXGR7MSwyfVwiLFxuICAgIG1tOiBcIlxcXFxkezJ9XCIsXG4gICAgbTogXCJcXFxcZHsxLDJ9XCIsXG4gICAgc3M6IFwiXFxcXGR7Mn1cIixcbiAgICBzOiBcIlxcXFxkezEsMn1cIixcbiAgICBBOiBcIig/OkFNfFBNfGFtfHBtKVwiLFxuICAgIGE6IFwiKD86YW18cG0pXCIsXG4gIH07XG5cbiAgd2hpbGUgKChtYXRjaCA9IHRva2VuUmUuZXhlYyhmb3JtYXQpKSAhPT0gbnVsbCkge1xuICAgIHBhdHRlcm4gKz0gZXNjYXBlUmVnRXhwKGZvcm1hdC5zbGljZShsYXN0LCBtYXRjaC5pbmRleCkpO1xuICAgIHBhdHRlcm4gKz0gZnJhZ21lbnRzW21hdGNoWzBdXTtcbiAgICBsYXN0ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XG4gIH1cbiAgcGF0dGVybiArPSBlc2NhcGVSZWdFeHAoZm9ybWF0LnNsaWNlKGxhc3QpKTtcbiAgcmV0dXJuIHBhdHRlcm47XG59XG5cbmZ1bmN0aW9uIGJ1aWxkRGF0ZUZvcm1hdFJlZ2V4KGZvcm1hdDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgdG9rZW5SZSA9IC9ZWVlZfE1NTU18TU1NfFlZfE1NfERvfEREfGRkZGR8ZGRkfE18RHxkL2c7XG4gIGxldCBwYXR0ZXJuID0gXCJcIjtcbiAgbGV0IGxhc3QgPSAwO1xuICBsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG4gIGNvbnN0IGZyYWdtZW50czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBZWVlZOiBcIlxcXFxkezR9XCIsXG4gICAgWVk6IFwiXFxcXGR7Mn1cIixcbiAgICBNTU1NOiBcIlteXFxcXGRcXFxcbl0rXCIsXG4gICAgTU1NOiBcIlteXFxcXGRcXFxcbl0rXCIsXG4gICAgTU06IFwiXFxcXGR7Mn1cIixcbiAgICBNOiBcIlxcXFxkezEsMn1cIixcbiAgICBEbzogXCJcXFxcZHsxLDJ9KD86c3R8bmR8cmR8dGgpXCIsXG4gICAgREQ6IFwiXFxcXGR7Mn1cIixcbiAgICBEOiBcIlxcXFxkezEsMn1cIixcbiAgICBkZGRkOiBcIlteXFxcXGRcXFxcbl0rXCIsXG4gICAgZGRkOiBcIlteXFxcXGRcXFxcbl0rXCIsXG4gICAgZDogXCJcXFxcZFwiLFxuICB9O1xuXG4gIHdoaWxlICgobWF0Y2ggPSB0b2tlblJlLmV4ZWMoZm9ybWF0KSkgIT09IG51bGwpIHtcbiAgICBwYXR0ZXJuICs9IGVzY2FwZVJlZ0V4cChmb3JtYXQuc2xpY2UobGFzdCwgbWF0Y2guaW5kZXgpKTtcbiAgICBwYXR0ZXJuICs9IGZyYWdtZW50c1ttYXRjaFswXV07XG4gICAgbGFzdCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuICB9XG4gIHBhdHRlcm4gKz0gZXNjYXBlUmVnRXhwKGZvcm1hdC5zbGljZShsYXN0KSk7XG4gIHJldHVybiBwYXR0ZXJuO1xufVxuXG5mdW5jdGlvbiBidWlsZFRpbWVzdGFtcFJlZ2V4KHNldHRpbmdzOiBUaW1lTG9nZ2VyU2V0dGluZ3MpOiBSZWdFeHAge1xuICBjb25zdCBzeW50YXggPSBzZXR0aW5ncy5jdXN0b21TeW50YXggfHwgREVGQVVMVF9TRVRUSU5HUy5jdXN0b21TeW50YXg7XG4gIGNvbnN0IHRva2VuUmUgPSAvXFx7KFRJTUV8REFURSlcXH0vZ2k7XG4gIGxldCBwYXR0ZXJuID0gXCJeXFxcXHMqXCI7XG4gIGxldCBsYXN0ID0gMDtcbiAgbGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG4gIHdoaWxlICgobWF0Y2ggPSB0b2tlblJlLmV4ZWMoc3ludGF4KSkgIT09IG51bGwpIHtcbiAgICBwYXR0ZXJuICs9IGVzY2FwZVJlZ0V4cChzeW50YXguc2xpY2UobGFzdCwgbWF0Y2guaW5kZXgpKTtcbiAgICBjb25zdCB0b2tlbiA9IG1hdGNoWzFdLnRvVXBwZXJDYXNlKCk7XG4gICAgaWYgKHRva2VuID09PSBcIlRJTUVcIikge1xuICAgICAgcGF0dGVybiArPSBidWlsZFRpbWVGb3JtYXRSZWdleChzZXR0aW5ncy50aW1lRm9ybWF0IHx8IERFRkFVTFRfU0VUVElOR1MudGltZUZvcm1hdCk7XG4gICAgfSBlbHNlIGlmIChzZXR0aW5ncy5pbmNsdWRlRGF0ZSkge1xuICAgICAgcGF0dGVybiArPSBidWlsZERhdGVGb3JtYXRSZWdleChzZXR0aW5ncy5kYXRlRm9ybWF0IHx8IERFRkFVTFRfU0VUVElOR1MuZGF0ZUZvcm1hdCk7XG4gICAgfVxuICAgIGxhc3QgPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgfVxuXG4gIHBhdHRlcm4gKz0gZXNjYXBlUmVnRXhwKHN5bnRheC5zbGljZShsYXN0KSk7XG5cbiAgdHJ5IHtcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChwYXR0ZXJuKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFRJTUVTVEFNUF9GQUxMQkFDS19SRTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc1RpbWVsZ3JGZW5jZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKEZFTkNFX1JFKTtcbiAgcmV0dXJuIEJvb2xlYW4obWF0Y2ggJiYgbWF0Y2hbMV0/LnRvTG93ZXJDYXNlKCkgPT09IFNUUklDVF9MQU5HVUFHRSk7XG59XG5cbi8qKiBJbmNsdXNpdmUgY29udGVudC1saW5lIHJhbmdlcyBpbnNpZGUgZXZlcnkgYGBgdGltZWxnciBmZW5jZS4gKi9cbmZ1bmN0aW9uIGZpbmRUaW1lbGdyU2NvcGVzKGxpbmVzOiBzdHJpbmdbXSk6IExpbmVSYW5nZVtdIHtcbiAgY29uc3Qgc2NvcGVzOiBMaW5lUmFuZ2VbXSA9IFtdO1xuICBsZXQgc3RhcnQgPSAtMTtcblxuICBmb3IgKGxldCBsaW5lID0gMDsgbGluZSA8IGxpbmVzLmxlbmd0aDsgbGluZSsrKSB7XG4gICAgY29uc3QgdmFsdWUgPSBsaW5lc1tsaW5lXSA/PyBcIlwiO1xuXG4gICAgaWYgKHN0YXJ0ID09PSAtMSkge1xuICAgICAgaWYgKGlzVGltZWxnckZlbmNlKHZhbHVlKSkgc3RhcnQgPSBsaW5lICsgMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChBTllfRkVOQ0VfUkUudGVzdCh2YWx1ZSkpIHtcbiAgICAgIGlmIChzdGFydCA8PSBsaW5lIC0gMSkgc2NvcGVzLnB1c2goeyBzdGFydCwgZW5kOiBsaW5lIC0gMSB9KTtcbiAgICAgIHN0YXJ0ID0gLTE7XG4gICAgfVxuICB9XG5cbiAgaWYgKHN0YXJ0ICE9PSAtMSAmJiBzdGFydCA8IGxpbmVzLmxlbmd0aCkge1xuICAgIHNjb3Blcy5wdXNoKHsgc3RhcnQsIGVuZDogbGluZXMubGVuZ3RoIC0gMSB9KTtcbiAgfVxuXG4gIHJldHVybiBzY29wZXM7XG59XG5cbmZ1bmN0aW9uIGxpbmVJblNjb3BlcyhsaW5lOiBudW1iZXIsIHNjb3BlczogTGluZVJhbmdlW10pOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCBzY29wZSBvZiBzY29wZXMpIHtcbiAgICBpZiAobGluZSA8IHNjb3BlLnN0YXJ0KSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKGxpbmUgPD0gc2NvcGUuZW5kKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIG1lYW5pbmdmdWwobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBsaW5lLnRyaW0oKS5sZW5ndGggPiAwO1xufVxuXG5mdW5jdGlvbiBjbGFtcENvbnRleHQodmFsdWU6IHVua25vd24pOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5taW4oTUFYX0NPTlRFWFQsIE1hdGgucm91bmQoTnVtYmVyKHZhbHVlKSB8fCAwKSkpO1xufVxuXG5mdW5jdGlvbiBpc1JlY29yZCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFRpbWVMb2dnZXJQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogVGltZUxvZ2dlclNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTIH07XG5cbiAgcHJpdmF0ZSB0aW1lcnMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHVwZGF0aW5nRWRpdG9ycyA9IG5ldyBXZWFrU2V0PEVkaXRvcj4oKTtcblxuICBhc3luYyBvbmxvYWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFRpbWVMb2dnZXJTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duUG9zdFByb2Nlc3NvcihlbGVtZW50ID0+IHRoaXMuc3R5bGVSZW5kZXJlZFRpbWVzdGFtcHMoZWxlbWVudCkpO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImFjdGl2ZS1sZWFmLWNoYW5nZVwiLCBsZWFmID0+IHtcbiAgICAgIGlmIChsZWFmKSB0aGlzLnNjaGVkdWxlTGVhZihsZWFmLCBcImZvY3VzXCIpO1xuICAgIH0pKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLWNoYW5nZVwiLCAoZWRpdG9yLCBpbmZvKSA9PiB7XG4gICAgICB0aGlzLnNjaGVkdWxlRWRpdG9yKGVkaXRvciwgaW5mby5maWxlLCBcImNoYW5nZVwiKTtcbiAgICB9KSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImxheW91dC1jaGFuZ2VcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgdmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlPE1hcmtkb3duVmlldz4oTWFya2Rvd25WaWV3KTtcbiAgICAgIGlmICh2aWV3KSB0aGlzLnNjaGVkdWxlRWRpdG9yKHZpZXcuZWRpdG9yLCB2aWV3LmZpbGUsIFwibGF5b3V0XCIpO1xuICAgIH0pKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ0aW1lc3RhbXAtY3VycmVudC1saW5lXCIsXG4gICAgICBuYW1lOiBcIkluc2VydCB0aW1lc3RhbXAgYXQgY3VycmVudCBsaW5lXCIsXG4gICAgICBlZGl0b3JDYWxsYmFjazogKGVkaXRvcjogRWRpdG9yKSA9PiB0aGlzLnByb2Nlc3NFZGl0b3IoZWRpdG9yLCB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpLCB0cnVlLCB0cnVlKSxcbiAgICB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwicmVzY2FuLWN1cnJlbnQtbm90ZVwiLFxuICAgICAgbmFtZTogXCJSZXNjYW4gY3VycmVudCBub3RlXCIsXG4gICAgICBlZGl0b3JDYWxsYmFjazogKGVkaXRvcjogRWRpdG9yKSA9PiB0aGlzLnByb2Nlc3NFZGl0b3IoZWRpdG9yLCB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpLCB0cnVlLCBmYWxzZSksXG4gICAgfSk7XG5cbiAgICBjb25zdCB2aWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGU8TWFya2Rvd25WaWV3PihNYXJrZG93blZpZXcpO1xuICAgIGlmICh2aWV3KSB0aGlzLnNjaGVkdWxlRWRpdG9yKHZpZXcuZWRpdG9yLCB2aWV3LmZpbGUsIFwic3RhcnR1cFwiKTtcbiAgfVxuXG4gIG9udW5sb2FkKCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgdGltZXIgb2YgdGhpcy50aW1lcnMudmFsdWVzKCkpIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZXIpO1xuICAgIHRoaXMudGltZXJzLmNsZWFyKCk7XG4gIH1cblxuICBhc3luYyBsb2FkU2V0dGluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc3RvcmVkOiB1bmtub3duID0gYXdhaXQgdGhpcy5sb2FkRGF0YSgpO1xuICAgIGNvbnN0IGRhdGEgPSBpc1JlY29yZChzdG9yZWQpID8gc3RvcmVkIDoge307XG5cbiAgICB0aGlzLnNldHRpbmdzID0ge1xuICAgICAgdGltZUZvcm1hdDogdHlwZW9mIGRhdGEudGltZUZvcm1hdCA9PT0gXCJzdHJpbmdcIiAmJiBkYXRhLnRpbWVGb3JtYXQubGVuZ3RoID4gMFxuICAgICAgICA/IGRhdGEudGltZUZvcm1hdFxuICAgICAgICA6IERFRkFVTFRfU0VUVElOR1MudGltZUZvcm1hdCxcbiAgICAgIGluY2x1ZGVEYXRlOiB0eXBlb2YgZGF0YS5pbmNsdWRlRGF0ZSA9PT0gXCJib29sZWFuXCJcbiAgICAgICAgPyBkYXRhLmluY2x1ZGVEYXRlXG4gICAgICAgIDogREVGQVVMVF9TRVRUSU5HUy5pbmNsdWRlRGF0ZSxcbiAgICAgIGRhdGVGb3JtYXQ6IHR5cGVvZiBkYXRhLmRhdGVGb3JtYXQgPT09IFwic3RyaW5nXCIgJiYgZGF0YS5kYXRlRm9ybWF0Lmxlbmd0aCA+IDBcbiAgICAgICAgPyBkYXRhLmRhdGVGb3JtYXRcbiAgICAgICAgOiBERUZBVUxUX1NFVFRJTkdTLmRhdGVGb3JtYXQsXG4gICAgICBjdXN0b21TeW50YXg6IHR5cGVvZiBkYXRhLmN1c3RvbVN5bnRheCA9PT0gXCJzdHJpbmdcIiAmJiBkYXRhLmN1c3RvbVN5bnRheC5sZW5ndGggPiAwXG4gICAgICAgID8gZGF0YS5jdXN0b21TeW50YXhcbiAgICAgICAgOiBERUZBVUxUX1NFVFRJTkdTLmN1c3RvbVN5bnRheCxcbiAgICAgIGNvbnRleHRNb2RlOiBjbGFtcENvbnRleHQoZGF0YS5jb250ZXh0TW9kZSksXG4gICAgICB0cmlnZ2VyTW9kZTogZGF0YS50cmlnZ2VyTW9kZSA9PT0gXCJ0eXBpbmdcIiB8fCBkYXRhLnRyaWdnZXJNb2RlID09PSBcInBhcmFncmFwaFwiIHx8IGRhdGEudHJpZ2dlck1vZGUgPT09IFwiYm90aFwiXG4gICAgICAgID8gZGF0YS50cmlnZ2VyTW9kZVxuICAgICAgICA6IERFRkFVTFRfU0VUVElOR1MudHJpZ2dlck1vZGUsXG4gICAgICBkZWJvdW5jZU1zOiBNYXRoLm1heCgxMDAsIE1hdGgubWluKDE1MDAsIE1hdGgucm91bmQoTnVtYmVyKGRhdGEuZGVib3VuY2VNcykgfHwgREVGQVVMVF9TRVRUSU5HUy5kZWJvdW5jZU1zKSkpLFxuICAgIH07XG5cbiAgICAvLyBTdHJpY3QgbW9kZSBpcyBpbnRlbnRpb25hbGx5IGhhcmQtY29kZWQuIE9sZGVyIHN0cmljdE1vZGUgdmFsdWVzIGFyZSBpZ25vcmVkLlxuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG4gIH1cblxuICBwcml2YXRlIHN0eWxlUmVuZGVyZWRUaW1lc3RhbXBzKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgY29uc3QgdGltZXN0YW1wUmVnZXggPSBidWlsZFRpbWVzdGFtcFJlZ2V4KHRoaXMuc2V0dGluZ3MpO1xuICAgIGNvbnN0IHNlbGVjdG9yID0gXCJwLCBsaSwgYmxvY2txdW90ZSwgaDEsIGgyLCBoMywgaDQsIGg1LCBoNlwiO1xuXG4gICAgZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihzZWxlY3RvcikuZm9yRWFjaChub2RlID0+IHtcbiAgICAgIGNvbnN0IGZpcnN0ID0gbm9kZS5maXJzdENoaWxkO1xuICAgICAgaWYgKCFmaXJzdCB8fCBmaXJzdC5ub2RlVHlwZSAhPT0gTm9kZS5URVhUX05PREUgfHwgIWZpcnN0LnRleHRDb250ZW50KSByZXR1cm47XG5cbiAgICAgIGNvbnN0IHZhbHVlID0gZmlyc3QudGV4dENvbnRlbnQ7XG4gICAgICBjb25zdCBtYXRjaCA9IHZhbHVlLm1hdGNoKHRpbWVzdGFtcFJlZ2V4KTtcbiAgICAgIGlmICghbWF0Y2ggfHwgbWF0Y2hbMF0ubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgICAgIGNvbnN0IHNwYW4gPSBub2RlLmNyZWF0ZVNwYW4oe1xuICAgICAgICBjbHM6IFwidGltZWxnci1wcmV2aWV3LXRpbWVzdGFtcFwiLFxuICAgICAgICB0ZXh0OiBtYXRjaFswXSxcbiAgICAgIH0pO1xuICAgICAgZmlyc3QucmVwbGFjZVdpdGgoc3Bhbik7XG4gICAgICBpZiAodmFsdWUubGVuZ3RoID4gbWF0Y2hbMF0ubGVuZ3RoKSB7XG4gICAgICAgIHNwYW4uaW5zZXJ0QWRqYWNlbnRUZXh0KFwiYWZ0ZXJlbmRcIiwgdmFsdWUuc2xpY2UobWF0Y2hbMF0ubGVuZ3RoKSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHNjaGVkdWxlTGVhZihsZWFmOiBXb3Jrc3BhY2VMZWFmLCByZWFzb246IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICghKGxlYWYudmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldykpIHJldHVybjtcbiAgICB0aGlzLnNjaGVkdWxlRWRpdG9yKGxlYWYudmlldy5lZGl0b3IsIGxlYWYudmlldy5maWxlLCByZWFzb24pO1xuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZUVkaXRvcihlZGl0b3I6IEVkaXRvciwgZmlsZTogVEZpbGUgfCBudWxsLCByZWFzb246IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICghZmlsZSB8fCB0aGlzLnVwZGF0aW5nRWRpdG9ycy5oYXMoZWRpdG9yKSB8fCAhdGhpcy5zaG91bGRIYW5kbGVSZWFzb24ocmVhc29uKSkgcmV0dXJuO1xuICAgIGlmICghdGhpcy5pc0FjdGl2ZUVkaXRvcihlZGl0b3IsIGZpbGUpKSByZXR1cm47XG5cbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMudGltZXJzLmdldChmaWxlLnBhdGgpO1xuICAgIGlmIChleGlzdGluZykgd2luZG93LmNsZWFyVGltZW91dChleGlzdGluZyk7XG5cbiAgICBjb25zdCB0aW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMudGltZXJzLmRlbGV0ZShmaWxlLnBhdGgpO1xuICAgICAgdGhpcy5wcm9jZXNzRWRpdG9yKGVkaXRvciwgZmlsZSwgZmFsc2UsIHRydWUpO1xuICAgIH0sIHRoaXMuc2V0dGluZ3MuZGVib3VuY2VNcyk7XG5cbiAgICB0aGlzLnRpbWVycy5zZXQoZmlsZS5wYXRoLCB0aW1lcik7XG4gIH1cblxuICBwcml2YXRlIHNob3VsZEhhbmRsZVJlYXNvbihyZWFzb246IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHN3aXRjaCAodGhpcy5zZXR0aW5ncy50cmlnZ2VyTW9kZSkge1xuICAgICAgY2FzZSBcInR5cGluZ1wiOlxuICAgICAgICByZXR1cm4gcmVhc29uID09PSBcImNoYW5nZVwiIHx8IHJlYXNvbiA9PT0gXCJzdGFydHVwXCI7XG4gICAgICBjYXNlIFwicGFyYWdyYXBoXCI6XG4gICAgICAgIHJldHVybiByZWFzb24gPT09IFwiZm9jdXNcIiB8fCByZWFzb24gPT09IFwibGF5b3V0XCIgfHwgcmVhc29uID09PSBcInN0YXJ0dXBcIjtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgaXNBY3RpdmVFZGl0b3IoZWRpdG9yOiBFZGl0b3IsIGZpbGU6IFRGaWxlKTogYm9vbGVhbiB7XG4gICAgY29uc3QgdmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlPE1hcmtkb3duVmlldz4oTWFya2Rvd25WaWV3KTtcbiAgICByZXR1cm4gQm9vbGVhbih2aWV3ICYmIHZpZXcuZWRpdG9yID09PSBlZGl0b3IgJiYgdmlldy5maWxlPy5wYXRoID09PSBmaWxlLnBhdGgpO1xuICB9XG5cbiAgLyoqXG4gICAqIEF1dG9tYXRpYyBwcm9jZXNzaW5nIHdvcmtzIG9uIHRoZSBjdXJzb3IncyBsb2dpY2FsIHBhcmFncmFwaCBvbmx5LlxuICAgKiBFeHBsaWNpdCByZXNjYW4gcHJvY2Vzc2VzIGV2ZXJ5IHBhcmFncmFwaCBpbiBldmVyeSB0aW1lbGdyIHNjb3BlLlxuICAgKi9cbiAgcHJpdmF0ZSBwcm9jZXNzRWRpdG9yKGVkaXRvcjogRWRpdG9yLCBmaWxlOiBURmlsZSB8IG51bGwsIGZvcmNlOiBib29sZWFuLCBjdXJzb3JPbmx5OiBib29sZWFuKTogdm9pZCB7XG4gICAgaWYgKCFmaWxlIHx8IHRoaXMudXBkYXRpbmdFZGl0b3JzLmhhcyhlZGl0b3IpIHx8ICF0aGlzLmlzQWN0aXZlRWRpdG9yKGVkaXRvciwgZmlsZSkpIHJldHVybjtcblxuICAgIGNvbnN0IHNvdXJjZSA9IGVkaXRvci5nZXRWYWx1ZSgpO1xuICAgIGNvbnN0IGxpbmVzID0gc291cmNlLnNwbGl0KFwiXFxuXCIpO1xuICAgIGNvbnN0IHNjb3BlcyA9IGZpbmRUaW1lbGdyU2NvcGVzKGxpbmVzKTtcbiAgICBpZiAoc2NvcGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgY29uc3QgcGFyYWdyYXBocyA9IHRoaXMuZ2V0UGFyYWdyYXBocyhsaW5lcywgc2NvcGVzKTtcbiAgICBjb25zdCBjdXJzb3IgPSBlZGl0b3IuZ2V0Q3Vyc29yKCk7XG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IGN1cnNvck9ubHlcbiAgICAgID8gdGhpcy5nZXRDdXJzb3JQYXJhZ3JhcGgocGFyYWdyYXBocywgY3Vyc29yLmxpbmUpXG4gICAgICA6IHBhcmFncmFwaHM7XG5cbiAgICBpZiAoY2FuZGlkYXRlcy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAgIC8vIFRoaXMgc2V0IGlzIHVwZGF0ZWQgYXMgYSByZXNjYW4gcGxhbnMgaW5zZXJ0aW9ucy4gVGhlcmVmb3JlIHRoZSByZWxhdGl2ZVxuICAgIC8vIHJ1bGUgcmVtYWlucyB0cnVlIGV2ZW4gYmV0d2VlbiBuZXdseSBwbGFubmVkIHRpbWVzdGFtcHMuXG4gICAgY29uc3QgdGltZXN0YW1wTGluZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgICBmb3IgKGNvbnN0IHBhcmFncmFwaCBvZiBwYXJhZ3JhcGhzKSB7XG4gICAgICBmb3IgKGxldCBsaW5lID0gcGFyYWdyYXBoLnN0YXJ0OyBsaW5lIDw9IHBhcmFncmFwaC5lbmQ7IGxpbmUrKykge1xuICAgICAgICBpZiAodGhpcy5pc1RpbWVzdGFtcGVkTGluZShsaW5lc1tsaW5lXSA/PyBcIlwiKSkgdGltZXN0YW1wTGluZXMuYWRkKGxpbmUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHBsYW5uZWQ6IFBsYW5uZWRJbnNlcnRpb25bXSA9IFtdO1xuICAgIGNvbnN0IGNvbnRleHQgPSB0aGlzLnNldHRpbmdzLmNvbnRleHRNb2RlO1xuXG4gICAgZm9yIChjb25zdCBwYXJhZ3JhcGggb2YgY2FuZGlkYXRlcykge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gcGFyYWdyYXBoLnN0YXJ0O1xuICAgICAgaWYgKCFtZWFuaW5nZnVsKGxpbmVzW3RhcmdldF0gPz8gXCJcIikpIGNvbnRpbnVlO1xuICAgICAgaWYgKHRoaXMucGFyYWdyYXBoSGFzVGltZXN0YW1wKHBhcmFncmFwaCwgdGltZXN0YW1wTGluZXMpKSBjb250aW51ZTtcbiAgICAgIGlmIChjb250ZXh0ID4gMCAmJiB0aGlzLmhhc05lYXJieVRpbWVzdGFtcCh0aW1lc3RhbXBMaW5lcywgdGFyZ2V0LCBjb250ZXh0LCBsaW5lcy5sZW5ndGgsIHNjb3BlcykpIGNvbnRpbnVlO1xuXG4gICAgICBwbGFubmVkLnB1c2goeyBsaW5lOiB0YXJnZXQsIHRleHQ6IHRoaXMubWFrZVRpbWVzdGFtcChuZXcgRGF0ZSgpKSB9KTtcbiAgICAgIHRpbWVzdGFtcExpbmVzLmFkZCh0YXJnZXQpO1xuXG4gICAgICBpZiAoY3Vyc29yT25seSAmJiBmb3JjZSkgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKHBsYW5uZWQubGVuZ3RoID09PSAwKSByZXR1cm47XG4gICAgdGhpcy5hcHBseUluc2VydGlvbnMoZWRpdG9yLCBjdXJzb3IsIHBsYW5uZWQpO1xuICB9XG5cbiAgLyoqIEdyb3VwcyBjb25zZWN1dGl2ZSBub24tZW1wdHkgbGluZXM7IGJsYW5rIGxpbmVzIHNlcGFyYXRlIHBhcmFncmFwaHMuICovXG4gIHByaXZhdGUgZ2V0UGFyYWdyYXBocyhsaW5lczogc3RyaW5nW10sIHNjb3BlczogTGluZVJhbmdlW10pOiBMaW5lUmFuZ2VbXSB7XG4gICAgY29uc3QgcmVzdWx0OiBMaW5lUmFuZ2VbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBzY29wZSBvZiBzY29wZXMpIHtcbiAgICAgIGxldCBzdGFydCA9IC0xO1xuICAgICAgZm9yIChsZXQgbGluZSA9IHNjb3BlLnN0YXJ0OyBsaW5lIDw9IHNjb3BlLmVuZDsgbGluZSsrKSB7XG4gICAgICAgIGlmIChtZWFuaW5nZnVsKGxpbmVzW2xpbmVdID8/IFwiXCIpKSB7XG4gICAgICAgICAgaWYgKHN0YXJ0ID09PSAtMSkgc3RhcnQgPSBsaW5lO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXJ0ICE9PSAtMSkge1xuICAgICAgICAgIHJlc3VsdC5wdXNoKHsgc3RhcnQsIGVuZDogbGluZSAtIDEgfSk7XG4gICAgICAgICAgc3RhcnQgPSAtMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YXJ0ICE9PSAtMSkgcmVzdWx0LnB1c2goeyBzdGFydCwgZW5kOiBzY29wZS5lbmQgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0Q3Vyc29yUGFyYWdyYXBoKHBhcmFncmFwaHM6IExpbmVSYW5nZVtdLCBjdXJzb3JMaW5lOiBudW1iZXIpOiBMaW5lUmFuZ2VbXSB7XG4gICAgZm9yIChjb25zdCBwYXJhZ3JhcGggb2YgcGFyYWdyYXBocykge1xuICAgICAgaWYgKGN1cnNvckxpbmUgPj0gcGFyYWdyYXBoLnN0YXJ0ICYmIGN1cnNvckxpbmUgPD0gcGFyYWdyYXBoLmVuZCkgcmV0dXJuIFtwYXJhZ3JhcGhdO1xuICAgIH1cbiAgICByZXR1cm4gW107XG4gIH1cblxuICBwcml2YXRlIHBhcmFncmFwaEhhc1RpbWVzdGFtcChwYXJhZ3JhcGg6IExpbmVSYW5nZSwgdGltZXN0YW1wTGluZXM6IFNldDxudW1iZXI+KTogYm9vbGVhbiB7XG4gICAgZm9yIChsZXQgbGluZSA9IHBhcmFncmFwaC5zdGFydDsgbGluZSA8PSBwYXJhZ3JhcGguZW5kOyBsaW5lKyspIHtcbiAgICAgIGlmICh0aW1lc3RhbXBMaW5lcy5oYXMobGluZSkpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogUGh5c2ljYWwtbGluZSBjb250ZXh0OiBibGFuayBsaW5lcyBjb3VudCB0b3dhcmQgdGhlIGRpc3RhbmNlIGJ1dCBkbyBub3RcbiAgICogdGhlbXNlbHZlcyBibG9jayBpbnNlcnRpb24gYmVjYXVzZSB0aGV5IGFyZSBub3QgdGltZXN0YW1wZWQuXG4gICAqL1xuICBwcml2YXRlIGhhc05lYXJieVRpbWVzdGFtcChcbiAgICB0aW1lc3RhbXBMaW5lczogU2V0PG51bWJlcj4sXG4gICAgdGFyZ2V0TGluZTogbnVtYmVyLFxuICAgIGRpc3RhbmNlOiBudW1iZXIsXG4gICAgbGluZUNvdW50OiBudW1iZXIsXG4gICAgc2NvcGVzOiBMaW5lUmFuZ2VbXSxcbiAgKTogYm9vbGVhbiB7XG4gICAgZm9yIChsZXQgb2Zmc2V0ID0gMTsgb2Zmc2V0IDw9IGRpc3RhbmNlOyBvZmZzZXQrKykge1xuICAgICAgY29uc3QgYmVmb3JlID0gdGFyZ2V0TGluZSAtIG9mZnNldDtcbiAgICAgIGNvbnN0IGFmdGVyID0gdGFyZ2V0TGluZSArIG9mZnNldDtcbiAgICAgIGlmIChiZWZvcmUgPj0gMCAmJiBsaW5lSW5TY29wZXMoYmVmb3JlLCBzY29wZXMpICYmIHRpbWVzdGFtcExpbmVzLmhhcyhiZWZvcmUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChhZnRlciA8IGxpbmVDb3VudCAmJiBsaW5lSW5TY29wZXMoYWZ0ZXIsIHNjb3BlcykgJiYgdGltZXN0YW1wTGluZXMuaGFzKGFmdGVyKSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHByaXZhdGUgaXNUaW1lc3RhbXBlZExpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGJ1aWxkVGltZXN0YW1wUmVnZXgodGhpcy5zZXR0aW5ncykudGVzdChsaW5lKTtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlJbnNlcnRpb25zKGVkaXRvcjogRWRpdG9yLCBjdXJzb3I6IEN1cnNvclNuYXBzaG90LCBpbnNlcnRpb25zOiBQbGFubmVkSW5zZXJ0aW9uW10pOiB2b2lkIHtcbiAgICAvLyBSZXZlcnNlIG9yZGVyIHByZXNlcnZlcyBhbGwgb3JpZ2luYWwgbGluZSBwb3NpdGlvbnMgZHVyaW5nIGluc2VydGlvbi5cbiAgICBpbnNlcnRpb25zLnNvcnQoKGEsIGIpID0+IGIubGluZSAtIGEubGluZSk7XG5cbiAgICB0aGlzLnVwZGF0aW5nRWRpdG9ycy5hZGQoZWRpdG9yKTtcbiAgICB0cnkge1xuICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGluc2VydGlvbnMpIHtcbiAgICAgICAgZWRpdG9yLnJlcGxhY2VSYW5nZShpdGVtLnRleHQsIHsgbGluZTogaXRlbS5saW5lLCBjaDogMCB9LCB7IGxpbmU6IGl0ZW0ubGluZSwgY2g6IDAgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGN1cnNvclNoaWZ0ID0gaW5zZXJ0aW9uc1xuICAgICAgICAuZmlsdGVyKGl0ZW0gPT4gaXRlbS5saW5lID09PSBjdXJzb3IubGluZSlcbiAgICAgICAgLnJlZHVjZSgodG90YWwsIGl0ZW0pID0+IHRvdGFsICsgaXRlbS50ZXh0Lmxlbmd0aCwgMCk7XG5cbiAgICAgIGVkaXRvci5zZXRDdXJzb3IoeyBsaW5lOiBjdXJzb3IubGluZSwgY2g6IGN1cnNvci5jaCArIGN1cnNvclNoaWZ0IH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLnVwZGF0aW5nRWRpdG9ycy5kZWxldGUoZWRpdG9yKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIG1ha2VUaW1lc3RhbXAoZGF0ZTogRGF0ZSk6IHN0cmluZyB7XG4gICAgY29uc3QgdGltZSA9IGZvcm1hdFRpbWUoZGF0ZSwgdGhpcy5zZXR0aW5ncy50aW1lRm9ybWF0IHx8IERFRkFVTFRfU0VUVElOR1MudGltZUZvcm1hdCk7XG4gICAgY29uc3QgZGF0ZVRleHQgPSB0aGlzLnNldHRpbmdzLmluY2x1ZGVEYXRlXG4gICAgICA/IGZvcm1hdERhdGUoZGF0ZSwgdGhpcy5zZXR0aW5ncy5kYXRlRm9ybWF0IHx8IERFRkFVTFRfU0VUVElOR1MuZGF0ZUZvcm1hdClcbiAgICAgIDogXCJcIjtcblxuICAgIHJldHVybiAodGhpcy5zZXR0aW5ncy5jdXN0b21TeW50YXggfHwgREVGQVVMVF9TRVRUSU5HUy5jdXN0b21TeW50YXgpXG4gICAgICAucmVwbGFjZSgvXFx7VElNRVxcfS9naSwgdGltZSlcbiAgICAgIC5yZXBsYWNlKC9cXHtEQVRFXFx9L2dpLCBkYXRlVGV4dCk7XG4gIH1cbn1cblxuY2xhc3MgVGltZUxvZ2dlclNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBUaW1lTG9nZ2VyUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICB9XG5cbiAgZ2V0U2V0dGluZ0RlZmluaXRpb25zKCkge1xuICAgIHJldHVybiBbXG4gICAgICB7XG4gICAgICAgIHR5cGU6IFwiZ3JvdXBcIixcbiAgICAgICAgaGVhZGluZzogXCJUaW1lc3RhbXAgZm9ybWF0XCIsXG4gICAgICAgIGl0ZW1zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogXCJUaW1lIGZvcm1hdFwiLFxuICAgICAgICAgICAgZGVzYzogXCJUb2tlbnM6IEhIL0gsIGhoL2gsIG1tL20sIHNzL3MsIEEvYS4gT3JkaW5hcnkgdGV4dCBpcyBhbHNvIGFsbG93ZWQuXCIsXG4gICAgICAgICAgICBjb250cm9sOiB7XG4gICAgICAgICAgICAgIHR5cGU6IFwidGV4dFwiLFxuICAgICAgICAgICAgICBrZXk6IFwidGltZUZvcm1hdFwiLFxuICAgICAgICAgICAgICBwbGFjZWhvbGRlcjogXCJISDptbVwiLFxuICAgICAgICAgICAgICB2YWxpZGF0ZTogKHZhbHVlOiBzdHJpbmcpID0+IHZhbHVlLnRyaW0oKS5sZW5ndGggPiAwID8gdW5kZWZpbmVkIDogXCJUaW1lIGZvcm1hdCBjYW5ub3QgYmUgZW1wdHkuXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogXCJJbmNsdWRlIGRhdGVcIixcbiAgICAgICAgICAgIGRlc2M6IFwiQWRkIGEgZm9ybWF0dGVkIGRhdGUgdG8gdGhlIHRpbWVzdGFtcC5cIixcbiAgICAgICAgICAgIGNvbnRyb2w6IHsgdHlwZTogXCJ0b2dnbGVcIiwga2V5OiBcImluY2x1ZGVEYXRlXCIgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6IFwiRGF0ZSBmb3JtYXRcIixcbiAgICAgICAgICAgIGRlc2M6IFwiVG9rZW5zOiBZWVlZLCBZWSwgTU1NTSwgTU1NLCBNTSwgTSwgRG8sIERELCBELCBkZGRkLCBkZGQsIGQuXCIsXG4gICAgICAgICAgICB2aXNpYmxlOiAoKSA9PiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmNsdWRlRGF0ZSxcbiAgICAgICAgICAgIGNvbnRyb2w6IHtcbiAgICAgICAgICAgICAgdHlwZTogXCJ0ZXh0XCIsXG4gICAgICAgICAgICAgIGtleTogXCJkYXRlRm9ybWF0XCIsXG4gICAgICAgICAgICAgIHBsYWNlaG9sZGVyOiBcIllZWVktTU0tRERcIixcbiAgICAgICAgICAgICAgdmFsaWRhdGU6ICh2YWx1ZTogc3RyaW5nKSA9PiB2YWx1ZS50cmltKCkubGVuZ3RoID4gMCA/IHVuZGVmaW5lZCA6IFwiRGF0ZSBmb3JtYXQgY2Fubm90IGJlIGVtcHR5LlwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6IFwiQ3VzdG9tIHN5bnRheFwiLFxuICAgICAgICAgICAgZGVzYzogXCJVc2Uge1RJTUV9IGFuZCB7REFURX0uIEV4YW1wbGU6IFt7REFURX0ge1RJTUV9XTogb3IgW2F0IHtUSU1FfSBvZiBEYXldOi5cIixcbiAgICAgICAgICAgIGNvbnRyb2w6IHtcbiAgICAgICAgICAgICAgdHlwZTogXCJ0ZXh0XCIsXG4gICAgICAgICAgICAgIGtleTogXCJjdXN0b21TeW50YXhcIixcbiAgICAgICAgICAgICAgcGxhY2Vob2xkZXI6IFwiW3tUSU1FfV06IFwiLFxuICAgICAgICAgICAgICB2YWxpZGF0ZTogKHZhbHVlOiBzdHJpbmcpID0+IC9cXHtUSU1FXFx9L2kudGVzdCh2YWx1ZSkgPyB1bmRlZmluZWQgOiBcIkN1c3RvbSBzeW50YXggbXVzdCBjb250YWluIHtUSU1FfS5cIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHR5cGU6IFwiZ3JvdXBcIixcbiAgICAgICAgaGVhZGluZzogXCJJbnNlcnRpb24gYmVoYXZpb3JcIixcbiAgICAgICAgaXRlbXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiBcIlJlbGF0aXZlIGxpbmUgcHJvdGVjdGlvblwiLFxuICAgICAgICAgICAgZGVzYzogXCJDaGVjayAw4oCTNSBwaHlzaWNhbCBsaW5lcyBiZWZvcmUgYW5kIGFmdGVyLiBCbGFuayBsaW5lcyBjb3VudCB0b3dhcmQgZGlzdGFuY2UgYnV0IGFyZSBuZXZlciB0aW1lc3RhbXBlZC5cIixcbiAgICAgICAgICAgIGNvbnRyb2w6IHtcbiAgICAgICAgICAgICAgdHlwZTogXCJzbGlkZXJcIixcbiAgICAgICAgICAgICAga2V5OiBcImNvbnRleHRNb2RlXCIsXG4gICAgICAgICAgICAgIG1pbjogMCxcbiAgICAgICAgICAgICAgbWF4OiBNQVhfQ09OVEVYVCxcbiAgICAgICAgICAgICAgc3RlcDogMSxcbiAgICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiBERUZBVUxUX1NFVFRJTkdTLmNvbnRleHRNb2RlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6IFwiVHJpZ2dlciBtb2RlXCIsXG4gICAgICAgICAgICBkZXNjOiBcIlR5cGluZyByZWFjdHMgdG8gZWRpdG9yIGNoYW5nZXM7IGZvY3VzIHJlYWN0cyB3aGVuIHRoZSBhY3RpdmUgbm90ZSBjaGFuZ2VzIG9yIHRoZSBsYXlvdXQgY2hhbmdlcy5cIixcbiAgICAgICAgICAgIGNvbnRyb2w6IHtcbiAgICAgICAgICAgICAgdHlwZTogXCJkcm9wZG93blwiLFxuICAgICAgICAgICAgICBrZXk6IFwidHJpZ2dlck1vZGVcIixcbiAgICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiBERUZBVUxUX1NFVFRJTkdTLnRyaWdnZXJNb2RlLFxuICAgICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgdHlwaW5nOiBcIlR5cGluZ1wiLFxuICAgICAgICAgICAgICAgIHBhcmFncmFwaDogXCJGb2N1c1wiLFxuICAgICAgICAgICAgICAgIGJvdGg6IFwiVHlwaW5nICsgZm9jdXNcIixcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiBcIlJlc3BvbnNlIGRlYm91bmNlXCIsXG4gICAgICAgICAgICBkZXNjOiBcIkRlbGF5IGFmdGVyIGFuIGVkaXRvciBldmVudCBiZWZvcmUgZXZhbHVhdGluZyB0aGUgY3VycmVudCBsaW5lLlwiLFxuICAgICAgICAgICAgY29udHJvbDoge1xuICAgICAgICAgICAgICB0eXBlOiBcInNsaWRlclwiLFxuICAgICAgICAgICAgICBrZXk6IFwiZGVib3VuY2VNc1wiLFxuICAgICAgICAgICAgICBtaW46IDEwMCxcbiAgICAgICAgICAgICAgbWF4OiAxNTAwLFxuICAgICAgICAgICAgICBzdGVwOiA1MCxcbiAgICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiBERUZBVUxUX1NFVFRJTkdTLmRlYm91bmNlTXMsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICB0eXBlOiBcImdyb3VwXCIsXG4gICAgICAgIGhlYWRpbmc6IFwiU2NvcGVcIixcbiAgICAgICAgaXRlbXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiBcIlN0cmljdCBzY29wZVwiLFxuICAgICAgICAgICAgZGVzYzogXCJUaW1lIExvZ2dlciBvbmx5IHByb2Nlc3NlcyBjb250ZW50IGluc2lkZSBgYGB0aW1lbGdyIGZlbmNlZCBibG9ja3MuIFRoaXMgaXMgYWx3YXlzIGVuYWJsZWQuXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiBcIkJsYW5rIGxpbmVzXCIsXG4gICAgICAgICAgICBkZXNjOiBcIkJsYW5rIGxpbmVzIGFyZSBuZXZlciB0aW1lc3RhbXBlZCwgYnV0IHRoZXkgc3RpbGwgY291bnQgYXMgcGh5c2ljYWwgbGluZXMgZm9yIHJlbGF0aXZlIHByb3RlY3Rpb24uXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgXTtcbiAgfVxufVxuIl19