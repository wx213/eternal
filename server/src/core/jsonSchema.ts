/**
 * zod -> JSON Schema（function calling 用）
 *
 * 只覆盖工具定义实际用到的 zod 子集，换取零额外依赖与完全可控的输出。
 * 关键收益：模型看到的参数名就是运行时校验的参数名（原内核用 arg1/arg2 位置参数，模型极易填错）。
 */
import { z } from 'zod';

type JsonSchema = Record<string, unknown>;

/** 读取 zod 内部定义。zod v3 未导出这些类型，此处集中做一次收窄。 */
function defOf(schema: z.ZodTypeAny): any {
  return (schema as unknown as { _def: any })._def;
}

function unwrapDescription(schema: z.ZodTypeAny): string | undefined {
  const description = (schema as { description?: string }).description;
  return description && description.trim() ? description.trim() : undefined;
}

function convert(schema: z.ZodTypeAny): JsonSchema {
  const def = defOf(schema);
  const description = unwrapDescription(schema);
  const withMeta = (base: JsonSchema): JsonSchema => (description ? { ...base, description } : base);

  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodString: {
      const base: JsonSchema = { type: 'string' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'min') base.minLength = check.value;
        if (check.kind === 'max') base.maxLength = check.value;
      }
      return withMeta(base);
    }

    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const base: JsonSchema = { type: def.checks?.some((c: any) => c.kind === 'int') ? 'integer' : 'number' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'min') base.minimum = check.value;
        if (check.kind === 'max') base.maximum = check.value;
      }
      return withMeta(base);
    }

    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return withMeta({ type: 'boolean' });

    case z.ZodFirstPartyTypeKind.ZodEnum:
      return withMeta({ type: 'string', enum: [...def.values] });

    case z.ZodFirstPartyTypeKind.ZodNativeEnum:
      return withMeta({ type: 'string', enum: Object.values(def.values) });

    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return withMeta({ const: def.value });

    case z.ZodFirstPartyTypeKind.ZodArray:
      return withMeta({ type: 'array', items: convert(def.type) });

    case z.ZodFirstPartyTypeKind.ZodObject:
      return withMeta(convertObject(schema as z.ZodObject<z.ZodRawShape>));

    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
      return withMeta(convert(def.innerType));

    case z.ZodFirstPartyTypeKind.ZodDefault: {
      const inner = convert(def.innerType);
      return withMeta({ ...inner, default: def.defaultValue() });
    }

    case z.ZodFirstPartyTypeKind.ZodUnion: {
      const options = (def.options as z.ZodTypeAny[]).map(convert);
      return withMeta({ anyOf: options });
    }

    case z.ZodFirstPartyTypeKind.ZodRecord:
      return withMeta({ type: 'object', additionalProperties: convert(def.valueType) });

    default:
      // 未覆盖的类型退化为「任意值」，保证不会因为新类型直接崩溃
      return withMeta({});
  }
}

/** optional / default 包裹的字段在 JSON Schema 里不进 required */
function isOptionalField(schema: z.ZodTypeAny): boolean {
  const typeName = defOf(schema).typeName;
  return (
    typeName === z.ZodFirstPartyTypeKind.ZodOptional ||
    typeName === z.ZodFirstPartyTypeKind.ZodDefault ||
    schema.isOptional()
  );
}

function convertObject(schema: z.ZodObject<z.ZodRawShape>): JsonSchema {
  const shape = schema.shape;
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    properties[key] = convert(field as z.ZodTypeAny);
    if (!isOptionalField(field as z.ZodTypeAny)) required.push(key);
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const converted = convert(schema);
  // function calling 要求顶层是 object
  if (converted.type === 'object') return converted;
  return { type: 'object', properties: {}, additionalProperties: false };
}
