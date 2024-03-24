import { inject, NgModule } from '@angular/core';
import { Router, RouterModule, Routes, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { UserStore } from '@shared/store/user.store';

export function authGuard(): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
  const userStore = inject(UserStore);
  const router = inject(Router);
  if (userStore.isAuthenticated()) {
    return true;
  } else {
    return router.createUrlTree(['/login']);
  }
}

const routes: Routes = [
  {
    path: '',
    redirectTo: 'features',
    pathMatch: 'full',
  },
  {
    path: 'login',
    title: 'Login',
    loadChildren: () => import('./login/login.module').then(m => m.LoginModule),
  },
  {
    path: 'reset',
    title: 'Forgot Password',
    loadChildren: () => import('./reset/reset.module').then(m => m.ResetModule),
  },
  {
    path: 'setup',
    title: 'Initial Setup',
    loadChildren: () => import('./setup/setup.module').then(m => m.SetupModule),
  },
  {
    path: 'features',
    loadChildren: () => import('./features/features.module').then(m => m.FeaturesModule),
    canActivate: [authGuard],
  },
  {
    path: '**',
    redirectTo: 'features',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { bindToComponentInputs: true })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
