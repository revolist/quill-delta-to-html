import { InsertOpsConverter } from './InsertOpsConverter';
import {
  OpToHtmlConverter,
  IOpToHtmlConverterOptions,
  IInlineStyles,
} from './OpToHtmlConverter';
import { DeltaInsertOp } from './DeltaInsertOp';
import {
  groupConsecutiveSameStyleBlocks,
  pairOpsWithTheirBlock,
  reduceConsecutiveSameStyleBlocksToOne,
} from './grouper/Grouper';
import {
  IFrameItem,
  InlineGroup,
  BlockGroup,
  ListGroup,
  ListItem,
  TDataGroup,
  BlotBlock,
  TableGroup,
  TableRow,
  TableCell,
} from './grouper/group-types';
import { ListNester } from './grouper/ListNester';
import { makeStartTag, makeEndTag, encodeHtml } from './funcs-html';
import * as obj from './helpers/object';
import { GroupType } from './value-types';
import { IOpAttributeSanitizerOptions } from './OpAttributeSanitizer';
import { TableGrouper } from './grouper/TableGrouper';
import { h } from '@stencil/core';

interface IQuillDeltaToHtmlConverterOptions
  extends IOpAttributeSanitizerOptions,
    IOpToHtmlConverterOptions {
  orderedListTag?: string;
  bulletListTag?: string;

  multiLineBlockquote?: boolean;
  multiLineHeader?: boolean;
  multiLineCodeblock?: boolean;
  multiLineParagraph?: boolean;
  multiLineCustomBlock?: boolean;
}

const BrTag = '<br/>';

class QuillDeltaToHtmlConverter {
  private options: IQuillDeltaToHtmlConverterOptions;
  private rawDeltaOps: any[] = [];
  private converterOptions: IOpToHtmlConverterOptions;

  // render callbacks
  private callbacks: any = {};

  constructor(deltaOps: any[], options?: IQuillDeltaToHtmlConverterOptions) {
    this.options = obj.assign(
      {
        paragraphTag: 'p',
        encodeHtml: true,
        classPrefix: 'ql',
        inlineStyles: false,
        multiLineBlockquote: true,
        multiLineHeader: true,
        multiLineCodeblock: true,
        multiLineParagraph: true,
        multiLineCustomBlock: true,
        allowBackgroundClasses: false,
        linkTarget: '_blank',
      },
      options,
      {
        orderedListTag: 'ol',
        bulletListTag: 'ol',
        listItemTag: 'li',
      }
    );

    var inlineStyles: IInlineStyles | undefined;
    if (!this.options.inlineStyles) {
      inlineStyles = undefined;
    } else if (typeof this.options.inlineStyles === 'object') {
      inlineStyles = this.options.inlineStyles;
    } else {
      inlineStyles = {};
    }

    this.converterOptions = {
      encodeHtml: this.options.encodeHtml,
      classPrefix: this.options.classPrefix,
      inlineStyles: inlineStyles,
      listItemTag: this.options.listItemTag,
      paragraphTag: this.options.paragraphTag,
      linkRel: this.options.linkRel,
      linkTarget: this.options.linkTarget,
      allowBackgroundClasses: this.options.allowBackgroundClasses,
      customTag: this.options.customTag,
      customTagAttributes: this.options.customTagAttributes,
      customCssClasses: this.options.customCssClasses,
      customCssStyles: this.options.customCssStyles,
    };
    this.rawDeltaOps = deltaOps;
  }

  _getListTag(op: DeltaInsertOp): string {
    return op.isOrderedList()
      ? this.options.orderedListTag + ''
      : op.isBulletList()
      ? this.options.bulletListTag + ''
      : op.isCheckedList()
      ? this.options.bulletListTag + ''
      : op.isUncheckedList()
      ? this.options.bulletListTag + ''
      : '';
  }

  getGroupedOps(): TDataGroup[] {
    var deltaOps = InsertOpsConverter.convert(this.rawDeltaOps, this.options);

    var pairedOps = pairOpsWithTheirBlock(deltaOps);

    var groupedSameStyleBlocks = groupConsecutiveSameStyleBlocks(pairedOps, {
      blockquotes: !!this.options.multiLineBlockquote,
      header: !!this.options.multiLineHeader,
      codeBlocks: !!this.options.multiLineCodeblock,
      customBlocks: !!this.options.multiLineCustomBlock,
    });

    var groupedOps = reduceConsecutiveSameStyleBlocksToOne(
      groupedSameStyleBlocks
    );

    // table
    var tableGrouper = new TableGrouper();
    groupedOps = tableGrouper.group(groupedOps);

    var listNester = new ListNester();
    return listNester.nest(groupedOps);
  }

  convert() {
    const groups = this.getGroupedOps();
    return groups
      .map((group, i) => {
        // list
        if (group instanceof ListGroup) {
          return this._renderWithCallbacks(GroupType.List, group, () =>
            this._renderList(<ListGroup>group)
          );
          // table
        } else if (group instanceof TableGroup) {
          return this._renderWithCallbacks(GroupType.Table, group, () =>
            this._renderTable(<TableGroup>group)
          );
          // block
        } else if (group instanceof BlockGroup) {
          var g = <BlockGroup>group;

          return this._renderWithCallbacks(GroupType.Block, group, () =>
            this._renderBlock(g.op, g.ops)
          );
        } else if (group instanceof BlotBlock) {
          return this._renderCustom(group.op, null);
          // video
        } else if (group instanceof IFrameItem) {
          return this._renderWithCallbacks(GroupType.IFrame, group, () => {
            var g = <IFrameItem>group;
            var converter = new OpToHtmlConverter(g.op, this.converterOptions);
            return converter.getHtml();
          });
        } else {
          // InlineGroup
          return this._renderWithCallbacks(GroupType.InlineGroup, group, () => {
            return this._renderInlines((<InlineGroup>group).ops, true);
          });
        }
      })
      .join('');
  }

  getGroupedDelta() {
    const groups = this.getGroupedOps();

    function getOrigin(op: DeltaInsertOp) {
      return op.origin;
    }

    function getOriginList(ops: DeltaInsertOp[], parent: DeltaInsertOp) {
      return ops.reduce((acc: any[], op) => {
        if (!op.origin) {
          return acc;
        }
        acc.push(getOrigin(op), getOrigin(parent));
        return acc;
      }, []);
    }

    return groups.map((group) => {
      // list
      if (group instanceof ListGroup) {
        return group.items.flatMap((li) => {
          return getOriginList(li.item.ops, li.item.op);
        });
        // table
      } else if (group instanceof TableGroup) {
        return group.rows.flatMap((row) => {
          return row.cells.flatMap((cell) => {
            return cell.item.ops.map(getOrigin);
          });
        });
        // block
      } else if (group instanceof BlockGroup) {
        return getOriginList(group.ops, group.op);
      } else if (group instanceof BlotBlock) {
        return [getOrigin(group.op)];
        // video
      } else if (group instanceof IFrameItem) {
        return [getOrigin(group.op)];
      } else {
        // InlineGroup
        const g = <InlineGroup>group;
        return g.ops.map(getOrigin);
      }
    });
  }

  // todo: support through virtual dom
  // required to provide event handlers
  convertVnode(
    classes = {
      'ql-editor': true,
      'ql-container': true,
      'cell-content': true,
    }
  ) {
    const groups = this.getGroupedOps();
    return groups.map((group) => {
      // list
      if (group instanceof ListGroup) {
        return h('div', {
          innerHTML: this._renderList(<ListGroup>group),
          class: classes,
        });
        // table
      } else if (group instanceof TableGroup) {
        return h('div', {
          innerHTML: this._renderTable(<TableGroup>group),
          class: classes,
        });
        // block
      } else if (group instanceof BlockGroup) {
        return h('div', {
          innerHTML: this._renderBlock(group.op, group.ops),
          class: classes,
        });
      } else if (group instanceof BlotBlock) {
        return h('div', {
          innerHTML: this._renderCustom(group.op, null),
          class: classes,
        });
        // video
      } else if (group instanceof IFrameItem) {
        const style = group.op.attributes.style
          ?.split(';')
          .reduce((styles: Record<string, string>, item: string) => {
            let [key, value] = item.split(':');
            key = key.trim();
            value = value.trim();
            if (key === 'width') {
              value = '100%';
            }
            if (key && value) {
              styles[key] = value;
            }
            return styles;
          }, {});
        return h(
          'div',
          {
            class: {
              ...classes,
              'ql-frame-holder': true,
            },
          },
          [
            h('iframe', {
              // innerHTML: converter.getHtml(),
              src: group.op.insert.value,

              class: {
                'ql-frame': true,
              },
              frameborder: 0,
              allowfullscreen: false,
              style,
            }),
          ]
        );
      } else {
        // InlineGroup
        return h('div', {
          innerHTML: this._renderInlines((<InlineGroup>group).ops, true),
          class: classes,
        });
      }
    });
  }

  // ----- LIST -----
  _renderList(list: ListGroup): string {
    var firstItem = list.items[0];
    return (
      makeStartTag(this._getListTag(firstItem.item.op)) +
      list.items.map((li: ListItem) => this._renderListItem(li)).join('') +
      makeEndTag(this._getListTag(firstItem.item.op))
    );
  }

  _renderListItem(li: ListItem): string {
    //if (!isOuterMost) {
    li.item.op.attributes.indent = li.item.op.attributes.indent || 0;
    //}
    var converter = new OpToHtmlConverter(li.item.op, this.converterOptions);
    var parts = converter.getHtmlParts();
    var liElementsHtml = this._renderInlines(li.item.ops, false);
    return (
      parts.openingTag +
      liElementsHtml +
      (li.innerList ? this._renderList(li.innerList) : '') +
      parts.closingTag
    );
  }
  // ----- LIST END -----

  // ----- TABLE -----
  _renderTable(table: TableGroup): string {
    return (
      makeStartTag('table') +
      makeStartTag('tbody') +
      table.rows.map((row: TableRow) => this._renderTableRow(row)).join('') +
      makeEndTag('tbody') +
      makeEndTag('table')
    );
  }

  _renderTableRow(row: TableRow): string {
    return (
      makeStartTag('tr') +
      row.cells.map((cell: TableCell) => this._renderTableCell(cell)).join('') +
      makeEndTag('tr')
    );
  }

  _renderTableCell(cell: TableCell): string {
    var converter = new OpToHtmlConverter(cell.item.op, this.converterOptions);
    var parts = converter.getHtmlParts();
    var cellElementsHtml = this._renderInlines(cell.item.ops, false);
    return (
      makeStartTag('td', {
        key: 'data-row',
        value: cell.item.op.attributes.table,
      }) +
      parts.openingTag +
      cellElementsHtml +
      parts.closingTag +
      makeEndTag('td')
    );
  }
  // ----- TABLE END -----

  _renderBlock(bop: DeltaInsertOp, ops: DeltaInsertOp[]) {
    var converter = new OpToHtmlConverter(bop, this.converterOptions);
    var htmlParts = converter.getHtmlParts();

    if (bop.isCodeBlock()) {
      return (
        htmlParts.openingTag +
        encodeHtml(
          ops
            .map((iop) =>
              iop.isCustomEmbed()
                ? this._renderCustom(iop, bop)
                : iop.insert.value
            )
            .join('')
        ) +
        htmlParts.closingTag
      );
    }

    var inlines = ops.map((op) => this._renderInline(op, bop)).join('');
    return htmlParts.openingTag + (inlines || BrTag) + htmlParts.closingTag;
  }

  _renderInlines(ops: DeltaInsertOp[], isInlineGroup = true) {
    const startParaTag = makeStartTag(this.options.paragraphTag);
    const endParaTag = makeEndTag(this.options.paragraphTag);
    // const emptyLine = `${startParaTag}${BrTag}${endParaTag}`;

    // const opsLen = ops.length - 1;
    const html = ops
      .map((op: DeltaInsertOp, i: number) => {
        // if (i > 0 && i === opsLen && op.isJustNewline()) {
        //   return '';
        // }
        const line = this._renderInline(op, null);
        // if (this.options.multiLineParagraph) {
        //   if (line === BrTag) {
        //     // return emptyLine;
        //   }
        // }
        return line;
      })
      .join('');
    if (!isInlineGroup) {
      return html;
    }
    if (html === BrTag || this.options.multiLineParagraph) {
      // html = html.replace(emptyLine, BrTag).replace(BrTag, emptyLine);
      return `${startParaTag}${html}${endParaTag}`;
    }
    return `${startParaTag}${html
      .split(BrTag)
      .map((v) => (v === '' ? BrTag : v))
      .join(`${endParaTag}${startParaTag}`)}${endParaTag}`;
  }

  _renderInline(op: DeltaInsertOp, contextOp: DeltaInsertOp | null) {
    if (op.isCustomEmbed()) {
      return this._renderCustom(op, contextOp);
    }
    var converter = new OpToHtmlConverter(op, this.converterOptions);
    return converter.getHtml().replace(/\n/g, BrTag);
  }

  _renderCustom(op: DeltaInsertOp, contextOp: DeltaInsertOp | null) {
    var renderCb = this.callbacks['renderCustomOp_cb'];
    if (typeof renderCb === 'function') {
      return renderCb.apply(null, [op, contextOp]);
    }
    return '';
  }

  _renderWithCallbacks(
    groupType: GroupType,
    group: TDataGroup,
    myRenderFn: () => string
  ) {
    var html = '';
    var beforeCb = this.callbacks['beforeRender_cb'];
    html =
      typeof beforeCb === 'function'
        ? beforeCb.apply(null, [groupType, group])
        : '';

    if (!html) {
      html = myRenderFn();
    }

    var afterCb = this.callbacks['afterRender_cb'];
    html =
      typeof afterCb === 'function'
        ? afterCb.apply(null, [groupType, html])
        : html;

    return html;
  }

  beforeRender(cb: (group: GroupType, data: TDataGroup) => string) {
    if (typeof cb === 'function') {
      this.callbacks['beforeRender_cb'] = cb;
    }
  }

  afterRender(cb: (group: GroupType, html: string) => string) {
    if (typeof cb === 'function') {
      this.callbacks['afterRender_cb'] = cb;
    }
  }

  renderCustomWith(
    cb: (op: DeltaInsertOp, contextOp: DeltaInsertOp) => string
  ) {
    this.callbacks['renderCustomOp_cb'] = cb;
  }
}

export { QuillDeltaToHtmlConverter };
