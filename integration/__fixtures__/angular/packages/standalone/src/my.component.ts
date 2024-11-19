import {ChangeDetectionStrategy, Component} from "@angular/core";

@Component({
	standalone: false,
	selector: "my-component",
	templateUrl: "./my.component.html",
	styles: [
		`
			@use "~@integration/standalone/variables";
			:host {
				display: block;
				border: 1px solid variables.$color;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyComponent {}
