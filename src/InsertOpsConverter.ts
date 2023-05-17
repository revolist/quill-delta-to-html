import { DeltaInsertOp } from './DeltaInsertOp';
import { DataType } from './value-types';
import { InsertData, InsertDataCustom, InsertDataQuill } from './InsertData';
import {
  OpAttributeSanitizer,
  IOpAttributeSanitizerOptions,
} from './OpAttributeSanitizer';
import { InsertOpDenormalizer } from './InsertOpDenormalizer';
import { OpLinkSanitizer } from './OpLinkSanitizer';

/**
 * Converts raw delta insert ops to array of denormalized DeltaInsertOp objects
 */
class InsertOpsConverter {
  static convert(
    deltaOps: null | any[],
    options: IOpAttributeSanitizerOptions
  ): DeltaInsertOp[] {
    if (!Array.isArray(deltaOps)) {
      return [];
    }

    let denormalizedOps: any = [].concat.apply(
      [],
      deltaOps.map(InsertOpDenormalizer.denormalize) as any
    );
    let results: DeltaInsertOp[] = [];

    let insertVal, attributes;

    for (let op of denormalizedOps) {
      if (!op.insert) {
        continue;
      }

      insertVal = InsertOpsConverter.convertInsertVal(op.insert, options);
      if (!insertVal) {
        continue;
      }

      attributes = OpAttributeSanitizer.sanitize(op.attributes, options);
      results.push(new DeltaInsertOp(insertVal, attributes));
    }
    return results;
  }

  static convertInsertVal(
    insertPropVal: any,
    sanitizeOptions: IOpAttributeSanitizerOptions
  ): InsertData | null {
    if (typeof insertPropVal === 'string') {
      return new InsertDataQuill(DataType.Text, insertPropVal);
    }

    if (!insertPropVal || typeof insertPropVal !== 'object') {
      return null;
    }

    let keys = Object.keys(insertPropVal);
    if (!keys.length) {
      return null;
    }

    if (DataType.Image in insertPropVal) {
      return new InsertDataQuill(
        DataType.Image,
        OpLinkSanitizer.sanitize(
          insertPropVal[DataType.Image] + '',
          sanitizeOptions
        )
      );
    }

    if (DataType.Video in insertPropVal) {
      return new InsertDataQuill(
        DataType.Video,
        OpLinkSanitizer.sanitize(
          insertPropVal[DataType.Video] + '',
          sanitizeOptions
        )
      );
    }
    if (DataType.IFrame in insertPropVal) {
      return new InsertDataQuill(
        DataType.IFrame,
        OpLinkSanitizer.sanitize(
          insertPropVal[DataType.IFrame] + '',
          sanitizeOptions
        )
      );
    }
    if (DataType.Formula in insertPropVal) {
      return new InsertDataQuill(
        DataType.Formula,
        insertPropVal[DataType.Formula]
      );
    }
    if (DataType.Line in insertPropVal) {
      return new InsertDataQuill(DataType.Line, insertPropVal[DataType.Line]);
    }
    return new InsertDataCustom(keys[0], insertPropVal[keys[0]]);
  }
}

export { InsertOpsConverter };
