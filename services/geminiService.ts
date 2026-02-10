import { GoogleGenAI, Type } from "@google/genai";
import { BusinessCard } from "../types";
import { getStoredGeminiApiKey, getStoredOcrLangs, getStoredProcessingMode } from "../utils/settings";
import { extractCardDataOnDeviceOcr } from "./onDeviceOcrService";

const CARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Full name of the person" },
    title: { type: Type.STRING, description: "Job title or position" },
    company: { type: Type.STRING, description: "Company name" },
    email: { type: Type.STRING, description: "Email address" },
    phone: { type: Type.STRING, description: "Phone number" },
    website: { type: Type.STRING, description: "Website URL" },
    address: { type: Type.STRING, description: "Physical address" }
  },
  required: ["name", "company"],
};

export const extractCardData = async (base64Image: string): Promise<BusinessCard> => {
  const mode = getStoredProcessingMode();
  if (mode === "on_device_ocr") {
    const langs = getStoredOcrLangs();
    return await extractCardDataOnDeviceOcr(base64Image, langs);
  }

  // Remove header if present (e.g., "data:image/jpeg;base64,")
  const cleanBase64 = base64Image.split(",")[1] || base64Image;

  try {
    const useBackend = (import.meta.env.VITE_USE_BACKEND || "").toLowerCase() === "true";
    const backendUrl = (import.meta.env.VITE_BACKEND_URL || "").trim().replace(/\/$/, "");

    if (useBackend || backendUrl) {
      const endpoint = backendUrl ? `${backendUrl}/api/extract` : "/api/extract";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || `Backend error (${res.status})`);
      }

      return {
        id: crypto.randomUUID(),
        name: payload.name || "",
        title: payload.title || "",
        company: payload.company || "",
        email: payload.email || "",
        phone: payload.phone || "",
        website: payload.website || "",
        address: payload.address || "",
      };
    }

    const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || "").trim();
    const storedKey = getStoredGeminiApiKey();

    const finalKey = storedKey || apiKey;
    if (!finalKey) {
      throw new Error(
        "Missing Gemini API key. Set VITE_GEMINI_API_KEY in .env.local, enable the backend proxy, or paste a key in Settings.",
      );
    }

    const ai = new GoogleGenAI({ apiKey: finalKey });
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
    if (!text) throw new Error("No response from AI");

    const data = JSON.parse(text);

    return {
      id: crypto.randomUUID(),
      name: data.name || "",
      title: data.title || "",
      company: data.company || "",
      email: data.email || "",
      phone: data.phone || "",
      website: data.website || "",
      address: data.address || "",
    };
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};
