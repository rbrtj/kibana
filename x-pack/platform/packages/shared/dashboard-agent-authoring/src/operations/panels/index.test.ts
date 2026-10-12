/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { MARKDOWN_EMBEDDABLE_TYPE } from '@kbn/dashboard-markdown-schemas';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import {
  addPanelsItemSchema,
  addSectionPanelItemSchema,
  buildConfigPanelContent,
  editPanelItemSchema,
  findPanelRenderer,
  getConfigPanelEditError,
  getRendererEmbeddableType,
} from '.';

const grid = { x: 0, y: 0, w: 12, h: 5 };

const lensRequest = {
  source: 'request' as const,
  query: 'show total requests',
  grid,
};

const addSchemas = [
  ['add_panels', addPanelsItemSchema],
  ['add_section', addSectionPanelItemSchema],
] as const;

describe('panel item schemas', () => {
  it.each(addSchemas)(
    'routes a Lens request without renderer through the %s schema and requires chartType',
    (_, schema) => {
      expect(
        schema.safeParse({ ...lensRequest, chartType: SupportedChartType.Metric }).success
      ).toBe(true);
      expect(schema.safeParse(lensRequest).success).toBe(false);
    }
  );

  it.each(addSchemas)(
    'accepts a by-value markdown panel and rejects unregistered by-value types through the %s schema',
    (_, schema) => {
      expect(
        schema.safeParse({ source: 'config', type: 'markdown', grid, config: { content: 'hello' } })
          .success
      ).toBe(true);
      expect(
        schema.safeParse({ source: 'config', type: 'vis', grid, config: { type: 'metric' } })
          .success
      ).toBe(false);
      expect(
        schema.safeParse({
          source: 'config',
          type: 'custom_content',
          grid,
          config: { prompt: 'Show a KPI card' },
        }).success
      ).toBe(false);
    }
  );
});

describe('custom_content panel schemas', () => {
  const customContentRequest = {
    source: 'request' as const,
    renderer: 'custom_content' as const,
    grid,
    query: 'Show a KPI card for total errors',
  };

  it.each(addSchemas)(
    'accepts a custom_content request with only a query and rejects one without through %s',
    (_, schema) => {
      const { query, ...withoutQuery } = customContentRequest;

      expect(schema.safeParse(customContentRequest).success).toBe(true);
      expect(schema.safeParse(withoutQuery).success).toBe(false);
    }
  );

  it.each(addSchemas)(
    'keeps esql and drops Lens-only fields on a custom_content request through %s',
    (_, schema) => {
      const result = schema.safeParse({
        ...customContentRequest,
        esql: 'FROM logs-* | STATS count = COUNT(*) BY service.name',
        chartType: SupportedChartType.Metric,
        index: 'logs-*',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        ...customContentRequest,
        esql: 'FROM logs-* | STATS count = COUNT(*) BY service.name',
      });
    }
  );
});

describe('edit_panels item schema', () => {
  const customContentEdit = {
    source: 'request' as const,
    renderer: 'custom_content' as const,
    panelId: 'cc-1',
  };

  it('accepts a Lens edit without renderer', () => {
    expect(
      editPanelItemSchema.safeParse({ source: 'request', panelId: 'panel-1', query: 'retitle' })
        .success
    ).toBe(true);
  });

  it.each([
    ['a query-only', true, { query: 'Updated KPI' }],
    ['an esql-only', true, { esql: 'FROM logs-* | STATS count = COUNT(*)' }],
    ['a query-removing', true, { esql: null }],
    ['an empty', false, {}],
  ])('parses %s custom_content edit as valid: %s', (_, valid, fields) => {
    expect(editPanelItemSchema.safeParse({ ...customContentEdit, ...fields }).success).toBe(valid);
  });

  it.each([
    ['50,000', true, 50000],
    ['50,001', false, 50001],
  ])(
    'parses a markdown config edit with %s characters of content as valid: %s',
    (_, valid, length) => {
      expect(
        editPanelItemSchema.safeParse({
          source: 'config',
          type: 'markdown',
          panelId: 'md-1',
          config: { content: 'a'.repeat(length) },
        }).success
      ).toBe(valid);
    }
  );
});

describe('panel kind registry', () => {
  it('builds panel content for the registered embeddable type', () => {
    expect(buildConfigPanelContent('markdown', { content: 'hello' })).toEqual({
      type: MARKDOWN_EMBEDDABLE_TYPE,
      config: { content: 'hello' },
    });
  });

  it.each([
    ['markdown', MARKDOWN_EMBEDDABLE_TYPE, 'markdown'],
    ['ml_anomaly_charts', 'ml_anomaly_charts', 'anomaly charts'],
    ['ml_anomaly_swimlane', 'ml_anomaly_swimlane', 'anomaly swim lane'],
    ['ml_single_metric_viewer', 'ml_single_metric_viewer', 'single metric viewer'],
  ] as const)(
    'lets a %s edit target only a panel of its embeddable type',
    (type, embeddableType, label) => {
      expect(
        getConfigPanelEditError(type, { id: 'panel-1', type: embeddableType, config: {}, grid })
      ).toBeUndefined();
      expect(
        getConfigPanelEditError(type, {
          id: 'panel-1',
          type: LENS_EMBEDDABLE_TYPE,
          config: {},
          grid,
        })
      ).toBe(
        `Panel "panel-1" with type "${LENS_EMBEDDABLE_TYPE}" cannot be edited as ${label}. Use source: "request" with the panel's renderer for Lens, Vega, or custom content panels.`
      );
    }
  );

  it.each(['lens', 'vega', 'custom_content'] as const)(
    'maps the %s renderer to an embeddable type that maps back to it',
    (renderer) => {
      expect(findPanelRenderer(getRendererEmbeddableType(renderer))).toBe(renderer);
    }
  );
});
