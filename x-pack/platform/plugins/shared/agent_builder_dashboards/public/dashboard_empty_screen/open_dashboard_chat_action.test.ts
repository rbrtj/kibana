/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import { OPEN_DASHBOARD_CHAT_ACTION_ID } from '@kbn/dashboard-plugin/public';
import { createOpenDashboardChatAction } from './open_dashboard_chat_action';

describe('createOpenDashboardChatAction', () => {
  const openChat = jest.fn() as jest.MockedFunction<AgentBuilderPluginStart['openChat']>;
  const trigger = { id: OPEN_DASHBOARD_CHAT_ACTION_ID };

  beforeEach(() => {
    openChat.mockClear();
  });

  it('presents a Create with chat entry point that is always compatible', async () => {
    const { getIconType, getDisplayName, getDisplayNameTooltip, isCompatible } =
      createOpenDashboardChatAction(openChat);
    if (!getIconType || !getDisplayNameTooltip || !isCompatible) {
      throw new Error('Expected the action to define its icon, tooltip and compatibility');
    }

    expect({
      icon: getIconType({ trigger }),
      label: getDisplayName({ trigger }),
      tooltip: getDisplayNameTooltip({ trigger }),
      compatible: await isCompatible({ trigger }),
    }).toEqual({
      icon: 'productAgent',
      label: 'Create with chat',
      tooltip: 'Build any panel using an agent.',
      compatible: true,
    });
  });

  it.each([
    ['the provided prompt', 'Create a dashboard', 'Create a dashboard'],
    ['an empty editor when no prompt is provided', undefined, ''],
  ])('opens Chat with %s without sending', async (_, initialMessage, expectedMessage) => {
    const action = createOpenDashboardChatAction(openChat);

    await action.execute({ initialMessage, trigger });

    expect(openChat).toHaveBeenCalledWith({
      newConversation: true,
      initialMessage: expectedMessage,
      autoSendInitialMessage: false,
      sessionTag: 'dashboard',
    });
  });
});
