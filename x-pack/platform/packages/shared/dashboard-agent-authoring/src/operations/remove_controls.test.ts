/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardAttachmentData } from '@kbn/agent-builder-dashboards-common';
import { executeDashboardOperations } from '../operations';
import { logger, buildDashboard, optionsListControl } from './test_helpers';

const getControlIds = ({ pinned_panels: pinnedPanels = [] }: DashboardAttachmentData) =>
  pinnedPanels.map(({ id }) => id);

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

  it('stores an empty control list on a dashboard without controls', async () => {
    const { dashboardData } = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [{ operation: 'remove_controls', control_ids: ['service-id'] }],
      logger,
    });

    expect(dashboardData).toEqual({ ...buildDashboard(), pinned_panels: [] });
  });
});
