import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AuthService, ROLE_LABEL, Role, User } from '../../core/auth';

/** Admin: create users, change role, disable. Changes end the user's sessions. */
@Component({
  selector: 'app-users',
  imports: [DatePipe],
  template: `
    <h1>Пользователи</h1>
    <table>
      <thead>
        <tr><th class="mg-label">Логин</th><th class="mg-label">Имя</th><th class="mg-label">Роль</th>
            <th class="mg-label">Последний вход</th><th class="mg-label">Доступ</th></tr>
      </thead>
      <tbody>
        @for (u of users(); track u.id) {
          <tr [class.off]="!u.active">
            <td class="mg-data">{{ u.login }}</td>
            <td>{{ u.display_name }}</td>
            <td>
              <select [disabled]="u.id === me()" (change)="patch(u, { role: $any($event.target).value })">
                @for (r of roles; track r) { <option [value]="r" [selected]="r === u.role">{{ label[r] }}</option> }
              </select>
            </td>
            <td class="mg-data">{{ u.last_login_at ? (u.last_login_at | date: 'dd.MM HH:mm') : '—' }}</td>
            <td>
              @if (u.id !== me()) {
                <button class="mg-btn" (click)="patch(u, { active: !u.active })">{{ u.active ? 'Отключить' : 'Включить' }}</button>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>

    <form class="new" (submit)="create($event, login.value, name.value, role.value, pw.value); login.value = ''; pw.value = ''">
      <h2>Новый пользователь</h2>
      <input #login placeholder="логин" required />
      <input #name placeholder="Имя, как в нарядах" required />
      <select #role>@for (r of roles; track r) { <option [value]="r">{{ label[r] }}</option> }</select>
      <input #pw type="password" placeholder="пароль, от 8 символов" autocomplete="new-password" required />
      <button class="mg-btn mg-btn--primary">Создать</button>
    </form>
    @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
  `,
  styles: `
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--line); }
    tr.off td { color: var(--ink-muted); }
    .new { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 24px; }
    .new h2 { width: 100%; margin: 0; font-size: 17px; }
    input, select { height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--line);
                    background: var(--surface-2); color: var(--ink); font: 14px var(--font-sans); }
    .err { color: var(--status-defect); }
  `,
})
export class UsersPage {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  readonly me = computed(() => this.auth.user()?.id);
  readonly roles: Role[] = ['dispatcher', 'manager', 'technician', 'admin'];
  readonly label = ROLE_LABEL;
  readonly users = signal<User[]>([]);
  readonly error = signal('');

  constructor() {
    this.reload();
  }

  reload() {
    this.http.get<User[]>('/api/users').subscribe((u) => this.users.set(u));
  }

  patch(u: User, body: Partial<Pick<User, 'role' | 'active' | 'display_name'>>) {
    this.error.set('');
    this.http.patch<User>(`/api/users/${u.id}`, body).subscribe({
      next: () => this.reload(),
      error: (e) => this.fail(e),
    });
  }

  create(e: Event, login: string, display_name: string, role: string, password: string) {
    e.preventDefault();
    this.error.set('');
    this.http.post<User>('/api/users', { login, display_name, role, password }).subscribe({
      next: () => this.reload(),
      error: (err) => this.fail(err),
    });
  }

  private fail(e: unknown) {
    this.error.set(e instanceof HttpErrorResponse ? (e.error?.error ?? e.message) : String(e));
    this.reload();
  }
}
