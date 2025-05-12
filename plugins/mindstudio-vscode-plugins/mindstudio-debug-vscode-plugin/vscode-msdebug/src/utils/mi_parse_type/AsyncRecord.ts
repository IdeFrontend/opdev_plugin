import { OutOfBandRecord } from './OutOfBandRecord';

export enum AsyncRecordType {
  EXEC = '*',
  STATUS = '+',
  NOTIFY = '='
}

export class AsyncRecord extends OutOfBandRecord {
  protected type?: AsyncRecordType;
}
