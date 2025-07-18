/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiFormRow, EuiComboBox, EuiText, EuiLink, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import { documentationService } from '../../../../../services/documentation';
import {
  getFieldConfig,
  filterTypesForMultiField,
  filterTypesForNonRootFields,
} from '../../../lib';
import { UseField } from '../../../shared_imports';
import { ComboBoxOption, DataType } from '../../../types';
import { FIELD_TYPES_OPTIONS } from '../../../constants';

interface Props {
  isRootLevelField: boolean;
  isMultiField?: boolean | null;
  showDocLink?: boolean;
  isSemanticTextEnabled?: boolean;
  fieldTypeInputRef?: React.MutableRefObject<HTMLInputElement | null>;
}

export const TypeParameter = ({
  isMultiField,
  isRootLevelField,
  showDocLink = false,
  isSemanticTextEnabled = true,
  fieldTypeInputRef,
}: Props) => {
  const fieldTypeOptions = useMemo(() => {
    let options = isMultiField
      ? filterTypesForMultiField(FIELD_TYPES_OPTIONS)
      : isRootLevelField
      ? FIELD_TYPES_OPTIONS
      : filterTypesForNonRootFields(FIELD_TYPES_OPTIONS);

    if (!isSemanticTextEnabled) {
      options = options.filter((option) => option.value !== 'semantic_text');
    }

    return options;
  }, [isMultiField, isRootLevelField, isSemanticTextEnabled]);

  return (
    <UseField<ComboBoxOption[]> path="type" config={getFieldConfig<ComboBoxOption[]>('type')}>
      {(typeField) => {
        const error = typeField.getErrorsMessages();
        const isInvalid = error ? Boolean(error.length) : false;

        let docLink = null;
        if (showDocLink && typeField.value.length > 0) {
          const selectedType = typeField.value[0].value as DataType;
          docLink = documentationService.getTypeDocLink(selectedType);
        }

        return (
          <EuiFormRow
            label={typeField.label}
            error={error}
            isInvalid={isInvalid}
            helpText={
              docLink ? (
                <EuiText size="xs">
                  <EuiLink href={docLink} target="_blank">
                    {i18n.translate(
                      'xpack.idxMgmt.mappingsEditor.typeField.documentationLinkLabel',
                      {
                        defaultMessage: '{typeName} documentation',
                        values: {
                          typeName:
                            typeField.value && typeField.value[0] ? typeField.value[0].label : '',
                        },
                      }
                    )}
                  </EuiLink>
                </EuiText>
              ) : (
                <EuiSpacer size="m" />
              )
            }
          >
            <EuiComboBox
              isInvalid={isInvalid}
              placeholder={i18n.translate(
                'xpack.idxMgmt.mappingsEditor.typeField.placeholderLabel',
                {
                  defaultMessage: 'Select a type',
                }
              )}
              singleSelection={{ asPlainText: true }}
              options={fieldTypeOptions}
              selectedOptions={typeField.value}
              onChange={typeField.setValue}
              isClearable={false}
              data-test-subj="fieldType"
              inputRef={(input) => {
                if (fieldTypeInputRef) fieldTypeInputRef.current = input;
              }}
            />
          </EuiFormRow>
        );
      }}
    </UseField>
  );
};
