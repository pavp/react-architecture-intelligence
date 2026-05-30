import { expect, test } from "vitest";
import { buildGraph, type SourceFile } from "./graph-build.js";
import { createTypeResolver, type TypeResolverHooks } from "./type-resolver.js";

const typedFiles: SourceFile[] = [{
  file: "Profile.tsx",
  source: `type Props = { name: string; age?: number };
export function Profile({ name, age }: Props) { return <div>{name}{age}</div>; }`,
}];

function setup(files: SourceFile[] = typedFiles, hooks?: TypeResolverHooks) {
  const graph = buildGraph(files);
  const component = graph.components[0]!;
  return { graph, component, resolver: createTypeResolver({ files, graph, hooks }) };
}

test("typeOf returns stable TypeInfo for a typed component span", () => {
  const { component, resolver } = setup();

  const info = resolver.typeOf(component.span);

  expect(info).toEqual({ text: "{ age?: number | undefined; name: string }", symbolName: "Profile" });
});

test("typeOf constructs the ts-morph project lazily", () => {
  let projectCreates = 0;
  const { component, resolver } = setup(undefined, { onProjectCreate: () => projectCreates++ });

  expect(projectCreates).toBe(0);
  resolver.typeOf(component.span);
  expect(projectCreates).toBe(1);
});

test("typeOf memoizes by span and content hash", () => {
  let resolutions = 0;
  const { component, resolver } = setup(undefined, { onResolve: () => resolutions++ });

  const first = resolver.typeOf(component.span);
  const second = resolver.typeOf(component.span);

  expect(first).toEqual(second);
  expect(resolutions).toBe(1);
});

test("typeOf recomputes instead of serving stale cache when file content hash changes", () => {
  const first = setup();
  const span = first.component.span;
  const firstInfo = first.resolver.typeOf(span);

  const changedFiles: SourceFile[] = [{
    file: "Profile.tsx",
    source: `type Props = { name: number };
export function Profile({ name }: Props) { return <div>{name}</div>; }`,
  }];
  const second = setup(changedFiles);
  const secondInfo = second.resolver.typeOf(span);

  expect(firstInfo?.text).not.toBe(secondInfo?.text);
  expect(secondInfo).toEqual({ text: "{ name: number }", symbolName: "Profile" });
});

test("typeOf returns null for a stale span that no longer resolves in the current file", () => {
  const first = setup();
  const staleSpan = first.component.span;
  const changedFiles: SourceFile[] = [{ file: "Profile.tsx", source: "export const value = 1;" }];
  const second = createTypeResolver({ files: changedFiles, graph: buildGraph(changedFiles) });

  expect(second.typeOf(staleSpan)).toBeNull();
});
