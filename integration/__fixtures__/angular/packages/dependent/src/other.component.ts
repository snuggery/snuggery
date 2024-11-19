import {ChangeDetectionStrategy, Component} from "@angular/core";

@Component({
	standalone: false,
	selector: "other-component",
	templateUrl: "./other.component.html",
	styleUrls: ["./other.component.scss"],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OtherComponent {}
