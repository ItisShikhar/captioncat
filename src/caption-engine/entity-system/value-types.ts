export type DistanceUnit = 'pt' | 'percent';

export interface VectorRange {
  x: [number, number];
  y: [number, number];
}

export type RandomizerRange = [number, number] | VectorRange;
