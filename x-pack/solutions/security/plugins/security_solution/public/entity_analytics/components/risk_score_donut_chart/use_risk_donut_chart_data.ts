/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { sum } from 'lodash/fp';
import { useMemo } from 'react';
import { RISK_SEVERITY_COLOUR, SEVERITY_UI_SORT_ORDER } from '../../common/utils';
import type { LegendItem } from '../../../common/components/charts/legend_item';
import type { SeverityCount } from '../severity/types';
import type { DonutChartProps } from '../../../common/components/charts/donutchart';

const legendField = 'kibana.alert.severity';

export const useRiskDonutChartData = (
  severityCount: SeverityCount
): [DonutChartProps['data'], LegendItem[], number] => {
  const [donutChartData, legendItems, total] = useMemo(() => {
    return [
      SEVERITY_UI_SORT_ORDER.map((status) => ({
        key: status,
        value: severityCount[status],
      })),
      SEVERITY_UI_SORT_ORDER.map((status) => ({
        color: RISK_SEVERITY_COLOUR[status],
        field: legendField,
        value: status,
      })),
      sum(Object.values(severityCount)),
    ];
  }, [severityCount]);

  return [donutChartData, legendItems, total];
};
