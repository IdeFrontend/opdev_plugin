import path from 'path';

type OpLike = { op_path?: string; op_name?: string };

export function get_op_run_path(operator: OpLike) {
  const p = operator && operator.op_path ? operator.op_path : path.join(process.cwd(), 'ops', operator && operator.op_name ? operator.op_name : 'unknown');
  return {
    absolute: () => path.resolve(p),
    toString: () => path.resolve(p)
  };
}
