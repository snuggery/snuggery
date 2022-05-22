import {type ModuleWithProviders, NgModule} from '@angular/core';

import {MyComponent} from './my.component';

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
