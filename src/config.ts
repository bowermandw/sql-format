import * as fs from 'fs';

export type CaseOption = 'asis' | 'lowercase' | 'uppercase' | 'lowerCamelCase' | 'upperCamelCase';
export type PlaceOnNewLine = 'always' | 'never' | 'onlyIfSubsequentItems' | 'ifSeveralItems' | 'ifLongerThanMaxLineLength' | 'ifLongerThanWrapColumn' | 'ifLongerOrMultipleColumns' | 'ifMoreValues' | 'ifSeveralTables' | 'ifSeveralConditions' | 'ifSeveralExpressions';
export type ParenthesisStyle = 'expandedToStatement' | 'compactToStatement' | 'expandedToParenthesis' | 'compactToParenthesis';
export type AndOrAlignment = 'toStatement' | 'rightAligned' | 'toFirstListItem' | 'indented';

export interface FormatConfig {
  metadata?: { id: string; name: string };
  whitespace: {
    tabBehavior: 'onlySpaces' | 'onlyTabs' | 'tabsWherePossible';
    numberOfSpacesInTab: number;
    wrapLongLines: boolean;
    wrapLinesLongerThan: number;
    whitespaceBeforeSemicolon: 'none' | 'spaceBefore' | 'newLineBefore';
    insertSemicolons: 'insert' | 'remove' | 'asis';
    newLines: {
      preserveExistingEmptyLinesBetweenStatements: boolean;
      emptyLinesBetweenStatements: number;
      emptyLinesAfterBatchSeparator: number;
      preserveExistingEmptyLinesAfterBatchSeparator: boolean;
      preserveExistingEmptyLinesWithinStatements: boolean;
    };
  };
  lists: {
    placeFirstItemOnNewLine: 'always' | 'never' | 'onlyIfSubsequentItems';
    placeSubsequentItemsOnNewLines: 'always' | 'never' | 'ifLongerThanWrapColumn';
    alignSubsequentItemsWithFirstItem: boolean;
    alignItemsAcrossClauses: boolean;
    indentListItems: boolean;
    alignItemsToTabStops: boolean;
    alignAliases: boolean;
    alignComments: boolean;
    commas: {
      placeCommasBeforeItems: boolean;
      commaAlignment: 'beforeItem' | 'toList' | 'toStatement';
      addSpaceBeforeComma: boolean;
      addSpaceAfterComma: boolean;
    };
  };
  parentheses: {
    parenthesisStyle: ParenthesisStyle;
    indentParenthesesContents: boolean;
    collapseShortParenthesisContents: boolean;
    collapseParenthesesShorterThan: number;
    addSpacesAroundParentheses: boolean;
    addSpacesAroundParenthesesContents: boolean;
  };
  casing: {
    reservedKeywords: CaseOption;
    builtInFunctions: CaseOption;
    builtInDataTypes: CaseOption;
    globalVariables: CaseOption;
    useObjectDefinitionCase: boolean;
  };
  identifiers: {
    encloseIdentifiers: 'asis' | 'withBrackets' | 'withoutBrackets';
    encloseIdentifiersScope: 'all' | 'userDefined' | 'tablesAndColumns';
    alwaysBracketReservedWordIdentifiers: boolean;
  };
  dataTypes: {
    encloseDataTypes: 'asis' | 'withBrackets' | 'withoutBrackets';
  };
  dml: {
    clauseAlignment: 'toStatement' | 'rightAlignedToStatement' | 'toFirstStatement';
    clauseIndentation: number;
    placeDistinctAndTopClausesOnNewLine: boolean;
    addNewLineAfterDistinctAndTopClauses: boolean;
    collapseShortStatements: boolean;
    collapseStatementsShorterThan: number;
    collapseShortSubqueries: boolean;
    collapseSubqueriesShorterThan: number;
    listItems: {
      placeFromTableOnNewLine: string;
      placeWhereConditionOnNewLine: string;
      placeGroupByAndOrderByOnNewLine: string;
      placeInsertTableOnNewLine: boolean;
    };
  };
  ddl: {
    parenthesisStyle: ParenthesisStyle;
    indentParenthesesContents: boolean;
    alignDataTypesAndConstraints: boolean;
    placeConstraintsOnNewLines: boolean;
    placeConstraintColumnsOnNewLines: string;
    indentClauses: boolean;
    placeFirstProcedureParameterOnNewLine: string;
    collapseShortStatements: boolean;
    collapseStatementsShorterThan: number;
  };
  controlFlow: {
    placeBeginKeywordOnNewLine: boolean;
    indentBeginEndKeywords: boolean;
    indentContentsOfStatements: boolean;
    collapseShortStatements: boolean;
    collapseStatementsShorterThan: number;
  };
  cte: {
    placeNameOnNewLine: boolean;
    indentName: boolean;
    placeColumnsOnNewLine: boolean;
    columnAlignment: boolean;
    placeAsOnNewLine: boolean;
    asAlignment: string;
    parenthesisStyle: ParenthesisStyle;
    indentContents: boolean;
  };
  variables: {
    alignDataTypesAndValues: boolean;
    addSpaceBetweenDataTypeAndPrecision: boolean;
    placeAssignedValueOnNewLineIfLongerThanMaxLineLength: boolean;
    placeEqualsSignOnNewLine: boolean;
  };
  joinStatements: {
    join: {
      placeOnNewLine: boolean;
      keywordAlignment: string;
      insertEmptyLineBetweenJoinClauses: boolean;
      placeJoinTableOnNewLine: boolean;
      indentJoinTable: boolean;
    };
    on: {
      placeOnNewLine: boolean;
      keywordAlignment: string;
      placeConditionOnNewLine: boolean;
      conditionAlignment: string;
    };
  };
  insertStatements: {
    columnList: {
      parenthesisStyle: ParenthesisStyle;
      indentContents: boolean;
      placeSubsequentColumnsOnNewLines: string;
    };
    values: {
      parenthesisStyle: ParenthesisStyle;
      indentContents: boolean;
      placeSubsequentValuesOnNewLines: string;
    };
  };
  caseExpressions: {
    placeExpressionOnNewLine: boolean;
    placeFirstWhenOnNewLine: string;
    whenAlignment: string;
    placeThenOnNewLine: boolean;
    thenAlignment: string;
    placeElseOnNewLine: boolean;
    alignElseToWhen: boolean;
    placeEndOnNewLine: boolean;
    endAlignment: string;
    collapseShortCaseExpressions: boolean;
    collapseCaseExpressionsShorterThan: number;
  };
  operators: {
    comparison: {
      align: boolean;
      addSpacesAroundComparisonOperators: boolean;
      addSpacesAroundArithmeticOperators: boolean;
    };
    andOr: {
      placeOnNewLine: string;
      alignment: AndOrAlignment;
      placeBeforeCondition: boolean;
    };
    between: {
      placeOnNewLine: boolean;
      placeAndKeywordOnNewLine: boolean;
      andAlignment: string;
    };
    in: {
      placeOpeningParenthesisOnNewLine: boolean;
      openingParenthesisAlignment: string;
      placeFirstValueOnNewLine: string;
      placeSubsequentValuesOnNewLines: string;
      addSpaceAroundInContents: boolean;
    };
  };
}

export const DEFAULT_CONFIG: FormatConfig = {
  whitespace: {
    tabBehavior: 'onlySpaces',
    numberOfSpacesInTab: 4,
    wrapLongLines: true,
    wrapLinesLongerThan: 120,
    whitespaceBeforeSemicolon: 'none',
    insertSemicolons: 'asis',
    newLines: {
      preserveExistingEmptyLinesBetweenStatements: true,
      emptyLinesBetweenStatements: 1,
      emptyLinesAfterBatchSeparator: 1,
      preserveExistingEmptyLinesAfterBatchSeparator: true,
      preserveExistingEmptyLinesWithinStatements: true,
    },
  },
  lists: {
    placeFirstItemOnNewLine: 'never',
    placeSubsequentItemsOnNewLines: 'always',
    alignSubsequentItemsWithFirstItem: false,
    alignItemsAcrossClauses: false,
    indentListItems: true,
    alignItemsToTabStops: false,
    alignAliases: false,
    alignComments: false,
    commas: {
      placeCommasBeforeItems: false,
      commaAlignment: 'beforeItem',
      addSpaceBeforeComma: false,
      addSpaceAfterComma: true,
    },
  },
  parentheses: {
    parenthesisStyle: 'expandedToStatement',
    indentParenthesesContents: true,
    collapseShortParenthesisContents: true,
    collapseParenthesesShorterThan: 78,
    addSpacesAroundParentheses: false,
    addSpacesAroundParenthesesContents: false,
  },
  casing: {
    reservedKeywords: 'uppercase',
    builtInFunctions: 'uppercase',
    builtInDataTypes: 'uppercase',
    globalVariables: 'uppercase',
    useObjectDefinitionCase: true,
  },
  identifiers: {
    encloseIdentifiers: 'asis',
    encloseIdentifiersScope: 'userDefined',
    alwaysBracketReservedWordIdentifiers: true,
  },
  dataTypes: {
    encloseDataTypes: 'asis',
  },
  dml: {
    clauseAlignment: 'toStatement',
    clauseIndentation: 4,
    placeDistinctAndTopClausesOnNewLine: false,
    addNewLineAfterDistinctAndTopClauses: false,
    collapseShortStatements: true,
    collapseStatementsShorterThan: 78,
    collapseShortSubqueries: true,
    collapseSubqueriesShorterThan: 78,
    listItems: {
      placeFromTableOnNewLine: 'always',
      placeWhereConditionOnNewLine: 'always',
      placeGroupByAndOrderByOnNewLine: 'always',
      placeInsertTableOnNewLine: false,
    },
  },
  ddl: {
    parenthesisStyle: 'expandedToStatement',
    indentParenthesesContents: true,
    alignDataTypesAndConstraints: false,
    placeConstraintsOnNewLines: true,
    placeConstraintColumnsOnNewLines: 'always',
    indentClauses: true,
    placeFirstProcedureParameterOnNewLine: 'always',
    collapseShortStatements: true,
    collapseStatementsShorterThan: 78,
  },
  controlFlow: {
    placeBeginKeywordOnNewLine: true,
    indentBeginEndKeywords: false,
    indentContentsOfStatements: true,
    collapseShortStatements: true,
    collapseStatementsShorterThan: 78,
  },
  cte: {
    placeNameOnNewLine: false,
    indentName: false,
    placeColumnsOnNewLine: false,
    columnAlignment: false,
    placeAsOnNewLine: false,
    asAlignment: 'leftAlignedToWith',
    parenthesisStyle: 'expandedToStatement',
    indentContents: true,
  },
  variables: {
    alignDataTypesAndValues: false,
    addSpaceBetweenDataTypeAndPrecision: false,
    placeAssignedValueOnNewLineIfLongerThanMaxLineLength: false,
    placeEqualsSignOnNewLine: false,
  },
  joinStatements: {
    join: {
      placeOnNewLine: true,
      keywordAlignment: 'toFrom',
      insertEmptyLineBetweenJoinClauses: false,
      placeJoinTableOnNewLine: false,
      indentJoinTable: false,
    },
    on: {
      placeOnNewLine: true,
      keywordAlignment: 'indented',
      placeConditionOnNewLine: false,
      conditionAlignment: 'indented',
    },
  },
  insertStatements: {
    columnList: {
      parenthesisStyle: 'expandedToStatement',
      indentContents: true,
      placeSubsequentColumnsOnNewLines: 'always',
    },
    values: {
      parenthesisStyle: 'expandedToStatement',
      indentContents: true,
      placeSubsequentValuesOnNewLines: 'ifLongerThanMaxLineLength',
    },
  },
  caseExpressions: {
    placeExpressionOnNewLine: false,
    placeFirstWhenOnNewLine: 'always',
    whenAlignment: 'indentedFromCase',
    placeThenOnNewLine: false,
    thenAlignment: 'toWhen',
    placeElseOnNewLine: true,
    alignElseToWhen: true,
    placeEndOnNewLine: true,
    endAlignment: 'toCase',
    collapseShortCaseExpressions: true,
    collapseCaseExpressionsShorterThan: 78,
  },
  operators: {
    comparison: {
      align: false,
      addSpacesAroundComparisonOperators: true,
      addSpacesAroundArithmeticOperators: true,
    },
    andOr: {
      placeOnNewLine: 'always',
      alignment: 'indented',
      placeBeforeCondition: true,
    },
    between: {
      placeOnNewLine: false,
      placeAndKeywordOnNewLine: false,
      andAlignment: 'toBetween',
    },
    in: {
      placeOpeningParenthesisOnNewLine: false,
      openingParenthesisAlignment: 'indented',
      placeFirstValueOnNewLine: 'never',
      placeSubsequentValuesOnNewLines: 'never',
      addSpaceAroundInContents: false,
    },
  },
};

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function loadConfig(filePath: string): FormatConfig {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const userConfig = JSON.parse(raw);

  // Handle flat-level fields from older style files (e.g., placeCommasBeforeItems at lists level)
  if (userConfig.lists) {
    if ('placeCommasBeforeItems' in userConfig.lists && !userConfig.lists.commas) {
      userConfig.lists.commas = { placeCommasBeforeItems: userConfig.lists.placeCommasBeforeItems };
      delete userConfig.lists.placeCommasBeforeItems;
    }
  }

  return deepMerge(DEFAULT_CONFIG, userConfig);
}
