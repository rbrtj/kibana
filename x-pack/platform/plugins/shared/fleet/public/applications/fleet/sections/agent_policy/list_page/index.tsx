/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { EuiTableActionsColumnType, EuiTableFieldDataColumnType } from '@elastic/eui';
import {
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiEmptyPrompt,
  EuiBasicTable,
  EuiLink,
  EuiToolTip,
  EuiIconTip,
} from '@elastic/eui';
import type { CriteriaWithPagination } from '@elastic/eui/src/components/basic_table/basic_table';
import { i18n } from '@kbn/i18n';
import { FormattedMessage, FormattedDate } from '@kbn/i18n-react';
import { useHistory } from 'react-router-dom';

import type { AgentPolicy } from '../../../types';
import { getRootIntegrations } from '../../../../../../common/services';
import {
  LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
  INGEST_SAVED_OBJECT_INDEX,
} from '../../../constants';
import {
  useAuthz,
  usePagination,
  useSorting,
  useLink,
  useConfig,
  useUrlParams,
  useBreadcrumbs,
  useGetAgentPoliciesQuery,
} from '../../../hooks';
import { SearchBar } from '../../../components';
import { AgentPolicySummaryLine } from '../../../../../components';
import { LinkedAgentCount, AgentPolicyActionMenu } from '../components';

import { CreateAgentPolicyFlyout } from './components';

export const AgentPolicyListPage: React.FunctionComponent<{}> = () => {
  useBreadcrumbs('policies_list');
  const { getPath } = useLink();
  const hasFleetAllAgentPoliciesPrivileges = useAuthz().fleet.allAgentPolicies;
  const agentPolicySavedObjectType = LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE;
  const {
    agents: { enabled: isFleetEnabled },
  } = useConfig();

  // Table and search states
  const { urlParams, toUrlParams } = useUrlParams();
  const showAgentless = urlParams.showAgentless === 'true';
  const [search, setSearch] = useState<string>(
    Array.isArray(urlParams.kuery)
      ? urlParams.kuery[urlParams.kuery.length - 1]
      : urlParams.kuery ?? ''
  );
  const { pagination, pageSizeOptions, setPagination } = usePagination();
  const { sorting, setSorting } = useSorting<AgentPolicy>({
    field: 'updated_at',
    direction: 'desc',
  });
  const history = useHistory();
  const isCreateAgentPolicyFlyoutOpen = 'create' in urlParams;
  const setIsCreateAgentPolicyFlyoutOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen !== isCreateAgentPolicyFlyoutOpen) {
        if (isOpen) {
          history.push(
            `${getPath('policies_list')}?${toUrlParams({ ...urlParams, create: null })}`
          );
        } else {
          const { create, ...params } = urlParams;
          history.push(`${getPath('policies_list')}?${toUrlParams(params)}`);
        }
      }
    },
    [getPath, history, isCreateAgentPolicyFlyoutOpen, toUrlParams, urlParams]
  );

  // Hide agentless policies by default unless `showAgentless` url param is true
  const getSearchWithDefaults = (newSearch: string) => {
    if (showAgentless) {
      return newSearch;
    }
    const defaultSearch = `NOT ${agentPolicySavedObjectType}.supports_agentless:true`;
    return newSearch.trim() ? `(${defaultSearch}) AND (${newSearch})` : defaultSearch;
  };

  // Fetch agent policies
  const {
    isLoading,
    data: agentPolicyData,
    refetch: resendRequest,
  } = useGetAgentPoliciesQuery({
    page: pagination.currentPage,
    perPage: pagination.pageSize,
    sortField: sorting?.field,
    sortOrder: sorting?.direction,
    kuery: getSearchWithDefaults(search),
    withAgentCount: true, // Explicitly fetch agent count
    full: true,
  });

  // Some policies retrieved, set up table props
  const columns = useMemo(() => {
    const cols: Array<
      EuiTableFieldDataColumnType<AgentPolicy> | EuiTableActionsColumnType<AgentPolicy>
    > = [
      {
        field: 'name',
        sortable: true,
        name: i18n.translate('xpack.fleet.agentPolicyList.nameColumnTitle', {
          defaultMessage: 'Name',
        }),
        width: '35%',
        render: (name: string, agentPolicy: AgentPolicy) => (
          <AgentPolicySummaryLine policy={agentPolicy} withDescription={true} />
        ),
      },
      {
        field: 'updated_at',
        sortable: true,
        name: i18n.translate('xpack.fleet.agentPolicyList.updatedOnColumnTitle', {
          defaultMessage: 'Last updated on',
        }),
        render: (date: AgentPolicy['updated_at']) => (
          <FormattedDate value={date} year="numeric" month="short" day="2-digit" />
        ),
      },
      {
        field: 'agents',
        name: i18n.translate('xpack.fleet.agentPolicyList.agentsColumnTitle', {
          defaultMessage: 'Unprivileged / Privileged',
        }),
        dataType: 'number',
        render: (agents: number, agentPolicy: AgentPolicy) => (
          <EuiFlexGroup direction="row" gutterSize="xs" justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={
                  <FormattedMessage
                    id="xpack.fleet.agentPolicyList.agentsColumn.unprivilegedAgentsTooltip"
                    defaultMessage="Unprivileged agents"
                  />
                }
              >
                <LinkedAgentCount
                  count={agentPolicy.unprivileged_agents || 0}
                  agentPolicyId={agentPolicy.id}
                  showAgentText={false}
                  privilegeMode="unprivileged"
                />
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>/</EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={
                  <FormattedMessage
                    id="xpack.fleet.agentPolicyList.agentsColumn.privilegedAgentsTooltip"
                    defaultMessage="Privileged agents"
                  />
                }
              >
                <LinkedAgentCount
                  count={agents - (agentPolicy.unprivileged_agents || 0)}
                  agentPolicyId={agentPolicy.id}
                  showAgentText={false}
                  privilegeMode="privileged"
                />
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <span>
                <FormattedMessage
                  id="xpack.fleet.agentPolicyList.agentsColumn.totalAgentsTooltipWrapper"
                  defaultMessage="({message})"
                  values={{
                    message: (
                      <EuiToolTip
                        content={
                          <FormattedMessage
                            id="xpack.fleet.agentPolicyList.agentsColumn.totalAgentsTooltip"
                            defaultMessage="Total agents"
                          />
                        }
                      >
                        <LinkedAgentCount
                          count={agents}
                          agentPolicyId={agentPolicy.id}
                          showAgentText={false}
                        />
                      </EuiToolTip>
                    ),
                  }}
                />
              </span>
            </EuiFlexItem>
            {getRootIntegrations(agentPolicy.package_policies || []).length > 0 &&
              (agentPolicy.unprivileged_agents || 0) > 0 && (
                <EuiFlexItem grow={false}>
                  <EuiIconTip
                    type="warning"
                    color="warning"
                    content={
                      <FormattedMessage
                        id="xpack.fleet.agentPolicyList.agentsColumn.containsUnprivilegedAgentsWarning"
                        defaultMessage="This agent policy contains integrations that require Elastic Agents to have root privileges. Some enrolled agents are running in unprivileged mode."
                      />
                    }
                  />
                </EuiFlexItem>
              )}
          </EuiFlexGroup>
        ),
      },
      {
        field: 'package_policies',
        name: i18n.translate('xpack.fleet.agentPolicyList.packagePoliciesCountColumnTitle', {
          defaultMessage: 'Integrations',
        }),
        dataType: 'number',
        render: (packagePolicies: AgentPolicy['package_policies']) =>
          packagePolicies ? packagePolicies.length : 0,
      },
      {
        field: 'actions',
        name: i18n.translate('xpack.fleet.agentPolicyList.actionsColumnTitle', {
          defaultMessage: 'Actions',
        }),
        actions: [
          {
            render: (agentPolicy: AgentPolicy) => (
              <AgentPolicyActionMenu
                agentPolicy={agentPolicy}
                onCopySuccess={() => resendRequest()}
              />
            ),
          },
        ],
      },
    ];

    // If Fleet is not enabled, then remove the `agents` column
    if (!isFleetEnabled) {
      return cols.filter((col) => ('field' in col ? col.field !== 'agents' : true));
    }

    return cols;
  }, [isFleetEnabled, resendRequest]);

  const createAgentPolicyButton = useMemo(
    () => (
      <EuiButton
        fill
        iconType="plusInCircle"
        isDisabled={!hasFleetAllAgentPoliciesPrivileges}
        onClick={() => setIsCreateAgentPolicyFlyoutOpen(true)}
        data-test-subj="createAgentPolicyButton"
      >
        <FormattedMessage
          id="xpack.fleet.agentPolicyList.addButton"
          defaultMessage="Create agent policy"
        />
      </EuiButton>
    ),
    [hasFleetAllAgentPoliciesPrivileges, setIsCreateAgentPolicyFlyoutOpen]
  );

  const emptyStateCreateAgentPolicyButton = useMemo(
    () => (
      <EuiButton
        fill
        iconType="plusInCircle"
        isDisabled={!hasFleetAllAgentPoliciesPrivileges}
        onClick={() => setIsCreateAgentPolicyFlyoutOpen(true)}
        data-test-subj="emptyPromptCreateAgentPolicyButton"
      >
        <FormattedMessage
          id="xpack.fleet.agentPolicyList.addButton"
          defaultMessage="Create agent policy"
        />
      </EuiButton>
    ),
    [hasFleetAllAgentPoliciesPrivileges, setIsCreateAgentPolicyFlyoutOpen]
  );

  const emptyPrompt = useMemo(
    () => (
      <EuiEmptyPrompt
        title={
          <h2>
            <FormattedMessage
              id="xpack.fleet.agentPolicyList.noAgentPoliciesPrompt"
              defaultMessage="No agent policies"
            />
          </h2>
        }
        actions={emptyStateCreateAgentPolicyButton}
      />
    ),
    [emptyStateCreateAgentPolicyButton]
  );

  const onTableChange = (criteria: CriteriaWithPagination<AgentPolicy>) => {
    const newPagination = {
      ...pagination,
      currentPage: criteria.page.index + 1,
      pageSize: criteria.page.size,
    };
    setPagination(newPagination);
    setSorting(criteria.sort);
  };

  return (
    <>
      {isCreateAgentPolicyFlyoutOpen ? (
        <CreateAgentPolicyFlyout
          onClose={() => {
            setIsCreateAgentPolicyFlyoutOpen(false);
            resendRequest();
          }}
        />
      ) : null}
      <EuiFlexGroup alignItems={'center'} gutterSize="m">
        <EuiFlexItem grow={4}>
          <SearchBar
            value={search}
            indexPattern={INGEST_SAVED_OBJECT_INDEX}
            fieldPrefix={agentPolicySavedObjectType}
            onChange={(newSearch) => {
              setPagination({
                ...pagination,
                currentPage: 1,
              });
              setSearch(newSearch);
            }}
            dataTestSubj="agentPolicyList.queryInput"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton color="primary" iconType="refresh" onClick={() => resendRequest()}>
            <FormattedMessage
              id="xpack.fleet.agentPolicyList.reloadAgentPoliciesButtonText"
              defaultMessage="Reload"
            />
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>{createAgentPolicyButton}</EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiBasicTable<AgentPolicy>
        loading={isLoading}
        data-test-subj="agentPoliciesTable"
        noItemsMessage={
          isLoading ? (
            <FormattedMessage
              id="xpack.fleet.agentPolicyList.loadingAgentPoliciesMessage"
              defaultMessage="Loading agent policies…"
            />
          ) : !search.trim() && (agentPolicyData?.total ?? 0) === 0 ? (
            emptyPrompt
          ) : (
            <FormattedMessage
              id="xpack.fleet.agentPolicyList.noFilteredAgentPoliciesPrompt"
              defaultMessage="No agent policies found. {clearFiltersLink}"
              values={{
                clearFiltersLink: (
                  <EuiLink onClick={() => setSearch('')}>
                    <FormattedMessage
                      id="xpack.fleet.agentPolicyList.clearFiltersLinkText"
                      defaultMessage="Clear filters"
                    />
                  </EuiLink>
                ),
              }}
            />
          )
        }
        items={agentPolicyData ? agentPolicyData.items : []}
        itemId="id"
        columns={columns}
        pagination={{
          pageIndex: pagination.currentPage - 1,
          pageSize: pagination.pageSize,
          totalItemCount: agentPolicyData ? agentPolicyData.total : 0,
          pageSizeOptions,
        }}
        sorting={{ sort: sorting }}
        onChange={onTableChange}
      />
    </>
  );
};
