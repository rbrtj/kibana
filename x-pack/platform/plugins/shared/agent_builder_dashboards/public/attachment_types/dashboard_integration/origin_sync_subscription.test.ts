/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subscription } from 'rxjs';
import { Subject } from 'rxjs';
import type { DashboardApi, DashboardSaveEvent } from '@kbn/dashboard-plugin/public';
import { attachmentDataToDashboardState } from '@kbn/agent-builder-dashboards-common';
import type { DashboardAttachment } from '@kbn/agent-builder-dashboards-common/types';
import { buildDashboardAttachment } from '../test_helpers';
import { createOriginSyncSubscription } from './origin_sync_subscription';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const save = (
  previousDashboardId: string | undefined,
  dashboardId: string | undefined
): DashboardSaveEvent => ({
  previousDashboardId,
  dashboardId,
  dashboardState: attachmentDataToDashboardState({ title: 'Saved', panels: [] }),
});

const attachment = (id: string, origin?: string): DashboardAttachment =>
  buildDashboardAttachment({ id, origin });

describe('createOriginSyncSubscription', () => {
  let subscription: Subscription | undefined;

  afterEach(() => {
    subscription?.unsubscribe();
    subscription = undefined;
  });

  const subscribe = ({
    attachments,
    existingDashboardIds = [],
  }: {
    attachments: DashboardAttachment[] | undefined;
    existingDashboardIds?: string[];
  }) => {
    const onSave$ = new Subject<DashboardSaveEvent>();
    const updateOrigin = jest.fn().mockResolvedValue(undefined);
    subscription = createOriginSyncSubscription({
      api: { onSave$ } as unknown as DashboardApi,
      getAttachments: () => attachments,
      checkSavedDashboardExist: async (dashboardId) => existingDashboardIds.includes(dashboardId),
      updateOrigin,
    });
    return { onSave$, updateOrigin };
  };

  it.each<[string, DashboardAttachment[] | undefined, string[], DashboardSaveEvent, string[][]]>([
    [
      'relinks the attachment on save-as from its dashboard',
      [attachment('a1', 'd1')],
      ['d1'],
      save('d1', 'd2'),
      [['a1', 'd2']],
    ],
    [
      'relinks the attachment on a re-save of its dashboard',
      [attachment('a1', 'd1')],
      ['d1'],
      save('d1', 'd1'),
      [['a1', 'd1']],
    ],
    [
      'links an unlinked attachment on the first save of an unsaved dashboard',
      [attachment('a1')],
      [],
      save(undefined, 'new-dashboard'),
      [['a1', 'new-dashboard']],
    ],
    [
      'prefers the linked attachment over an earlier one whose dashboard was deleted',
      [attachment('a-gone', 'gone'), attachment('a-linked', 'd1')],
      ['d1'],
      save('d1', 'd2'),
      [['a-linked', 'd2']],
    ],
    [
      'relinks the first attachment whose dashboard was deleted, skipping unlinked and live ones',
      [
        attachment('a-unlinked'),
        attachment('a-live', 'live'),
        attachment('a-gone-1', 'gone-1'),
        attachment('a-gone-2', 'gone-2'),
      ],
      ['live'],
      save('other', 'current'),
      [['a-gone-1', 'current']],
    ],
    [
      'leaves origins alone when an unrelated dashboard is saved and every origin exists',
      [attachment('a1', 'd1'), attachment('a2', 'd2')],
      ['d1', 'd2'],
      save('other', 'current'),
      [],
    ],
    [
      'ignores a save that produced no dashboard id',
      [attachment('a1', 'd1')],
      ['d1'],
      save('d1', undefined),
      [],
    ],
    [
      'ignores a save before the conversation attachments are known',
      undefined,
      [],
      save(undefined, 'new-dashboard'),
      [],
    ],
  ])('%s', async (_, attachments, existingDashboardIds, saveEvent, expectedUpdates) => {
    const { onSave$, updateOrigin } = subscribe({ attachments, existingDashboardIds });

    onSave$.next(saveEvent);
    await flushPromises();

    expect(updateOrigin.mock.calls).toEqual(expectedUpdates);
  });
});
