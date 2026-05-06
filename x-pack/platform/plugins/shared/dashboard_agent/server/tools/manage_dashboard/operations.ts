/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import type { AttachmentPanel, DashboardAttachmentData } from '@kbn/dashboard-agent-common';
import { panelGridSchema, sectionGridSchema } from '@kbn/dashboard-agent-common';
import type { Logger } from '@kbn/core/server';
import type { ResolveVisualizationConfig } from './inline_visualization';
import type { VisualizationFailure } from './utils';
import { addMarkdownHandler } from './operations/add_markdown';
import { addPanelsFromAttachmentsHandler } from './operations/add_panels_from_attachments';
import { addSectionHandler } from './operations/add_section';
import { createVisualizationPanelsHandler } from './operations/create_visualization_panels';
import { editVisualizationPanelsHandler } from './operations/edit_visualization_panels';
import { removePanelsHandler } from './operations/remove_panels';
import { removeSectionHandler } from './operations/remove_section';
import { setMetadataHandler } from './operations/set_metadata';
import { updatePanelLayoutsHandler } from './operations/update_panel_layouts';
import { createDashboardOperationRegistry, defineDashboardOperation } from './operations/registry';
import type { OperationExecutionContext } from './operations/types';
import { resolveVisualizationCreationRequests } from './operations/visualization_creation';

export const setMetadataOperationSchema = z.object({
  operation: z.literal('set_metadata'),
  title: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Non-empty dashboard title. If the current title is empty, missing, or a placeholder, invent one from the dashboard's contents."
    ),
  description: z.string().optional(),
});

export const addMarkdownOperationSchema = z.object({
  operation: z.literal('add_markdown'),
  markdownContent: z.string().describe('Markdown content for the panel.'),
  grid: panelGridSchema.describe(
    'Panel layout in grid units. w: width (1–48), h: height, x: column (0–47), y: row.'
  ),
  sectionId: z
    .string()
    .optional()
    .describe(
      'ID of an existing section to add this panel into. The section must already exist (use add_section first). If omitted, panel is added at the top level.'
    ),
});

const attachmentWithGridSchema = z.object({
  attachmentId: z.string().describe('Visualization attachment ID to add as a dashboard panel.'),
  grid: panelGridSchema.describe(
    'Panel layout in grid units. w: width (1–48), h: height, x: column (0–47), y: row. The dashboard is 48 columns wide. Always set x and y to place panels without gaps.'
  ),
});

export const addPanelsFromAttachmentsOperationSchema = z.object({
  operation: z.literal('add_panels_from_attachments'),
  items: z
    .array(
      attachmentWithGridSchema.extend({
        sectionId: z
          .string()
          .optional()
          .describe(
            'ID of an existing section to add this panel into. The section must already exist (use add_section first). If omitted, panel is added at the top level.'
          ),
      })
    )
    .min(1)
    .describe('Visualization attachments to add, each with its dashboard grid layout.'),
});

const visualizationPanelInputSchema = z.object({
  query: z.string().describe('A natural language query describing the desired visualization.'),
  index: z
    .string()
    .optional()
    .describe(
      '(optional) Index, alias, or datastream to target. If not provided, the tool will attempt to discover the best index to use.'
    ),
  chartType: z
    .nativeEnum(SupportedChartType)
    .optional()
    .describe(
      '(optional) The type of chart to create as indicated by the user. If not provided, the LLM will suggest the best chart type.'
    ),
  esql: z
    .string()
    .optional()
    .describe(
      '(optional) An ES|QL query. If not provided, the tool will generate the query. Only pass ES|QL queries from reliable sources (other tool calls or the user) and NEVER invent queries directly.'
    ),
  grid: panelGridSchema.describe(
    'Panel layout in grid units. w: width (1–48), h: height, x: column (0–47), y: row. The dashboard is 48 columns wide. Always set x and y to place panels without gaps.'
  ),
});

export const addSectionOperationSchema = z.object({
  operation: z.literal('add_section'),
  title: z.string().describe('Section title.'),
  grid: sectionGridSchema,
  panels: z
    .array(visualizationPanelInputSchema)
    .min(1)
    .optional()
    .describe(
      'Optional inline Lens visualization panels to create inside the new section. Panel grids are section-relative.'
    ),
});

export const removeSectionOperationSchema = z.object({
  operation: z.literal('remove_section'),
  id: z.string().describe('Section id to remove.'),
  panelAction: z
    .enum(['promote', 'delete'])
    .describe('How to handle section panels: promote to top-level or delete them.'),
});

export const removePanelsOperationSchema = z.object({
  operation: z.literal('remove_panels'),
  panelIds: z.array(z.string()).min(1).describe('Panel ids to remove from the dashboard.'),
});

const createVisualizationPanelSchema = visualizationPanelInputSchema.extend({
  sectionId: z
    .string()
    .optional()
    .describe(
      'ID of an existing section to add this panel into. The section must already exist (use add_section first). If omitted, panel is added at the top level.'
    ),
});

export const createVisualizationPanelsOperationSchema = z.object({
  operation: z.literal('create_visualization_panels'),
  panels: z.array(createVisualizationPanelSchema).min(1),
});

const editVisualizationPanelSchema = z.object({
  panelId: z.string().describe('Existing panel id to update.'),
  query: z
    .string()
    .describe('A natural language query describing how to update the visualization.'),
  chartType: z
    .nativeEnum(SupportedChartType)
    .optional()
    .describe(
      '(optional) The type of chart to create as indicated by the user. If not provided, the LLM will suggest the best chart type.'
    ),
  esql: z
    .string()
    .optional()
    .describe(
      '(optional) An ES|QL query. If not provided, the tool will generate the query. Only pass ES|QL queries from reliable sources (other tool calls or the user) and NEVER invent queries directly.'
    ),
});

export const editVisualizationPanelsOperationSchema = z
  .object({
    operation: z.literal('edit_visualization_panels'),
    panels: z.array(editVisualizationPanelSchema).min(1),
  })
  .describe(
    'Update existing ES|QL-backed Lens visualization panels by panelId. DSL, form-based, and other non-ES|QL panels are not supported for direct editing and should be recreated as new ES|QL-based Lens panels instead.'
  );

export const updatePanelLayoutsOperationSchema = z.object({
  operation: z.literal('update_panel_layouts'),
  panels: z
    .array(
      z.object({
        panelId: z.string().describe('ID of the panel to update.'),
        grid: panelGridSchema
          .optional()
          .describe('New grid position/size. Omit to keep the current grid.'),
        sectionId: z
          .string()
          .nullable()
          .optional()
          .describe(
            'Move panel to an existing section by its id. The section must already exist (use add_section first). null promotes to top level. Omit to keep the current location.'
          ),
      })
    )
    .min(1),
});

export type VisualizationPanelInput = z.infer<typeof visualizationPanelInputSchema>;
export type CreateVisualizationPanelInput = z.infer<typeof createVisualizationPanelSchema>;
export type DashboardOperation =
  | z.infer<typeof setMetadataOperationSchema>
  | z.infer<typeof addMarkdownOperationSchema>
  | z.infer<typeof addPanelsFromAttachmentsOperationSchema>
  | z.infer<typeof createVisualizationPanelsOperationSchema>
  | z.infer<typeof editVisualizationPanelsOperationSchema>
  | z.infer<typeof updatePanelLayoutsOperationSchema>
  | z.infer<typeof addSectionOperationSchema>
  | z.infer<typeof removeSectionOperationSchema>
  | z.infer<typeof removePanelsOperationSchema>;

const dashboardOperationDefinitions = [
  defineDashboardOperation({
    operation: 'set_metadata',
    schema: setMetadataOperationSchema,
    handler: setMetadataHandler,
  }),
  defineDashboardOperation({
    operation: 'add_markdown',
    schema: addMarkdownOperationSchema,
    handler: addMarkdownHandler,
  }),
  defineDashboardOperation({
    operation: 'add_panels_from_attachments',
    schema: addPanelsFromAttachmentsOperationSchema,
    handler: addPanelsFromAttachmentsHandler,
  }),
  defineDashboardOperation({
    operation: 'create_visualization_panels',
    schema: createVisualizationPanelsOperationSchema,
    handler: createVisualizationPanelsHandler,
    collectVisualizationCreationRequests: (operation) =>
      operation.panels.map((panelInput) => ({
        operationType: operation.operation,
        panelInput,
        sectionId: panelInput.sectionId,
      })),
  }),
  defineDashboardOperation({
    operation: 'edit_visualization_panels',
    schema: editVisualizationPanelsOperationSchema,
    handler: editVisualizationPanelsHandler,
  }),
  defineDashboardOperation({
    operation: 'update_panel_layouts',
    schema: updatePanelLayoutsOperationSchema,
    handler: updatePanelLayoutsHandler,
  }),
  defineDashboardOperation({
    operation: 'add_section',
    schema: addSectionOperationSchema,
    handler: addSectionHandler,
    collectVisualizationCreationRequests: (operation) =>
      operation.panels?.map((panelInput) => ({
        operationType: operation.operation,
        panelInput,
      })) ?? [],
  }),
  defineDashboardOperation({
    operation: 'remove_section',
    schema: removeSectionOperationSchema,
    handler: removeSectionHandler,
  }),
  defineDashboardOperation({
    operation: 'remove_panels',
    schema: removePanelsOperationSchema,
    handler: removePanelsHandler,
  }),
] as const;

const dashboardOperationRegistry = createDashboardOperationRegistry(dashboardOperationDefinitions);
export const dashboardOperationSchema = dashboardOperationRegistry.dashboardOperationSchema;
const { executeOperationHandler, collectVisualizationCreationRequests } =
  dashboardOperationRegistry;

interface ExecuteDashboardOperationsParams {
  dashboardData?: DashboardAttachmentData;
  operations: DashboardOperation[];
  logger: Logger;
  resolvePanelsFromAttachments: (
    attachmentInputs: Array<{ attachmentId: string; grid: AttachmentPanel['grid'] }>
  ) => { panels: AttachmentPanel[]; failures: VisualizationFailure[] };
  resolveVisualizationConfig?: ResolveVisualizationConfig;
}

const createEmptyDashboardData = (): DashboardAttachmentData => ({
  title: 'User Dashboard',
  description: undefined,
  panels: [],
});

export const executeDashboardOperations = async ({
  dashboardData,
  operations,
  logger,
  resolvePanelsFromAttachments,
  resolveVisualizationConfig,
}: ExecuteDashboardOperationsParams): Promise<{
  dashboardData: DashboardAttachmentData;
  failures: VisualizationFailure[];
}> => {
  let nextDashboardData = structuredClone(dashboardData ?? createEmptyDashboardData());
  const failures: VisualizationFailure[] = [];
  const visualizationCreationRequests = collectVisualizationCreationRequests(operations);
  const resolvedVisualizationCreationRequests = await resolveVisualizationCreationRequests({
    requestsByOperationIndex: visualizationCreationRequests,
    resolveVisualizationConfig,
  });
  const context: OperationExecutionContext = {
    logger,
    failures,
    resolvedVisualizationCreationRequests,
    resolvePanelsFromAttachments,
    resolveVisualizationConfig,
  };

  for (const [operationIndex, operation] of operations.entries()) {
    nextDashboardData = await executeOperationHandler({
      dashboardData: nextDashboardData,
      operation,
      operationIndex,
      context,
    });
  }

  return {
    dashboardData: nextDashboardData,
    failures,
  };
};
