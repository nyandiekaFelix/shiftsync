import { SetMetadata } from '@nestjs/common';

export type LocationSource = 'params' | 'query' | 'body';
export const LOCATION_SOURCE_KEY = 'locationSource';
export const LocationSource = (source: LocationSource) =>
  SetMetadata(LOCATION_SOURCE_KEY, source);
