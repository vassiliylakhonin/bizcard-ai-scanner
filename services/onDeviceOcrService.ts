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

function parseBusinessCardText(text: string): Omit<BusinessCard, "id"> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => normalizeLine(l))
    .filter(Boolean);

  const joined = lines.join("\n");

  const email = pickFirstMatch(joined, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  // Very loose phone matcher; users can edit in the table.
  const phone = pickFirstMatch(joined, /(\+?\d[\d\s().-]{6,}\d)/);

  // Basic URL/domain matcher (excluding emails).
  const websiteRaw = pickFirstMatch(
    joined.replace(email, " "),
    /((https?:\/\/)?(www\.)?[a-z0-9.-]+\.[a-z]{2,})(\/[^\s]*)?/i,
  );

  const website = websiteRaw && websiteRaw.includes("@") ? "" : websiteRaw;

  const nonContactLines = lines.filter((l) => {
    const lower = l.toLowerCase();
    if (email && lower.includes(email.toLowerCase())) return false;
    if (website && lower.includes(website.toLowerCase())) return false;
    if (phone && l.replace(/\s+/g, "").includes(phone.replace(/\s+/g, ""))) return false;
    return true;
  });

  const looksLikeName = (l: string) => {
    // 2-4 words, mostly letters, starting with uppercase (Latin/Cyrillic).
    const v = l.trim();
    if (v.length < 3 || v.length > 48) return false;
    if (/\d/.test(v)) return false;
    if (/@/.test(v)) return false;
    return /^[A-ZА-ЯЁ][\p{L}'-]+(\s+[A-ZА-ЯЁ][\p{L}'-]+){1,3}$/u.test(v);
  };

  const looksLikeTitle = (l: string) => {
    const v = l.toLowerCase();
    return (
      /\b(ceo|cto|cfo|founder|manager|director|engineer|sales|marketing|product|operations)\b/.test(v) ||
      /(директор|менеджер|инженер|руководитель|продажи|маркетинг|разработ)/.test(v)
    );
  };

  const name = nonContactLines.find(looksLikeName) || "";

  const remaining = nonContactLines.filter((l) => l !== name);
  const title = remaining.find(looksLikeTitle) || "";

  const remaining2 = remaining.filter((l) => l !== title);

  // Company: pick a short line that isn't title and isn't obviously address.
  const company =
    remaining2.find((l) => l.length <= 64 && !looksLikeTitle(l) && !/(street|st\.|ave|road|ул\.|просп|дом|офис)/i.test(l)) ||
    "";

  const remaining3 = remaining2.filter((l) => l !== company);
  const address = remaining3.join(", ").trim();

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
