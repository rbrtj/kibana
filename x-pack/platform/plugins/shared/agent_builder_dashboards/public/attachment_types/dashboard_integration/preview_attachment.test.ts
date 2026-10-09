/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardApi } from '@kbn/dashboard-plugin/public';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  type DashboardAttachment,
} from '@kbn/agent-builder-dashboards-common';
import { previewAttachmentInDashboard } from './preview_attachment';

const buildAttachment = (origin?: string): DashboardAttachment => ({
  id: 'attachment-1',
  type: DASHBOARD_ATTACHMENT_TYPE,
  origin,
  data: { title: 'Agent dashboard', panels: [] },
});

const createDashboardApi = (savedObjectId: string | undefined) => {
  const setState = jest.fn();
  const navigate = jest.fn();
  const dashboardApi = {
    savedObjectId$: { getValue: () => savedObjectId },
    setState,
    locator: { navigate },
  } as unknown as DashboardApi;
  return { dashboardApi, setState, navigate };
};

describe('previewAttachmentInDashboard', () => {
  it.each([
    ['the attachment is linked to the open dashboard', 'dashboard-1', 'dashboard-1', true],
    [
      'an unsaved dashboard previews an attachment of a deleted dashboard',
      undefined,
      'gone',
      false,
    ],
  ])(
    'tags the applied state as an agent change when %s',
    async (_, savedObjectId, origin, exists) => {
      const { dashboardApi, setState, navigate } = createDashboardApi(savedObjectId);

      await previewAttachmentInDashboard({
        attachment: buildAttachment(origin),
        dashboardApi,
        checkSavedDashboardExist: jest.fn().mockResolvedValue(exists),
      });

      expect(setState).toHaveBeenCalledWith(expect.objectContaining({ title: 'Agent dashboard' }), {
        changeSources: ['agent'],
      });
      expect(navigate).not.toHaveBeenCalled();
    }
  );

  it('tags the navigation to the linked dashboard as an agent change', async () => {
    const { dashboardApi, setState, navigate } = createDashboardApi('other-dashboard');

    await previewAttachmentInDashboard({
      attachment: buildAttachment('dashboard-1'),
      dashboardApi,
      checkSavedDashboardExist: jest.fn().mockResolvedValue(true),
    });

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboardId: 'dashboard-1',
        title: 'Agent dashboard',
        viewMode: 'edit',
        changeSources: ['agent'],
      })
    );
    expect(setState).not.toHaveBeenCalled();
  });
});
