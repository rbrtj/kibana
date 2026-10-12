/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, loggingSystemMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import {
  hashContent,
  type VersionedAttachmentWithOrigin,
} from '@kbn/agent-builder-common/attachments';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  attachmentDataToDashboardState,
  type AttachmentPanel,
  type DashboardAttachmentData,
} from '@kbn/agent-builder-dashboards-common';
import type { DashboardPluginStart } from '@kbn/dashboard-plugin/server';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { createDashboardAttachmentType } from './dashboard';

type DashboardReadResult = Awaited<ReturnType<DashboardPluginStart['client']['read']>>;
type DashboardAttachment = VersionedAttachmentWithOrigin<
  typeof DASHBOARD_ATTACHMENT_TYPE,
  DashboardAttachmentData
>;

const grid = { x: 0, y: 0, w: 24, h: 15 };

const metricApiConfig = {
  type: 'metric',
  title: 'Request count',
  data_source: { type: 'esql', query: 'FROM logs | STATS count = COUNT(*)' },
  metrics: [{ type: 'primary', column: 'count' }],
  sampling: 1,
  ignore_global_filters: false,
};

const lensPanel: AttachmentPanel = {
  type: LENS_EMBEDDABLE_TYPE,
  id: 'panel-1',
  grid,
  config: metricApiConfig,
};

const dashboardData = (
  overrides: Partial<DashboardAttachmentData> = {}
): DashboardAttachmentData => ({
  title: 'System Overview',
  description: 'Main dashboard for key metrics',
  panels: [lensPanel],
  ...overrides,
});

const readResult = (
  data: DashboardReadResult['data'] = attachmentDataToDashboardState(dashboardData()),
  meta: Partial<DashboardReadResult['meta']> = {}
): DashboardReadResult =>
  ({
    id: 'dashboard-1',
    data,
    meta: { outcome: 'exactMatch', version: 'v1', updated_at: '2025-01-02T00:00:00.000Z', ...meta },
  } as DashboardReadResult);

const withInternalLensAttributes = (): DashboardReadResult['data'] => {
  const [storedPanel] = attachmentDataToDashboardState(dashboardData()).panels;
  if (!('config' in storedPanel)) {
    throw new Error('expected a Lens panel');
  }
  const { attributes } = storedPanel.config as { attributes: unknown };
  return attachmentDataToDashboardState(
    dashboardData({ panels: [{ ...lensPanel, config: { attributes } }] })
  );
};

const attachment = (
  data: DashboardAttachmentData,
  overrides: Partial<DashboardAttachment> = {}
): DashboardAttachment => ({
  id: 'att-1',
  type: DASHBOARD_ATTACHMENT_TYPE,
  origin: 'dashboard-1',
  origin_snapshot_at: '2025-01-01T00:00:00.000Z',
  versions: [
    {
      version: 1,
      data,
      created_at: '2025-01-01T00:00:00.000Z',
      content_hash: hashContent(data),
    },
  ],
  current_version: 1,
  active: true,
  readonly: false,
  ...overrides,
});

const setup = ({ read = jest.fn().mockResolvedValue(readResult()) } = {}) => {
  const logger = loggingSystemMock.create().get();
  const definition = createDashboardAttachmentType({
    logger,
    getDashboardClient: async () => ({ read } as unknown as DashboardPluginStart['client']),
  });
  const { resolve, isStale } = definition;
  if (!resolve || !isStale) {
    throw new Error('dashboard attachment type must define resolve and isStale');
  }
  const savedObjectsClient = savedObjectsClientMock.create();
  const context = {
    request: httpServerMock.createKibanaRequest(),
    spaceId: 'default',
    savedObjectsClient,
  };
  return { definition, resolve, isStale, context, logger, read, savedObjectsClient };
};

describe('createDashboardAttachmentType', () => {
  describe('validate', () => {
    it('accepts panels and sections', async () => {
      const { definition } = setup();
      const data = dashboardData({
        panels: [
          lensPanel,
          { id: 'section-1', title: 'Details', collapsed: false, grid: { y: 15 }, panels: [] },
        ],
      });

      expect(await definition.validate(data)).toEqual({ valid: true, data });
    });

    it('rejects a panel wider than the grid', async () => {
      const { definition } = setup();

      expect(
        await definition.validate(
          dashboardData({ panels: [{ ...lensPanel, grid: { ...grid, w: 49 } }] })
        )
      ).toEqual({
        valid: false,
        error: expect.stringContaining('"message": "Too big: expected number to be <=48"'),
      });
    });
  });

  describe('resolve', () => {
    it('reads the dashboard and converts Lens panels to API format', async () => {
      const { resolve, context, read, savedObjectsClient } = setup({
        read: jest.fn().mockResolvedValue(readResult(withInternalLensAttributes())),
      });

      const result = await resolve('dashboard-1', context);

      expect(read).toHaveBeenCalledWith(savedObjectsClient, 'dashboard-1');
      expect(result).toMatchObject({
        title: 'System Overview',
        description: 'Main dashboard for key metrics',
        panels: [{ type: LENS_EMBEDDABLE_TYPE, id: 'panel-1', grid, config: metricApiConfig }],
      });
    });

    it('returns undefined and warns without a saved objects client', async () => {
      const { resolve, context, logger, read } = setup();

      const result = await resolve('dashboard-1', { ...context, savedObjectsClient: undefined });

      expect(result).toBeUndefined();
      expect(read).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to resolve dashboard attachment for origin "dashboard-1": Error: Saved objects client is required to read dashboard attachments'
      );
    });

    it('returns undefined and warns when the dashboard read fails', async () => {
      const { resolve, context, logger } = setup({
        read: jest
          .fn()
          .mockRejectedValue(new Error('Saved object [dashboard/dashboard-1] not found')),
      });

      expect(await resolve('dashboard-1', context)).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to resolve dashboard attachment for origin "dashboard-1": Error: Saved object [dashboard/dashboard-1] not found'
      );
    });
  });

  describe('isStale', () => {
    it('returns true when the dashboard changed after the snapshot', async () => {
      const { isStale, context, logger } = setup();

      expect(await isStale(attachment(dashboardData({ title: 'Old title' })), context)).toBe(true);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('returns false when the dashboard data matches the attachment', async () => {
      const { isStale, context, logger } = setup();

      expect(await isStale(attachment(dashboardData()), context)).toBe(false);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('treats a dashboard Lens panel stored as internal attributes as equal to its API format', async () => {
      const { isStale, context, logger } = setup({
        read: jest.fn().mockResolvedValue(readResult(withInternalLensAttributes())),
      });

      expect(await isStale(attachment(dashboardData()), context)).toBe(false);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it.each([
      ['the attachment has no origin', { origin: '' }, {}],
      ['the attachment has no snapshot time', { origin_snapshot_at: '' }, {}],
      ['the dashboard has no updated_at', {}, { updated_at: undefined }],
      [
        'the dashboard was updated before the snapshot',
        {},
        { updated_at: '2024-12-31T00:00:00.000Z' },
      ],
    ])(
      'returns false for changed data when %s',
      async (_name, attachmentOverrides, metaOverrides) => {
        const { isStale, context, logger } = setup({
          read: jest.fn().mockResolvedValue(readResult(undefined, metaOverrides)),
        });

        expect(
          await isStale(
            attachment(dashboardData({ title: 'Old title' }), attachmentOverrides),
            context
          )
        ).toBe(false);
        expect(logger.warn).not.toHaveBeenCalled();
      }
    );

    it('returns false and warns when no version matches current_version', async () => {
      const { isStale, context, logger } = setup();

      expect(
        await isStale(
          attachment(dashboardData({ title: 'Old title' }), { current_version: 2 }),
          context
        )
      ).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Attachment "att-1" has no version matching current_version 2'
      );
    });

    it('returns false and warns when the dashboard read fails', async () => {
      const { isStale, context, logger } = setup({
        read: jest
          .fn()
          .mockRejectedValue(new Error('Saved object [dashboard/dashboard-1] not found')),
      });

      expect(await isStale(attachment(dashboardData({ title: 'Old title' })), context)).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to check staleness for dashboard attachment "dashboard-1": Error: Saved object [dashboard/dashboard-1] not found'
      );
    });
  });
});
