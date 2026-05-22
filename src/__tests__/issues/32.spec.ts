import mongoose from 'mongoose';
import mongooseLeanDefaults from '../..';

const { MONGO_URI = 'mongodb://localhost:27017/mongooseLeanDefaults' } =
  process.env;

const InnerSchema = new mongoose.Schema(
  { required_field: { type: String, required: true } },
  { _id: false },
);

const OuterSchema = new mongoose.Schema(
  { embedded: { type: InnerSchema } },
  { collection: 'issues_32' },
);

OuterSchema.plugin(mongooseLeanDefaults);

// https://github.com/DouglasGabr/mongoose-lean-defaults/issues/32
describe('Issue #32', () => {
  let MyModel: mongoose.Model<any>;
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI);
    MyModel = mongoose.model('Issue32', OuterSchema);
  });

  beforeEach(async () => {
    await MyModel.deleteMany({});
  });

  afterAll(async () => {
    await MyModel.deleteMany({});
    await mongoose.disconnect();
  });

  it('should not populate absent embedded sub-schema with {} when inner fields are required', async () => {
    await MyModel.collection.insertOne({});
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result?.embedded).toBeUndefined();
  });

  it('should preserve embedded sub-schema value when present in DB', async () => {
    await MyModel.collection.insertOne({ embedded: { required_field: 'hello' } });
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result?.embedded?.required_field).toBe('hello');
  });
});
