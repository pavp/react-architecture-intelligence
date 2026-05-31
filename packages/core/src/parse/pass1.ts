import { parseSync } from "oxc-parser";
import type { ComponentNode, HookNode, PatternFact, PatternImportSpecifierFact, Span } from "../types.js";

export interface Pass1Result {
  file: string;
  components: ComponentNode[];
  hooks: HookNode[];
  imports: { from: string }[];
  patternFacts: PatternFact[];
}

const COMPONENT_NAME = /^[A-Z]/;
const HOOK_NAME = /^use[A-Z0-9]/;

/** Pure structural pass (§2.1): source text → position-stable facts. No AST nodes stored. */
export function pass1(file: string, source: string): Pass1Result {
  // oxc-parser (0.30.x) signature is (sourceText, options); the filename drives
  // dialect detection (.tsx) and `program` is returned as a JSON string.
  const parsed = parseSync(source, { sourceFilename: file });
  const program = JSON.parse(parsed.program) as any;
  const components: ComponentNode[] = [];
  const hooks: HookNode[] = [];
  const imports: { from: string }[] = [];
  const patternFacts = collectPatternFacts(file, source, program);

  let cid = 0;
  let hid = 0;
  const span = (node: any, kind: string, astPath: string): Span => ({
    file, start: node.start, end: node.end, kind, astPath,
  });

  const walkComponent = (
    name: string, kind: ComponentNode["kind"], node: any, idx: number,
    exportKind: ComponentNode["exportKind"],
  ) => {
    const facts = collectRenderFacts(node);
    if (!facts.returnsJsx) return; // KI-1: capitalized non-component (no JSX) is not a component
    components.push({
      id: `${file}#${cid++}`,
      name,
      span: span(node, "component", `module>decl[${idx}]`),
      kind,
      file,
      exportKind,
      propNames: collectPropNames(node),
      hookCalls: facts.hooks,
      childComponents: facts.children,
      compositionMarkers: facts.markers,
      conditionalBranches: facts.conditionals,
    });
  };

  const walkHook = (
    name: string, node: any, idx: number,
    exportKind: HookNode["exportKind"],
  ) => {
    const facts = collectRenderFacts(node);
    hooks.push({
      id: `${file}#hook-${hid++}`,
      name,
      span: span(node, "hook", `module>decl[${idx}]`),
      file,
      exportKind,
      hookCalls: facts.hooks.filter((hook) => hook !== name),
    });
  };

  const body: any[] = program.body ?? [];
  body.forEach((stmt: any, idx: number) => {
    if (stmt.type === "ImportDeclaration") { imports.push({ from: stmt.source.value }); return; }

    // Unwrap inline export wrappers (oxc: ExportNamed/DefaultDeclaration hold the real
    // node under `.declaration`). Without this, `export function/const/default` are missed.
    let s: any = stmt;
    let exportKind: ComponentNode["exportKind"] = "none";
    if (s.type === "ExportNamedDeclaration" && s.declaration) { exportKind = "named"; s = s.declaration; }
    else if (s.type === "ExportDefaultDeclaration" && s.declaration) { exportKind = "default"; s = s.declaration; }

    if (s.type === "FunctionDeclaration" && s.id && COMPONENT_NAME.test(s.id.name)) {
      walkComponent(s.id.name, "fn", s, idx, exportKind);
    }
    if (s.type === "FunctionDeclaration" && s.id && HOOK_NAME.test(s.id.name)) {
      walkHook(s.id.name, s, idx, exportKind);
    }
    if (s.type === "VariableDeclaration") {
      for (const d of s.declarations) {
        if (d.id?.type === "Identifier" && COMPONENT_NAME.test(d.id.name) && d.init) {
          const kind = arrowKind(d.init);
          if (kind) walkComponent(d.id.name, kind, d.init, idx, exportKind);
        }
        if (d.id?.type === "Identifier" && HOOK_NAME.test(d.id.name) && d.init) {
          walkHook(d.id.name, d.init, idx, exportKind);
        }
      }
    }
  });

  // Second pass: correlate SEPARATE export statements to already-declared components by name.
  //   export default Button;  |  export default memo(Button);  |  export { Button };
  for (const stmt of body) {
    if (stmt.type === "ExportDefaultDeclaration" && stmt.declaration) {
      const name = exportedComponentName(stmt.declaration);
      if (name) setExportKind(components, name, "default");
      if (name) setExportKind(hooks, name, "default");
    }
    if (stmt.type === "ExportNamedDeclaration" && Array.isArray(stmt.specifiers)) {
      for (const spec of stmt.specifiers) {
        const name = spec?.local?.name ?? spec?.exported?.name;
        if (name) setExportKind(components, name, "named");
        if (name) setExportKind(hooks, name, "named");
      }
    }
  }

  return { file, components, hooks, imports, patternFacts };
}

function collectPatternFacts(file: string, source: string, program: any): PatternFact[] {
  const facts: PatternFact[] = [];
  const body: any[] = program.body ?? [];
  const span = (node: any, kind: string, astPath: string): Span => ({
    file,
    start: typeof node?.start === "number" ? node.start : 0,
    end: typeof node?.end === "number" ? node.end : Math.max(source.length, 1),
    kind,
    astPath,
  });
  const push = (fact: Omit<PatternFact, "id"> & Record<string, unknown>) => {
    facts.push({ ...fact, id: patternFactId(fact) } as PatternFact);
  };

  const ext = file.match(/\.([cm]?[jt]sx?)$/)?.[1] ?? "unknown";
  push({ kind: "file-role-seed", file, span: span({ start: 0, end: Math.max(source.length, 1) }, "file-role-seed", "module>file-role-seed[0]"), seed: `extension:${ext}`, source: "path" });

  body.forEach((stmt, idx) => {
    const astPath = `module>stmt[${idx}]`;
    if (stmt.type === "ImportDeclaration") {
      const specifiers = importSpecifiers(stmt.specifiers ?? []);
      push({ kind: "import", file, span: span(stmt, "import", astPath), source: stringValue(stmt.source), specifiers });
      return;
    }
    if (stmt.type === "ExportNamedDeclaration") {
      for (const exportFact of exportFacts(stmt, file, span(stmt, "export", astPath))) push(exportFact);
    }
    if (stmt.type === "ExportDefaultDeclaration") {
      const local = declarationName(stmt.declaration) || "default";
      push({ kind: "export", file, span: span(stmt, "export", astPath), exported: "default", local, source: "", mode: "default" });
    }
  });

  const visit = (node: any, astPath: string, jsxParentTag = "") => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => visit(child, `${astPath}[${idx}]`, jsxParentTag));
      return;
    }
    if (node.type === "CallExpression") {
      const callee = expressionText(node.callee);
      if (callee) push({ kind: "call", file, span: span(node, "call", astPath), callee });
      if (node.callee?.type === "Identifier" && HOOK_NAME.test(node.callee.name)) {
        push({ kind: "hook-call", file, span: span(node, "hook-call", astPath), name: node.callee.name });
      }
    }
    if (node.type === "JSXElement") {
      const tag = jsxNameText(node.openingElement?.name) ?? "";
      if (tag) push({ kind: "jsx", file, span: span(node.openingElement, "jsx", `${astPath}>opening`), tag, parentTag: jsxParentTag });
      (node.children ?? []).forEach((child: any, idx: number) => visit(child, `${astPath}>child[${idx}]`, tag || jsxParentTag));
      return;
    }
    if (node.type === "AssignmentExpression") {
      const member = staticMemberParts(node.left);
      if (member) push({ kind: "member-assignment", file, span: span(node, "member-assignment", astPath), object: member.object, property: member.property, value: expressionText(node.right) });
    }
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      visit(node[key], `${astPath}>${key}`, jsxParentTag);
    }
  };
  visit(program, "module");
  return facts;
}

function patternFactId(fact: Omit<PatternFact, "id"> & Record<string, unknown>): string {
  const detail = JSON.stringify({ ...fact, id: undefined, span: undefined, file: undefined });
  return `${fact.file}#pattern:${fact.kind}:${fact.span.start}:${fact.span.end}:${detail}`;
}

function importSpecifiers(specifiers: any[]): PatternImportSpecifierFact[] {
  return specifiers.map((specifier) => {
    if (specifier.type === "ImportDefaultSpecifier") return { imported: "default", local: specifier.local?.name ?? "", mode: "default" };
    if (specifier.type === "ImportNamespaceSpecifier") return { imported: "*", local: specifier.local?.name ?? "", mode: "namespace" };
    return { imported: specifier.imported?.name ?? stringValue(specifier.imported), local: specifier.local?.name ?? "", mode: "named" };
  });
}

function exportFacts(stmt: any, file: string, factSpan: Span): Array<Omit<PatternFact, "id"> & Record<string, unknown>> {
  const source = stringValue(stmt.source);
  if (Array.isArray(stmt.specifiers) && stmt.specifiers.length > 0) {
    return stmt.specifiers.map((specifier: any) => ({
      kind: "export",
      file,
      span: factSpan,
      exported: specifier.exported?.name ?? stringValue(specifier.exported),
      local: specifier.local?.name ?? stringValue(specifier.local),
      source,
      mode: "named",
    }));
  }
  const local = declarationName(stmt.declaration);
  if (!local) return [];
  return [{ kind: "export", file, span: factSpan, exported: local, local, source, mode: "named" }];
}

function declarationName(declaration: any): string {
  if (!declaration) return "";
  if (declaration.id?.name) return declaration.id.name;
  if (declaration.type === "VariableDeclaration") return declaration.declarations?.[0]?.id?.name ?? "";
  if (declaration.type === "Identifier") return declaration.name;
  return "";
}

function staticMemberParts(node: any): { object: string; property: string } | null {
  if (node?.type !== "StaticMemberExpression" && node?.type !== "MemberExpression") return null;
  const object = expressionText(node.object);
  const property = node.property?.name ?? stringValue(node.property);
  if (!object || !property) return null;
  return { object, property };
}

function expressionText(node: any): string {
  if (!node) return "";
  if (node.type === "Identifier" || node.type === "JSXIdentifier") return node.name;
  if (node.type === "StringLiteral" || node.type === "Literal") return String(node.value ?? "");
  if (node.type === "StaticMemberExpression" || node.type === "MemberExpression") {
    const object = expressionText(node.object);
    const property = expressionText(node.property);
    return object && property ? `${object}.${property}` : object || property;
  }
  if (node.type === "CallExpression") return expressionText(node.callee);
  return "";
}

function stringValue(node: any): string {
  return typeof node?.value === "string" ? node.value : node?.name ?? "";
}

function jsxNameText(name: any): string | null {
  if (!name) return null;
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXMemberExpression") {
    const object = jsxNameText(name.object);
    const property = jsxNameText(name.property);
    return object && property ? `${object}.${property}` : object || property;
  }
  return null;
}

/** Name referenced by a default export: `Button`, or `memo(Button)`/`forwardRef(Button)`. */
function exportedComponentName(decl: any): string | null {
  if (decl?.type === "Identifier") return decl.name;
  if (decl?.type === "CallExpression") {
    const callee = decl.callee?.name;
    if (callee === "memo" || callee === "forwardRef") {
      const arg = decl.arguments?.[0];
      if (arg?.type === "Identifier") return arg.name;
    }
  }
  return null;
}

function setExportKind<T extends { name: string; exportKind: ComponentNode["exportKind"] }>(nodes: T[], name: string, kind: ComponentNode["exportKind"]): void {
  const c = nodes.find((x) => x.name === name);
  // don't downgrade an already-detected inline export
  if (c && c.exportKind === "none") c.exportKind = kind;
}

function arrowKind(init: any): ComponentNode["kind"] | null {
  if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") return "arrow";
  if (init.type === "CallExpression" && init.callee?.type === "Identifier") {
    if (init.callee.name === "memo") return "memo";
    if (init.callee.name === "forwardRef") return "forwardRef";
  }
  return null;
}

function collectPropNames(fnNode: any): string[] {
  const fn = unwrapFn(fnNode);
  // oxc-parser wraps params in a `FormalParameters` node: { items: [{ pattern }] }.
  let first = firstParamPattern(fn);
  // unwrap default-valued params: `function F({a,b} = {})` → AssignmentPattern.left
  if (first?.type === "AssignmentPattern") first = first.left;
  if (!first) return [];
  if (first.type === "ObjectPattern") {
    return (first.properties ?? [])
      // oxc uses `BindingProperty` (not ESTree `Property`) for object-pattern members.
      .filter((pr: any) => pr.type === "BindingProperty" && pr.key?.name)
      .map((pr: any) => pr.key.name as string)
      .sort();
  }
  return [];
}

/** Extract the binding pattern of the first formal parameter across oxc/ESTree shapes. */
function firstParamPattern(fn: any): any {
  if (!fn) return null;
  const params = fn.params;
  if (!params) return null;
  // oxc 0.30.x: params is a FormalParameters node with an `items` array of FormalParameter.
  if (Array.isArray(params.items)) {
    const item = params.items[0];
    return item?.pattern ?? item ?? null;
  }
  // ESTree fallback: params is a plain array of patterns.
  if (Array.isArray(params)) {
    const p = params[0];
    return p?.pattern ?? p ?? null;
  }
  return null;
}

function unwrapFn(node: any): any {
  if (node.type === "FunctionDeclaration" || node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return node;
  if (node.type === "CallExpression") return unwrapFn(node.arguments?.[0] ?? {});
  return null;
}

interface RenderFacts { hooks: string[]; children: string[]; markers: string[]; conditionals: number; returnsJsx: boolean; }

function collectRenderFacts(fnNode: any): RenderFacts {
  const hooks = new Set<string>();
  const children = new Set<string>();
  const markers = new Set<string>();
  let conditionals = 0;
  let returnsJsx = false;

  const visit = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    switch (n.type) {
      case "CallExpression":
        if (n.callee?.type === "Identifier") {
          if (HOOK_NAME.test(n.callee.name)) hooks.add(n.callee.name);
          // collect ALL composition wrappers in the chain (memo(forwardRef(...)))
          if (["memo", "forwardRef", "lazy"].includes(n.callee.name)) markers.add(n.callee.name);
        }
        break;
      case "JSXOpeningElement": {
        returnsJsx = true;
        const nm = jsxName(n.name);
        if (nm && COMPONENT_NAME.test(nm)) children.add(nm);
        break;
      }
      case "ConditionalExpression": conditionals++; break;
      case "LogicalExpression": if (n.operator === "&&") conditionals++; break;
      case "SwitchStatement": conditionals++; break;
    }
    for (const k of Object.keys(n)) {
      if (k === "type" || k === "start" || k === "end") continue;
      visit(n[k]);
    }
  };
  visit(fnNode);
  return {
    hooks: [...hooks].sort(),
    children: [...children].sort(),
    markers: [...markers].sort(),
    conditionals,
    returnsJsx,
  };
}

function jsxName(name: any): string | null {
  if (!name) return null;
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXMemberExpression") return jsxName(name.object);
  return null;
}
