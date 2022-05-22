import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
	selector: 'other-component',
	templateUrl: './other.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OtherComponent {}
