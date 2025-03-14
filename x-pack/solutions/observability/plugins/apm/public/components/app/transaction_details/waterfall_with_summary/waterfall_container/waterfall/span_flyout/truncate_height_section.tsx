/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiIcon, EuiLink } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ReactNode } from 'react';
import React, { Fragment, useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';

const ToggleButtonContainer = styled.div`
  margin-top: ${({ theme }) => theme.euiTheme.size.s}
  user-select: none;
`;

interface Props {
  children: ReactNode;
  previewHeight: number;
}

export function TruncateHeightSection({ children, previewHeight }: Props) {
  const contentContainerEl = useRef<HTMLDivElement>(null);

  const [showToggle, setShowToggle] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (contentContainerEl.current) {
      const shouldShow = contentContainerEl.current.scrollHeight > previewHeight;
      setShowToggle(shouldShow);
    }
  }, [children, previewHeight]);

  return (
    <Fragment>
      <div
        ref={contentContainerEl}
        style={{
          overflow: 'hidden',
          maxHeight: isOpen ? 'initial' : previewHeight,
        }}
      >
        {children}
      </div>
      {showToggle ? (
        <ToggleButtonContainer>
          <EuiLink
            data-test-subj="apmTruncateHeightSectionLink"
            onClick={() => {
              setIsOpen(!isOpen);
            }}
          >
            <EuiIcon
              style={{
                transition: 'transform 0.1s',
                transform: `rotate(${isOpen ? 90 : 0}deg)`,
              }}
              type="arrowRight"
            />{' '}
            {isOpen
              ? i18n.translate('xpack.apm.toggleHeight.showLessButtonLabel', {
                  defaultMessage: 'Show fewer lines',
                })
              : i18n.translate('xpack.apm.toggleHeight.showMoreButtonLabel', {
                  defaultMessage: 'Show more lines',
                })}
          </EuiLink>
        </ToggleButtonContainer>
      ) : null}
    </Fragment>
  );
}
