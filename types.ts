
export interface DeliveryStop {
  id: string;
  stopNumber: string; // Changed to string for flexibility (e.g., "01" or "PK-123")
  address: string;
  cep: string;
  city: string;
  confidence: number;
}

export interface ExtractionResult {
  stops: DeliveryStop[];
}

export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}
