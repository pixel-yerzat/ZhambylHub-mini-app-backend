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

export function getGeminiModel(modelName = config.gemini.model) {
  const ai = getGeminiClient();
  if (!ai) return null;

  return ai.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1, // Low temperature for consistent semantic verification
    },
  });
}
