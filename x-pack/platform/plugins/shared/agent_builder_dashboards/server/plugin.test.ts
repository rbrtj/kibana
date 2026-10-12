/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, httpServerMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { attachmentDataToDashboardState } from '@kbn/agent-builder-dashboards-common';
import type { createDashboardAttachmentType } from './attachment_types';
import { AgentBuilderDashboardsPlugin } from './plugin';

type DashboardAttachmentType = ReturnType<typeof createDashboardAttachmentType>;

describe('AgentBuilderDashboardsPlugin', () => {
  it('registers the skill, the SML type, and an attachment type that reads from the dashboard client', async () => {
    const registerAttachmentType = jest.fn<void, [DashboardAttachmentType]>();
    const registerSkill = jest.fn();
    const registerSmlType = jest.fn();
    const read = jest.fn().mockResolvedValue({
      id: 'dashboard-1',
      data: attachmentDataToDashboardState({ title: 'System Overview', panels: [] }),
      meta: { outcome: 'exactMatch', version: 'v1' },
    });

    const plugin = new AgentBuilderDashboardsPlugin(coreMock.createPluginInitializerContext());

    plugin.setup(coreMock.createSetup({ pluginStartDeps: { dashboard: { client: { read } } } }), {
      agentBuilder: {
        attachments: { registerType: registerAttachmentType },
        skills: { register: registerSkill },
      },
      agentBuilderSml: {
        registerType: registerSmlType,
      },
    } as never);

    expect(registerSkill).toHaveBeenCalledWith(expect.objectContaining({ id: 'dashboards' }));
    expect(registerSmlType).toHaveBeenCalledWith(expect.objectContaining({ id: 'dashboard' }));

    const [[attachmentType]] = registerAttachmentType.mock.calls;
    expect(attachmentType.id).toBe('platform.dashboard.dashboard_state');

    const savedObjectsClient = savedObjectsClientMock.create();
    const resolved = await attachmentType.resolve?.('dashboard-1', {
      request: httpServerMock.createKibanaRequest(),
      spaceId: 'default',
      savedObjectsClient,
    });
    expect(read).toHaveBeenCalledWith(savedObjectsClient, 'dashboard-1');
    expect(resolved).toMatchObject({ title: 'System Overview', panels: [] });
  });
});
