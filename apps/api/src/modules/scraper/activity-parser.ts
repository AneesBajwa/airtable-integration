import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { ColumnType, type RevisionHistoryEntry } from '@airtable-integration/shared';

/**
 * Parse Airtable's revision-history response.
 *
 * The envelope is JSON but the cell-level diff is HTML embedded in
 * `data.rowActivityInfoById[id].diffRowHtml`. Cheerio walks
 * `.historicalCellContainer` blocks and emits one entry per (activity, column)
 * where the column is a Status or Assignee.
 *
 * Shape is undocumented — Airtable can change it without warning.
 */

export interface ActivityInfo {
  createdTime?: string;
  originatingUserId?: string;
  diffRowHtml?: string;
  groupType?: string;
}

export interface ActivityEnvelope {
  data?: {
    orderedActivityAndCommentIds?: string[];
    rowActivityInfoById?: Record<string, ActivityInfo>;
  };
}

// Airtable's `data-columntype` values for the columns we track.
const STATUS_TYPES = new Set(['select', 'multipleSelects']);
const ASSIGNEE_TYPES = new Set(['collaborator', 'multipleCollaborators']);

function classify(rawType: string): ColumnType | null {
  if (STATUS_TYPES.has(rawType)) return ColumnType.Status;
  if (ASSIGNEE_TYPES.has(rawType)) return ColumnType.Assignee;
  return null;
}

interface ParsedChange {
  columnType: string;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Walk one cell container and pull out the column type + old/new values.
 *
 * Three shapes seen in the wild:
 *   - `.historicalCellValue.nullToValue`: initial creation, no old value
 *   - `.textDiff` with `<span class="strikethrough">old</span> <span class="success">new</span>`
 *   - `.pill.cellToken` markers for select/collaborator changes — extracted from `title=""`
 */
function parseCell($: cheerio.CheerioAPI, cell: AnyNode): ParsedChange | null {
  const $cell = $(cell);
  const $valueEl = $cell.find('[data-columntype]').first();
  const columnType = $valueEl.attr('data-columntype') ?? '';
  if (!columnType) return null;

  // Initial creation (no prior value).
  if ($valueEl.hasClass('nullToValue')) {
    const newValue = extractValue($valueEl);
    return { columnType, oldValue: null, newValue };
  }

  // Text diff: strikethrough = old, success = new.
  const oldText = $valueEl.find('.strikethrough').text().trim();
  const newText = $valueEl
    .find('.colors-background-success, .pill.cellToken')
    .last()
    .text()
    .trim();
  if (oldText || newText) {
    return {
      columnType,
      oldValue: oldText || null,
      newValue: newText || null,
    };
  }

  // Fallback: bare value with no diff markers.
  return { columnType, oldValue: null, newValue: extractValue($valueEl) };
}

function extractValue($el: cheerio.Cheerio<AnyNode>): string | null {
  // Prefer `title=""` on pill tokens (cleaner than nested text).
  const titled = $el.find('[title]').first().attr('title');
  if (titled) return titled;
  const text = $el.text().trim();
  return text || null;
}

export function parseActivityResponse(
  envelope: ActivityEnvelope,
  issueId: string,
): RevisionHistoryEntry[] {
  const byId = envelope.data?.rowActivityInfoById ?? {};
  const order = envelope.data?.orderedActivityAndCommentIds ?? Object.keys(byId);

  const out: RevisionHistoryEntry[] = [];
  for (const activityId of order) {
    const activity = byId[activityId];
    if (!activity?.diffRowHtml) continue;
    const $ = cheerio.load(activity.diffRowHtml);

    $('.historicalCellContainer').each((_, el) => {
      const change = parseCell($, el);
      if (!change) return;
      const normalized = classify(change.columnType);
      if (!normalized) return;

      out.push({
        uuid: `${activityId}:${change.columnType}`,
        issueId,
        columnType: normalized,
        oldValue: change.oldValue,
        newValue: change.newValue,
        createdDate: activity.createdTime
          ? new Date(activity.createdTime).toISOString()
          : new Date().toISOString(),
        authoredBy: activity.originatingUserId ?? '',
      });
    });
  }
  return out;
}
