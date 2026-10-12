/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import { hashContent, type VersionedAttachment } from '@kbn/agent-builder-common/attachments';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  type DashboardAttachmentData,
} from '@kbn/agent-builder-dashboards-common';
import { retrieveLatestVersion } from './attachment_state';

const dashboardData: DashboardAttachmentData = { title: 'System Overview', panels: [] };

const attachmentRecord = (overrides: Partial<VersionedAttachment> = {}): VersionedAttachment => ({
  id: 'dashboard-1',
  type: DASHBOARD_ATTACHMENT_TYPE,
  versions: [
    {
      version: 1,
      data: dashboardData,
      created_at: '2025-01-01T00:00:00.000Z',
      content_hash: hashContent(dashboardData),
    },
  ],
  current_version: 1,
  active: true,
  readonly: false,
  ...overrides,
});

const attachmentsWith = (record?: VersionedAttachment): AttachmentStateManager =>
  ({
    getAttachmentRecord: (id: string) => (record?.id === id ? record : undefined),
  } as unknown as AttachmentStateManager);

describe('retrieveLatestVersion', () => {
  it('returns the current version for an attachment id and undefined without one', () => {
    const attachments = attachmentsWith(attachmentRecord());

    expect(retrieveLatestVersion(attachments, 'dashboard-1')).toEqual({
      version: 1,
      data: dashboardData,
      created_at: '2025-01-01T00:00:00.000Z',
      content_hash: hashContent(dashboardData),
    });
    expect(retrieveLatestVersion(attachments, undefined)).toBeUndefined();
  });

  it.each([
    [
      'the attachment does not exist',
      attachmentsWith(),
      'Dashboard attachment "dashboard-1" not found.',
    ],
    [
      'the attachment is not a dashboard',
      attachmentsWith(attachmentRecord({ type: 'visualization' })),
      'Attachment "dashboard-1" is not a platform.dashboard.dashboard_state attachment.',
    ],
    [
      'no version matches current_version',
      attachmentsWith(attachmentRecord({ current_version: 2 })),
      'Could not retrieve latest version of dashboard attachment "dashboard-1".',
    ],
  ])('throws when %s', (_, attachments, message) => {
    expect(() => retrieveLatestVersion(attachments, 'dashboard-1')).toThrow(message);
  });
});
