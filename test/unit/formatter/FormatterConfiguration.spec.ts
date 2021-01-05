import os from 'os';
import { Issue } from 'lib/issue';
import { createFormatterConfiguration, FormatterOptions } from 'lib/formatter';

describe('formatter/FormatterConfiguration', () => {
  const issue: Issue = {
    origin: 'typescript',
    severity: 'error',
    code: 'TS2322',
    message: `Type '"1"' is not assignable to type 'number'.`,
    file: 'src/index.ts',
    source: [
      'const foo: number = "1";',
      'const bar = 1;',
      '',
      'function baz() {',
      '  console.log(baz);',
      '}',
    ].join('\n'),
    location: {
      start: {
        line: 1,
        column: 7,
      },
      end: {
        line: 1,
        column: 10,
      },
    },
  };

  const BASIC_FORMATTER_OUTPUT = `TS2322: Type '"1"' is not assignable to type 'number'.`;
  const CODEFRAME_FORMATTER_OUTPUT = [
    BASIC_FORMATTER_OUTPUT,
    '  > 1 | const foo: number = "1";',
    '      |       ^^^',
    '    2 | const bar = 1;',
    '    3 | ',
    '    4 | function baz() {',
  ].join(os.EOL);
  const CUSTOM_CODEFRAME_FORMATTER_OUTPUT = [
    BASIC_FORMATTER_OUTPUT,
    '  > 1 | const foo: number = "1";',
    '      |       ^^^',
    '    2 | const bar = 1;',
  ].join(os.EOL);

  it.each([
    [undefined, CODEFRAME_FORMATTER_OUTPUT],
    ['basic', BASIC_FORMATTER_OUTPUT],
    ['codeframe', CODEFRAME_FORMATTER_OUTPUT],
    [{ type: 'basic' }, BASIC_FORMATTER_OUTPUT],
    [{ type: 'codeframe' }, CODEFRAME_FORMATTER_OUTPUT],
    [{ type: 'codeframe', options: { linesBelow: 1 } }, CUSTOM_CODEFRAME_FORMATTER_OUTPUT],
  ])('creates configuration from options', (options, expectedFormat) => {
    const formatter = createFormatterConfiguration(options as FormatterOptions);

    expect(formatter(issue)).toEqual(expectedFormat);
  });
});
