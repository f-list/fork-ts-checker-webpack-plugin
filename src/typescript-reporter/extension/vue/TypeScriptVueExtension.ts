import {
  createTypeScriptEmbeddedExtension,
  TypeScriptEmbeddedSource,
} from '../TypeScriptEmbeddedExtension';
import fs from 'fs-extra';
import { TypeScriptExtension } from '../TypeScriptExtension';
import { TypeScriptVueExtensionConfiguration } from './TypeScriptVueExtensionConfiguration';
import { VueTemplateCompilerV2 } from './types/vue-template-compiler';
import { VueTemplateCompilerV3 } from './types/vue__compiler-sfc';

interface GenericScriptSFCBlock {
  content: string;
  attrs: Record<string, string | true>;
  start?: number;
  end?: number;
  lang?: string;
  src?: string;
}

function createTypeScriptVueExtension(
  configuration: TypeScriptVueExtensionConfiguration
): TypeScriptExtension {
  function loadVueTemplateCompiler(): VueTemplateCompilerV2 | VueTemplateCompilerV3 {
    return require(configuration.compiler);
  }

  function isVueTemplateCompilerV2(
    compiler: VueTemplateCompilerV2 | VueTemplateCompilerV3
  ): compiler is VueTemplateCompilerV2 {
    return typeof (compiler as VueTemplateCompilerV2).parseComponent === 'function';
  }

  function isVueTemplateCompilerV3(
    compiler: VueTemplateCompilerV2 | VueTemplateCompilerV3
  ): compiler is VueTemplateCompilerV3 {
    return typeof (compiler as VueTemplateCompilerV3).parse === 'function';
  }

  function getExtensionByLang(
    lang: string | true | undefined
  ): TypeScriptEmbeddedSource['extension'] {
    if (lang === true) {
      return '.js';
    }

    switch (lang) {
      case 'ts':
        return '.ts';
      case 'tsx':
        return '.tsx';
      case 'js':
      case 'jsx':
      default:
        return '.js';
    }
  }

  function createVueNoScriptEmbeddedSource(): TypeScriptEmbeddedSource {
    return {
      sourceText: 'export default {};\n',
      extension: '.js',
    };
  }

  function createVueSrcScriptEmbeddedSource(
    src: string,
    lang: string | true | undefined
  ): TypeScriptEmbeddedSource {
    // Import path cannot be end with '.ts[x]'
    src = src.replace(/\.tsx?$/i, '');

    // For now, ignore the error when the src file is not found since it will produce incorrect code location.
    // It's not a large problem since it's handled on webpack side.
    const text = [
      '// @ts-ignore',
      `export { default } from '${src}';`,
      '// @ts-ignore',
      `export * from '${src}';`,
    ].join('\n');

    return {
      sourceText: text,
      extension: getExtensionByLang(lang),
    };
  }

  function createVueInlineScriptEmbeddedSource(
    text: string,
    lang: string | true | undefined
  ): TypeScriptEmbeddedSource {
    return {
      sourceText: text,
      extension: getExtensionByLang(lang),
    };
  }

  function getVueEmbeddedSource(fileName: string): TypeScriptEmbeddedSource | undefined {
    if (!fs.existsSync(fileName)) {
      return undefined;
    }

    const compiler = loadVueTemplateCompiler();
    const vueSourceText = fs.readFileSync(fileName, { encoding: 'utf-8' });
    const cls = vueSourceText.match(/export\s+default\s+class\s+(\w+)/i)?.[1];

    let script: GenericScriptSFCBlock | undefined;
    let template: string | undefined;
    if (isVueTemplateCompilerV2(compiler)) {
      const parsed = compiler.parseComponent(vueSourceText, {
        pad: 'space',
      });

      script = parsed.script;
      if (parsed.template) {
        const compiled = require('@vue/component-compiler-utils').compileTemplate({
          source: parsed.template.content,
          compiler: compiler,
          isFunctional: parsed.template.attrs.functional,
        }).code;
        const fakeFuncs = `{_e: () => __fakeVue.VNode,
          _v: (x: string) => __fakeVue.VNode,
          _s: (x: any) => string,
          _n: (x: string) => string | number,
          _u: (x: ({key: string, fn: __fakeVNode.ScopedSlot, proxy?: boolean} | null)[], b?: any, c?: boolean, d?: number) => {[key: string]: __fakeVNode.ScopedSlot},
          _i: <T>(x: ReadonlyArray<T>, y: T) => number,
          _q: (x: any, y: any) => boolean,
          _m: (x: number, y?: boolean) => __fakeVue.VNodeChildrenArrayContents,
          _k: (a: number, b: string, c: number, d: string, e: string | ReadonlyArray<string>) => boolean,
          _o: (a: __fakeVue.VNodeChildrenArrayContents | __fakeVue.VNode, b: number, c: string | number),
          _t: (a?: string, b?: __fakeVue.VNodeChildrenArrayContents | null, c?: any, d?: any) => __fakeVue.VNode,
          _b: (a: __fakeVue.VNodeData, b: 'tag', c: __fakeVue.VNodeData, d: boolean, e?: boolean) => __fakeVue.VNodeData,
          _l: (<T, U>(x: Iterable<[T, U]> | undefined, y: (a: U, b: T) => __fakeVue.VNode | __fakeVue.VNode[] | void) => __fakeVue.VNode[])
            & (<T>(x: Iterable<T> | undefined, y: (a: T, b: number) => __fakeVue.VNode | __fakeVue.VNode[] | void) => __fakeVue.VNode[])
            & (<T, K extends keyof T>(x: T, y: (a: T[K], b: K, c: number) => __fakeVue.VNode | __fakeVue.VNode[] | void) => __fakeVue.VNode[])},
          _c: ((<T extends keyof HTMLElementTagNameMap>(a: T, b: __ElementVNodeData<T, {target: HTMLElementTagNameMap[T] & {composing: boolean}}>, c?: __fakeVue.VNodeChildrenArrayContents, d?: number) => __fakeVue.VNode) &
            ((a:string | __fakeVue.Component, c?: __fakeVue.VNodeChildrenArrayContents, d?: number) => __fakeVue.VNode) & (<T>(a:string | __fakeVue.Component, b: __VNodeData<T>, c?: __fakeVue.VNodeChildrenArrayContents, d?: number) => __fakeVue.VNode))`;

        template = `\nimport * as __fakeVue from 'vue';
          import * as __fakeVNode from 'vue/types/vnode';
          interface __VNodeData<T> extends __fakeVue.VNodeData {
            model?: {value: T, callback(t: T):void, expression: string},
            directives?: any[]
          }
          type __ElementVNodeData<T, E> = __VNodeData<T> & {on?: {[key in keyof HTMLElementEventMap]?: ((e: HTMLElementEventMap[key] & E) => void)[] | ((e: HTMLElementEventMap[key] & E) => void)}}`;

        if (parsed.template.attrs.functional) {
          template += `function __fakeRender(_h: Vue.CreateElement, _vm: Vue.RenderContext<${cls}> & ${fakeFuncs}){${compiled.code.substring(
            compiled.code.indexOf('return'),
            compiled.code.lastIndexOf('var staticRenderFns =')
          )}}`;
        } else {
          template += `function __fakeRender(this: ${cls} & ${fakeFuncs}){var _vm = this;${compiled.code.substring(
            compiled.code.indexOf('return'),
            compiled.code.lastIndexOf('var staticRenderFns =')
          )}}`;
        }
      }
    } else if (isVueTemplateCompilerV3(compiler)) {
      const parsed = compiler.parse(vueSourceText);
      if (parsed.descriptor) {
        let bindings: object | undefined;
        if (parsed.descriptor.script || parsed.descriptor.scriptSetup) {
          const scriptV3 = compiler.compileScript(parsed.descriptor, {
            id: 'stub',
            babelParserPlugins: ['classProperties'],
          });
          bindings = scriptV3.bindings;
          // map newer version of SFCScriptBlock to the generic one
          script = {
            content: scriptV3.content,
            attrs: scriptV3.attrs,
            start: scriptV3.loc.start.offset,
            end: scriptV3.loc.end.offset,
            lang: scriptV3.lang,
            src: scriptV3.src,
          };
        }
        if (parsed.descriptor.template) {
          template = compiler.compileTemplate({
            id: 'stub',
            source: parsed.descriptor.template.content,
            compilerOptions: { bindingMetadata: bindings },
          }).code;
          if (parsed.descriptor.scriptSetup) {
            template = template.replace(
              'export function render(_ctx, _cache, $props, $setup, $data, $options)',
              `import {Slots as __Slots} from 'vue';
                        type __Props = Parameters<typeof setup> extends [infer T] ? T : void;
                        export function render(_ctx: {$slots: __Slots}, _cache: void, $props: __Props, $setup: ReturnType<typeof setup>, $data: void, $options: void)`
            );
          } else {
            template = template
              .replace(
                'export function render(_ctx, _cache, $props, $setup, $data, $options)',
                `export function render(_ctx: ${cls}, _cache: Function[], $props: void, $setup: void, $data: void, $options: void)`
              )
              .replace(/(_resolveComponent\(.*)/g, '$1!')
              .replace(/import _imports_(\d+) from '(.*)'/g, "const _imports_$1 = require('$2');")
              .replace(
                /\(\.\.\.args\) => \(.*?([^ ]*)\(\.\.\.args\)/g,
                (_, x) => `(...args: Parameters<typeof ${x}>) => (${x}(...args)`
              );
          }
        }
      }
    } else {
      throw new Error(
        'Unsupported vue template compiler. Compiler should provide `parse` or `parseComponent` function.'
      );
    }

    let source;

    if (!script) {
      // No <script> block
      source = createVueNoScriptEmbeddedSource();
    } else if (script.attrs.src) {
      // <script src="file.ts" /> block
      source = createVueSrcScriptEmbeddedSource(script.attrs.src as string, script.attrs.lang);
    } else {
      // <script lang="ts"></script> block
      // pad blank lines to retain diagnostics location
      const lineOffset = vueSourceText.slice(0, script.start).split(/\r?\n/g).length;
      const paddedSourceText = Array(lineOffset).join('\n') + script.content;

      source = createVueInlineScriptEmbeddedSource(paddedSourceText, script.attrs.lang);
    }

    if (template) {
      source.realEnd = source.sourceText.length;
      source.sourceText += template;
    }
    return source;
  }

  return createTypeScriptEmbeddedExtension({
    embeddedExtensions: ['.vue'],
    getEmbeddedSource: getVueEmbeddedSource,
  });
}

export { createTypeScriptVueExtension };
