/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { VISUALIZE_EMBEDDABLE_TYPE } from '@kbn/visualizations-common';
import { VEGA_VIS_TYPE } from '@kbn/agent-builder-visualizations-common';
import { attachmentDataToDashboardState } from './from_attachment';
import { dashboardStateToAttachmentData } from './to_attachment';
import { dashboardState, grid } from './test_helpers';

const SPEC = JSON.stringify(
  { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', mark: 'bar' },
  null,
  2
);
const MINIFIED_SPEC = '{"$schema":"https://vega.github.io/schema/vega-lite/v6.json","mark":"bar"}';

const savedVis = (spec: string, title: string, description: string) => ({
  title,
  description,
  type: 'vega',
  params: { spec },
  uiState: {},
  data: { aggs: [], searchSource: {} },
});

const panelSettings = {
  title: 'Panel title edited',
  description: 'Panel description edited',
  hide_title: true,
  hide_border: true,
  drilldowns: [{ id: 'd1' }],
};

describe('Vega dashboard panel conversion (temporary legacy-vis bridge)', () => {
  it.each([
    {
      name: 'a minimal panel',
      config: { spec: SPEC, title: 'Chart', description: 'Desc' },
      expectedConfig: {
        title: 'Chart',
        description: 'Desc',
        savedVis: savedVis(SPEC, 'Chart', 'Desc'),
      },
    },
    {
      name: 'a panel with panel-level settings',
      config: { spec: SPEC, ...panelSettings },
      expectedConfig: {
        ...panelSettings,
        savedVis: savedVis(SPEC, 'Panel title edited', 'Panel description edited'),
      },
    },
  ])(
    'expands $name into a by-value legacy-vis panel and round-trips it unchanged',
    ({ config, expectedConfig }) => {
      const attachmentPanel = { type: VEGA_VIS_TYPE, id: 'p1', grid, config };

      const state = attachmentDataToDashboardState({ title: 'Dash', panels: [attachmentPanel] });

      expect(state.panels).toEqual([
        { type: VISUALIZE_EMBEDDABLE_TYPE, id: 'p1', grid, config: expectedConfig },
      ]);
      expect(dashboardStateToAttachmentData(state).panels).toEqual([attachmentPanel]);
    }
  );

  it('to_attachment normalizes a by-value legacy-vis Vega panel to the `vega` API shape, re-indenting a compact spec', () => {
    const state = dashboardState([
      {
        type: VISUALIZE_EMBEDDABLE_TYPE,
        id: 'p1',
        grid,
        config: { savedVis: savedVis(MINIFIED_SPEC, 'Chart', 'Desc') },
      },
    ]);

    expect(dashboardStateToAttachmentData(state).panels).toEqual([
      {
        type: VEGA_VIS_TYPE,
        id: 'p1',
        grid,
        config: { spec: SPEC, title: 'Chart', description: 'Desc' },
      },
    ]);
  });

  it('to_attachment preserves panel-level settings (title, description, hide_*, drilldowns) over savedVis values', () => {
    const state = dashboardState([
      {
        type: VISUALIZE_EMBEDDABLE_TYPE,
        id: 'p1',
        grid,
        config: {
          ...panelSettings,
          savedVis: savedVis(
            MINIFIED_SPEC,
            'Original savedVis title',
            'Original savedVis description'
          ),
        },
      },
    ]);

    expect(dashboardStateToAttachmentData(state).panels).toEqual([
      { type: VEGA_VIS_TYPE, id: 'p1', grid, config: { ...panelSettings, spec: SPEC } },
    ]);
  });
});
