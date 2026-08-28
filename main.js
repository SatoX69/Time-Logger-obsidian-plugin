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
class TimeLoggerPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        this.timestampRegex = buildTimestampRegex(DEFAULT_SETTINGS);
        this.timers = new Map();
        this.updatingEditors = new WeakSet();
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            this.timestampRegex = buildTimestampRegex(this.settings);
            this.addSettingTab(new TimeLoggerSettingTab(this.app, this));
            this.registerMarkdownPostProcessor(element => this.styleRenderedTimestamps(element));
            this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
                if (leaf)
                    this.scheduleLeaf(leaf, "focus");
            }));
            this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => {
                this.scheduleEditor(editor, info.file, "change");
            }));
            this.registerEvent(this.app.workspace.on("editor-paste", (_event, editor) => {
                this.scheduleEditor(editor, this.app.workspace.getActiveFile(), "paste");
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
            this.settings = Object.assign({}, DEFAULT_SETTINGS, stored !== null && stored !== void 0 ? stored : {});
            this.settings.contextMode = clampContext(this.settings.contextMode);
            this.settings.debounceMs = Math.max(100, Math.min(1500, Math.round(Number(this.settings.debounceMs) || DEFAULT_SETTINGS.debounceMs)));
            this.settings.triggerMode = this.settings.triggerMode === "typing" || this.settings.triggerMode === "paragraph" || this.settings.triggerMode === "both"
                ? this.settings.triggerMode
                : DEFAULT_SETTINGS.triggerMode;
            // Strict mode is permanently enabled. Older saved strictMode values are ignored.
            delete this.settings.strictMode;
            yield this.saveData(this.settings);
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
            this.timestampRegex = buildTimestampRegex(this.settings);
        });
    }
    styleRenderedTimestamps(element) {
        const selector = "p, li, blockquote, h1, h2, h3, h4, h5, h6";
        element.querySelectorAll(selector).forEach(node => {
            const first = node.firstChild;
            if (!first || first.nodeType !== Node.TEXT_NODE || !first.textContent)
                return;
            const value = first.textContent;
            const match = value.match(this.timestampRegex);
            if (!match || match[0].length === 0)
                return;
            const span = document.createElement("span");
            span.className = "timelgr-preview-timestamp";
            span.textContent = match[0];
            first.replaceWith(span, document.createTextNode(value.slice(match[0].length)));
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
                return reason === "change" || reason === "paste" || reason === "startup";
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
        return this.timestampRegex.test(line);
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
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Time Logger" });
        new obsidian_1.Setting(containerEl)
            .setName("Time format")
            .setDesc("Tokens: HH/H, hh/h, mm/m, ss/s, A/a. Ordinary text is also allowed.")
            .addText(text => text
            .setPlaceholder("HH:mm")
            .setValue(this.plugin.settings.timeFormat)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.timeFormat = value || DEFAULT_SETTINGS.timeFormat;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Include date")
            .setDesc("Add a formatted date to the timestamp.")
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.includeDate)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.includeDate = value;
            yield this.plugin.saveSettings();
            this.display();
        })));
        if (this.plugin.settings.includeDate) {
            new obsidian_1.Setting(containerEl)
                .setName("Date format")
                .setDesc("Tokens: YYYY, YY, MMMM, MMM, MM, M, Do, DD, D, dddd, ddd, d.")
                .addText(text => text
                .setPlaceholder("YYYY-MM-DD")
                .setValue(this.plugin.settings.dateFormat)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.dateFormat = value || DEFAULT_SETTINGS.dateFormat;
                yield this.plugin.saveSettings();
            })));
        }
        new obsidian_1.Setting(containerEl)
            .setName("Custom syntax")
            .setDesc("Use {TIME} and {DATE}. Example: [{DATE} {TIME}]: or [at {TIME} of Day]:")
            .addText(text => text
            .setPlaceholder("[{TIME}]: ")
            .setValue(this.plugin.settings.customSyntax)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.customSyntax = value || DEFAULT_SETTINGS.customSyntax;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Relative line protection")
            .setDesc("Check 0–5 physical lines before and after. Blank lines count toward distance but are never timestamped.")
            .addDropdown(drop => drop
            .addOptions({ off: "Off", "1": "1 line", "2": "2 lines", "3": "3 lines", "4": "4 lines", "5": "5 lines" })
            .setValue(this.plugin.settings.contextMode === 0 ? "off" : String(this.plugin.settings.contextMode))
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.contextMode = value === "off" ? 0 : clampContext(value);
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Trigger mode")
            .setDesc("Typing reacts to edits; Focus reacts to focus/layout; both uses both signals.")
            .addDropdown(drop => drop
            .addOptions({ typing: "Typing", paragraph: "Focus", both: "Typing + focus" })
            .setValue(this.plugin.settings.triggerMode)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.triggerMode = value;
            yield this.plugin.saveSettings();
        })));
        new obsidian_1.Setting(containerEl)
            .setName("Response debounce")
            .setDesc("Delay after an editor event before evaluating the current paragraph. 100–1500 ms.")
            .addSlider(slider => slider
            .setLimits(100, 1500, 50)
            .setValue(this.plugin.settings.debounceMs)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.debounceMs = Math.round(value);
            yield this.plugin.saveSettings();
        })));
        const help = containerEl.createDiv("timelgr-settings-help");
        help.createEl("p", { text: "Strict scope is permanently enabled in this version." });
        help.createEl("p", { text: "Only content inside ```timelgr fenced blocks is processed." });
        help.createEl("p", { text: "Blank lines are ignored as insertion targets, but they still count when relative protection measures line distance." });
        help.createEl("p", { text: "Example:" });
        help.createEl("pre", {
            cls: "timelgr-settings-code",
            text: "```timelgr\nuser text.....\n\nnext paragraph.....\n```",
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7O0FBQUEsdUNBU2tCO0FBWWxCLE1BQU0sZ0JBQWdCLEdBQXVCO0lBQzNDLFVBQVUsRUFBRSxPQUFPO0lBQ25CLFdBQVcsRUFBRSxLQUFLO0lBQ2xCLFVBQVUsRUFBRSxZQUFZO0lBQ3hCLFlBQVksRUFBRSxZQUFZO0lBQzFCLFdBQVcsRUFBRSxDQUFDO0lBQ2QsV0FBVyxFQUFFLE1BQU07SUFDbkIsVUFBVSxFQUFFLEdBQUc7Q0FDaEIsQ0FBQztBQUVGLE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBQztBQUN0QixNQUFNLGVBQWUsR0FBRyxTQUFTLENBQUM7QUFDbEMsTUFBTSxxQkFBcUIsR0FBRyxzQkFBc0IsQ0FBQztBQUNyRCxNQUFNLFFBQVEsR0FBRyxzQkFBc0IsQ0FBQztBQUN4QyxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUM7QUFpQi9CLFNBQVMsWUFBWSxDQUFDLEtBQWE7SUFDakMsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLHFCQUFxQixFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ3RELENBQUM7QUFFRCxTQUFTLElBQUksQ0FBQyxLQUFhO0lBQ3pCLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDeEMsQ0FBQztBQUVELFNBQVMsT0FBTyxDQUFDLEtBQWE7SUFDNUIsTUFBTSxNQUFNLEdBQUcsS0FBSyxHQUFHLEdBQUcsQ0FBQztJQUMzQixJQUFJLE1BQU0sSUFBSSxFQUFFLElBQUksTUFBTSxJQUFJLEVBQUU7UUFBRSxPQUFPLEdBQUcsS0FBSyxJQUFJLENBQUM7SUFDdEQsUUFBUSxLQUFLLEdBQUcsRUFBRSxFQUFFLENBQUM7UUFDbkIsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxJQUFJLENBQUM7UUFDNUIsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxJQUFJLENBQUM7UUFDNUIsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxJQUFJLENBQUM7UUFDNUIsT0FBTyxDQUFDLENBQUMsT0FBTyxHQUFHLEtBQUssSUFBSSxDQUFDO0lBQy9CLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsSUFBVSxFQUFFLE1BQWM7SUFDNUMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQzVCLE1BQU0sR0FBRyxHQUFHLEdBQUcsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFDO0lBQzNCLE1BQU0sTUFBTSxHQUEyQjtRQUNyQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQztRQUNiLENBQUMsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ2QsRUFBRSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUM7UUFDYixDQUFDLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNkLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzNCLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzVCLEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzNCLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzVCLENBQUMsRUFBRSxHQUFHLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDMUIsQ0FBQyxFQUFFLEdBQUcsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSTtLQUMzQixDQUFDO0lBQ0YsT0FBTyxNQUFNLENBQUMsT0FBTyxDQUFDLDBCQUEwQixFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDNUUsQ0FBQztBQUVELFNBQVMsVUFBVSxDQUFDLElBQVUsRUFBRSxNQUFjO0lBQzVDLE1BQU0sTUFBTSxHQUEyQjtRQUNyQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNoQyxFQUFFLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QyxJQUFJLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUM7UUFDdkQsR0FBRyxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxDQUFDO1FBQ3ZELEVBQUUsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM3QixDQUFDLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDOUIsRUFBRSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDeEIsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDekIsRUFBRSxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDM0IsSUFBSSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDO1FBQ3pELEdBQUcsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUN6RCxDQUFDLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztLQUN6QixDQUFDO0lBQ0YsT0FBTyxNQUFNLENBQUMsT0FBTyxDQUFDLDJDQUEyQyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDN0YsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsTUFBYztJQUMxQyxNQUFNLE9BQU8sR0FBRywwQkFBMEIsQ0FBQztJQUMzQyxJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7SUFDakIsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ2IsSUFBSSxLQUE2QixDQUFDO0lBQ2xDLE1BQU0sU0FBUyxHQUEyQjtRQUN4QyxFQUFFLEVBQUUsUUFBUTtRQUNaLENBQUMsRUFBRSxVQUFVO1FBQ2IsRUFBRSxFQUFFLFFBQVE7UUFDWixDQUFDLEVBQUUsVUFBVTtRQUNiLEVBQUUsRUFBRSxRQUFRO1FBQ1osQ0FBQyxFQUFFLFVBQVU7UUFDYixFQUFFLEVBQUUsUUFBUTtRQUNaLENBQUMsRUFBRSxVQUFVO1FBQ2IsQ0FBQyxFQUFFLGlCQUFpQjtRQUNwQixDQUFDLEVBQUUsV0FBVztLQUNmLENBQUM7SUFFRixPQUFPLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUMvQyxPQUFPLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3pELE9BQU8sSUFBSSxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0IsSUFBSSxHQUFHLEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUN2QyxDQUFDO0lBQ0QsT0FBTyxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDNUMsT0FBTyxPQUFPLENBQUM7QUFDakIsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsTUFBYztJQUMxQyxNQUFNLE9BQU8sR0FBRywyQ0FBMkMsQ0FBQztJQUM1RCxJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7SUFDakIsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ2IsSUFBSSxLQUE2QixDQUFDO0lBQ2xDLE1BQU0sU0FBUyxHQUEyQjtRQUN4QyxJQUFJLEVBQUUsUUFBUTtRQUNkLEVBQUUsRUFBRSxRQUFRO1FBQ1osSUFBSSxFQUFFLFlBQVk7UUFDbEIsR0FBRyxFQUFFLFlBQVk7UUFDakIsRUFBRSxFQUFFLFFBQVE7UUFDWixDQUFDLEVBQUUsVUFBVTtRQUNiLEVBQUUsRUFBRSx5QkFBeUI7UUFDN0IsRUFBRSxFQUFFLFFBQVE7UUFDWixDQUFDLEVBQUUsVUFBVTtRQUNiLElBQUksRUFBRSxZQUFZO1FBQ2xCLEdBQUcsRUFBRSxZQUFZO1FBQ2pCLENBQUMsRUFBRSxLQUFLO0tBQ1QsQ0FBQztJQUVGLE9BQU8sQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQy9DLE9BQU8sSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDekQsT0FBTyxJQUFJLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvQixJQUFJLEdBQUcsS0FBSyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO0lBQ3ZDLENBQUM7SUFDRCxPQUFPLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUM1QyxPQUFPLE9BQU8sQ0FBQztBQUNqQixDQUFDO0FBRUQsU0FBUyxtQkFBbUIsQ0FBQyxRQUE0QjtJQUN2RCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsWUFBWSxJQUFJLGdCQUFnQixDQUFDLFlBQVksQ0FBQztJQUN0RSxNQUFNLE9BQU8sR0FBRyxtQkFBbUIsQ0FBQztJQUNwQyxJQUFJLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDdEIsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ2IsSUFBSSxLQUE2QixDQUFDO0lBRWxDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1FBQy9DLE9BQU8sSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDekQsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3JDLElBQUksS0FBSyxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ3JCLE9BQU8sSUFBSSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsVUFBVSxJQUFJLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RGLENBQUM7YUFBTSxJQUFJLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNoQyxPQUFPLElBQUksb0JBQW9CLENBQUMsUUFBUSxDQUFDLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0RixDQUFDO1FBQ0QsSUFBSSxHQUFHLEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztJQUN2QyxDQUFDO0lBRUQsT0FBTyxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFFNUMsSUFBSSxDQUFDO1FBQ0gsT0FBTyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBQUMsV0FBTSxDQUFDO1FBQ1AsT0FBTyxxQkFBcUIsQ0FBQztJQUMvQixDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLElBQVk7O0lBQ2xDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbkMsT0FBTyxPQUFPLENBQUMsS0FBSyxJQUFJLENBQUEsTUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLDBDQUFFLFdBQVcsRUFBRSxNQUFLLGVBQWUsQ0FBQyxDQUFDO0FBQ3ZFLENBQUM7QUFFRCxtRUFBbUU7QUFDbkUsU0FBUyxpQkFBaUIsQ0FBQyxLQUFlOztJQUN4QyxNQUFNLE1BQU0sR0FBZ0IsRUFBRSxDQUFDO0lBQy9CLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBRWYsS0FBSyxJQUFJLElBQUksR0FBRyxDQUFDLEVBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQztRQUMvQyxNQUFNLEtBQUssR0FBRyxNQUFBLEtBQUssQ0FBQyxJQUFJLENBQUMsbUNBQUksRUFBRSxDQUFDO1FBRWhDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDakIsSUFBSSxjQUFjLENBQUMsS0FBSyxDQUFDO2dCQUFFLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQzVDLFNBQVM7UUFDWCxDQUFDO1FBRUQsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN0IsSUFBSSxLQUFLLElBQUksSUFBSSxHQUFHLENBQUM7Z0JBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsSUFBSSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDN0QsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2IsQ0FBQztJQUNILENBQUM7SUFFRCxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLElBQVksRUFBRSxNQUFtQjtJQUNyRCxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQzNCLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxLQUFLO1lBQUUsT0FBTyxLQUFLLENBQUM7UUFDckMsSUFBSSxJQUFJLElBQUksS0FBSyxDQUFDLEdBQUc7WUFBRSxPQUFPLElBQUksQ0FBQztJQUNyQyxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsSUFBWTtJQUM5QixPQUFPLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBQ2hDLENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxLQUFjO0lBQ2xDLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzVFLENBQUM7QUFFRCxNQUFxQixnQkFBaUIsU0FBUSxpQkFBTTtJQUFwRDs7UUFDRSxhQUFRLHFCQUE0QixnQkFBZ0IsRUFBRztRQUUvQyxtQkFBYyxHQUFHLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDdkQsV0FBTSxHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO1FBQ25DLG9CQUFlLEdBQUcsSUFBSSxPQUFPLEVBQVUsQ0FBQztJQTJQbEQsQ0FBQztJQXpQTyxNQUFNOztZQUNWLE1BQU0sSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxjQUFjLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXpELElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDN0QsSUFBSSxDQUFDLDZCQUE2QixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFFckYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLEVBQUU7Z0JBQ3BFLElBQUksSUFBSTtvQkFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM3QyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0osSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsZUFBZSxFQUFFLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxFQUFFO2dCQUN6RSxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ25ELENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDSixJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7Z0JBQzFFLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzNFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDSixJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO2dCQUM3RCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxtQkFBbUIsQ0FBZSx1QkFBWSxDQUFDLENBQUM7Z0JBQ2hGLElBQUksSUFBSTtvQkFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNsRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRUosSUFBSSxDQUFDLFVBQVUsQ0FBQztnQkFDZCxFQUFFLEVBQUUsd0JBQXdCO2dCQUM1QixJQUFJLEVBQUUsa0NBQWtDO2dCQUN4QyxjQUFjLEVBQUUsQ0FBQyxNQUFjLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7YUFDL0csQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLFVBQVUsQ0FBQztnQkFDZCxFQUFFLEVBQUUscUJBQXFCO2dCQUN6QixJQUFJLEVBQUUscUJBQXFCO2dCQUMzQixjQUFjLEVBQUUsQ0FBQyxNQUFjLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUM7YUFDaEgsQ0FBQyxDQUFDO1lBRUgsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQWUsdUJBQVksQ0FBQyxDQUFDO1lBQ2hGLElBQUksSUFBSTtnQkFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNuRSxDQUFDO0tBQUE7SUFFRCxRQUFRO1FBQ04sS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRTtZQUFFLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRUssWUFBWTs7WUFDaEIsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDckMsSUFBSSxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGFBQU4sTUFBTSxjQUFOLE1BQU0sR0FBSSxFQUFFLENBQUMsQ0FBQztZQUNsRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNwRSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0SSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEtBQUssV0FBVyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxLQUFLLE1BQU07Z0JBQ3JKLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVc7Z0JBQzNCLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUM7WUFFakMsaUZBQWlGO1lBQ2pGLE9BQVEsSUFBSSxDQUFDLFFBQTBELENBQUMsVUFBVSxDQUFDO1lBQ25GLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDckMsQ0FBQztLQUFBO0lBRUssWUFBWTs7WUFDaEIsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNuQyxJQUFJLENBQUMsY0FBYyxHQUFHLG1CQUFtQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMzRCxDQUFDO0tBQUE7SUFFTyx1QkFBdUIsQ0FBQyxPQUFvQjtRQUNsRCxNQUFNLFFBQVEsR0FBRywyQ0FBMkMsQ0FBQztRQUM3RCxPQUFPLENBQUMsZ0JBQWdCLENBQWMsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzdELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7WUFDOUIsSUFBSSxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVztnQkFBRSxPQUFPO1lBRTlFLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUM7WUFDaEMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDL0MsSUFBSSxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUM7Z0JBQUUsT0FBTztZQUU1QyxNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzVDLElBQUksQ0FBQyxTQUFTLEdBQUcsMkJBQTJCLENBQUM7WUFDN0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUIsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakYsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sWUFBWSxDQUFDLElBQW1CLEVBQUUsTUFBYztRQUN0RCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxZQUFZLHVCQUFZLENBQUM7WUFBRSxPQUFPO1FBQ2pELElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDaEUsQ0FBQztJQUVPLGNBQWMsQ0FBQyxNQUFjLEVBQUUsSUFBa0IsRUFBRSxNQUFjO1FBQ3ZFLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDO1lBQUUsT0FBTztRQUMxRixJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDO1lBQUUsT0FBTztRQUUvQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDNUMsSUFBSSxRQUFRO1lBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU1QyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUNuQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNoRCxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUU3QixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFTyxrQkFBa0IsQ0FBQyxNQUFjO1FBQ3ZDLFFBQVEsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNsQyxLQUFLLFFBQVE7Z0JBQ1gsT0FBTyxNQUFNLEtBQUssUUFBUSxJQUFJLE1BQU0sS0FBSyxPQUFPLElBQUksTUFBTSxLQUFLLFNBQVMsQ0FBQztZQUMzRSxLQUFLLFdBQVc7Z0JBQ2QsT0FBTyxNQUFNLEtBQUssT0FBTyxJQUFJLE1BQU0sS0FBSyxRQUFRLElBQUksTUFBTSxLQUFLLFNBQVMsQ0FBQztZQUMzRTtnQkFDRSxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDO0lBQ0gsQ0FBQztJQUVPLGNBQWMsQ0FBQyxNQUFjLEVBQUUsSUFBVzs7UUFDaEQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQWUsdUJBQVksQ0FBQyxDQUFDO1FBQ2hGLE9BQU8sT0FBTyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLE1BQU0sSUFBSSxDQUFBLE1BQUEsSUFBSSxDQUFDLElBQUksMENBQUUsSUFBSSxNQUFLLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNsRixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssYUFBYSxDQUFDLE1BQWMsRUFBRSxJQUFrQixFQUFFLEtBQWMsRUFBRSxVQUFtQjs7UUFDM0YsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQztZQUFFLE9BQU87UUFFNUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakMsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDeEMsSUFBSSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUM7WUFBRSxPQUFPO1FBRWhDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3JELE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNsQyxNQUFNLFVBQVUsR0FBRyxVQUFVO1lBQzNCLENBQUMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDbEQsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUVmLElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDO1lBQUUsT0FBTztRQUVwQywyRUFBMkU7UUFDM0UsMkRBQTJEO1FBQzNELE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFDekMsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNuQyxLQUFLLElBQUksSUFBSSxHQUFHLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQztnQkFDL0QsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBQSxLQUFLLENBQUMsSUFBSSxDQUFDLG1DQUFJLEVBQUUsQ0FBQztvQkFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzFFLENBQUM7UUFDSCxDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQXVCLEVBQUUsQ0FBQztRQUN2QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztRQUUxQyxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ25DLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUM7WUFDL0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFBLEtBQUssQ0FBQyxNQUFNLENBQUMsbUNBQUksRUFBRSxDQUFDO2dCQUFFLFNBQVM7WUFDL0MsSUFBSSxJQUFJLENBQUMscUJBQXFCLENBQUMsU0FBUyxFQUFFLGNBQWMsQ0FBQztnQkFBRSxTQUFTO1lBQ3BFLElBQUksT0FBTyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsY0FBYyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7Z0JBQUUsU0FBUztZQUU1RyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3JFLGNBQWMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFM0IsSUFBSSxVQUFVLElBQUksS0FBSztnQkFBRSxNQUFNO1FBQ2pDLENBQUM7UUFFRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQztZQUFFLE9BQU87UUFDakMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCwyRUFBMkU7SUFDbkUsYUFBYSxDQUFDLEtBQWUsRUFBRSxNQUFtQjs7UUFDeEQsTUFBTSxNQUFNLEdBQWdCLEVBQUUsQ0FBQztRQUUvQixLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQzNCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2YsS0FBSyxJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsS0FBSyxFQUFFLElBQUksSUFBSSxLQUFLLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUM7Z0JBQ3ZELElBQUksVUFBVSxDQUFDLE1BQUEsS0FBSyxDQUFDLElBQUksQ0FBQyxtQ0FBSSxFQUFFLENBQUMsRUFBRSxDQUFDO29CQUNsQyxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUM7d0JBQUUsS0FBSyxHQUFHLElBQUksQ0FBQztnQkFDakMsQ0FBQztxQkFBTSxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUN4QixNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDdEMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNiLENBQUM7WUFDSCxDQUFDO1lBQ0QsSUFBSSxLQUFLLEtBQUssQ0FBQyxDQUFDO2dCQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQzNELENBQUM7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRU8sa0JBQWtCLENBQUMsVUFBdUIsRUFBRSxVQUFrQjtRQUNwRSxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ25DLElBQUksVUFBVSxJQUFJLFNBQVMsQ0FBQyxLQUFLLElBQUksVUFBVSxJQUFJLFNBQVMsQ0FBQyxHQUFHO2dCQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN2RixDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUM7SUFDWixDQUFDO0lBRU8scUJBQXFCLENBQUMsU0FBb0IsRUFBRSxjQUEyQjtRQUM3RSxLQUFLLElBQUksSUFBSSxHQUFHLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUMvRCxJQUFJLGNBQWMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1FBQzVDLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7SUFFRDs7O09BR0c7SUFDSyxrQkFBa0IsQ0FDeEIsY0FBMkIsRUFDM0IsVUFBa0IsRUFDbEIsUUFBZ0IsRUFDaEIsU0FBaUIsRUFDakIsTUFBbUI7UUFFbkIsS0FBSyxJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUUsTUFBTSxJQUFJLFFBQVEsRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDO1lBQ2xELE1BQU0sTUFBTSxHQUFHLFVBQVUsR0FBRyxNQUFNLENBQUM7WUFDbkMsTUFBTSxLQUFLLEdBQUcsVUFBVSxHQUFHLE1BQU0sQ0FBQztZQUNsQyxJQUFJLE1BQU0sSUFBSSxDQUFDLElBQUksWUFBWSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsSUFBSSxjQUFjLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQztnQkFBRSxPQUFPLElBQUksQ0FBQztZQUMzRixJQUFJLEtBQUssR0FBRyxTQUFTLElBQUksWUFBWSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxjQUFjLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQztnQkFBRSxPQUFPLElBQUksQ0FBQztRQUNqRyxDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0lBRU8saUJBQWlCLENBQUMsSUFBWTtRQUNwQyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFTyxlQUFlLENBQUMsTUFBYyxFQUFFLE1BQXNCLEVBQUUsVUFBOEI7UUFDNUYsd0VBQXdFO1FBQ3hFLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUUzQyxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqQyxJQUFJLENBQUM7WUFDSCxLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUM5QixNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN6RixDQUFDO1lBRUQsTUFBTSxXQUFXLEdBQUcsVUFBVTtpQkFDM0IsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDO2lCQUN6QyxNQUFNLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFeEQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxNQUFNLENBQUMsRUFBRSxHQUFHLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDdkUsQ0FBQztnQkFBUyxDQUFDO1lBQ1QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEMsQ0FBQztJQUNILENBQUM7SUFFTyxhQUFhLENBQUMsSUFBVTtRQUM5QixNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxJQUFJLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3ZGLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVztZQUN4QyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUM7WUFDM0UsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUVQLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksSUFBSSxnQkFBZ0IsQ0FBQyxZQUFZLENBQUM7YUFDakUsT0FBTyxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUM7YUFDM0IsT0FBTyxDQUFDLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNyQyxDQUFDO0NBQ0Y7QUFoUUQsbUNBZ1FDO0FBRUQsTUFBTSxvQkFBcUIsU0FBUSwyQkFBZ0I7SUFDakQsWUFBWSxHQUFRLEVBQVUsTUFBd0I7UUFDcEQsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztRQURTLFdBQU0sR0FBTixNQUFNLENBQWtCO0lBRXRELENBQUM7SUFFRCxPQUFPO1FBQ0wsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQztRQUM3QixXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDcEIsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQztRQUVwRCxJQUFJLGtCQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxhQUFhLENBQUM7YUFDdEIsT0FBTyxDQUFDLHFFQUFxRSxDQUFDO2FBQzlFLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7YUFDbEIsY0FBYyxDQUFDLE9BQU8sQ0FBQzthQUN2QixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO2FBQ3pDLFFBQVEsQ0FBQyxDQUFPLEtBQWEsRUFBRSxFQUFFO1lBQ2hDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxLQUFLLElBQUksZ0JBQWdCLENBQUMsVUFBVSxDQUFDO1lBQ3ZFLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7UUFFUixJQUFJLGtCQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxjQUFjLENBQUM7YUFDdkIsT0FBTyxDQUFDLHdDQUF3QyxDQUFDO2FBQ2pELFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU07YUFDeEIsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQzthQUMxQyxRQUFRLENBQUMsQ0FBTyxLQUFjLEVBQUUsRUFBRTtZQUNqQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1lBQ3pDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakIsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBRVIsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNyQyxJQUFJLGtCQUFPLENBQUMsV0FBVyxDQUFDO2lCQUNyQixPQUFPLENBQUMsYUFBYSxDQUFDO2lCQUN0QixPQUFPLENBQUMsOERBQThELENBQUM7aUJBQ3ZFLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7aUJBQ2xCLGNBQWMsQ0FBQyxZQUFZLENBQUM7aUJBQzVCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7aUJBQ3pDLFFBQVEsQ0FBQyxDQUFPLEtBQWEsRUFBRSxFQUFFO2dCQUNoQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsS0FBSyxJQUFJLGdCQUFnQixDQUFDLFVBQVUsQ0FBQztnQkFDdkUsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ25DLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUNWLENBQUM7UUFFRCxJQUFJLGtCQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxlQUFlLENBQUM7YUFDeEIsT0FBTyxDQUFDLHlFQUF5RSxDQUFDO2FBQ2xGLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7YUFDbEIsY0FBYyxDQUFDLFlBQVksQ0FBQzthQUM1QixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDO2FBQzNDLFFBQVEsQ0FBQyxDQUFPLEtBQWEsRUFBRSxFQUFFO1lBQ2hDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksR0FBRyxLQUFLLElBQUksZ0JBQWdCLENBQUMsWUFBWSxDQUFDO1lBQzNFLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7UUFFUixJQUFJLGtCQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQzthQUNuQyxPQUFPLENBQUMseUdBQXlHLENBQUM7YUFDbEgsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTthQUN0QixVQUFVLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxDQUFDO2FBQ3pHLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQzthQUNuRyxRQUFRLENBQUMsQ0FBTyxLQUFhLEVBQUUsRUFBRTtZQUNoQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEdBQUcsS0FBSyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDN0UsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUVSLElBQUksa0JBQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLGNBQWMsQ0FBQzthQUN2QixPQUFPLENBQUMsK0VBQStFLENBQUM7YUFDeEYsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTthQUN0QixVQUFVLENBQUMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFFLENBQUM7YUFDNUUsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQzthQUMxQyxRQUFRLENBQUMsQ0FBTyxLQUFhLEVBQUUsRUFBRTtZQUNoQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEdBQUcsS0FBMEMsQ0FBQztZQUM5RSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbkMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBRVIsSUFBSSxrQkFBTyxDQUFDLFdBQVcsQ0FBQzthQUNyQixPQUFPLENBQUMsbUJBQW1CLENBQUM7YUFDNUIsT0FBTyxDQUFDLG1GQUFtRixDQUFDO2FBQzVGLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU07YUFDeEIsU0FBUyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO2FBQ3hCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7YUFDekMsaUJBQWlCLEVBQUU7YUFDbkIsUUFBUSxDQUFDLENBQU8sS0FBYSxFQUFFLEVBQUU7WUFDaEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDcEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ25DLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUVSLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUM1RCxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxzREFBc0QsRUFBRSxDQUFDLENBQUM7UUFDckYsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsNERBQTRELEVBQUUsQ0FBQyxDQUFDO1FBQzNGLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLHFIQUFxSCxFQUFFLENBQUMsQ0FBQztRQUNwSixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFO1lBQ25CLEdBQUcsRUFBRSx1QkFBdUI7WUFDNUIsSUFBSSxFQUFFLHdEQUF3RDtTQUMvRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBBcHAsXG4gIEVkaXRvcixcbiAgTWFya2Rvd25WaWV3LFxuICBQbHVnaW4sXG4gIFBsdWdpblNldHRpbmdUYWIsXG4gIFNldHRpbmcsXG4gIFRGaWxlLFxuICBXb3Jrc3BhY2VMZWFmLFxufSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW50ZXJmYWNlIFRpbWVMb2dnZXJTZXR0aW5ncyB7XG4gIHRpbWVGb3JtYXQ6IHN0cmluZztcbiAgaW5jbHVkZURhdGU6IGJvb2xlYW47XG4gIGRhdGVGb3JtYXQ6IHN0cmluZztcbiAgY3VzdG9tU3ludGF4OiBzdHJpbmc7XG4gIGNvbnRleHRNb2RlOiBudW1iZXI7XG4gIHRyaWdnZXJNb2RlOiBcInR5cGluZ1wiIHwgXCJwYXJhZ3JhcGhcIiB8IFwiYm90aFwiO1xuICBkZWJvdW5jZU1zOiBudW1iZXI7XG59XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFRpbWVMb2dnZXJTZXR0aW5ncyA9IHtcbiAgdGltZUZvcm1hdDogXCJISDptbVwiLFxuICBpbmNsdWRlRGF0ZTogZmFsc2UsXG4gIGRhdGVGb3JtYXQ6IFwiWVlZWS1NTS1ERFwiLFxuICBjdXN0b21TeW50YXg6IFwiW3tUSU1FfV06IFwiLFxuICBjb250ZXh0TW9kZTogMSxcbiAgdHJpZ2dlck1vZGU6IFwiYm90aFwiLFxuICBkZWJvdW5jZU1zOiAyNTAsXG59O1xuXG5jb25zdCBNQVhfQ09OVEVYVCA9IDU7XG5jb25zdCBTVFJJQ1RfTEFOR1VBR0UgPSBcInRpbWVsZ3JcIjtcbmNvbnN0IFRJTUVTVEFNUF9GQUxMQkFDS19SRSA9IC9eXFxzKlxcW1teXFxdXFxuXStcXF06XFxzKi87XG5jb25zdCBGRU5DRV9SRSA9IC9eXFxzKmBgYChbXlxcc2BdKilcXHMqJC87XG5jb25zdCBBTllfRkVOQ0VfUkUgPSAvXlxccypgYGAvO1xuXG5pbnRlcmZhY2UgTGluZVJhbmdlIHtcbiAgc3RhcnQ6IG51bWJlcjtcbiAgZW5kOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQbGFubmVkSW5zZXJ0aW9uIHtcbiAgbGluZTogbnVtYmVyO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDdXJzb3JTbmFwc2hvdCB7XG4gIGxpbmU6IG51bWJlcjtcbiAgY2g6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gZXNjYXBlUmVnRXhwKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xufVxuXG5mdW5jdGlvbiBwYWQyKHZhbHVlOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gU3RyaW5nKHZhbHVlKS5wYWRTdGFydCgyLCBcIjBcIik7XG59XG5cbmZ1bmN0aW9uIG9yZGluYWwodmFsdWU6IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IG1vZDEwMCA9IHZhbHVlICUgMTAwO1xuICBpZiAobW9kMTAwID49IDExICYmIG1vZDEwMCA8PSAxMykgcmV0dXJuIGAke3ZhbHVlfXRoYDtcbiAgc3dpdGNoICh2YWx1ZSAlIDEwKSB7XG4gICAgY2FzZSAxOiByZXR1cm4gYCR7dmFsdWV9c3RgO1xuICAgIGNhc2UgMjogcmV0dXJuIGAke3ZhbHVlfW5kYDtcbiAgICBjYXNlIDM6IHJldHVybiBgJHt2YWx1ZX1yZGA7XG4gICAgZGVmYXVsdDogcmV0dXJuIGAke3ZhbHVlfXRoYDtcbiAgfVxufVxuXG5mdW5jdGlvbiBmb3JtYXRUaW1lKGRhdGU6IERhdGUsIGZvcm1hdDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgaDI0ID0gZGF0ZS5nZXRIb3VycygpO1xuICBjb25zdCBoMTIgPSBoMjQgJSAxMiB8fCAxMjtcbiAgY29uc3QgdG9rZW5zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIEhIOiBwYWQyKGgyNCksXG4gICAgSDogU3RyaW5nKGgyNCksXG4gICAgaGg6IHBhZDIoaDEyKSxcbiAgICBoOiBTdHJpbmcoaDEyKSxcbiAgICBtbTogcGFkMihkYXRlLmdldE1pbnV0ZXMoKSksXG4gICAgbTogU3RyaW5nKGRhdGUuZ2V0TWludXRlcygpKSxcbiAgICBzczogcGFkMihkYXRlLmdldFNlY29uZHMoKSksXG4gICAgczogU3RyaW5nKGRhdGUuZ2V0U2Vjb25kcygpKSxcbiAgICBBOiBoMjQgPj0gMTIgPyBcIlBNXCIgOiBcIkFNXCIsXG4gICAgYTogaDI0ID49IDEyID8gXCJwbVwiIDogXCJhbVwiLFxuICB9O1xuICByZXR1cm4gZm9ybWF0LnJlcGxhY2UoL0hIfGhofG1tfHNzfEF8YXxIfGh8bXxzL2csIHRva2VuID0+IHRva2Vuc1t0b2tlbl0pO1xufVxuXG5mdW5jdGlvbiBmb3JtYXREYXRlKGRhdGU6IERhdGUsIGZvcm1hdDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgdG9rZW5zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIFlZWVk6IFN0cmluZyhkYXRlLmdldEZ1bGxZZWFyKCkpLFxuICAgIFlZOiBTdHJpbmcoZGF0ZS5nZXRGdWxsWWVhcigpKS5zbGljZSgtMiksXG4gICAgTU1NTTogZGF0ZS50b0xvY2FsZVN0cmluZyh1bmRlZmluZWQsIHsgbW9udGg6IFwibG9uZ1wiIH0pLFxuICAgIE1NTTogZGF0ZS50b0xvY2FsZVN0cmluZyh1bmRlZmluZWQsIHsgbW9udGg6IFwic2hvcnRcIiB9KSxcbiAgICBNTTogcGFkMihkYXRlLmdldE1vbnRoKCkgKyAxKSxcbiAgICBNOiBTdHJpbmcoZGF0ZS5nZXRNb250aCgpICsgMSksXG4gICAgREQ6IHBhZDIoZGF0ZS5nZXREYXRlKCkpLFxuICAgIEQ6IFN0cmluZyhkYXRlLmdldERhdGUoKSksXG4gICAgRG86IG9yZGluYWwoZGF0ZS5nZXREYXRlKCkpLFxuICAgIGRkZGQ6IGRhdGUudG9Mb2NhbGVTdHJpbmcodW5kZWZpbmVkLCB7IHdlZWtkYXk6IFwibG9uZ1wiIH0pLFxuICAgIGRkZDogZGF0ZS50b0xvY2FsZVN0cmluZyh1bmRlZmluZWQsIHsgd2Vla2RheTogXCJzaG9ydFwiIH0pLFxuICAgIGQ6IFN0cmluZyhkYXRlLmdldERheSgpKSxcbiAgfTtcbiAgcmV0dXJuIGZvcm1hdC5yZXBsYWNlKC9ZWVlZfE1NTU18TU1NfFlZfE1NfERvfEREfGRkZGR8ZGRkfE18RHxkL2csIHRva2VuID0+IHRva2Vuc1t0b2tlbl0pO1xufVxuXG5mdW5jdGlvbiBidWlsZFRpbWVGb3JtYXRSZWdleChmb3JtYXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHRva2VuUmUgPSAvSEh8aGh8bW18c3N8QXxhfEh8aHxtfHMvZztcbiAgbGV0IHBhdHRlcm4gPSBcIlwiO1xuICBsZXQgbGFzdCA9IDA7XG4gIGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcbiAgY29uc3QgZnJhZ21lbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIEhIOiBcIlxcXFxkezJ9XCIsXG4gICAgSDogXCJcXFxcZHsxLDJ9XCIsXG4gICAgaGg6IFwiXFxcXGR7Mn1cIixcbiAgICBoOiBcIlxcXFxkezEsMn1cIixcbiAgICBtbTogXCJcXFxcZHsyfVwiLFxuICAgIG06IFwiXFxcXGR7MSwyfVwiLFxuICAgIHNzOiBcIlxcXFxkezJ9XCIsXG4gICAgczogXCJcXFxcZHsxLDJ9XCIsXG4gICAgQTogXCIoPzpBTXxQTXxhbXxwbSlcIixcbiAgICBhOiBcIig/OmFtfHBtKVwiLFxuICB9O1xuXG4gIHdoaWxlICgobWF0Y2ggPSB0b2tlblJlLmV4ZWMoZm9ybWF0KSkgIT09IG51bGwpIHtcbiAgICBwYXR0ZXJuICs9IGVzY2FwZVJlZ0V4cChmb3JtYXQuc2xpY2UobGFzdCwgbWF0Y2guaW5kZXgpKTtcbiAgICBwYXR0ZXJuICs9IGZyYWdtZW50c1ttYXRjaFswXV07XG4gICAgbGFzdCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuICB9XG4gIHBhdHRlcm4gKz0gZXNjYXBlUmVnRXhwKGZvcm1hdC5zbGljZShsYXN0KSk7XG4gIHJldHVybiBwYXR0ZXJuO1xufVxuXG5mdW5jdGlvbiBidWlsZERhdGVGb3JtYXRSZWdleChmb3JtYXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHRva2VuUmUgPSAvWVlZWXxNTU1NfE1NTXxZWXxNTXxEb3xERHxkZGRkfGRkZHxNfER8ZC9nO1xuICBsZXQgcGF0dGVybiA9IFwiXCI7XG4gIGxldCBsYXN0ID0gMDtcbiAgbGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuICBjb25zdCBmcmFnbWVudHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgWVlZWTogXCJcXFxcZHs0fVwiLFxuICAgIFlZOiBcIlxcXFxkezJ9XCIsXG4gICAgTU1NTTogXCJbXlxcXFxkXFxcXG5dK1wiLFxuICAgIE1NTTogXCJbXlxcXFxkXFxcXG5dK1wiLFxuICAgIE1NOiBcIlxcXFxkezJ9XCIsXG4gICAgTTogXCJcXFxcZHsxLDJ9XCIsXG4gICAgRG86IFwiXFxcXGR7MSwyfSg/OnN0fG5kfHJkfHRoKVwiLFxuICAgIEREOiBcIlxcXFxkezJ9XCIsXG4gICAgRDogXCJcXFxcZHsxLDJ9XCIsXG4gICAgZGRkZDogXCJbXlxcXFxkXFxcXG5dK1wiLFxuICAgIGRkZDogXCJbXlxcXFxkXFxcXG5dK1wiLFxuICAgIGQ6IFwiXFxcXGRcIixcbiAgfTtcblxuICB3aGlsZSAoKG1hdGNoID0gdG9rZW5SZS5leGVjKGZvcm1hdCkpICE9PSBudWxsKSB7XG4gICAgcGF0dGVybiArPSBlc2NhcGVSZWdFeHAoZm9ybWF0LnNsaWNlKGxhc3QsIG1hdGNoLmluZGV4KSk7XG4gICAgcGF0dGVybiArPSBmcmFnbWVudHNbbWF0Y2hbMF1dO1xuICAgIGxhc3QgPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgfVxuICBwYXR0ZXJuICs9IGVzY2FwZVJlZ0V4cChmb3JtYXQuc2xpY2UobGFzdCkpO1xuICByZXR1cm4gcGF0dGVybjtcbn1cblxuZnVuY3Rpb24gYnVpbGRUaW1lc3RhbXBSZWdleChzZXR0aW5nczogVGltZUxvZ2dlclNldHRpbmdzKTogUmVnRXhwIHtcbiAgY29uc3Qgc3ludGF4ID0gc2V0dGluZ3MuY3VzdG9tU3ludGF4IHx8IERFRkFVTFRfU0VUVElOR1MuY3VzdG9tU3ludGF4O1xuICBjb25zdCB0b2tlblJlID0gL1xceyhUSU1FfERBVEUpXFx9L2dpO1xuICBsZXQgcGF0dGVybiA9IFwiXlxcXFxzKlwiO1xuICBsZXQgbGFzdCA9IDA7XG4gIGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblxuICB3aGlsZSAoKG1hdGNoID0gdG9rZW5SZS5leGVjKHN5bnRheCkpICE9PSBudWxsKSB7XG4gICAgcGF0dGVybiArPSBlc2NhcGVSZWdFeHAoc3ludGF4LnNsaWNlKGxhc3QsIG1hdGNoLmluZGV4KSk7XG4gICAgY29uc3QgdG9rZW4gPSBtYXRjaFsxXS50b1VwcGVyQ2FzZSgpO1xuICAgIGlmICh0b2tlbiA9PT0gXCJUSU1FXCIpIHtcbiAgICAgIHBhdHRlcm4gKz0gYnVpbGRUaW1lRm9ybWF0UmVnZXgoc2V0dGluZ3MudGltZUZvcm1hdCB8fCBERUZBVUxUX1NFVFRJTkdTLnRpbWVGb3JtYXQpO1xuICAgIH0gZWxzZSBpZiAoc2V0dGluZ3MuaW5jbHVkZURhdGUpIHtcbiAgICAgIHBhdHRlcm4gKz0gYnVpbGREYXRlRm9ybWF0UmVnZXgoc2V0dGluZ3MuZGF0ZUZvcm1hdCB8fCBERUZBVUxUX1NFVFRJTkdTLmRhdGVGb3JtYXQpO1xuICAgIH1cbiAgICBsYXN0ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XG4gIH1cblxuICBwYXR0ZXJuICs9IGVzY2FwZVJlZ0V4cChzeW50YXguc2xpY2UobGFzdCkpO1xuXG4gIHRyeSB7XG4gICAgcmV0dXJuIG5ldyBSZWdFeHAocGF0dGVybik7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBUSU1FU1RBTVBfRkFMTEJBQ0tfUkU7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNUaW1lbGdyRmVuY2UobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaChGRU5DRV9SRSk7XG4gIHJldHVybiBCb29sZWFuKG1hdGNoICYmIG1hdGNoWzFdPy50b0xvd2VyQ2FzZSgpID09PSBTVFJJQ1RfTEFOR1VBR0UpO1xufVxuXG4vKiogSW5jbHVzaXZlIGNvbnRlbnQtbGluZSByYW5nZXMgaW5zaWRlIGV2ZXJ5IGBgYHRpbWVsZ3IgZmVuY2UuICovXG5mdW5jdGlvbiBmaW5kVGltZWxnclNjb3BlcyhsaW5lczogc3RyaW5nW10pOiBMaW5lUmFuZ2VbXSB7XG4gIGNvbnN0IHNjb3BlczogTGluZVJhbmdlW10gPSBbXTtcbiAgbGV0IHN0YXJ0ID0gLTE7XG5cbiAgZm9yIChsZXQgbGluZSA9IDA7IGxpbmUgPCBsaW5lcy5sZW5ndGg7IGxpbmUrKykge1xuICAgIGNvbnN0IHZhbHVlID0gbGluZXNbbGluZV0gPz8gXCJcIjtcblxuICAgIGlmIChzdGFydCA9PT0gLTEpIHtcbiAgICAgIGlmIChpc1RpbWVsZ3JGZW5jZSh2YWx1ZSkpIHN0YXJ0ID0gbGluZSArIDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoQU5ZX0ZFTkNFX1JFLnRlc3QodmFsdWUpKSB7XG4gICAgICBpZiAoc3RhcnQgPD0gbGluZSAtIDEpIHNjb3Blcy5wdXNoKHsgc3RhcnQsIGVuZDogbGluZSAtIDEgfSk7XG4gICAgICBzdGFydCA9IC0xO1xuICAgIH1cbiAgfVxuXG4gIGlmIChzdGFydCAhPT0gLTEgJiYgc3RhcnQgPCBsaW5lcy5sZW5ndGgpIHtcbiAgICBzY29wZXMucHVzaCh7IHN0YXJ0LCBlbmQ6IGxpbmVzLmxlbmd0aCAtIDEgfSk7XG4gIH1cblxuICByZXR1cm4gc2NvcGVzO1xufVxuXG5mdW5jdGlvbiBsaW5lSW5TY29wZXMobGluZTogbnVtYmVyLCBzY29wZXM6IExpbmVSYW5nZVtdKTogYm9vbGVhbiB7XG4gIGZvciAoY29uc3Qgc2NvcGUgb2Ygc2NvcGVzKSB7XG4gICAgaWYgKGxpbmUgPCBzY29wZS5zdGFydCkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChsaW5lIDw9IHNjb3BlLmVuZCkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBtZWFuaW5nZnVsKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gbGluZS50cmltKCkubGVuZ3RoID4gMDtcbn1cblxuZnVuY3Rpb24gY2xhbXBDb250ZXh0KHZhbHVlOiB1bmtub3duKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KDAsIE1hdGgubWluKE1BWF9DT05URVhULCBNYXRoLnJvdW5kKE51bWJlcih2YWx1ZSkgfHwgMCkpKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVGltZUxvZ2dlclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIHNldHRpbmdzOiBUaW1lTG9nZ2VyU2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MgfTtcblxuICBwcml2YXRlIHRpbWVzdGFtcFJlZ2V4ID0gYnVpbGRUaW1lc3RhbXBSZWdleChERUZBVUxUX1NFVFRJTkdTKTtcbiAgcHJpdmF0ZSB0aW1lcnMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBwcml2YXRlIHVwZGF0aW5nRWRpdG9ycyA9IG5ldyBXZWFrU2V0PEVkaXRvcj4oKTtcblxuICBhc3luYyBvbmxvYWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcbiAgICB0aGlzLnRpbWVzdGFtcFJlZ2V4ID0gYnVpbGRUaW1lc3RhbXBSZWdleCh0aGlzLnNldHRpbmdzKTtcblxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgVGltZUxvZ2dlclNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Qb3N0UHJvY2Vzc29yKGVsZW1lbnQgPT4gdGhpcy5zdHlsZVJlbmRlcmVkVGltZXN0YW1wcyhlbGVtZW50KSk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwiYWN0aXZlLWxlYWYtY2hhbmdlXCIsIGxlYWYgPT4ge1xuICAgICAgaWYgKGxlYWYpIHRoaXMuc2NoZWR1bGVMZWFmKGxlYWYsIFwiZm9jdXNcIik7XG4gICAgfSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItY2hhbmdlXCIsIChlZGl0b3IsIGluZm8pID0+IHtcbiAgICAgIHRoaXMuc2NoZWR1bGVFZGl0b3IoZWRpdG9yLCBpbmZvLmZpbGUsIFwiY2hhbmdlXCIpO1xuICAgIH0pKTtcbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLXBhc3RlXCIsIChfZXZlbnQsIGVkaXRvcikgPT4ge1xuICAgICAgdGhpcy5zY2hlZHVsZUVkaXRvcihlZGl0b3IsIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCksIFwicGFzdGVcIik7XG4gICAgfSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJsYXlvdXQtY2hhbmdlXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZTxNYXJrZG93blZpZXc+KE1hcmtkb3duVmlldyk7XG4gICAgICBpZiAodmlldykgdGhpcy5zY2hlZHVsZUVkaXRvcih2aWV3LmVkaXRvciwgdmlldy5maWxlLCBcImxheW91dFwiKTtcbiAgICB9KSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidGltZXN0YW1wLWN1cnJlbnQtbGluZVwiLFxuICAgICAgbmFtZTogXCJJbnNlcnQgdGltZXN0YW1wIGF0IGN1cnJlbnQgbGluZVwiLFxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IChlZGl0b3I6IEVkaXRvcikgPT4gdGhpcy5wcm9jZXNzRWRpdG9yKGVkaXRvciwgdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKSwgdHJ1ZSwgdHJ1ZSksXG4gICAgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInJlc2Nhbi1jdXJyZW50LW5vdGVcIixcbiAgICAgIG5hbWU6IFwiUmVzY2FuIGN1cnJlbnQgbm90ZVwiLFxuICAgICAgZWRpdG9yQ2FsbGJhY2s6IChlZGl0b3I6IEVkaXRvcikgPT4gdGhpcy5wcm9jZXNzRWRpdG9yKGVkaXRvciwgdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKSwgdHJ1ZSwgZmFsc2UpLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlPE1hcmtkb3duVmlldz4oTWFya2Rvd25WaWV3KTtcbiAgICBpZiAodmlldykgdGhpcy5zY2hlZHVsZUVkaXRvcih2aWV3LmVkaXRvciwgdmlldy5maWxlLCBcInN0YXJ0dXBcIik7XG4gIH1cblxuICBvbnVubG9hZCgpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IHRpbWVyIG9mIHRoaXMudGltZXJzLnZhbHVlcygpKSB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICB0aGlzLnRpbWVycy5jbGVhcigpO1xuICB9XG5cbiAgYXN5bmMgbG9hZFNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHN0b3JlZCA9IGF3YWl0IHRoaXMubG9hZERhdGEoKTtcbiAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgc3RvcmVkID8/IHt9KTtcbiAgICB0aGlzLnNldHRpbmdzLmNvbnRleHRNb2RlID0gY2xhbXBDb250ZXh0KHRoaXMuc2V0dGluZ3MuY29udGV4dE1vZGUpO1xuICAgIHRoaXMuc2V0dGluZ3MuZGVib3VuY2VNcyA9IE1hdGgubWF4KDEwMCwgTWF0aC5taW4oMTUwMCwgTWF0aC5yb3VuZChOdW1iZXIodGhpcy5zZXR0aW5ncy5kZWJvdW5jZU1zKSB8fCBERUZBVUxUX1NFVFRJTkdTLmRlYm91bmNlTXMpKSk7XG4gICAgdGhpcy5zZXR0aW5ncy50cmlnZ2VyTW9kZSA9IHRoaXMuc2V0dGluZ3MudHJpZ2dlck1vZGUgPT09IFwidHlwaW5nXCIgfHwgdGhpcy5zZXR0aW5ncy50cmlnZ2VyTW9kZSA9PT0gXCJwYXJhZ3JhcGhcIiB8fCB0aGlzLnNldHRpbmdzLnRyaWdnZXJNb2RlID09PSBcImJvdGhcIlxuICAgICAgPyB0aGlzLnNldHRpbmdzLnRyaWdnZXJNb2RlXG4gICAgICA6IERFRkFVTFRfU0VUVElOR1MudHJpZ2dlck1vZGU7XG5cbiAgICAvLyBTdHJpY3QgbW9kZSBpcyBwZXJtYW5lbnRseSBlbmFibGVkLiBPbGRlciBzYXZlZCBzdHJpY3RNb2RlIHZhbHVlcyBhcmUgaWdub3JlZC5cbiAgICBkZWxldGUgKHRoaXMuc2V0dGluZ3MgYXMgVGltZUxvZ2dlclNldHRpbmdzICYgeyBzdHJpY3RNb2RlPzogYm9vbGVhbiB9KS5zdHJpY3RNb2RlO1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcbiAgICB0aGlzLnRpbWVzdGFtcFJlZ2V4ID0gYnVpbGRUaW1lc3RhbXBSZWdleCh0aGlzLnNldHRpbmdzKTtcbiAgfVxuXG4gIHByaXZhdGUgc3R5bGVSZW5kZXJlZFRpbWVzdGFtcHMoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgICBjb25zdCBzZWxlY3RvciA9IFwicCwgbGksIGJsb2NrcXVvdGUsIGgxLCBoMiwgaDMsIGg0LCBoNSwgaDZcIjtcbiAgICBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KHNlbGVjdG9yKS5mb3JFYWNoKG5vZGUgPT4ge1xuICAgICAgY29uc3QgZmlyc3QgPSBub2RlLmZpcnN0Q2hpbGQ7XG4gICAgICBpZiAoIWZpcnN0IHx8IGZpcnN0Lm5vZGVUeXBlICE9PSBOb2RlLlRFWFRfTk9ERSB8fCAhZmlyc3QudGV4dENvbnRlbnQpIHJldHVybjtcblxuICAgICAgY29uc3QgdmFsdWUgPSBmaXJzdC50ZXh0Q29udGVudDtcbiAgICAgIGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2godGhpcy50aW1lc3RhbXBSZWdleCk7XG4gICAgICBpZiAoIW1hdGNoIHx8IG1hdGNoWzBdLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgICBzcGFuLmNsYXNzTmFtZSA9IFwidGltZWxnci1wcmV2aWV3LXRpbWVzdGFtcFwiO1xuICAgICAgc3Bhbi50ZXh0Q29udGVudCA9IG1hdGNoWzBdO1xuICAgICAgZmlyc3QucmVwbGFjZVdpdGgoc3BhbiwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodmFsdWUuc2xpY2UobWF0Y2hbMF0ubGVuZ3RoKSkpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBzY2hlZHVsZUxlYWYobGVhZjogV29ya3NwYWNlTGVhZiwgcmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAoIShsZWFmLnZpZXcgaW5zdGFuY2VvZiBNYXJrZG93blZpZXcpKSByZXR1cm47XG4gICAgdGhpcy5zY2hlZHVsZUVkaXRvcihsZWFmLnZpZXcuZWRpdG9yLCBsZWFmLnZpZXcuZmlsZSwgcmVhc29uKTtcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVFZGl0b3IoZWRpdG9yOiBFZGl0b3IsIGZpbGU6IFRGaWxlIHwgbnVsbCwgcmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAoIWZpbGUgfHwgdGhpcy51cGRhdGluZ0VkaXRvcnMuaGFzKGVkaXRvcikgfHwgIXRoaXMuc2hvdWxkSGFuZGxlUmVhc29uKHJlYXNvbikpIHJldHVybjtcbiAgICBpZiAoIXRoaXMuaXNBY3RpdmVFZGl0b3IoZWRpdG9yLCBmaWxlKSkgcmV0dXJuO1xuXG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLnRpbWVycy5nZXQoZmlsZS5wYXRoKTtcbiAgICBpZiAoZXhpc3RpbmcpIHdpbmRvdy5jbGVhclRpbWVvdXQoZXhpc3RpbmcpO1xuXG4gICAgY29uc3QgdGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnRpbWVycy5kZWxldGUoZmlsZS5wYXRoKTtcbiAgICAgIHRoaXMucHJvY2Vzc0VkaXRvcihlZGl0b3IsIGZpbGUsIGZhbHNlLCB0cnVlKTtcbiAgICB9LCB0aGlzLnNldHRpbmdzLmRlYm91bmNlTXMpO1xuXG4gICAgdGhpcy50aW1lcnMuc2V0KGZpbGUucGF0aCwgdGltZXIpO1xuICB9XG5cbiAgcHJpdmF0ZSBzaG91bGRIYW5kbGVSZWFzb24ocmVhc29uOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBzd2l0Y2ggKHRoaXMuc2V0dGluZ3MudHJpZ2dlck1vZGUpIHtcbiAgICAgIGNhc2UgXCJ0eXBpbmdcIjpcbiAgICAgICAgcmV0dXJuIHJlYXNvbiA9PT0gXCJjaGFuZ2VcIiB8fCByZWFzb24gPT09IFwicGFzdGVcIiB8fCByZWFzb24gPT09IFwic3RhcnR1cFwiO1xuICAgICAgY2FzZSBcInBhcmFncmFwaFwiOlxuICAgICAgICByZXR1cm4gcmVhc29uID09PSBcImZvY3VzXCIgfHwgcmVhc29uID09PSBcImxheW91dFwiIHx8IHJlYXNvbiA9PT0gXCJzdGFydHVwXCI7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGlzQWN0aXZlRWRpdG9yKGVkaXRvcjogRWRpdG9yLCBmaWxlOiBURmlsZSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZTxNYXJrZG93blZpZXc+KE1hcmtkb3duVmlldyk7XG4gICAgcmV0dXJuIEJvb2xlYW4odmlldyAmJiB2aWV3LmVkaXRvciA9PT0gZWRpdG9yICYmIHZpZXcuZmlsZT8ucGF0aCA9PT0gZmlsZS5wYXRoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBdXRvbWF0aWMgcHJvY2Vzc2luZyB3b3JrcyBvbiB0aGUgY3Vyc29yJ3MgbG9naWNhbCBwYXJhZ3JhcGggb25seS5cbiAgICogRXhwbGljaXQgcmVzY2FuIHByb2Nlc3NlcyBldmVyeSBwYXJhZ3JhcGggaW4gZXZlcnkgdGltZWxnciBzY29wZS5cbiAgICovXG4gIHByaXZhdGUgcHJvY2Vzc0VkaXRvcihlZGl0b3I6IEVkaXRvciwgZmlsZTogVEZpbGUgfCBudWxsLCBmb3JjZTogYm9vbGVhbiwgY3Vyc29yT25seTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmICghZmlsZSB8fCB0aGlzLnVwZGF0aW5nRWRpdG9ycy5oYXMoZWRpdG9yKSB8fCAhdGhpcy5pc0FjdGl2ZUVkaXRvcihlZGl0b3IsIGZpbGUpKSByZXR1cm47XG5cbiAgICBjb25zdCBzb3VyY2UgPSBlZGl0b3IuZ2V0VmFsdWUoKTtcbiAgICBjb25zdCBsaW5lcyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKTtcbiAgICBjb25zdCBzY29wZXMgPSBmaW5kVGltZWxnclNjb3BlcyhsaW5lcyk7XG4gICAgaWYgKHNjb3Blcy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAgIGNvbnN0IHBhcmFncmFwaHMgPSB0aGlzLmdldFBhcmFncmFwaHMobGluZXMsIHNjb3Blcyk7XG4gICAgY29uc3QgY3Vyc29yID0gZWRpdG9yLmdldEN1cnNvcigpO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBjdXJzb3JPbmx5XG4gICAgICA/IHRoaXMuZ2V0Q3Vyc29yUGFyYWdyYXBoKHBhcmFncmFwaHMsIGN1cnNvci5saW5lKVxuICAgICAgOiBwYXJhZ3JhcGhzO1xuXG4gICAgaWYgKGNhbmRpZGF0ZXMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgICAvLyBUaGlzIHNldCBpcyB1cGRhdGVkIGFzIGEgcmVzY2FuIHBsYW5zIGluc2VydGlvbnMuIFRoZXJlZm9yZSB0aGUgcmVsYXRpdmVcbiAgICAvLyBydWxlIHJlbWFpbnMgdHJ1ZSBldmVuIGJldHdlZW4gbmV3bHkgcGxhbm5lZCB0aW1lc3RhbXBzLlxuICAgIGNvbnN0IHRpbWVzdGFtcExpbmVzID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgZm9yIChjb25zdCBwYXJhZ3JhcGggb2YgcGFyYWdyYXBocykge1xuICAgICAgZm9yIChsZXQgbGluZSA9IHBhcmFncmFwaC5zdGFydDsgbGluZSA8PSBwYXJhZ3JhcGguZW5kOyBsaW5lKyspIHtcbiAgICAgICAgaWYgKHRoaXMuaXNUaW1lc3RhbXBlZExpbmUobGluZXNbbGluZV0gPz8gXCJcIikpIHRpbWVzdGFtcExpbmVzLmFkZChsaW5lKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBwbGFubmVkOiBQbGFubmVkSW5zZXJ0aW9uW10gPSBbXTtcbiAgICBjb25zdCBjb250ZXh0ID0gdGhpcy5zZXR0aW5ncy5jb250ZXh0TW9kZTtcblxuICAgIGZvciAoY29uc3QgcGFyYWdyYXBoIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IHBhcmFncmFwaC5zdGFydDtcbiAgICAgIGlmICghbWVhbmluZ2Z1bChsaW5lc1t0YXJnZXRdID8/IFwiXCIpKSBjb250aW51ZTtcbiAgICAgIGlmICh0aGlzLnBhcmFncmFwaEhhc1RpbWVzdGFtcChwYXJhZ3JhcGgsIHRpbWVzdGFtcExpbmVzKSkgY29udGludWU7XG4gICAgICBpZiAoY29udGV4dCA+IDAgJiYgdGhpcy5oYXNOZWFyYnlUaW1lc3RhbXAodGltZXN0YW1wTGluZXMsIHRhcmdldCwgY29udGV4dCwgbGluZXMubGVuZ3RoLCBzY29wZXMpKSBjb250aW51ZTtcblxuICAgICAgcGxhbm5lZC5wdXNoKHsgbGluZTogdGFyZ2V0LCB0ZXh0OiB0aGlzLm1ha2VUaW1lc3RhbXAobmV3IERhdGUoKSkgfSk7XG4gICAgICB0aW1lc3RhbXBMaW5lcy5hZGQodGFyZ2V0KTtcblxuICAgICAgaWYgKGN1cnNvck9ubHkgJiYgZm9yY2UpIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChwbGFubmVkLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgIHRoaXMuYXBwbHlJbnNlcnRpb25zKGVkaXRvciwgY3Vyc29yLCBwbGFubmVkKTtcbiAgfVxuXG4gIC8qKiBHcm91cHMgY29uc2VjdXRpdmUgbm9uLWVtcHR5IGxpbmVzOyBibGFuayBsaW5lcyBzZXBhcmF0ZSBwYXJhZ3JhcGhzLiAqL1xuICBwcml2YXRlIGdldFBhcmFncmFwaHMobGluZXM6IHN0cmluZ1tdLCBzY29wZXM6IExpbmVSYW5nZVtdKTogTGluZVJhbmdlW10ge1xuICAgIGNvbnN0IHJlc3VsdDogTGluZVJhbmdlW10gPSBbXTtcblxuICAgIGZvciAoY29uc3Qgc2NvcGUgb2Ygc2NvcGVzKSB7XG4gICAgICBsZXQgc3RhcnQgPSAtMTtcbiAgICAgIGZvciAobGV0IGxpbmUgPSBzY29wZS5zdGFydDsgbGluZSA8PSBzY29wZS5lbmQ7IGxpbmUrKykge1xuICAgICAgICBpZiAobWVhbmluZ2Z1bChsaW5lc1tsaW5lXSA/PyBcIlwiKSkge1xuICAgICAgICAgIGlmIChzdGFydCA9PT0gLTEpIHN0YXJ0ID0gbGluZTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGFydCAhPT0gLTEpIHtcbiAgICAgICAgICByZXN1bHQucHVzaCh7IHN0YXJ0LCBlbmQ6IGxpbmUgLSAxIH0pO1xuICAgICAgICAgIHN0YXJ0ID0gLTE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdGFydCAhPT0gLTEpIHJlc3VsdC5wdXNoKHsgc3RhcnQsIGVuZDogc2NvcGUuZW5kIH0pO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBwcml2YXRlIGdldEN1cnNvclBhcmFncmFwaChwYXJhZ3JhcGhzOiBMaW5lUmFuZ2VbXSwgY3Vyc29yTGluZTogbnVtYmVyKTogTGluZVJhbmdlW10ge1xuICAgIGZvciAoY29uc3QgcGFyYWdyYXBoIG9mIHBhcmFncmFwaHMpIHtcbiAgICAgIGlmIChjdXJzb3JMaW5lID49IHBhcmFncmFwaC5zdGFydCAmJiBjdXJzb3JMaW5lIDw9IHBhcmFncmFwaC5lbmQpIHJldHVybiBbcGFyYWdyYXBoXTtcbiAgICB9XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXJhZ3JhcGhIYXNUaW1lc3RhbXAocGFyYWdyYXBoOiBMaW5lUmFuZ2UsIHRpbWVzdGFtcExpbmVzOiBTZXQ8bnVtYmVyPik6IGJvb2xlYW4ge1xuICAgIGZvciAobGV0IGxpbmUgPSBwYXJhZ3JhcGguc3RhcnQ7IGxpbmUgPD0gcGFyYWdyYXBoLmVuZDsgbGluZSsrKSB7XG4gICAgICBpZiAodGltZXN0YW1wTGluZXMuaGFzKGxpbmUpKSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLyoqXG4gICAqIFBoeXNpY2FsLWxpbmUgY29udGV4dDogYmxhbmsgbGluZXMgY291bnQgdG93YXJkIHRoZSBkaXN0YW5jZSBidXQgZG8gbm90XG4gICAqIHRoZW1zZWx2ZXMgYmxvY2sgaW5zZXJ0aW9uIGJlY2F1c2UgdGhleSBhcmUgbm90IHRpbWVzdGFtcGVkLlxuICAgKi9cbiAgcHJpdmF0ZSBoYXNOZWFyYnlUaW1lc3RhbXAoXG4gICAgdGltZXN0YW1wTGluZXM6IFNldDxudW1iZXI+LFxuICAgIHRhcmdldExpbmU6IG51bWJlcixcbiAgICBkaXN0YW5jZTogbnVtYmVyLFxuICAgIGxpbmVDb3VudDogbnVtYmVyLFxuICAgIHNjb3BlczogTGluZVJhbmdlW10sXG4gICk6IGJvb2xlYW4ge1xuICAgIGZvciAobGV0IG9mZnNldCA9IDE7IG9mZnNldCA8PSBkaXN0YW5jZTsgb2Zmc2V0KyspIHtcbiAgICAgIGNvbnN0IGJlZm9yZSA9IHRhcmdldExpbmUgLSBvZmZzZXQ7XG4gICAgICBjb25zdCBhZnRlciA9IHRhcmdldExpbmUgKyBvZmZzZXQ7XG4gICAgICBpZiAoYmVmb3JlID49IDAgJiYgbGluZUluU2NvcGVzKGJlZm9yZSwgc2NvcGVzKSAmJiB0aW1lc3RhbXBMaW5lcy5oYXMoYmVmb3JlKSkgcmV0dXJuIHRydWU7XG4gICAgICBpZiAoYWZ0ZXIgPCBsaW5lQ291bnQgJiYgbGluZUluU2NvcGVzKGFmdGVyLCBzY29wZXMpICYmIHRpbWVzdGFtcExpbmVzLmhhcyhhZnRlcikpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlIGlzVGltZXN0YW1wZWRMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLnRpbWVzdGFtcFJlZ2V4LnRlc3QobGluZSk7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5SW5zZXJ0aW9ucyhlZGl0b3I6IEVkaXRvciwgY3Vyc29yOiBDdXJzb3JTbmFwc2hvdCwgaW5zZXJ0aW9uczogUGxhbm5lZEluc2VydGlvbltdKTogdm9pZCB7XG4gICAgLy8gUmV2ZXJzZSBvcmRlciBwcmVzZXJ2ZXMgYWxsIG9yaWdpbmFsIGxpbmUgcG9zaXRpb25zIGR1cmluZyBpbnNlcnRpb24uXG4gICAgaW5zZXJ0aW9ucy5zb3J0KChhLCBiKSA9PiBiLmxpbmUgLSBhLmxpbmUpO1xuXG4gICAgdGhpcy51cGRhdGluZ0VkaXRvcnMuYWRkKGVkaXRvcik7XG4gICAgdHJ5IHtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBpbnNlcnRpb25zKSB7XG4gICAgICAgIGVkaXRvci5yZXBsYWNlUmFuZ2UoaXRlbS50ZXh0LCB7IGxpbmU6IGl0ZW0ubGluZSwgY2g6IDAgfSwgeyBsaW5lOiBpdGVtLmxpbmUsIGNoOiAwIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBjdXJzb3JTaGlmdCA9IGluc2VydGlvbnNcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGl0ZW0ubGluZSA9PT0gY3Vyc29yLmxpbmUpXG4gICAgICAgIC5yZWR1Y2UoKHRvdGFsLCBpdGVtKSA9PiB0b3RhbCArIGl0ZW0udGV4dC5sZW5ndGgsIDApO1xuXG4gICAgICBlZGl0b3Iuc2V0Q3Vyc29yKHsgbGluZTogY3Vyc29yLmxpbmUsIGNoOiBjdXJzb3IuY2ggKyBjdXJzb3JTaGlmdCB9KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy51cGRhdGluZ0VkaXRvcnMuZGVsZXRlKGVkaXRvcik7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBtYWtlVGltZXN0YW1wKGRhdGU6IERhdGUpOiBzdHJpbmcge1xuICAgIGNvbnN0IHRpbWUgPSBmb3JtYXRUaW1lKGRhdGUsIHRoaXMuc2V0dGluZ3MudGltZUZvcm1hdCB8fCBERUZBVUxUX1NFVFRJTkdTLnRpbWVGb3JtYXQpO1xuICAgIGNvbnN0IGRhdGVUZXh0ID0gdGhpcy5zZXR0aW5ncy5pbmNsdWRlRGF0ZVxuICAgICAgPyBmb3JtYXREYXRlKGRhdGUsIHRoaXMuc2V0dGluZ3MuZGF0ZUZvcm1hdCB8fCBERUZBVUxUX1NFVFRJTkdTLmRhdGVGb3JtYXQpXG4gICAgICA6IFwiXCI7XG5cbiAgICByZXR1cm4gKHRoaXMuc2V0dGluZ3MuY3VzdG9tU3ludGF4IHx8IERFRkFVTFRfU0VUVElOR1MuY3VzdG9tU3ludGF4KVxuICAgICAgLnJlcGxhY2UoL1xce1RJTUVcXH0vZ2ksIHRpbWUpXG4gICAgICAucmVwbGFjZSgvXFx7REFURVxcfS9naSwgZGF0ZVRleHQpO1xuICB9XG59XG5cbmNsYXNzIFRpbWVMb2dnZXJTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHBsdWdpbjogVGltZUxvZ2dlclBsdWdpbikge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlRpbWUgTG9nZ2VyXCIgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiVGltZSBmb3JtYXRcIilcbiAgICAgIC5zZXREZXNjKFwiVG9rZW5zOiBISC9ILCBoaC9oLCBtbS9tLCBzcy9zLCBBL2EuIE9yZGluYXJ5IHRleHQgaXMgYWxzbyBhbGxvd2VkLlwiKVxuICAgICAgLmFkZFRleHQodGV4dCA9PiB0ZXh0XG4gICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIkhIOm1tXCIpXG4gICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50aW1lRm9ybWF0KVxuICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy50aW1lRm9ybWF0ID0gdmFsdWUgfHwgREVGQVVMVF9TRVRUSU5HUy50aW1lRm9ybWF0O1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiSW5jbHVkZSBkYXRlXCIpXG4gICAgICAuc2V0RGVzYyhcIkFkZCBhIGZvcm1hdHRlZCBkYXRlIHRvIHRoZSB0aW1lc3RhbXAuXCIpXG4gICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcbiAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmluY2x1ZGVEYXRlKVxuICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5jbHVkZURhdGUgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgfSkpO1xuXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmluY2x1ZGVEYXRlKSB7XG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgLnNldE5hbWUoXCJEYXRlIGZvcm1hdFwiKVxuICAgICAgICAuc2V0RGVzYyhcIlRva2VuczogWVlZWSwgWVksIE1NTU0sIE1NTSwgTU0sIE0sIERvLCBERCwgRCwgZGRkZCwgZGRkLCBkLlwiKVxuICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJZWVlZLU1NLUREXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmRhdGVGb3JtYXQpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kYXRlRm9ybWF0ID0gdmFsdWUgfHwgREVGQVVMVF9TRVRUSU5HUy5kYXRlRm9ybWF0O1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSkpO1xuICAgIH1cblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJDdXN0b20gc3ludGF4XCIpXG4gICAgICAuc2V0RGVzYyhcIlVzZSB7VElNRX0gYW5kIHtEQVRFfS4gRXhhbXBsZTogW3tEQVRFfSB7VElNRX1dOiBvciBbYXQge1RJTUV9IG9mIERheV06XCIpXG4gICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcbiAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiW3tUSU1FfV06IFwiKVxuICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuY3VzdG9tU3ludGF4KVxuICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jdXN0b21TeW50YXggPSB2YWx1ZSB8fCBERUZBVUxUX1NFVFRJTkdTLmN1c3RvbVN5bnRheDtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSkpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlJlbGF0aXZlIGxpbmUgcHJvdGVjdGlvblwiKVxuICAgICAgLnNldERlc2MoXCJDaGVjayAw4oCTNSBwaHlzaWNhbCBsaW5lcyBiZWZvcmUgYW5kIGFmdGVyLiBCbGFuayBsaW5lcyBjb3VudCB0b3dhcmQgZGlzdGFuY2UgYnV0IGFyZSBuZXZlciB0aW1lc3RhbXBlZC5cIilcbiAgICAgIC5hZGREcm9wZG93bihkcm9wID0+IGRyb3BcbiAgICAgICAgLmFkZE9wdGlvbnMoeyBvZmY6IFwiT2ZmXCIsIFwiMVwiOiBcIjEgbGluZVwiLCBcIjJcIjogXCIyIGxpbmVzXCIsIFwiM1wiOiBcIjMgbGluZXNcIiwgXCI0XCI6IFwiNCBsaW5lc1wiLCBcIjVcIjogXCI1IGxpbmVzXCIgfSlcbiAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRNb2RlID09PSAwID8gXCJvZmZcIiA6IFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb250ZXh0TW9kZSkpXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IHN0cmluZykgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRNb2RlID0gdmFsdWUgPT09IFwib2ZmXCIgPyAwIDogY2xhbXBDb250ZXh0KHZhbHVlKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSkpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlRyaWdnZXIgbW9kZVwiKVxuICAgICAgLnNldERlc2MoXCJUeXBpbmcgcmVhY3RzIHRvIGVkaXRzOyBGb2N1cyByZWFjdHMgdG8gZm9jdXMvbGF5b3V0OyBib3RoIHVzZXMgYm90aCBzaWduYWxzLlwiKVxuICAgICAgLmFkZERyb3Bkb3duKGRyb3AgPT4gZHJvcFxuICAgICAgICAuYWRkT3B0aW9ucyh7IHR5cGluZzogXCJUeXBpbmdcIiwgcGFyYWdyYXBoOiBcIkZvY3VzXCIsIGJvdGg6IFwiVHlwaW5nICsgZm9jdXNcIiB9KVxuICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudHJpZ2dlck1vZGUpXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IHN0cmluZykgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnRyaWdnZXJNb2RlID0gdmFsdWUgYXMgVGltZUxvZ2dlclNldHRpbmdzW1widHJpZ2dlck1vZGVcIl07XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJSZXNwb25zZSBkZWJvdW5jZVwiKVxuICAgICAgLnNldERlc2MoXCJEZWxheSBhZnRlciBhbiBlZGl0b3IgZXZlbnQgYmVmb3JlIGV2YWx1YXRpbmcgdGhlIGN1cnJlbnQgcGFyYWdyYXBoLiAxMDDigJMxNTAwIG1zLlwiKVxuICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT4gc2xpZGVyXG4gICAgICAgIC5zZXRMaW1pdHMoMTAwLCAxNTAwLCA1MClcbiAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmRlYm91bmNlTXMpXG4gICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IG51bWJlcikgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRlYm91bmNlTXMgPSBNYXRoLnJvdW5kKHZhbHVlKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSkpO1xuXG4gICAgY29uc3QgaGVscCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdihcInRpbWVsZ3Itc2V0dGluZ3MtaGVscFwiKTtcbiAgICBoZWxwLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiU3RyaWN0IHNjb3BlIGlzIHBlcm1hbmVudGx5IGVuYWJsZWQgaW4gdGhpcyB2ZXJzaW9uLlwiIH0pO1xuICAgIGhlbHAuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogXCJPbmx5IGNvbnRlbnQgaW5zaWRlIGBgYHRpbWVsZ3IgZmVuY2VkIGJsb2NrcyBpcyBwcm9jZXNzZWQuXCIgfSk7XG4gICAgaGVscC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBcIkJsYW5rIGxpbmVzIGFyZSBpZ25vcmVkIGFzIGluc2VydGlvbiB0YXJnZXRzLCBidXQgdGhleSBzdGlsbCBjb3VudCB3aGVuIHJlbGF0aXZlIHByb3RlY3Rpb24gbWVhc3VyZXMgbGluZSBkaXN0YW5jZS5cIiB9KTtcbiAgICBoZWxwLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiRXhhbXBsZTpcIiB9KTtcbiAgICBoZWxwLmNyZWF0ZUVsKFwicHJlXCIsIHtcbiAgICAgIGNsczogXCJ0aW1lbGdyLXNldHRpbmdzLWNvZGVcIixcbiAgICAgIHRleHQ6IFwiYGBgdGltZWxnclxcbnVzZXIgdGV4dC4uLi4uXFxuXFxubmV4dCBwYXJhZ3JhcGguLi4uLlxcbmBgYFwiLFxuICAgIH0pO1xuICB9XG59XG4iXX0=