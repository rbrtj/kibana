/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type {
  AttachmentPanel,
  DashboardAttachmentData,
} from '@kbn/agent-builder-dashboards-common';
import { applyDefaultDashboardTimeRange } from './apply_default_time_range';

const NOW = new Date('2026-06-26T12:00:00.000Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

// Valid ES|QL: references @timestamp via ?_tstart/?_tend, so the time field is
// resolved from the query and no field_caps lookup is needed.
const Q_TIME_BOUND =
  'FROM logs-* | WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend | STATS count = COUNT(*)';
// Valid ES|QL with no time param — the time field falls back to field_caps.
const Q_NO_PARAM = 'FROM events-* | STATS count = COUNT(*)';

const esqlPanel = (id: string, query: string): AttachmentPanel => ({
  type: LENS_EMBEDDABLE_TYPE,
  id,
  config: { type: 'metric', data_source: { type: 'esql', query } },
  grid: { x: 0, y: 0, w: 24, h: 15 },
});

const markdownPanel = (id: string): AttachmentPanel => ({
  type: 'markdown',
  id,
  config: { content: '# notes' },
  grid: { x: 0, y: 0, w: 24, h: 15 },
});

const minMaxResponse = (minMs: number, maxMs: number) => ({
  took: 0,
  timed_out: false,
  _shards: { total: 1, successful: 1, failed: 0 },
  hits: { hits: [] },
  aggregations: { min_time: { value: minMs }, max_time: { value: maxMs } },
});

const fieldCapsResponse = (fields: Record<string, 'date'>) => ({
  indices: ['events-*'],
  fields: Object.fromEntries(
    Object.entries(fields).map(([name, type]) => [
      name,
      { [type]: { type, aggregatable: true, searchable: true, metadata_field: false } },
    ])
  ),
});

const dashboard = (
  panels: DashboardAttachmentData['panels'],
  extra: Partial<DashboardAttachmentData> = {}
): DashboardAttachmentData => ({ title: 'Test', panels, ...extra });

const setup = () => {
  const esClient = elasticsearchServiceMock.createScopedClusterClient();
  const { search, fieldCaps } = esClient.asCurrentUser;
  return { esClient, search, fieldCaps, logger: loggingSystemMock.create().get() };
};

describe('applyDefaultDashboardTimeRange', () => {
  it('leaves an explicitly set time range untouched and never probes', async () => {
    const { esClient, search, logger } = setup();
    const dashboardData = dashboard([esqlPanel('p1', Q_TIME_BOUND)], {
      time_range: { from: 'now-7d', to: 'now' },
    });

    const result = await applyDefaultDashboardTimeRange({
      dashboardData,
      esClient,
      logger,
      nowMs: NOW,
    });

    expect(result).toBe(dashboardData);
    expect(search).not.toHaveBeenCalled();
  });

  it('does nothing when no panel is time-bound', async () => {
    const { esClient, search, logger } = setup();
    const result = await applyDefaultDashboardTimeRange({
      dashboardData: dashboard([markdownPanel('md')]),
      esClient,
      logger,
      nowMs: NOW,
    });

    expect(result.time_range).toBeUndefined();
    expect(search).not.toHaveBeenCalled();
  });

  it('sets a 24h relative range from the probed min/max for live data', async () => {
    const { esClient, search, logger } = setup();
    search.mockResolvedValue(minMaxResponse(NOW - 5 * DAY_MS, NOW));

    const result = await applyDefaultDashboardTimeRange({
      dashboardData: dashboard([esqlPanel('p1', Q_TIME_BOUND)]),
      esClient,
      logger,
      nowMs: NOW,
    });

    expect(result).toEqual({
      title: 'Test',
      panels: [esqlPanel('p1', Q_TIME_BOUND)],
      time_range: { from: 'now-24h', to: 'now', mode: 'relative' },
    });
  });

  it('discovers @timestamp via field_caps when the query has no time param', async () => {
    const { esClient, search, fieldCaps, logger } = setup();
    fieldCaps.mockResolvedValue(fieldCapsResponse({ '@timestamp': 'date' }));
    search.mockResolvedValue(minMaxResponse(NOW - 3 * DAY_MS, NOW));

    const result = await applyDefaultDashboardTimeRange({
      dashboardData: dashboard([esqlPanel('p1', Q_NO_PARAM)]),
      esClient,
      logger,
      nowMs: NOW,
    });

    expect(result.time_range).toEqual({ from: 'now-24h', to: 'now', mode: 'relative' });
    expect(fieldCaps).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('skips a dataset that has neither a time param nor @timestamp', async () => {
    const { esClient, search, fieldCaps, logger } = setup();
    fieldCaps.mockResolvedValue(fieldCapsResponse({}));

    const result = await applyDefaultDashboardTimeRange({
      dashboardData: dashboard([esqlPanel('p1', Q_NO_PARAM)]),
      esClient,
      logger,
      nowMs: NOW,
    });

    expect(result.time_range).toBeUndefined();
    expect(search).not.toHaveBeenCalled();
  });

  it('passes the dashboard project_routing to the probe search', async () => {
    const { esClient, search, logger } = setup();
    search.mockResolvedValue(minMaxResponse(NOW - 5 * DAY_MS, NOW));

    const result = await applyDefaultDashboardTimeRange({
      dashboardData: dashboard([esqlPanel('p1', Q_TIME_BOUND)], { project_routing: '_alias:*' }),
      esClient,
      logger,
      nowMs: NOW,
    });

    expect(result.time_range).toEqual({ from: 'now-24h', to: 'now', mode: 'relative' });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ index: 'logs-*', project_routing: '_alias:*' })
    );
  });
});
