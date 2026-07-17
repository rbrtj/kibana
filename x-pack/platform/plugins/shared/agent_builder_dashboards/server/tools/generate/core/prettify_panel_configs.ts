/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import type {
  AttachmentPanel,
  DashboardAttachmentData,
} from '@kbn/agent-builder-dashboards-common';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { indexPanelsById, updatePanelInDashboard } from './dashboard_state';
import { DASHBOARD_OPERATION_FAILURE_TYPES } from './failure_types';
import type { ResolvePanelContent } from './operations/panels';
import { getEsqlQueries } from './panel_config';
import type { PanelContentAttempt } from './resolve_panel';
import type { PanelFailure } from './utils';

const prettifyNlQuery =
  'Polish this existing visualization while preserving its analysis intent, chart type, and ES|QL query.';
const prettifyConfigInstructions =
  'Apply chart configuration best practices. Preserve the existing analysis intent and chart type. Keep the provided ES|QL query unchanged.';
const supportedChartTypes = new Set<string>(Object.values(SupportedChartType));

const getChartType = (panel: AttachmentPanel): SupportedChartType | undefined => {
  const { type } = panel.config;
  return typeof type === 'string' && supportedChartTypes.has(type)
    ? (type as SupportedChartType)
    : undefined;
};

const getPanelTitle = (panel: AttachmentPanel): string | undefined => {
  const { title } = panel.config;
  return typeof title === 'string' ? title : undefined;
};

export interface ConfigGeneratorChange {
  panelId: string;
  title?: string;
  changeSummary: string;
}

interface PrettifyRequest {
  panelId: string;
  panel: AttachmentPanel;
  chartType: SupportedChartType;
  esql: string;
}

interface PrettifyAttempt {
  panelId: string;
  attempt: PanelContentAttempt;
}

const toPrettifyRequest = (
  panelId: string,
  panel: AttachmentPanel
): PrettifyRequest | undefined => {
  if (panel.type !== LENS_EMBEDDABLE_TYPE) {
    return undefined;
  }

  const chartType = getChartType(panel);
  if (!chartType) {
    return undefined;
  }

  const queries = getEsqlQueries(panel.config);
  if (queries.length !== 1) {
    return undefined;
  }

  return { panelId, panel, chartType, esql: queries[0] };
};

export const prettifyPanelConfigs = async ({
  dashboardData,
  existingPanels,
  resolvePanelContent,
  skipPanelIds = new Set(),
}: {
  dashboardData: DashboardAttachmentData;
  existingPanels: readonly AttachmentPanel[];
  resolvePanelContent: ResolvePanelContent;
  /** Panels already content-resolved earlier in this generate call (e.g. via edit_panels). */
  skipPanelIds?: ReadonlySet<string>;
}): Promise<{
  dashboardData: DashboardAttachmentData;
  failures: PanelFailure[];
  configGeneratorChanges: ConfigGeneratorChange[];
}> => {
  const currentPanelIndex = indexPanelsById(dashboardData.panels);
  const failures: PanelFailure[] = [];
  const configGeneratorChanges: ConfigGeneratorChange[] = [];
  const requests: PrettifyRequest[] = [];

  for (const existingPanel of existingPanels) {
    if (skipPanelIds.has(existingPanel.id)) {
      continue;
    }

    const currentPanel = currentPanelIndex.get(existingPanel.id);
    if (!currentPanel) {
      continue;
    }

    // Non-ES|QL / unsupported / multi-query panels are expected skips, not failures.
    const request = toPrettifyRequest(existingPanel.id, currentPanel);
    if (!request) {
      continue;
    }

    requests.push(request);
  }

  const attempts: PrettifyAttempt[] = await Promise.all(
    requests.map(async ({ panelId, panel, chartType, esql }) => ({
      panelId,
      attempt: await resolvePanelContent({
        type: 'vis',
        operationType: DASHBOARD_OPERATION_FAILURE_TYPES.prettifyPanelConfigs,
        identifier: panelId,
        nlQuery: prettifyNlQuery,
        chartType,
        esql,
        additionalChartConfigInstructions: prettifyConfigInstructions,
        existingPanel: panel,
      }),
    }))
  );

  let nextDashboardData = dashboardData;
  for (const { panelId, attempt } of attempts) {
    if (attempt.type === 'failure') {
      failures.push(attempt.failure);
      continue;
    }

    const updateResult = updatePanelInDashboard({
      dashboardData: nextDashboardData,
      panelId,
      transformPanel: (panel) => ({ ...panel, ...attempt.panelContent }),
    });
    nextDashboardData = updateResult.dashboardData;

    if (attempt.changeSummary) {
      const updatedPanel = indexPanelsById(nextDashboardData.panels).get(panelId);
      configGeneratorChanges.push({
        panelId,
        title: updatedPanel ? getPanelTitle(updatedPanel) : undefined,
        changeSummary: attempt.changeSummary,
      });
    }
  }

  return { dashboardData: nextDashboardData, failures, configGeneratorChanges };
};
