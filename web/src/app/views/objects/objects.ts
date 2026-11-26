import { Component, inject } from '@angular/core';
import { Shell } from '../../ui/shell.service';

/** TODO: port design2/site/js/views/objects.js */
@Component({
  selector: 'app-objects-view',
  template: `<div class="ux-page"><p class="pp-body pp-muted">Экран «Объекты» переносится.</p></div>`,
})
export class ObjectsView {
  constructor() {
    inject(Shell).setTitle('Объекты');
  }
}
