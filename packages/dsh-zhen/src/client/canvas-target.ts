import type {CanvasWorkspaces} from 'dsh-zhen';

type CanvasTarget = CanvasWorkspaces['canvases'][number];

/** UI identity includes the project; list positions and names are not identities. */
export function canvasTargetKey(target: Pick<CanvasTarget, 'projectId' | 'id'>): string {
  return JSON.stringify([target.projectId, target.id]);
}

export function selectedCanvasTarget(report: CanvasWorkspaces, key: string): CanvasTarget | undefined {
  const matches = report.canvases.filter(target => canvasTargetKey(target) === key);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Keep the existing selection; only an explicitly complete singleton can be picked automatically. */
export function refreshedCanvasTarget(report: CanvasWorkspaces, previous = ''): string {
  if (previous) return selectedCanvasTarget(report, previous) ? previous : '';
  if (report.canvases.length === 1 && report.truncated === false && report.total === 1) return canvasTargetKey(report.canvases[0]);
  return '';
}
