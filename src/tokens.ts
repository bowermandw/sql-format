export enum TokenType {
  // Literals & identifiers
  Word,              // keywords, identifiers, unquoted names
  QuotedIdentifier,  // [bracketed] or "double-quoted"
  StringLiteral,     // 'single-quoted string', N'unicode string'
  NumberLiteral,     // 123, 12.5, 0x1F

  // Symbols
  LeftParen,
  RightParen,
  Comma,
  Semicolon,
  Dot,
  Equals,
  Operator,          // <, >, <=, >=, <>, !=, +, -, *, /, %

  // Comments (preserved verbatim)
  LineComment,       // -- ...
  BlockComment,      // /* ... */

  // Whitespace
  Whitespace,

  // Special
  BatchSeparator,    // GO
  EOF,
}

export interface Token {
  type: TokenType;
  value: string;
  /** 0-based offset in source */
  offset: number;
  /** 1-based line number */
  line: number;
  /** 1-based column number */
  col: number;
  /** Leading comments attached to this token (filled after whitespace stripping) */
  leadingComments?: Token[];
  /** Trailing inline comment on same line */
  trailingComment?: Token;
  /** Whether a blank line preceded this token in the original source */
  precedingBlankLine?: boolean;
}
