/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject, Subject } from 'rxjs';
import type { ChatEvent, Conversation, ToolUiEvent } from '@kbn/agent-builder-common';
import { ChatEventType } from '@kbn/agent-builder-common';
import type { VersionedAttachment } from '@kbn/agent-builder-common/attachments';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import type { ActiveConversation } from '@kbn/agent-builder-browser/events';
import { DASHBOARD_ATTACHMENT_TYPE } from '@kbn/agent-builder-dashboards-common';
import type { DashboardAttachment } from '@kbn/agent-builder-dashboards-common/types';
import { DASHBOARD_UPDATED_UI_EVENT, type DashboardUpdatedUiEventData } from '../../common';

export const buildDashboardAttachment = (
  overrides: Partial<DashboardAttachment> = {}
): DashboardAttachment => ({
  id: 'attachment-1',
  type: DASHBOARD_ATTACHMENT_TYPE,
  data: { title: 'Agent dashboard', panels: [] },
  ...overrides,
});

export const buildVersionedDashboardAttachment = (
  attachment: DashboardAttachment
): VersionedAttachment<typeof DASHBOARD_ATTACHMENT_TYPE> => ({
  id: attachment.id,
  type: attachment.type,
  versions: [
    {
      version: 1,
      data: attachment.data,
      created_at: '2026-01-01T00:00:00.000Z',
      content_hash: 'hash123',
    },
  ],
  current_version: 1,
  origin: attachment.origin,
});

const buildConversation = (id: string, attachments?: DashboardAttachment[]): Conversation => ({
  id,
  agent_id: 'test-agent',
  user: { id: 'user-1', username: 'user-1' },
  title: 'Test conversation',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  rounds: [],
  attachments: attachments?.map(buildVersionedDashboardAttachment),
});

/** Builds the active conversation the chat publishes; omit `id` for a new, unsaved conversation. */
export const buildActiveConversation = ({
  id,
  attachments,
}: {
  id?: string;
  attachments?: DashboardAttachment[];
}): ActiveConversation => ({
  id,
  conversation: id ? buildConversation(id, attachments) : undefined,
});

export const buildDashboardUpdatedEvent = (
  attachment: DashboardAttachment,
  customEvent: string = DASHBOARD_UPDATED_UI_EVENT
): ToolUiEvent<string, DashboardUpdatedUiEventData> => ({
  type: ChatEventType.toolUi,
  data: {
    tool_id: 'platform.dashboard.generate_dashboard',
    tool_call_id: 'tool-call-1',
    custom_event: customEvent,
    data: { attachment },
  },
});

/** An agentBuilder start contract whose chat event streams are keyed by conversation id. */
export const createAgentBuilderMock = () => {
  const activeConversation$ = new BehaviorSubject<ActiveConversation | null>(null);
  const chatEventsByConversationId = new Map<string, Subject<ChatEvent>>();
  const getChatEvents = (conversationId: string): Subject<ChatEvent> => {
    const existing = chatEventsByConversationId.get(conversationId);
    if (existing) {
      return existing;
    }
    const created = new Subject<ChatEvent>();
    chatEventsByConversationId.set(conversationId, created);
    return created;
  };
  const addAttachment = jest.fn();
  const addAttachmentType = jest.fn();

  const agentBuilder = {
    attachments: { addAttachmentType },
    addAttachment,
    events: {
      getChatEvents$: (conversationId: string) => getChatEvents(conversationId).asObservable(),
      ui: { activeConversation$: activeConversation$.asObservable() },
    },
  } as unknown as AgentBuilderPluginStart;

  return {
    agentBuilder,
    addAttachment,
    addAttachmentType,
    emitConversation: (change: ActiveConversation | null) => activeConversation$.next(change),
    emitChatEvent: (conversationId: string, event: ChatEvent) =>
      getChatEvents(conversationId).next(event),
  };
};
