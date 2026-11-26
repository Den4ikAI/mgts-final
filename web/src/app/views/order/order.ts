import { Component, inject } from '@angular/core';
import { Shell } from '../../ui/shell.service';

/** TODO: port design2/site/js/views/order.js */
@Component({
  selector: 'app-order-view',
  template: `<div class="ux-page"><p class="pp-body pp-muted">Экран «Наряд» переносится.</p></div>`,
})
export class OrderView {
  constructor() {
    inject(Shell).setTitle('Наряд');
  }
}
