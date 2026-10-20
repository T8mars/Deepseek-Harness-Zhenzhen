import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types';
import { TYPERT_REMOTE } from './remote.ts';

/** Public, hand-written schema contribution supported by dsh-typert-loader. */
export const TYPERT: TypertContribution = {
  package: 'dsh-zhen', face: 'host', schemas: [],
  model: { services: [], events: [], objects: [] },
  get invocations() { return TYPERT_REMOTE.descriptors; },
};
