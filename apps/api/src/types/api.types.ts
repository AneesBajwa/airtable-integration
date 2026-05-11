/** Request/response shapes for the API's own routes. */

export interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

export interface CollectionListQuery {
  page?: string;
  pageSize?: string;
  sort?: string;
  q?: string;
}

export interface MfaSubmitBody {
  code?: string;
}
