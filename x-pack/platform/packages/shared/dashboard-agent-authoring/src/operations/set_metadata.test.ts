/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { executeDashboardOperations } from '../operations';
import { logger, buildDashboard, lensPanel } from './test_helpers';

describe('set_metadata', () => {
  const dashboardData = buildDashboard({
    title: 'Original title',
    description: 'Original description',
    panels: [lensPanel('panel-1')],
  });

  it.each([
    [
      'applies description and time range and keeps the title',
      { description: 'New description', time_range: { from: 'now-7d', to: 'now' } },
      {
        title: 'Original title',
        description: 'New description',
        time_range: { from: 'now-7d', to: 'now' },
      },
    ],
    [
      'leaves the dashboard unchanged when no field is set',
      {},
      { title: 'Original title', description: 'Original description' },
    ],
  ])('%s', async (_, metadata, expectedMetadata) => {
    const result = await executeDashboardOperations({
      dashboardData,
      operations: [{ operation: 'set_metadata', ...metadata }],
      logger,
    });

    expect(result.dashboardData).toEqual({ ...expectedMetadata, panels: [lensPanel('panel-1')] });
  });
});
