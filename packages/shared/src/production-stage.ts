import { z } from 'zod';

export const productionStageSchema = z.enum([
  'MANUSCRIPT_RECEIVED',
  'EDITING',
  'COVER_DESIGN',
  'TYPESETTING',
  'PROOFREADING',
  'ISBN_ASSIGNMENT',
  'PRINTING',
  'DISTRIBUTION_SETUP',
  'PUBLISHED_LIVE',
]);
export type ProductionStage = z.infer<typeof productionStageSchema>;

export function isPublished(stage: ProductionStage) {
  return stage === 'PUBLISHED_LIVE';
}

export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = {
  MANUSCRIPT_RECEIVED: 'Manuscript Received',
  EDITING: 'Editing',
  COVER_DESIGN: 'Cover Design',
  TYPESETTING: 'Typesetting',
  PROOFREADING: 'Proofreading',
  ISBN_ASSIGNMENT: 'ISBN Assignment',
  PRINTING: 'Printing',
  DISTRIBUTION_SETUP: 'Distribution Setup',
  PUBLISHED_LIVE: 'Published & Live',
};
