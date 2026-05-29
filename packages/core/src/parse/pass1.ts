import { parseSync } from "oxc-parser";
import type { ComponentNode, Span } from "../types.js";

export interface Pass1Result {
  file: string;
  components: ComponentNode[];
  imports: { from: string }[];
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
  const imports: { from: string }[] = [];

  let cid = 0;
  const span = (node: any, kind: string, astPath: string): Span => ({
    file, start: node.start, end: node.end, kind, astPath,
  });

  const walkComponent = (
    name: string, kind: ComponentNode["kind"], node: any, idx: number,
    exportKind: ComponentNode["exportKind"],
  ) => {
    const facts = collectRenderFacts(node);
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
    if (s.type === "VariableDeclaration") {
      for (const d of s.declarations) {
        if (d.id?.type === "Identifier" && COMPONENT_NAME.test(d.id.name) && d.init) {
          const kind = arrowKind(d.init);
          if (kind) walkComponent(d.id.name, kind, d.init, idx, exportKind);
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
    }
    if (stmt.type === "ExportNamedDeclaration" && Array.isArray(stmt.specifiers)) {
      for (const spec of stmt.specifiers) {
        const name = spec?.local?.name ?? spec?.exported?.name;
        if (name) setExportKind(components, name, "named");
      }
    }
  }

  return { file, components, imports };
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

function setExportKind(components: ComponentNode[], name: string, kind: ComponentNode["exportKind"]): void {
  const c = components.find((x) => x.name === name);
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

interface RenderFacts { hooks: string[]; children: string[]; markers: string[]; conditionals: number; }

function collectRenderFacts(fnNode: any): RenderFacts {
  const hooks = new Set<string>();
  const children = new Set<string>();
  const markers = new Set<string>();
  let conditionals = 0;

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
  };
}

function jsxName(name: any): string | null {
  if (!name) return null;
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXMemberExpression") return jsxName(name.object);
  return null;
}
