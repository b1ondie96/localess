import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { debounceTime, EMPTY, Observable, startWith } from 'rxjs';
import { filter, map, switchMap, tap } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { FormControl } from '@angular/forms';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { TranslationService } from '@shared/services/translation.service';
import { SpaceService } from '@shared/services/space.service';
import { Locale } from '@shared/models/locale.model';
import { Translation, TranslationCreate, TranslationStatus, TranslationUpdate } from '@shared/models/translation.model';
import { Space } from '@shared/models/space.model';
import { ObjectUtils } from '@core/utils/object-utils.service';
import { ConfirmationDialogComponent } from '@shared/components/confirmation-dialog/confirmation-dialog.component';
import { ConfirmationDialogModel } from '@shared/components/confirmation-dialog/confirmation-dialog.model';
import { TranslateService } from '@shared/services/translate.service';
import { LocaleService } from '@shared/services/locale.service';
import { NotificationService } from '@shared/services/notification.service';
import { TaskService } from '@shared/services/task.service';
import { ExportDialogComponent } from './export-dialog/export-dialog.component';
import { ExportDialogModel, ExportDialogReturn } from './export-dialog/export-dialog.model';
import { ImportDialogComponent } from './import-dialog/import-dialog.component';
import { ImportDialogModel, ImportDialogReturn } from './import-dialog/import-dialog.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslationHistory } from '@shared/models/translation-history.model';
import { TranslationHistoryService } from '@shared/services/translation-history.service';
import { EditDialogComponent, EditDialogModel } from './edit-dialog';
import { AddDialogComponent, AddDialogModel, AddDialogReturnModel } from './add-dialog';
import { EditIdDialogComponent, EditIdDialogModel } from './edit-id-dialog';

@Component({
  selector: 'll-translations',
  templateUrl: './translations.component.html',
  styleUrls: ['./translations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TranslationsComponent implements OnInit {
  labelsInput = viewChild.required<ElementRef<HTMLInputElement>>('labelsInput');
  // Input
  spaceId = input.required<string>();

  selectedSpace?: Space;
  showHistory = false;

  DEFAULT_LOCALE = 'en';

  //Search
  searchCtrl: FormControl = new FormControl();
  searchValue = '';

  //Labels
  availableLabels: string[] = [];
  selectedLabels: string[] = [];
  labelCtrl: FormControl = new FormControl();
  filteredLabels: Observable<string[]>;

  selectedTranslation?: Translation;
  selectedTranslationLocaleValue?: string;
  translateValue?: string;

  selectedSearchLocale = '';
  selectedSourceLocale = '';
  selectedTargetLocale = '';

  // Subscriptions
  history$?: Observable<TranslationHistory[]>;
  space$?: Observable<Space>;
  translations$?: Observable<Translation[]>;

  //Loadings
  isLoading = signal(true);
  isPublishLoading = signal(false);
  isLocaleUpdateLoading = signal(false);
  isTranslateLoading = signal(false);

  translations = signal<Translation[]>([]);
  translationIds = computed(() => this.translations().map(it => it.id));

  private destroyRef = inject(DestroyRef);

  constructor(
    private readonly translationService: TranslationService,
    private readonly translateHistoryService: TranslationHistoryService,
    private readonly localeService: LocaleService,
    private readonly spaceService: SpaceService,
    private readonly taskService: TaskService,
    private readonly notificationService: NotificationService,
    private readonly dialog: MatDialog,
    private readonly cd: ChangeDetectorRef,
    private readonly translateService: TranslateService
  ) {
    this.filteredLabels = this.labelCtrl.valueChanges.pipe(
      startWith(null),
      map((label: string | null) => (label ? this._filter(label) : this.availableLabels.slice())),
      takeUntilDestroyed(this.destroyRef)
    );
  }

  ngOnInit(): void {
    this.searchCtrl.valueChanges.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: value => {
        this.searchValue = value;
        this.cd.markForCheck();
      },
    });
    this.space$ = this.spaceService.findById(this.spaceId()).pipe(
      tap(space => {
        this.selectedSpace = space;
        //this.locales = space.locales;
        if (this.selectedSearchLocale === '') {
          this.selectedSearchLocale = space.localeFallback.id;
        }
        if (this.selectedSourceLocale === '') {
          this.selectedSourceLocale = space.localeFallback.id;
        }
        if (this.selectedTargetLocale === '') {
          this.selectedTargetLocale = space.localeFallback.id;
        }
      })
    );
    this.translations$ = this.translationService.findAll(this.spaceId()).pipe(
      tap(translations => {
        this.translations.set(translations);
        if (translations.length > 0) {
          if (this.selectedTranslation) {
            const tr = translations.find(it => it.id === this.selectedTranslation?.id);
            if (tr) {
              this.selectTranslation(tr);
            } else {
              this.selectTranslation(translations[0]);
            }
          } else {
            this.selectTranslation(translations[0]);
          }
        }
        this.groupAvailableLabels(translations);
        this.isLoading.set(false);
      })
    );
    this.history$ = this.translateHistoryService.findAll(this.spaceId());
  }

  publish(): void {
    this.isPublishLoading.set(true);
    this.translationService.publish(this.spaceId()).subscribe({
      next: () => {
        this.notificationService.success('Translations has been published.');
      },
      error: () => {
        this.notificationService.error('Translations can not be published.');
      },
      complete: () => {
        setTimeout(() => {
          this.isPublishLoading.set(false);
          this.cd.markForCheck();
        }, 1000);
      },
    });
  }

  openAddDialog(): void {
    this.dialog
      .open<AddDialogComponent, AddDialogModel, AddDialogReturnModel>(AddDialogComponent, {
        width: '500px',
        data: {
          reservedIds: this.translationIds(),
        },
      })
      .afterClosed()
      .pipe(
        filter(it => it !== undefined),
        switchMap(it => {
          const tc: TranslationCreate = {
            id: it!.id,
            type: it!.type,
            locale: this.selectedSpace!.localeFallback.id,
            value: it!.value,
            labels: it?.labels,
            description: it?.description,
            autoTranslate: it?.autoTranslate,
          };
          return this.translationService.create(this.spaceId(), tc);
        })
      )
      .subscribe({
        next: () => {
          this.notificationService.success('Translation has been added.');
        },
        error: () => {
          this.notificationService.error('Translation can not be added.');
        },
      });
  }

  openEditIdDialog(translation: Translation): void {
    this.dialog
      .open<EditIdDialogComponent, EditIdDialogModel, string>(EditIdDialogComponent, {
        width: '500px',
        data: {
          id: translation.id,
          reservedIds: this.translationIds(),
        },
      })
      .afterClosed()
      .pipe(
        filter(it => it !== undefined),
        switchMap(it => {
          return this.translationService.updateId(this.spaceId(), translation, it!);
        })
      )
      .subscribe({
        next: () => {
          this.notificationService.success('Translation ID has been updated.');
        },
        error: err => {
          console.error(err);
          this.notificationService.error('Translation ID can not be updated.');
        },
      });
  }

  openEditDialog(translation: Translation): void {
    this.dialog
      .open<EditDialogComponent, Translation, EditDialogModel>(EditDialogComponent, {
        width: '500px',
        data: ObjectUtils.clone(translation),
      })
      .afterClosed()
      .pipe(
        filter(it => it !== undefined),
        switchMap(it => {
          const tu: TranslationUpdate = {
            labels: it!.labels,
            description: it!.description,
          };
          return this.translationService.update(this.spaceId(), translation.id, tu);
        })
      )
      .subscribe({
        next: () => {
          this.notificationService.success('Translation has been updated.');
        },
        error: () => {
          this.notificationService.error('Translation can not be updated.');
        },
      });
  }

  openDeleteDialog(element: Translation): void {
    this.dialog
      .open<ConfirmationDialogComponent, ConfirmationDialogModel>(ConfirmationDialogComponent, {
        data: {
          title: 'Delete Translation',
          content: `Are you sure about deleting Translation with ID '${element.id}'.`,
        },
      })
      .afterClosed()
      .pipe(
        filter(it => it),
        switchMap(() => this.translationService.delete(this.spaceId(), element.id))
      )
      .subscribe({
        next: () => {
          this.notificationService.success('Translation has been deleted.');
        },
        error: () => {
          this.notificationService.error('Translation can not be deleted.');
        },
      });
  }

  openImportDialog(locales: Locale[]): void {
    this.dialog
      .open<ImportDialogComponent, ImportDialogModel, ImportDialogReturn>(ImportDialogComponent, {
        width: '500px',
        data: {
          locales: locales,
        },
      })
      .afterClosed()
      .pipe(
        filter(it => it !== undefined),
        switchMap(it => {
          if (it?.kind === 'FLAT') {
            return this.taskService.createTranslationImportTask(this.spaceId(), it.file, it.locale);
          } else if (it?.kind === 'FULL') {
            return this.taskService.createTranslationImportTask(this.spaceId(), it.file);
          }
          return EMPTY;
        })
      )
      .subscribe({
        next: () => {
          this.notificationService.success('Translation Import Task has been created.', [
            {
              label: 'To Tasks',
              link: `/features/spaces/${this.spaceId()}/tasks`,
            },
          ]);
        },
        error: () => {
          this.notificationService.error('Translation Import Task can not be created.');
        },
      });
  }

  openExportDialog(locales: Locale[]): void {
    this.dialog
      .open<ExportDialogComponent, ExportDialogModel, ExportDialogReturn>(ExportDialogComponent, {
        width: '500px',
        data: {
          locales: locales,
        },
      })
      .afterClosed()
      .pipe(
        filter(it => it !== undefined),
        switchMap(it => {
          console.log(it);
          if (it?.kind === 'FLAT') {
            return this.taskService.createTranslationExportTask(this.spaceId(), it.fromDate, it.locale);
          } else if (it?.kind === 'FULL') {
            return this.taskService.createTranslationExportTask(this.spaceId(), it.fromDate);
          }
          return EMPTY;
        })
      )
      .subscribe({
        next: () => {
          this.notificationService.success('Translation Export Task has been created.', [
            {
              label: 'To Tasks',
              link: `/features/spaces/${this.spaceId()}/tasks`,
            },
          ]);
        },
        error: (err: unknown) => {
          console.error(err);
          this.notificationService.error('Translation Export Task can not be created.');
        },
      });
  }

  selectTranslation(translation: Translation): void {
    this.selectedTranslation = translation;
    this.translateValue = undefined;
  }

  updateLocale(transaction: Translation, locale: string, value: string): void {
    this.isLocaleUpdateLoading.set(true);
    this.translationService.updateLocale(this.spaceId(), transaction.id, locale, value).subscribe({
      next: () => {
        this.notificationService.success('Translation has been updated.');
      },
      error: () => {
        this.notificationService.error('Translation can not be updated.');
      },
      complete: () => {
        setTimeout(() => {
          this.isLocaleUpdateLoading.set(false);
          this.cd.markForCheck();
        }, 1000);
      },
    });
  }

  // Labels
  selectLabel(event: MatAutocompleteSelectedEvent): void {
    this.selectedLabels = [...this.selectedLabels, event.option.viewValue];
    this.labelsInput().nativeElement.value = '';
    this.selectedTranslation = undefined;
    this.labelCtrl.setValue(null);
  }

  removeLabel(label: string): void {
    const tmpArray: string[] = [...this.selectedLabels];
    const index: number = tmpArray.indexOf(label);
    if (index >= 0) {
      tmpArray.splice(index, 1);
    }
    // for translationFilter pipe do change instance.
    this.selectedLabels = [...tmpArray];
    this.selectedTranslation = undefined;
  }

  private _filter(value: string): string[] {
    if (!value) {
      return this.availableLabels;
    }
    const filterValue: string = value.toLowerCase();
    return this.availableLabels.filter(label => label.toLowerCase().indexOf(filterValue) === 0);
  }

  groupAvailableLabels(input: Translation[]): void {
    input
      .map(it => it.labels)
      .flat()
      .forEach(it => {
        if (it && !this.availableLabels.find(el => el === it)) {
          this.availableLabels.push(it);
        }
      });
  }

  openPublishedInNewTab(locale: string): void {
    const url = `${location.origin}/api/v1/spaces/${this.spaceId()}/translations/${locale}`;
    window.open(url, '_blank');
  }

  translate(): void {
    this.isTranslateLoading.set(true);
    this.translateService
      .translate({
        content: this.selectedTranslation?.locales[this.selectedSourceLocale] || '',
        sourceLocale: this.selectedSourceLocale,
        targetLocale: this.selectedTargetLocale,
      })
      .subscribe({
        next: value => {
          // make sure the component is updated
          this.translateValue = '';
          this.cd.detectChanges();
          this.notificationService.success('Translated');
          this.translateValue = value;
          this.cd.markForCheck();
        },
        error: (err: unknown) => {
          console.error(err);
          this.notificationService.error('Can not be translation.', [
            {
              label: 'Documentation',
              link: 'https://github.com/Lessify/localess/wiki/Setup#cloud-translation-api-not-enabled',
            },
          ]);
        },
        complete: () => {
          setTimeout(() => {
            this.isTranslateLoading.set(false);
            this.cd.markForCheck();
          }, 1000);
        },
      });
  }

  isLocaleTranslatable(sourceLocale: string, targetLocale: string): boolean {
    if (sourceLocale === targetLocale) {
      return false;
    }
    return this.localeService.isLocaleTranslatable(sourceLocale) && this.localeService.isLocaleTranslatable(targetLocale);
  }

  identifyStatus(translate: Translation): TranslationStatus {
    const locales = this.selectedSpace?.locales || [];
    if (Object.getOwnPropertyNames(translate.locales).length === 0) return TranslationStatus.UNTRANSLATED;
    let translateCount = 0;
    for (const locale of locales) {
      if (locale.id in translate.locales && translate.locales[locale.id] !== '') {
        translateCount++;
      }
    }
    if (locales.length === translateCount) {
      return TranslationStatus.TRANSLATED;
    }
    if (translateCount === 0) {
      return TranslationStatus.UNTRANSLATED;
    }
    return TranslationStatus.PARTIALLY_TRANSLATED;
  }
}
