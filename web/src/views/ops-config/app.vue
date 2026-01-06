<script setup lang="ts">
import { ref } from 'vue';

import { FormAttribute, FormAttributeType } from './types';
import AttrController from './components/attr-controller.vue';

const mockSchema: FormAttribute<FormAttributeType>[] = [
  {
    key: 'test1',
    type: 'string',
    label: { zh: '中文版1', en: 'En1' },
  },
  {
    key: 'test2',
    type: 'number',
    label: { zh: '中文版2', en: 'En2' },
    defaultValue: 5,
  },
  {
    key: 'test3',
    type: 'enum',
    label: { zh: '中文版3', en: 'En3' },
    options: [
      { label: { zh: '选项1', en: 'option1' }, value: 1 },
      { label: { zh: '选项2', en: 'option2' }, value: 2 },
      { label: { zh: '选项3', en: 'option3' }, value: 3 },
      { label: { zh: '选项4', en: 'option4' }, value: 4 },
      { label: { zh: '选项5', en: 'option5' }, value: 5 },
    ],
  },
  {
    key: 'test4',
    type: 'boolean',
    label: { zh: '中文版4', en: 'En4' },
    defaultValue: true,
  },
];

const formModel = ref<Record<string, unknown>>({});
</script>

<template>
  <a-form :model="formModel">
    <template
      v-for="attr in mockSchema"
      :key="attr.key"
    >
      <attr-controller :attr="attr"></attr-controller>
    </template>
  </a-form>
</template>
