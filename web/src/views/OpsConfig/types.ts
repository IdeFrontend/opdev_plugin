import type i18nResources from 'shared:/i18n';

/**
 * schema仿真数据结构类型
 */
export type FormAttributeType =
  | 'boolean'
  | 'number'
  | 'string'
  | 'enum'
  | 'array'
  | 'array:string'
  | 'array:number';

/**
 * schema转换后的数据结构
 */
export interface FormAttribute<T extends FormAttributeType> {
  key: string;
  type: T;
  label: I18nLabels;
  defaultValue?: ValueType<T>;
  options?: OptionsType<T>;
}

type I18nLabels = Record<keyof typeof i18nResources, string>;

type ValueType<T extends FormAttributeType> = T extends 'boolean'
  ? boolean
  : T extends 'number'
    ? number
    : T extends 'string'
      ? string
      : T extends 'enum'
        ? string | number | undefined
        : T extends 'array'
          ? boolean | string | number[]
          : never;

type OptionsType<T extends FormAttributeType> = T extends 'enum'
  ? { value: ValueType<T>; label: I18nLabels }[]
  : undefined;
