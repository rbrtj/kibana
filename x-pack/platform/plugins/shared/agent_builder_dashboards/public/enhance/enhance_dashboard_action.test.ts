/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subscription } from 'rxjs';
import { BehaviorSubject } from 'rxjs';
import type { AggregateQuery } from '@kbn/es-query';
import type { EmbeddableChatAccess } from '@kbn/agent-builder-browser';
import { DASHBOARD_ATTACHMENT_TYPE } from '@kbn/agent-builder-dashboards-common';
import type { DashboardApi, EnhanceDashboardActionContext } from '@kbn/dashboard-plugin/public';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type { IdGenerator } from '../attachment_types';
import { createEnhanceDashboardAction } from './enhance_dashboard_action';

const esqlLens = {
  type: LENS_EMBEDDABLE_TYPE,
  id: 'a',
  grid: { x: 0, y: 0, w: 24, h: 15 },
  config: {
    type: 'metric',
    data_source: { type: 'esql', query: 'FROM logs | STATS count = COUNT(*)' },
  },
};

const child = (esql: AggregateQuery[]) => ({
  esql$: new BehaviorSubject(esql),
  approximationApplied$: new BehaviorSubject<boolean | undefined>(undefined),
});

const layoutPanel = {
  type: LENS_EMBEDDABLE_TYPE,
  grid: { x: 0, y: 0, w: 24, h: 15 },
};

const createLayout = (panelIds: string[]) => ({
  panels: Object.fromEntries(panelIds.map((id) => [id, layoutPanel])),
  sections: {},
  pinnedPanels: {},
});

const createDashboardApi = ({
  viewMode = 'edit',
  children = { a: child([{ esql: 'FROM logs | LIMIT 10' }]) },
  panels = [esqlLens],
  layout = createLayout(Object.keys(children)),
}: {
  viewMode?: string;
  children?: Record<string, ReturnType<typeof child>>;
  panels?: unknown[];
  layout?: ReturnType<typeof createLayout>;
} = {}): DashboardApi =>
  ({
    viewMode$: new BehaviorSubject(viewMode),
    children$: new BehaviorSubject(children),
    layout$: new BehaviorSubject(layout),
    savedObjectId$: new BehaviorSubject('dash-1'),
    getSerializedState: () => ({
      attributes: {
        title: 'Test',
        panels,
      },
    }),
  } as unknown as DashboardApi);

const createDraftAttachmentId = (id = 'draft-attachment-id'): IdGenerator => ({
  current: id,
  next: () => id,
});

const defined = <T>(value: T | undefined, name: string): T => {
  if (value === undefined) {
    throw new Error(`${name} is not defined on the action`);
  }
  return value;
};

const createAction = ({
  openChat = jest.fn(),
  getAgentBuilderAccess = jest.fn(
    async (): Promise<EmbeddableChatAccess> => ({
      hasRequiredLicense: true,
      hasLlmConnector: true,
    })
  ),
  canWriteDashboards = true,
  draftAttachmentId = createDraftAttachmentId(),
} = {}) => {
  const action = createEnhanceDashboardAction({
    openChat,
    getAgentBuilderAccess,
    canWriteDashboards,
    draftAttachmentId,
  });
  const getCompatibilityChangesSubject = defined(
    action.getCompatibilityChangesSubject,
    'getCompatibilityChangesSubject'
  );
  const getDisabledStateChangesSubject = defined(
    action.getDisabledStateChangesSubject,
    'getDisabledStateChangesSubject'
  );
  return {
    openChat,
    action,
    isCompatible: defined(action.isCompatible, 'isCompatible'),
    isDisabled: defined(action.isDisabled, 'isDisabled'),
    getDisplayNameTooltip: defined(action.getDisplayNameTooltip, 'getDisplayNameTooltip'),
    getCompatibilityChangesSubject: (context: EnhanceDashboardActionContext) =>
      defined(getCompatibilityChangesSubject(context), 'the compatibility changes subject'),
    getDisabledStateChangesSubject: (context: EnhanceDashboardActionContext) =>
      defined(getDisabledStateChangesSubject(context), 'the disabled state changes subject'),
  };
};

const withAccess = (access: EmbeddableChatAccess) =>
  jest.fn(async (): Promise<EmbeddableChatAccess> => access);

const withoutEsql = () => createDashboardApi({ children: { c: child([]) } });

describe('createEnhanceDashboardAction', () => {
  let subscription: Subscription | undefined;

  afterEach(() => {
    subscription?.unsubscribe();
    subscription = undefined;
  });

  it.each([
    ['a child uses ES|QL', () => createDashboardApi()],
    ['no child uses ES|QL', withoutEsql],
  ])('is compatible in edit mode when %s', async (_, getDashboardApi) => {
    const { isCompatible } = createAction();

    await expect(isCompatible({ dashboardApi: getDashboardApi() })).resolves.toBe(true);
  });

  it.each<[string, Parameters<typeof createAction>[0], Parameters<typeof createDashboardApi>[0]]>([
    ['in view mode', {}, { viewMode: 'view' }],
    ['in print mode', {}, { viewMode: 'print' }],
    ['in preview mode', {}, { viewMode: 'preview' }],
    ['without write access', { canWriteDashboards: false }, {}],
    [
      'without a required license',
      { getAgentBuilderAccess: withAccess({ hasRequiredLicense: false, hasLlmConnector: true }) },
      {},
    ],
    [
      'without an LLM connector',
      { getAgentBuilderAccess: withAccess({ hasRequiredLicense: true, hasLlmConnector: false }) },
      {},
    ],
  ])('is incompatible %s', async (_, actionOptions, dashboardOptions) => {
    const { isCompatible } = createAction(actionOptions);

    await expect(
      isCompatible({ dashboardApi: createDashboardApi(dashboardOptions) })
    ).resolves.toBe(false);
  });

  it('is enabled with the enhance tooltip when a child uses ES|QL', () => {
    const { isDisabled, getDisplayNameTooltip } = createAction();
    const dashboardApi = createDashboardApi({
      children: { a: child([{ esql: 'FROM logs | LIMIT 10' }]), c: child([]) },
    });

    expect(isDisabled({ dashboardApi })).toBe(false);
    expect(getDisplayNameTooltip({ dashboardApi })).toBe(
      'Improve the content and style of your dashboard using AI'
    );
  });

  it.each([
    ['no child uses ES|QL', withoutEsql],
    ['there are no children', () => createDashboardApi({ children: {} })],
    [
      'an ES|QL child is not in layout$.panels',
      () =>
        createDashboardApi({
          children: { a: child([{ esql: 'FROM logs | LIMIT 10' }]) },
          layout: createLayout([]),
        }),
    ],
  ])('is disabled with an ES|QL tooltip when %s', (_, getDashboardApi) => {
    const { isDisabled, getDisplayNameTooltip } = createAction();
    const dashboardApi = getDashboardApi();

    expect(isDisabled({ dashboardApi })).toBe(true);
    expect(getDisplayNameTooltip({ dashboardApi })).toBe(
      'Enhance requires at least one ES|QL visualization'
    );
  });

  it('opens chat with the dashboard attachment', async () => {
    const draftAttachmentId = createDraftAttachmentId('shared-draft-id');
    const { action, openChat } = createAction({ draftAttachmentId });
    const dashboardApi = createDashboardApi();

    await action.execute({
      dashboardApi,
    });

    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat).toHaveBeenCalledWith({
      newConversation: true,
      initialMessage: '[/dashboards](skill://dashboards) Enhance this dashboard',
      autoSendInitialMessage: true,
      sessionTag: 'dashboard',
      attachments: [
        {
          id: 'shared-draft-id',
          origin: 'dash-1',
          type: DASHBOARD_ATTACHMENT_TYPE,
          data: expect.objectContaining({
            title: 'Test',
            panels: [
              expect.objectContaining({
                id: 'a',
                type: LENS_EMBEDDABLE_TYPE,
              }),
            ],
          }),
        },
      ],
    });
  });

  it.each<[string, Parameters<typeof createAction>[0], () => DashboardApi]>([
    ['no child uses ES|QL', {}, withoutEsql],
    ['the dashboard is in view mode', {}, () => createDashboardApi({ viewMode: 'view' })],
    [
      'the license is missing',
      { getAgentBuilderAccess: withAccess({ hasRequiredLicense: false, hasLlmConnector: true }) },
      () => createDashboardApi(),
    ],
  ])('does not open chat when %s', async (_, actionOptions, getDashboardApi) => {
    const { action, openChat } = createAction(actionOptions);

    await action.execute({ dashboardApi: getDashboardApi() });

    expect(openChat).not.toHaveBeenCalled();
  });

  it('getCompatibilityChangesSubject emits when the view mode changes', () => {
    const { getCompatibilityChangesSubject } = createAction();
    const dashboardApi = createDashboardApi();
    const next = jest.fn();
    subscription = getCompatibilityChangesSubject({ dashboardApi }).subscribe(next);

    (dashboardApi.viewMode$ as BehaviorSubject<string>).next('view');

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('getDisabledStateChangesSubject emits when layout$.panels length changes', () => {
    const { getDisabledStateChangesSubject } = createAction();
    const dashboardApi = createDashboardApi();
    const next = jest.fn();
    subscription = getDisabledStateChangesSubject({ dashboardApi }).subscribe(next);

    (dashboardApi.layout$ as BehaviorSubject<ReturnType<typeof createLayout>>).next(
      createLayout([])
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('getDisabledStateChangesSubject does not emit when a panel is only repositioned', () => {
    const { getDisabledStateChangesSubject } = createAction();
    const dashboardApi = createDashboardApi();
    const next = jest.fn();
    subscription = getDisabledStateChangesSubject({ dashboardApi }).subscribe(next);

    (dashboardApi.layout$ as BehaviorSubject<ReturnType<typeof createLayout>>).next({
      panels: {
        a: { type: LENS_EMBEDDABLE_TYPE, grid: { x: 8, y: 4, w: 24, h: 15 } },
      },
      sections: {},
      pinnedPanels: {},
    });

    expect(next).not.toHaveBeenCalled();
  });

  it('getDisabledStateChangesSubject emits when the children are replaced', () => {
    const { getDisabledStateChangesSubject } = createAction();
    const dashboardApi = createDashboardApi();
    const next = jest.fn();
    subscription = getDisabledStateChangesSubject({ dashboardApi }).subscribe(next);

    (dashboardApi.children$ as BehaviorSubject<Record<string, ReturnType<typeof child>>>).next({
      b: child([]),
    });

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('getDisabledStateChangesSubject emits when a child ES|QL query changes', () => {
    const { getDisabledStateChangesSubject } = createAction();
    const esqlChild = child([]);
    const dashboardApi = createDashboardApi({ children: { a: esqlChild } });
    const next = jest.fn();
    subscription = getDisabledStateChangesSubject({ dashboardApi }).subscribe(next);

    esqlChild.esql$.next([{ esql: 'FROM logs | LIMIT 10' }]);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
