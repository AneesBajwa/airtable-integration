import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ClientSideRowModelModule,
  InfiniteRowModelModule,
  ModuleRegistry,
  PaginationModule,
  QuickFilterModule,
  RowApiModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  CustomFilterModule,
  ValidationModule,
} from 'ag-grid-community';
import { AppComponent } from '@/app.component';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  InfiniteRowModelModule,
  PaginationModule,
  QuickFilterModule,
  RowApiModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  CustomFilterModule,
  ValidationModule,
]);

bootstrapApplication(AppComponent, {
  providers: [provideAnimationsAsync(), provideHttpClient(withFetch())],
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
