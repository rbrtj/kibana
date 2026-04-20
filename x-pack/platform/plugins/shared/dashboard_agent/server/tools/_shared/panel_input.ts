/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { panelGridSchema } from '@kbn/dashboard-agent-common';
import type { DashboardOperation } from './operation_engine';

const sectionIdField = z
  .string()
  .optional()
  .describe(
    'ID of an existing section to add this panel into. The section must already exist. If omitted, the panel is added at the top level.'
  );

const gridField = panelGridSchema.describe(
  'Panel layout in grid units. w: width (1–48), h: height, x: column (0–47), y: row. The dashboard is 48 columns wide. Always set x and y to place panels without gaps.'
);

const markdownPanelInputSchema = z.object({
  kind: z.literal('markdown'),
  markdownContent: z.string().describe('Markdown content for the panel.'),
  grid: gridField,
  sectionId: sectionIdField,
});

const attachmentPanelInputSchema = z.object({
  kind: z.literal('attachment'),
  attachmentId: z.string().describe('Visualization attachment ID to add as a dashboard panel.'),
  grid: gridField,
  sectionId: sectionIdField,
});

const visualizationPanelInputSchema = z.object({
  kind: z.literal('visualization'),
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
  grid: gridField,
  sectionId: sectionIdField,
});

/**
 * LLM-facing discriminated union for adding a panel to a dashboard.
 * Used by `create_dashboard` and `add_panels` so the model sees the same shape.
 */
export const panelInputSchema = z.discriminatedUnion('kind', [
  markdownPanelInputSchema,
  attachmentPanelInputSchema,
  visualizationPanelInputSchema,
]);

export type PanelInput = z.infer<typeof panelInputSchema>;

/**
 * Translate a single LLM-facing panel input into one engine operation.
 *
 * Translation rules (one panel per engine op so failures stay localized):
 *  - markdown      -> add_markdown
 *  - attachment    -> add_panels_from_attachments (single-item)
 *  - visualization -> create_visualization_panels (single-item)
 */
export const panelInputToOperation = (panel: PanelInput): DashboardOperation => {
  switch (panel.kind) {
    case 'markdown':
      return {
        operation: 'add_markdown',
        markdownContent: panel.markdownContent,
        grid: panel.grid,
        sectionId: panel.sectionId,
      };
    case 'attachment':
      return {
        operation: 'add_panels_from_attachments',
        items: [
          {
            attachmentId: panel.attachmentId,
            grid: panel.grid,
            sectionId: panel.sectionId,
          },
        ],
      };
    case 'visualization':
      return {
        operation: 'create_visualization_panels',
        panels: [
          {
            query: panel.query,
            index: panel.index,
            chartType: panel.chartType,
            esql: panel.esql,
            grid: panel.grid,
            sectionId: panel.sectionId,
          },
        ],
      };
  }
};
