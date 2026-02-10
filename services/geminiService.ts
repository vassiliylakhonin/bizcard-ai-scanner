import { GoogleGenAI, Type } from "@google/genai";
import { BusinessCard } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
  // Remove header if present (e.g., "data:image/jpeg;base64,")
  const cleanBase64 = base64Image.split(',')[1] || base64Image;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            text: "Analyze this business card image. Extract the contact details into the specified JSON structure. Be precise with Cyrillic or Latin characters. If a field is missing, leave it as an empty string."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: CARD_SCHEMA,
        systemInstruction: "You are an expert OCR assistant specialized in digitizing business cards. You accurately detect languages including Russian and English.",
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const data = JSON.parse(text);
    
    // Map to our internal structure with defaults
    return {
      id: crypto.randomUUID(),
      name: data.name || "",
      title: data.title || "",
      company: data.company || "",
      email: data.email || "",
      phone: data.phone || "",
      website: data.website || "",
      address: data.address || ""
    };
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};