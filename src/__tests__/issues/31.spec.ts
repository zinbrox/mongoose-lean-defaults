import mongoose from 'mongoose';
import mongooseLeanDefaults from '../..';

const { MONGO_URI = 'mongodb://localhost:27017/mongooseLeanDefaults' } =
  process.env;

interface MySchema {
  custom_mm?: {
    flow?: number;
    flow_version?: number;
    anchor_total_matches?: number;
    trigger_source?: string;
  };
}

const MySchema = new mongoose.Schema<MySchema>(
  {
    custom_mm: {
      flow: { type: Number },
      flow_version: { type: Number },
      anchor_total_matches: { type: Number },
      trigger_source: { type: String },
    },
  },
  {
    collection: 'issues_31',
  },
);

MySchema.plugin(mongooseLeanDefaults);

// https://github.com/DouglasGabr/mongoose-lean-defaults/issues/31
describe('Issue #31', () => {
  let MyModel: mongoose.Model<MySchema>;
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI);
    MyModel = mongoose.model<MySchema>('Issue31', MySchema);
  });

  beforeEach(async () => {
    await MyModel.deleteMany({});
  });

  afterAll(async () => {
    await MyModel.deleteMany({});
    await mongoose.disconnect();
  });

  it('should not create empty object for nested inline path with no defaults', async () => {
    await MyModel.collection.insertOne({});
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result?.custom_mm).toBeUndefined();
  });

  it('should preserve nested inline path when present in DB', async () => {
    await MyModel.collection.insertOne({ custom_mm: { flow: 5 } });
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result?.custom_mm).toBeDefined();
    expect(result?.custom_mm?.flow).toBe(5);
  });
});
