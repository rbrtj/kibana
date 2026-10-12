/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildLensConfig, buildVegaConfig } from '@kbn/agent-builder-visualizations-server';
import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { VEGA_VIS_TYPE } from '@kbn/agent-builder-visualizations-common';
import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { createVisPanelResolver } from './vis_panel_resolver';

jest.mock('@kbn/agent-builder-visualizations-server', () => ({
  buildLensConfig: jest.fn(),
  buildVegaConfig: jest.fn(),
}));

const mockedBuildLensConfig = jest.mocked(buildLensConfig);
const mockedBuildVegaConfig = jest.mocked(buildVegaConfig);

describe('createVisPanelResolver', () => {
  const resolveVisPanel = createVisPanelResolver({
    logger: loggingSystemMock.create().get(),
    modelProvider: {} as ModelProvider,
    events: {} as ToolEventEmitter,
    esClient: {} as IScopedClusterClient,
  });
  const createBuildLensConfigResult = (
    validatedConfig: Record<string, unknown>,
    overrides: Partial<Awaited<ReturnType<typeof buildLensConfig>>> = {}
  ): Awaited<ReturnType<typeof buildLensConfig>> =>
    ({
      validatedConfig,
      selectedChartType: 'metric',
      authoringNote: 'Created a titleless metric showing total requests.',
      esqlQuery: 'FROM logs-* | STATS count = COUNT(*)',
      ...overrides,
    } as Awaited<ReturnType<typeof buildLensConfig>>);

  beforeEach(() => {
    mockedBuildLensConfig.mockReset();
    mockedBuildVegaConfig.mockReset();
  });

  it('creates Lens panel content for create requests', async () => {
    mockedBuildLensConfig.mockResolvedValue(createBuildLensConfigResult({ type: 'metric' }));

    const result = await resolveVisPanel({
      operationType: 'add_panels',
      identifier: 'show total requests',
      nlQuery: 'show total requests',
      index: 'logs-*',
      chartType: SupportedChartType.Metric,
    });

    expect(result).toEqual({
      type: 'success',
      panelContent: {
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
      },
      authoringNote: 'Created a titleless metric showing total requests.',
    });
  });

  it('creates panel content when the authoring note is missing', async () => {
    mockedBuildLensConfig.mockResolvedValue(
      createBuildLensConfigResult({ type: 'metric' }, { authoringNote: undefined })
    );

    await expect(
      resolveVisPanel({
        operationType: 'add_panels',
        identifier: 'show total requests',
        nlQuery: 'show total requests',
        index: 'logs-*',
      })
    ).resolves.toEqual({
      type: 'success',
      panelContent: {
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'metric' },
      },
    });
  });

  it('passes the existing Lens config when editing a Lens panel', async () => {
    mockedBuildLensConfig.mockResolvedValue(createBuildLensConfigResult({ type: 'line' }));

    await resolveVisPanel({
      operationType: 'edit_panels',
      identifier: 'panel-1',
      nlQuery: 'change the title',
      preserveESQL: true,
      applyChartRules: true,
      existingPanel: {
        id: 'panel-1',
        type: LENS_EMBEDDABLE_TYPE,
        config: { type: 'xy' },
        grid: { w: 24, h: 12, x: 0, y: 0 },
      },
    });

    expect(mockedBuildLensConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        existingConfig: JSON.stringify({ type: 'xy' }),
        parsedExistingConfig: { type: 'xy' },
        preserveESQL: true,
        applyChartRules: true,
      })
    );
  });

  it('creates a Vega panel in the attachment API shape (config.spec) when renderer is "vega"', async () => {
    const spec = '{"$schema":"https://vega.github.io/schema/vega-lite/v6.json"}';
    mockedBuildVegaConfig.mockResolvedValue({
      spec,
      title: 'Requests by host',
      authoringNote: 'Created a bar chart of requests by host with a concise title.',
      esqlQuery: 'FROM logs-*',
    });

    const result = await resolveVisPanel({
      operationType: 'add_panels',
      identifier: 'a small multiples chart',
      nlQuery: 'a small multiples chart',
      index: 'logs-*',
      renderer: 'vega',
    });

    expect(result).toEqual({
      type: 'success',
      panelContent: {
        type: VEGA_VIS_TYPE,
        config: { spec, title: 'Requests by host' },
      },
      authoringNote: 'Created a bar chart of requests by host with a concise title.',
    });
    expect(mockedBuildVegaConfig).toHaveBeenCalledWith(
      expect.objectContaining({ nlQuery: 'a small multiples chart', existingSpec: undefined })
    );
  });

  it('reuses the embedded spec when editing a Vega panel', async () => {
    const existingSpec = '{"$schema":"vega-lite","mark":"bar"}';
    const nextSpec = '{"$schema":"vega-lite","mark":"line"}';
    mockedBuildVegaConfig.mockResolvedValue({
      spec: nextSpec,
      authoringNote: 'Changed the panel to a line chart.',
      esqlQuery: 'FROM logs-*',
    });

    const result = await resolveVisPanel({
      operationType: 'edit_panels',
      identifier: 'panel-1',
      nlQuery: 'make it a line chart',
      preserveESQL: true,
      renderer: 'vega',
      existingPanel: {
        id: 'panel-1',
        type: VEGA_VIS_TYPE,
        config: { spec: existingSpec },
        grid: { w: 24, h: 12, x: 0, y: 0 },
      },
    });

    expect(result).toEqual({
      type: 'success',
      panelContent: {
        type: VEGA_VIS_TYPE,
        config: { spec: nextSpec },
      },
      authoringNote: 'Changed the panel to a line chart.',
    });
    expect(mockedBuildVegaConfig).toHaveBeenCalledWith(
      expect.objectContaining({ existingSpec, preserveESQL: true })
    );
  });

  it('reports unsupported Vega enhancement instead of ignoring the presentation mode', async () => {
    const result = await resolveVisPanel({
      operationType: 'edit_panels',
      identifier: 'panel-1',
      nlQuery: 'Enhance this panel',
      renderer: 'vega',
      applyChartRules: true,
      preserveESQL: true,
      existingPanel: {
        id: 'panel-1',
        type: VEGA_VIS_TYPE,
        config: { spec: '{"mark":"bar"}' },
        grid: { w: 24, h: 10, x: 0, y: 0 },
      },
    });

    expect(result).toEqual({
      type: 'failure',
      failure: {
        type: 'edit_panels',
        identifier: 'panel-1',
        error: 'Presentation enhancement is only supported for ES|QL Lens panels.',
      },
    });
    expect(mockedBuildVegaConfig).not.toHaveBeenCalled();
    expect(mockedBuildLensConfig).not.toHaveBeenCalled();
  });
});
