import { Issue, IssueLocation } from '../../issue';
import { LintMessage, LintResult } from '../types/eslint';
import fs from 'fs-extra';

function createIssueFromEsLintMessage(
  filePath: string,
  message: LintMessage,
  loadSource: boolean
): Issue {
  let location: IssueLocation | undefined;

  if (message.line) {
    location = {
      start: {
        line: message.line,
        column: message.column,
      },
      end: {
        line: message.endLine || message.line,
        column: message.endColumn || message.column,
      },
    };
  }

  return {
    origin: 'eslint',
    code: message.ruleId ? String(message.ruleId) : '[unknown]',
    severity: message.severity === 1 ? 'warning' : 'error',
    message: message.message,
    file: filePath,
    source:
      (loadSource && filePath && fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf-8')) ||
      '',
    location,
  };
}

function createIssuesFromEsLintResults(results: LintResult[], loadSource = true): Issue[] {
  return results.reduce<Issue[]>(
    (messages, result) => [
      ...messages,
      ...result.messages.map((message) =>
        createIssueFromEsLintMessage(result.filePath, message, loadSource)
      ),
    ],
    []
  );
}

export { createIssuesFromEsLintResults };
