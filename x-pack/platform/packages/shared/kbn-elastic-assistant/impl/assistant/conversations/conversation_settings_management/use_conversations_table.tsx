/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';

import { ActionTypeRegistryContract } from '@kbn/triggers-actions-ui-plugin/public';
import { EuiBadge, EuiBasicTableColumn, EuiLink } from '@elastic/eui';

import { FormattedDate } from '@kbn/i18n-react';
import { PromptResponse } from '@kbn/elastic-assistant-common';
import { Conversation } from '../../../assistant_context/types';
import { AIConnector } from '../../../connectorland/connector_selector';
import { getConnectorTypeTitle } from '../../../connectorland/helpers';
import { getConversationApiConfig } from '../../use_conversation/helpers';
import * as i18n from './translations';
import { useInlineActions } from '../../common/components/assistant_settings_management/inline_actions';
import { InputCheckbox, PageSelectionCheckbox } from './table_selection_checkbox';
import {
  ConversationTableItem,
  HandlePageChecked,
  HandlePageUnchecked,
  HandleRowChecked,
  HandleRowUnChecked,
} from './types';

const emptyConversations = {};

export interface GetConversationsListParams {
  allSystemPrompts: PromptResponse[];
  actionTypeRegistry: ActionTypeRegistryContract;
  connectors: AIConnector[] | undefined;
  conversations: Record<string, Conversation>;
  defaultConnector?: AIConnector;
}

interface GetColumnsParams {
  conversationOptions: ConversationTableItem[];
  deletedConversationsIds: string[];
  excludedIds: string[];
  handlePageChecked: HandlePageChecked;
  handlePageUnchecked: HandlePageUnchecked;
  handleRowChecked: HandleRowChecked;
  handleRowUnChecked: HandleRowUnChecked;
  isDeleteEnabled: (conversation: ConversationTableItem) => boolean;
  isEditEnabled: (conversation: ConversationTableItem) => boolean;
  isExcludedMode: boolean;
  onDeleteActionClicked: (conversation: ConversationTableItem) => void;
  onEditActionClicked: (conversation: ConversationTableItem) => void;
  totalItemCount: number;
}

export const useConversationsTable = () => {
  const getActions = useInlineActions<ConversationTableItem>();
  const getColumns = useCallback(
    ({
      conversationOptions,
      deletedConversationsIds,
      excludedIds,
      handlePageChecked,
      handlePageUnchecked,
      handleRowChecked,
      handleRowUnChecked,
      isDeleteEnabled,
      isEditEnabled,
      isExcludedMode,
      onDeleteActionClicked,
      onEditActionClicked,
      totalItemCount,
    }: GetColumnsParams): Array<EuiBasicTableColumn<ConversationTableItem>> => {
      return [
        {
          field: '',
          name: (
            <PageSelectionCheckbox
              conversationOptions={conversationOptions}
              deletedConversationsIds={deletedConversationsIds}
              excludedIds={excludedIds}
              isExcludedMode={isExcludedMode}
              handlePageChecked={handlePageChecked}
              handlePageUnchecked={handlePageUnchecked}
              totalItemCount={totalItemCount}
            />
          ),
          render: (conversation: ConversationTableItem) => (
            <InputCheckbox
              conversation={conversation}
              deletedConversationsIds={deletedConversationsIds}
              excludedIds={excludedIds}
              isExcludedMode={isExcludedMode}
              handleRowChecked={handleRowChecked}
              handleRowUnChecked={handleRowUnChecked}
              totalItemCount={totalItemCount}
            />
          ),
          width: '70px',
          sortable: false,
        },
        {
          name: i18n.CONVERSATIONS_TABLE_COLUMN_TITLE,
          render: (conversation: ConversationTableItem) => (
            <EuiLink onClick={() => onEditActionClicked(conversation)}>
              {conversation.title}
            </EuiLink>
          ),
          sortable: ({ title }: ConversationTableItem) => title,
        },
        {
          field: 'systemPromptTitle',
          name: i18n.CONVERSATIONS_TABLE_COLUMN_SYSTEM_PROMPT,
          align: 'left',
          render: (systemPromptTitle: ConversationTableItem['systemPromptTitle']) =>
            systemPromptTitle ? <EuiBadge color="hollow">{systemPromptTitle}</EuiBadge> : null,
          sortable: false,
        },
        {
          field: 'connectorTypeTitle',
          name: i18n.CONVERSATIONS_TABLE_COLUMN_CONNECTOR,
          align: 'left',
          render: (connectorTypeTitle: ConversationTableItem['connectorTypeTitle']) =>
            connectorTypeTitle ? <EuiBadge color="hollow">{connectorTypeTitle}</EuiBadge> : null,
          sortable: false,
        },
        {
          field: 'updatedAt',
          name: i18n.CONVERSATIONS_TABLE_COLUMN_UPDATED_AT,
          align: 'center',
          render: (updatedAt: ConversationTableItem['updatedAt']) =>
            updatedAt ? (
              <EuiBadge color="hollow">
                <FormattedDate
                  value={new Date(updatedAt)}
                  year="numeric"
                  month="2-digit"
                  day="numeric"
                />
              </EuiBadge>
            ) : null,
          sortable: true,
        },
        {
          width: '120px',
          align: 'center',
          ...getActions({
            isDeleteEnabled,
            isEditEnabled,
            onDelete: onDeleteActionClicked,
            onEdit: onEditActionClicked,
          }),
        },
      ];
    },
    [getActions]
  );
  const getConversationsList = useCallback(
    ({
      allSystemPrompts,
      actionTypeRegistry,
      connectors,
      conversations = emptyConversations,
      defaultConnector,
    }: GetConversationsListParams): ConversationTableItem[] =>
      Object.values(conversations).map((conversation) => {
        const conversationApiConfig = getConversationApiConfig({
          allSystemPrompts,
          connectors,
          conversation,
          defaultConnector,
        });
        const connector: AIConnector | undefined = connectors?.find(
          (c) => c.id === conversationApiConfig.apiConfig?.connectorId
        );
        const connectorTypeTitle = getConnectorTypeTitle(connector, actionTypeRegistry);

        const systemPrompt: PromptResponse | undefined = allSystemPrompts.find(
          ({ id }) => id === conversation.apiConfig?.defaultSystemPromptId
        );

        const systemPromptTitle = systemPrompt?.name || systemPrompt?.id;

        return {
          ...conversation,
          connectorTypeTitle,
          systemPromptTitle,
          ...conversationApiConfig,
        };
      }),
    []
  );

  return {
    getColumns,
    getConversationsList,
  };
};
