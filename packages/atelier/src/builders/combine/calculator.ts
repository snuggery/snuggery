import {cpus} from 'os';

const enum Operator {
  Plus = '+',
  Minus = '-',
  Times = '*',
  Divide = '/',
}

const ops: {[o in Operator]?: (a: number, b: number) => number}[] = [
  {
    [Operator.Times]: (a, b) => a * b,
    [Operator.Divide]: (a, b) => a / b,
  },
  {
    [Operator.Plus]: (a, b) => a + b,
    [Operator.Minus]: (a, b) => a - b,
  },
];

const constants = {
  cpuCount: () => cpus().length,
} as const;

type Constant = keyof typeof constants;

interface Calculation
  extends Array<Operator | number | Constant | Calculation> {
  parent?: Calculation;
}

function isOperator(
  value: number | Constant | Operator | Calculation,
): value is Operator {
  return !Array.isArray(value) && /^[-+*/]$/.test(`${value}`);
}

function isConstant(value: string): value is Constant {
  return value in constants;
}

function parseCalculation(s: string): Calculation {
  const calculation: Calculation = [];
  let current = '';

  let currentLevel: Calculation = calculation;

  for (let i = 0, char: string; (char = s.charAt(i)); i++) {
    if (char === '(') {
      const parentLevel = currentLevel;
      currentLevel = [];
      currentLevel.parent = parentLevel;
      parentLevel.push(currentLevel);
    } else if (char === ')') {
      if (currentLevel.parent == null) {
        throw new Error(
          `Uneven parentheses: extra closing parenthesis at index ${i}`,
        );
      }
      if (currentLevel.length === 0) {
        throw new Error(`Invalid calculation: empty parentheses at index ${i}`);
      }
      currentLevel = currentLevel.parent;
    } else if ('*/+-'.includes(char)) {
      if (current == '' && char == '-') {
        current = '-';
      } else {
        if (current === '' || current === '-') {
          if (currentLevel.length === 0) {
            throw new Error(
              `Invalid calculation: operator at start of calculation`,
            );
          }
          if (isOperator(currentLevel[currentLevel.length - 1]!)) {
            throw new Error(
              `Invalid calculation: operator followed by operator at index ${i}`,
            );
          }
        } else {
          currentLevel.push(parseFloat(current));
          current = '';
        }

        currentLevel.push(char as Operator);
      }
    } else if (/[0-9.]/.test(char)) {
      current += s.charAt(i);
    } else {
      let foundConstant: Constant | undefined;
      for (const c of Object.keys(constants) as Constant[]) {
        if (s.slice(i, c.length) === c) {
          foundConstant = c;
        }
      }

      if (foundConstant != null) {
        if (current === '-') {
          currentLevel.push(-1, Operator.Times);
          current = '';
        }

        if (current !== '') {
          throw new Error(`Invalid calculation "${current}${foundConstant}"`);
        }

        currentLevel.push(foundConstant);
        i += foundConstant.length - 1;
      }
    }
  }

  if (currentLevel !== calculation) {
    throw new Error(`Uneven parentheses: missing close parenthesis`);
  }

  if (current !== '') {
    calculation.push(parseFloat(current));
  }

  return calculation;
}

function performCalculation(calc: Calculation): number {
  const flattenedCalc = calc.map(part => {
    if (Array.isArray(part)) {
      return performCalculation(part);
    } else if (typeof part === 'string' && isConstant(part)) {
      return constants[part]();
    } else {
      return part;
    }
  });

  for (let i = 0; i < ops.length; i++) {
    for (let j = 0; j < flattenedCalc.length; j++) {
      const c = flattenedCalc[j]!;

      if (isOperator(c) && ops[i]![c]) {
        const a = flattenedCalc[j - 1];
        const b = flattenedCalc[j + 1];

        if (typeof a !== 'number' || typeof b !== 'number') {
          throw new Error(`Invalid calculation`);
        }

        flattenedCalc.splice(j - 1, 3, ops[i]![c]!(a, b));
        j--;
      }
    }
  }

  if (flattenedCalc.length > 1 || typeof flattenedCalc[0] !== 'number') {
    throw new Error('unable to resolve calculation');
  } else {
    return flattenedCalc[0];
  }
}

export function calculate(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }

  return performCalculation(parseCalculation(value.replace(/\s+/g, '')));
}
