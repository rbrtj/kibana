/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject } from 'rxjs';
import type { DashboardApi } from '@kbn/dashboard-plugin/public';
import { buildDashboardAttachment } from '../test_helpers';
import { previewAttachmentInDashboard } from './preview_attachment';

const ATTACHMENT_DATA = {
  title: 'Agent dashboard',
  description: 'Built by the agent',
  panels: [],
  time_range: { from: 'now-7d', to: 'now' },
  query: { expression: 'host.name: "web-01"', language: 'kql' as const },
};

const EXISTING_DASHBOARD_IDS = ['d1', 'd2'];

const preview = async (currentSavedObjectId: string | undefined, origin: string | undefined) => {
  const dashboardApi = {
    savedObjectId$: new BehaviorSubject(currentSavedObjectId),
    setState: jest.fn(),
    locator: { navigate: jest.fn() },
  };
  await previewAttachmentInDashboard({
    attachment: buildDashboardAttachment({ origin, data: ATTACHMENT_DATA }),
    dashboardApi: dashboardApi as unknown as DashboardApi,
    checkSavedDashboardExist: async (dashboardId) => EXISTING_DASHBOARD_IDS.includes(dashboardId),
  });
  return dashboardApi;
};

describe('previewAttachmentInDashboard', () => {
  it.each([
    ['the open dashboard is the linked one', 'd1', 'd1'],
    ['both the dashboard and the attachment are unsaved', undefined, undefined],
    ['the open dashboard is unsaved and the linked one was deleted', undefined, 'gone'],
  ])('applies the attachment state in place when %s', async (_, currentId, origin) => {
    const { setState, locator } = await preview(currentId, origin);

    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Agent dashboard',
        description: 'Built by the agent',
        panels: [],
        time_range: { from: 'now-7d', to: 'now' },
        query: { expression: 'host.name: "web-01"', language: 'kql' },
      })
    );
    expect(locator.navigate).not.toHaveBeenCalled();
  });

  it.each([
    ['the open dashboard is unsaved and the linked one exists', undefined, 'd2', 'd2'],
    ['the open dashboard is saved and the attachment is unlinked', 'd1', undefined, undefined],
    ['the open dashboard is saved and the linked one was deleted', 'd1', 'gone', undefined],
    ['the attachment is linked to another existing dashboard', 'd1', 'd2', 'd2'],
  ])(
    'navigates with only title, description, panels and time range when %s',
    async (_, currentId, origin, dashboardId) => {
      const { setState, locator } = await preview(currentId, origin);

      expect(locator.navigate).toHaveBeenCalledWith({
        title: 'Agent dashboard',
        description: 'Built by the agent',
        panels: [],
        time_range: { from: 'now-7d', to: 'now' },
        dashboardId,
        viewMode: 'edit',
      });
      expect(setState).not.toHaveBeenCalled();
    }
  );
});
