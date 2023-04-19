import {type ModuleWithProviders, NgModule} from '@angular/core';

import {MyComponent} from './my.component.js';

export {MyComponent};

@NgModule({
	declarations: [MyComponent],
	exports: [MyComponent],
})
export class StandaloneModule {
	static forRoot(): ModuleWithProviders<StandaloneModule> {
		return {
			ngModule: StandaloneModule,
			providers: [],
		};
	}
}
