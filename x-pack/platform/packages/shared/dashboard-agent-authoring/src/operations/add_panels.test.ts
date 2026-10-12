/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MARKDOWN_EMBEDDABLE_TYPE } from '@kbn/dashboard-markdown-schemas';
import { CUSTOM_CONTENT_EMBEDDABLE_TYPE } from '@kbn/custom-content-common';
import { executeDashboardOperations, dashboardOperationSchema } from '../operations';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import {
  logger,
  getSections,
  getPanelsOnly,
  buildDashboard,
  section,
  requestItem,
  markdownItem,
  attachmentItem,
  success,
  failure,
  METRIC_PANEL_CONTENT,
  resolveAttachment,
  mockPanelResolver,
  createResolvePanelContent,
} from './test_helpers';

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
