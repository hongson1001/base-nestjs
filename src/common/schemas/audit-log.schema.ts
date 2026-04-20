import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

export type AuditLogChanges = Record<string, unknown>;

@Schema({ collection: 'audit_logs', timestamps: false })
export class AuditLog {
  @Prop({ type: String, default: null, index: true })
  userId: string | null;

  @Prop({ type: String, required: true })
  action: string;

  @Prop({ type: String, required: true })
  resource: string;

  @Prop({ type: String, default: null })
  resourceId: string | null;

  // Plain object — typed as Record<string, unknown> at application layer.
  // Mongoose stores it as a generic subdocument without schema enforcement,
  // which is appropriate because change payloads vary per resource.
  @Prop({ type: Object, default: null })
  changes: AuditLogChanges | null;

  @Prop({ type: String, default: null })
  ip: string | null;

  @Prop({ type: String, default: null })
  userAgent: string | null;

  @Prop({ type: Date, default: () => new Date(), index: true })
  timestamp: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// TTL index: auto-delete logs older than 90 days
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
