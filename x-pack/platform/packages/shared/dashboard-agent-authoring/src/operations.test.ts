/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MARKDOWN_EMBEDDABLE_TYPE } from '@kbn/dashboard-markdown-schemas';
import {
  executeDashboardOperations,
  dashboardOperationSchema,
  type DashboardOperation,
} from './operations';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import {
  logger,
  waitForNextEventLoopTurn,
  getSections,
  getPanelsOnly,
  buildDashboard,
  lensPanel,
  section,
  requestItem,
  markdownItem,
  attachmentItem,
  success,
  METRIC_PANEL_CONTENT,
  resolveAttachment,
  createResolvePanelContent,
  deferredPanelResolver,
} from './operations/test_helpers';

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

  it('starts from an empty "User Dashboard" when no dashboard is given', async () => {
    const result = await executeDashboardOperations({
      operations: [{ operation: 'add_section', title: 'Overview', grid: { y: 0 } }],
      logger,
    });

    expect(result.dashboardData).toEqual({
      title: 'User Dashboard',
      panels: [
        { id: expect.any(String), title: 'Overview', collapsed: false, grid: { y: 0 }, panels: [] },
      ],
    });
  });
});
