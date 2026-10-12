/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { hashContent } from '@kbn/agent-builder-common/attachments';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  type DashboardAttachmentData,
} from '@kbn/agent-builder-dashboards-common';
import { DASHBOARD_UPDATED_UI_EVENT } from '../../../common';
import { generateDashboardTool } from './generate_dashboard_tool';

jest.mock('./resolvers/panel_resolver', () => ({ createPanelResolver: jest.fn() }));

type GenerateDashboardHandler = ReturnType<typeof generateDashboardTool>['handler'];
type Operations = Parameters<GenerateDashboardHandler>[0]['operations'];

const setMetadata: Operations = [{ operation: 'set_metadata', title: 'Agent dashboard' }];

const existingDashboard: DashboardAttachmentData = {
  title: 'Existing dashboard',
  panels: [],
  time_range: { from: 'now-15m', to: 'now' },
};

const dashboardRecord = (data: DashboardAttachmentData) => ({
  id: 'dashboard-attachment-id',
  type: DASHBOARD_ATTACHMENT_TYPE,
  versions: [
    { version: 1, data, created_at: '2025-01-01T00:00:00.000Z', content_hash: hashContent(data) },
  ],
  current_version: 1,
  active: true,
  readonly: false,
});

const callHandler = async ({
  dashboardAttachmentId,
  operations = setMetadata,
  existing = existingDashboard,
  add = jest.fn(async ({ id }: { id: string }) => ({ id, current_version: 1 })),
  update = jest.fn(async (id: string) => ({ id, current_version: 2, origin: 'saved-id' })),
}: {
  dashboardAttachmentId?: string;
  operations?: Operations;
  existing?: DashboardAttachmentData;
  add?: jest.Mock;
  update?: jest.Mock;
} = {}) => {
  const tool = generateDashboardTool();
  const sendUiEvent = jest.fn();
  const records: Record<string, ReturnType<typeof dashboardRecord>> = {
    'dashboard-attachment-id': dashboardRecord(existing),
  };
  const ctx = {
    logger: loggingSystemMock.create().get(),
    attachments: { getAttachmentRecord: (id: string) => records[id], add, update },
    events: { sendUiEvent },
    esClient: elasticsearchServiceMock.createScopedClusterClient(),
  };
  const ret = await tool.handler(
    { dashboardAttachmentId, operations },
    ctx as unknown as Parameters<GenerateDashboardHandler>[1]
  );
  if (!('results' in ret)) throw new Error('Unexpected HITL return from tool handler');
  return { results: ret.results, sendUiEvent };
};

describe('generateDashboardTool handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a dashboard and returns its summary', async () => {
    const { results, sendUiEvent } = await callHandler();

    expect(sendUiEvent).toHaveBeenCalledWith(DASHBOARD_UPDATED_UI_EVENT, {
      attachment: {
        id: expect.any(String),
        type: DASHBOARD_ATTACHMENT_TYPE,
        data: { title: 'Agent dashboard', panels: [] },
        origin: undefined,
      },
    });
    const [[, { attachment }]] = sendUiEvent.mock.calls;
    expect(results).toEqual([
      {
        type: ToolResultType.dashboard,
        tool_result_id: expect.any(String),
        data: {
          attachment_id: attachment.id,
          version: 1,
          dashboard: { title: 'Agent dashboard', description: undefined, panels: [], controls: [] },
          failures: undefined,
        },
      },
    ]);
  });

  it('updates the referenced dashboard attachment in place', async () => {
    const { results, sendUiEvent } = await callHandler({
      dashboardAttachmentId: 'dashboard-attachment-id',
    });

    expect(results).toEqual([
      {
        type: ToolResultType.dashboard,
        tool_result_id: expect.any(String),
        data: {
          attachment_id: 'dashboard-attachment-id',
          version: 2,
          dashboard: { title: 'Agent dashboard', description: undefined, panels: [], controls: [] },
          failures: undefined,
        },
      },
    ]);
    expect(sendUiEvent).toHaveBeenCalledWith(DASHBOARD_UPDATED_UI_EVENT, {
      attachment: {
        id: 'dashboard-attachment-id',
        type: DASHBOARD_ATTACHMENT_TYPE,
        data: { ...existingDashboard, title: 'Agent dashboard' },
        origin: 'saved-id',
      },
    });
  });

  it.each([
    [
      'a new dashboard is missing its title',
      { operations: [{ operation: 'set_metadata', description: 'No title' }] as Operations },
      { message: 'New dashboards require a set_metadata operation with a non-empty title.' },
    ],
    [
      'persisting the dashboard fails',
      { add: jest.fn().mockRejectedValue(new Error('boom')) },
      {
        message: 'Failed to generate dashboard: boom',
        metadata: { dashboardAttachmentId: undefined },
      },
    ],
  ])('returns an error and sends no UI event when %s', async (_, options, data) => {
    const { results, sendUiEvent } = await callHandler(options);

    expect(results).toEqual([{ type: ToolResultType.error, data }]);
    expect(sendUiEvent).not.toHaveBeenCalled();
  });
});
