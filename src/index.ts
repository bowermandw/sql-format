import * as fs from 'fs';
import * as path from 'path';
import { tokenize, attachComments } from './tokenizer';
import { parse } from './parser';
import { format } from './formatter';
import { loadConfig, DEFAULT_CONFIG, FormatConfig } from './config';

function printUsage(): void {
  console.log(`Usage: sql-format [options] <input.sql>

Options:
  --style <file>                          Path to a JSON style configuration file
  --enclose-identifiers <mode>            withBrackets | withoutBrackets | asis
  --enclose-datatypes <mode>              withBrackets | withoutBrackets | asis
  --insert-semicolons                     Insert semicolons after each statement
  --line-ending <lf|crlf>                 Line ending style (default: lf)
  --tokens                                Print token list (debug mode)
  --ast                                   Print AST as JSON (debug mode)
  --help                                  Show this help message

Examples:
  sql-format --style style1.json input.sql
  sql-format input.sql                       # uses default formatting
  cat input.sql | sql-format --style s.json  # reads from stdin`);
}

function main(): void {
  const args = process.argv.slice(2);
  let stylePath: string | undefined;
  let inputPath: string | undefined;
  let encloseIdentifiers: string | undefined;
  let encloseDataTypes: string | undefined;
  let insertSemicolons = false;
  let lineEnding: string | undefined;
  let debugTokens = false;
  let debugAst = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--style' || arg === '-s') {
      stylePath = args[++i];
    } else if (arg === '--enclose-identifiers') {
      encloseIdentifiers = args[++i];
    } else if (arg === '--enclose-datatypes') {
      encloseDataTypes = args[++i];
    } else if (arg === '--insert-semicolons') {
      insertSemicolons = true;
    } else if (arg === '--line-ending') {
      lineEnding = args[++i];
    } else if (arg === '--tokens') {
      debugTokens = true;
    } else if (arg === '--ast') {
      debugAst = true;
    } else if (!arg.startsWith('-')) {
      inputPath = arg;
    }
  }

  // Read input
  let input: string;
  if (inputPath) {
    const resolved = path.resolve(inputPath);
    if (!fs.existsSync(resolved)) {
      console.error(`Error: file not found: ${resolved}`);
      process.exit(1);
    }
    input = readFileWithEncoding(resolved);
  } else {
    // Read from stdin
    input = fs.readFileSync(0, 'utf-8');
  }

  // Load config
  let config: FormatConfig = DEFAULT_CONFIG;
  if (stylePath) {
    const resolved = path.resolve(stylePath);
    if (!fs.existsSync(resolved)) {
      console.error(`Error: style file not found: ${resolved}`);
      process.exit(1);
    }
    config = loadConfig(resolved);
  }

  // Apply CLI overrides
  if (encloseIdentifiers) {
    if (!['withBrackets', 'withoutBrackets', 'asis'].includes(encloseIdentifiers)) {
      console.error(`Error: --enclose-identifiers must be withBrackets, withoutBrackets, or asis`);
      process.exit(1);
    }
    config = {
      ...config,
      identifiers: {
        ...config.identifiers,
        encloseIdentifiers: encloseIdentifiers as 'withBrackets' | 'withoutBrackets' | 'asis',
      },
    };
  }
  if (encloseDataTypes) {
    if (!['withBrackets', 'withoutBrackets', 'asis'].includes(encloseDataTypes)) {
      console.error(`Error: --enclose-datatypes must be withBrackets, withoutBrackets, or asis`);
      process.exit(1);
    }
    config = {
      ...config,
      dataTypes: {
        ...config.dataTypes,
        encloseDataTypes: encloseDataTypes as 'withBrackets' | 'withoutBrackets' | 'asis',
      },
    };
  }
  if (insertSemicolons) {
    config = {
      ...config,
      whitespace: {
        ...config.whitespace,
        insertSemicolons: 'insert',
      },
    };
  }
  if (lineEnding) {
    if (!['lf', 'crlf'].includes(lineEnding)) {
      console.error(`Error: --line-ending must be lf or crlf`);
      process.exit(1);
    }
    config = {
      ...config,
      whitespace: {
        ...config.whitespace,
        lineEnding: lineEnding as 'lf' | 'crlf',
      },
    };
  }

  // Tokenize
  const rawTokens = tokenize(input);

  if (debugTokens) {
    for (const tok of rawTokens) {
      console.log(`${tok.line}:${tok.col} ${tok.type} ${JSON.stringify(tok.value)}`);
    }
    return;
  }

  // Strip whitespace and attach comments
  const tokens = attachComments(rawTokens);

  // Parse
  const ast = parse(tokens);

  if (debugAst) {
    console.log(JSON.stringify(ast, null, 2));
    return;
  }

  // Format
  const output = format(ast, config);
  process.stdout.write(output);
}

/** Read a file, detecting UTF-16 LE/BE via BOM and falling back to UTF-8. */
function readFileWithEncoding(filePath: string): string {
  const buf = fs.readFileSync(filePath);

  // UTF-16 LE BOM: 0xFF 0xFE
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le').slice(1); // skip BOM
  }

  // UTF-16 BE BOM: 0xFE 0xFF
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    // Node doesn't have utf16be, swap bytes then use utf16le
    for (let i = 0; i < buf.length - 1; i += 2) {
      const tmp = buf[i];
      buf[i] = buf[i + 1];
      buf[i + 1] = tmp;
    }
    return buf.toString('utf16le').slice(1); // skip BOM
  }

  let str = buf.toString('utf-8');

  // Strip UTF-8 BOM if present
  if (str.charCodeAt(0) === 0xFEFF) {
    str = str.slice(1);
  }

  return str;
}

main();
