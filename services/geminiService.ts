
import { GoogleGenAI, Type } from "@google/genai";
import { DeliveryStop, ExtractionResult } from "../types";

export const extractAddressesFromImage = async (base64DataUrl: string): Promise<ExtractionResult> => {
  // Inicialização dentro da função para garantir o uso da chave de ambiente mais recente
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  
  // Extração segura do tipo MIME e dos dados base64
  const matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error("O formato da imagem é inválido ou está corrompido.");
  }
  
  const mimeType = matches[1];
  const base64Data = matches[2];

  const EXTRACTION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      stops: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            stopNumber: { 
              type: Type.STRING, 
              description: "O número identificador da parada ou do pacote. Procure por números grandes ou IDs de rastreio." 
            },
            address: { type: Type.STRING, description: "O endereço completo (rua e número)." },
            cep: { type: Type.STRING, description: "O CEP (formato 00000-000)." },
            city: { type: Type.STRING, description: "Nome da cidade." },
          },
          required: ["stopNumber", "address", "cep", "city"],
        },
      },
    },
    required: ["stops"],
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              },
            },
            {
              text: "Você é um assistente de logística. Analise este print de um aplicativo de entregas. Extraia todos os pacotes/paradas visíveis. Ignore propagandas, mapas ou menus do sistema Android. Foque em: Número do Pacote/Parada, Endereço, CEP e Cidade. Retorne estritamente o JSON solicitado.",
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: EXTRACTION_SCHEMA,
      },
    });

    const jsonStr = response.text.trim();
    const parsed = JSON.parse(jsonStr) as ExtractionResult;
    
    if (!parsed.stops || !Array.isArray(parsed.stops)) {
      return { stops: [] };
    }

    // Adiciona IDs únicos e limpa strings
    parsed.stops = parsed.stops.map((stop, index) => ({
      ...stop,
      id: `stop-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      stopNumber: String(stop.stopNumber).trim(),
      address: stop.address.trim(),
      cep: stop.cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2'), // Garante formato 00000-000
      city: stop.city.trim(),
      confidence: 1.0
    }));

    return parsed;
  } catch (error) {
    console.error("Erro na API Gemini:", error);
    throw new Error("Falha ao processar a imagem. Verifique sua conexão ou tente um print mais nítido.");
  }
};
