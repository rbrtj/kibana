/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { useIndicatorsTableContext } from '../../hooks/use_table_context';
import { MoreActions } from './more_actions';
import { InvestigateInTimelineButtonIcon } from '../../../timeline/components/investigate_in_timeline';
import type { Indicator } from '../../../../../../common/threat_intelligence/types/indicator';
import { OpenIndicatorFlyoutButton } from './open_flyout_button';
import { INVESTIGATE_IN_TIMELINE_TEST_ID } from './test_ids';

export const ActionsRowCell: FC<{ indicator: Indicator }> = ({ indicator }) => {
  const indicatorTableContext = useIndicatorsTableContext();

  const { setExpanded, expanded } = indicatorTableContext;

  return (
    <EuiFlexGroup justifyContent="center" gutterSize="none">
      <EuiFlexItem grow={false}>
        <OpenIndicatorFlyoutButton
          indicator={indicator}
          onOpen={setExpanded}
          isOpen={Boolean(expanded && expanded._id === indicator._id)}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <InvestigateInTimelineButtonIcon
          data={indicator}
          data-test-subj={INVESTIGATE_IN_TIMELINE_TEST_ID}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <MoreActions indicator={indicator} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
