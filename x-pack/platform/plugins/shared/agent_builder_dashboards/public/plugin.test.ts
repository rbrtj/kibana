/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart, PluginInitializerContext } from '@kbn/core/public';
import {
  OPEN_DASHBOARD_CHAT_ACTION_ID,
  ENHANCE_DASHBOARD_ACTION_ID,
} from '@kbn/dashboard-plugin/public';
import { AgentBuilderDashboardsPlugin } from './plugin';
import type { AgentBuilderDashboardsPluginPublicStartDependencies } from './types';

jest.mock('./attachment_types', () => ({
  registerDashboardAttachmentUiDefinition: jest.fn(() => jest.fn()),
  createIdGenerator: () => ({
    current: 'draft-id',
    next: jest.fn(),
  }),
}));

describe('AgentBuilderDashboardsPlugin', () => {
  const registerActionAsync = jest.fn();

  const createCoreStart = ({
    showAgentBuilder = true,
    dashboardCapabilities = { showWriteControls: true },
  }: {
    showAgentBuilder?: boolean;
    dashboardCapabilities?: Record<string, boolean>;
  } = {}) =>
    ({
      application: {
        capabilities: {
          agentBuilder: { show: showAgentBuilder },
          dashboard_v2: dashboardCapabilities,
        },
      },
      chrome: {},
    } as unknown as CoreStart);

  const createStartDependencies = () =>
    ({
      agentBuilder: {
        openChat: jest.fn(),
        getAgentBuilderAccess: jest.fn(),
      },
      dashboard: {},
      share: {
        url: {
          locators: {
            get: jest.fn(),
          },
        },
      },
      uiActions: {
        registerActionAsync,
      },
    } as unknown as AgentBuilderDashboardsPluginPublicStartDependencies);

  const startPlugin = (options?: Parameters<typeof createCoreStart>[0]) => {
    const plugin = new AgentBuilderDashboardsPlugin({} as PluginInitializerContext);
    plugin.start(createCoreStart(options), createStartDependencies());
    return plugin;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers lazy chat and enhance actions whose ids match their registration keys', async () => {
    startPlugin();

    const registered = await Promise.all(
      registerActionAsync.mock.calls.map(async ([key, createAction]) => [
        key,
        (await createAction()).id,
      ])
    );

    expect(registered).toEqual([
      [OPEN_DASHBOARD_CHAT_ACTION_ID, OPEN_DASHBOARD_CHAT_ACTION_ID],
      [ENHANCE_DASHBOARD_ACTION_ID, ENHANCE_DASHBOARD_ACTION_ID],
    ]);
  });

  it('does not register dashboard Chat entry points without Agent Builder capabilities', () => {
    startPlugin({ showAgentBuilder: false });

    expect(registerActionAsync).not.toHaveBeenCalled();
  });
});
