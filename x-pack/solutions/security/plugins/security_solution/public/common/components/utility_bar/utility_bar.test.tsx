/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mount, shallow } from 'enzyme';
import React from 'react';
// Necessary until components being tested are migrated of styled-components https://github.com/elastic/kibana/issues/219037
import 'jest-styled-components';

import { TestProviders } from '../../mock';
import {
  UtilityBar,
  UtilityBarAction,
  UtilityBarGroup,
  UtilityBarSection,
  UtilityBarText,
} from '.';

describe('UtilityBar', () => {
  test('it renders', () => {
    const wrapper = shallow(
      <TestProviders>
        <UtilityBar>
          <UtilityBarSection>
            <UtilityBarGroup>
              <UtilityBarText>{'Test text'}</UtilityBarText>
            </UtilityBarGroup>

            <UtilityBarGroup>
              <UtilityBarAction
                dataTestSubj="popover"
                iconType=""
                popoverContent={() => <p>{'Test popover'}</p>}
              >
                {'Test action'}
              </UtilityBarAction>
            </UtilityBarGroup>
          </UtilityBarSection>

          <UtilityBarSection>
            <UtilityBarGroup>
              <UtilityBarAction dataTestSubj="action" iconType="cross">
                {'Test action'}
              </UtilityBarAction>
            </UtilityBarGroup>
          </UtilityBarSection>
        </UtilityBar>
      </TestProviders>
    );

    expect(wrapper.find('UtilityBar')).toMatchSnapshot();
  });

  test('it applies border styles when border is true', () => {
    const wrapper = mount(
      <TestProviders>
        <UtilityBar border>
          <UtilityBarSection>
            <UtilityBarGroup>
              <UtilityBarText>{'Test text'}</UtilityBarText>
            </UtilityBarGroup>

            <UtilityBarGroup>
              <UtilityBarAction
                dataTestSubj="popover"
                iconType=""
                popoverContent={() => <p>{'Test popover'}</p>}
              >
                {'Test action'}
              </UtilityBarAction>
            </UtilityBarGroup>
          </UtilityBarSection>

          <UtilityBarSection>
            <UtilityBarGroup>
              <UtilityBarAction dataTestSubj="action" iconType="cross">
                {'Test action'}
              </UtilityBarAction>
            </UtilityBarGroup>
          </UtilityBarSection>
        </UtilityBar>
      </TestProviders>
    );
    const siemUtilityBar = wrapper.find('.siemUtilityBar').first();

    expect(siemUtilityBar).toHaveStyleRule('border-bottom', expect.any(String));
    expect(siemUtilityBar).toHaveStyleRule('padding-bottom', expect.any(String));
  });

  test('it DOES NOT apply border styles when border is false', () => {
    const wrapper = mount(
      <TestProviders>
        <UtilityBar>
          <UtilityBarSection>
            <UtilityBarGroup>
              <UtilityBarText>{'Test text'}</UtilityBarText>
            </UtilityBarGroup>

            <UtilityBarGroup>
              <UtilityBarAction
                dataTestSubj="popover"
                iconType=""
                popoverContent={() => <p>{'Test popover'}</p>}
              >
                {'Test action'}
              </UtilityBarAction>
            </UtilityBarGroup>
          </UtilityBarSection>

          <UtilityBarSection>
            <UtilityBarGroup>
              <UtilityBarAction dataTestSubj="action" iconType="cross">
                {'Test action'}
              </UtilityBarAction>
            </UtilityBarGroup>
          </UtilityBarSection>
        </UtilityBar>
      </TestProviders>
    );
    const siemUtilityBar = wrapper.find('.siemUtilityBar').first();

    expect(siemUtilityBar).not.toHaveStyleRule('border-bottom', expect.any(String));
    expect(siemUtilityBar).not.toHaveStyleRule('padding-bottom', expect.any(String));
  });
});
