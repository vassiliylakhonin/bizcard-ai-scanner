import { BusinessCard } from "../types";

type WorkerLike = {
  recognize: (image: string) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
};

type CreateWorkerOptions = {
  logger?: (m: unknown) => void;
  workerPath?: string;
  langPath?: string;
  corePath?: string;
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

    const worker = await createWorker(langs, 1, {
      // Self-hosted assets (same-origin) to avoid third-party CDNs.
      workerPath: assetPath("tesseract/worker.min.js"),
      corePath: assetPath("tesseract-core").replace(/\/$/, ""),
      langPath: assetPath("tessdata").replace(/\/$/, ""),
      gzip: true,
      logger: (m: unknown) => {
        if (!onProgress) return;
        if (typeof m !== "object" || m === null) return;
        const rec = m as Record<string, unknown>;
        const progress = typeof rec.progress === "number" ? rec.progress : undefined;
        const status = typeof rec.status === "string" ? rec.status : undefined;
        if (progress !== undefined) onProgress(progress, status);
      },
    });

    return worker;
  })();

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
    (v) => v.replace(/[^\d+]/g, ""),
  );
  const phone = phones[0] || "";

  const websiteRaw = pickFirstMatch(
    joined.replace(email, " "),
    /((https?:\/\/)?(www\.)?[a-z0-9.-]+\.[a-z]{2,})(\/[^\s]*)?/i,
  );
  const website = websiteRaw && websiteRaw.includes("@") ? "" : websiteRaw;

  const contactTokens = [...emails, ...phones];
  if (website) contactTokens.push(website);

  const nonContactLines = lines.map((l) => stripContactTokens(l, contactTokens)).filter(Boolean);

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

  const name = nonContactLines.find(looksLikeName) || "";

  const remaining = nonContactLines.filter((l) => l !== name);
  const titleLines = remaining.filter((l) => looksLikeTitle(l) && !looksLikeAddress(l));
  const title = titleLines.slice(0, 2).join(", ");

  const remaining2 = remaining.filter((l) => !titleLines.includes(l));
  const company =
    remaining2.find((l) => looksLikeCompany(l) && !looksLikeAddress(l)) ||
    remaining2.find((l) => l.length <= 64 && !looksLikeAddress(l)) ||
    "";

  const remaining3 = remaining2.filter((l) => l !== company);
  const addressLines = remaining3.filter((l) => looksLikeAddress(l));
  const fallbackAddressLines = remaining3.filter((l) => !looksLikeTitle(l));
  const address = (addressLines.length > 0 ? addressLines : fallbackAddressLines).join(", ").trim();

  return {
    name,
    title,
    company,
    email,
    phone,
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
  const ret = await worker.recognize(base64Image);

  const parsed = parseBusinessCardText(ret.data.text || "");
  return {
    id: crypto.randomUUID(),
    ...parsed,
  };
}
