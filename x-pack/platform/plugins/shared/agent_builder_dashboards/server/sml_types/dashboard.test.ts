/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  elasticsearchServiceMock,
  httpServerMock,
  loggingSystemMock,
  savedObjectsClientMock,
} from '@kbn/core/server/mocks';
import type { DashboardPluginStart } from '@kbn/dashboard-plugin/server';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import type { SmlDocument } from '@kbn/agent-builder-sml-plugin/server';
import type { DashboardAttachmentData } from '@kbn/agent-builder-dashboards-common';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  attachmentDataToDashboardState,
} from '@kbn/agent-builder-dashboards-common';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { createDashboardSmlType } from './dashboard';

type DashboardReadResult = Awaited<ReturnType<DashboardPluginStart['client']['read']>>;

const dashboardAttachmentData: DashboardAttachmentData = {
  title: 'System Overview',
  description: 'Main dashboard for key metrics',
  panels: [
    {
      type: LENS_EMBEDDABLE_TYPE,
      id: 'panel-1',
      grid: { x: 0, y: 0, w: 24, h: 15 },
      config: {
        type: 'metric',
        title: 'CPU Usage',
        data_source: { type: 'esql', query: 'FROM metrics-* | STATS cpu = AVG(system.cpu.pct)' },
        metrics: [{ type: 'primary', column: 'cpu' }],
        sampling: 1,
        ignore_global_filters: false,
      },
    },
    {
      id: 'section-1',
      title: 'Operations',
      collapsed: false,
      grid: { y: 20 },
      panels: [
        {
          type: 'markdown',
          id: 'panel-2',
          grid: { x: 24, y: 0, w: 24, h: 10 },
          config: {
            title: 'Summary',
            content: 'All systems nominal',
          },
        },
      ],
    },
  ],
};

const dashboardStateWithLensApi = {
  title: 'API Lens Dashboard',
  description: 'Dashboard with API-format lens panel',
  panels: [
    {
      type: LENS_EMBEDDABLE_TYPE,
      id: 'panel-3',
      grid: { x: 0, y: 0, w: 24, h: 12 },
      config: {
        attributes: {
          type: 'lnsXY',
          title: 'Request Rate',
        },
      },
    },
  ],
} as unknown as DashboardState;

const readResult = (
  data: DashboardState = attachmentDataToDashboardState(dashboardAttachmentData),
  id = 'dashboard-1'
): DashboardReadResult =>
  ({ id, data, meta: { outcome: 'exactMatch', version: 'v1' } } as DashboardReadResult);

const smlItem = (originId: string): SmlDocument => ({
  type: 'dashboard',
  title: 'System Overview',
  content: '...',
  id: 'chunk-1',
  '@timestamp': '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
  references: [{ uri: `dashboard://${originId}`, relation: 'derived_from' }],
  governance: {
    provenance: {
      created_by: { uri: 'crawler://sml', metadata: { ingestion_method: 'crawled' } },
      updated_by: { uri: 'crawler://sml', metadata: { ingestion_method: 'crawled' } },
    },
  },
  permissions: {
    kibana: {
      privileges: [{ space: 'default', name: ['ai_index:dashboard/read'], count: 1 }],
    },
  },
});

const setup = ({ read = jest.fn().mockResolvedValue(readResult()) } = {}) => {
  const savedObjectsClient = savedObjectsClientMock.create();
  const logger = loggingSystemMock.create().get();
  const smlType = createDashboardSmlType({
    getDashboardClient: async () => ({ read } as unknown as DashboardPluginStart['client']),
  });
  const context = {
    esClient: elasticsearchServiceMock.createElasticsearchClient(),
    savedObjectsClient,
    logger,
  };
  const attachmentContext = {
    request: httpServerMock.createKibanaRequest(),
    spaceId: 'default',
    savedObjectsClient,
  };
  return { smlType, context, attachmentContext, savedObjectsClient, logger, read };
};

const mockFinder = (
  savedObjectsClient: ReturnType<typeof savedObjectsClientMock.create>,
  find: () => AsyncGenerator<{ saved_objects: object[] }>
) => {
  const finder = { find: jest.fn(find), close: jest.fn().mockResolvedValue(undefined) };
  savedObjectsClient.createPointInTimeFinder.mockReturnValue(
    finder as unknown as ReturnType<typeof savedObjectsClient.createPointInTimeFinder>
  );
  return finder;
};

const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
};

describe('dashboardSmlType', () => {
  it('lists dashboards across all spaces', async () => {
    const { smlType, context, savedObjectsClient } = setup();
    const finder = mockFinder(savedObjectsClient, async function* () {
      yield {
        saved_objects: [
          { id: 'dashboard-1', updated_at: '2025-01-01T00:00:00.000Z', namespaces: ['default'] },
        ],
      };
    });

    const pages = await collect(smlType.list(context));

    expect(savedObjectsClient.createPointInTimeFinder).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'dashboard', namespaces: ['*'] })
    );
    expect(pages).toEqual([
      [{ id: 'dashboard-1', updatedAt: '2025-01-01T00:00:00.000Z', spaces: ['default'] }],
    ]);
    expect(finder.close).toHaveBeenCalledTimes(1);
  });

  it('closes the finder when listing fails', async () => {
    const { smlType, context, savedObjectsClient } = setup();
    const finder = mockFinder(savedObjectsClient, async function* () {
      yield* [];
      throw new Error('search_phase_execution_exception');
    });

    await expect(collect(smlType.list(context))).rejects.toThrow(
      'search_phase_execution_exception'
    );
    expect(finder.close).toHaveBeenCalledTimes(1);
  });

  it('builds search content from title, panels and sections', async () => {
    const { smlType, context, read, savedObjectsClient } = setup();

    const result = await smlType.getSmlEntry('dashboard-1', context);

    expect(read).toHaveBeenCalledWith(savedObjectsClient, 'dashboard-1');
    expect(result).toEqual({
      type: 'dashboard',
      title: 'System Overview',
      content: [
        'System Overview',
        'Main dashboard for key metrics',
        'CPU Usage',
        'vis',
        'panel:panel-1',
        'Operations',
        'section:section-1',
        'Summary',
        'markdown',
        'panel:panel-2',
        '2 panels',
        '1 sections',
      ].join('\n'),
    });
  });

  it('falls back to the origin id, Lens attribute titles, and no panel token without an id', async () => {
    const { smlType, context } = setup({
      read: jest.fn().mockResolvedValue(
        readResult({
          panels: [
            {
              type: LENS_EMBEDDABLE_TYPE,
              grid: { x: 0, y: 0, w: 24, h: 12 },
              config: { attributes: { title: 'Request Rate' } },
            },
          ],
        } as unknown as DashboardState)
      ),
    });

    expect(await smlType.getSmlEntry('dashboard-1', context)).toEqual({
      type: 'dashboard',
      title: 'dashboard-1',
      content: ['Request Rate', 'vis', '1 panels', '0 sections'].join('\n'),
    });
  });

  it('returns undefined and warns when the dashboard read fails', async () => {
    const { smlType, context, logger } = setup({
      read: jest
        .fn()
        .mockRejectedValue(new Error('Saved object [dashboard/dashboard-1] not found')),
    });

    expect(await smlType.getSmlEntry('dashboard-1', context)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "SML dashboard: failed to get data for 'dashboard-1': Saved object [dashboard/dashboard-1] not found"
    );
  });

  it('converts saved dashboards into dashboard attachments with origin', async () => {
    const { smlType, attachmentContext, read, savedObjectsClient } = setup();

    const result = await smlType.toAttachment(smlItem('dashboard-1'), attachmentContext);

    expect(read).toHaveBeenCalledWith(savedObjectsClient, 'dashboard-1');
    expect(result).toMatchObject({
      type: DASHBOARD_ATTACHMENT_TYPE,
      origin: 'dashboard-1',
      data: {
        title: 'System Overview',
        description: 'Main dashboard for key metrics',
        panels: [
          { id: 'panel-1', type: LENS_EMBEDDABLE_TYPE, config: { title: 'CPU Usage' } },
          {
            id: 'section-1',
            title: 'Operations',
            panels: [{ id: 'panel-2', type: 'markdown' }],
          },
        ],
      },
    });
  });

  it('falls back to generic panel storage when a lens panel is already in API format', async () => {
    const { smlType, attachmentContext } = setup({
      read: jest.fn().mockResolvedValue(readResult(dashboardStateWithLensApi, 'dashboard-2')),
    });

    const result = await smlType.toAttachment(smlItem('dashboard-2'), attachmentContext);

    expect(result).toMatchObject({
      type: DASHBOARD_ATTACHMENT_TYPE,
      origin: 'dashboard-2',
      data: {
        panels: [
          {
            id: 'panel-3',
            type: LENS_EMBEDDABLE_TYPE,
            config: { attributes: { type: 'lnsXY', title: 'Request Rate' } },
          },
        ],
      },
    });
  });

  it('throws with the origin id when the dashboard read fails', async () => {
    const { smlType, attachmentContext } = setup({
      read: jest
        .fn()
        .mockRejectedValue(new Error('Saved object [dashboard/dashboard-1] not found')),
    });

    await expect(smlType.toAttachment(smlItem('dashboard-1'), attachmentContext)).rejects.toThrow(
      "SML dashboard: failed to get data for 'dashboard-1': Saved object [dashboard/dashboard-1] not found"
    );
  });

  it('getPermissions returns the ai_index:dashboard/read action', () => {
    const { smlType, context } = setup();
    const { getPermissions } = smlType;
    if (!getPermissions) {
      throw new Error('dashboard SML type must define getPermissions');
    }

    expect(getPermissions('dashboard-1', context)).toEqual({
      kibana: { privileges: { name: ['ai_index:dashboard/read'] } },
    });
  });
});
