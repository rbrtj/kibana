/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import type {
  AttachmentPanel,
  DashboardAttachmentData,
  DashboardSection,
} from '@kbn/agent-builder-dashboards-common';
import { isSection } from '@kbn/agent-builder-dashboards-common';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type { PanelContentAttempt } from '../resolve_panel';
import type { ResolvePanelContent } from './panels';
import type { ResolveAttachmentPanel } from './types';
import type { OperationFailure } from '../utils';

export type PanelGrid = AttachmentPanel['grid'];

const createMockLogger = (): Logger =>
  ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger);

export const logger = createMockLogger();

export const waitForNextEventLoopTurn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

export const getSections = (panels: DashboardAttachmentData['panels']): DashboardSection[] =>
  panels.filter(isSection);

export const getPanelsOnly = (panels: DashboardAttachmentData['panels']): AttachmentPanel[] =>
  panels.filter((p): p is AttachmentPanel => !isSection(p));

export const buildDashboard = (
  overrides: Partial<DashboardAttachmentData> = {}
): DashboardAttachmentData => ({
  title: 'Test dashboard',
  description: 'Description',
  panels: [],
  ...overrides,
});

export const lensPanel = (id: string, gridY = 0): AttachmentPanel => ({
  type: LENS_EMBEDDABLE_TYPE,
  id,
  config: { type: 'metric' },
  grid: { x: 0, y: gridY, w: 24, h: 9 },
});

export const section = (
  id: string,
  title: string,
  gridY: number,
  panels: AttachmentPanel[] = []
): DashboardSection => ({
  id,
  title,
  collapsed: false,
  grid: { y: gridY },
  panels,
});

interface NewPanelOverrides {
  grid?: PanelGrid;
  sectionId?: string;
}

export const requestItem = (query: string, overrides: NewPanelOverrides = {}) => ({
  source: 'request' as const,
  chartType: SupportedChartType.Metric,
  query,
  grid: { x: 0, y: 0, w: 24, h: 9 },
  ...overrides,
});

export const markdownItem = (content: string, overrides: NewPanelOverrides = {}) => ({
  source: 'config' as const,
  type: 'markdown' as const,
  config: { content, settings: { open_links_in_new_tab: true } },
  grid: { x: 0, y: 0, w: 48, h: 5 },
  ...overrides,
});

export const attachmentItem = (attachmentId: string, overrides: NewPanelOverrides = {}) => ({
  source: 'attachment' as const,
  attachment_id: attachmentId,
  grid: { x: 0, y: 0, w: 24, h: 9 },
  ...overrides,
});

export const success = (
  panelContent: Pick<AttachmentPanel, 'type' | 'config'>,
  authoringNote = 'Created a visualization using the requested data.'
): PanelContentAttempt => ({
  type: 'success',
  panelContent,
  authoringNote,
});

export const failure = (
  type: OperationFailure['type'],
  identifier: string,
  error: string
): PanelContentAttempt => ({
  type: 'failure',
  failure: { type, identifier, error },
});

export const METRIC_PANEL_CONTENT = { type: LENS_EMBEDDABLE_TYPE, config: { type: 'metric' } };

/** Resolves every attachment to a Lens metric, except `att-missing`, which fails. */
export const resolveAttachment: ResolveAttachmentPanel = (attachmentId, operationType) =>
  attachmentId === 'att-missing'
    ? failure(operationType, attachmentId, 'not found')
    : { type: 'success', panelContent: METRIC_PANEL_CONTENT };

export const mockPanelResolver = (
  implementation: ResolvePanelContent = async () => success(METRIC_PANEL_CONTENT)
) => jest.fn<ReturnType<ResolvePanelContent>, Parameters<ResolvePanelContent>>(implementation);

/** Resolves by identifier, defaulting to a Lens metric. */
export const createResolvePanelContent = (
  resultsByIdentifier: Record<string, PanelContentAttempt> = {}
): ResolvePanelContent => {
  return async ({ identifier }) => resultsByIdentifier[identifier] ?? success(METRIC_PANEL_CONTENT);
};

/** Holds every resolution open until the test settles it by identifier. */
export const deferredPanelResolver = () => {
  const pending = new Map<string, (attempt: PanelContentAttempt) => void>();
  const resolvePanelContent = mockPanelResolver(
    ({ identifier }) =>
      new Promise<PanelContentAttempt>((resolve) => {
        pending.set(identifier, resolve);
      })
  );
  const settle = (identifier: string, attempt: PanelContentAttempt): void => {
    const resolve = pending.get(identifier);
    if (!resolve) {
      throw new Error(`No pending resolution for "${identifier}"`);
    }
    resolve(attempt);
  };
  return { resolvePanelContent, settle };
};

export const optionsListControl = (id: string, fieldName: string) => ({
  type: 'options_list_control',
  id,
  width: 'medium',
  grow: true,
  config: { values_source: 'esql', esql_query: `FROM logs-* | STATS BY ${fieldName}` },
});
