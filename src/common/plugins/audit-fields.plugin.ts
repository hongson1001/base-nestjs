import {
  Schema,
  Document,
  Query,
  CallbackWithoutResultAndOptionalError,
} from 'mongoose';

export interface AuditFieldsDocument {
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AuditDocument extends Document {
  $locals: {
    principal?: {
      userId: string;
    };
  };
  isNew: boolean;
  createdBy: string | null;
  updatedBy: string | null;
}

interface QueryOptionsWithContext {
  context?: {
    principal?: {
      userId: string;
    };
  };
}

export function auditFieldsPlugin(schema: Schema): void {
  schema.add({
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  });

  // Enable Mongoose built-in timestamps
  schema.set('timestamps', true);

  schema.pre(
    'save',
    function (
      this: AuditDocument,
      next: CallbackWithoutResultAndOptionalError,
    ) {
      if (this.$locals?.principal) {
        if (this.isNew) {
          this.createdBy = this.$locals.principal.userId;
        }
        this.updatedBy = this.$locals.principal.userId;
      }
      next();
    },
  );

  schema.pre(
    'findOneAndUpdate',
    function (
      this: Query<unknown, Document>,
      next: CallbackWithoutResultAndOptionalError,
    ) {
      const options = this.getOptions() as QueryOptionsWithContext;
      if (options?.context?.principal) {
        void this.set({ updatedBy: options.context.principal.userId });
      }
      next();
    },
  );
}
