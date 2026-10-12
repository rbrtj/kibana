/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentPanel } from '@kbn/agent-builder-dashboards-common';
import { MARKDOWN_EMBEDDABLE_TYPE } from '@kbn/dashboard-markdown-schemas';
import { CUSTOM_CONTENT_EMBEDDABLE_TYPE } from '@kbn/custom-content-common';
import { executeDashboardOperations, type DashboardOperation } from '../operations';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { VEGA_VIS_TYPE } from '@kbn/agent-builder-visualizations-common';
import { DASHBOARD_OPERATION_FAILURE_TYPES } from '../failure_types';
import type { PanelGrid } from './test_helpers';
import {
  logger,
  waitForNextEventLoopTurn,
  getSections,
  getPanelsOnly,
  buildDashboard,
  lensPanel,
  section,
  success,
  mockPanelResolver,
  createResolvePanelContent,
  deferredPanelResolver,
} from './test_helpers';

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
