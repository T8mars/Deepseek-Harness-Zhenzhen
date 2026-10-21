import type { CanvasModels, CanvasModelsQuery } from './canvas-workflow-schema.ts';
/** Project the public native catalog only. Arbitrary parameters, credentials,
 * settings, blocker messages and other upstream fields never enter this DTO. */
export declare function canvasModelsView(input: CanvasModelsQuery, data: unknown): CanvasModels;
