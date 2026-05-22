import { Schema, Query, Document } from 'mongoose';
export interface MongooseLeanDefaultsOptions {
    defaults?: boolean;
}
export default function mongooseLeanDefaults(schema: Schema<any, any, any, any>, options?: MongooseLeanDefaultsOptions): void;
export declare function attachDefaults(this: Query<unknown, Document>, schema: Schema, res: unknown, options?: MongooseLeanDefaultsOptions, prefix?: string): unknown;
