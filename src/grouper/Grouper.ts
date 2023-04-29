import { DeltaInsertOp } from './../DeltaInsertOp';
import {
  IArraySlice,
  flatten,
  groupConsecutiveElementsWhile,
  sliceFromReverseWhile,
} from './../helpers/array';
import {
  VideoItem,
  InlineGroup,
  BlockGroup,
  TDataGroup,
  BlotBlock,
} from './group-types';

export function pairOpsWithTheirBlock(ops: DeltaInsertOp[]): TDataGroup[] {
  // The resulting array of TDataGroup objects
  let result: TDataGroup[] = [];

  // Determine if an op can be part of a block
  const canBeInBlock = (op: DeltaInsertOp) => {
    return !(
      op.isJustNewline() ||
      op.isCustomEmbedBlock() ||
      op.isVideo() ||
      op.isContainerBlock()
    );
  };

  // Inline element
  const isInlineData = (op: DeltaInsertOp) => op.isInline();

  let lastInd = ops.length - 1;
  let opsSlice: IArraySlice;

  // Iterate in reverse order
  for (let i = lastInd; i >= 0; i--) {
    let op = ops[i];

    // Video, add a VideoItem
    if (op.isVideo()) {
      result.push(new VideoItem(op));
    }
    // Custom embed block, add a BlotBlock
    else if (op.isCustomEmbedBlock()) {
      result.push(new BlotBlock(op));
    }
    // Container block, group it with its child ops into a BlockGroup
    else if (op.isContainerBlock()) {
      // Get the slice of ops that can be part of the container block
      opsSlice = sliceFromReverseWhile(ops, i - 1, canBeInBlock);

      // Add the BlockGroup to the result array and update the loop index
      result.push(new BlockGroup(op, opsSlice.elements));
      i = opsSlice.sliceStartsAt > -1 ? opsSlice.sliceStartsAt : i;
    }
    // Inline element, group it with the previous inline ops into an InlineGroup
    else {
      // Get the slice of previous ops that are also inline
      opsSlice = sliceFromReverseWhile(ops, i - 1, isInlineData);

      // Add the InlineGroup to the result array and update the loop index
      result.push(new InlineGroup(opsSlice.elements.concat(op)));
      i = opsSlice.sliceStartsAt > -1 ? opsSlice.sliceStartsAt : i;
    }
  }
  result.reverse();
  return result;
}

export function groupConsecutiveSameStyleBlocks(
  groups: TDataGroup[],
  blocksOf = {
    header: true,
    codeBlocks: true,
    blockquotes: true,
    customBlocks: true,
  }
): Array<TDataGroup | BlockGroup[]> {
  return groupConsecutiveElementsWhile(
    groups,
    (g: TDataGroup, gPrev: TDataGroup) => {
      if (!(g instanceof BlockGroup) || !(gPrev instanceof BlockGroup)) {
        return false;
      }

      return (
        (blocksOf.codeBlocks && areBothCodeblocksWithSameLang(g, gPrev)) ||
        (blocksOf.blockquotes && areBothBlockquotesWithSameAdi(g, gPrev)) ||
        (blocksOf.header && areBothSameHeadersWithSameAdi(g, gPrev)) ||
        (blocksOf.customBlocks && areBothCustomBlockWithSameAttr(g, gPrev))
      );
    }
  );
}

/**
 * Reduces consecutive same-style block groups into one group of first block,
 * separating them with a new line and discards the rest.
 * @param groups An array of data groups or block groups
 * @returns A new array of data groups
 */
export function reduceConsecutiveSameStyleBlocksToOne(
  groups: Array<TDataGroup | BlockGroup[]>
): TDataGroup[] {
  // Create a new line delta insert operation
  const newLineOp = DeltaInsertOp.createNewLineOp();
  return groups.map(function (elm: TDataGroup | BlockGroup[]) {
    if (!Array.isArray(elm)) {
      // If elm is not an array, it is not a block group, so return it as-is
      if (elm instanceof BlockGroup && !elm.ops.length) {
        elm.ops.push(newLineOp);
      }
      return elm;
    }
    // Get the index of the last block group in the array
    const groupsLastInd = elm.length - 1;
    // Set the ops of the first block group in the array to a flattened array of ops
    // from all block groups in the array, with new line ops separating them
    elm[0].ops = flatten(
      elm.map((g: BlockGroup, i: number) => {
        if (!g.ops.length) {
          // If a block group has no ops, add a new line op to it
          return [newLineOp];
        }
        // If the block group is not the last one in the array, add a new line op to it
        return g.ops.concat(i < groupsLastInd ? [newLineOp] : []);
      })
    );
    return elm[0];
  });
}

export function areBothCodeblocksWithSameLang(
  g1: BlockGroup,
  gOther: BlockGroup
) {
  return (
    g1.op.isCodeBlock() &&
    gOther.op.isCodeBlock() &&
    g1.op.hasSameLangAs(gOther.op)
  );
}

export function areBothSameHeadersWithSameAdi(
  g1: BlockGroup,
  gOther: BlockGroup
) {
  return g1.op.isSameHeaderAs(gOther.op) && g1.op.hasSameAdiAs(gOther.op);
}

export function areBothBlockquotesWithSameAdi(
  g: BlockGroup,
  gOther: BlockGroup
) {
  return (
    g.op.isBlockquote() &&
    gOther.op.isBlockquote() &&
    g.op.hasSameAdiAs(gOther.op)
  );
}

export function areBothCustomBlockWithSameAttr(
  g: BlockGroup,
  gOther: BlockGroup
) {
  return (
    g.op.isCustomTextBlock() &&
    gOther.op.isCustomTextBlock() &&
    g.op.hasSameAttr(gOther.op)
  );
}
