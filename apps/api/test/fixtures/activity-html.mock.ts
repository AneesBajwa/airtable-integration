import type { ActivityEnvelope } from '@/modules/scraper/activity-parser.js';

/**
 * Fixtures matching the real Airtable response shape (JSON envelope with HTML cell
 * diffs embedded in `diffRowHtml`). Column-type values match what Airtable emits via
 * `data-columntype` (e.g. `select`, `collaborator`, `multilineText`).
 */

export interface ChangeFixture {
  type: string;
  oldVal?: string;
  newVal?: string;
}

function cellContainer(c: ChangeFixture): string {
  const hasOld = (c.oldVal ?? '') !== '';
  const cls = hasOld ? 'historicalCellValue textDiff' : 'historicalCellValue nullToValue';
  const oldSpan = hasOld
    ? `<span class="pre-wrap strikethrough">${c.oldVal}</span>`
    : '';
  const newSpan = c.newVal
    ? `<span class="pre-wrap colors-background-success">${c.newVal}</span>`
    : '';
  return `
    <div class="historicalCellContainer">
      <div class="${cls}" data-columntype="${c.type}">
        ${oldSpan}${newSpan}
      </div>
    </div>
  `;
}

export const buildEnvelope = (
  activityId: string,
  user: string,
  time: string,
  changes: ChangeFixture[],
): ActivityEnvelope => ({
  data: {
    orderedActivityAndCommentIds: [activityId],
    rowActivityInfoById: {
      [activityId]: {
        createdTime: time,
        originatingUserId: user,
        diffRowHtml: changes.map(cellContainer).join(''),
        groupType: 'edit',
      },
    },
  },
});

export const COMMENT_ONLY_ENVELOPE: ActivityEnvelope = {
  data: {
    orderedActivityAndCommentIds: ['c1'],
    rowActivityInfoById: {
      c1: {
        createdTime: '2024-06-01T00:00:00Z',
        originatingUserId: 'u',
        diffRowHtml: '',
        groupType: 'comment',
      },
    },
  },
};
