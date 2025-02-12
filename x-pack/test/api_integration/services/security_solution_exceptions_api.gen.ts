/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * NOTICE: Do not edit this file manually.
 * This file is automatically generated by the OpenAPI Generator, @kbn/openapi-generator.
 *
 * info:
 *   title: Exceptions API client for tests
 *   version: Bundle (no version)
 */

import {
  ELASTIC_HTTP_VERSION_HEADER,
  X_ELASTIC_INTERNAL_ORIGIN_REQUEST,
} from '@kbn/core-http-common';
import { replaceParams } from '@kbn/openapi-common/shared';

import { CreateExceptionListRequestBodyInput } from '@kbn/securitysolution-exceptions-common/api/create_exception_list/create_exception_list.gen';
import { CreateExceptionListItemRequestBodyInput } from '@kbn/securitysolution-exceptions-common/api/create_exception_list_item/create_exception_list_item.gen';
import {
  CreateRuleExceptionListItemsRequestParamsInput,
  CreateRuleExceptionListItemsRequestBodyInput,
} from '@kbn/securitysolution-exceptions-common/api/create_rule_exceptions/create_rule_exceptions.gen';
import { CreateSharedExceptionListRequestBodyInput } from '@kbn/securitysolution-exceptions-common/api/create_shared_exceptions_list/create_shared_exceptions_list.gen';
import { DeleteExceptionListRequestQueryInput } from '@kbn/securitysolution-exceptions-common/api/delete_exception_list/delete_exception_list.gen';
import { DeleteExceptionListItemRequestQueryInput } from '@kbn/securitysolution-exceptions-common/api/delete_exception_list_item/delete_exception_list_item.gen';
import { DuplicateExceptionListRequestQueryInput } from '@kbn/securitysolution-exceptions-common/api/duplicate_exception_list/duplicate_exception_list.gen';
import { ExportExceptionListRequestQueryInput } from '@kbn/securitysolution-exceptions-common/api/export_exception_list/export_exception_list.gen';
import { FindExceptionListItemsRequestQueryInput } from '@kbn/securitysolution-exceptions-common/api/find_exception_list_items/find_exception_list_items.gen';
import { FindExceptionListsRequestQueryInput } from '@kbn/securitysolution-exceptions-common/api/find_exception_lists/find_exception_lists.gen';
import { ImportExceptionListRequestQueryInput } from '@kbn/securitysolution-exceptions-common/api/import_exceptions/import_exceptions.gen';
import { ReadExceptionListRequestQueryInput } from '@kbn/securitysolution-exceptions-common/api/read_exception_list/read_exception_list.gen';
import { ReadExceptionListItemRequestQueryInput } from '@kbn/securitysolution-exceptions-common/api/read_exception_list_item/read_exception_list_item.gen';
import { ReadExceptionListSummaryRequestQueryInput } from '@kbn/securitysolution-exceptions-common/api/read_exception_list_summary/read_exception_list_summary.gen';
import { UpdateExceptionListRequestBodyInput } from '@kbn/securitysolution-exceptions-common/api/update_exception_list/update_exception_list.gen';
import { UpdateExceptionListItemRequestBodyInput } from '@kbn/securitysolution-exceptions-common/api/update_exception_list_item/update_exception_list_item.gen';
import { routeWithNamespace } from '../../common/utils/security_solution';
import { FtrProviderContext } from '../ftr_provider_context';

export function SecuritySolutionApiProvider({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');

  return {
    /**
      * An exception list groups exception items and can be associated with detection rules. You can assign exception lists to multiple detection rules.
> info
> All exception items added to the same list are evaluated using `OR` logic. That is, if any of the items in a list evaluate to `true`, the exception prevents the rule from generating an alert. Likewise, `OR` logic is used for evaluating exceptions when more than one exception list is assigned to a rule. To use the `AND` operator, you can define multiple clauses (`entries`) in a single exception item.

      */
    createExceptionList(props: CreateExceptionListProps, kibanaSpace: string = 'default') {
      return supertest
        .post(routeWithNamespace('/api/exception_lists', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .send(props.body as object);
    },
    /**
      * Create an exception item and associate it with the specified exception list.
> info
> Before creating exception items, you must create an exception list.

      */
    createExceptionListItem(props: CreateExceptionListItemProps, kibanaSpace: string = 'default') {
      return supertest
        .post(routeWithNamespace('/api/exception_lists/items', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .send(props.body as object);
    },
    /**
     * Create exception items that apply to a single detection rule.
     */
    createRuleExceptionListItems(
      props: CreateRuleExceptionListItemsProps,
      kibanaSpace: string = 'default'
    ) {
      return supertest
        .post(
          routeWithNamespace(
            replaceParams('/api/detection_engine/rules/{id}/exceptions', props.params),
            kibanaSpace
          )
        )
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .send(props.body as object);
    },
    /**
      * An exception list groups exception items and can be associated with detection rules. A shared exception list can apply to multiple detection rules.
> info
> All exception items added to the same list are evaluated using `OR` logic. That is, if any of the items in a list evaluate to `true`, the exception prevents the rule from generating an alert. Likewise, `OR` logic is used for evaluating exceptions when more than one exception list is assigned to a rule. To use the `AND` operator, you can define multiple clauses (`entries`) in a single exception item.

      */
    createSharedExceptionList(
      props: CreateSharedExceptionListProps,
      kibanaSpace: string = 'default'
    ) {
      return supertest
        .post(routeWithNamespace('/api/exceptions/shared', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .send(props.body as object);
    },
    /**
     * Delete an exception list using the `id` or `list_id` field.
     */
    deleteExceptionList(props: DeleteExceptionListProps, kibanaSpace: string = 'default') {
      return supertest
        .delete(routeWithNamespace('/api/exception_lists', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .query(props.query);
    },
    /**
     * Delete an exception list item using the `id` or `item_id` field.
     */
    deleteExceptionListItem(props: DeleteExceptionListItemProps, kibanaSpace: string = 'default') {
      return supertest
        .delete(routeWithNamespace('/api/exception_lists/items', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .query(props.query);
    },
    /**
     * Duplicate an existing exception list.
     */
    duplicateExceptionList(props: DuplicateExceptionListProps, kibanaSpace: string = 'default') {
      return supertest
        .post(routeWithNamespace('/api/exception_lists/_duplicate', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .query(props.query);
    },
    /**
     * Export an exception list and its associated items to an NDJSON file.
     */
    exportExceptionList(props: ExportExceptionListProps, kibanaSpace: string = 'default') {
      return supertest
        .post(routeWithNamespace('/api/exception_lists/_export', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .query(props.query);
    },
    /**
     * Get a list of all exception list items in the specified list.
     */
    findExceptionListItems(props: FindExceptionListItemsProps, kibanaSpace: string = 'default') {
      return supertest
        .get(routeWithNamespace('/api/exception_lists/items/_find', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .query(props.query);
    },
    /**
     * Get a list of all exception list containers.
     */
    findExceptionLists(props: FindExceptionListsProps, kibanaSpace: string = 'default') {
      return supertest
        .get(routeWithNamespace('/api/exception_lists/_find', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .query(props.query);
    },
    /**
     * Import an exception list and its associated items from an NDJSON file.
     */
    importExceptionList(props: ImportExceptionListProps, kibanaSpace: string = 'default') {
      return supertest
        .post(routeWithNamespace('/api/exception_lists/_import', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .query(props.query);
    },
    /**
     * Get the details of an exception list using the `id` or `list_id` field.
     */
    readExceptionList(props: ReadExceptionListProps, kibanaSpace: string = 'default') {
      return supertest
        .get(routeWithNamespace('/api/exception_lists', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .query(props.query);
    },
    /**
     * Get the details of an exception list item using the `id` or `item_id` field.
     */
    readExceptionListItem(props: ReadExceptionListItemProps, kibanaSpace: string = 'default') {
      return supertest
        .get(routeWithNamespace('/api/exception_lists/items', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .query(props.query);
    },
    /**
     * Get a summary of the specified exception list.
     */
    readExceptionListSummary(
      props: ReadExceptionListSummaryProps,
      kibanaSpace: string = 'default'
    ) {
      return supertest
        .get(routeWithNamespace('/api/exception_lists/summary', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .query(props.query);
    },
    /**
     * Update an exception list using the `id` or `list_id` field.
     */
    updateExceptionList(props: UpdateExceptionListProps, kibanaSpace: string = 'default') {
      return supertest
        .put(routeWithNamespace('/api/exception_lists', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .send(props.body as object);
    },
    /**
     * Update an exception list item using the `id` or `item_id` field.
     */
    updateExceptionListItem(props: UpdateExceptionListItemProps, kibanaSpace: string = 'default') {
      return supertest
        .put(routeWithNamespace('/api/exception_lists/items', kibanaSpace))
        .set('kbn-xsrf', 'true')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .send(props.body as object);
    },
  };
}

export interface CreateExceptionListProps {
  body: CreateExceptionListRequestBodyInput;
}
export interface CreateExceptionListItemProps {
  body: CreateExceptionListItemRequestBodyInput;
}
export interface CreateRuleExceptionListItemsProps {
  params: CreateRuleExceptionListItemsRequestParamsInput;
  body: CreateRuleExceptionListItemsRequestBodyInput;
}
export interface CreateSharedExceptionListProps {
  body: CreateSharedExceptionListRequestBodyInput;
}
export interface DeleteExceptionListProps {
  query: DeleteExceptionListRequestQueryInput;
}
export interface DeleteExceptionListItemProps {
  query: DeleteExceptionListItemRequestQueryInput;
}
export interface DuplicateExceptionListProps {
  query: DuplicateExceptionListRequestQueryInput;
}
export interface ExportExceptionListProps {
  query: ExportExceptionListRequestQueryInput;
}
export interface FindExceptionListItemsProps {
  query: FindExceptionListItemsRequestQueryInput;
}
export interface FindExceptionListsProps {
  query: FindExceptionListsRequestQueryInput;
}
export interface ImportExceptionListProps {
  query: ImportExceptionListRequestQueryInput;
}
export interface ReadExceptionListProps {
  query: ReadExceptionListRequestQueryInput;
}
export interface ReadExceptionListItemProps {
  query: ReadExceptionListItemRequestQueryInput;
}
export interface ReadExceptionListSummaryProps {
  query: ReadExceptionListSummaryRequestQueryInput;
}
export interface UpdateExceptionListProps {
  body: UpdateExceptionListRequestBodyInput;
}
export interface UpdateExceptionListItemProps {
  body: UpdateExceptionListItemRequestBodyInput;
}
