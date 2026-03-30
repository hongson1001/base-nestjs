import {
  Schema,
  Document,
  Query,
  CallbackWithoutResultAndOptionalError,
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

  schema.pre('find', autoFilter);
  schema.pre('findOne', autoFilter);
  schema.pre('countDocuments', autoFilter);
  schema.pre('findOneAndUpdate', autoFilter);

  schema.methods['softDelete'] = async function (this: SoftDeleteDocument) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
  };
}
