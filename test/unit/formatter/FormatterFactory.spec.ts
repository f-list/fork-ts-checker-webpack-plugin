import * as os from 'os';
import { Issue } from 'lib/issue';
import { createFormatter, FormatterType } from 'lib/formatter';

describe('formatter/FormatterFactory', () => {
  const issue: Issue = {
    origin: 'typescript',
    severity: 'error',
    code: 'TS123',
    message: 'Some issue content',
    file: 'some/file.ts',
    source: [
      'class SomeClass {',
      '  private someProperty: boolean;',
      '  constructor() {',
      "    console.log('anything special');",
      '  }',
      '}',
    ].join('\n'),
    location: {
      start: {
        line: 1,
        column: 7,
      },
      end: {
        line: 1,
        column: 16,
      },
    },
  };

  it.each(['basic', undefined])('creates basic formatter', (type) => {
    const formatter = createFormatter(type as FormatterType);
    const formattedMessage = formatter(issue);

    expect(formattedMessage).toEqual('TS123: Some issue content');
  });

  it('creates codeframe formatter', () => {
    const formatter = createFormatter('codeframe');
    const formattedMessage = formatter(issue);

    expect(formattedMessage).toEqual(
      [
        'TS123: Some issue content',
        '  > 1 | class SomeClass {',
        '      |       ^^^^^^^^^',
        '    2 |   private someProperty: boolean;',
        '    3 |   constructor() {',
        "    4 |     console.log('anything special');",
      ].join(os.EOL)
    );
  });

  it('creates codeframe formatter with custom options', () => {
    const formatter = createFormatter('codeframe', {
      linesAbove: 1,
      linesBelow: 1,
    });
    const formattedMessage = formatter(issue);

    expect(formattedMessage).toEqual(
      [
        'TS123: Some issue content',
        '  > 1 | class SomeClass {',
        '      |       ^^^^^^^^^',
        '    2 |   private someProperty: boolean;',
      ].join(os.EOL)
    );
  });

  it('throws an error on unknown formatter type', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createFormatter('unknown-type' as any)).toThrowError(
      `Unknown "unknown-type" formatter. Available types are: basic, codeframe.`
    );
  });
});
