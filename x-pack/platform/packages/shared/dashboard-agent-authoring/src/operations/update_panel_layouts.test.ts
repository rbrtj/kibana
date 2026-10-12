/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { executeDashboardOperations } from '../operations';
import {
  logger,
  getSections,
  getPanelsOnly,
  buildDashboard,
  lensPanel,
  section,
} from './test_helpers';

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
