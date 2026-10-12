/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject } from 'rxjs';
import type { DashboardApi, DashboardRendererProps } from '@kbn/dashboard-plugin/public';
import { buildDashboardAttachment } from './test_helpers';
import { handlePreview } from './handle_preview';

const ATTACHMENT_DATA = {
  title: 'Agent dashboard',
  description: 'Built by the agent',
  panels: [],
  time_range: { from: 'now-7d', to: 'now' },
  query: { expression: 'host.name: "web-01"', language: 'kql' as const },
};

interface Scenario {
  withDashboardApi?: boolean;
  canWriteDashboards?: boolean;
  isSidebar?: boolean;
  withLocator?: boolean;
  origin?: string;
  checkSavedDashboardExist?: (dashboardId: string) => Promise<boolean>;
}

const runPreview = async ({
  withDashboardApi = false,
  canWriteDashboards = true,
  isSidebar = true,
  withLocator = true,
  origin,
  checkSavedDashboardExist = async (dashboardId) => dashboardId === 'existing-dashboard',
}: Scenario) => {
  const dashboardApi = {
    savedObjectId$: new BehaviorSubject<string | undefined>(origin),
    setState: jest.fn(),
    locator: { navigate: jest.fn() },
  };
  const dashboardLocator = { navigate: jest.fn().mockResolvedValue(undefined) };
  const openCanvas = jest.fn();

  await handlePreview({
    attachment: buildDashboardAttachment({ origin, data: ATTACHMENT_DATA }),
    dashboardApi: withDashboardApi ? (dashboardApi as unknown as DashboardApi) : undefined,
    canWriteDashboards,
    isSidebar,
    dashboardLocator: withLocator
      ? (dashboardLocator as unknown as DashboardRendererProps['locator'])
      : undefined,
    checkSavedDashboardExist,
    openCanvas,
  });

  return { setState: dashboardApi.setState, dashboardLocator, openCanvas };
};

describe('handlePreview', () => {
  it('applies the attachment to the open dashboard app when the user can write dashboards', async () => {
    const { setState, dashboardLocator, openCanvas } = await runPreview({
      withDashboardApi: true,
      origin: 'existing-dashboard',
    });

    expect(setState).toHaveBeenCalledWith(expect.objectContaining({ title: 'Agent dashboard' }));
    expect(dashboardLocator.navigate).not.toHaveBeenCalled();
    expect(openCanvas).not.toHaveBeenCalled();
  });

  it.each([
    ['the linked dashboard exists', 'existing-dashboard', 'existing-dashboard'],
    ['the linked dashboard was deleted', 'deleted-dashboard', undefined],
  ])(
    'opens the full attachment state in Dashboards from the sidebar when %s',
    async (_, origin, dashboardId) => {
      const { dashboardLocator, openCanvas } = await runPreview({ origin });

      expect(dashboardLocator.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Agent dashboard',
          description: 'Built by the agent',
          panels: [],
          time_range: { from: 'now-7d', to: 'now' },
          query: { expression: 'host.name: "web-01"', language: 'kql' },
          dashboardId,
          viewMode: 'edit',
        })
      );
      expect(openCanvas).not.toHaveBeenCalled();
    }
  );

  it('opens an unlinked attachment as a new dashboard without an existence check', async () => {
    const { dashboardLocator } = await runPreview({
      checkSavedDashboardExist: () => Promise.reject(new Error('existence check not expected')),
    });

    expect(dashboardLocator.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Agent dashboard', dashboardId: undefined })
    );
  });

  it.each<[string, Scenario]>([
    [
      'the dashboard app is open but the user cannot write',
      { withDashboardApi: true, canWriteDashboards: false },
    ],
    ['the preview is not in the sidebar', { isSidebar: false }],
    ['no dashboard locator is available', { withLocator: false }],
    ['the user cannot write dashboards', { canWriteDashboards: false }],
  ])('opens the canvas when %s', async (_, scenario) => {
    const { setState, dashboardLocator, openCanvas } = await runPreview(scenario);

    expect(openCanvas).toHaveBeenCalledTimes(1);
    expect(setState).not.toHaveBeenCalled();
    expect(dashboardLocator.navigate).not.toHaveBeenCalled();
  });
});
