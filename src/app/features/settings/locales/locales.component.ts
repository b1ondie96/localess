import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { filter, switchMap } from 'rxjs/operators';
import { LocaleDialogComponent } from './locale-dialog/locale-dialog.component';
import { LocaleDialogModel } from './locale-dialog/locale-dialog.model';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { ConfirmationDialogComponent } from '@shared/components/confirmation-dialog/confirmation-dialog.component';
import { ConfirmationDialogModel } from '@shared/components/confirmation-dialog/confirmation-dialog.model';
import { LocaleService } from '@shared/services/locale.service';
import { Locale } from '@shared/models/locale.model';
import { NotificationService } from '@shared/services/notification.service';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { SpaceStore } from '@shared/store/space.store';

@Component({
  selector: 'll-space-settings-locales',
  templateUrl: './locales.component.html',
  styleUrls: ['./locales.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalesComponent {
  sort = viewChild.required(MatSort);
  paginator = viewChild.required(MatPaginator);

  isLoading = signal(true);
  spaceStore = inject(SpaceStore);

  dataSource: MatTableDataSource<Locale> = new MatTableDataSource<Locale>([]);
  displayedColumns: string[] = ['id', 'name', 'isLocaleTranslatable', 'fallback', 'actions'];

  private destroyRef = inject(DestroyRef);

  constructor(
    readonly localeService: LocaleService,
    private readonly dialog: MatDialog,
    private readonly cd: ChangeDetectorRef,
    private readonly notificationService: NotificationService,
  ) {
    toObservable(this.spaceStore.selectedSpace)
      .pipe(
        filter(it => it !== undefined), // Skip initial data
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: space => {
          this.dataSource = new MatTableDataSource<Locale>(space!.locales);
          this.dataSource.sort = this.sort();
          this.dataSource.paginator = this.paginator();
          this.isLoading.set(false);
          this.cd.markForCheck();
        },
      });
  }

  openAddDialog(): void {
    const { id, locales } = this.spaceStore.selectedSpace()!;
    this.dialog
      .open<LocaleDialogComponent, Locale[], LocaleDialogModel>(LocaleDialogComponent, {
        width: '500px',
        data: locales,
      })
      .afterClosed()
      .pipe(
        filter(it => it !== undefined),
        switchMap(it => this.localeService.create(id, it!.locale)),
      )
      .subscribe({
        next: () => {
          this.notificationService.success('Locale has been added.');
        },
        error: (err: unknown) => {
          console.error(err);
          this.notificationService.error('Locale can not be added.');
        },
      });
  }

  openDeleteDialog(element: Locale): void {
    const spaceId = this.spaceStore.selectedSpaceId();
    this.dialog
      .open<ConfirmationDialogComponent, ConfirmationDialogModel, boolean>(ConfirmationDialogComponent, {
        data: {
          title: 'Delete Locale',
          content: `Are you sure about deleting Locale with name '${element.name}'.`,
        },
      })
      .afterClosed()
      .pipe(
        filter(it => it || false),
        switchMap(() => this.localeService.delete(spaceId!, element)),
      )
      .subscribe({
        next: () => {
          const idx: number = this.dataSource.data.findIndex(x => x.id === element.id);
          if (idx !== -1) {
            this.dataSource.data.splice(idx, 1);
            this.dataSource._updateChangeSubscription();
          }
          this.notificationService.success(`Locale '${element.name}' has been deleted.`);
        },
        error: () => {
          this.notificationService.error(`Locale '${element.name}' can not be deleted.`);
        },
      });
  }

  markAsFallback(element: Locale): void {
    const spaceId = this.spaceStore.selectedSpaceId();
    if (spaceId) {
      this.localeService.markAsFallback(spaceId, element).subscribe({
        next: () => {
          this.notificationService.success(`Locale '${element.name}' has been marked as fallback.`);
        },
        error: () => {
          this.notificationService.error(`Locale '${element.name}' can not be marked as fallback.`);
        },
      });
    }
  }

  isSupport(locale: string): boolean {
    return this.localeService.isLocaleTranslatable(locale);
  }
}
