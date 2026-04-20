/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '@kbn/logging';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import {
  getToolResultId,
  type ModelProvider,
  type ToolEventEmitter,
} from '@kbn/agent-builder-server';
import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  isSection,
  type DashboardAttachmentData,
} from '@kbn/dashboard-agent-common';

import { createVisualizationResolver } from './inline_visualization';
import { executeDashboardOperations, type DashboardOperation } from './operation_engine';
import {
  getErrorMessage,
  resolvePanelsFromAttachments,
  retrieveLatestVersion,
  type VisualizationFailure,
} from './utils';

/**
 * Subset of the tool handler context required to run dashboard operations.
 * Letting tools pass only what they need keeps wrappers small and testable.
 */
export interface RunDashboardOperationsContext {
  logger: Logger;
  attachments: AttachmentStateManager;
  events: ToolEventEmitter;
  esClient: IScopedClusterClient;
  modelProvider: ModelProvider;
}

export interface RunDashboardOperationsParams {
  /** Tool ID, used for log lines and error messages. */
  toolName: string;
  /** Tool handler context. */
  context: RunDashboardOperationsContext;
  /** Existing dashboard attachment ID. When omitted, a new dashboard is created. */
  previousAttachmentId?: string;
  /** Internal engine operations to apply (already translated from LLM-facing input). */
  operations: DashboardOperation[];
  /** Extra payload to include in the error result for debugging. */
  errorMetadata?: Record<string, unknown>;
}

const createEmptyDashboardData = (): DashboardAttachmentData => ({
  title: '',
  description: '',
  panels: [],
});

const buildDashboardAttachmentContent = (data: DashboardAttachmentData) => ({
  title: data.title,
  description: data.description,
  panels: data.panels.map((widget) => {
    if (isSection(widget)) {
      return {
        id: widget.id,
        title: widget.title,
        collapsed: widget.collapsed,
        grid: widget.grid,
        panels: widget.panels.map((panel) => ({
          type: panel.type,
          id: panel.id,
          grid: panel.grid,
        })),
      };
    }
    return {
      type: widget.type,
      id: widget.id,
      grid: widget.grid,
    };
  }),
});

const countPanels = (data: DashboardAttachmentData): number =>
  data.panels.reduce(
    (count, widget) => (isSection(widget) ? count + widget.panels.length : count + 1),
    0
  );

const noTitleOrDescriptionErrorResult: ToolHandlerStandardReturn = {
  results: [
    {
      type: ToolResultType.error,
      data: {
        message: 'Title and description are required when creating a new dashboard.',
      },
    },
  ],
};

/**
 * Shared engine wrapper for every dashboard tool.
 *
 * Loads the dashboard attachment (or stages a new one), runs the engine,
 * persists the result, and shapes the standard `dashboard` tool result.
 *
 * Intentionally branchless on tool identity: each wrapper translates its
 * own LLM-facing input into `DashboardOperation[]` and then delegates here.
 */
export const runDashboardOperations = async ({
  toolName,
  context: { logger, attachments, events, esClient, modelProvider },
  previousAttachmentId,
  operations,
  errorMetadata,
}: RunDashboardOperationsParams): Promise<ToolHandlerStandardReturn> => {
  try {
    const latestVersion = retrieveLatestVersion(attachments, previousAttachmentId);
    const isNewDashboard = !latestVersion;

    const dashboardAttachmentId = previousAttachmentId ?? uuidv4();
    const currentDashboardData = latestVersion?.data ?? createEmptyDashboardData();
    const resolveVisualizationConfig = createVisualizationResolver({
      logger,
      modelProvider,
      events,
      esClient,
    });

    const operationResult = await executeDashboardOperations({
      dashboardData: currentDashboardData,
      operations,
      logger,
      resolvePanelsFromAttachments: (attachmentInputs) =>
        resolvePanelsFromAttachments({
          attachmentInputs,
          attachments,
          logger,
        }),
      resolveVisualizationConfig,
    });

    const failures: VisualizationFailure[] = operationResult.failures;
    const updatedDashboardData = operationResult.dashboardData;

    if (isNewDashboard && (!updatedDashboardData.title || !updatedDashboardData.description)) {
      logger.error('Title and description are required when creating a new dashboard.');
      return noTitleOrDescriptionErrorResult;
    }

    const attachmentInput = {
      id: dashboardAttachmentId,
      type: DASHBOARD_ATTACHMENT_TYPE,
      description: `Dashboard: ${updatedDashboardData.title}`,
      data: updatedDashboardData,
    };

    const attachment = isNewDashboard
      ? await attachments.add(attachmentInput)
      : await attachments.update(dashboardAttachmentId, {
          data: updatedDashboardData,
          description: attachmentInput.description,
        });

    if (!attachment) {
      throw new Error(`Failed to persist dashboard attachment "${dashboardAttachmentId}".`);
    }

    logger.info(
      `Dashboard ${isNewDashboard ? 'created' : 'updated'} with ${countPanels(
        updatedDashboardData
      )} panels (tool=${toolName})`
    );

    return {
      results: [
        {
          type: ToolResultType.dashboard,
          tool_result_id: getToolResultId(),
          data: {
            version: attachment.current_version ?? 1,
            failures: failures.length > 0 ? failures : undefined,
            dashboardAttachment: {
              id: attachment.id,
              content: buildDashboardAttachmentContent(updatedDashboardData),
            },
          },
        },
      ],
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error(`Error in ${toolName} tool: ${errorMessage}`);
    return {
      results: [
        {
          type: ToolResultType.error,
          data: {
            message: `Failed to manage dashboard: ${errorMessage}`,
            metadata: errorMetadata,
          },
        },
      ],
    };
  }
};
