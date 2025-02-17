import { Store, RowKey } from '../store/types';
import GridEvent from '../event/gridEvent';
import { getEventBus } from '../event/eventBus';
import { isCellEditable, findIndexByRowKey, findRowByRowKey } from '../query/data';
import { isFocusedCell, isEditingCell } from '../query/focus';
import { getRowSpanByRowKey, isRowSpanEnabled } from '../helper/rowSpan';
import { createRawRow, createViewRow } from '../store/data';
import { isObservable, notify } from '../helper/observable';
import { setValue } from './data';
import { isUndefined } from '../helper/common';
import { createTreeRawRow } from '../helper/tree';
import { isHiddenColumn } from '../helper/column';
import { forceSyncRendering } from '../helper/render';

export function startEditing(store: Store, rowKey: RowKey, columnName: string) {
  const { data, focus, column, id } = store;
  const { rawData } = data;
  const foundIndex = findIndexByRowKey(data, column, id, rowKey);

  // makes the data observable to judge editable, disable of the cell;
  makeObservable(store, rowKey);

  if (!isCellEditable(data, column, rowKey, columnName)) {
    return;
  }

  const eventBus = getEventBus(id);
  const gridEvent = new GridEvent({
    rowKey,
    columnName,
    value: rawData[foundIndex][columnName]
  });

  /**
   * Occurs when editing the cell is started
   * @event Grid#editingStart
   * @property {number} rowKey - rowKey of the target cell
   * @property {number} columnName - columnName of the target cell
   * @property {number | string | boolean | null | undefined} value - value of the editing cell
   * @property {Grid} instance - Current grid instance
   */
  eventBus.trigger('editingStart', gridEvent);

  if (!gridEvent.isStopped()) {
    forceSyncRendering(() => {
      focus.forcedDestroyEditing = false;
      focus.navigating = false;
      focus.editingAddress = { rowKey, columnName };
    });
  }

  notify(data, 'viewData');
}

export function finishEditing(
  { focus, id }: Store,
  rowKey: RowKey,
  columnName: string,
  value: string
) {
  const eventBus = getEventBus(id);
  const gridEvent = new GridEvent({ rowKey, columnName, value });

  /**
   * Occurs when editing the cell is finished
   * @event Grid#editingFinish
   * @property {number} rowKey - rowKey of the target cell
   * @property {number} columnName - columnName of the target cell
   * @property {number | string | boolean | null | undefined} value - value of the editing cell
   * @property {Grid} instance - Current grid instance
   */
  eventBus.trigger('editingFinish', gridEvent);

  if (!gridEvent.isStopped()) {
    if (isEditingCell(focus, rowKey, columnName)) {
      forceSyncRendering(() => {
        focus.editingAddress = null;
        focus.navigating = true;
      });
    }
  }
}

export function changeFocus(
  store: Store,
  rowKey: RowKey | null,
  columnName: string | null,
  id: number
) {
  const { data, focus, column } = store;

  if (
    isFocusedCell(focus, rowKey, columnName) ||
    (columnName && isHiddenColumn(column, columnName))
  ) {
    return;
  }

  const { rawData, sortState } = data;
  const eventBus = getEventBus(id);
  const gridEvent = new GridEvent({
    rowKey,
    columnName,
    prevColumnName: focus.columnName,
    prevRowKey: focus.rowKey
  });

  /**
   * Occurs when focused cell is about to change
   * @event Grid#focusChange
   * @property {number} rowKey - rowKey of the target cell
   * @property {number} columnName - columnName of the target cell
   * @property {number} prevRowKey - rowKey of the currently focused cell
   * @property {number} prevColumnName - columnName of the currently focused cell
   * @property {Grid} instance - Current grid instance
   */
  eventBus.trigger('focusChange', gridEvent);

  if (!gridEvent.isStopped()) {
    let focusRowKey = rowKey;

    if (rowKey && columnName && isRowSpanEnabled(sortState)) {
      const rowSpan = getRowSpanByRowKey(rowKey, columnName, rawData);
      if (rowSpan) {
        focusRowKey = rowSpan.mainRowKey;
      }
    }

    focus.prevColumnName = focus.columnName;
    focus.prevRowKey = focus.rowKey;
    focus.columnName = columnName;
    focus.rowKey = focusRowKey;
  }
}

export function initFocus({ focus }: Store) {
  focus.editingAddress = null;
  focus.navigating = false;
  focus.rowKey = null;
  focus.columnName = null;
  focus.prevRowKey = null;
  focus.prevColumnName = null;
}

export function saveAndFinishEditing(
  store: Store,
  rowKey: RowKey,
  columnName: string,
  value?: string
) {
  const { data, column, focus } = store;

  if (!isEditingCell(focus, rowKey, columnName)) {
    return;
  }
  // makes the data observable to judge editable, disable of the cell;
  makeObservable(store, rowKey);

  if (!isCellEditable(data, column, rowKey, columnName)) {
    return;
  }

  if (isUndefined(value)) {
    forceSyncRendering(() => {
      focus.forcedDestroyEditing = true;
      focus.editingAddress = null;
      focus.navigating = true;
    });
    return;
  }

  setValue(store, rowKey, columnName, value);
  finishEditing(store, rowKey, columnName, value);
}

function makeObservable(store: Store, rowKey: RowKey) {
  const { data, column, id } = store;
  const { rawData, viewData } = data;
  const { allColumnMap, treeColumnName, treeIcon } = column;
  const foundIndex = findIndexByRowKey(data, column, id, rowKey);
  const rawRow = rawData[foundIndex];

  if (isObservable(rawRow)) {
    return;
  }

  if (treeColumnName) {
    const parentRow = findRowByRowKey(data, column, id, rawRow._attributes.tree!.parentRowKey);
    rawData[foundIndex] = createTreeRawRow(rawRow, column.defaultValues, parentRow || null);
    viewData[foundIndex] = createViewRow(
      rawData[foundIndex],
      allColumnMap,
      rawData,
      treeColumnName,
      treeIcon
    );
  } else {
    rawData[foundIndex] = createRawRow(rawRow, foundIndex, column.defaultValues);
    viewData[foundIndex] = createViewRow(rawData[foundIndex], allColumnMap, rawData);
  }
}
