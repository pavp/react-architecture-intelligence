import type { Analyzer, SourceFile } from "@rai/core";
import { createCompoundComponentApiDriftAnalyzer } from "./compound-component-api-drift.js";
import { createContainerPresenterRoleDriftAnalyzer } from "./container-presenter-role-drift.js";
import { createContextProviderValueSurfaceDriftAnalyzer } from "./context-provider-value-surface-drift.js";
import { createControlledUncontrolledPropSurfaceDriftAnalyzer } from "./controlled-uncontrolled-prop-surface-drift.js";

export interface ReactCoreAnalyzerInput {
	rootDir: string;
	files: SourceFile[];
}

export function createReactCoreAnalyzers(
	_input: ReactCoreAnalyzerInput,
): Analyzer[] {
	return [
		createCompoundComponentApiDriftAnalyzer(),
		createContainerPresenterRoleDriftAnalyzer(),
		createControlledUncontrolledPropSurfaceDriftAnalyzer(),
		createContextProviderValueSurfaceDriftAnalyzer(),
	];
}
