/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subscription } from 'rxjs';
import { ChatEventType } from '@kbn/agent-builder-common';
import type { ChatEvent } from '@kbn/agent-builder-common';
import type { DashboardApi } from '@kbn/dashboard-plugin/public';
import {
  buildActiveConversation,
  buildDashboardAttachment,
  buildDashboardUpdatedEvent,
  createAgentBuilderMock,
} from '../test_helpers';
import { createAgentLiveUpdatesSubscription } from './agent_live_updates_subscription';

const APPLIED_STATE = expect.objectContaining({ title: 'Agent dashboard', panels: [] });

describe('createAgentLiveUpdatesSubscription', () => {
  let subscription: Subscription | undefined;

  afterEach(() => {
    subscription?.unsubscribe();
    subscription = undefined;
  });

  const subscribe = (savedObjectId: string | undefined, conversationId?: string) => {
    const { agentBuilder, emitConversation, emitChatEvent } = createAgentBuilderMock();
    emitConversation(buildActiveConversation({ id: conversationId, attachments: [] }));
    const setState = jest.fn();
    const upsertAttachment = jest.fn();

    subscription = createAgentLiveUpdatesSubscription({
      agentBuilder,
      api: {
        savedObjectId$: { getValue: () => savedObjectId },
        setState,
      } as unknown as DashboardApi,
      upsertAttachment,
    });

    return { emitConversation, emitChatEvent, setState, upsertAttachment };
  };

  it.each([
    ['the linked saved dashboard', 'dashboard-1', 'dashboard-1', true],
    ['an unsaved dashboard', undefined, undefined, true],
    ['a different saved dashboard', 'dashboard-1', 'other-dashboard', false],
  ])(
    'upserts the attachment and applies the state only for its own dashboard: %s',
    (_, savedObjectId, origin, applies) => {
      const { emitChatEvent, setState, upsertAttachment } = subscribe(
        savedObjectId,
        'conversation-1'
      );
      const attachment = buildDashboardAttachment({ origin });

      emitChatEvent('conversation-1', buildDashboardUpdatedEvent(attachment));

      expect(upsertAttachment).toHaveBeenCalledWith(attachment);
      expect(setState.mock.calls).toEqual(applies ? [[APPLIED_STATE]] : []);
    }
  );

  it('applies the dashboard state from the first run of a new conversation', () => {
    const { emitConversation, emitChatEvent, setState } = subscribe(undefined);

    // The chat creates the conversation before sending, so its id is published before the run streams
    emitConversation(buildActiveConversation({ id: 'new-conversation', attachments: [] }));
    emitChatEvent('new-conversation', buildDashboardUpdatedEvent(buildDashboardAttachment()));

    expect(setState.mock.calls).toEqual([[APPLIED_STATE]]);
  });

  it('follows the active conversation and ignores events from the previous one', () => {
    const { emitConversation, emitChatEvent, setState } = subscribe(undefined, 'conversation-1');

    emitConversation(buildActiveConversation({ id: 'conversation-2', attachments: [] }));
    emitChatEvent('conversation-1', buildDashboardUpdatedEvent(buildDashboardAttachment()));

    expect(setState).not.toHaveBeenCalled();

    emitChatEvent('conversation-2', buildDashboardUpdatedEvent(buildDashboardAttachment()));

    expect(setState.mock.calls).toEqual([[APPLIED_STATE]]);
  });

  it('ignores other UI events and chat events', () => {
    const { emitChatEvent, setState, upsertAttachment } = subscribe(
      'dashboard-1',
      'conversation-1'
    );
    const attachment = buildDashboardAttachment({ origin: 'dashboard-1' });

    emitChatEvent(
      'conversation-1',
      buildDashboardUpdatedEvent(attachment, 'workflow:yaml_changed')
    );
    emitChatEvent('conversation-1', {
      type: ChatEventType.roundComplete,
      data: {},
    } as unknown as ChatEvent);

    expect(upsertAttachment).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();

    emitChatEvent('conversation-1', buildDashboardUpdatedEvent(attachment));

    expect(upsertAttachment).toHaveBeenCalledWith(attachment);
    expect(setState.mock.calls).toEqual([[APPLIED_STATE]]);
  });
});
