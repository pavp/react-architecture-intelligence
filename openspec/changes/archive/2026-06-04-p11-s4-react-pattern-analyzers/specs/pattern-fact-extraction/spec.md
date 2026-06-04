# Delta for Pattern Fact Extraction

## ADDED Requirements

### Requirement: Call Binding Syntax Facts

Core MUST extract deterministic `call-binding` pattern facts for simple local identifier bindings initialized by call expressions. A `call-binding` fact MUST record the local identifier name, observed callee text, declaration kind, file, span, and stable fact id. The fact MUST describe syntax only and MUST NOT resolve symbols, imports, types, runtime values, framework intent, or ownership.

#### Scenario: Simple call binding is extracted

- GIVEN source contains `const ThemeContext = createContext(defaultTheme)`
- WHEN pass1 pattern facts are collected
- THEN a `call-binding` fact MUST be present
- AND it MUST record `local: "ThemeContext"`, `callee: "createContext"`, and `declarationKind: "const"`.

#### Scenario: Complex binding stays bounded

- GIVEN source contains destructuring or an unsupported binding pattern initialized by a call
- WHEN pass1 pattern facts are collected
- THEN core MAY omit a `call-binding` fact for that binding
- AND core MUST NOT infer semantic binding, framework role, or runtime value.

### Requirement: Call Argument Syntax Facts

Core MUST extract deterministic `call-argument` pattern facts for observed arguments passed to call expressions. Each fact MUST record the observed callee text, zero-based argument index, raw/summarized argument text, argument kind, file, span, and stable fact id. The fact MUST describe syntax only and MUST NOT evaluate arguments, resolve symbols, infer endpoint ownership, infer framework behavior, or claim data-fetching semantics.

#### Scenario: Identifier and literal call arguments are extracted

- GIVEN source contains `useContext(ThemeContext)` and `fetch("/api/users")`
- WHEN pass1 pattern facts are collected
- THEN `call-argument` facts MUST be present for the identifier and literal arguments
- AND the facts MUST record deterministic argument indexes and kinds.

#### Scenario: Unsupported argument remains raw or unknown

- GIVEN a call argument uses unsupported syntax
- WHEN pass1 pattern facts are collected
- THEN core MUST either record a bounded raw/unknown argument representation or omit unsupported detail
- AND core MUST NOT evaluate the expression or infer runtime meaning.

### Requirement: JSX Attribute Syntax Facts

Core MUST extract deterministic `jsx-attribute` pattern facts for JSX opening element attributes. Each fact MUST record the JSX tag, immediate parent tag, attribute name, simple value text, value kind, file, span, and stable fact id. The fact MUST describe JSX syntax only and MUST NOT infer React prop semantics, form behavior, provider behavior, controlled behavior, overlay behavior, design-system membership, or remediation.

#### Scenario: JSX attributes are extracted

- GIVEN source contains `<form onSubmit={handleSubmit} method="post" />`
- WHEN pass1 pattern facts are collected
- THEN `jsx-attribute` facts MUST be present for `onSubmit` and `method`
- AND the facts MUST record deterministic tag, parent tag, attribute names, value text, and value kinds.

#### Scenario: Boolean and spread attributes are bounded

- GIVEN source contains JSX boolean attributes or spread attributes
- WHEN pass1 pattern facts are collected
- THEN boolean attributes MUST be represented with a bounded absent-value form
- AND spread attributes MAY be represented as spread syntax or unknown
- AND core MUST NOT expand spread objects or infer prop semantics.

## MODIFIED Requirements

### Requirement: Framework-neutral fact coverage

Core MUST extract deterministic syntax facts for imports, exports, call expressions, call bindings, call arguments, JSX parent/child structure, JSX attributes, hook-like names, static/member assignments, and file-role seeds. Facts MUST describe observed source syntax only and MUST NOT include React-specific pattern names, intent, catalog rules, findings, remediation, or framework roles.

#### Scenario: Generic facts are extracted

- GIVEN a source file with imports, exports, calls, call bindings, call arguments, JSX children, JSX attributes, hook-like calls, and member assignments
- WHEN analysis builds the core graph
- THEN graph facts include those source-observed facts with file identity and evidence spans
- AND facts do not claim architectural pattern intent.

#### Scenario: Core remains framework-agnostic

- GIVEN core fact types, parser tests, and graph output are inspected
- WHEN P11-S4 fact expansion is implemented
- THEN they MUST NOT contain React catalog names, React rule IDs, React pattern labels, provider/context semantics, form semantics, overlay semantics, controlled/uncontrolled semantics, or remediation language.
