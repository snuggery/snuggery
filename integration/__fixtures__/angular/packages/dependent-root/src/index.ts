import {ModuleWithProviders, NgModule} from "@angular/core";
import {StandaloneModule} from "@integration/standalone";

import {OtherComponent} from "./other.component.js";

export {OtherComponent};

@NgModule({
	imports: [StandaloneModule.forRoot()],
	declarations: [OtherComponent],
	exports: [OtherComponent],
})
export class DependentModule {
	static forRoot(): ModuleWithProviders<DependentModule> {
		return {
			ngModule: DependentModule,
			providers: [],
		};
	}
}
