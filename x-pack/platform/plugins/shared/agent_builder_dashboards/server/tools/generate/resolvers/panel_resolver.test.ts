/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildLensConfig } from '@kbn/agent-builder-visualizations-server';
import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import { CUSTOM_CONTENT_EMBEDDABLE_TYPE } from '@kbn/custom-content-common';
import { createCustomContentTemplateResolver } from '@kbn/custom-content-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { createPanelResolver } from './panel_resolver';

jest.mock('@kbn/agent-builder-visualizations-server', () => ({
  buildLensConfig: jest.fn(),
  buildVegaConfig: jest.fn(),
}));

jest.mock('@kbn/custom-content-server', () => ({
  createCustomContentTemplateResolver: jest.fn(),
}));

const mockedBuildLensConfig = jest.mocked(buildLensConfig);
const mockedCreateTemplateResolver = jest.mocked(createCustomContentTemplateResolver);

const grid = { x: 0, y: 0, w: 12, h: 5 };

describe('createPanelResolver', () => {
  const resolveTemplate = jest.fn();
  let resolve: ReturnType<typeof createPanelResolver>;

  beforeEach(() => {
    mockedBuildLensConfig.mockReset();
    resolveTemplate.mockReset();
    mockedBuildLensConfig.mockResolvedValue({
      validatedConfig: { type: 'metric' },
    } as Awaited<ReturnType<typeof buildLensConfig>>);
    resolveTemplate.mockResolvedValue({ template: '<div>resolved</div>', height: 320 });
    mockedCreateTemplateResolver.mockReturnValue(resolveTemplate);
    resolve = createPanelResolver({
      logger: loggingSystemMock.create().get(),
      modelProvider: {} as ModelProvider,
      events: {} as ToolEventEmitter,
      esClient: {} as IScopedClusterClient,
    });
  });

  it.each([
    [
      'a request without renderer',
      {
        operationType: 'add_panels',
        identifier: 'show total requests',
        nlQuery: 'show total requests',
      },
      LENS_EMBEDDABLE_TYPE,
    ],
    [
      'a custom_content request',
      {
        renderer: 'custom_content',
        operationType: 'edit_panels',
        identifier: 'cc-1',
        nlQuery: 'change the title',
        existingPanel: { id: 'cc-1', type: CUSTOM_CONTENT_EMBEDDABLE_TYPE, config: {}, grid },
      },
      CUSTOM_CONTENT_EMBEDDABLE_TYPE,
    ],
  ] as Array<[string, Parameters<typeof resolve>[0], string]>)(
    'routes %s to the resolver for its renderer',
    async (_, request, embeddableType) => {
      expect(await resolve(request)).toMatchObject({
        type: 'success',
        panelContent: { type: embeddableType },
      });
    }
  );
});
