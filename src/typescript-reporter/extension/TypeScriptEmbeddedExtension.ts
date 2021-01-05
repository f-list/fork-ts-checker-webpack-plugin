import * as ts from 'typescript';
import { extname } from 'path';
import { TypeScriptExtension } from './TypeScriptExtension';
import { Issue } from '../../issue';
import { Dependencies } from '../../reporter';

interface TypeScriptEmbeddedSource {
  sourceText: string;
  extension: '.ts' | '.tsx' | '.js';
  realEnd?: number;
}

interface TypeScriptEmbeddedExtensionHost {
  embeddedExtensions: string[];
  getEmbeddedSource(fileName: string): TypeScriptEmbeddedSource | undefined;
}

type ExtendedSource = ts.SourceFile & { realEnd?: number };

function setupSourceFile(file: ExtendedSource) {
  if (!file.fileName.endsWith('.vue.ts') || file.realEnd !== undefined) return;

  function iterate(node: ts.Node, assertions: ts.Expression[]) {
    if (ts.isConditionalExpression(node)) {
      iterate(node.whenTrue, assertions.concat(node.condition));
      iterate(node.whenFalse, assertions.concat(ts.createLogicalNot(node.condition)));
      return;
    }
    if ((ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && assertions.length) {
      const cond = ts.createIf(
        ts.createLogicalNot(
          assertions
            .map((x) => JSON.parse(JSON.stringify(x)))
            .reduce((x, y) =>
              ts.createBinary(x, ts.createToken(ts.SyntaxKind.AmpersandAmpersandToken), y)
            )
        ),
        ts.createThrow(ts.createLiteral(''))
      );
      if (ts.isBlock(node.body))
        ((node.body.statements as unknown) as ts.Statement[]).unshift(cond);
      else node.body = ts.createBlock([cond, ts.createReturn(node.body)]);
    }
    ts.forEachChild(node, (x) => iterate(x, assertions));
  }
  ts.forEachChild(
    file,
    (x) => ts.isFunctionDeclaration(x) && x.name?.escapedText === 'render' && iterate(x, [])
  );
}

/**
 * It handles most of the logic required to process embedded TypeScript code (like in Vue components or MDX)
 *
 * @param embeddedExtensions List of file extensions that should be treated as an embedded TypeScript source
 *                           (for example ['.vue'])
 * @param getEmbeddedSource  Function that returns embedded TypeScript source text and extension that this file
 *                           would have if it would be a regular TypeScript file
 */
function createTypeScriptEmbeddedExtension({
  embeddedExtensions,
  getEmbeddedSource,
}: TypeScriptEmbeddedExtensionHost): TypeScriptExtension {
  const embeddedSourceCache = new Map<string, TypeScriptEmbeddedSource | undefined>();

  function getCachedEmbeddedSource(fileName: string) {
    if (!embeddedSourceCache.has(fileName)) {
      embeddedSourceCache.set(fileName, getEmbeddedSource(fileName));
    }

    return embeddedSourceCache.get(fileName);
  }

  function parsePotentiallyEmbeddedFileName(fileName: string) {
    const extension = extname(fileName);
    const embeddedFileName = fileName.slice(0, fileName.length - extension.length);
    const embeddedExtension = extname(embeddedFileName);

    return {
      extension,
      embeddedFileName,
      embeddedExtension,
    };
  }

  type FileExists = (fileName: string) => boolean;
  function createEmbeddedFileExists(fileExists: FileExists): FileExists {
    return function embeddedFileExists(fileName) {
      const { embeddedExtension, embeddedFileName, extension } = parsePotentiallyEmbeddedFileName(
        fileName
      );

      if (embeddedExtensions.includes(embeddedExtension) && fileExists(embeddedFileName)) {
        const embeddedSource = getCachedEmbeddedSource(embeddedFileName);
        return !!(embeddedSource && embeddedSource.extension === extension);
      }

      return fileExists(fileName);
    };
  }

  type ReadFile = (fileName: string, encoding?: string) => string | undefined;
  function createEmbeddedReadFile(readFile: ReadFile): ReadFile {
    return function embeddedReadFile(fileName, encoding) {
      const { embeddedExtension, embeddedFileName, extension } = parsePotentiallyEmbeddedFileName(
        fileName
      );

      if (embeddedExtensions.includes(embeddedExtension)) {
        const embeddedSource = getCachedEmbeddedSource(embeddedFileName);

        if (embeddedSource && embeddedSource.extension === extension) {
          return embeddedSource.sourceText;
        }
      }

      return readFile(fileName, encoding);
    };
  }

  type GetSourceFile<T extends unknown[]> = (x: string, ...args: T) => ts.SourceFile | undefined;
  function createEmbeddedGetSourceFile<T extends unknown[]>(
    getSourceFile: GetSourceFile<T>
  ): GetSourceFile<T> {
    return function embeddedGetSourceFile(fileName: string, ...args) {
      const source = getSourceFile(fileName, ...args) as ExtendedSource;
      if (!source) return source;
      const { embeddedExtension, embeddedFileName, extension } = parsePotentiallyEmbeddedFileName(
        fileName
      );

      if (embeddedExtensions.includes(embeddedExtension)) {
        const embeddedSource = getCachedEmbeddedSource(embeddedFileName);

        if (embeddedSource && embeddedSource.extension === extension) {
          if (embeddedSource.realEnd !== undefined) {
            setupSourceFile(source);
          }
          source.realEnd = embeddedSource.realEnd;
        }
      }
      return source;
    };
  }

  return {
    extendIssues(issues: Issue[]): Issue[] {
      return issues.map((issue) => {
        if (issue.file) {
          const { embeddedExtension, embeddedFileName } = parsePotentiallyEmbeddedFileName(
            issue.file
          );

          if (embeddedExtensions.includes(embeddedExtension)) {
            return {
              ...issue,
              file: embeddedFileName,
            };
          }
        }

        return issue;
      });
    },
    extendWatchCompilerHost(host) {
      return {
        ...host,
        watchFile(fileName, callback, poolingInterval) {
          const { embeddedExtension, embeddedFileName } = parsePotentiallyEmbeddedFileName(
            fileName
          );

          if (embeddedExtensions.includes(embeddedExtension)) {
            return host.watchFile(
              embeddedFileName,
              (innerFileName: string, eventKind: ts.FileWatcherEventKind) => {
                embeddedSourceCache.delete(embeddedFileName);
                return callback(fileName, eventKind);
              },
              poolingInterval
            );
          } else {
            return host.watchFile(fileName, callback, poolingInterval);
          }
        },
        readFile: createEmbeddedReadFile(host.readFile),
        fileExists: createEmbeddedFileExists(host.fileExists),
        createProgram: function (rootNames, options, c, ...args) {
          if (c && c.getSourceFileByPath)
            c.getSourceFileByPath = createEmbeddedGetSourceFile(c.getSourceFileByPath);
          return host.createProgram(rootNames, options, c, ...args);
        },
      };
    },
    extendCompilerHost(host) {
      return {
        ...host,
        readFile: createEmbeddedReadFile(host.readFile),
        fileExists: createEmbeddedFileExists(host.fileExists),
        getSourceFile: createEmbeddedGetSourceFile(host.getSourceFile),
      };
    },
    extendParseConfigFileHost<THost extends ts.ParseConfigFileHost>(host: THost): THost {
      return {
        ...host,
        readDirectory(
          rootDir: string,
          extensions: readonly string[],
          excludes: readonly string[] | undefined,
          includes: readonly string[],
          depth?: number
        ): readonly string[] {
          return host
            .readDirectory(
              rootDir,
              [...extensions, ...embeddedExtensions],
              excludes,
              includes,
              depth
            )
            .map((fileName) => {
              const isEmbeddedFile = embeddedExtensions.some((embeddedExtension) =>
                fileName.endsWith(embeddedExtension)
              );

              if (isEmbeddedFile) {
                const embeddedSource = getCachedEmbeddedSource(fileName);

                return embeddedSource ? `${fileName}${embeddedSource.extension}` : fileName;
              } else {
                return fileName;
              }
            });
        },
      };
    },
    extendDependencies(dependencies: Dependencies) {
      return {
        ...dependencies,
        files: dependencies.files.map((fileName) => {
          const {
            embeddedExtension,
            embeddedFileName,
            extension,
          } = parsePotentiallyEmbeddedFileName(fileName);

          if (embeddedExtensions.includes(embeddedExtension)) {
            const embeddedSource = getCachedEmbeddedSource(embeddedFileName);
            if (embeddedSource && embeddedSource.extension === extension) {
              return embeddedFileName;
            }
          }

          return fileName;
        }),
        extensions: [...dependencies.extensions, ...embeddedExtensions],
      };
    },
  };
}

export {
  TypeScriptEmbeddedExtensionHost,
  TypeScriptEmbeddedSource,
  createTypeScriptEmbeddedExtension,
};
