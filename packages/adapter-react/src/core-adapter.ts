import type { Analyzer, SourceFile } from "@rai/core";
import { createCompoundComponentApiDriftAnalyzer } from "./compound-component-api-drift.js";
import { createContainerPresenterRoleDriftAnalyzer } from "./container-presenter-role-drift.js";
import { createContextProviderValueSurfaceDriftAnalyzer } from "./context-provider-value-surface-drift.js";
import { createControlledUncontrolledPropSurfaceDriftAnalyzer } from "./controlled-uncontrolled-prop-surface-drift.js";
import { createFormControlSurfaceDriftAnalyzer } from "./form-control-surface-drift.js";
import { createDataFetchingSurfaceDriftAnalyzer } from "./data-fetching-surface-drift.js"; // P11-S7
import { createOverlayControlSurfaceDriftAnalyzer } from "./overlay-control-surface-drift.js"; // P11-S8
import { createDesignSystemUsageSurfaceDriftAnalyzer } from "./design-system-usage-surface-drift.js"; // P11-S9
import { createPropDrillingAnalyzer } from "./prop-drilling.js"; // P14-S3

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
		createFormControlSurfaceDriftAnalyzer(),
		createDataFetchingSurfaceDriftAnalyzer(), // P11-S7
		createOverlayControlSurfaceDriftAnalyzer(), // P11-S8
		createDesignSystemUsageSurfaceDriftAnalyzer(), // P11-S9
		createPropDrillingAnalyzer(), // P14-S3
	];
}
