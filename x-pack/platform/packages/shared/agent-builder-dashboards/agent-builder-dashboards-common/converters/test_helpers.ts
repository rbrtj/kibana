/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { attachmentDataToDashboardState } from './from_attachment';

export const grid = { x: 0, y: 0, w: 24, h: 15 };

export const metricApiConfig = {
  type: 'metric' as const,
  data_source: { type: 'esql' as const, query: 'FROM logs | STATS count = COUNT(*)' },
  metrics: [{ type: 'primary' as const, column: 'count' }],
  sampling: 1,
  ignore_global_filters: false,
};

export const dashboardState = (panels: DashboardState['panels']): DashboardState => ({
  ...attachmentDataToDashboardState({ title: 'Dash', panels: [] }),
  panels,
});
