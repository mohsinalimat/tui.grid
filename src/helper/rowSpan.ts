import {
  Data,
  ColumnInfo,
  RowSpan,
  RowKey,
  Row,
  RowCoords,
  Range,
  SortState
} from '../store/types';
import { findPropIndex, isEmpty, findProp, isNull } from './common';
import { getSortedRange } from './selection';

function getMainRowSpan(columnName: string, rowSpan: RowSpan, data: Row[]) {
  const { mainRow, mainRowKey } = rowSpan;
  if (mainRow) {
    return rowSpan;
  }

  const mainRowIndex = findPropIndex('rowKey', mainRowKey, data);

  return data[mainRowIndex].rowSpanMap[columnName];
}

function getRowSpanRange(
  rowRange: Range,
  colRange: Range,
  visibleColumns: ColumnInfo[],
  data: Data
): Range {
  const [startColumnIndex, endColumnIndex] = colRange;
  let [startRowIndex, endRowIndex] = rowRange;

  for (let index = startColumnIndex; index <= endColumnIndex; index += 1) {
    const { rawData } = data;
    const { rowSpanMap: startRowSpanMap } = rawData[startRowIndex];
    const { rowSpanMap: endRowSpanMap } = rawData[endRowIndex];
    const columnName = visibleColumns[index].name;

    // get top row index of topmost rowSpan
    if (startRowSpanMap[columnName]) {
      const { mainRowKey } = startRowSpanMap[columnName];
      const topRowSpanIndex = findPropIndex('rowKey', mainRowKey, rawData);
      startRowIndex = startRowIndex > topRowSpanIndex ? topRowSpanIndex : startRowIndex;
    }
    // get bottom row index of bottommost rowSpan
    if (endRowSpanMap[columnName]) {
      const { mainRowKey, spanCount } = endRowSpanMap[columnName];
      const bottomRowSpanIndex = findPropIndex('rowKey', mainRowKey, rawData) + spanCount - 1;
      endRowIndex = endRowIndex < bottomRowSpanIndex ? bottomRowSpanIndex : endRowIndex;
    }
  }
  return startRowIndex !== rowRange[0] || endRowIndex !== rowRange[1]
    ? getRowSpanRange([startRowIndex, endRowIndex], colRange, visibleColumns, data)
    : [startRowIndex, endRowIndex];
}

export function getMaxRowSpanRange(
  rowRange: Range,
  colRange: Range,
  visibleColumns: ColumnInfo[],
  focusRowIndex: number | null,
  data: Data
): Range {
  const sortedColRange = getSortedRange(colRange);
  const endRowIndex = rowRange[1];

  let startRowIndex = rowRange[0];

  // if start row index is different from focused index,
  // change start row index to focused row index for getting proper row range
  startRowIndex =
    !isNull(focusRowIndex) && startRowIndex !== focusRowIndex ? focusRowIndex : startRowIndex;

  const sortedRowRange = getSortedRange([startRowIndex, endRowIndex]);

  const [startRowSpanIndex, endRowSpanIndex] = getRowSpanRange(
    sortedRowRange,
    sortedColRange,
    visibleColumns,
    data
  );

  return startRowIndex > endRowIndex
    ? [endRowSpanIndex, startRowSpanIndex]
    : [startRowSpanIndex, endRowSpanIndex];
}

export function getRowRangeWithRowSpan(
  rowRange: Range,
  colRange: Range,
  visibleColumnsWithRowHeader: ColumnInfo[],
  rowIndex: number | null,
  data: Data
): Range {
  if (isRowSpanEnabled(data.sortState)) {
    return getMaxRowSpanRange(rowRange, colRange, visibleColumnsWithRowHeader, rowIndex, data);
  }

  return rowRange;
}

export function getVerticalPosWithRowSpan(
  columnName: string,
  rowSpan: RowSpan,
  rowCoords: RowCoords,
  data: Row[]
) {
  const mainRowSpan = getMainRowSpan(columnName, rowSpan, data);
  const mainRowIndex = findPropIndex('rowKey', mainRowSpan.mainRowKey, data);
  const { spanCount } = mainRowSpan;

  const top = rowCoords.offsets[mainRowIndex];
  let bottom = top;

  for (let count = 0; count < spanCount; count += 1) {
    bottom += rowCoords.heights[mainRowIndex + count];
  }
  return [top, bottom];
}

export function getRowSpan(rowIndex: number, columnName: string, data: Row[]): RowSpan {
  const { rowSpanMap } = data[rowIndex];
  return rowSpanMap[columnName];
}

/*
 * get top row index of specific rowSpan cell
 */
export function getRowSpanTopIndex(rowIndex: number, columnName: string, data: Row[]) {
  const rowSpan = getRowSpan(rowIndex, columnName, data);
  if (!rowSpan) {
    return rowIndex;
  }

  return findPropIndex('rowKey', rowSpan.mainRowKey, data);
}

/*
 * get bottom row index of specific rowSpan cell
 */
export function getRowSpanBottomIndex(rowIndex: number, columnName: string, data: Row[]) {
  const rowSpan = getRowSpan(rowIndex, columnName, data);
  if (!rowSpan) {
    return rowIndex;
  }

  const mainRowIndex = findPropIndex('rowKey', rowSpan.mainRowKey, data);

  return mainRowIndex + rowSpan.spanCount - 1;
}

export function getRowSpanByRowKey(rowKey: RowKey, columnName: string, data: Row[]) {
  const rowIndex = findPropIndex('rowKey', rowKey, data);
  if (rowIndex === -1) {
    return null;
  }
  return getRowSpan(rowIndex, columnName, data) || null;
}

/*
 * get max rowSpan count in all columns that have rowSpan
 */
export function getMaxRowSpanCount(rowIndex: number, data: Row[]) {
  const { rowSpanMap } = data[rowIndex];

  if (isEmpty(rowSpanMap)) {
    return 0;
  }

  return Object.keys(rowSpanMap).reduce(
    (acc, columnName) => Math.max(acc, rowSpanMap[columnName].spanCount),
    0
  );
}

export function isRowSpanEnabled(sortState: SortState) {
  return sortState.columns[0].columnName === 'sortKey';
}

export function createRowSpan(
  mainRow: boolean,
  rowKey: RowKey,
  count: number,
  spanCount: number
): RowSpan {
  return { mainRow, mainRowKey: rowKey, count, spanCount };
}

function updateSubRowSpan(
  data: Row[],
  mainRow: Row,
  columnName: string,
  startOffset: number,
  spanCount: number
) {
  const mainRowIndex = findPropIndex('rowKey', mainRow.rowKey, data);

  for (let offset = startOffset; offset < spanCount; offset += 1) {
    const row = data[mainRowIndex + offset];
    row.rowSpanMap[columnName] = createRowSpan(false, mainRow.rowKey, -offset, spanCount);
  }
}

export function updateRowSpanWhenAppend(data: Row[], prevRow: Row, extendPrevRowSpan: boolean) {
  const { rowSpanMap: prevRowSpanMap } = prevRow;

  if (isEmpty(prevRowSpanMap)) {
    return;
  }

  Object.keys(prevRowSpanMap).forEach(columnName => {
    const prevRowSpan = prevRowSpanMap[columnName];
    if (prevRowSpan) {
      const { count, mainRow: keyRow, mainRowKey } = prevRowSpan;
      const mainRow = keyRow ? prevRow : findProp('rowKey', mainRowKey, data)!;
      const mainRowSpan = mainRow.rowSpanMap[columnName];
      const startOffset = keyRow || extendPrevRowSpan ? 1 : -count + 1;

      // keep rowSpan state when appends row in the middle of rowSpan
      if (mainRowSpan.spanCount > startOffset) {
        mainRowSpan.count += 1;
        mainRowSpan.spanCount += 1;

        updateSubRowSpan(data, mainRow, columnName, 1, mainRowSpan.spanCount);
      }
    }
  });
}

export function updateRowSpanWhenRemove(
  data: Row[],
  removedRow: Row,
  nextRow: Row,
  keepRowSpanData: boolean
) {
  const { rowSpanMap: removedRowSpanMap } = removedRow;

  if (isEmpty(removedRowSpanMap)) {
    return;
  }

  Object.keys(removedRowSpanMap).forEach(columnName => {
    const removedRowSpan = removedRowSpanMap[columnName];
    const { count, mainRow: keyRow, mainRowKey } = removedRowSpan;
    let mainRow: Row, spanCount: number;

    if (keyRow) {
      mainRow = nextRow;
      spanCount = count - 1;

      if (spanCount > 1) {
        const mainRowSpan = mainRow.rowSpanMap[columnName];
        mainRowSpan.mainRowKey = mainRow.rowKey;
        mainRowSpan.mainRow = true;
      }
      if (keepRowSpanData) {
        mainRow[columnName] = removedRow[columnName];
      }
    } else {
      mainRow = findProp('rowKey', mainRowKey, data)!;
      spanCount = mainRow.rowSpanMap[columnName].spanCount - 1;
    }

    if (spanCount > 1) {
      const mainRowSpan = mainRow.rowSpanMap[columnName];
      mainRowSpan.count = spanCount;
      mainRowSpan.spanCount = spanCount;
      updateSubRowSpan(data, mainRow, columnName, 1, spanCount);
    } else {
      delete mainRow.rowSpanMap[columnName];
    }
  });
}
