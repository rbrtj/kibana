/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subscription } from 'rxjs';
import type { ActiveConversation } from '@kbn/agent-builder-browser/events';
import { createIdGenerator } from '..';
import {
  buildActiveConversation,
  buildDashboardAttachment,
  createAgentBuilderMock,
} from '../test_helpers';
import { createNewAttachmentIdRegenerationSubscription } from './new_attachment_id_regeneration_subscription';

describe('createNewAttachmentIdRegenerationSubscription', () => {
  let subscription: Subscription | undefined;

  afterEach(() => {
    subscription?.unsubscribe();
    subscription = undefined;
  });

  const subscribe = () => {
    const { agentBuilder, emitConversation } = createAgentBuilderMock();
    const draftAttachmentId = createIdGenerator();
    subscription = createNewAttachmentIdRegenerationSubscription({
      agentBuilder,
      draftAttachmentId,
    });
    return { draftAttachmentId, emitConversation };
  };

  const conversationWith = (attachmentIds: string[]): ActiveConversation =>
    buildActiveConversation({
      id: 'conversation-1',
      attachments: attachmentIds.map((id) => buildDashboardAttachment({ id })),
    });

  it.each<[string, (draftId: string) => ActiveConversation | null, boolean]>([
    ['contains the draft attachment', (draftId) => conversationWith(['other', draftId]), true],
    ['contains only other attachments', () => conversationWith(['other']), false],
    [
      'has no attachments',
      () => buildActiveConversation({ id: 'conversation-1', attachments: undefined }),
      false,
    ],
    ['is a new conversation', () => buildActiveConversation({}), false],
    ['is cleared', () => null, false],
  ])(
    'rotates the draft id only when the active conversation %s',
    (_, buildConversation, rotates) => {
      const { draftAttachmentId, emitConversation } = subscribe();
      const initialId = draftAttachmentId.current;

      emitConversation(buildConversation(initialId));

      expect(draftAttachmentId.current !== initialId).toBe(rotates);
    }
  );

  it('rotates once per draft, and again once the next draft is added', () => {
    const { draftAttachmentId, emitConversation } = subscribe();
    const firstId = draftAttachmentId.current;

    emitConversation(conversationWith([firstId]));
    const secondId = draftAttachmentId.current;
    emitConversation(conversationWith([firstId]));

    expect(secondId).not.toBe(firstId);
    expect(draftAttachmentId.current).toBe(secondId);

    emitConversation(conversationWith([firstId, secondId]));

    expect([firstId, secondId]).not.toContain(draftAttachmentId.current);
  });
});
