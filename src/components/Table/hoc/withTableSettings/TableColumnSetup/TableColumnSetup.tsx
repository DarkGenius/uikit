'use client';

import * as React from 'react';

import {Gear, Grip, Lock} from '@gravity-ui/icons';
import {DragDropContext, Draggable, Droppable} from '@hello-pangea/dnd';
import type {
    DraggableProvided,
    DraggableStateSnapshot,
    OnDragEndResponder,
} from '@hello-pangea/dnd';

import {useControlledState, useUniqId} from '../../../../../hooks';
import {createOnKeyDownHandler} from '../../../../../hooks/useActionHandlers/useActionHandlers';
import {Button} from '../../../../Button';
import {Icon} from '../../../../Icon';
import {Popup} from '../../../../Popup';
import type {PopupPlacement} from '../../../../Popup';
import {Text} from '../../../../Text';
import {TextInput} from '../../../../controls/TextInput';
import {Flex} from '../../../../layout/Flex/Flex';
import type {ListItemViewProps} from '../../../../useList';
import {ListContainerView, ListItemView, useListFilter} from '../../../../useList';
import {block} from '../../../../utils/cn';
import type {TableColumnConfig} from '../../../Table';
import type {TableSetting} from '../withTableSettings';

import i18n from './i18n';

import './TableColumnSetup.scss';

const b = block('inner-table-column-setup');
const controlsCn = b('controls');
const filterInputCn = b('filter-input');
const emptyPlaceholderCn = b('empty-placeholder');

const reorderArray = <T extends unknown>(list: T[], startIndex: number, endIndex: number): T[] => {
    const result = [...list];
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);

    return result;
};

const prepareStickyState = (items: TableColumnSetupItem[]) => {
    const stickyStart: TableColumnSetupItem[] = [];
    const sortable: TableColumnSetupItem[] = [];
    const stickyEnd: TableColumnSetupItem[] = [];

    items.forEach((item) => {
        if (item.sticky === 'left' || item.sticky === 'start') {
            stickyStart.push(item);
        } else if (item.sticky === 'right' || item.sticky === 'end') {
            stickyEnd.push(item);
        } else {
            sortable.push(item);
        }
    });

    return {stickyStart, sortable, stickyEnd};
};

interface RenderContainerProps {
    isDragDisabled?: boolean;
    provided?: DraggableProvided;
    snapshot?: DraggableStateSnapshot;
}

const RENDER_DRAG_DISABLED_CONTAINER_PROPS: RenderContainerProps = {isDragDisabled: true};

interface SwitcherProps {
    onKeyDown: React.KeyboardEventHandler<HTMLElement>;
    onClick: React.MouseEventHandler<HTMLElement>;
}

export type TableColumnSetupItem = TableSetting & {
    title: React.ReactNode;
    isRequired?: boolean;
    sticky?: TableColumnConfig<unknown>['sticky'];
};

const defaultFilterSettingsFn = (value: string, item: TableColumnSetupItem) => {
    return typeof item.title === 'string'
        ? item.title.toLowerCase().includes(value.trim().toLowerCase())
        : true;
};

export type RenderControls = (params: {
    DefaultApplyButton: React.ComponentType;
    /**
     * Is used to apply new settings and close the popup
     */
    onApply: () => void;
}) => React.ReactNode;

export interface TableColumnSetupProps {
    renderSwitcher?: (props: SwitcherProps) => React.JSX.Element;

    items: TableColumnSetupItem[];
    sortable?: boolean;
    hideApplyButton?: boolean;

    onUpdate: (newSettings: TableSetting[]) => void;
    popupWidth?: 'fit' | number;
    popupPlacement?: PopupPlacement;

    /**
     * @deprecated
     */
    renderControls?: RenderControls;

    className?: string;

    defaultItems?: TableColumnSetupItem[];
    showResetButton?: boolean | ((currentItems: TableColumnSetupItem[]) => boolean);

    filterable?: boolean;
    filterPlaceholder?: string;
    filterEmptyMessage?: string;
    filterSettings?: (value: string, item: TableColumnSetupItem) => boolean;
}

interface ListItemRenderProps {
    item: TableColumnSetupItem;
    index: number;
    selected: boolean;
    active: boolean;
    renderContainerProps?: RenderContainerProps;
    onToggle: (id: string) => void;
    sortingEnabled?: boolean;
}

function ListItem({
    item,
    index,
    selected,
    active,
    renderContainerProps,
    onToggle,
    sortingEnabled,
}: ListItemRenderProps) {
    const isDragDisabled = !sortingEnabled || renderContainerProps?.isDragDisabled === true;
    const endSlot = isDragDisabled ? undefined : <Icon data={Grip} size={16} />;
    const startSlot = item.isRequired ? <Icon data={Lock} /> : undefined;
    const itemSelected = item.isRequired ? false : selected;

    const commonProps: ListItemViewProps = {
        id: item.id,
        selected: itemSelected,
        active,
        selectionViewType: item.isRequired ? 'single' : 'multiple',
        content: {
            title: item.title,
            startSlot,
            endSlot,
        },
        onClick: () => {
            if (!item.isRequired) {
                onToggle(item.id);
            }
        },
    };

    if (isDragDisabled) {
        return <ListItemView {...commonProps} key={commonProps.id} />;
    }

    const renderItem = (provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
        <ListItemView
            {...commonProps}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            ref={provided.innerRef}
            dragging={snapshot.isDragging}
        />
    );

    if (renderContainerProps?.provided && renderContainerProps.snapshot) {
        return renderItem(renderContainerProps.provided, renderContainerProps.snapshot);
    }

    return (
        <Draggable
            draggableId={item.id}
            index={index}
            key={`item-key-${item.id}`}
            isDragDisabled={isDragDisabled}
        >
            {renderItem}
        </Draggable>
    );
}

export const TableColumnSetup = (props: TableColumnSetupProps) => {
    const {
        renderSwitcher,
        popupPlacement,
        items: propsItems,
        onUpdate: propsOnUpdate,
        sortable,
        renderControls,
        className,
        defaultItems = propsItems,
        showResetButton: propsShowResetButton,
        filterable,
        filterPlaceholder,
        filterEmptyMessage,
        filterSettings = defaultFilterSettingsFn,
        hideApplyButton,
        // popupWidth is kept for API compatibility but not used in the new implementation
        popupWidth: _popupWidth,
    } = props;

    const [open, setOpen] = React.useState(false);
    const [sortingEnabled, setSortingEnabled] = React.useState(sortable);
    const [prevSortingEnabled, setPrevSortingEnabled] = React.useState(sortable);
    if (sortable !== prevSortingEnabled) {
        setPrevSortingEnabled(sortable);
        setSortingEnabled(sortable);
    }

    const [items, setItems] = useControlledState<TableColumnSetupItem[]>(
        hideApplyButton ? propsItems : undefined,
        propsItems,
        hideApplyButton ? propsOnUpdate : undefined,
    );

    // Track changes to propsItems in manual mode
    const [prevPropsItems, setPrevPropsItems] = React.useState(propsItems);
    if (propsItems !== prevPropsItems) {
        setPrevPropsItems(propsItems);
        if (!hideApplyButton) {
            setItems(propsItems);
        }
    }

    const {t} = i18n.useTranslation();
    const controlRef = React.useRef<HTMLDivElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const uniqId = useUniqId();

    const filterState = useListFilter({items, filterItem: filterSettings, debounceTimeout: 0});

    const onApply = () => {
        const newSettings = items.map<TableSetting>(({id, isSelected}) => ({id, isSelected}));
        propsOnUpdate(newSettings);
        onOpenChange(false);
    };

    const DefaultApplyButton = () => (
        <Button view="action" width="max" onClick={onApply}>
            {t('button_apply')}
        </Button>
    );

    const onDragEnd: OnDragEndResponder = ({destination, source}) => {
        if (destination?.index !== undefined && destination?.index !== source.index) {
            const reorderedItems = reorderArray(items, source.index, destination.index);
            setItems(reorderedItems);
        }
    };

    const showResetButton =
        typeof propsShowResetButton === 'function'
            ? propsShowResetButton(items)
            : propsShowResetButton;

    const onOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (newOpen === false) {
            setItems(propsItems);
            setSortingEnabled(sortable);
            filterState.reset();
        }
    };

    const handleToggle = React.useCallback(
        (id: string) => {
            const newItems = items.map((item) => ({
                ...item,
                isSelected: item.id === id ? !item.isSelected : item.isSelected,
            }));
            setItems(newItems);
        },
        [items, setItems],
    );

    const onFilterValueUpdate = (value: string) => {
        filterState.onFilterUpdate(value);
        setSortingEnabled(!value.length);
    };

    const displayItems = (filterState.filter ? filterState.items : items) as TableColumnSetupItem[];
    const {stickyStart, sortable: sortableItems, stickyEnd} = prepareStickyState(displayItems);

    // Calculate selected state for each item
    const selectedById = React.useMemo(() => {
        const map: Record<string, boolean> = {};
        items.forEach((item) => {
            map[item.id] = item.isSelected || false;
        });
        return map;
    }, [items]);

    const renderDndItem = (
        item: TableColumnSetupItem,
        index: number,
        renderContainerProps?: RenderContainerProps,
    ) => (
        <ListItem
            key={item.id}
            item={item}
            index={index}
            selected={selectedById[item.id] || false}
            active={false}
            renderContainerProps={renderContainerProps}
            onToggle={handleToggle}
            sortingEnabled={sortingEnabled && !filterState.filter}
        />
    );

    const renderPopupContent = () => {
        if (filterState.filter && !filterState.items.length) {
            return <Text className={emptyPlaceholderCn}>{filterEmptyMessage}</Text>;
        }

        const stickyStartItems = stickyStart.map((item, idx) =>
            renderDndItem(item, idx, RENDER_DRAG_DISABLED_CONTAINER_PROPS),
        );

        const sortableItemsRendered = sortableItems.map((item, idx) =>
            renderDndItem(item, stickyStart.length + idx),
        );

        const stickyEndItems = stickyEnd.map((item, idx) =>
            renderDndItem(
                item,
                stickyStart.length + sortableItems.length + idx,
                RENDER_DRAG_DISABLED_CONTAINER_PROPS,
            ),
        );

        return (
            <React.Fragment>
                <ListContainerView ref={containerRef} id={`list-${uniqId}`} className={b('list')}>
                    {stickyStartItems}
                    {sortableEnabled && !filterState.filter ? (
                        <DragDropContext onDragEnd={onDragEnd}>
                            <Droppable droppableId={uniqId}>
                                {(droppableProvided) => (
                                    <div
                                        {...droppableProvided.droppableProps}
                                        ref={droppableProvided.innerRef}
                                    >
                                        {sortableItemsRendered}
                                        {droppableProvided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    ) : (
                        sortableItemsRendered
                    )}
                    {stickyEndItems}
                </ListContainerView>
                <div className={controlsCn}>
                    {renderControls ? (
                        renderControls({DefaultApplyButton, onApply})
                    ) : (
                        <Flex gapRow={1} direction="column" className={controlsCn}>
                            {showResetButton && (
                                <Button
                                    onClick={() => {
                                        if (hideApplyButton) {
                                            propsOnUpdate(defaultItems);
                                        }
                                        setItems(defaultItems);
                                    }}
                                    width="max"
                                >
                                    {t('button_reset')}
                                </Button>
                            )}
                            {!hideApplyButton && <DefaultApplyButton />}
                        </Flex>
                    )}
                </div>
            </React.Fragment>
        );
    };

    const sortableEnabled = sortable && sortingEnabled;

    const switcherProps: SwitcherProps = {
        onClick: () => onOpenChange(!open),
        onKeyDown: createOnKeyDownHandler(() => onOpenChange(!open)),
    };

    return (
        <div className={b(null, className)}>
            {renderSwitcher ? (
                renderSwitcher(switcherProps)
            ) : (
                <div ref={controlRef}>
                    <Button onClick={switcherProps.onClick} onKeyDown={switcherProps.onKeyDown}>
                        <Icon data={Gear} />
                        {t('button_switcher')}
                    </Button>
                </div>
            )}
            <Popup
                anchorRef={controlRef}
                open={open}
                onOpenChange={(newOpen) => onOpenChange(newOpen)}
                placement={popupPlacement}
                disablePortal={false}
            >
                {filterable && (
                    <TextInput
                        size="m"
                        view="clear"
                        placeholder={filterPlaceholder}
                        value={filterState.filter}
                        className={filterInputCn}
                        onUpdate={onFilterValueUpdate}
                        hasClear
                    />
                )}
                {renderPopupContent()}
            </Popup>
        </div>
    );
};
