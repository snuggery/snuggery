import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
	selector: 'other-component',
	templateUrl: './other.component.html',
	styleUrls: ['./other.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OtherComponent {}
