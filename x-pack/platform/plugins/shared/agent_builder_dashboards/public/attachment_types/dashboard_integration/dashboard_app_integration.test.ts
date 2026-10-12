/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject, Subject } from 'rxjs';
import {
  attachmentDataToDashboardState,
  DASHBOARD_ATTACHMENT_TYPE,
} from '@kbn/agent-builder-dashboards-common';
import type { DashboardApi, DashboardSaveEvent } from '@kbn/dashboard-plugin/public';
import {
  buildActiveConversation,
  buildDashboardAttachment,
  createAgentBuilderMock,
} from '../test_helpers';
import {
  MANUAL_CHANGES_DEBOUNCE_MS,
  registerDashboardAppIntegration,
} from './dashboard_app_integration';
import type { IdGenerator } from '..';

const createSequentialIdGenerator = (): IdGenerator => {
  let counter = 1;
  return {
    get current() {
      return `draft-attachment-id-${counter}`;
    },
    next() {
      counter += 1;
      return `draft-attachment-id-${counter}`;
    },
  };
};

describe('registerDashboardAppIntegration', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    jest.useRealTimers();
  });

  const register = ({ savedObjectId }: { savedObjectId?: string } = {}) => {
    const { agentBuilder, addAttachment, emitConversation } = createAgentBuilderMock();
    const anyStateChange$ = new Subject<void>();
    const onSave$ = new Subject<DashboardSaveEvent>();
    const api = {
      anyStateChange$,
      savedObjectId$: new BehaviorSubject(savedObjectId),
      onSave$,
      setState: jest.fn(),
      getSerializedState: jest.fn().mockReturnValue({
        attributes: { title: 'Test Dashboard', description: 'Test Description', panels: [] },
      }),
    };
    const updateOrigin = jest.fn().mockResolvedValue(undefined);
    const getUpdateOrigin = jest.fn().mockReturnValue(updateOrigin);

    cleanup = registerDashboardAppIntegration({
      agentBuilder,
      api: api as unknown as DashboardApi,
      draftAttachmentId: createSequentialIdGenerator(),
      checkSavedDashboardExist: async () => true,
      getUpdateOrigin,
    });

    const changeDashboard = () => {
      anyStateChange$.next();
      jest.advanceTimersByTime(MANUAL_CHANGES_DEBOUNCE_MS);
    };

    return {
      addAttachment,
      emitConversation,
      onSave$,
      updateOrigin,
      getUpdateOrigin,
      changeDashboard,
    };
  };

  it('syncs manual changes into the attachment linked to the open dashboard', () => {
    const { addAttachment, emitConversation, changeDashboard } = register({
      savedObjectId: 'dashboard-2',
    });
    emitConversation(
      buildActiveConversation({
        id: 'conversation-1',
        attachments: [
          buildDashboardAttachment({ id: 'dashboard-attachment-1', origin: 'dashboard-1' }),
          buildDashboardAttachment({ id: 'dashboard-attachment-2', origin: 'dashboard-2' }),
        ],
      })
    );

    changeDashboard();

    expect(addAttachment).toHaveBeenLastCalledWith({
      id: 'dashboard-attachment-2',
      type: DASHBOARD_ATTACHMENT_TYPE,
      origin: 'dashboard-2',
      data: expect.objectContaining({ title: 'Test Dashboard', description: 'Test Description' }),
    });
  });

  it('updates the origin through the attachment updater on save', async () => {
    const { emitConversation, onSave$, updateOrigin, getUpdateOrigin } = register();
    emitConversation(
      buildActiveConversation({
        id: 'conversation-1',
        attachments: [
          buildDashboardAttachment({ id: 'dashboard-attachment-id', origin: 'dashboard-1' }),
        ],
      })
    );

    onSave$.next({
      previousDashboardId: 'dashboard-1',
      dashboardId: 'dashboard-2',
      dashboardState: attachmentDataToDashboardState({ title: 'Saved', panels: [] }),
    });
    await Promise.resolve();

    expect(getUpdateOrigin).toHaveBeenCalledWith('dashboard-attachment-id');
    expect(updateOrigin).toHaveBeenCalledWith('dashboard-2');
  });

  it('creates a draft attachment from the current dashboard when switching to a new conversation', () => {
    const { addAttachment, emitConversation } = register({ savedObjectId: 'dashboard-1' });
    emitConversation(
      buildActiveConversation({
        id: 'conversation-1',
        attachments: [buildDashboardAttachment({ origin: 'dashboard-1' })],
      })
    );
    jest.runOnlyPendingTimers();

    emitConversation(buildActiveConversation({}));
    jest.runOnlyPendingTimers();

    expect(addAttachment).toHaveBeenLastCalledWith({
      id: 'draft-attachment-id-1',
      type: DASHBOARD_ATTACHMENT_TYPE,
      origin: 'dashboard-1',
      data: expect.objectContaining({ title: 'Test Dashboard' }),
    });
  });

  it('adds a draft only while the conversation is new', () => {
    const { addAttachment, emitConversation, changeDashboard } = register();

    emitConversation(buildActiveConversation({}));
    jest.runOnlyPendingTimers();

    expect(addAttachment).toHaveBeenCalledTimes(1);
    expect(addAttachment).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'draft-attachment-id-1', origin: undefined })
    );

    emitConversation(buildActiveConversation({ id: 'conversation-2', attachments: [] }));
    jest.runOnlyPendingTimers();
    changeDashboard();

    expect(addAttachment).toHaveBeenCalledTimes(1);
  });

  it('regenerates the draft attachment id once the draft is in the conversation', () => {
    const { addAttachment, emitConversation } = register();

    emitConversation(buildActiveConversation({}));
    jest.runOnlyPendingTimers();

    expect(addAttachment).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'draft-attachment-id-1', type: DASHBOARD_ATTACHMENT_TYPE })
    );

    emitConversation(
      buildActiveConversation({
        id: 'conversation-1',
        attachments: [buildDashboardAttachment({ id: 'draft-attachment-id-1' })],
      })
    );
    emitConversation(buildActiveConversation({}));
    jest.runOnlyPendingTimers();

    expect(addAttachment).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'draft-attachment-id-2', type: DASHBOARD_ATTACHMENT_TYPE })
    );
  });
});
