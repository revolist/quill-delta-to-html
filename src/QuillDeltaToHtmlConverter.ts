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
  VideoItem,
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
import { h, VNode } from '@stencil/core';

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

  convert(): (VNode | undefined)[] {
    let groups = this.getGroupedOps();
    return groups.map((group) => {
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
      } else if (group instanceof VideoItem) {
        return this._renderWithCallbacks(GroupType.Video, group, () => {
          var g = <VideoItem>group;
          const converter = new OpToHtmlConverter(g.op, this.converterOptions);
          let parts = converter.getHtmlParts();
          const html = parts.openingTag + parts.content + parts.closingTag;
          return h('div', { innerHTML: html });
        });
      }
      // InlineGroup
      return this._renderWithCallbacks(GroupType.InlineGroup, group, () => {
        return this._renderInlines((<InlineGroup>group).ops, true);
      });
    });
  }

  _renderWithCallbacks(
    groupType: GroupType,
    group: TDataGroup,
    myRenderFn: () => VNode
  ): VNode {
    let html: VNode;
    const beforeCb = this.callbacks['beforeRender_cb'];
    html =
      typeof beforeCb === 'function'
        ? beforeCb.apply(null, [groupType, group])
        : undefined;

    if (!html) {
      html = myRenderFn();
    }

    const afterCb = this.callbacks['afterRender_cb'];
    if (typeof afterCb === 'function') {
      html = afterCb.apply(null, [groupType, html]);
    }

    return html;
  }

  // ----- LIST -----
  _renderList(list: ListGroup): VNode {
    const firstItem = list.items[0];
    return h(
      this._getListTag(firstItem.item.op),
      null,
      list.items.map((li: ListItem) => this._renderListItem(li))
    );
  }

  _renderListItem(li: ListItem): VNode {
    //if (!isOuterMost) {
    li.item.op.attributes.indent = li.item.op.attributes.indent || 0;
    //}
    const converter = new OpToHtmlConverter(li.item.op, this.converterOptions);
    const parts = converter.getHtmlParts();
    const liElements = this._renderInlines(li.item.ops, false);
    const els = [liElements];
    if (li.innerList) {
      els.push(this._renderList(li.innerList));
    }
    if (parts) {
      if (!parts.$children$) {
        parts.$children$ = [];
      }
      parts.$children$.push(...(els as VNode[]));
    }
    return h(this.options.listItemTag, null, [parts]);
  }
  // ----- LIST END -----

  // ----- TABLE -----
  _renderTable(table: TableGroup): VNode {
    return (
      makeStartTag('table') +
      makeStartTag('tbody') +
      table.rows.map((row: TableRow) => this._renderTableRow(row)).join('') +
      makeEndTag('tbody') +
      makeEndTag('table')
    );
  }

  _renderTableRow(row: TableRow): VNode {
    return (
      makeStartTag('tr') +
      row.cells.map((cell: TableCell) => this._renderTableCell(cell)).join('') +
      makeEndTag('tr')
    );
  }

  _renderTableCell(cell: TableCell): VNode {
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

  _renderBlock(bop: DeltaInsertOp, ops: DeltaInsertOp[]): VNode {
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

    var inlines = ops
      .map((op) => {
        if (op.isCustomEmbed()) {
          return this._renderCustom(op, bop);
        }
        return this._renderInline(op, bop);
      })
      .join('');
    return htmlParts.openingTag + (inlines || BrTag) + htmlParts.closingTag;
  }

  _renderInlines(
    ops: DeltaInsertOp[],
    isInlineGroup = true
  ): VNode | (VNode | undefined)[] {
    const opsLen = ops.length - 1;
    let nodes = ops.map((op: DeltaInsertOp, i: number) => {
      if (i > 0 && i === opsLen && op.isJustNewline()) {
        return h('br');
      }
      if (op.isCustomEmbed()) {
        return this._renderCustom(op, null);
      }
      return this._renderInline(op, null);
    });
    if (!isInlineGroup) {
      return nodes;
    }
    return h(this.options.paragraphTag, null, nodes);
    // if (html === BrTag || this.options.multiLineParagraph) {
    //   return h(this.options.paragraphTag, null, nodes);
    // }
    // return h(this.options.paragraphTag,  html
    //   .split(BrTag)
    //   .map((v) => {
    //     return v === '' ? h('br') : h(this.options.paragraphTag, { innerHTML: v });
    //   }));
  }

  _renderInline(
    op: DeltaInsertOp,
    contextOp: DeltaInsertOp | null
  ): VNode | undefined {
    const converter = new OpToHtmlConverter(op, this.converterOptions);
    let parts = converter.getHtmlParts();
    console.log('op', op, parts);
    // const html = parts.openingTag + parts.content + parts.closingTag;
    // return html.replace(/\n/g, BrTag);
    return parts;
  }

  _renderCustom(
    op: DeltaInsertOp,
    contextOp: DeltaInsertOp | null
  ): VNode | undefined {
    const renderCb = this.callbacks['renderCustomOp_cb'];
    if (typeof renderCb === 'function') {
      return renderCb.apply(null, [op, contextOp]);
    }
    return undefined;
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

  renderCustomWith(cb: (op: DeltaInsertOp, contextOp: DeltaInsertOp) => VNode) {
    this.callbacks['renderCustomOp_cb'] = cb;
  }
}

export { QuillDeltaToHtmlConverter };
