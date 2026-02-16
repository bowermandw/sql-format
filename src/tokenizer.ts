import { Token, TokenType } from './tokens';

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  function peek(offset = 0): string {
    return pos + offset < input.length ? input[pos + offset] : '';
  }

  function advance(): string {
    const ch = input[pos];
    pos++;
    if (ch === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
    return ch;
  }

  function makeToken(type: TokenType, value: string, startOffset: number, startLine: number, startCol: number): Token {
    return { type, value, offset: startOffset, line: startLine, col: startCol };
  }

  while (pos < input.length) {
    const startOffset = pos;
    const startLine = line;
    const startCol = col;
    const ch = peek();

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      let ws = '';
      while (pos < input.length && (peek() === ' ' || peek() === '\t' || peek() === '\r' || peek() === '\n')) {
        ws += advance();
      }
      tokens.push(makeToken(TokenType.Whitespace, ws, startOffset, startLine, startCol));
      continue;
    }

    // Line comment: -- ...
    if (ch === '-' && peek(1) === '-') {
      let comment = '';
      while (pos < input.length && peek() !== '\n') {
        comment += advance();
      }
      tokens.push(makeToken(TokenType.LineComment, comment, startOffset, startLine, startCol));
      continue;
    }

    // Block comment: /* ... */ (supports nesting)
    if (ch === '/' && peek(1) === '*') {
      let comment = '';
      let depth = 0;
      comment += advance(); // /
      comment += advance(); // *
      depth = 1;
      while (pos < input.length && depth > 0) {
        if (peek() === '/' && peek(1) === '*') {
          comment += advance();
          comment += advance();
          depth++;
        } else if (peek() === '*' && peek(1) === '/') {
          comment += advance();
          comment += advance();
          depth--;
        } else {
          comment += advance();
        }
      }
      tokens.push(makeToken(TokenType.BlockComment, comment, startOffset, startLine, startCol));
      continue;
    }

    // String literal: '...' or N'...'
    if (ch === '\'' || (ch.toUpperCase() === 'N' && peek(1) === '\'')) {
      let str = '';
      if (ch.toUpperCase() === 'N' && peek(1) === '\'') {
        str += advance(); // N
      }
      str += advance(); // opening '
      while (pos < input.length) {
        if (peek() === '\'') {
          str += advance();
          if (peek() === '\'') {
            // escaped quote ''
            str += advance();
          } else {
            break; // end of string
          }
        } else {
          str += advance();
        }
      }
      tokens.push(makeToken(TokenType.StringLiteral, str, startOffset, startLine, startCol));
      continue;
    }

    // Quoted identifier: [...]
    if (ch === '[') {
      let ident = '';
      ident += advance(); // [
      while (pos < input.length && peek() !== ']') {
        ident += advance();
      }
      if (pos < input.length) {
        ident += advance(); // ]
      }
      tokens.push(makeToken(TokenType.QuotedIdentifier, ident, startOffset, startLine, startCol));
      continue;
    }

    // Quoted identifier: "..."
    if (ch === '"') {
      let ident = '';
      ident += advance(); // opening "
      while (pos < input.length && peek() !== '"') {
        ident += advance();
      }
      if (pos < input.length) {
        ident += advance(); // closing "
      }
      tokens.push(makeToken(TokenType.QuotedIdentifier, ident, startOffset, startLine, startCol));
      continue;
    }

    // Number literal: digits, optional decimal, hex (0x...)
    if (isDigit(ch) || (ch === '.' && isDigit(peek(1)))) {
      let num = '';
      if (ch === '0' && (peek(1) === 'x' || peek(1) === 'X')) {
        num += advance(); // 0
        num += advance(); // x
        while (pos < input.length && isHexDigit(peek())) {
          num += advance();
        }
      } else {
        while (pos < input.length && isDigit(peek())) {
          num += advance();
        }
        if (peek() === '.' && isDigit(peek(1))) {
          num += advance(); // .
          while (pos < input.length && isDigit(peek())) {
            num += advance();
          }
        }
        // scientific notation
        if (peek() === 'e' || peek() === 'E') {
          num += advance();
          if (peek() === '+' || peek() === '-') {
            num += advance();
          }
          while (pos < input.length && isDigit(peek())) {
            num += advance();
          }
        }
      }
      tokens.push(makeToken(TokenType.NumberLiteral, num, startOffset, startLine, startCol));
      continue;
    }

    // Symbols
    if (ch === '(') { advance(); tokens.push(makeToken(TokenType.LeftParen, '(', startOffset, startLine, startCol)); continue; }
    if (ch === ')') { advance(); tokens.push(makeToken(TokenType.RightParen, ')', startOffset, startLine, startCol)); continue; }
    if (ch === ',') { advance(); tokens.push(makeToken(TokenType.Comma, ',', startOffset, startLine, startCol)); continue; }
    if (ch === ';') { advance(); tokens.push(makeToken(TokenType.Semicolon, ';', startOffset, startLine, startCol)); continue; }
    if (ch === '.') { advance(); tokens.push(makeToken(TokenType.Dot, '.', startOffset, startLine, startCol)); continue; }

    // Multi-char operators
    if (ch === '<') {
      advance();
      if (peek() === '=') { advance(); tokens.push(makeToken(TokenType.Operator, '<=', startOffset, startLine, startCol)); }
      else if (peek() === '>') { advance(); tokens.push(makeToken(TokenType.Operator, '<>', startOffset, startLine, startCol)); }
      else { tokens.push(makeToken(TokenType.Operator, '<', startOffset, startLine, startCol)); }
      continue;
    }
    if (ch === '>') {
      advance();
      if (peek() === '=') { advance(); tokens.push(makeToken(TokenType.Operator, '>=', startOffset, startLine, startCol)); }
      else { tokens.push(makeToken(TokenType.Operator, '>', startOffset, startLine, startCol)); }
      continue;
    }
    if (ch === '!') {
      advance();
      if (peek() === '=') { advance(); tokens.push(makeToken(TokenType.Operator, '!=', startOffset, startLine, startCol)); }
      else { tokens.push(makeToken(TokenType.Operator, '!', startOffset, startLine, startCol)); }
      continue;
    }
    if (ch === '=') {
      advance();
      tokens.push(makeToken(TokenType.Equals, '=', startOffset, startLine, startCol));
      continue;
    }
    if (ch === '+') {
      advance();
      if (peek() === '=') { advance(); tokens.push(makeToken(TokenType.Operator, '+=', startOffset, startLine, startCol)); }
      else { tokens.push(makeToken(TokenType.Operator, '+', startOffset, startLine, startCol)); }
      continue;
    }
    if (ch === '-') {
      advance();
      if (peek() === '=') { advance(); tokens.push(makeToken(TokenType.Operator, '-=', startOffset, startLine, startCol)); }
      else { tokens.push(makeToken(TokenType.Operator, '-', startOffset, startLine, startCol)); }
      continue;
    }
    if (ch === '*') {
      advance();
      tokens.push(makeToken(TokenType.Operator, '*', startOffset, startLine, startCol));
      continue;
    }
    if (ch === '/') {
      advance();
      tokens.push(makeToken(TokenType.Operator, '/', startOffset, startLine, startCol));
      continue;
    }
    if (ch === '%') {
      advance();
      tokens.push(makeToken(TokenType.Operator, '%', startOffset, startLine, startCol));
      continue;
    }

    // Words: identifiers, keywords, @variables, @@globals
    if (isWordStart(ch) || ch === '@' || ch === '#') {
      let word = '';
      // Handle @ and @@ prefixes
      if (ch === '@') {
        word += advance();
        if (peek() === '@') {
          word += advance();
        }
      }
      if (ch === '#') {
        word += advance();
        if (peek() === '#') {
          word += advance();
        }
      }
      while (pos < input.length && isWordChar(peek())) {
        word += advance();
      }

      // Check for GO batch separator: only if it's on its own on a line
      if (word.toUpperCase() === 'GO') {
        // Look back: must be start of line (only whitespace before on same line)
        const isStartOfLine = isBatchSeparator(tokens, startCol);
        // Look ahead: must be end of line (only whitespace/EOF after)
        const isEndOfLine = isLineEnd(input, pos);
        if (isStartOfLine && isEndOfLine) {
          tokens.push(makeToken(TokenType.BatchSeparator, word, startOffset, startLine, startCol));
          continue;
        }
      }

      tokens.push(makeToken(TokenType.Word, word, startOffset, startLine, startCol));
      continue;
    }

    // Unknown character — skip it
    advance();
  }

  tokens.push(makeToken(TokenType.EOF, '', pos, line, col));
  return tokens;
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isHexDigit(ch: string): boolean {
  return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}

function isWordStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isWordChar(ch: string): boolean {
  return isWordStart(ch) || isDigit(ch);
}

/** Check if the current position for GO is at the start of a line */
function isBatchSeparator(tokens: Token[], col: number): boolean {
  if (col === 1) return true;
  // Check if preceding token on same line is just whitespace that starts the line
  if (tokens.length === 0) return true;
  const prev = tokens[tokens.length - 1];
  if (prev.type === TokenType.Whitespace && prev.value.includes('\n')) return true;
  // If the only thing before us on this line is whitespace
  if (prev.type === TokenType.Whitespace && col <= prev.value.length + 1) return true;
  return false;
}

/** Check if the rest of the line is empty after current position */
function isLineEnd(input: string, pos: number): boolean {
  let i = pos;
  while (i < input.length && (input[i] === ' ' || input[i] === '\t')) {
    i++;
  }
  return i >= input.length || input[i] === '\n' || input[i] === '\r';
}

/**
 * Strip whitespace tokens and attach comments to subsequent non-whitespace tokens.
 * Returns a clean token stream for the parser.
 */
export function attachComments(tokens: Token[]): Token[] {
  const result: Token[] = [];
  const pendingComments: Token[] = [];
  let sawBlankLine = false;

  for (const tok of tokens) {
    if (tok.type === TokenType.Whitespace) {
      // Detect blank lines: two or more newlines in whitespace
      const newlineCount = (tok.value.match(/\n/g) || []).length;
      if (newlineCount >= 2) {
        sawBlankLine = true;
      }
      continue;
    }
    if (tok.type === TokenType.LineComment || tok.type === TokenType.BlockComment) {
      // Check if this comment is on the same line as the previous non-whitespace token
      if (result.length > 0) {
        const prev = result[result.length - 1];
        if (tok.line === prev.line) {
          prev.trailingComment = tok;
          continue;
        }
      }
      pendingComments.push(tok);
      continue;
    }
    // For EOF tokens, don't consume pending comments as leading comments;
    // instead, let them be handled as trailing comments below
    if (tok.type === TokenType.EOF) {
      result.push(tok);
      continue;
    }
    if (pendingComments.length > 0) {
      tok.leadingComments = [...pendingComments];
      pendingComments.length = 0;
    }
    if (sawBlankLine) {
      tok.precedingBlankLine = true;
      sawBlankLine = false;
    }
    result.push(tok);
  }

  // If there are trailing comments with no subsequent non-EOF token,
  // attach them as trailingComments on the last meaningful token
  // AND on the EOF token (so the parser can always find them)
  if (pendingComments.length > 0 && result.length > 0) {
    let lastIdx = result.length - 1;
    // Skip past EOF token to find the real last token
    if (result[lastIdx].type === TokenType.EOF && lastIdx > 0) {
      lastIdx--;
    }
    const last = result[lastIdx];
    if (!last.trailingComments) last.trailingComments = [];
    last.trailingComments.push(...pendingComments);

    // Also put on EOF so the parser can find them regardless
    const eof = result[result.length - 1];
    if (eof.type === TokenType.EOF && eof !== last) {
      if (!eof.trailingComments) eof.trailingComments = [];
      eof.trailingComments.push(...pendingComments);
    }
  }

  return result;
}
