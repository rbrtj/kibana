/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardAttachmentData } from '@kbn/agent-builder-dashboards-common';
import { executeDashboardOperations, type DashboardOperation } from '../operations';
import { DASHBOARD_OPERATION_FAILURE_TYPES } from '../failure_types';
import type { ControlFieldCapability, ResolveControlFieldCapabilities } from './types';
import { logger, buildDashboard, optionsListControl } from './test_helpers';

const usable = (type: string): ControlFieldCapability => ({ status: 'usable', type });

const NOT_AGGREGATABLE: ControlFieldCapability = { status: 'not_aggregatable' };

const CONFLICTING: ControlFieldCapability = { status: 'conflicting' };

const createFieldCapabilitiesResolver = (
  fields: Readonly<Record<string, ControlFieldCapability>>
) =>
  jest.fn<ReturnType<ResolveControlFieldCapabilities>, Parameters<ResolveControlFieldCapabilities>>(
    async () => new Map(Object.entries(fields))
  );

const getEsqlQueries = ({ pinned_panels: pinnedPanels = [] }: DashboardAttachmentData) =>
  pinnedPanels.map(
    (panel) => (panel as unknown as { config: { esql_query?: string } }).config.esql_query
  );

const getControlTypes = ({ pinned_panels: pinnedPanels = [] }: DashboardAttachmentData) =>
  pinnedPanels.map(({ type }) => type);

const TIME_SLIDER_CONTROL = {
  type: 'time_slider_control',
  id: 'time-slider',
  width: 'medium',
  grow: true,
  config: {},
};

describe('add_controls', () => {
  it.each([
    [
      'options_list_control',
      {
        type: 'options_list_control',
        field_name: 'service.name',
        index: 'logs-*',
        title: 'Service',
      },
      expect.objectContaining({
        title: 'Service',
        values_source: 'esql',
        esql_query: 'FROM logs-* | STATS BY `service.name`',
      }),
    ],
    [
      'range_slider_control',
      { type: 'range_slider_control', field_name: 'latency', index: 'metrics-*' },
      expect.objectContaining({
        values_source: 'esql',
        esql_query: 'FROM metrics-* | STATS BY latency',
      }),
    ],
    [
      'time_slider_control',
      { type: 'time_slider_control' },
      expect.not.objectContaining({ esql_query: expect.anything() }),
    ],
  ] as const)('appends a %s with the default layout', async (type, control, expectedConfig) => {
    const { dashboardData } = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [{ operation: 'add_controls', controls: [control] }],
      logger,
    });

    expect(dashboardData.pinned_panels).toEqual([
      { type, id: expect.any(String), width: 'medium', grow: true, config: expectedConfig },
    ]);
  });

  it('escapes ES|QL field identifiers in generated queries', async () => {
    const { dashboardData } = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_controls',
          controls: [
            { type: 'options_list_control', field_name: 'labels.pod-name', index: 'logs-*' },
            {
              type: 'range_slider_control',
              field_name: 'kubernetes.labels.app.kubernetes.io/name',
              index: 'logs-*',
            },
          ],
        },
      ],
      logger,
    });

    expect(getEsqlQueries(dashboardData)).toEqual([
      'FROM logs-* | STATS BY `labels.pod-name`',
      'FROM logs-* | STATS BY `kubernetes.labels.app.kubernetes.io/name`',
    ]);
  });

  it('skips extra time_slider_control controls in one operation', async () => {
    const { dashboardData, failures } = await executeDashboardOperations({
      dashboardData: buildDashboard(),
      operations: [
        {
          operation: 'add_controls',
          controls: [
            { type: 'time_slider_control' },
            { type: 'time_slider_control', user_requested: true },
            { type: 'options_list_control', field_name: 'service.name', index: 'logs-*' },
          ],
        },
      ],
      logger,
    });

    expect(getControlTypes(dashboardData)).toEqual(['time_slider_control', 'options_list_control']);
    expect(failures).toEqual([
      {
        type: 'add_controls',
        identifier: 'controls[1]',
        error: 'A dashboard can contain at most one time_slider_control.',
      },
    ]);
  });

  it('silently skips an unrequested second time_slider_control on an existing dashboard', async () => {
    const { dashboardData, failures } = await executeDashboardOperations({
      dashboardData: buildDashboard({ pinned_panels: [TIME_SLIDER_CONTROL] }),
      operations: [{ operation: 'add_controls', controls: [{ type: 'time_slider_control' }] }],
      logger,
    });

    expect(dashboardData.pinned_panels).toEqual([TIME_SLIDER_CONTROL]);
    expect(failures).toEqual([]);
  });

  it('appends to existing controls', async () => {
    const { dashboardData } = await executeDashboardOperations({
      dashboardData: buildDashboard({
        pinned_panels: [optionsListControl('host-id', 'host.name')],
      }),
      operations: [
        {
          operation: 'add_controls',
          controls: [{ type: 'options_list_control', field_name: 'env', index: 'logs-*' }],
        },
      ],
      logger,
    });

    expect(getEsqlQueries(dashboardData)).toEqual([
      'FROM logs-* | STATS BY host.name',
      'FROM logs-* | STATS BY env',
    ]);
  });

  describe('field validation', () => {
    type ControlsInput = Extract<DashboardOperation, { operation: 'add_controls' }>['controls'];
    const index = 'kibana_sample_data_logs';

    const addControls = (
      controls: ControlsInput,
      resolveControlFieldCapabilities: ResolveControlFieldCapabilities,
      dashboardData: DashboardAttachmentData = buildDashboard()
    ) =>
      executeDashboardOperations({
        dashboardData,
        operations: [{ operation: 'add_controls', controls }],
        logger,
        resolveControlFieldCapabilities,
      });

    it('keeps controls on supported field types', async () => {
      const { dashboardData, failures } = await addControls(
        [
          { type: 'options_list_control', field_name: 'client.ip', index },
          { type: 'options_list_control', field_name: 'status', index },
          { type: 'range_slider_control', field_name: 'bytes', index },
        ],
        createFieldCapabilitiesResolver({
          'client.ip': usable('ip'),
          status: usable('keyword'),
          bytes: usable('long'),
        })
      );

      expect(failures).toEqual([]);
      expect(getEsqlQueries(dashboardData)).toEqual([
        `FROM ${index} | STATS BY \`client.ip\``,
        `FROM ${index} | STATS BY status`,
        `FROM ${index} | STATS BY bytes`,
      ]);
    });

    it.each([
      ['a non-aggregatable text field', NOT_AGGREGATABLE],
      ['an aggregatable text field', usable('text')],
    ])('uses the keyword sibling of %s', async (_, hostCapability) => {
      const { dashboardData, failures } = await addControls(
        [{ type: 'options_list_control', field_name: 'host', index }],
        createFieldCapabilitiesResolver({ host: hostCapability, 'host.keyword': usable('keyword') })
      );

      expect(failures).toEqual([]);
      expect(getEsqlQueries(dashboardData)).toEqual([`FROM ${index} | STATS BY \`host.keyword\``]);
    });

    const notMapped = `Not mapped on index "${index}".`;
    const notAggregatable = `Is not aggregatable on index "${index}".`;
    const conflicting = `Has conflicting mappings on index "${index}".`;
    const optionsListType = `options_list_control needs a keyword, numeric, date, ip, boolean, or version field on index "${index}".`;
    const rangeSliderType = `range_slider_control needs a numeric field on index "${index}".`;

    it.each([
      ['options_list_control', 'is not mapped', {}, notMapped],
      [
        'options_list_control',
        'is text without a keyword sibling',
        { field: NOT_AGGREGATABLE },
        notAggregatable,
      ],
      ['options_list_control', 'has conflicting mappings', { field: CONFLICTING }, conflicting],
      ['range_slider_control', 'has conflicting mappings', { field: CONFLICTING }, conflicting],
      [
        'options_list_control',
        'is aggregate_metric_double',
        { field: usable('aggregate_metric_double') },
        optionsListType,
      ],
      ['options_list_control', 'is geo_point', { field: usable('geo_point') }, optionsListType],
      ['range_slider_control', 'is keyword', { field: usable('keyword') }, rangeSliderType],
      [
        'range_slider_control',
        'is aggregate_metric_double',
        { field: usable('aggregate_metric_double') },
        rangeSliderType,
      ],
    ] as const)('reports a user-requested %s whose field %s', async (type, _, fields, error) => {
      const { dashboardData, failures } = await addControls(
        [{ type, field_name: 'field', index, user_requested: true }],
        createFieldCapabilitiesResolver(fields)
      );

      expect(getEsqlQueries(dashboardData)).toEqual([]);
      expect(failures).toEqual([
        { type: DASHBOARD_OPERATION_FAILURE_TYPES.addControls, identifier: 'field', error },
      ]);
    });

    it('silently leaves out an unresolved control the user did not request', async () => {
      const { dashboardData, failures } = await addControls(
        [{ type: 'options_list_control', field_name: 'method', index }],
        createFieldCapabilitiesResolver({})
      );

      expect(getEsqlQueries(dashboardData)).toEqual([]);
      expect(failures).toEqual([]);
    });

    it('groups user-requested failures that share a reason', async () => {
      const { failures } = await addControls(
        ['http_method', 'status_code'].map((fieldName) => ({
          type: 'options_list_control' as const,
          field_name: fieldName,
          index,
          user_requested: true,
        })),
        createFieldCapabilitiesResolver({})
      );

      expect(failures).toEqual([
        {
          type: DASHBOARD_OPERATION_FAILURE_TYPES.addControls,
          identifier: 'http_method, status_code',
          error: notMapped,
        },
      ]);
    });

    it('requests only candidate fields, once per index, with the dashboard project routing', async () => {
      const resolveFieldCapabilities = createFieldCapabilitiesResolver({ host: usable('keyword') });

      await addControls(
        [
          { type: 'options_list_control', field_name: 'host', index },
          { type: 'options_list_control', field_name: 'service.name', index },
        ],
        resolveFieldCapabilities,
        buildDashboard({ project_routing: '_alias:*' })
      );

      expect(resolveFieldCapabilities).toHaveBeenCalledTimes(1);
      expect(resolveFieldCapabilities).toHaveBeenCalledWith({
        index,
        fieldNames: ['host', 'host.keyword', 'service.name', 'service.name.keyword'],
        projectRouting: '_alias:*',
      });
    });

    it('keeps controls unvalidated when field loading fails', async () => {
      const resolveFieldCapabilities = createFieldCapabilitiesResolver({});
      resolveFieldCapabilities.mockRejectedValue(new Error('field caps unavailable'));

      const { dashboardData, failures } = await addControls(
        [{ type: 'options_list_control', field_name: 'host', index, user_requested: true }],
        resolveFieldCapabilities
      );

      expect(failures).toEqual([]);
      expect(getEsqlQueries(dashboardData)).toEqual([`FROM ${index} | STATS BY host`]);
    });
  });
});
