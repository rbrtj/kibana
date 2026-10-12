/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { executeDashboardOperations } from '../operations';
import { logger, buildDashboard, lensPanel, section } from './test_helpers';

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
