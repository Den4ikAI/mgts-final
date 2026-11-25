import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth';

@Component({
  selector: 'app-login',
  template: `
    <form class="box" (submit)="submit($event, login.value, password.value)">
      <h1>Вход</h1>
      <label>
        <span class="mg-label">Логин</span>
        <input #login name="login" autocomplete="username" required autofocus />
      </label>
      <label>
        <span class="mg-label">Пароль</span>
        <input #password name="password" type="password" autocomplete="current-password" required />
      </label>
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
      <button class="mg-btn mg-btn--primary mg-btn--large" [disabled]="busy()">
        {{ busy() ? 'Входим…' : 'Войти' }}
      </button>
    </form>
  `,
  styles: `
    :host { display: grid; place-items: center; min-height: 70vh; }
    .box { width: min(360px, 100%); display: flex; flex-direction: column; gap: 14px; padding: 24px;
           border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
    h1 { margin: 0; font-family: var(--font-display); font-size: 22px; }
    label { display: flex; flex-direction: column; gap: 6px; }
    input { height: 44px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--line);
            background: var(--surface-2); color: var(--ink); font: 15px var(--font-sans); }
    .err { margin: 0; color: var(--status-defect); font-size: 14px; }
    button { justify-content: center; }
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly error = signal('');
  readonly busy = signal(false);

  async submit(e: Event, login: string, password: string) {
    e.preventDefault();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(login, password);
      const next = this.route.snapshot.queryParamMap.get('next');
      this.router.navigateByUrl(next && next !== '/login' ? next : this.auth.home());
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      this.error.set(
        status === 401 ? 'Неверный логин или пароль'
        : status === 403 ? 'Учётная запись отключена'
        : 'Сервер недоступен, попробуйте ещё раз',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
