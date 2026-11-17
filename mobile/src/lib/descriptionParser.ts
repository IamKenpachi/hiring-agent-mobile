export interface TextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  linkUrl?: string;
}

export type DescriptionBlock =
  | { type: "heading"; text: string }
  | { type: "bullet"; marker: string; spans: TextSpan[] }
  | { type: "paragraph"; spans: TextSpan[] };

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x27;": "'",
  "&rsquo;": "\u2019",
  "&lsquo;": "\u2018",
  "&rdquo;": "\u201D",
  "&ldquo;": "\u201C",
  "&ndash;": "\u2013",
  "&mdash;": "\u2014",
  "&bull;": "\u2022",
};

const METADATA_HEADING_RE =
  /^(?:location|salary|compensation|pay|hours|working hours|contract|contract type|job type|work mode|working pattern|department|company|industry|reference|reference number|job grade|grade|clearance|start date|closing date|role title|title|entity)$/i;

/**
 * Normalize raw JobSpy / Markdown job description strings:
 * - Convert CRLF/CR to LF and NBSP to regular space
 * - Unescape backslash-escaped markdown punctuation
 * - Decode common HTML entities
 * - Trim trailing spaces per line and collapse 3+ newlines into double newlines
 */
export function normalizeJobDescriptionText(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return "";
  }

  let text = raw.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  text = text.replace(/\\([&.+*/()[\]_:#|=><!~-])/g, "$1");
  text = text.replace(
    /&(?:amp|nbsp|lt|gt|quot|apos|#39|#x27|rsquo|lsquo|rdquo|ldquo|ndash|mdash|bull);/gi,
    (match) => HTML_ENTITY_MAP[match.toLowerCase()] ?? match
  );
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

interface SpanStyle {
  bold?: boolean;
  italic?: boolean;
  linkUrl?: string;
}

function pushSpan(target: TextSpan[], text: string, style: SpanStyle): void {
  if (!text) return;

  const last = target[target.length - 1];
  const sameBold = Boolean(last?.bold) === Boolean(style.bold);
  const sameItalic = Boolean(last?.italic) === Boolean(style.italic);
  const sameLink = (last?.linkUrl || undefined) === (style.linkUrl || undefined);

  if (last && sameBold && sameItalic && sameLink) {
    last.text += text;
    return;
  }

  const span: TextSpan = { text };
  if (style.bold) span.bold = true;
  if (style.italic) span.italic = true;
  if (style.linkUrl) span.linkUrl = style.linkUrl;
  target.push(span);
}

function findClosingDelimiter(
  input: string,
  delimiter: string,
  fromIndex: number
): number {
  let cursor = fromIndex;
  while (cursor <= input.length - delimiter.length) {
    const idx = input.indexOf(delimiter, cursor);
    if (idx === -1) return -1;
    if (input.slice(fromIndex, idx).trim().length > 0) {
      return idx;
    }
    cursor = idx + delimiter.length;
  }
  return -1;
}

function findClosingSingleStar(input: string, fromIndex: number): number {
  for (let j = fromIndex; j < input.length; j += 1) {
    if (input[j] !== "*") continue;
    const prevIsStar = j > 0 && input[j - 1] === "*";
    const nextIsStar = j + 1 < input.length && input[j + 1] === "*";
    if (prevIsStar || nextIsStar) continue;

    if (j > fromIndex && !/\s/.test(input[j - 1])) {
      return j;
    }
  }
  return -1;
}

function tryParseMarkdownLink(
  input: string,
  startIndex: number
): { label: string; url: string; nextIndex: number } | null {
  if (input[startIndex] !== "[") return null;

  let closeBracket = -1;
  for (let j = startIndex + 1; j < input.length; j += 1) {
    if (input[j] === "\n") return null;
    if (input[j] === "[" ) return null;
    if (input[j] === "]") {
      closeBracket = j;
      break;
    }
  }
  if (closeBracket === -1 || input[closeBracket + 1] !== "(") {
    return null;
  }

  const label = input.slice(startIndex + 1, closeBracket);
  if (!label.trim()) return null;

  let depth = 1;
  let closeParen = -1;
  for (let j = closeBracket + 2; j < input.length; j += 1) {
    const ch = input[j];
    if (/\s/.test(ch)) {
      return null;
    }
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        closeParen = j;
        break;
      }
    }
  }

  if (closeParen === -1) return null;
  const url = input.slice(closeBracket + 2, closeParen).trim();
  if (!url) return null;

  return { label, url, nextIndex: closeParen + 1 };
}

function parseSpansInto(
  input: string,
  style: SpanStyle,
  out: TextSpan[]
): void {
  let plainBuf = "";
  let i = 0;

  const flushPlain = () => {
    if (plainBuf) {
      pushSpan(out, plainBuf, style);
      plainBuf = "";
    }
  };

  while (i < input.length) {
    if (input[i] === "[") {
      const link = tryParseMarkdownLink(input, i);
      if (link) {
        flushPlain();
        parseSpansInto(link.label, { ...style, linkUrl: link.url }, out);
        i = link.nextIndex;
        continue;
      }
    }

    if (input.startsWith("****", i)) {
      const closeIdx = findClosingDelimiter(input, "****", i + 4);
      if (closeIdx !== -1) {
        flushPlain();
        parseSpansInto(input.slice(i + 4, closeIdx), { ...style, bold: true }, out);
        i = closeIdx + 4;
        continue;
      }
    }

    if (input.startsWith("***", i)) {
      const closeIdx = findClosingDelimiter(input, "***", i + 3);
      if (closeIdx !== -1) {
        flushPlain();
        parseSpansInto(
          input.slice(i + 3, closeIdx),
          { ...style, bold: true, italic: true },
          out
        );
        i = closeIdx + 3;
        continue;
      }
    }

    if (input.startsWith("**", i)) {
      const closeIdx = findClosingDelimiter(input, "**", i + 2);
      if (closeIdx !== -1) {
        flushPlain();
        parseSpansInto(input.slice(i + 2, closeIdx), { ...style, bold: true }, out);
        i = closeIdx + 2;
        continue;
      }
      // Strip unmatched ** so raw markdown markers never leak into rendered text.
      i += 2;
      continue;
    }

    if (input.startsWith("__", i) && input[i + 2] !== "_") {
      const closeIdx = findClosingDelimiter(input, "__", i + 2);
      if (closeIdx !== -1 && input[closeIdx + 2] !== "_") {
        flushPlain();
        parseSpansInto(input.slice(i + 2, closeIdx), { ...style, bold: true }, out);
        i = closeIdx + 2;
        continue;
      }
    }

    if (input[i] === "*" && input[i + 1] !== "*") {
      const prevChar = i > 0 ? input[i - 1] : "";
      const nextChar = i + 1 < input.length ? input[i + 1] : "";
      const prevOk = !prevChar || !/[a-zA-Z0-9]/.test(prevChar);
      const nextOk = Boolean(nextChar) && !/\s/.test(nextChar) && nextChar !== "*";

      if (prevOk && nextOk) {
        const closeIdx = findClosingSingleStar(input, i + 1);
        if (closeIdx !== -1) {
          flushPlain();
          parseSpansInto(
            input.slice(i + 1, closeIdx),
            { ...style, italic: true },
            out
          );
          i = closeIdx + 1;
          continue;
        }
      }
    }

    plainBuf += input[i];
    i += 1;
  }

  flushPlain();
}

/**
 * Parse inline markdown (**bold**, __bold__, *italic*, ***bold+italic***,
 * ****bold****, and [label](url)) into clean TextSpan[] without leaving raw ** markers.
 */
export function parseInlineSpans(text: string): TextSpan[] {
  if (!text || typeof text !== "string") {
    return [];
  }
  const spans: TextSpan[] = [];
  parseSpansInto(text, {}, spans);
  return spans;
}

function spansToPlainText(spans: TextSpan[]): string {
  return spans.map((s) => s.text).join("");
}

function isHorizontalRule(trimmed: string): boolean {
  return /^(?:[-*_]\s*){3,}$/.test(trimmed) || /^={3,}$/.test(trimmed);
}

function matchAtxHeading(trimmed: string): string | null {
  const match = trimmed.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/);
  if (!match) return null;
  const plain = spansToPlainText(parseInlineSpans(match[1])).trim();
  return plain || null;
}

function matchBulletLine(
  trimmed: string
): { marker: string; content: string } | null {
  if (isHorizontalRule(trimmed)) return null;

  const unordered = trimmed.match(/^(?:[*•◦–+-])\s+(.+)$/);
  if (unordered) {
    return { marker: "\u2022", content: unordered[1].trim() };
  }

  const numbered = trimmed.match(/^(\d{1,2}[.)])\s+(.+)$/);
  if (numbered) {
    return { marker: numbered[1], content: numbered[2].trim() };
  }

  return null;
}

function extractStandaloneBoldHeading(trimmed: string): string | null {
  if (!trimmed.startsWith("**") && !trimmed.startsWith("__")) {
    return null;
  }

  let candidate = trimmed;
  let trailingColon = false;

  const outsideColon = trimmed.match(/^(.+?(?:\*{2,4}|__))\s*:$/);
  if (outsideColon) {
    candidate = outsideColon[1];
    trailingColon = true;
  } else if (!trimmed.endsWith("**") && !trimmed.endsWith("__")) {
    return null;
  }

  const spans = parseInlineSpans(candidate);
  if (spans.length === 0 || !spans.every((s) => s.bold === true)) {
    return null;
  }

  let plain = spansToPlainText(spans).trim();
  if (trailingColon && !plain.endsWith(":")) {
    plain = `${plain}:`;
  }

  const words = plain.split(/\s+/).filter(Boolean);
  if (plain.length < 2 || plain.length > 85 || words.length > 10) return null;
  if (/^[a-z]/.test(plain)) return null;
  if (/[.!?]\s+[A-Z]/.test(plain)) return null;
  if (plain.length > 75 && /[.!?]$/.test(plain)) return null;
  if (plain.endsWith(":") && (plain.length > 65 || /\b(?:you will|we will):$/i.test(plain))) {
    return null;
  }

  return plain;
}

function isPlainColonHeading(
  trimmed: string,
  prevParagraphLine: string | null
): string | null {
  const plain = spansToPlainText(parseInlineSpans(trimmed)).trim();
  if (!plain.endsWith(":")) return null;
  if (plain.length < 2 || plain.length > 65) return null;
  if (/^[a-z]/.test(plain)) return null;
  if (!/[a-zA-Z]{2,}/.test(plain)) return null;
  if (/[.!?;]/.test(plain)) return null;
  if (/https?:\/\/|@/i.test(plain)) return null;

  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length > 7) return null;
  if (/\b(?:you will|we will|by|as follows|following):$/i.test(plain)) {
    return null;
  }

  if (
    prevParagraphLine !== null &&
    !/[.!?:]$/.test(prevParagraphLine) &&
    prevParagraphLine.length > 35
  ) {
    return null;
  }

  return plain;
}

function isSubstantiveFollowup(lines: string[], startIndex: number): boolean {
  const collected: string[] = [];
  for (let k = startIndex; k < lines.length; k += 1) {
    const t = lines[k].trim();
    if (!t) {
      if (collected.length > 0) break;
      continue;
    }
    if (
      isHorizontalRule(t) ||
      matchAtxHeading(t) !== null ||
      extractStandaloneBoldHeading(t) !== null
    ) {
      return false;
    }
    if (matchBulletLine(t) !== null) {
      return true;
    }
    collected.push(t);
  }

  if (collected.length === 0) return false;
  const text = spansToPlainText(parseInlineSpans(collected.join(" "))).trim();
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 5 || text.length > 45 || /[.!?]$/.test(text);
}

function hasNextNonEmptyContent(lines: string[], startIndex: number): boolean {
  for (let k = startIndex; k < lines.length; k += 1) {
    const t = lines[k].trim();
    if (t && !isHorizontalRule(t)) {
      return true;
    }
  }
  return false;
}

function isSeparatedShortPlainHeading(
  lines: string[],
  index: number,
  prevWasBoundary: boolean,
  prevParaLine: string | null,
  prevHeading: { text: string; isExplicit: boolean } | null
): string | null {
  const trimmed = lines[index].trim();
  const nextRaw = index + 1 < lines.length ? lines[index + 1].trim() : "";
  const nextIsBullet = matchBulletLine(nextRaw) !== null;
  const prevEndedSentence = prevParaLine !== null && /[.!?]$/.test(prevParaLine);

  if (!prevWasBoundary && !(prevEndedSentence && nextIsBullet)) {
    return null;
  }

  const nextIsBoundary =
    nextRaw === "" ||
    isHorizontalRule(nextRaw) ||
    matchAtxHeading(nextRaw) !== null ||
    nextIsBullet ||
    extractStandaloneBoldHeading(nextRaw) !== null;

  if (!nextIsBoundary) return null;
  if (!hasNextNonEmptyContent(lines, index + 1)) return null;

  const plain = spansToPlainText(parseInlineSpans(trimmed)).trim();
  if (plain.length < 2 || plain.length > 45) return null;
  if (plain.includes(":") || /#{1,6}/.test(plain)) return null;
  if (/[.,;!?]/.test(plain)) return null;
  if (/^[a-z0-9]/.test(plain)) return null;
  if (!/[a-zA-Z]{2,}/.test(plain)) return null;
  if (/[$£€¥%@]|https?:\/\//i.test(plain)) return null;

  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return null;

  if (prevHeading) {
    if (prevHeading.text.endsWith(":")) return null;
    if (!prevHeading.isExplicit) return null;
    if (METADATA_HEADING_RE.test(prevHeading.text.replace(/:$/, "").trim())) {
      return null;
    }
    if (!isSubstantiveFollowup(lines, index + 1)) {
      return null;
    }
  }

  return plain;
}

/**
 * Parse a raw job description into structured headings, bullet items, and paragraphs.
 */
export function parseJobDescription(raw: string): DescriptionBlock[] {
  const normalized = normalizeJobDescriptionText(raw);
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const blocks: DescriptionBlock[] = [];

  let activeBullet: { marker: string; lines: string[] } | null = null;
  let activeParagraphLines: string[] = [];
  let prevWasBoundary = true;
  let prevHeading: { text: string; isExplicit: boolean } | null = null;

  const flushBullet = () => {
    if (!activeBullet) return;
    const joined = activeBullet.lines.join(" ").trim();
    const spans = parseInlineSpans(joined);
    if (spans.length > 0) {
      blocks.push({ type: "bullet", marker: activeBullet.marker, spans });
      prevHeading = null;
    }
    activeBullet = null;
  };

  const flushParagraph = () => {
    if (activeParagraphLines.length === 0) return;
    const joined = activeParagraphLines.join(" ").trim();
    const spans = parseInlineSpans(joined);
    if (spans.length > 0) {
      blocks.push({ type: "paragraph", spans });
      prevHeading = null;
    }
    activeParagraphLines = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      flushBullet();
      flushParagraph();
      prevWasBoundary = true;
      continue;
    }

    if (isHorizontalRule(trimmed)) {
      if (
        !activeBullet &&
        activeParagraphLines.length === 1 &&
        /^[-=]{3,}$/.test(trimmed)
      ) {
        const candidate = spansToPlainText(
          parseInlineSpans(activeParagraphLines[0])
        ).trim();
        if (
          candidate.length >= 2 &&
          candidate.length <= 80 &&
          /[a-zA-Z]{2,}/.test(candidate) &&
          !/[,;!?]$/.test(candidate)
        ) {
          blocks.push({ type: "heading", text: candidate });
          prevHeading = { text: candidate, isExplicit: true };
          activeParagraphLines = [];
          prevWasBoundary = true;
          continue;
        }
      }
      flushBullet();
      flushParagraph();
      prevWasBoundary = true;
      continue;
    }

    const atx = matchAtxHeading(trimmed);
    if (atx) {
      flushBullet();
      flushParagraph();
      blocks.push({ type: "heading", text: atx });
      prevHeading = { text: atx, isExplicit: true };
      prevWasBoundary = true;
      continue;
    }

    const bullet = matchBulletLine(trimmed);
    if (bullet) {
      flushBullet();
      flushParagraph();
      activeBullet = { marker: bullet.marker, lines: [bullet.content] };
      prevWasBoundary = false;
      continue;
    }

    const boldHeading = extractStandaloneBoldHeading(trimmed);
    if (activeBullet) {
      const bulletJoined = activeBullet.lines.join(" ").trim();
      const bulletEndsSentence = /[.!?]$/.test(bulletJoined);
      const nextTrimmed = i + 1 < lines.length ? lines[i + 1].trim() : "";
      const nextBreaks =
        nextTrimmed === "" ||
        isHorizontalRule(nextTrimmed) ||
        matchAtxHeading(nextTrimmed) !== null ||
        matchBulletLine(nextTrimmed) !== null;

      if (
        boldHeading &&
        (bulletEndsSentence || boldHeading.endsWith(":") || nextBreaks)
      ) {
        flushBullet();
        blocks.push({ type: "heading", text: boldHeading });
        prevHeading = { text: boldHeading, isExplicit: true };
        prevWasBoundary = true;
        continue;
      }

      const colonHeading = isPlainColonHeading(trimmed, null);
      if (colonHeading && bulletEndsSentence && nextBreaks) {
        flushBullet();
        blocks.push({ type: "heading", text: colonHeading });
        prevHeading = { text: colonHeading, isExplicit: false };
        prevWasBoundary = true;
        continue;
      }

      activeBullet.lines.push(trimmed);
      prevWasBoundary = false;
      continue;
    }

    if (boldHeading) {
      const prevLine =
        activeParagraphLines.length > 0
          ? activeParagraphLines[activeParagraphLines.length - 1]
          : null;
      const nextTrimmed = i + 1 < lines.length ? lines[i + 1].trim() : "";
      const midSentenceWrap =
        prevLine !== null &&
        !/[.!?:]$/.test(prevLine) &&
        /^[a-z.,;!?]/.test(nextTrimmed);

      if (!midSentenceWrap) {
        flushParagraph();
        blocks.push({ type: "heading", text: boldHeading });
        prevHeading = { text: boldHeading, isExplicit: true };
        prevWasBoundary = true;
        continue;
      }
    }

    const prevParaLine =
      activeParagraphLines.length > 0
        ? activeParagraphLines[activeParagraphLines.length - 1]
        : null;
    const colonHeading = isPlainColonHeading(trimmed, prevParaLine);
    if (colonHeading) {
      flushParagraph();
      blocks.push({ type: "heading", text: colonHeading });
      prevHeading = { text: colonHeading, isExplicit: false };
      prevWasBoundary = true;
      continue;
    }

    const shortLabel = isSeparatedShortPlainHeading(
      lines,
      i,
      prevWasBoundary,
      prevParaLine,
      prevHeading
    );
    if (shortLabel) {
      flushParagraph();
      blocks.push({ type: "heading", text: shortLabel });
      prevHeading = { text: shortLabel, isExplicit: false };
      prevWasBoundary = true;
      continue;
    }

    activeParagraphLines.push(trimmed);
    prevWasBoundary = false;
  }

  flushBullet();
  flushParagraph();

  return blocks;
}
