import { Node, Project, ScriptKind, SyntaxKind, type SourceFile as MorphSourceFile, type Type } from "ts-morph";
import type { RepoGraph } from "../graph/repograph.js";
import type { Span } from "../types.js";
import type { TypeInfo, TypeResolver } from "../analyzers/analyzer.js";
import type { SourceFile } from "./graph-build.js";

export interface TypeResolverHooks {
  onProjectCreate?: () => void;
  onResolve?: () => void;
}

export interface CreateTypeResolverInput {
  files: SourceFile[];
  graph: Readonly<RepoGraph>;
  hooks?: TypeResolverHooks | undefined;
}

export function createTypeResolver(input: CreateTypeResolverInput): TypeResolver {
  const fileMap = new Map(input.files.map((file) => [file.file, file.source]));
  const hashByFile = new Map(input.graph.modules.map((module) => [module.file, module.contentHash]));
  const memo = new Map<string, TypeInfo | null>();
  let project: Project | null = null;
  const sourceFiles = new Map<string, MorphSourceFile>();

  const ensureProject = () => {
    if (!project) {
      input.hooks?.onProjectCreate?.();
      project = new Project({ compilerOptions: { jsx: 2, strict: true } });
    }
    return project;
  };

  const ensureSourceFile = (span: Span) => {
    const existing = sourceFiles.get(span.file);
    if (existing) return existing;
    const source = fileMap.get(span.file);
    if (source === undefined) return null;
    const sf = ensureProject().createSourceFile(span.file, source, {
      overwrite: true,
      scriptKind: scriptKindForFile(span.file),
    });
    sourceFiles.set(span.file, sf);
    return sf;
  };

  return {
    typeOf(span: Span): TypeInfo | null {
      const hash = hashByFile.get(span.file);
      if (!hash) return null;
      const key = `${span.file}:${hash}:${span.start}:${span.end}:${span.kind}:${span.astPath}`;
      if (memo.has(key)) return memo.get(key)!;

      input.hooks?.onResolve?.();
      const sf = ensureSourceFile(span);
      const node = sf ? resolveNode(sf, span) : null;
      const info = node ? toTypeInfo(node) : null;
      memo.set(key, info);
      return info;
    },
  };
}

function scriptKindForFile(file: string): ScriptKind {
  if (file.endsWith(".tsx")) return ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ScriptKind.JSX;
  if (file.endsWith(".ts")) return ScriptKind.TS;
  return ScriptKind.JS;
}

function resolveNode(sf: MorphSourceFile, span: Span): Node | null {
  if (span.kind === "component") return resolveByAstPath(sf, span);
  const expected = expectedKind(span);
  let node = sf.getDescendantAtPos(span.start) ?? sf.getDescendantAtPos(span.start + 1);
  while (node) {
    if (expected === null || node.getKind() === expected) return node;
    if (node.getStart() < span.start - 2) break;
    node = node.getParent();
  }
  return resolveByAstPath(sf, span);
}

function expectedKind(span: Span): SyntaxKind | null {
  if (span.kind === "component") return null;
  return null;
}

function resolveByAstPath(sf: MorphSourceFile, span: Span): Node | null {
  const match = /module>decl\[(\d+)\]/.exec(span.astPath);
  if (!match) return null;
  const idx = Number(match[1]);
  const statement = sf.getStatements()[idx];
  if (!statement) return null;
  if (span.kind === "component") return componentNodeFromStatement(statement);
  return statement;
}

function toTypeInfo(node: Node): TypeInfo {
  const target = typeTarget(node);
  const type = componentPropsType(target) ?? target.getType();
  const symbolName = target.getSymbol()?.getName();
  return {
    text: typeText(type, target),
    ...(symbolName ? { symbolName } : {}),
  };
}

function typeTarget(node: Node): Node {
  if (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node)) return node;
  const fn = node.getFirstDescendant((desc) => Node.isFunctionDeclaration(desc) || Node.isArrowFunction(desc) || Node.isFunctionExpression(desc));
  return fn ?? node;
}

function componentNodeFromStatement(statement: Node): Node | null {
  if (Node.isFunctionDeclaration(statement)) return statement;
  if (Node.isVariableStatement(statement)) {
    const declaration = statement.getDeclarations()[0];
    const initializer = declaration?.getInitializer();
    if (!initializer) return declaration ?? null;
    return unwrapComponentInitializer(initializer) ?? declaration ?? null;
  }
  return statement;
}

function unwrapComponentInitializer(node: Node): Node | null {
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) return node;
  if (Node.isCallExpression(node)) {
    const first = node.getArguments()[0];
    return first ? unwrapComponentInitializer(first) : node;
  }
  return node;
}

function componentPropsType(node: Node): Type | null {
  if (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const first = node.getParameters()[0];
    return first?.getType() ?? null;
  }
  return null;
}

function typeText(type: Type, location: Node): string {
  const props = type.getProperties();
  if (props.length === 0) return type.getText(location);
  const fields = props
    .map((prop) => {
      const declaration = prop.getValueDeclaration() ?? prop.getDeclarations()[0];
      const propType = declaration ? prop.getTypeAtLocation(location).getText(location) : "unknown";
      const optional = declaration && Node.isPropertySignature(declaration) && declaration.hasQuestionToken() ? "?" : "";
      return `${prop.getName()}${optional}: ${propType}`;
    })
    .sort();
  return `{ ${fields.join("; ")} }`;
}
