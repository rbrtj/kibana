/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { sectionGridSchema } from '@kbn/dashboard-agent-common';

import { dashboardTools } from '../../../common';
import {
  type DashboardOperation,
  inlineSectionPanelSchema,
  panelInputSchema,
  panelInputToOperation,
  runDashboardOperations,
} from '../_shared';

const sectionInputSchema = z.object({
  title: z.string().describe('Section title.'),
  grid: sectionGridSchema,
  panels: z
    .array(inlineSectionPanelSchema)
    .min(1)
    .optional()
    .describe(
      'Optional inline Lens visualization panels to create inside this new section. Panel grids are section-relative.'
    ),
});

const createDashboardSchema = z.object({
  title: z.string().describe('Dashboard title.'),
  description: z.string().describe('Dashboard description.'),
  panels: z
    .array(panelInputSchema)
    .optional()
    .describe(
      'Optional initial top-level panels to add to the dashboard. Each panel is a markdown, attachment, or visualization panel with its own grid. Use sectionId on a panel only when targeting a section that is also being created in this same call (use the section title is not enough — use add_panels later for already-existing sections).'
    ),
  sections: z
    .array(sectionInputSchema)
    .optional()
    .describe(
      'Optional initial sections to create. Each section may include inline visualization panels created in the same call.'
    ),
});

type CreateDashboardInput = z.infer<typeof createDashboardSchema>;

const buildOperations = ({
  title,
  description,
  panels,
  sections,
}: CreateDashboardInput): DashboardOperation[] => {
  const operations: DashboardOperation[] = [{ operation: 'set_metadata', title, description }];

  if (panels && panels.length > 0) {
    for (const panel of panels) {
      operations.push(panelInputToOperation(panel));
    }
  }

  if (sections && sections.length > 0) {
    for (const section of sections) {
      operations.push({
        operation: 'add_section',
        title: section.title,
        grid: section.grid,
        panels: section.panels,
      });
    }
  }

  return operations;
};

export const createDashboardTool = (): BuiltinSkillBoundedTool<typeof createDashboardSchema> => {
  return {
    id: dashboardTools.createDashboard,
    type: ToolType.builtin,
    description: `Create a new in-memory dashboard.

Use this when no dashboardAttachmentId exists yet. Provide title and description, and optionally include initial top-level panels and sections in a single call so the dashboard can be created atomically.

Returns the new dashboardAttachmentId. To add or modify content later, use add_panels, edit_panels, arrange_panels, remove_panels, manage_sections, or update_dashboard_metadata with that id.`,
    schema: createDashboardSchema,
    handler: async (input, context) =>
      runDashboardOperations({
        toolName: dashboardTools.createDashboard,
        context,
        operations: buildOperations(input),
        errorMetadata: { input },
      }),
  };
};
