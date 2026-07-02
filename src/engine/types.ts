export type Confidence = 'high' | 'medium' | 'low';
export type ValidatorType = 'checksum' | 'format' | 'heuristic';

export interface Detection {
  type: string;
  start: number;
  end: number;
  value: string;
  confidence: Confidence;
  validator: ValidatorType;
}

export interface EngineConfig {
  enabledTypes: string[];
  minConfidence: Confidence;
  language: 'auto' | 'ru' | 'en';
}
