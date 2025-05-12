import { OutputRecord } from './OutputRecord';
import { AsyncRecord } from './AsyncRecord';
import { StreamRecord } from './StreamRecord';
import { Result } from './Result';
import { ResultRecord } from './ResultRecord';
import { OutOfBandRecord } from './OutOfBandRecord';

// First sets below -- Regex exprs defined with `` need to escape \ char
const VARIABLE = /((^[a-zA-Z_][a-zA-Z0-9_\-]*)|(^=))/;
const TOKEN = '\\d*';
const ASYNC_RECORD = '[\\*\\+\\=]';
const STREAM_RECORD = '[\\~\\@\\&]';
const CSTRING = /^\"((\\.|[^"])*)\"/;
const OUT_OF_BAND_RECORD = new RegExp(
  `^(?:(${TOKEN})(${ASYNC_RECORD})|(${STREAM_RECORD}))`
);
const RESULT_RECORD = new RegExp(
  `^(${TOKEN})\\^(done|running|connected|error|exit)`
);
const ASYNC_CLASS = /^([_a-zA-Z0-9\-]*)/;
const GDB_PROMPT = '(gdb)';

export const STOPPED = 'stopped';
export const RUNNING = 'running';
export const ERROR = 'error';

const VALUE_CSTRING = '"';
const VALUE_TUPLE = '{';
const VALUE_LIST = '[';

// Relative ordering of records in an OUT_OF_BAND_RECORD regexp
const TOKEN_POS = 1;
const ASYNC_RECORD_POS = 2;
const STREAM_RECORD_POS = 3;

export class MIParser {
  private buffer: string = '';
  private token: number = 0;

  public parse(str: string, unknown: object): OutputRecord | null {
    let record: OutputRecord | null;
    this.buffer = str;

    try {
      // ( out-of-band-record )* [ result-record ] "(gdb)" nl
      record = this.parseOutOfBandRecord()
        || this.parseResultRecord()
        || this.parseGDBPrompt(unknown);

      if (record) {
        record.response = str;
      }
    } catch (error: any) {
      console.error(`Parser error: ${error.message}`);
      throw error;
    }

    return record;
  }

  private parseToken(match: any[]): number {
    if (match[TOKEN_POS] !== '') {
      this.token = parseInt(match[TOKEN_POS]);
    } else {
      this.token = NaN;
    }

    return this.token;
  }

  private parseGDBPrompt(unknown: object): null {
    let gdbPrompt = this.buffer.trimEnd();
    if (gdbPrompt !== GDB_PROMPT && gdbPrompt != `undefined${GDB_PROMPT}`) {
      unknown["text"] = this.buffer;
    }

    return null;
  }

  private parseOutOfBandRecord(): OutOfBandRecord | null {
    // async-record | stream-record
    let match: any[] | null;

    if ((match = OUT_OF_BAND_RECORD.exec(this.buffer))) {
      this.parseToken(match);

      if (match[ASYNC_RECORD_POS]) {
        return this.parseAsyncRecord();
      } else if (match[STREAM_RECORD_POS]) {
        return this.parseStreamRecord();
      } else {
        throw new Error('Expected to find AsyncRecord or StreamRecord');
      }
    } else return null;
  }

  private parseAsyncRecord(): AsyncRecord {
    // exec-async-output | status-async-output | notify-async-output
    // First character denotes result class
    let match: any, result: any;
    const record = new AsyncRecord(this.token);
    record.setType(this.buffer[0]);

    this.buffer = this.buffer.substring(this.buffer[0].length);
    if ((match = ASYNC_CLASS.exec(this.buffer))) {
      // async-output ==> async-class ( "," result )* nl
      record.setClass(match[1]);
      this.buffer = this.buffer.substring(match[0].length);

      while (this.buffer[0] === ',') {
        // Consume , and read result
        this.buffer = this.buffer.substr(1);

        if ((result = this.parseResult())) {
          record.addResult(result);
        }
      }
    } else {
      throw new Error('Failed to parse AsyncRecord');
    }

    return record;
  }

  private parseStreamRecord(): StreamRecord {
    const ERROR_MSG_REGX = /@"\[ERROR\](.+)/;
    let streamRecordStr = this.buffer;
    if (streamRecordStr.match(ERROR_MSG_REGX)) {
      let match = streamRecordStr.match(ERROR_MSG_REGX);
      let errorMsg = '[ERROR]' + match[1].replace('\\r\\n"', '');
      let record = new StreamRecord(-1, errorMsg);
      record.setType('@');
      return record;
    }
    return new StreamRecord(this.token, this.buffer[1]);
  }

  private parseResultRecord(): ResultRecord | null {
    // [ token ] "^" result-class ( "," result )* nl
    let match: any, record: any;

    if ((match = RESULT_RECORD.exec(this.buffer))) {
      record = new ResultRecord(this.parseToken(match));
      record.setType(match[2]);
      record.setClass(match[2]);

      // Consume first part of match, parse results*
      this.buffer = this.buffer.substring(match[0].length);

      while (this.buffer[0] === ',') {
        // Consume , and read result
        this.buffer = this.buffer.substr(1);
        const result = this.parseResult();
        if (result) {
          record.addResult(result);
        }
      }

      return record;
    } else {
      return null;
    }
  }

  private parseResult(): any[] | null {
    let match: any[] | null;

    // MSDebug MI输出Tensor'='两端，','后端有空格， 与GDB/MI不同
    this.buffer = this.buffer.replace(/\s+=\s+/g, "=");
    this.buffer = this.buffer.replace(/,\s+/g, ",");

    // GM_ADDR变量多余字符
    this.buffer = this.buffer.replace(" \\\"\\\"", "");

    if (match = /^([a-zA-Z_][a-zA-Z0-9_]*(?:::[a-zA-Z_][:a-zA-Z0-9_<>,\s]*)+)=/.exec(this.buffer)) {
      // AscendC::BasicGlobalTensor<__fp16>=..., 匹配等号之前的是名称
      this.buffer = this.buffer.substring(match[1].length + 1);
      return [match[1], this.parseValue()];
    }
    else if ((match = VARIABLE.exec(this.buffer))) {
      // Also consume '='
      let increment = this.buffer.startsWith('=') ? 0 : 1;
      this.buffer = this.buffer.substring(match[0].length + increment);
      return [match[1] == '=' ? 'UNDEFINED' : match[1], this.parseValue()];
    }
    else if (match = /^(\[\d+\])/.exec(this.buffer)) {
      // shape的tuple是[0]=0,[1]=0, 变量名是[0],[1]
      this.buffer = this.buffer.substring(match[0].length + 1);
      return [match[1], this.parseValue()];
    }
    else {
      return null;
    }
  }

  private parseValue(): any {
    // value ==> const | tuple | list

    let mat = null;
    if (mat = /^\"(\{.*\})\"$/.exec(this.buffer)) {
      // MSDebug MI: GlobalTensor ==> \"{bufferSize = 2048, ....}\"
      this.buffer = mat[1];
    }

    switch (this.buffer[0]) {
      case VALUE_CSTRING:
        return this.parseCString();

      case VALUE_TUPLE:
        return this.parseTuple();

      case VALUE_LIST:
        return this.parseList();

      default:
        return this.parseMSDebugFormat();
    }
  }

  private parseMSDebugFormat(): any {
    let match: string[] | null;
    if (match = /^'([^']*)'/.exec(this.buffer)) {
      // 单引号字符串， 如shapeDim='\\\\\\\\0'
      this.buffer = this.buffer.substring(match[0].length);
      return match[1];
    }
    else if (match = /^([a-zA-Z_][a-zA-Z0-9_\-]*)/.exec(this.buffer)) {
      // 无引号字符串， 如dataFormat=ND
      this.buffer = this.buffer.substring(match[0].length);
      return match[1];
    }
    else if (match = /^(0x[0-9a-fA-F]+)/.exec(this.buffer)) {
      // 指针， 如address_=0x000012c0c0015000
      this.buffer = this.buffer.substring(match[0].length);
      return match[0];
    }
    else if (match = /^(\-|\+)?\d+(\.\d+)?/.exec(this.buffer)) {
      // 数字， 如bufferSize_=2048
      this.buffer = this.buffer.substring(match[0].length);
      if (match[2]) {
        // 浮点数
        return parseFloat(match[0]);
      }
      else {
        // 整数
        return parseInt(match[0]);
      }
    }
    else {
      return null;
    }
  }

  private parseCString(): string {
    let match: string[] | null;

    if ((match = CSTRING.exec(this.buffer))) {
      // Consume corresponding '"'
      this.buffer = this.buffer.substring(match[0].length);
      return match[1];
    } else {
      throw new Error('could not parse cstring: ' + this.buffer);
    }
  }

  private parseTuple(): Result[] {
    // tuple ==> "{}" | "{" result ( "," result )* "}"
    let result: any[] | null;
    const tuple = <any>{};

    do {
      // Skip over , or {
      this.buffer = this.buffer.substring(1);
      if ((result = this.parseResult())) {
        tuple[result[0]] = result[1];
      }
    } while (this.buffer[0] === ',');

    // Conbsume last }
    this.buffer = this.buffer.substring(1);

    return tuple;
  }

  private parseList(): any[] {
    // list ==> "[]" | "[" value ( "," value )* "]" | "[" result ( "," result )* "]"
    let match: any[] | null;
    const list: any = [];

    // Consume first [
    this.buffer = this.buffer.substring(1);

    // Is this a list of values or list of results?
    if (
      [VALUE_CSTRING, VALUE_LIST, VALUE_TUPLE].indexOf(this.buffer[0]) !== -1
    ) {
      // Value list
      while ((match = this.parseValue())) {
        this.buffer = this.buffer.substring(1);
        list.push(match);
      }
    } else {
      // Result list
      while ((match = this.parseResult())) {
        this.buffer = this.buffer.substring(1);
        list.push(match);
      }
    }

    // If empty list, eat analogous ]
    if (!list.length) {
      this.buffer = this.buffer.substring(1);
    }

    return list;
  }
}
