/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect } from 'react';
import type { AttachmentInput } from '@kbn/agent-builder-common/attachments';
import {
  DASHBOARD_AGENT_ID,
  dashboardAttachments,
  type DashboardAttachmentData,
  type DashboardAttachmentPanel,
  type DashboardAttachmentSection,
} from '@kbn/dashboard-agent-common';
import { apiHasLibraryTransforms } from '@kbn/presentation-publishing';
import type { DashboardApi } from '../../dashboard_api/types';
import { agentBuilderService } from '../../services/kibana_services';
import { isDashboardSection, type DashboardState } from '../../../common';

/**
 * Converts a panel to the attachment format
 */
const toAttachmentPanel = (panel: {
  type: string;
  uid?: string;
  config: unknown;
}): DashboardAttachmentPanel => ({
  type: panel.type,
  uid: panel.uid,
  config: panel.config as Record<string, unknown>,
});

/**
 * Extracts panels and sections from the serialized dashboard state,
 * resolving by-reference panels to get their full content
 */
async function extractPanelsAndSections(
  panels: DashboardState['panels'],
  dashboardApi: DashboardApi
): Promise<{
  panels: DashboardAttachmentPanel[];
  sections: DashboardAttachmentSection[];
}> {
  if (!panels || panels.length === 0) {
    return { panels: [], sections: [] };
  }

  console.log('Extracting panels and sections from dashboard state:', panels);

  const topLevelPanels: DashboardAttachmentPanel[] = [];
  const sections: DashboardAttachmentSection[] = [];

  // Get all panel IDs from the dashboard
  const children = dashboardApi.children$.value;

  for (const item of panels) {
    if (isDashboardSection(item)) {
      // For sections, resolve each panel within the section
      const resolvedPanels = await Promise.all(
        (item.panels ?? []).map(async (panel) => {
          const panelId = panel.uid;
          if (panelId && children[panelId]) {
            try {
              const childApi = children[panelId];
              // For by-reference panels, use getSerializedStateByValue to get full content
              if (apiHasLibraryTransforms(childApi)) {
                const { rawState, references } = childApi.getSerializedStateByValue();
                console.log('Resolved by-reference panel in section:', panelId, rawState);
                return toAttachmentPanel({
                  type: panel.type,
                  uid: panelId,
                  config: rawState,
                });
              } else {
                // For by-value panels, use the regular serialized state
                const fullPanelData = dashboardApi.getDashboardPanelFromId(panelId);
                return toAttachmentPanel({
                  type: fullPanelData.type,
                  uid: panelId,
                  config: fullPanelData.serializedState.rawState,
                });
              }
            } catch (error) {
              console.error('Error resolving panel in section:', panelId, error);
              // Fallback to original panel data if resolution fails
              return toAttachmentPanel(panel);
            }
          }
          return toAttachmentPanel(panel);
        })
      );

      sections.push({
        title: item.title,
        panels: resolvedPanels,
      });
    } else {
      // For top-level panels, resolve to get full content
      const panelId = item.uid;

      if (panelId && children[panelId]) {
        console.log('Processing top-level panel:', panelId);
        try {
          const childApi = children[panelId];
          // For by-reference panels, use getSerializedStateByValue to get full content
          if (apiHasLibraryTransforms(childApi)) {
            const { rawState, references } = childApi.getSerializedStateByValue();
            console.log('Resolved by-reference panel:', panelId, rawState);
            topLevelPanels.push(
              toAttachmentPanel({
                type: item.type,
                uid: panelId,
                config: rawState,
              })
            );
          } else {
            // For by-value panels, use the regular serialized state
            const fullPanelData = dashboardApi.getDashboardPanelFromId(panelId);
            console.log('Resolved by-value panel:', panelId, fullPanelData.serializedState.rawState);
            topLevelPanels.push(
              toAttachmentPanel({
                type: fullPanelData.type,
                uid: panelId,
                config: fullPanelData.serializedState.rawState,
              })
            );
          }
        } catch (error) {
          console.error('Error resolving panel:', panelId, error);
          // Fallback to original panel data if resolution fails
          topLevelPanels.push(toAttachmentPanel(item));
        }
      } else {
        console.log('Panel not in children yet:', panelId, 'available:', Object.keys(children));
        topLevelPanels.push(toAttachmentPanel(item));
      }
    }
  }

  return { panels: topLevelPanels, sections };
}

/**
 * Hook that sets up the agent builder context when viewing a dashboard.
 * This attaches the current dashboard information to the agent builder flyout,
 * allowing users to "chat" with their dashboard.
 */
export function useAgentBuilderContext({
  dashboardApi,
  savedDashboardId,
}: {
  dashboardApi: DashboardApi | undefined;
  savedDashboardId: string | undefined;
}) {
  useEffect(
    function setDashboardAttachment() {
      if (!agentBuilderService || !dashboardApi) {
        return;
      }

      // Subscribe to children$ to wait for panels to load
      const subscription = dashboardApi.children$.subscribe(async (children) => {
        console.log('Children updated:', Object.keys(children).length);

        const { attributes } = dashboardApi.getSerializedState();

        const panelCount = dashboardApi.getPanelCount();
        const { panels, sections } = await extractPanelsAndSections(attributes.panels, dashboardApi);

        console.log('Extracted panels and sections:', { panels, sections });

        const dashboardTitle = attributes.title || 'Untitled Dashboard';
        const dashboardDescription = attributes.description || undefined;

        const attachmentData: DashboardAttachmentData = {
          dashboardId: savedDashboardId,
          title: dashboardTitle,
          description: dashboardDescription,
          panelCount,
          panels: panels.length > 0 ? panels : undefined,
          sections: sections.length > 0 ? sections : undefined,
          attachmentLabel: dashboardTitle,
        };

        console.log('Setting dashboard attachment data:', attachmentData);

        const dashboardAttachment: AttachmentInput = {
          id: savedDashboardId ? `dashboard-${savedDashboardId}` : undefined,
          type: dashboardAttachments.dashboard,
          data: attachmentData as unknown as Record<string, unknown>,
        };

        // Set the flyout configuration with the dashboard attachment
        agentBuilderService.setConversationFlyoutActiveConfig({
          sessionTag: 'dashboard',
          agentId: DASHBOARD_AGENT_ID,
          attachments: [dashboardAttachment],
        });
      });

      return () => {
        subscription.unsubscribe();
        agentBuilderService?.clearConversationFlyoutActiveConfig();
      };
    },
    [dashboardApi, savedDashboardId]
  );
}
