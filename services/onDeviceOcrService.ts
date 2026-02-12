import { BusinessCard } from "../types";

type WorkerLike = {
  recognize: (
    image: string,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<{ data: OCRResultData }>;
  setParameters?: (params: Record<string, string>) => Promise<void>;
  terminate: () => Promise<void>;
};

type OCRWord = {
  text?: string;
  confidence?: number;
  bbox?: {
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
  };
};

type OCRResultData = {
  text?: string;
  words?: OCRWord[];
};

type CreateWorkerOptions = {
  logger?: (m: unknown) => void;
  errorHandler?: (err: unknown) => void;
  workerPath?: string;
  langPath?: string;
  corePath?: string;
  workerBlobURL?: boolean;
  gzip?: boolean;
};

type CreateWorkerFn = (langs: string, oem?: number, options?: CreateWorkerOptions) => Promise<WorkerLike>;

const TITLE_RE = new RegExp(
  [
    "\\b(ceo|cto|cfo|coo|founder|manager|director|head|lead|engineer|sales|marketing|product|operations|secretary|assistant|advisor|officer|president|vice president)\\b",
    "(директор|менеджер|инженер|руководитель|продажи|маркетинг|разработчик|секретарь|советник)",
    "(commercial affairs|economic affairs|public affairs|consular affairs)",
  ].join("|"),
  "i",
);

const COMPANY_RE = new RegExp(
  [
    "\\b(embassy|consulate|ministry|department|agency|university|institute|bank|group|solutions|studio|company|corp|corporation|inc|llc|ltd|gmbh|s\\.?a\\.?)\\b",
    "(посольство|консульство|университет|компания|министерство)",
  ].join("|"),
  "i",
);

const ADDRESS_RE =
  /\b(street|st\.|avenue|ave\.|road|rd\.|boulevard|blvd|lane|ln\.|drive|dr\.|suite|ste\.|office|building|floor|city|state|zip|postal|p\.?o\.?\s*box|box|ул\.|улица|просп|дом|офис|ashgabat|turkmenistan)\b/i;

let workerPromise: Promise<WorkerLike> | null = null;
let workerLangs: string | null = null;

function assetPath(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  // base ends with '/' in Vite; path should not start with '/'.
  return `${base}${path}`;
}

async function getWorker(langs: string, onProgress?: (progress: number, status?: string) => void) {
  if (workerPromise && workerLangs === langs) return workerPromise;

  // If languages changed, terminate the old worker.
  if (workerPromise && workerLangs !== langs) {
    try {
      const old = await workerPromise;
      await old.terminate();
    } catch {
      // ignore
    } finally {
      workerPromise = null;
      workerLangs = null;
    }
  }

  workerLangs = langs;
  workerPromise = (async () => {
    const mod = await import("tesseract.js");
    const createWorker = mod.createWorker as unknown as CreateWorkerFn;

    try {
      const worker = await createWorker(langs, 1, {
        // Self-hosted assets (same-origin) to avoid third-party CDNs.
        workerPath: assetPath("tesseract/worker.min.js"),
        corePath: assetPath("tesseract-core").replace(/\/$/, ""),
        langPath: assetPath("tessdata").replace(/\/$/, ""),
        // Some browsers/environments fail to load blob-imported worker scripts.
        workerBlobURL: false,
        gzip: true,
        logger: (m: unknown) => {
          if (!onProgress) return;
          if (typeof m !== "object" || m === null) return;
          const rec = m as Record<string, unknown>;
          const progress = typeof rec.progress === "number" ? rec.progress : undefined;
          const status = typeof rec.status === "string" ? rec.status : undefined;
          if (progress !== undefined) onProgress(progress, status);
        },
        errorHandler: (err: unknown) => {
          console.error("Tesseract worker runtime error:", err);
        },
      });

      return worker;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err || "unknown worker init error");
      if (/importing a module script failed/i.test(raw)) {
        throw new Error(
          "OCR worker failed to load assets (module script import failed). Hard refresh the page and try again. If it persists, clear site data for this domain and retry.",
        );
      }
      throw new Error(`OCR worker initialization failed: ${raw}`);
    }
  })().catch((err) => {
    // Do not keep a rejected promise cached; allow retry.
    workerPromise = null;
    workerLangs = null;
    throw err;
  });

  return workerPromise;
}

function pickFirstMatch(text: string, re: RegExp): string {
  const m = text.match(re);
  return m && m[0] ? m[0].trim() : "";
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeOcrLine(line: string): string {
  return normalizeLine(line)
    .replace(/^[|¦:;,_~`'"./\\\-\s]+/, "")
    .replace(/[|¦]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function dedupeBy<T>(items: T[], keyFn: (v: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function stripContactTokens(line: string, tokens: string[]): string {
  let out = line;
  for (const token of tokens) {
    if (!token) continue;
    out = out.replace(new RegExp(escapeRegExp(token), "gi"), " ");
  }
  return sanitizeOcrLine(out).replace(/^[,;:\- ]+|[,;:\- ]+$/g, "").trim();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

const NAME_STOPWORDS = new Set(
  [
    "second",
    "first",
    "third",
    "secretary",
    "economic",
    "commercial",
    "affairs",
    "embassy",
    "consulate",
    "department",
    "ministry",
    "office",
    "street",
    "ashgabat",
    "turkmenistan",
  ].map((v) => v.toLowerCase()),
);

function tokenizeWords(line: string): string[] {
  return line
    .split(/\s+/)
    .map((t) => t.replace(/^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё'-]+$/g, ""))
    .filter(Boolean);
}

function isTitleCaseWord(token: string): boolean {
  return /^\p{Lu}[\p{Ll}'-]{1,}$/u.test(token);
}

function isUpperWord(token: string): boolean {
  return /^\p{Lu}{2,}$/u.test(token);
}

function extractBestNameCandidate(lines: string[], isTitleLine: (line: string) => boolean, isAddressLine: (line: string) => boolean): string {
  const candidates: Array<{ value: string; score: number }> = [];

  for (const line of lines) {
    if (isAddressLine(line)) continue;
    const words = tokenizeWords(line);
    if (words.length < 2) continue;

    for (let i = 0; i < words.length; i += 1) {
      for (let len = 2; len <= 3; len += 1) {
        const slice = words.slice(i, i + len);
        if (slice.length < 2) continue;

        const acceptable = slice.every((w) => isTitleCaseWord(w) || isUpperWord(w));
        if (!acceptable) continue;

        const value = slice.join(" ");
        let score = 10 + slice.length * 8;
        score += slice.filter(isTitleCaseWord).length * 3;
        if (isTitleLine(line)) score -= 12;
        if (/\b(embassy|consulate|ministry|department|agency|company|corp|inc|llc|ltd)\b/i.test(line)) score -= 12;
        if (/\d|@/.test(line)) score -= 8;
        if (value.length < 6) score -= 6;

        candidates.push({ value, score });
      }
    }
  }

  if (candidates.length === 0) return "";
  candidates.sort((a, b) => b.score - a.score || b.value.length - a.value.length);
  return candidates[0].value;
}

function cleanSemanticLine(line: string): string {
  return sanitizeOcrLine(line)
    .replace(/^[A-Za-z]{1,2}\s*:\s*/g, "")
    .replace(/^[A-Za-z]{1,2}\s+(?=[A-ZА-ЯЁ])/u, "")
    .replace(/\b[|¦]\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanupFieldText(value: string): string {
  return sanitizeOcrLine(value)
    .replace(/^[,;:\- ]+|[,;:\- ]+$/g, "")
    .replace(/\b[ai]\s+(?=[A-ZА-ЯЁ])/g, "")
    .replace(/\bBoy\s+(?=\d)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeEmailCandidate(raw: string): string {
  let v = raw.trim();
  v = v.replace(/\s*@\s*/g, "@");
  v = v.replace(/\s*\.\s*/g, ".");
  v = v.replace(/[,;]+/g, "");
  v = v.replace(/\s+/g, "");
  return v;
}

function normalizeWebsiteCandidate(raw: string): string {
  let v = cleanupFieldText(raw).toLowerCase();
  v = v.replace(/\s+/g, ".");
  v = v.replace(/,+/g, "");
  if (!v || v.includes("@")) return "";
  const host = v.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host.split("/")[0] || "")) return "";
  return v;
}

function isLikelyNoiseLine(line: string): boolean {
  const v = line.trim();
  if (!v) return true;
  if (v.length > 220) return true;
  const tokens = v.split(/\s+/);
  if (tokens.length > 35) return true;

  const alpha = (v.match(/[A-Za-zА-Яа-яЁё]/g) || []).length;
  const weird = (v.match(/[^A-Za-zА-Яа-яЁё0-9\s.,@()+\-/#:&]/g) || []).length;
  if (alpha < 6 && weird > 6) return true;
  if (weird > alpha * 0.6 && alpha < 25) return true;

  if (
    v.length > 120 &&
    !/@|\+?\d/.test(v) &&
    !/\b(embassy|consulate|director|manager|secretary|street|suite|office|phone|email|ashgabat|bishkek|turkmenistan|kg|dc)\b/i.test(v)
  ) {
    return true;
  }

  return false;
}

function cleanLikelyNoiseLines(lines: string[]): string[] {
  return uniqueStrings(lines.map(cleanSemanticLine).filter((l) => !isLikelyNoiseLine(l)));
}

function cleanPhoneCandidate(phone: string): string {
  let v = normalizeLine(phone);
  v = v.replace(/(?:ext\.?|extension|x)\s*\d+.*$/i, "").trim();
  // Remove dangling isolated trailing digits caused by OCR bleed.
  v = v.replace(/(?:\s+\d){1,2}$/, "").trim();
  const digits = v.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 20) return "";
  return v;
}

function scoreParsedCard(card: Omit<BusinessCard, "id">): number {
  let score = 0;
  if (card.name) score += 45;
  if (card.company) score += 30;
  if (card.title) score += 20;
  if (card.email && isValidEmail(card.email)) score += 40;
  if (card.phone) score += 30;
  if (card.website) score += 15;
  if (card.address) score += 20;
  if (card.name && card.name.split(/\s+/).length >= 2) score += 10;
  if (card.address.length > 20) score += 8;
  if (card.company && card.company.length < 2) score -= 25;
  if (card.name && /\d/.test(card.name)) score -= 30;
  if (card.title && card.title.length < 3) score -= 10;
  return score;
}

async function preprocessImageForOcr(imageSrc: string): Promise<string> {
  if (typeof Image === "undefined" || typeof document === "undefined") return imageSrc;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to load image for OCR preprocessing."));
    el.src = imageSrc;
  });

  const maxWidth = 2600;
  const scale = Math.min(2, maxWidth / Math.max(img.width, 1));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageSrc;

  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Grayscale + contrast stretch for text clarity.
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    gray = (gray - 128) * 1.45 + 128;
    if (gray < 0) gray = 0;
    if (gray > 255) gray = 255;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
}

function extractNameCandidates(lines: string[]): string[] {
  const out: string[] = [];
  const nameRegex = /\b([A-ZА-ЯЁ][a-zа-яё'-]{2,})\s+([A-ZА-ЯЁ][a-zа-яё'-]{2,})(?:\s+([A-ZА-ЯЁ][a-zа-яё'-]{2,}))?\b/gu;
  for (const line of lines) {
    const matches = Array.from(line.matchAll(nameRegex));
    for (const m of matches) {
      const candidate = sanitizeOcrLine(m[0] || "");
      if (!candidate) continue;
      const words = tokenizeWords(candidate);
      if (words.length < 2 || words.length > 3) continue;
      if (words.some((w) => NAME_STOPWORDS.has(w.toLowerCase()))) continue;
      out.push(candidate);
    }
  }
  return uniqueStrings(out);
}

function extractTitleFromSegment(segment: string): string {
  const s = cleanupFieldText(segment);
  if (!s) return "";
  const anchorRe =
    /\b(second|first|third|deputy|assistant|chief|senior|junior|lead|principal|secretary|director|manager|engineer|advisor|officer|commercial|economic|public|consular|affairs)\b/i;
  const m = s.match(anchorRe);
  if (!m || m.index === undefined) return s;
  return cleanupFieldText(s.slice(m.index));
}

type PositionedWord = {
  text: string;
  conf: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  xc: number;
  yc: number;
  h: number;
};

type OCRLine = {
  words: PositionedWord[];
  text: string;
  xc: number;
  yc: number;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const arr = [...values].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function looksLikeAddressLine(line: string): boolean {
  const l = line.trim();
  if (!l) return false;
  if (/@/.test(l)) return false;
  if (ADDRESS_RE.test(l)) return true;
  if (/\d/.test(l) && /[A-Za-zА-Яа-яЁё]/.test(l)) return true;
  if (/^[\p{L} .'-]+,\s*[\p{L} .'-]+$/u.test(l)) return true;
  return false;
}

function buildLinesFromWords(words: OCRWord[]): OCRLine[] {
  const positioned: PositionedWord[] = words
    .map((w) => {
      const text = sanitizeOcrLine(String(w.text || ""));
      const conf = Number(w.confidence);
      const box = w.bbox || {};
      const x0 = Number(box.x0);
      const y0 = Number(box.y0);
      const x1 = Number(box.x1);
      const y1 = Number(box.y1);
      if (!text) return null;
      if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
      if (x1 <= x0 || y1 <= y0) return null;
      if (Number.isFinite(conf) && conf < 20 && text.length <= 3) return null;
      if (!/[A-Za-zА-Яа-яЁё0-9@.+]/.test(text)) return null;
      return {
        text,
        conf: Number.isFinite(conf) ? conf : 0,
        x0,
        y0,
        x1,
        y1,
        xc: (x0 + x1) / 2,
        yc: (y0 + y1) / 2,
        h: y1 - y0,
      };
    })
    .filter((v): v is PositionedWord => Boolean(v))
    .sort((a, b) => a.yc - b.yc || a.x0 - b.x0);

  if (positioned.length === 0) return [];

  const threshold = Math.max(8, median(positioned.map((w) => w.h)) * 0.7);
  const lines: OCRLine[] = [];

  for (const word of positioned) {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < lines.length; i += 1) {
      const d = Math.abs(lines[i].yc - word.yc);
      if (d <= threshold && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      lines.push({ words: [word], text: word.text, xc: word.xc, yc: word.yc });
    } else {
      const line = lines[bestIdx];
      line.words.push(word);
      line.yc = line.words.reduce((s, w) => s + w.yc, 0) / line.words.length;
      line.xc = line.words.reduce((s, w) => s + w.xc, 0) / line.words.length;
    }
  }

  for (const line of lines) {
    line.words.sort((a, b) => a.x0 - b.x0);
    line.text = line.words.map((w) => w.text).join(" ");
  }

  return lines.sort((a, b) => a.yc - b.yc);
}

function parseBusinessCardFromWordLayout(words: OCRWord[] | undefined, textFallback: string): Omit<BusinessCard, "id"> | null {
  if (!words || words.length === 0) return null;
  const lines = buildLinesFromWords(words);
  if (lines.length === 0) return null;

  const base = parseBusinessCardText(textFallback);
  const splitX = median(lines.map((l) => l.xc));
  const left = cleanLikelyNoiseLines(lines.filter((l) => l.xc < splitX - 10).map((l) => l.text));
  const right = cleanLikelyNoiseLines(lines.filter((l) => l.xc > splitX + 10).map((l) => l.text));
  const all = cleanLikelyNoiseLines(lines.map((l) => l.text));

  const name = extractNameCandidates(right)[0] || extractNameCandidates(all)[0] || base.name;

  const title = uniqueStrings(
    right
      .filter((l) => TITLE_RE.test(l))
      .map((l) => extractTitleFromSegment(l))
      .filter(Boolean),
  )
    .slice(0, 3)
    .join(", ") || base.title;

  const companyCandidates: string[] = [];
  for (let i = 0; i < left.length; i += 1) {
    const cur = left[i];
    const next = left[i + 1] || "";
    if (COMPANY_RE.test(cur) && !looksLikeAddressLine(cur)) companyCandidates.push(cur);
    if (next && COMPANY_RE.test(next) && !looksLikeAddressLine(cur) && !TITLE_RE.test(cur)) {
      companyCandidates.push(`${cur} ${next}`);
    }
  }
  const company =
    cleanupFieldText(companyCandidates.find((c) => c.length >= 3) || "") ||
    cleanupFieldText(base.company);

  const addressCandidates = uniqueStrings(left.filter((l) => looksLikeAddressLine(l)));
  let address = cleanupFieldText(addressCandidates.join(", ") || base.address);
  if (company && address.toLowerCase().startsWith(company.toLowerCase())) {
    address = cleanupFieldText(address.slice(company.length));
  }

  return {
    ...base,
    name: cleanupFieldText(name),
    title: cleanupFieldText(title),
    company,
    address,
  };
}

function parseBusinessCardFromOcrData(data: OCRResultData): Omit<BusinessCard, "id"> {
  const text = String(data.text || "");
  const textParsed = parseBusinessCardText(text);
  const layoutParsed = parseBusinessCardFromWordLayout(data.words, text);
  if (!layoutParsed) return textParsed;
  return scoreParsedCard(layoutParsed) >= scoreParsedCard(textParsed) ? layoutParsed : textParsed;
}

function parseBusinessCardText(text: string): Omit<BusinessCard, "id"> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => sanitizeOcrLine(l))
    .filter(Boolean);

  const cleanedInputLines = cleanLikelyNoiseLines(lines);
  const joined = cleanedInputLines.join("\n");

  const emails = dedupeBy(
    [
      ...Array.from(joined.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((m) => normalizeEmailCandidate(m[0].trim())),
      ...cleanedInputLines
        .filter((l) => l.includes("@"))
        .map((l) => normalizeEmailCandidate(l))
        .filter(isValidEmail),
    ],
    (v) => v.toLowerCase(),
  );
  const email = emails[0] || "";

  const phones = dedupeBy(
    Array.from(joined.matchAll(/\+?\d[\d\s().-]{6,}\d/g)).map((m) => m[0].trim()),
    (v) => cleanPhoneCandidate(v).replace(/[^\d+]/g, ""),
  );
  const cleanPhones = phones.map(cleanPhoneCandidate).filter(Boolean);
  const phone = cleanPhones[0] || "";

  const websiteRaw = pickFirstMatch(
    joined.replace(email, " "),
    /((https?:\/\/)?(www\.)?[a-z0-9.-]+\.[a-z]{2,})(\/[^\s]*)?/i,
  );
  const spacedWebsite = pickFirstMatch(
    joined.replace(email, " "),
    /\b((?:www\.)?[a-z0-9-]{2,})\s+([a-z]{2,3})\b/i,
  );
  const spacedWebsiteFixed = spacedWebsite ? spacedWebsite.replace(/\s+/, ".") : "";
  const website = normalizeWebsiteCandidate(websiteRaw && !websiteRaw.includes("@") ? websiteRaw : spacedWebsiteFixed);

  const contactTokens = [...emails, ...cleanPhones];
  if (website) contactTokens.push(website);

  const nonContactLines = cleanedInputLines
    .map((l) => stripContactTokens(l, contactTokens))
    .map((l) => cleanSemanticLine(l))
    .filter(Boolean)
    .filter((l) => !isLikelyNoiseLine(l));

  const looksLikeName = (l: string) => {
    const v = l.trim();
    if (v.length < 4 || v.length > 56) return false;
    if (/\d|@/.test(v)) return false;
    if (TITLE_RE.test(v) || COMPANY_RE.test(v) || ADDRESS_RE.test(v)) return false;

    const tokens = v
      .split(/\s+/)
      .map((t) => t.replace(/^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё'-]+$/g, ""))
      .filter(Boolean);
    if (tokens.length < 2 || tokens.length > 4) return false;
    return tokens.every((t) => /^[A-ZА-ЯЁ][\p{L}'-]+$/u.test(t));
  };

  const looksLikeTitle = (l: string) => TITLE_RE.test(l);
  const looksLikeCompany = (l: string) => COMPANY_RE.test(l);
  const looksLikeAddress = (l: string) => {
    if (/@/.test(l)) return false;
    if (ADDRESS_RE.test(l)) return true;
    if (/\d/.test(l) && /[A-Za-zА-Яа-яЁё]/.test(l)) return true;
    if (/^[\p{L} .'-]+,\s*[\p{L} .'-]+$/u.test(l)) return true;
    return false;
  };

  const heuristicName = nonContactLines.find(looksLikeName) || "";
  const explicitNameCandidates = extractNameCandidates(nonContactLines);
  const extractedName = explicitNameCandidates[0] || extractBestNameCandidate(nonContactLines, looksLikeTitle, looksLikeAddress);
  const name = extractedName || heuristicName;

  const remaining = nonContactLines
    .map((l) => (name ? stripContactTokens(l, [name]) : l))
    .filter(Boolean);

  const splitSegments = remaining
    .flatMap((l) => l.split(/\s*,\s*/g))
    .map((s) => cleanSemanticLine(s))
    .filter(Boolean)
    .filter((l) => !isLikelyNoiseLine(l))
    .filter((l) => l.length <= 120);

  const titleLines = uniqueStrings(
    splitSegments
      .filter((l) => looksLikeTitle(l) && !looksLikeAddress(l))
      .map((l) => extractTitleFromSegment(l))
      .filter(Boolean),
  );
  const title = titleLines.slice(0, 3).join(", ");

  const remaining2 = uniqueStrings(
    splitSegments.filter((l) => !titleLines.includes(l)),
  );

  const looksLikePersonishLine = (l: string) => {
    const words = tokenizeWords(l);
    if (words.length < 2 || words.length > 5) return false;
    return words.filter((w) => isTitleCaseWord(w)).length >= 2;
  };

  const company =
    remaining2.find((l) => looksLikeCompany(l) && !looksLikeAddress(l)) ||
    remaining2.find((l) => l.length <= 64 && !looksLikeAddress(l) && !looksLikeTitle(l) && !looksLikePersonishLine(l)) ||
    "";

  const remaining3 = remaining2.filter((l) => l !== company);
  const addressLines = remaining3.filter((l) => looksLikeAddress(l));
  const fallbackAddressLines = remaining3.filter((l) => !looksLikeTitle(l));
  const address = cleanupFieldText((addressLines.length > 0 ? addressLines : fallbackAddressLines).join(", ").trim());

  return {
    name: cleanupFieldText(name),
    title: cleanupFieldText(title).slice(0, 120),
    company: cleanupFieldText(company).slice(0, 100),
    email: isValidEmail(email) ? email : "",
    phone: cleanPhoneCandidate(phone),
    website: normalizeWebsiteCandidate(website),
    address: cleanupFieldText(address).slice(0, 160),
  };
}

export async function extractCardDataOnDeviceOcr(
  base64Image: string,
  langs: string,
  onProgress?: (progress: number, status?: string) => void,
): Promise<BusinessCard> {
  const worker = await getWorker(langs, onProgress);
  const candidates: Array<Omit<BusinessCard, "id">> = [];

  const runPass = async (image: string, psm: string) => {
    await worker.setParameters?.({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
      tessedit_pageseg_mode: psm,
    });
    const ret = await worker.recognize(
      image,
      {},
      {
        text: true,
        words: true,
      },
    );
    candidates.push(parseBusinessCardFromOcrData(ret.data));
  };

  await runPass(base64Image, "6");

  try {
    const enhancedImage = await preprocessImageForOcr(base64Image);
    await runPass(enhancedImage, "6");
  } catch (err) {
    console.warn("OCR preprocessing pass failed, using original OCR output:", err);
  }

  // Multi-column cards often do better with sparse text mode.
  await runPass(base64Image, "11");

  const parsed =
    candidates.sort((a, b) => scoreParsedCard(b) - scoreParsedCard(a))[0] ||
    parseBusinessCardText("");

  return {
    id: crypto.randomUUID(),
    ...parsed,
  };
}
