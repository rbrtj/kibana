/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { CommandSuggestParams } from '../../../definitions/types';
import { getLastNonWhitespaceChar, isColumnItem } from '../../../shared/helpers';
import type { SuggestionRawDefinition } from '../../types';
import { commaCompleteItem, pipeCompleteItem } from '../../complete_items';
import { handleFragment } from '../../helper';
import { TRIGGER_SUGGESTION_COMMAND } from '../../factories';

export async function suggest({
  innerText,
  getColumnsByType,
  command,
  columnExists,
}: CommandSuggestParams<'drop'>): Promise<SuggestionRawDefinition[]> {
  if (
    /\s/.test(innerText[innerText.length - 1]) &&
    getLastNonWhitespaceChar(innerText) !== ',' &&
    !/drop\s+\S*$/i.test(innerText)
  ) {
    return [pipeCompleteItem, commaCompleteItem];
  }

  const alreadyDeclaredFields = command.args.filter(isColumnItem).map((arg) => arg.name);
  const fieldSuggestions = await getColumnsByType('any', alreadyDeclaredFields);

  return handleFragment(
    innerText,
    (fragment) => columnExists(fragment),
    (_fragment: string, rangeToReplace?: { start: number; end: number }) => {
      // KEEP fie<suggest>
      return fieldSuggestions.map((suggestion) => {
        // if there is already a command, we don't want to override it
        if (suggestion.command) return suggestion;
        return {
          ...suggestion,
          text: suggestion.text,
          command: TRIGGER_SUGGESTION_COMMAND,
          rangeToReplace,
        };
      });
    },
    (fragment: string, rangeToReplace: { start: number; end: number }) => {
      // KEEP field<suggest>
      const finalSuggestions = [{ ...pipeCompleteItem, text: ' | ' }];
      if (fieldSuggestions.length > 0) finalSuggestions.push({ ...commaCompleteItem, text: ', ' });

      return finalSuggestions.map<SuggestionRawDefinition>((s) => ({
        ...s,
        filterText: fragment,
        text: fragment + s.text,
        command: TRIGGER_SUGGESTION_COMMAND,
        rangeToReplace,
      }));
    }
  );
}
