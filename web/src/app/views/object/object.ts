import { Component, inject } from '@angular/core';
import { Shell } from '../../ui/shell.service';

/** TODO: port design2/site/js/views/object.js */
@Component({
  selector: 'app-object-view',
  template: `<div class="ux-page"><p class="pp-body pp-muted">Экран «Объект» переносится.</p></div>`,
})
export class ObjectView {
  constructor() {
    inject(Shell).setTitle('Объект');
  }
}
