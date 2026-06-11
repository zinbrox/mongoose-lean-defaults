'use strict';
import mpath from 'mpath';
import mongoose, { Schema, Query, Document, SchemaType } from 'mongoose';

export interface MongooseLeanDefaultsOptions {
  defaults?: boolean;
}
interface Default {
  value: unknown | undefined;
  fnValue: ((doc: unknown) => unknown) | undefined;
  pathSegments: string[];
}

const DEFAULTS_REGISTRY = new WeakMap<Schema, Default[]>();

export default function mongooseLeanDefaults(
  schema: Schema<any, any, any, any>,
  options?: MongooseLeanDefaultsOptions,
): void {
  const fn = attachDefaultsMiddleware(schema, options);
  schema.post('find', fn);
  schema.post('findOne', fn);
  schema.post('findOneAndUpdate', fn);
  schema.post('findOneAndRemove', fn);
  schema.post('findOneAndDelete', fn);
}

function getDefaultsRegistryEntry(schema: Schema): Default[] {
  const existing = DEFAULTS_REGISTRY.get(schema);
  if (existing) {
    return existing;
  }

  const defaults: Default[] = [];
  // Set early so recursive calls to getDefaultsRegistryEntry on this same schema
  // (via getDefault → Embedded/Subdocument check) return [] instead of looping.
  DEFAULTS_REGISTRY.set(schema, defaults);

  schema.eachPath((pathname, schemaType) => {
    if (pathname.endsWith('.$*')) {
      return;
    }
    const pathSegments = pathname.split('.');
    const defaultValue = getDefault(schemaType);

    if (defaultValue !== undefined) {
      const isFunc = typeof defaultValue === 'function';
      defaults.push({
        value: isFunc ? undefined : defaultValue,
        fnValue: isFunc ? (defaultValue as Default['fnValue']) : undefined,
        pathSegments,
      });
    }
  });

  DEFAULTS_REGISTRY.set(schema, defaults);

  return defaults;
}

function attachDefaultsMiddleware(
  schema: Schema,
  options?: MongooseLeanDefaultsOptions,
) {
  return function (this: Query<unknown, Document>, res: unknown) {
    attachDefaults.call(this, schema, res, options);
  };
}

export function attachDefaults(
  this: Query<unknown, Document>,
  schema: Schema,
  res: unknown,
  options?: MongooseLeanDefaultsOptions,
  prefix?: string,
) {
  if (res == null) {
    return res;
  }

  const shouldApplyDefaults: boolean =
    !!this._mongooseOptions.lean &&
    (this._mongooseOptions.lean.defaults ?? options?.defaults ?? false);

  if (shouldApplyDefaults) {
    if (getDefaultsRegistryEntry(schema).length) {
      if (Array.isArray(res)) {
        for (let i = 0; i < res.length; ++i) {
          attachDefaultsToDoc.call(this, schema, res[i], prefix);
        }
      } else {
        attachDefaultsToDoc.call(this, schema, res, prefix);
      }
    }

    for (let i = 0; i < schema.childSchemas.length; ++i) {
      const _schema = schema.childSchemas[i].schema;
      if (!getDefaultsRegistryEntry(_schema).length) {
        continue;
      }
      const _path = schema.childSchemas[i].model.path;
      let _doc = mpath.get(_path, res);
      if (Array.isArray(_doc)) {
        _doc = _doc.flat();
        if (_doc.length === 0) {
          continue;
        }
      }
      if (_doc == null) {
        continue;
      }
      attachDefaults.call(
        this,
        _schema,
        _doc,
        options,
        prefix ? `${prefix}.${_path}` : _path,
      );
    }

    return res;
  } else {
    return res;
  }
}

function attachDefaultsToDoc(
  this: Query<unknown, Document>,
  schema: Schema,
  doc: unknown,
  prefix?: string,
) {
  if (doc == null) return;
  if (Array.isArray(doc)) {
    for (let i = 0; i < doc.length; ++i) {
      attachDefaultsToDoc.call(this, schema, doc[i], prefix);
    }
    return;
  }

  const defaults = getDefaultsRegistryEntry(schema);
  if (!defaults.length) {
    return;
  }
  // @ts-expect-error this._fields is private
  const fields: Record<string, unknown> | null = this._fields;
  const selectedFieldKeys: string[] | null =
    this.selected() && fields ? Object.keys(fields) : null;

  for (let i = 0; i < defaults.length; i++) {
    const defaultEntry = defaults[i];

    if (selectedFieldKeys) {
      const pathname = defaultEntry.pathSegments.join('.');
      const fullPath = prefix ? `${prefix}.${pathname}` : pathname;
      const matchedKey = selectedFieldKeys.find(
        (key) =>
          fullPath === key ||
          fullPath.startsWith(key + '.') ||
          key.startsWith(fullPath + '.'),
      );

      const included = matchedKey && fields?.[matchedKey] != null;
      if (this.selectedInclusively() && !included) {
        continue;
      }
      if (this.selectedExclusively() && included) {
        continue;
      }
    }

    const pathSegments = defaultEntry.pathSegments;
    let cur = doc as Record<string, unknown>;
    const lastIndex = pathSegments.length - 1;
    for (let j = 0; j < lastIndex; ++j) {
      cur[pathSegments[j]] = cur[pathSegments[j]] || {};
      cur = cur[pathSegments[j]] as Record<string, unknown>;
    }

    if (cur[pathSegments[lastIndex]] === undefined) {
      let valueToDefault = defaultEntry.value;
      if (defaultEntry.fnValue) {
        valueToDefault = defaultEntry.fnValue(doc);
      }
      if (valueToDefault !== undefined) {
        cur[pathSegments[lastIndex]] = valueToDefault;
      }
    }
  }
}

function getDefault(schemaType: SchemaType): unknown {
  // @ts-expect-error defaultValue is a valid prop
  if (typeof schemaType.defaultValue === 'function') {
    if (
      // @ts-expect-error defaultValue is a valid prop
      schemaType.defaultValue === Date.now ||
      // @ts-expect-error defaultValue is a valid prop
      schemaType.defaultValue === Array ||
      // @ts-expect-error defaultValue is a valid prop
      schemaType.defaultValue.name.toLowerCase() === 'objectid'
    ) {
      return function (doc: unknown) {
        // @ts-expect-error defaultValue is a valid prop
        return schemaType.defaultValue.call(doc);
      };
    } else {
      return function (doc: unknown) {
        // @ts-expect-error defaultValue is a valid prop
        return schemaType.defaultValue.call(doc, doc);
      };
    }
  } else if (
    Object.prototype.hasOwnProperty.call(schemaType.options, 'default')
  ) {
    // Sanity check for function defaults
    if (typeof schemaType.options.default === 'function') {
      return function (doc: unknown) {
        return schemaType.options.default.call(doc, doc);
      };
    }
    return schemaType.options.default;
  } else if (
    ('Embedded' in mongoose.Schema.Types &&
      // @ts-expect-error Embedded exists in mongoose@5
      schemaType instanceof mongoose.Schema.Types.Embedded) ||
    ('Subdocument' in mongoose.Schema.Types &&
      schemaType instanceof mongoose.Schema.Types.Subdocument)
  ) {
    // Only create an empty-object factory when the child schema has fields with
    // actual defaults — otherwise the embedded field should remain absent.
    const childSchema: Schema | undefined = (schemaType as any).schema;
    if (childSchema && getDefaultsRegistryEntry(childSchema).length > 0) {
      return function () {
        return {};
      };
    }
    // @ts-expect-error defaultValue is a valid prop
    return schemaType.defaultValue;
  } else {
    // @ts-expect-error defaultValue is a valid prop
    return schemaType.defaultValue;
  }
}
