import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'queue' },
  { path: 'queue', loadComponent: () => import('./pages/queue/queue').then((m) => m.QueuePage) },
  { path: 'objects', loadComponent: () => import('./pages/objects/objects').then((m) => m.ObjectsPage) },
  { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage) },
];
