import {
  Aggregate,
  CallbackWithoutResultAndOptionalError,
  Document,
  Query,
  Schema,
} from 'mongoose';

export interface SoftDeleteDocument extends Document {
  isDeleted: boolean;
  deletedAt: Date | null;
  softDelete(): Promise<this>;
}

export function softDeletePlugin(schema: Schema): void {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  });

  const autoFilter = function (
    this: Query<unknown, SoftDeleteDocument>,
    next: CallbackWithoutResultAndOptionalError,
  ) {
    const filter = this.getFilter() as Record<string, unknown>;
    if (filter.isDeleted === undefined) {
      void this.where({ isDeleted: false });
    }
    next();
  };

  // Read / countDocuments / findOneAndUpdate
  schema.pre('find', autoFilter);
  schema.pre('findOne', autoFilter);
  schema.pre('countDocuments', autoFilter);
  schema.pre('estimatedDocumentCount', autoFilter);
  schema.pre('findOneAndUpdate', autoFilter);
  schema.pre('findOneAndDelete', autoFilter);
  schema.pre('findOneAndReplace', autoFilter);

  // Mutations — chặn update/delete lên document đã soft-delete.
  schema.pre('updateOne', autoFilter);
  schema.pre('updateMany', autoFilter);
  schema.pre('replaceOne', autoFilter);
  schema.pre('deleteOne', autoFilter);
  schema.pre('deleteMany', autoFilter);

  // Aggregate — chèn $match vào đầu pipeline nếu chưa có filter isDeleted.
  schema.pre(
    'aggregate',
    function (
      this: Aggregate<unknown>,
      next: CallbackWithoutResultAndOptionalError,
    ) {
      const pipeline = this.pipeline();
      const firstStage = pipeline[0] as unknown as
        | Record<string, unknown>
        | undefined;
      const firstMatch = firstStage?.['$match'] as
        | Record<string, unknown>
        | undefined;
      const alreadyFiltered = firstMatch && 'isDeleted' in firstMatch;
      if (!alreadyFiltered) {
        pipeline.unshift({ $match: { isDeleted: false } });
      }
      next();
    },
  );

  schema.methods['softDelete'] = async function (this: SoftDeleteDocument) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
  };
}
