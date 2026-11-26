import { Component, inject } from '@angular/core';
import { Shell } from '../../ui/shell.service';

/** TODO: port design2/site/js/views/orders.js */
@Component({
  selector: 'app-orders-view',
  template: `<div class="ux-page"><p class="pp-body pp-muted">Экран «Наряды» переносится.</p></div>`,
})
export class OrdersView {
  constructor() {
    inject(Shell).setTitle('Наряды');
  }
}
