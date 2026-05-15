/** lean() may return Node's serialized Buffer shape `{ type: "Buffer", data: number[] }`. */
function isSerializedBuffer(
  value: unknown
): value is { type: "Buffer"; data: number[] } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.type === "Buffer" && Array.isArray(v.data);
}

/** Coerce Mongoose / lean() binary fields into a Node Buffer. */
export function bufferFromMongo(value: unknown): Buffer | null {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (
    typeof value === "object" &&
    "_bsontype" in value &&
    (value as { _bsontype: string })._bsontype === "Binary"
  ) {
    const raw = (value as { buffer?: Uint8Array | ArrayBuffer }).buffer;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (raw instanceof ArrayBuffer) return Buffer.from(new Uint8Array(raw));
  }
  if (isSerializedBuffer(value)) {
    return Buffer.from(value.data);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(value));
  }
  return null;
}
