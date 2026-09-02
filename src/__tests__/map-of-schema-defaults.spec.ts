import mongoose from 'mongoose';
import mongooseLeanDefaults from '../';

const { MONGO_URI = 'mongodb://localhost:27017/mongooseLeanDefaults' } =
  process.env;

interface Entry {
  role?: string;
  count?: number;
}
interface Doc {
  entries?: Record<string, Entry>;
}

const EntrySchema = new mongoose.Schema<Entry>(
  {
    role: { type: String, default: 'member' },
    count: { type: Number, default: 0 },
  },
  { _id: false },
);

const MySchema = new mongoose.Schema({
  entries: { type: Map, of: EntrySchema },
});

MySchema.plugin(mongooseLeanDefaults);

describe('Map of subdocument schema defaults', () => {
  let MyModel: mongoose.Model<Doc>;
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI);
    MyModel = mongoose.model('SchemaWithMapOfSchema', MySchema);
  });
  beforeEach(async () => {
    await MyModel.deleteMany({});
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('backfills defaults on every existing map entry', async () => {
    await MyModel.collection.insertOne({
      entries: { a: {}, b: { role: 'admin' } },
    });
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result!.entries!.a).toEqual({ role: 'member', count: 0 });
    expect(result!.entries!.b).toEqual({ role: 'admin', count: 0 });
  });

  it('does not invent map entries that do not exist', async () => {
    await MyModel.create({});
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result!.entries).toBeUndefined();
  });

  it('applies defaults to map entries on every doc returned by find()', async () => {
    await MyModel.collection.insertMany([
      { entries: { a: {} } },
      { entries: { b: {} } },
    ]);
    const results = await MyModel.find({}).lean({ defaults: true }).exec();
    expect(results).toHaveLength(2);
    for (const result of results) {
      const [entry] = Object.values(result.entries!);
      expect(entry).toEqual({ role: 'member', count: 0 });
    }
  });

  it('skips null map entries without throwing', async () => {
    await MyModel.collection.insertOne({
      entries: { a: null, b: { role: 'admin' } },
    });
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result!.entries!.a).toBeNull();
    expect(result!.entries!.b).toEqual({ role: 'admin', count: 0 });
  });
});

interface LabeledEntry {
  count?: number;
  label?: string;
}
const LabeledEntrySchema = new mongoose.Schema<LabeledEntry>(
  {
    count: { type: Number, default: 0 },
    label: {
      type: String,
      default: function (doc: LabeledEntry) {
        return `n=${doc.count ?? 'unknown'}`;
      },
    },
  },
  { _id: false },
);
const LabeledMapSchema = new mongoose.Schema({
  entries: { type: Map, of: LabeledEntrySchema },
});
LabeledMapSchema.plugin(mongooseLeanDefaults);

describe('Map of subdocument schema defaults - function defaults', () => {
  let MyModel: mongoose.Model<{ entries?: Record<string, LabeledEntry> }>;
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI);
    MyModel = mongoose.model('SchemaWithLabeledMap', LabeledMapSchema);
  });
  beforeEach(async () => {
    await MyModel.deleteMany({});
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('invokes function defaults with the individual map entry, not the parent doc', async () => {
    await MyModel.collection.insertOne({
      entries: { a: { count: 5 }, b: {} },
    });
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result!.entries!.a).toEqual({ count: 5, label: 'n=5' });
    expect(result!.entries!.b).toEqual({ count: 0, label: 'n=0' });
  });
});

const LeafSchema = new mongoose.Schema(
  { flag: { type: Boolean, default: true } },
  { _id: false },
);
const BranchSchema = new mongoose.Schema(
  {
    val: { type: Number, default: 1 },
    leaves: { type: Map, of: LeafSchema },
  },
  { _id: false },
);
const NestedMapSchema = new mongoose.Schema({
  branches: { type: Map, of: BranchSchema },
});
NestedMapSchema.plugin(mongooseLeanDefaults);

describe('Map of subdocument schema defaults - nested map of schema', () => {
  let MyModel: mongoose.Model<any>;
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI);
    MyModel = mongoose.model('SchemaWithNestedMap', NestedMapSchema);
  });
  beforeEach(async () => {
    await MyModel.deleteMany({});
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('backfills defaults through a map nested inside another map-of-schema entry', async () => {
    await MyModel.collection.insertOne({
      branches: { x: { leaves: { y: {} } } },
    });
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result.branches.x.val).toBe(1);
    expect(result.branches.x.leaves.y.flag).toBe(true);
  });
});

const TagSchema = new mongoose.Schema(
  { color: { type: String, default: 'gray' } },
  { _id: false },
);
const ItemSchema = new mongoose.Schema(
  { tags: { type: Map, of: TagSchema } },
  { _id: false },
);
const ListContainerSchema = new mongoose.Schema({
  items: { type: [ItemSchema] },
});
ListContainerSchema.plugin(mongooseLeanDefaults);

describe('Map of subdocument schema defaults - map inside array of subdocuments', () => {
  let MyModel: mongoose.Model<any>;
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI);
    MyModel = mongoose.model('SchemaWithMapInArray', ListContainerSchema);
  });
  beforeEach(async () => {
    await MyModel.deleteMany({});
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('backfills defaults on a map field nested inside each array subdocument', async () => {
    await MyModel.collection.insertOne({
      items: [{ tags: { a: {} } }, { tags: { b: { color: 'red' } } }],
    });
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result.items[0].tags.a.color).toBe('gray');
    expect(result.items[1].tags.b.color).toBe('red');
  });
});

const PrimitiveMapSchema = new mongoose.Schema({
  entries: { type: Map, of: { type: String, default: 'unset' } },
});
PrimitiveMapSchema.plugin(mongooseLeanDefaults);

describe('Map of primitive values with a default (known limitation)', () => {
  let MyModel: mongoose.Model<any>;
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI);
    MyModel = mongoose.model('SchemaWithPrimitiveMap', PrimitiveMapSchema);
  });
  beforeEach(async () => {
    await MyModel.deleteMany({});
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('does not backfill defaults for primitive map values (unlike map-of-schema)', async () => {
    // A Map's value type doesn't carry a meaningful "missing subfield" concept the way
    // a subdocument does, so this stays out of scope for defaults backfilling.
    await MyModel.collection.insertOne({ entries: { a: 'x' } });
    const result = await MyModel.findOne({}).lean({ defaults: true }).exec();
    expect(result.entries).toEqual({ a: 'x' });
  });
});
