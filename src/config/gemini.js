import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './env.js';

let genAIInstance = null;

export function getGeminiClient() {
  if (genAIInstance) {
    return genAIInstance;
  }

  if (config.gemini.apiKey) {
    genAIInstance = new GoogleGenerativeAI(config.gemini.apiKey);
    return genAIInstance;
  }

  return null;
}

export function getGeminiModel(modelName = config.gemini.model || 'gemini-2.0-flash') {
  const ai = getGeminiClient();
  if (!ai) return null;

  try {
    return ai.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });
  } catch (err) {
    console.warn(`[GeminiConfig] Failed to init model ${modelName}:`, err.message);
    return null;
  }
}
