import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import {
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type IDatasource,
  type IGetRowsParams,
  type Theme,
  type ValueFormatterParams,
  themeQuartz,
} from 'ag-grid-community';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FieldType, type FieldDescriptor } from '@airtable-integration/shared';
import { ApiService } from '@/services/api.service';

const CLIENT_THRESHOLD = 1000;
const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 300;

const FILTER_FOR_TYPE: Readonly<Record<FieldType, string>> = {
  [FieldType.Number]: 'agNumberColumnFilter',
  [FieldType.Date]: 'agDateColumnFilter',
  [FieldType.String]: 'agTextColumnFilter',
  [FieldType.Boolean]: 'agTextColumnFilter',
  [FieldType.Object]: 'agTextColumnFilter',
};

type Row = Record<string, unknown>;
interface RawRow {
  fields?: Record<string, unknown>;
}

/**
 * AG Grid 33 with dynamic columns. Theme is configured via
 * {@link themeQuartz.withParams} so all visual tokens travel with the
 * component — no global `:root` AG Grid CSS variables needed.
 *
 * Search is owned by this component (input + RxJS debounce); the parent
 * does not see it. Switching entities clears the search box.
 */
@Component({
  selector: 'app-data-grid',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridAngular, MatProgressBarModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './data-grid.component.html',
  styleUrl: './data-grid.component.scss',
})
export class DataGridComponent {
  readonly entity = input<string | null>(null);
  readonly entityCount = input<number>(0);
  readonly reloadKey = input<number>(0);

  private readonly api = inject(ApiService);
  private gridApi: GridApi | null = null;

  /** AG Grid 33 theming via withParams — values match _variables.scss tokens. */
  readonly theme: Theme = themeQuartz.withParams({
    backgroundColor: '#ffffff',
    foregroundColor: '#0a0a0a',
    headerBackgroundColor: '#fafafa',
    headerTextColor: '#0a0a0a',
    headerCellHoverBackgroundColor: '#f4f4f5',
    oddRowBackgroundColor: '#fafafa',
    rowHoverColor: '#f4f4f5',
    selectedRowBackgroundColor: '#f4f4f5',
    borderColor: '#e4e4e7',
    rowBorder: { color: '#e4e4e7', style: 'solid' },
    columnBorder: false,
    wrapperBorder: false,
    headerColumnBorder: false,
    accentColor: '#171717',
    rangeSelectionBorderColor: '#171717',
    rangeSelectionBackgroundColor: 'rgba(24, 24, 27, 0.08)',
    checkboxCheckedBackgroundColor: '#171717',
    fontFamily: { googleFont: 'Geist' },
    fontSize: 13,
    rowHeight: 36,
    headerHeight: 38,
    cellHorizontalPadding: 12,
    wrapperBorderRadius: 0,
    borderRadius: 0,
  });

  readonly paginationPageSize = PAGE_SIZE;

  readonly columnDefs = signal<ColDef[]>([]);
  readonly rowData = signal<Row[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly useInfinite = computed(() => this.entityCount() > CLIENT_THRESHOLD);
  readonly datasource = signal<IDatasource | undefined>(undefined);

  readonly searchDisplay = signal<string>('');
  readonly quickFilterText = signal<string>('');
  private readonly searchSubject = new Subject<string>();

  /** Monotonic load id to discard stale responses from prior entities. */
  private loadSeq = 0;

  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 120,
  };

  constructor() {
    // Debounced search: 300ms after last keystroke, push to the live signal.
    this.searchSubject
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((v) => this.quickFilterText.set(v));

    // Entity / reload effect — clears search and refetches.
    effect(() => {
      const entity = this.entity();
      this.reloadKey(); // intentional: registers dependency so reloadKey changes refire this effect
      this.searchDisplay.set('');
      this.quickFilterText.set('');
      if (entity) {
        void this.loadEntity(entity);
      } else {
        this.columnDefs.set([]);
        this.rowData.set([]);
      }
    });

    // Quick-filter effect — applies via the grid API. Template binding alone
    // doesn't refilter on signal updates in AG Grid 33.
    effect(() => {
      const q = this.quickFilterText();
      if (!this.gridApi) return;
      if (this.useInfinite() && this.datasource()) {
        this.gridApi.purgeInfiniteCache();
      } else {
        this.gridApi.setGridOption('quickFilterText', q);
      }
    });
  }

  onSearchInput(value: string): void {
    this.searchDisplay.set(value);
    this.searchSubject.next(value);
  }

  onClearSearch(): void {
    this.searchDisplay.set('');
    this.searchSubject.next('');
  }

  onGridReady(ev: GridReadyEvent): void {
    this.gridApi = ev.api;
  }

  private async loadEntity(entity: string): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const columns = await firstValueFrom(this.api.getColumns(entity));
      if (seq !== this.loadSeq) return; // stale: user already switched entities
      this.columnDefs.set(this.buildColDefs(columns));

      if (this.useInfinite()) {
        const ds = this.makeDatasource(entity);
        this.datasource.set(ds);
        this.rowData.set([]);
        this.gridApi?.setGridOption('datasource', ds);
      } else {
        const page = await firstValueFrom(
          this.api.fetchPage<RawRow>(entity, { page: 1, pageSize: CLIENT_THRESHOLD }),
        );
        if (seq !== this.loadSeq) return; // stale: discard
        this.rowData.set(page.rows.map((row) => this.flattenRow(row)));
        this.datasource.set(undefined);
      }
    } catch (err) {
      if (seq !== this.loadSeq) return;
      this.error.set(err instanceof Error ? err.message : 'Failed to load collection');
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  private makeDatasource(entity: string): IDatasource {
    return {
      getRows: async (params: IGetRowsParams) => {
        try {
          const page = Math.floor(params.startRow / PAGE_SIZE) + 1;
          const sortModel = params.sortModel?.[0];
          const sort = sortModel ? `${sortModel.colId}:${sortModel.sort}` : undefined;
          const resp = await firstValueFrom(
            this.api.fetchPage<RawRow>(entity, {
              page,
              pageSize: PAGE_SIZE,
              sort,
              q: this.quickFilterText(),
            }),
          );
          if (this.entity() !== entity) return;
          this.error.set(null);
          const rows = resp.rows.map((r) => this.flattenRow(r));
          const lastRow = rows.length < PAGE_SIZE ? params.startRow + rows.length : -1;
          params.successCallback(rows, lastRow);
        } catch (err) {
          if (this.entity() !== entity) return;
          this.error.set(err instanceof Error ? err.message : 'Failed to fetch page');
          params.failCallback();
        }
      },
    };
  }

  private buildColDefs(columns: FieldDescriptor[]): ColDef[] {
    const cols: ColDef[] = [
      {
        field: '_id',
        headerName: 'Record ID',
        minWidth: 200,
        valueFormatter: (p: ValueFormatterParams<Row>) => String(p.value ?? ''),
      },
    ];
    for (const c of columns) {
      cols.push({
        field: c.key,
        headerName: c.key,
        filter: FILTER_FOR_TYPE[c.type],
        cellRenderer: c.type === FieldType.Object ? this.objectCellRenderer : undefined,
      });
    }
    return cols;
  }

  private flattenRow(row: RawRow): Row {
    const fields = row.fields;
    if (fields && typeof fields === 'object') {
      const flat: Row = { ...(row as Row), ...fields };
      delete flat['fields'];
      return flat;
    }
    return row as Row;
  }

  private readonly objectCellRenderer = (p: { value: unknown }): string => {
    if (p.value === null || p.value === undefined) return '';
    if (typeof p.value === 'object') return JSON.stringify(p.value);
    return String(p.value);
  };
}
