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

  it('leaves the dashboard unchanged without a failure when no panel id matches', async () => {
    const dashboardData = buildDashboard({ panels: [lensPanel('top-1')] });

    const result = await executeDashboardOperations({
      dashboardData,
      operations: [{ operation: 'remove_panels', panelIds: ['missing'] }],
      logger,
    });

    expect(result.dashboardData).toEqual(dashboardData);
    expect(result.failures).toEqual([]);
  });
});
