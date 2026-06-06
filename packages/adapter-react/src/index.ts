export {
	REACT_PATTERN_CATALOG,
	catalogFactKinds,
	readCatalogEvidence,
} from "./catalog.js";
export type {
	CatalogEvidenceSummary,
	ReactPatternCatalog,
	ReactPatternSignature,
} from "./catalog.js";
export {
	COMPOUND_COMPONENT_API_DRIFT_RULE_ID,
	createCompoundComponentApiDriftAnalyzer,
} from "./compound-component-api-drift.js";
export {
	CONTAINER_PRESENTER_ROLE_DRIFT_RULE_ID,
	createContainerPresenterRoleDriftAnalyzer,
} from "./container-presenter-role-drift.js";
export {
	CONTEXT_PROVIDER_VALUE_SURFACE_DRIFT_RULE_ID,
	createContextProviderValueSurfaceDriftAnalyzer,
} from "./context-provider-value-surface-drift.js";
export {
	CONTROLLED_UNCONTROLLED_PROP_SURFACE_DRIFT_RULE_ID,
	createControlledUncontrolledPropSurfaceDriftAnalyzer,
} from "./controlled-uncontrolled-prop-surface-drift.js";
export {
	FORM_CONTROL_SURFACE_DRIFT_RULE_ID,
	createFormControlSurfaceDriftAnalyzer,
} from "./form-control-surface-drift.js";
export {
	DATA_FETCHING_SURFACE_DRIFT_RULE_ID,
	createDataFetchingSurfaceDriftAnalyzer,
} from "./data-fetching-surface-drift.js";
export {
	OVERLAY_CONTROL_SURFACE_DRIFT_RULE_ID,
	createOverlayControlSurfaceDriftAnalyzer,
} from "./overlay-control-surface-drift.js";
export { createReactCoreAnalyzers } from "./core-adapter.js";
export type { ReactCoreAnalyzerInput } from "./core-adapter.js";
