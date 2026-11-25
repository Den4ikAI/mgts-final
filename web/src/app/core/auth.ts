import { HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, from, switchMap, throwError } from 'rxjs';

export type Role = 'admin' | 'dispatcher' | 'manager' | 'technician';
export type Perm =
  | 'objects_read'
  | 'review'
  | 'stats_read'
  | 'work_orders_manage'
  | 'work_orders_own'
  | 'users_manage'
  | 'dev_tools';

export interface User {
  id: string;
  login: string;
  display_name: string;
  role: Role;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
  permissions: Perm[];
}

interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: User;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Администратор',
  dispatcher: 'Диспетчер',
  manager: 'Руководитель',
  technician: 'Бригада',
};

/** Where each role lands after login. */
const HOME: Record<Role, string> = {
  admin: '/queue',
  dispatcher: '/queue',
  manager: '/dashboard',
  technician: '/objects',
};

/**
 * Session state. The access token lives only in memory; the refresh token is an
 * HttpOnly cookie the browser sends to /api/auth/* by itself, so a page reload
 * restores the session via `restore()` and JS never sees the long-lived secret.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly user = signal<User | null>(null);
  readonly token = signal<string | null>(null);
  readonly loggedIn = computed(() => this.user() !== null);

  private refreshing: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  can(p: Perm) {
    return this.user()?.permissions.includes(p) ?? false;
  }
  home() {
    const u = this.user();
    return u ? HOME[u.role] : '/login';
  }

  async login(login: string, password: string) {
    const r = await firstValueFrom(this.http.post<TokenResponse>('/api/auth/login', { login, password }));
    this.accept(r);
  }

  /** Called once at startup: try the refresh cookie. */
  restore() {
    return this.refresh();
  }

  /** Single-flight: concurrent 401s share one refresh request. */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async doRefresh(retry = true): Promise<boolean> {
    try {
      this.accept(await firstValueFrom(this.http.post<TokenResponse>('/api/auth/refresh', {})));
      return true;
    } catch (e) {
      // Another tab rotated the cookie a moment ago: the new one is already in the jar.
      const rotated = e instanceof HttpErrorResponse && e.status === 401 && /retry/.test(e.error?.error ?? '');
      if (rotated && retry) {
        await new Promise((r) => setTimeout(r, 300));
        return this.doRefresh(false);
      }
      this.clear();
      return false;
    }
  }

  async logout() {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } finally {
      this.clear();
      this.router.navigateByUrl('/login');
    }
  }

  /** Called by the interceptor when even a refresh did not help. */
  expired() {
    if (!this.user()) return;
    this.clear();
    this.router.navigate(['/login'], { queryParams: { next: this.router.url } });
  }

  private accept(r: TokenResponse) {
    this.token.set(r.access_token);
    this.user.set(r.user);
    clearTimeout(this.timer);
    // Refresh a minute before expiry so the user never sees a 401.
    const ms = Math.max(10, r.expires_in - 60) * 1000;
    this.timer = setTimeout(() => this.refresh(), ms);
  }

  private clear() {
    clearTimeout(this.timer);
    this.token.set(null);
    this.user.set(null);
  }
}

const NO_AUTH = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];

/** Adds the bearer token; on 401 refreshes once and replays the request. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || NO_AUTH.some((u) => req.url.startsWith(u))) return next(req);
  const auth = inject(AuthService);
  const withToken = (r: HttpRequest<unknown>) => {
    const t = auth.token();
    return t ? r.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : r;
  };
  return next(withToken(req)).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);
      return from(auth.refresh()).pipe(
        switchMap((ok) => {
          if (!ok) {
            auth.expired();
            return throwError(() => err);
          }
          return next(withToken(req));
        }),
      );
    }),
  );
};

/** Route guard: logged in, and (optionally) holds `perm`. */
export const requirePerm =
  (perm?: Perm): CanActivateFn =>
  (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.loggedIn()) return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
    if (perm && !auth.can(perm)) return router.createUrlTree([auth.home()]);
    return true;
  };

export const guestOnly: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.loggedIn() ? inject(Router).createUrlTree([auth.home()]) : true;
};
