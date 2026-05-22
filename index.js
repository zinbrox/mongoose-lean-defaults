'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachDefaults = void 0;
const mpath_1 = __importDefault(require("mpath"));
const mongoose_1 = __importDefault(require("mongoose"));
const DEFAULTS_REGISTRY = new WeakMap();
function mongooseLeanDefaults(schema, options) {
    const fn = attachDefaultsMiddleware(schema, options);
    schema.post('find', fn);
    schema.post('findOne', fn);
    schema.post('findOneAndUpdate', fn);
    schema.post('findOneAndRemove', fn);
    schema.post('findOneAndDelete', fn);
}
exports.default = mongooseLeanDefaults;
function getDefaultsRegistryEntry(schema) {
    const existing = DEFAULTS_REGISTRY.get(schema);
    if (existing) {
        return existing;
    }
    const defaults = [];
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
                fnValue: isFunc ? defaultValue : undefined,
                pathSegments,
            });
        }
    });
    DEFAULTS_REGISTRY.set(schema, defaults);
    return defaults;
}
function attachDefaultsMiddleware(schema, options) {
    return function (res) {
        attachDefaults.call(this, schema, res, options);
    };
}
function attachDefaults(schema, res, options, prefix) {
    var _a, _b;
    if (res == null) {
        return res;
    }
    const shouldApplyDefaults = !!this._mongooseOptions.lean &&
        ((_b = (_a = this._mongooseOptions.lean.defaults) !== null && _a !== void 0 ? _a : options === null || options === void 0 ? void 0 : options.defaults) !== null && _b !== void 0 ? _b : false);
    if (shouldApplyDefaults) {
        if (getDefaultsRegistryEntry(schema).length) {
            if (Array.isArray(res)) {
                for (let i = 0; i < res.length; ++i) {
                    attachDefaultsToDoc.call(this, schema, res[i], prefix);
                }
            }
            else {
                attachDefaultsToDoc.call(this, schema, res, prefix);
            }
        }
        for (let i = 0; i < schema.childSchemas.length; ++i) {
            const _schema = schema.childSchemas[i].schema;
            if (!getDefaultsRegistryEntry(_schema).length) {
                continue;
            }
            const _path = schema.childSchemas[i].model.path;
            let _doc = mpath_1.default.get(_path, res);
            if (Array.isArray(_doc)) {
                _doc = _doc.flat();
                if (_doc.length === 0) {
                    continue;
                }
            }
            if (_doc == null) {
                continue;
            }
            attachDefaults.call(this, _schema, _doc, options, prefix ? `${prefix}.${_path}` : _path);
        }
        return res;
    }
    else {
        return res;
    }
}
exports.attachDefaults = attachDefaults;
function attachDefaultsToDoc(schema, doc, prefix) {
    if (doc == null)
        return;
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
    const fields = this._fields;
    const selectedFieldKeys = this.selected() && fields ? Object.keys(fields) : null;
    for (let i = 0; i < defaults.length; i++) {
        const defaultEntry = defaults[i];
        if (selectedFieldKeys) {
            const pathname = defaultEntry.pathSegments.join('.');
            const fullPath = prefix ? `${prefix}.${pathname}` : pathname;
            const matchedKey = selectedFieldKeys.find((key) => fullPath.startsWith(key) || key.startsWith(fullPath));
            const included = matchedKey && (fields === null || fields === void 0 ? void 0 : fields[matchedKey]) != null;
            if (this.selectedInclusively() && !included) {
                continue;
            }
            if (this.selectedExclusively() && included) {
                continue;
            }
        }
        const pathSegments = defaultEntry.pathSegments;
        let cur = doc;
        const lastIndex = pathSegments.length - 1;
        for (let j = 0; j < lastIndex; ++j) {
            cur[pathSegments[j]] = cur[pathSegments[j]] || {};
            cur = cur[pathSegments[j]];
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
function getDefault(schemaType) {
    if (typeof schemaType.defaultValue === 'function') {
        if (schemaType.defaultValue === Date.now ||
            schemaType.defaultValue === Array ||
            schemaType.defaultValue.name.toLowerCase() === 'objectid') {
            return function (doc) {
                return schemaType.defaultValue.call(doc);
            };
        }
        else {
            return function (doc) {
                return schemaType.defaultValue.call(doc, doc);
            };
        }
    }
    else if (Object.prototype.hasOwnProperty.call(schemaType.options, 'default')) {
        if (typeof schemaType.options.default === 'function') {
            return function (doc) {
                return schemaType.options.default.call(doc, doc);
            };
        }
        return schemaType.options.default;
    }
    else if (('Embedded' in mongoose_1.default.Schema.Types &&
        schemaType instanceof mongoose_1.default.Schema.Types.Embedded) ||
        ('Subdocument' in mongoose_1.default.Schema.Types &&
            schemaType instanceof mongoose_1.default.Schema.Types.Subdocument)) {
        return function () {
            return {};
        };
    }
    else {
        return schemaType.defaultValue;
    }
}
