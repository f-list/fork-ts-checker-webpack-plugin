import os from 'os';
import { codeFrameColumns } from '@babel/code-frame';
import { Formatter } from './Formatter';
import { createBasicFormatter } from './BasicFormatter';
import { BabelCodeFrameOptions } from './types/babel__code-frame';

function createCodeFrameFormatter(options?: BabelCodeFrameOptions): Formatter {
  const basicFormatter = createBasicFormatter();

  return function codeFrameFormatter(issue) {
    let frame = '';
    if (issue.file && issue.location && issue.source) {
      frame = codeFrameColumns(issue.source, issue.location, {
        highlightCode: true,
        ...(options || {}),
      })
        .split('\n')
        .map((line) => '  ' + line)
        .join(os.EOL);
    }

    const lines = [basicFormatter(issue)];
    if (frame) {
      lines.push(frame);
    }

    return lines.join(os.EOL);
  };
}

export { createCodeFrameFormatter, BabelCodeFrameOptions };
