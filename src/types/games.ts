import { z } from 'zod';

export const gameLanguagesSchema = z.array(z.string()).default([]);
export const gameFeaturesSchema = z.array(z.string()).default([]);

export type GameLanguages = z.infer<typeof gameLanguagesSchema>;
export type GameFeatures = z.infer<typeof gameFeaturesSchema>;

export function parseGameLanguages(value: unknown): GameLanguages {
  return gameLanguagesSchema.parse(value);
}
export function parseGameFeatures(value: unknown): GameFeatures {
  return gameFeaturesSchema.parse(value);
}
