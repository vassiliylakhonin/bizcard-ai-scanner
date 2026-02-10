import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";

function loadDotEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // ignore missing file
  }
}

// Load local env if present. This is intentionally minimal to keep the server dependency-free.
loadDotEnvFile(path.resolve(process.cwd(), ".env.local"));
loadDotEnvFile(path.resolve(process.cwd(), ".env"));

const PORT = Number(process.env.PORT || 8787);
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn(
    "[server] GEMINI_API_KEY is not set. /api/extract will fail until you export it or set it in .env.local/.env.",
  );
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

const CARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Full name of the person" },
    title: { type: Type.STRING, description: "Job title or position" },
    company: { type: Type.STRING, description: "Company name" },
    email: { type: Type.STRING, description: "Email address" },
    phone: { type: Type.STRING, description: "Phone number" },
    website: { type: Type.STRING, description: "Website URL" },
    address: { type: Type.STRING, description: "Physical address" },
  },
  required: ["name", "company"],
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

async function readJson(req, maxBytes = 12 * 1024 * 1024) {
  return await new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      data += chunk.toString("utf8");
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url === "/api/extract") {
    if (!apiKey) {
      sendJson(res, 500, { error: "GEMINI_API_KEY is not configured on the server." });
      return;
    }

    try {
      const body = await readJson(req);
      const base64Image = body.base64Image || body.imageBase64 || "";
      if (!base64Image || typeof base64Image !== "string") {
        sendJson(res, 400, { error: "Missing base64Image" });
        return;
      }

      const cleanBase64 = base64Image.split(",")[1] || base64Image;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: cleanBase64,
              },
            },
            {
              text: "Analyze this business card image. Extract the contact details into the specified JSON structure. Be precise with Cyrillic or Latin characters. If a field is missing, leave it as an empty string.",
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: CARD_SCHEMA,
          systemInstruction:
            "You are an expert OCR assistant specialized in digitizing business cards. You accurately detect languages including Russian and English.",
        },
      });

      const text = response.text;
      if (!text) {
        sendJson(res, 502, { error: "No response from Gemini" });
        return;
      }

      const data = JSON.parse(text);
      sendJson(res, 200, {
        name: data.name || "",
        title: data.title || "",
        company: data.company || "",
        email: data.email || "",
        phone: data.phone || "",
        website: data.website || "",
        address: data.address || "",
      });
      return;
    } catch (err) {
      console.error("[server] extract error:", err);
      sendJson(res, 500, { error: err?.message || "Extraction failed" });
      return;
    }
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
