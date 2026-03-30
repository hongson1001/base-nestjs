import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';

export type CounterDocument = HydratedDocument<Counter>;

export interface CounterModel extends Model<CounterDocument> {
  getNextSequence(name: string): Promise<number>;
}

@Schema({ collection: 'counters' })
export class Counter {
  @Prop({ type: String, required: true, unique: true })
  name: string;

  @Prop({ type: Number, default: 0 })
  seq: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);

CounterSchema.statics.getNextSequence = async function (
  this: CounterModel,
  name: string,
): Promise<number> {
  const counter = await this.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return counter.seq;
};
