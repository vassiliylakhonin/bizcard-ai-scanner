import { BusinessCard } from "../types";

type WorkerLike = {
  recognize: (image: string) => Promise<{ data: { text: string } }>;
  setParameters?: (params: Record<string, string>) => Promise<void>;
  terminate: () => Promise<void>;
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

function cleanPhoneCandidate(phone: string): string {
  let v = normalizeLine(phone);
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

function parseBusinessCardText(text: string): Omit<BusinessCard, "id"> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => sanitizeOcrLine(l))
    .filter(Boolean);

  const joined = lines.join("\n");

  const emails = dedupeBy(
    Array.from(joined.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((m) => m[0].trim()),
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
  const website = websiteRaw && !websiteRaw.includes("@") ? websiteRaw : spacedWebsiteFixed;

  const contactTokens = [...emails, ...cleanPhones];
  if (website) contactTokens.push(website);

  const nonContactLines = lines
    .map((l) => stripContactTokens(l, contactTokens))
    .map((l) => cleanSemanticLine(l))
    .filter(Boolean);

  const titleRe = new RegExp(
    [
      "\\b(ceo|cto|cfo|coo|founder|manager|director|head|lead|engineer|sales|marketing|product|operations|secretary|assistant|advisor|officer|president|vice president)\\b",
      "(директор|менеджер|инженер|руководитель|продажи|маркетинг|разработчик|секретарь|советник)",
      "(commercial affairs|economic affairs|public affairs|consular affairs)",
    ].join("|"),
    "i",
  );

  const companyRe = new RegExp(
    [
      "\\b(embassy|consulate|ministry|department|agency|university|institute|bank|group|solutions|studio|company|corp|corporation|inc|llc|ltd|gmbh|s\\.?a\\.?)\\b",
      "(посольство|консульство|университет|компания|министерство)",
    ].join("|"),
    "i",
  );

  const addressRe =
    /\b(street|st\.|avenue|ave\.|road|rd\.|boulevard|blvd|lane|ln\.|drive|dr\.|suite|ste\.|office|building|floor|city|state|zip|postal|p\.?o\.?\s*box|box|ул\.|улица|просп|дом|офис|ashgabat|turkmenistan)\b/i;

  const looksLikeName = (l: string) => {
    const v = l.trim();
    if (v.length < 4 || v.length > 56) return false;
    if (/\d|@/.test(v)) return false;
    if (titleRe.test(v) || companyRe.test(v) || addressRe.test(v)) return false;

    const tokens = v
      .split(/\s+/)
      .map((t) => t.replace(/^[^A-Za-zА-Яа-яЁё]+|[^A-Za-zА-Яа-яЁё'-]+$/g, ""))
      .filter(Boolean);
    if (tokens.length < 2 || tokens.length > 4) return false;
    return tokens.every((t) => /^[A-ZА-ЯЁ][\p{L}'-]+$/u.test(t));
  };

  const looksLikeTitle = (l: string) => titleRe.test(l);
  const looksLikeCompany = (l: string) => companyRe.test(l);
  const looksLikeAddress = (l: string) => {
    if (/@/.test(l)) return false;
    if (addressRe.test(l)) return true;
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
    .filter(Boolean);

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
    title: cleanupFieldText(title),
    company: cleanupFieldText(company),
    email: isValidEmail(email) ? email : "",
    phone: cleanPhoneCandidate(phone),
    website,
    address,
  };
}

export async function extractCardDataOnDeviceOcr(
  base64Image: string,
  langs: string,
  onProgress?: (progress: number, status?: string) => void,
): Promise<BusinessCard> {
  const worker = await getWorker(langs, onProgress);
  await worker.setParameters?.({
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
    tessedit_pageseg_mode: "6",
  });

  const retOriginal = await worker.recognize(base64Image);
  const parsedOriginal = parseBusinessCardText(retOriginal.data.text || "");

  let bestParsed = parsedOriginal;
  let bestScore = scoreParsedCard(parsedOriginal);

  try {
    const enhancedImage = await preprocessImageForOcr(base64Image);
    const retEnhanced = await worker.recognize(enhancedImage);
    const parsedEnhanced = parseBusinessCardText(retEnhanced.data.text || "");
    const enhancedScore = scoreParsedCard(parsedEnhanced);
    if (enhancedScore > bestScore) {
      bestParsed = parsedEnhanced;
      bestScore = enhancedScore;
    }
  } catch (err) {
    console.warn("OCR preprocessing pass failed, using original OCR output:", err);
  }

  const parsed = bestParsed;
  return {
    id: crypto.randomUUID(),
    ...parsed,
  };
}
