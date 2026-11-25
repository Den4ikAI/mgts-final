import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';

/**
 * `<img [mgAuthSrc]="'/api/media/…'">`: <img src> cannot send the bearer token,
 * so the file is fetched through HttpClient (interceptor adds the token) and
 * shown from a blob: URL.
 */
@Directive({ selector: 'img[mgAuthSrc]' })
export class AuthImg implements OnDestroy {
  readonly mgAuthSrc = input<string | null | undefined>();
  private http = inject(HttpClient);
  private el = inject<ElementRef<HTMLImageElement>>(ElementRef);
  private url: string | null = null;
  private sub?: Subscription;

  constructor() {
    effect(() => {
      const src = this.mgAuthSrc();
      this.sub?.unsubscribe();
      this.release();
      if (!src) return;
      this.sub = this.http.get(src, { responseType: 'blob' }).subscribe({
        next: (b) => {
          this.url = URL.createObjectURL(b);
          this.el.nativeElement.src = this.url;
        },
        error: () => this.el.nativeElement.classList.add('mg-img-missing'),
      });
    });
  }

  private release() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.release();
  }
}
