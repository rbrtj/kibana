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
import { MARKDOWN_EMBEDDABLE_TYPE } from '@kbn/dashboard-markdown-schemas';
import { CUSTOM_CONTENT_EMBEDDABLE_TYPE } from '@kbn/custom-content-common';
import type { PanelContentAttempt } from './resolve_panel';
import type { ResolvePanelContent } from './operations/panels';
import {
  executeDashboardOperations,
  dashboardOperationSchema,
  type DashboardOperation,
} from './operations';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { VEGA_VIS_TYPE } from '@kbn/agent-builder-visualizations-common';
import { DASHBOARD_OPERATION_FAILURE_TYPES } from './failure_types';
import type {
  ControlFieldCapability,
  ResolveAttachmentPanel,
  ResolveControlFieldCapabilities,
} from './operations/types';
import type { OperationFailure } from './utils';

type PanelGrid = AttachmentPanel['grid'];

const usable = (type: string): ControlFieldCapability => ({ status: 'usable', type });
const NOT_AGGREGATABLE: ControlFieldCapability = { status: 'not_aggregatable' };
const CONFLICTING: ControlFieldCapability = { status: 'conflicting' };

const createFieldCapabilitiesResolver = (
  fields: Readonly<Record<string, ControlFieldCapability>>
) =>
  jest.fn<ReturnType<ResolveControlFieldCapabilities>, Parameters<ResolveControlFieldCapabilities>>(
    async () => new Map(Object.entries(fields))
  );

const createMockLogger = (): Logger =>
  ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger);

const logger = createMockLogger();

const waitForNextEventLoopTurn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const getSections = (panels: DashboardAttachmentData['panels']): DashboardSection[] =>
  panels.filter(isSection);

const getPanelsOnly = (panels: DashboardAttachmentData['panels']): AttachmentPanel[] =>
  panels.filter((p): p is AttachmentPanel => !isSection(p));

const getEsqlQueries = ({ pinned_panels: pinnedPanels = [] }: DashboardAttachmentData) =>
  pinnedPanels.map(
    (panel) => (panel as unknown as { config: { esql_query?: string } }).config.esql_query
  );

const getControlTypes = ({ pinned_panels: pinnedPanels = [] }: DashboardAttachmentData) =>
  pinnedPanels.map(({ type }) => type);

const getControlIds = ({ pinned_panels: pinnedPanels = [] }: DashboardAttachmentData) =>
  pinnedPanels.map(({ id }) => id);

const buildDashboard = (
  overrides: Partial<DashboardAttachmentData> = {}
): DashboardAttachmentData => ({
  title: 'Test dashboard',
  description: 'Description',
  panels: [],
  ...overrides,
});

const lensPanel = (id: string, gridY = 0): AttachmentPanel => ({
  type: LENS_EMBEDDABLE_TYPE,
  id,
  config: { type: 'metric' },
  grid: { x: 0, y: gridY, w: 24, h: 9 },
});

const markdownPanel = (
  id: string,
  content: string,
  grid: PanelGrid = { x: 0, y: 0, w: 48, h: 5 }
): AttachmentPanel => ({
  id,
  type: MARKDOWN_EMBEDDABLE_TYPE,
  config: { content },
  grid,
});

const anomalyChartsPanel = (id: string): AttachmentPanel => ({
  id,
  type: 'ml_anomaly_charts',
  config: { job_ids: ['job-1'] },
  grid: { x: 0, y: 0, w: 24, h: 15 },
});

const anomalySwimlanePanel = (id: string): AttachmentPanel => ({
  id,
  type: 'ml_anomaly_swimlane',
  config: { job_ids: ['job-1'], swimlane_type: 'overall' },
  grid: { x: 0, y: 0, w: 48, h: 12 },
});

const singleMetricViewerPanel = (id: string): AttachmentPanel => ({
  id,
  type: 'ml_single_metric_viewer',
  config: { job_ids: ['job-1'] },
  grid: { x: 0, y: 0, w: 24, h: 15 },
});

const customContentPanel = (
  id: string,
  config: AttachmentPanel['config'] = { template: '<div>Old</div>' }
): AttachmentPanel => ({
  id,
  type: CUSTOM_CONTENT_EMBEDDABLE_TYPE,
  config,
  grid: { x: 0, y: 0, w: 24, h: 6 },
});

const vegaPanel = (id: string): AttachmentPanel => ({
  id,
  type: VEGA_VIS_TYPE,
  config: { spec: '{}' },
  grid: { x: 0, y: 0, w: 24, h: 9 },
});

const section = (
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

const requestItem = (query: string, overrides: NewPanelOverrides = {}) => ({
  source: 'request' as const,
  chartType: SupportedChartType.Metric,
  query,
  grid: { x: 0, y: 0, w: 24, h: 9 },
  ...overrides,
});

const markdownItem = (content: string, overrides: NewPanelOverrides = {}) => ({
  source: 'config' as const,
  type: 'markdown' as const,
  config: { content, settings: { open_links_in_new_tab: true } },
  grid: { x: 0, y: 0, w: 48, h: 5 },
  ...overrides,
});

const attachmentItem = (attachmentId: string, overrides: NewPanelOverrides = {}) => ({
  source: 'attachment' as const,
  attachment_id: attachmentId,
  grid: { x: 0, y: 0, w: 24, h: 9 },
  ...overrides,
});

const success = (
  panelContent: Pick<AttachmentPanel, 'type' | 'config'>,
  authoringNote = 'Created a visualization using the requested data.'
): PanelContentAttempt => ({
  type: 'success',
  panelContent,
  authoringNote,
});

const failure = (
  type: OperationFailure['type'],
  identifier: string,
  error: string
): PanelContentAttempt => ({
  type: 'failure',
  failure: { type, identifier, error },
});

const METRIC_PANEL_CONTENT = { type: LENS_EMBEDDABLE_TYPE, config: { type: 'metric' } };

/** Resolves every attachment to a Lens metric, except `att-missing`, which fails. */
const resolveAttachment: ResolveAttachmentPanel = (attachmentId, operationType) =>
  attachmentId === 'att-missing'
    ? failure(operationType, attachmentId, 'not found')
    : { type: 'success', panelContent: METRIC_PANEL_CONTENT };

const mockPanelResolver = (
  implementation: ResolvePanelContent = async () => success(METRIC_PANEL_CONTENT)
) => jest.fn<ReturnType<ResolvePanelContent>, Parameters<ResolvePanelContent>>(implementation);

/** Resolves by identifier, defaulting to a Lens metric. */
const createResolvePanelContent = (
  resultsByIdentifier: Record<string, PanelContentAttempt> = {}
): ResolvePanelContent => {
  return async ({ identifier }) => resultsByIdentifier[identifier] ?? success(METRIC_PANEL_CONTENT);
};

/** Holds every resolution open until the test settles it by identifier. */
const deferredPanelResolver = () => {
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

describe('executeDashboardOperations', () => {
  it('executes operations in order', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({
        title: 'Original title',
        description: 'Original description',
        panels: [lensPanel('existing-panel')],
      }),
      operations: [
        { operation: 'set_metadata', title: 'Draft title' },
        { operation: 'remove_panels', panelIds: ['existing-panel'] },
        {
          operation: 'add_panels',
          panels: [
            attachmentItem('metric-vis'),
            markdownItem('### Updated summary', { grid: { x: 0, y: 9, w: 48, h: 5 } }),
          ],
        },
        { operation: 'set_metadata', title: 'Updated title' },
      ],
      logger,
      resolveAttachmentPanel: resolveAttachment,
    });

    expect(result.dashboardData).toEqual({
      title: 'Updated title',
      description: 'Original description',
      panels: [
        {
          id: expect.any(String),
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'metric' },
          grid: { x: 0, y: 0, w: 24, h: 9 },
        },
        {
          id: expect.any(String),
          type: MARKDOWN_EMBEDDABLE_TYPE,
          config: { content: '### Updated summary', settings: { open_links_in_new_tab: true } },
          grid: { x: 0, y: 9, w: 48, h: 5 },
        },
      ],
    });
    expect(result.failures).toEqual([]);
  });

  describe('call-local section keys', () => {
    it('moves existing panels and adds resolved panels into newly keyed sections', async () => {
      const topPanel = lensPanel('top-panel');
      const nestedPanel = lensPanel('nested-panel');
      const dashboardData = buildDashboard({
        panels: [topPanel, section('existing-section', 'Existing', 0, [nestedPanel])],
      });
      const operations: DashboardOperation[] = [
        { operation: 'add_section', key: 'overview', title: 'Metrics', grid: { y: 10 } },
        { operation: 'add_section', key: 'details', title: 'Metrics', grid: { y: 20 } },
        {
          operation: 'update_panel_layouts',
          panels: [
            { panelId: topPanel.id, sectionId: 'overview' },
            {
              panelId: nestedPanel.id,
              sectionId: 'details',
              grid: { x: 0, y: 2, w: 48, h: 8 },
            },
          ],
        },
        {
          operation: 'add_panels',
          panels: [
            markdownItem('Summary', { sectionId: 'overview', grid: { x: 0, y: 9, w: 48, h: 5 } }),
            requestItem('show total requests', {
              sectionId: 'details',
              grid: { x: 0, y: 10, w: 24, h: 9 },
            }),
          ],
        },
      ];
      const originalInputs = structuredClone({ dashboardData, operations });

      const result = await executeDashboardOperations({
        dashboardData,
        operations,
        logger,
        resolvePanelContent: createResolvePanelContent(),
      });

      const [existing, overview, details] = getSections(result.dashboardData.panels);
      expect(existing.panels).toEqual([]);
      expect(overview.panels).toEqual([
        topPanel,
        expect.objectContaining({
          type: MARKDOWN_EMBEDDABLE_TYPE,
          config: { content: 'Summary', settings: { open_links_in_new_tab: true } },
        }),
      ]);
      expect(details.panels).toEqual([
        { ...nestedPanel, grid: { x: 0, y: 2, w: 48, h: 8 } },
        expect.objectContaining({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'metric' } }),
      ]);
      expect(overview.id).not.toBe('overview');
      expect(details.id).not.toBe('details');
      expect(overview.id).not.toBe(details.id);
      expect(overview).not.toHaveProperty('key');
      expect(details).not.toHaveProperty('key');
      expect(getPanelsOnly(result.dashboardData.panels)).toEqual([]);
      expect(result.failures).toEqual([]);
      expect({ dashboardData, operations }).toEqual(originalInputs);
    });

    it('resolves a key for removal and retains the moved panel when promoting', async () => {
      const panel = lensPanel('panel');
      const result = await executeDashboardOperations({
        dashboardData: buildDashboard({ panels: [panel] }),
        operations: [
          { operation: 'add_section', key: 'overview', title: 'Overview', grid: { y: 0 } },
          {
            operation: 'update_panel_layouts',
            panels: [{ panelId: panel.id, sectionId: 'overview' }],
          },
          { operation: 'remove_section', id: 'overview', panelAction: 'promote' },
        ],
        logger,
      });

      expect(result.dashboardData.panels).toEqual([panel]);
    });

    it.each([false, true])('rejects duplicate keys (first section removed: %s)', async (remove) => {
      const operations: DashboardOperation[] = [
        { operation: 'add_section', key: 'overview', title: 'Overview', grid: { y: 0 } },
      ];
      if (remove) {
        operations.push({ operation: 'remove_section', id: 'overview', panelAction: 'promote' });
      }
      operations.push({
        operation: 'add_section',
        key: 'overview',
        title: 'Another section',
        grid: { y: 10 },
      });

      await expect(executeDashboardOperations({ operations, logger })).rejects.toThrow(
        'Section key "overview" is already used in this call.'
      );
    });

    it('rejects a key that would shadow an existing section id', async () => {
      await expect(
        executeDashboardOperations({
          dashboardData: buildDashboard({ panels: [section('overview', 'Existing', 0)] }),
          operations: [
            { operation: 'add_section', key: 'overview', title: 'New', grid: { y: 10 } },
          ],
          logger,
        })
      ).rejects.toThrow('Section key "overview" conflicts with an existing section id.');
    });

    it.each([false, true])(
      'rejects unknown keys without changing the original panel (section created later: %s)',
      async (createLater) => {
        const panel = lensPanel('panel');
        const dashboardData = buildDashboard({ panels: [panel] });
        const operations: DashboardOperation[] = [
          {
            operation: 'update_panel_layouts',
            panels: [{ panelId: panel.id, sectionId: 'overview' }],
          },
        ];
        if (createLater) {
          operations.push({
            operation: 'add_section',
            key: 'overview',
            title: 'Overview',
            grid: { y: 0 },
          });
        }

        await expect(
          executeDashboardOperations({ dashboardData, operations, logger })
        ).rejects.toThrow('Section "overview" not found.');
        expect(dashboardData.panels).toEqual([panel]);
      }
    );

    it('requires the generated id instead of the key in a subsequent call', async () => {
      const panel = lensPanel('panel');
      const created = await executeDashboardOperations({
        dashboardData: buildDashboard({ panels: [panel] }),
        operations: [
          { operation: 'add_section', key: 'overview', title: 'Overview', grid: { y: 0 } },
        ],
        logger,
      });

      await expect(
        executeDashboardOperations({
          dashboardData: created.dashboardData,
          operations: [
            {
              operation: 'update_panel_layouts',
              panels: [{ panelId: panel.id, sectionId: 'overview' }],
            },
          ],
          logger,
        })
      ).rejects.toThrow('Section "overview" not found.');

      const [createdSection] = getSections(created.dashboardData.panels);
      const moved = await executeDashboardOperations({
        dashboardData: created.dashboardData,
        operations: [
          {
            operation: 'update_panel_layouts',
            panels: [{ panelId: panel.id, sectionId: createdSection.id }],
          },
        ],
        logger,
      });
      expect(getSections(moved.dashboardData.panels)[0].panels).toEqual([panel]);
    });

    it.each([
      ['an empty key', '', false],
      ['a 256-character key', 'a'.repeat(256), true],
      ['a 257-character key', 'a'.repeat(257), false],
    ])('parses %s as valid: %s', (_, key, valid) => {
      expect(
        dashboardOperationSchema.safeParse({
          operation: 'add_section',
          key,
          title: 'Overview',
          grid: { y: 0 },
        }).success
      ).toBe(valid);
    });
  });

  it('pre-resolves top-level visualization creations alongside section creations', async () => {
    const { resolvePanelContent, settle } = deferredPanelResolver();

    const resultPromise = executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 0 },
          panels: [requestItem('show total requests')],
        },
        {
          operation: 'add_panels',
          panels: [requestItem('show error rate', { grid: { x: 0, y: 1, w: 24, h: 9 } })],
        },
      ],
      logger,
      resolvePanelContent,
    });

    await waitForNextEventLoopTurn();

    expect(resolvePanelContent).toHaveBeenCalledTimes(2);
    expect(resolvePanelContent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationType: 'add_section',
        identifier: 'show total requests',
      })
    );
    expect(resolvePanelContent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operationType: 'add_panels',
        identifier: 'show error rate',
      })
    );

    settle('show error rate', success({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'bar' } }));
    settle('show total requests', success(METRIC_PANEL_CONTENT));

    const result = await resultPromise;

    expect(getSections(result.dashboardData.panels)).toEqual([
      expect.objectContaining({
        title: 'Overview',
        panels: [expect.objectContaining({ config: { type: 'metric' } })],
      }),
    ]);
    expect(getPanelsOnly(result.dashboardData.panels)).toEqual([
      expect.objectContaining({ config: { type: 'bar' } }),
    ]);
  });

  it('throws once up front when visualization creation operations are present without a resolver', async () => {
    await expect(
      executeDashboardOperations({
        dashboardData: buildDashboard(),
        operations: [
          {
            operation: 'add_section',
            title: 'Overview',
            grid: { y: 0 },
            panels: [requestItem('show total requests')],
          },
          {
            operation: 'add_panels',
            panels: [requestItem('show error rate', { grid: { x: 24, y: 0, w: 24, h: 9 } })],
          },
        ],
        logger,
      })
    ).rejects.toThrow('Inline panel resolver is required for panel creation operations.');
  });
});

describe('add_panels', () => {
  it('adds attachment-source panels successfully', async () => {
    const resolveAttachmentPanel = jest.fn(resolveAttachment);

    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_panels',
          panels: [
            attachmentItem('metric-vis'),
            attachmentItem('metric-vis', { grid: { x: 24, y: 0, w: 24, h: 9 } }),
          ],
        },
        {
          operation: 'add_panels',
          panels: [attachmentItem('metric-vis', { grid: { x: 0, y: 9, w: 12, h: 5 } })],
        },
      ],
      logger,
      resolveAttachmentPanel,
    });

    expect(resolveAttachmentPanel).toHaveBeenCalledWith('metric-vis', 'add_panels');
    expect(result.dashboardData.panels).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 0, w: 24, h: 9 },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 24, y: 0, w: 24, h: 9 },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 9, w: 12, h: 5 },
      }),
    ]);
    expect(result.failures).toEqual([]);
  });

  it('adds mixed panel kinds in input order across top-level and section targets', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({ panels: [section('section-a', 'Section A', 8)] }),
      operations: [
        {
          operation: 'add_panels',
          panels: [
            markdownItem('### Summary', { grid: { x: 0, y: 0, w: 24, h: 4 } }),
            attachmentItem('metric-vis', { sectionId: 'section-a' }),
            requestItem('show total requests', { grid: { x: 24, y: 0, w: 24, h: 9 } }),
            attachmentItem('metric-vis', { grid: { x: 0, y: 9, w: 24, h: 9 } }),
            requestItem('show p95 latency', {
              sectionId: 'section-a',
              grid: { x: 24, y: 0, w: 24, h: 9 },
            }),
          ],
        },
      ],
      logger,
      resolveAttachmentPanel: resolveAttachment,
      resolvePanelContent: createResolvePanelContent({
        'show total requests': success(
          METRIC_PANEL_CONTENT,
          'Created a titleless metric showing total requests.'
        ),
        'show p95 latency': failure('add_panels', 'show p95 latency', 'ES|QL generation failed'),
      }),
    });

    expect(getPanelsOnly(result.dashboardData.panels)).toEqual([
      expect.objectContaining({
        type: MARKDOWN_EMBEDDABLE_TYPE,
        config: { content: '### Summary', settings: { open_links_in_new_tab: true } },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 24, y: 0, w: 24, h: 9 },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 9, w: 24, h: 9 },
      }),
    ]);
    expect(getSections(result.dashboardData.panels)[0].panels).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 0, w: 24, h: 9 },
      }),
    ]);
    expect(result.failures).toEqual([
      {
        type: 'add_panels',
        identifier: 'show p95 latency',
        error: 'ES|QL generation failed',
      },
    ]);
    const generatedPanel = getPanelsOnly(result.dashboardData.panels).find(
      (panel) => panel.grid.x === 24 && panel.grid.y === 0
    );
    expect(result.panelAuthoringNotes).toEqual([
      {
        panelId: generatedPanel?.id,
        authoringNote: 'Created a titleless metric showing total requests.',
      },
    ]);
  });

  it('preserves dashboard metadata while mutating panels', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({
        title: 'Existing title',
        description: 'Existing description',
        panels: [section('section-1', 'Section 1', 10)],
      }),
      operations: [
        {
          operation: 'add_panels',
          panels: [attachmentItem('metric-vis', { grid: { x: 0, y: 0, w: 12, h: 5 } })],
        },
      ],
      logger,
      resolveAttachmentPanel: resolveAttachment,
    });

    expect(result.dashboardData).toEqual({
      title: 'Existing title',
      description: 'Existing description',
      panels: [
        section('section-1', 'Section 1', 10),
        {
          id: expect.any(String),
          type: LENS_EMBEDDABLE_TYPE,
          config: { type: 'metric' },
          grid: { x: 0, y: 0, w: 12, h: 5 },
        },
      ],
    });
  });

  it('skips failed inline visualization resolutions and records the failure', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_panels',
          panels: [
            requestItem('show total requests'),
            requestItem('show p95 latency', { grid: { x: 24, y: 0, w: 24, h: 9 } }),
          ],
        },
      ],
      logger,
      resolvePanelContent: createResolvePanelContent({
        'show p95 latency': failure('add_panels', 'show p95 latency', 'ES|QL generation failed'),
      }),
    });

    expect(getPanelsOnly(result.dashboardData.panels)).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 0, w: 24, h: 9 },
      }),
    ]);
    expect(result.failures).toEqual([
      {
        type: 'add_panels',
        identifier: 'show p95 latency',
        error: 'ES|QL generation failed',
      },
    ]);
  });

  it('places the resolvable panels when one attachment in the batch fails', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_panels',
          panels: [
            attachmentItem('att-1'),
            attachmentItem('att-missing', { grid: { x: 24, y: 0, w: 24, h: 9 } }),
          ],
        },
      ],
      logger,
      resolveAttachmentPanel: resolveAttachment,
    });

    expect(result.failures).toEqual([
      { type: 'add_panels', identifier: 'att-missing', error: 'not found' },
    ]);
    expect(result.dashboardData.panels).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 0, w: 24, h: 9 },
      }),
    ]);
  });

  it('throws when add_panels markdown item references an invalid sectionId', async () => {
    await expect(
      executeDashboardOperations({
        dashboardData: buildDashboard(),
        operations: [
          {
            operation: 'add_panels',
            panels: [markdownItem('### Summary', { sectionId: 'nonexistent-section' })],
          },
        ],
        logger,
      })
    ).rejects.toThrow('Section "nonexistent-section" not found.');
  });

  it('adds a custom_content panel through the panel resolver', async () => {
    const resolvePanelContent = mockPanelResolver(async () =>
      success({
        type: CUSTOM_CONTENT_EMBEDDABLE_TYPE,
        config: {
          esql_query: ['FROM logs-* | STATS error_rate = AVG(error) BY host'],
          template: '<div>KPI</div>',
        },
      })
    );

    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_panels',
          panels: [
            {
              source: 'request',
              renderer: 'custom_content',
              query: 'Show error rate KPI',
              esql: 'FROM logs-* | STATS error_rate = AVG(error) BY host',
              grid: { x: 0, y: 0, w: 24, h: 6 },
            },
          ],
        },
      ],
      logger,
      resolvePanelContent,
    });

    expect(resolvePanelContent).toHaveBeenCalledWith({
      renderer: 'custom_content',
      operationType: 'add_panels',
      identifier: 'Show error rate KPI',
      nlQuery: 'Show error rate KPI',
      esql: 'FROM logs-* | STATS error_rate = AVG(error) BY host',
    });
    expect(result.failures).toEqual([]);
    expect(getPanelsOnly(result.dashboardData.panels)).toEqual([
      expect.objectContaining({
        type: CUSTOM_CONTENT_EMBEDDABLE_TYPE,
        config: {
          esql_query: ['FROM logs-* | STATS error_rate = AVG(error) BY host'],
          template: '<div>KPI</div>',
        },
        grid: { x: 0, y: 0, w: 24, h: 6 },
      }),
    ]);
  });

  it('accepts a markdown config-source panel with content and optional settings', () => {
    const result = dashboardOperationSchema.safeParse({
      operation: 'add_panels',
      panels: [
        {
          source: 'config',
          type: 'markdown',
          config: { content: '## Hi', settings: { open_links_in_new_tab: true } },
          grid: { x: 0, y: 0, w: 48, h: 5 },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a markdown config-source panel whose config is missing content', () => {
    const result = dashboardOperationSchema.safeParse({
      operation: 'add_panels',
      panels: [
        {
          source: 'config',
          type: 'markdown',
          config: { settings: { open_links_in_new_tab: false } },
          grid: { x: 0, y: 0, w: 48, h: 5 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe('add_section', () => {
  it('adds an empty section with generated sectionId and default collapsed=false', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [{ operation: 'add_section', title: 'Overview', grid: { y: 12 } }],
      logger,
    });

    expect(getSections(result.dashboardData.panels)).toEqual([
      {
        id: expect.any(String),
        title: 'Overview',
        collapsed: false,
        grid: { y: 12 },
        panels: [],
      },
    ]);
  });

  it('adds a section with inline visualization panels in a single operation', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 12 },
          panels: [
            requestItem('show total requests'),
            requestItem('show error rate', { grid: { x: 24, y: 0, w: 24, h: 9 } }),
          ],
        },
      ],
      logger,
      resolvePanelContent: createResolvePanelContent({
        'show error rate': success({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'bar' } }),
      }),
    });

    expect(getPanelsOnly(result.dashboardData.panels)).toEqual([]);
    expect(getSections(result.dashboardData.panels)).toEqual([
      {
        id: expect.any(String),
        title: 'Overview',
        collapsed: false,
        grid: { y: 12 },
        panels: [
          expect.objectContaining({
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'metric' },
            grid: { x: 0, y: 0, w: 24, h: 9 },
          }),
          expect.objectContaining({
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'bar' },
            grid: { x: 24, y: 0, w: 24, h: 9 },
          }),
        ],
      },
    ]);
  });

  it('records inline visualization failures when adding a section and keeps successful panels', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 12 },
          panels: [
            requestItem('show total requests'),
            requestItem('show p95 latency', { grid: { x: 24, y: 0, w: 24, h: 9 } }),
          ],
        },
      ],
      logger,
      resolvePanelContent: createResolvePanelContent({
        'show p95 latency': failure('add_section', 'show p95 latency', 'ES|QL generation failed'),
      }),
    });

    const sections = getSections(result.dashboardData.panels);

    expect(sections).toHaveLength(1);
    expect(sections[0].panels).toEqual([
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 0, y: 0, w: 24, h: 9 },
      }),
    ]);
    expect(result.failures).toEqual([
      {
        type: 'add_section',
        identifier: 'show p95 latency',
        error: 'ES|QL generation failed',
      },
    ]);
  });

  it('adds non-visualization section panels without a visualization resolver', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 12 },
          panels: [
            markdownItem('### Section Summary', { grid: { x: 0, y: 0, w: 24, h: 4 } }),
            attachmentItem('metric-vis', { grid: { x: 24, y: 0, w: 24, h: 9 } }),
          ],
        },
      ],
      logger,
      resolveAttachmentPanel: resolveAttachment,
    });

    expect(getSections(result.dashboardData.panels)[0].panels).toEqual([
      expect.objectContaining({
        type: MARKDOWN_EMBEDDABLE_TYPE,
        config: { content: '### Section Summary', settings: { open_links_in_new_tab: true } },
      }),
      expect.objectContaining({
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
        grid: { x: 24, y: 0, w: 24, h: 9 },
      }),
    ]);
  });

  it('adds an attachment panel inside a new section', async () => {
    const resolveAttachmentPanel = jest.fn(resolveAttachment);

    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 0 },
          panels: [attachmentItem('att-1')],
        },
      ],
      logger,
      resolveAttachmentPanel,
    });

    expect(resolveAttachmentPanel).toHaveBeenCalledWith('att-1', 'add_section');
    expect(result.failures).toEqual([]);
    expect(getSections(result.dashboardData.panels)).toEqual([
      {
        id: expect.any(String),
        title: 'Overview',
        collapsed: false,
        grid: { y: 0 },
        panels: [
          {
            id: expect.any(String),
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'metric' },
            grid: { x: 0, y: 0, w: 24, h: 9 },
          },
        ],
      },
    ]);
  });

  it('keeps the section when an attachment inside it cannot be resolved', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_section',
          title: 'Overview',
          grid: { y: 0 },
          panels: [attachmentItem('att-missing')],
        },
      ],
      logger,
      resolveAttachmentPanel: resolveAttachment,
    });

    expect(result.failures).toEqual([
      { type: 'add_section', identifier: 'att-missing', error: 'not found' },
    ]);
    expect(getSections(result.dashboardData.panels)).toEqual([
      expect.objectContaining({ title: 'Overview', panels: [] }),
    ]);
  });
});

describe('update_panel_layouts', () => {
  it('updates panel grid without changing its current location', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({
        panels: [section('section-a', 'Section A', 0, [lensPanel('section-panel-1', 0)])],
      }),
      operations: [
        {
          operation: 'update_panel_layouts',
          panels: [{ panelId: 'section-panel-1', grid: { x: 12, y: 4, w: 12, h: 6 } }],
        },
      ],
      logger,
    });

    const sections = getSections(result.dashboardData.panels);
    expect(sections[0].panels).toEqual([
      expect.objectContaining({
        id: 'section-panel-1',
        grid: { x: 12, y: 4, w: 12, h: 6 },
        config: { type: 'metric' },
      }),
    ]);
  });

  it('moves a top-level panel into a section', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({
        panels: [lensPanel('top-1'), section('section-a', 'Section A', 10)],
      }),
      operations: [
        {
          operation: 'update_panel_layouts',
          panels: [
            { panelId: 'top-1', sectionId: 'section-a', grid: { x: 24, y: 0, w: 24, h: 9 } },
          ],
        },
      ],
      logger,
    });

    const panelsOnly = getPanelsOnly(result.dashboardData.panels);
    const sections = getSections(result.dashboardData.panels);

    expect(panelsOnly).toEqual([]);
    expect(sections[0].panels).toEqual([
      expect.objectContaining({
        id: 'top-1',
        grid: { x: 24, y: 0, w: 24, h: 9 },
        config: { type: 'metric' },
      }),
    ]);
  });

  it('promotes a section panel to the top level when sectionId is null', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({
        panels: [section('section-a', 'Section A', 0, [lensPanel('section-panel-1', 0)])],
      }),
      operations: [
        {
          operation: 'update_panel_layouts',
          panels: [
            { panelId: 'section-panel-1', sectionId: null, grid: { x: 0, y: 20, w: 24, h: 9 } },
          ],
        },
      ],
      logger,
    });

    const panelsOnly = getPanelsOnly(result.dashboardData.panels);
    const sections = getSections(result.dashboardData.panels);

    expect(sections[0].panels).toEqual([]);
    expect(panelsOnly).toEqual([
      expect.objectContaining({
        id: 'section-panel-1',
        grid: { x: 0, y: 20, w: 24, h: 9 },
        config: { type: 'metric' },
      }),
    ]);
  });

  it('records a failure when the target panel is missing', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'update_panel_layouts',
          panels: [{ panelId: 'missing-panel', grid: { x: 0, y: 0, w: 24, h: 9 } }],
        },
      ],
      logger,
    });

    expect(result.failures).toEqual([
      {
        type: 'update_panel_layouts',
        identifier: 'missing-panel',
        error: 'Panel "missing-panel" not found.',
      },
    ]);
  });
});

describe('remove_section', () => {
  it('removes section and promotes panels when panelAction=promote', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({
        panels: [
          lensPanel('top-1', 0),
          section('section-a', 'Section A', 20, [
            lensPanel('section-a-1', 0),
            lensPanel('section-a-2', 9),
          ]),
        ],
      }),
      operations: [{ operation: 'remove_section', id: 'section-a', panelAction: 'promote' }],
      logger,
    });

    expect(result.dashboardData.panels).toEqual([
      expect.objectContaining({ id: 'top-1', grid: { x: 0, y: 0, w: 24, h: 9 } }),
      expect.objectContaining({ id: 'section-a-1', grid: { x: 0, y: 9, w: 24, h: 9 } }),
      expect.objectContaining({ id: 'section-a-2', grid: { x: 0, y: 18, w: 24, h: 9 } }),
    ]);
  });

  it('removes section and deletes contained panels when panelAction=delete', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({
        panels: [
          lensPanel('top-1'),
          section('section-a', 'Section A', 10, [lensPanel('section-a-1', 0)]),
        ],
      }),
      operations: [{ operation: 'remove_section', id: 'section-a', panelAction: 'delete' }],
      logger,
    });

    expect(result.dashboardData.panels).toEqual([expect.objectContaining({ id: 'top-1' })]);
  });
});

describe('remove_panels', () => {
  it('removes matching panelIds from top-level and section panels', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({
        panels: [
          lensPanel('top-1'),
          section('section-a', 'Section A', 8, [
            lensPanel('section-a-1', 0),
            lensPanel('section-a-2', 9),
          ]),
        ],
      }),
      operations: [{ operation: 'remove_panels', panelIds: ['section-a-1', 'top-1'] }],
      logger,
    });

    const panelsOnly = getPanelsOnly(result.dashboardData.panels);
    const sections = getSections(result.dashboardData.panels);
    expect(panelsOnly).toEqual([]);
    expect(sections).toEqual([
      {
        id: 'section-a',
        title: 'Section A',
        collapsed: false,
        grid: { y: 8 },
        panels: [expect.objectContaining({ id: 'section-a-2' })],
      },
    ]);
  });
});

describe('edit_panels', () => {
  it('edits inline visualization panels while preserving id and grid', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({
        panels: [
          lensPanel('panel-1', 5),
          section('section-a', 'Section A', 0, [lensPanel('section-panel-1', 0)]),
        ],
      }),
      operations: [
        {
          operation: 'edit_panels',
          panels: [
            { source: 'request', panelId: 'panel-1', query: 'turn this into a bar chart' },
            { source: 'request', panelId: 'section-panel-1', query: 'turn this into a line chart' },
          ],
        },
      ],
      logger,
      resolvePanelContent: createResolvePanelContent({
        'panel-1': success(
          { type: LENS_EMBEDDABLE_TYPE, config: { type: 'bar' } },
          'Changed the panel to a bar chart and retained its title.'
        ),
        'section-panel-1': success(
          { type: LENS_EMBEDDABLE_TYPE, config: { type: 'line' } },
          'Changed the panel to a line chart with the legend below.'
        ),
      }),
    });

    const topLevelPanels = getPanelsOnly(result.dashboardData.panels);
    const sections = getSections(result.dashboardData.panels);

    expect(topLevelPanels[0]).toEqual(
      expect.objectContaining({
        id: 'panel-1',
        grid: { x: 0, y: 5, w: 24, h: 9 },
        config: { type: 'bar' },
      })
    );
    expect(sections[0].panels[0]).toEqual(
      expect.objectContaining({
        id: 'section-panel-1',
        grid: { x: 0, y: 0, w: 24, h: 9 },
        config: { type: 'line' },
      })
    );
    expect(result.panelAuthoringNotes).toEqual([
      {
        panelId: 'panel-1',
        authoringNote: 'Changed the panel to a bar chart and retained its title.',
      },
      {
        panelId: 'section-panel-1',
        authoringNote: 'Changed the panel to a line chart with the legend below.',
      },
    ]);
  });

  it('resolves repeated visualization edits against the latest panel state', async () => {
    const seenConfigSteps: string[] = [];

    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({ panels: [lensPanel('panel-1', 5)] }),
      operations: [
        {
          operation: 'edit_panels',
          panels: [{ source: 'request', panelId: 'panel-1', query: 'make this a bar chart' }],
        },
        {
          operation: 'edit_panels',
          panels: [{ source: 'request', panelId: 'panel-1', query: 'now make this a line chart' }],
        },
      ],
      logger,
      resolvePanelContent: async (params) => {
        const { nlQuery } = params;
        const config = params.existingPanel?.config as
          | { attributes?: { testStep?: string }; testStep?: string }
          | undefined;
        const configStep = config?.attributes?.testStep ?? config?.testStep ?? 'initial';
        seenConfigSteps.push(configStep);

        if (nlQuery === 'make this a bar chart') {
          return success({
            type: LENS_EMBEDDABLE_TYPE,
            config: { type: 'metric', testStep: 'after-first-edit' },
          });
        }

        return success({
          type: LENS_EMBEDDABLE_TYPE,
          config: {
            type: 'metric',
            testStep: configStep === 'after-first-edit' ? 'after-second-edit' : 'stale-edit',
          },
        });
      },
    });

    expect(seenConfigSteps).toEqual(['initial', 'after-first-edit']);
    expect(getPanelsOnly(result.dashboardData.panels)[0]).toEqual(
      expect.objectContaining({
        id: 'panel-1',
        config: { type: 'metric', testStep: 'after-second-edit' },
        grid: { x: 0, y: 5, w: 24, h: 9 },
      })
    );
  });

  it('does not resolve visualization edits for panels removed earlier in the sequence', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({ panels: [lensPanel('panel-1', 5)] }),
      operations: [
        { operation: 'remove_panels', panelIds: ['panel-1'] },
        {
          operation: 'edit_panels',
          panels: [{ source: 'request', panelId: 'panel-1', query: 'make this a bar chart' }],
        },
      ],
      logger,
    });

    expect(getPanelsOnly(result.dashboardData.panels)).toEqual([]);
    expect(result.failures).toEqual([
      {
        type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
        identifier: 'panel-1',
        error: 'Panel "panel-1" not found.',
      },
    ]);
  });

  it('records a failure without calling the resolver when a request edit targets a panel with no renderer', async () => {
    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({
        panels: [
          {
            type: 'aiOpsLogRateAnalysis',
            id: 'panel-1',
            config: { seriesType: 'log_rate' },
            grid: { x: 0, y: 5, w: 24, h: 9 },
          },
        ],
      }),
      operations: [
        {
          operation: 'edit_panels',
          panels: [{ source: 'request', panelId: 'panel-1', query: 'refine this analysis' }],
        },
      ],
      logger,
    });

    expect(getPanelsOnly(result.dashboardData.panels)).toEqual([
      expect.objectContaining({ id: 'panel-1', config: { seriesType: 'log_rate' } }),
    ]);
    expect(result.failures).toEqual([
      {
        type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
        identifier: 'panel-1',
        error:
          'Panel "panel-1" with type "aiOpsLogRateAnalysis" is not supported for inline editing.',
      },
    ]);
  });

  describe('request edit renderer', () => {
    const editWith = async (
      existingPanel: AttachmentPanel,
      panelInput: Record<string, unknown>
    ) => {
      const resolvePanelContent = mockPanelResolver(async () =>
        success({ type: existingPanel.type, config: { updated: true } })
      );
      const result = await executeDashboardOperations({
        dashboardData: buildDashboard({ panels: [existingPanel] }),
        operations: [
          {
            operation: 'edit_panels',
            panels: [
              {
                source: 'request',
                panelId: existingPanel.id,
                query: 'change the title',
                ...panelInput,
              },
            ],
          } as DashboardOperation,
        ],
        logger,
        resolvePanelContent,
      });
      return { result, resolvePanelContent };
    };

    it('fails without calling the resolver when a custom_content edit omits renderer', async () => {
      const { result, resolvePanelContent } = await editWith(customContentPanel('cc-1'), {});

      expect(resolvePanelContent).not.toHaveBeenCalled();
      expect(result.failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
          identifier: 'cc-1',
          error:
            'Panel "cc-1" is a custom content panel. Edit it with source: "request", renderer: "custom_content".',
        },
      ]);
    });

    it('resolves a custom_content edit that names its renderer', async () => {
      const { result, resolvePanelContent } = await editWith(customContentPanel('cc-1'), {
        renderer: 'custom_content',
      });

      expect(resolvePanelContent).toHaveBeenCalledWith(
        expect.objectContaining({ renderer: 'custom_content', nlQuery: 'change the title' })
      );
      expect(result.failures).toEqual([]);
      expect(result.dashboardData.panels).toEqual([
        { ...customContentPanel('cc-1'), config: { updated: true } },
      ]);
    });

    it('infers vega from the existing panel when renderer is omitted', async () => {
      const { result, resolvePanelContent } = await editWith(vegaPanel('vega-1'), {});

      expect(resolvePanelContent).toHaveBeenCalledWith(
        expect.objectContaining({ renderer: 'vega' })
      );
      expect(result.failures).toEqual([]);
      expect(result.dashboardData.panels).toEqual([
        { ...vegaPanel('vega-1'), config: { updated: true } },
      ]);
    });

    it('fails without calling the resolver when an explicit renderer disagrees with the panel', async () => {
      const { result, resolvePanelContent } = await editWith(vegaPanel('vega-1'), {
        renderer: 'lens',
      });

      expect(resolvePanelContent).not.toHaveBeenCalled();
      expect(result.failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
          identifier: 'vega-1',
          error: `Panel "vega-1" with type "${VEGA_VIS_TYPE}" cannot be edited with renderer: "lens". Use renderer: "vega".`,
        },
      ]);
    });

    it('fails when custom_content targets a Lens panel', async () => {
      const { result, resolvePanelContent } = await editWith(lensPanel('panel-1'), {
        renderer: 'custom_content',
      });

      expect(resolvePanelContent).not.toHaveBeenCalled();
      expect(result.failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
          identifier: 'panel-1',
          error: `Panel "panel-1" with type "${LENS_EMBEDDABLE_TYPE}" cannot be edited with renderer: "custom_content". Use renderer: "lens".`,
        },
      ]);
    });

    it('points a request edit on a by-value panel to source: "config"', async () => {
      const { result, resolvePanelContent } = await editWith(markdownPanel('md-1', 'old text'), {});

      expect(resolvePanelContent).not.toHaveBeenCalled();
      expect(result.failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
          identifier: 'md-1',
          error:
            'Panel "md-1" is a markdown panel. Edit it with source: "config", type: "markdown".',
        },
      ]);
    });
  });

  it('resolves multiple panel edits in one edit_panels op in parallel', async () => {
    const { resolvePanelContent, settle } = deferredPanelResolver();

    const operationPromise = executeDashboardOperations({
      dashboardData: buildDashboard({
        panels: [customContentPanel('cc-1'), lensPanel('panel-1', 6)],
      }),
      operations: [
        {
          operation: 'edit_panels',
          panels: [
            {
              source: 'request',
              renderer: 'custom_content',
              panelId: 'cc-1',
              query: 'add a border',
            },
            {
              source: 'request',
              panelId: 'panel-1',
              query: 'make this a bar chart',
              applyChartRules: true,
              preserveESQL: true,
            },
          ],
        },
      ],
      logger,
      resolvePanelContent,
    });

    await waitForNextEventLoopTurn();

    expect(resolvePanelContent).toHaveBeenCalledTimes(2);
    expect(resolvePanelContent).toHaveBeenCalledWith(
      expect.objectContaining({
        renderer: 'custom_content',
        identifier: 'cc-1',
        nlQuery: 'add a border',
      })
    );
    expect(resolvePanelContent).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'panel-1',
        applyChartRules: true,
        preserveESQL: true,
      })
    );

    settle('panel-1', success({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'bar' } }));
    settle(
      'cc-1',
      success({ type: CUSTOM_CONTENT_EMBEDDABLE_TYPE, config: { template: '<div>New</div>' } })
    );

    const result = await operationPromise;

    expect(result.failures).toEqual([]);
    expect(getPanelsOnly(result.dashboardData.panels).map(({ config }) => config)).toEqual([
      { template: '<div>New</div>' },
      { type: 'bar' },
    ]);
  });

  it('records a failure for each occurrence when a panelId is duplicated within one op', async () => {
    const resolvePanelContent = mockPanelResolver(async ({ identifier }) =>
      success({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'bar', identifier } })
    );

    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({ panels: [lensPanel('panel-1', 0), lensPanel('panel-2', 9)] }),
      operations: [
        {
          operation: 'edit_panels',
          panels: [
            { source: 'request', panelId: 'panel-1', query: 'first edit' },
            { source: 'request', panelId: 'panel-2', query: 'edit a different panel' },
            { source: 'request', panelId: 'panel-1', query: 'second edit of same panel' },
          ],
        },
      ],
      logger,
      resolvePanelContent,
    });

    const duplicateError =
      'Panel "panel-1" appears multiple times in this edit_panels operation. Edit each panel at most once per operation.';

    expect(result.failures).toEqual([
      {
        type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
        identifier: 'panel-1',
        error: duplicateError,
      },
      {
        type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
        identifier: 'panel-1',
        error: duplicateError,
      },
    ]);

    // The duplicated panel must not be touched; the non-duplicated panel still resolves.
    expect(resolvePanelContent).toHaveBeenCalledTimes(1);
    expect(resolvePanelContent).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'panel-2' })
    );

    const topLevelPanels = getPanelsOnly(result.dashboardData.panels);
    expect(topLevelPanels[0]).toEqual(
      expect.objectContaining({ id: 'panel-1', config: { type: 'metric' } })
    );
    expect(topLevelPanels[1]).toEqual(
      expect.objectContaining({
        id: 'panel-2',
        config: { type: 'bar', identifier: 'panel-2' },
      })
    );
  });

  const configEditCases = [
    {
      label: 'markdown',
      type: 'markdown',
      existingPanel: markdownPanel('md-1', 'old text'),
      config: { content: '### Updated summary', settings: { open_links_in_new_tab: true } },
      storedConfig: { content: '### Updated summary', settings: { open_links_in_new_tab: true } },
    },
    {
      label: 'anomaly charts',
      type: 'ml_anomaly_charts',
      existingPanel: anomalyChartsPanel('charts-1'),
      config: {
        job_ids: ['job-1'],
        title: 'Anomaly charts of job-1 with severity > 50',
        severity_threshold: 50,
      },
      storedConfig: {
        job_ids: ['job-1'],
        title: 'Anomaly charts of job-1 with severity > 50',
        severity_threshold: [{ min: 50 }],
      },
    },
    {
      label: 'anomaly swim lane',
      type: 'ml_anomaly_swimlane',
      existingPanel: anomalySwimlanePanel('swim-1'),
      config: {
        job_ids: ['job-1'],
        swimlane_type: 'overall',
        severity_threshold: 75,
        title: 'Overall anomalies of job-1 (high severity)',
      },
      storedConfig: {
        job_ids: ['job-1'],
        swimlane_type: 'overall',
        severity_threshold: 75,
        title: 'Overall anomalies of job-1 (high severity)',
      },
    },
    {
      label: 'single metric viewer',
      type: 'ml_single_metric_viewer',
      existingPanel: singleMetricViewerPanel('smv-1'),
      config: {
        job_ids: ['job-1'],
        selected_entities: { 'host.name': 'web-01' },
        title: 'Metric viewer for web-01',
      },
      storedConfig: {
        job_ids: ['job-1'],
        selected_entities: { 'host.name': 'web-01' },
        title: 'Metric viewer for web-01',
      },
    },
  ] as const;

  const configEdit = (
    type: (typeof configEditCases)[number]['type'],
    panelId: string,
    config: (typeof configEditCases)[number]['config']
  ) =>
    ({
      operation: 'edit_panels',
      panels: [{ source: 'config', type, panelId, config }],
    } as DashboardOperation);

  it.each(configEditCases)(
    'edits a $label panel in place by panelId',
    async ({ type, existingPanel, config, storedConfig }) => {
      const result = await executeDashboardOperations({
        dashboardData: buildDashboard({ panels: [existingPanel] }),
        operations: [configEdit(type, existingPanel.id, config)],
        logger,
      });

      expect(result.failures).toEqual([]);
      expect(result.dashboardData.panels).toEqual([{ ...existingPanel, config: storedConfig }]);
    }
  );

  it.each(configEditCases)(
    'records a failure when a $label config-source edit targets a Lens panel',
    async ({ label, type, config }) => {
      const result = await executeDashboardOperations({
        dashboardData: buildDashboard({ panels: [lensPanel('panel-1', 0)] }),
        operations: [configEdit(type, 'panel-1', config)],
        logger,
      });

      expect(result.failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.editPanels,
          identifier: 'panel-1',
          error: `Panel "panel-1" with type "${LENS_EMBEDDABLE_TYPE}" cannot be edited as ${label}. Use source: "request" with the panel's renderer for Lens, Vega, or custom content panels.`,
        },
      ]);
      expect(result.dashboardData.panels).toEqual([lensPanel('panel-1', 0)]);
    }
  );

  it('routes custom_content edits through the panel resolver with the existing panel', async () => {
    const existingPanel = customContentPanel('cc-1', {
      esql_query: ['FROM logs | STATS count = COUNT(*)'],
      template: '<div>Old</div>',
    });
    const resolvePanelContent = mockPanelResolver(async () =>
      success({
        type: CUSTOM_CONTENT_EMBEDDABLE_TYPE,
        config: { template: '<div>Server generated</div>' },
      })
    );

    const result = await executeDashboardOperations({
      dashboardData: buildDashboard({ panels: [existingPanel] }),
      operations: [
        {
          operation: 'edit_panels',
          panels: [
            {
              source: 'request',
              renderer: 'custom_content',
              panelId: 'cc-1',
              query: 'updated prompt',
              esql: null,
            },
          ],
        },
      ],
      logger,
      resolvePanelContent,
    });

    expect(resolvePanelContent).toHaveBeenCalledWith({
      renderer: 'custom_content',
      operationType: 'edit_panels',
      identifier: 'cc-1',
      nlQuery: 'updated prompt',
      esql: null,
      existingPanel,
    });
    expect(result.failures).toEqual([]);
    expect(getPanelsOnly(result.dashboardData.panels)[0]).toEqual({
      ...existingPanel,
      config: { template: '<div>Server generated</div>' },
    });
  });

  it('mixes markdown and visualization edits in one op, parallelizing only the visualization resolves', async () => {
    const { resolvePanelContent, settle } = deferredPanelResolver();

    const operationPromise = executeDashboardOperations({
      dashboardData: buildDashboard({
        panels: [markdownPanel('md-1', 'old text'), lensPanel('panel-1', 5)],
      }),
      operations: [
        {
          operation: 'edit_panels',
          panels: [
            {
              source: 'config',
              type: 'markdown',
              panelId: 'md-1',
              config: { content: '### New summary', settings: { open_links_in_new_tab: true } },
            },
            { source: 'request', panelId: 'panel-1', query: 'turn into a bar chart' },
          ],
        },
      ],
      logger,
      resolvePanelContent,
    });

    await waitForNextEventLoopTurn();

    expect(resolvePanelContent).toHaveBeenCalledTimes(1);
    expect(resolvePanelContent).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'panel-1' })
    );

    settle('panel-1', success({ type: LENS_EMBEDDABLE_TYPE, config: { type: 'bar' } }));

    const result = await operationPromise;
    expect(result.failures).toEqual([]);

    const topLevelPanels = getPanelsOnly(result.dashboardData.panels);
    expect(topLevelPanels[0]).toEqual(
      expect.objectContaining({
        id: 'md-1',
        config: { content: '### New summary', settings: { open_links_in_new_tab: true } },
      })
    );
    expect(topLevelPanels[1]).toEqual(
      expect.objectContaining({ id: 'panel-1', config: { type: 'bar' } })
    );
  });
});

const optionsListControl = (id: string, fieldName: string) => ({
  type: 'options_list_control',
  id,
  width: 'medium',
  grow: true,
  config: { values_source: 'esql', esql_query: `FROM logs-* | STATS BY ${fieldName}` },
});

const TIME_SLIDER_CONTROL = {
  type: 'time_slider_control',
  id: 'time-slider',
  width: 'medium',
  grow: true,
  config: {},
};

describe('add_controls', () => {
  it.each([
    [
      'options_list_control',
      {
        type: 'options_list_control',
        field_name: 'service.name',
        index: 'logs-*',
        title: 'Service',
      },
      expect.objectContaining({
        title: 'Service',
        values_source: 'esql',
        esql_query: 'FROM logs-* | STATS BY `service.name`',
      }),
    ],
    [
      'range_slider_control',
      { type: 'range_slider_control', field_name: 'latency', index: 'metrics-*' },
      expect.objectContaining({
        values_source: 'esql',
        esql_query: 'FROM metrics-* | STATS BY latency',
      }),
    ],
    [
      'time_slider_control',
      { type: 'time_slider_control' },
      expect.not.objectContaining({ esql_query: expect.anything() }),
    ],
  ] as const)('appends a %s with the default layout', async (type, control, expectedConfig) => {
    const { dashboardData } = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [{ operation: 'add_controls', controls: [control] }],
      logger,
    });

    expect(dashboardData.pinned_panels).toEqual([
      { type, id: expect.any(String), width: 'medium', grow: true, config: expectedConfig },
    ]);
  });

  it('escapes ES|QL field identifiers in generated queries', async () => {
    const { dashboardData } = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_controls',
          controls: [
            { type: 'options_list_control', field_name: 'labels.pod-name', index: 'logs-*' },
            {
              type: 'range_slider_control',
              field_name: 'kubernetes.labels.app.kubernetes.io/name',
              index: 'logs-*',
            },
          ],
        },
      ],
      logger,
    });

    expect(getEsqlQueries(dashboardData)).toEqual([
      'FROM logs-* | STATS BY `labels.pod-name`',
      'FROM logs-* | STATS BY `kubernetes.labels.app.kubernetes.io/name`',
    ]);
  });

  it('skips extra time_slider_control controls in one operation', async () => {
    const { dashboardData, failures } = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_controls',
          controls: [
            { type: 'time_slider_control' },
            { type: 'time_slider_control', user_requested: true },
            { type: 'options_list_control', field_name: 'service.name', index: 'logs-*' },
          ],
        },
      ],
      logger,
    });

    expect(getControlTypes(dashboardData)).toEqual(['time_slider_control', 'options_list_control']);
    expect(failures).toEqual([
      {
        type: 'add_controls',
        identifier: 'controls[1]',
        error: 'A dashboard can contain at most one time_slider_control.',
      },
    ]);
  });

  it('silently skips an unrequested second time_slider_control on an existing dashboard', async () => {
    const { dashboardData, failures } = await executeDashboardOperations({
      dashboardData: buildDashboard({ pinned_panels: [TIME_SLIDER_CONTROL] }),
      operations: [{ operation: 'add_controls', controls: [{ type: 'time_slider_control' }] }],
      logger,
    });

    expect(dashboardData.pinned_panels).toEqual([TIME_SLIDER_CONTROL]);
    expect(failures).toEqual([]);
  });

  it('appends to existing controls', async () => {
    const { dashboardData } = await executeDashboardOperations({
      dashboardData: buildDashboard({
        pinned_panels: [optionsListControl('host-id', 'host.name')],
      }),
      operations: [
        {
          operation: 'add_controls',
          controls: [{ type: 'options_list_control', field_name: 'env', index: 'logs-*' }],
        },
      ],
      logger,
    });

    expect(getEsqlQueries(dashboardData)).toEqual([
      'FROM logs-* | STATS BY host.name',
      'FROM logs-* | STATS BY env',
    ]);
  });

  describe('field validation', () => {
    type ControlsInput = Extract<DashboardOperation, { operation: 'add_controls' }>['controls'];
    const index = 'kibana_sample_data_logs';

    const addControls = (
      controls: ControlsInput,
      resolveControlFieldCapabilities: ResolveControlFieldCapabilities,
      dashboardData: DashboardAttachmentData = buildDashboard()
    ) =>
      executeDashboardOperations({
        dashboardData,
        operations: [{ operation: 'add_controls', controls }],
        logger,
        resolveControlFieldCapabilities,
      });

    it('keeps controls on supported field types', async () => {
      const { dashboardData, failures } = await addControls(
        [
          { type: 'options_list_control', field_name: 'client.ip', index },
          { type: 'options_list_control', field_name: 'status', index },
          { type: 'range_slider_control', field_name: 'bytes', index },
        ],
        createFieldCapabilitiesResolver({
          'client.ip': usable('ip'),
          status: usable('keyword'),
          bytes: usable('long'),
        })
      );

      expect(failures).toEqual([]);
      expect(getEsqlQueries(dashboardData)).toEqual([
        `FROM ${index} | STATS BY \`client.ip\``,
        `FROM ${index} | STATS BY status`,
        `FROM ${index} | STATS BY bytes`,
      ]);
    });

    it.each([
      ['a non-aggregatable text field', NOT_AGGREGATABLE],
      ['an aggregatable text field', usable('text')],
    ])('uses the keyword sibling of %s', async (_, hostCapability) => {
      const { dashboardData, failures } = await addControls(
        [{ type: 'options_list_control', field_name: 'host', index }],
        createFieldCapabilitiesResolver({ host: hostCapability, 'host.keyword': usable('keyword') })
      );

      expect(failures).toEqual([]);
      expect(getEsqlQueries(dashboardData)).toEqual([`FROM ${index} | STATS BY \`host.keyword\``]);
    });

    const notMapped = `Not mapped on index "${index}".`;
    const notAggregatable = `Is not aggregatable on index "${index}".`;
    const conflicting = `Has conflicting mappings on index "${index}".`;
    const optionsListType = `options_list_control needs a keyword, numeric, date, ip, boolean, or version field on index "${index}".`;
    const rangeSliderType = `range_slider_control needs a numeric field on index "${index}".`;

    it.each([
      ['options_list_control', 'is not mapped', {}, notMapped],
      [
        'options_list_control',
        'is text without a keyword sibling',
        { field: NOT_AGGREGATABLE },
        notAggregatable,
      ],
      ['options_list_control', 'has conflicting mappings', { field: CONFLICTING }, conflicting],
      ['range_slider_control', 'has conflicting mappings', { field: CONFLICTING }, conflicting],
      [
        'options_list_control',
        'is aggregate_metric_double',
        { field: usable('aggregate_metric_double') },
        optionsListType,
      ],
      ['options_list_control', 'is geo_point', { field: usable('geo_point') }, optionsListType],
      ['range_slider_control', 'is keyword', { field: usable('keyword') }, rangeSliderType],
      [
        'range_slider_control',
        'is aggregate_metric_double',
        { field: usable('aggregate_metric_double') },
        rangeSliderType,
      ],
    ] as const)('reports a user-requested %s whose field %s', async (type, _, fields, error) => {
      const { dashboardData, failures } = await addControls(
        [{ type, field_name: 'field', index, user_requested: true }],
        createFieldCapabilitiesResolver(fields)
      );

      expect(getEsqlQueries(dashboardData)).toEqual([]);
      expect(failures).toEqual([
        { type: DASHBOARD_OPERATION_FAILURE_TYPES.addControls, identifier: 'field', error },
      ]);
    });

    it('silently leaves out an unresolved control the user did not request', async () => {
      const { dashboardData, failures } = await addControls(
        [{ type: 'options_list_control', field_name: 'method', index }],
        createFieldCapabilitiesResolver({})
      );

      expect(getEsqlQueries(dashboardData)).toEqual([]);
      expect(failures).toEqual([]);
    });

    it('groups user-requested failures that share a reason', async () => {
      const { failures } = await addControls(
        ['http_method', 'status_code'].map((fieldName) => ({
          type: 'options_list_control' as const,
          field_name: fieldName,
          index,
          user_requested: true,
        })),
        createFieldCapabilitiesResolver({})
      );

      expect(failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.addControls,
          identifier: 'http_method, status_code',
          error: notMapped,
        },
      ]);
    });

    it('requests only candidate fields, once per index, with the dashboard project routing', async () => {
      const resolveFieldCapabilities = createFieldCapabilitiesResolver({ host: usable('keyword') });

      await addControls(
        [
          { type: 'options_list_control', field_name: 'host', index },
          { type: 'options_list_control', field_name: 'service.name', index },
        ],
        resolveFieldCapabilities,
        buildDashboard({ project_routing: '_alias:*' })
      );

      expect(resolveFieldCapabilities).toHaveBeenCalledTimes(1);
      expect(resolveFieldCapabilities).toHaveBeenCalledWith({
        index,
        fieldNames: ['host', 'host.keyword', 'service.name', 'service.name.keyword'],
        projectRouting: '_alias:*',
      });
    });

    it('keeps controls unvalidated when field loading fails', async () => {
      const resolveFieldCapabilities = createFieldCapabilitiesResolver({});
      resolveFieldCapabilities.mockRejectedValue(new Error('field caps unavailable'));

      const { dashboardData, failures } = await addControls(
        [{ type: 'options_list_control', field_name: 'host', index, user_requested: true }],
        resolveFieldCapabilities
      );

      expect(failures).toEqual([]);
      expect(getEsqlQueries(dashboardData)).toEqual([`FROM ${index} | STATS BY host`]);
    });
  });
});

describe('remove_controls', () => {
  it.each([
    ['removes by id and leaves others intact', ['service-id'], ['host-id']],
    ['leaves controls unchanged for an unknown id', ['nonexistent-id'], ['service-id', 'host-id']],
  ])('%s', async (_, controlIds, remainingIds) => {
    const { dashboardData } = await executeDashboardOperations({
      dashboardData: buildDashboard({
        pinned_panels: [
          optionsListControl('service-id', 'service.name'),
          optionsListControl('host-id', 'host.name'),
        ],
      }),
      operations: [{ operation: 'remove_controls', control_ids: controlIds }],
      logger,
    });

    expect(getControlIds(dashboardData)).toEqual(remainingIds);
  });
});
