/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject, EMPTY, Subject } from 'rxjs';
import type { ChromeStart } from '@kbn/core/public';
import type {
  DashboardApi,
  DashboardSaveEvent,
  DashboardStart,
} from '@kbn/dashboard-plugin/public';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import { ActionButtonType } from '@kbn/agent-builder-browser/attachments';
import type { ActionButton, AttachmentUIDefinition } from '@kbn/agent-builder-browser/attachments';
import type { DashboardAttachment } from '@kbn/agent-builder-dashboards-common/types';
import {
  attachmentDataToDashboardState,
  DASHBOARD_ATTACHMENT_TYPE,
} from '@kbn/agent-builder-dashboards-common';
import {
  buildActiveConversation,
  buildDashboardAttachment,
  buildDashboardUpdatedEvent,
  createAgentBuilderMock,
} from './test_helpers';
import { createIdGenerator, registerDashboardAttachmentUiDefinition } from '.';

jest.mock('@kbn/dashboard-plugin/public', () => ({
  DashboardRenderer: jest.fn(() => null),
}));

const flushAsyncServices = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const createMockDashboardApi = (savedObjectId?: string) => ({
  anyStateChange$: EMPTY,
  savedObjectId$: new BehaviorSubject<string | undefined>(savedObjectId),
  onSave$: new Subject<DashboardSaveEvent>(),
  setState: jest.fn(),
  getSerializedState: jest
    .fn()
    .mockReturnValue({ attributes: { title: 'Current dashboard', panels: [] } }),
});

type MockDashboardApi = ReturnType<typeof createMockDashboardApi>;

const createHarness = ({
  dashboardAppClientApi$ = new Subject<DashboardApi | undefined>(),
}: { dashboardAppClientApi$?: Subject<DashboardApi | undefined> } = {}) => {
  const agentBuilderMock = createAgentBuilderMock();
  const currentAppId$ = new BehaviorSubject<string | null>('agentBuilder');
  const draftAttachmentId = createIdGenerator();

  const unregister = registerDashboardAttachmentUiDefinition({
    agentBuilder: agentBuilderMock.agentBuilder,
    chrome: {
      sidebar: { getCurrentAppId$: () => currentAppId$.asObservable() },
    } as unknown as ChromeStart,
    canWriteDashboards: true,
    data: dataPluginMock.createStartContract(),
    dashboardPlugin: {
      dashboardAppClientApi$,
      findDashboardsService: jest.fn().mockResolvedValue({
        findById: jest.fn().mockResolvedValue({ status: 'success' }),
      }),
    } as unknown as DashboardStart,
    unifiedSearch: { ui: { SearchBar: jest.fn() } } as unknown as UnifiedSearchPublicPluginStart,
    dashboardLocator: undefined,
    draftAttachmentId,
  });
  const uiDefinition: AttachmentUIDefinition<DashboardAttachment> =
    agentBuilderMock.addAttachmentType.mock.calls[0][1];

  const getActionButtons = (
    attachment: DashboardAttachment,
    { isCanvas = false, openCanvas = jest.fn(), updateOrigin = jest.fn() } = {}
  ): ActionButton[] => {
    if (!uiDefinition.getActionButtons) {
      throw new Error('getActionButtons is not registered');
    }
    return uiDefinition.getActionButtons({
      attachment,
      isSidebar: false,
      isCanvas,
      openCanvas,
      updateOrigin,
    });
  };

  const showDashboard = (api: MockDashboardApi | undefined) =>
    dashboardAppClientApi$.next(api as unknown as DashboardApi | undefined);

  const mountAttachment = async (attachment: DashboardAttachment, api: MockDashboardApi) => {
    const updateOrigin = jest.fn().mockResolvedValue(undefined);
    getActionButtons(attachment, { updateOrigin });
    showDashboard(api);
    agentBuilderMock.emitConversation(
      buildActiveConversation({ id: 'conversation-1', attachments: [attachment] })
    );
    await flushAsyncServices();
    return { updateOrigin };
  };

  return {
    ...agentBuilderMock,
    currentAppId$,
    draftAttachmentId,
    uiDefinition,
    unregister,
    getActionButtons,
    showDashboard,
    mountAttachment,
  };
};

describe('registerDashboardAttachmentUiDefinition', () => {
  let harness: ReturnType<typeof createHarness>;

  const setup = (options?: Parameters<typeof createHarness>[0]) => {
    harness?.unregister();
    harness = createHarness(options);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setup();
  });

  afterEach(() => {
    harness.unregister();
  });

  it('captures a dashboard API that is already available on registration for Preview', async () => {
    const api = createMockDashboardApi('dashboard-1');
    setup({
      dashboardAppClientApi$: new BehaviorSubject<DashboardApi | undefined>(
        api as unknown as DashboardApi
      ),
    });
    const [preview] = harness.getActionButtons(buildDashboardAttachment({ origin: 'dashboard-1' }));

    await preview.handler();

    expect(api.setState).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Agent dashboard', panels: [] })
    );
  });

  it('uses the framework updateOrigin captured from getActionButtons on save', async () => {
    const api = createMockDashboardApi();
    const { updateOrigin } = await harness.mountAttachment(buildDashboardAttachment(), api);

    api.onSave$.next({
      previousDashboardId: undefined,
      dashboardId: 'new-dashboard-id',
      dashboardState: attachmentDataToDashboardState({ title: 'Saved', panels: [] }),
    });
    await flushAsyncServices();

    expect(updateOrigin).toHaveBeenCalledWith('new-dashboard-id');
  });

  it('stops applying live updates once the dashboard API goes away', async () => {
    const api = createMockDashboardApi();
    const attachment = buildDashboardAttachment();
    await harness.mountAttachment(attachment, api);

    harness.emitChatEvent('conversation-1', buildDashboardUpdatedEvent(attachment));
    harness.showDashboard(undefined);
    harness.emitChatEvent('conversation-1', buildDashboardUpdatedEvent(attachment));

    expect(api.setState).toHaveBeenCalledTimes(1);
  });

  describe('dashboard app integration activation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const draftFromCurrentDashboard = () => ({
      id: harness.draftAttachmentId.current,
      type: DASHBOARD_ATTACHMENT_TYPE,
      origin: undefined,
      data: expect.objectContaining({ title: 'Current dashboard' }),
    });

    it.each([
      ['a dashboard is opened with a new conversation already open', 'api-last', undefined],
      ['a dashboard is opened with an existing conversation already open', 'api-last', 'c-1'],
      ['a new conversation is opened from a dashboard', 'api-first', undefined],
      ['an existing conversation is opened from a dashboard', 'api-first', 'c-1'],
    ])(
      'attaches the dashboard only to a new conversation when %s',
      async (_, order, conversationId) => {
        const emitConversation = () =>
          harness.emitConversation(
            buildActiveConversation({ id: conversationId, attachments: [] })
          );
        if (order === 'api-first') {
          harness.showDashboard(createMockDashboardApi());
          emitConversation();
        } else {
          emitConversation();
          harness.showDashboard(createMockDashboardApi());
        }
        await flushAsyncServices();
        jest.runOnlyPendingTimers();

        expect(harness.addAttachment.mock.calls).toEqual(
          conversationId ? [] : [[draftFromCurrentDashboard()]]
        );
      }
    );

    it('waits for the chat to open before activating dashboard integration', async () => {
      harness.currentAppId$.next(null);
      harness.showDashboard(createMockDashboardApi());
      harness.emitConversation(buildActiveConversation({}));
      await flushAsyncServices();
      jest.runOnlyPendingTimers();

      expect(harness.addAttachment).not.toHaveBeenCalled();

      harness.currentAppId$.next('agentBuilder');
      await flushAsyncServices();
      jest.runOnlyPendingTimers();

      expect(harness.addAttachment.mock.calls).toEqual([[draftFromCurrentDashboard()]]);
    });
  });

  it.each([
    ['the dashboard title', 'My Dashboard', 'My Dashboard'],
    ['a default for an untitled dashboard', '', 'New Dashboard'],
  ])('labels the attachment with %s', (_, title, label) => {
    expect(
      harness.uiDefinition.getLabel(buildDashboardAttachment({ data: { title, panels: [] } }))
    ).toBe(label);
  });

  it('offers Preview outside the canvas only', () => {
    const attachment = buildDashboardAttachment();

    expect(harness.getActionButtons(attachment, { isCanvas: true })).toEqual([]);
    expect(harness.getActionButtons(attachment)).toEqual([
      {
        label: 'Preview',
        icon: 'eye',
        type: ActionButtonType.SECONDARY,
        handler: expect.any(Function),
      },
    ]);
  });

  it('opens the canvas from Preview when no dashboard app is open', async () => {
    const openCanvas = jest.fn();
    const [preview] = harness.getActionButtons(buildDashboardAttachment(), { openCanvas });

    await preview.handler();

    expect(openCanvas).toHaveBeenCalledTimes(1);
  });
});
