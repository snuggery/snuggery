import {cpus} from 'os';

enum Operator {
  Plus = '+',
  Minus = '-',
  Times = '*',
  Divide = '/',
}

enum Group {
  Start = '(',
  End = ')',
}

const constants = {
  cpuCount: () => cpus().length,
} as const;

type Constant = keyof typeof constants;

const constantNames = Object.keys(constants) as Constant[];

type Token = Group | Operator | Constant | number;

export class InvalidCalculationError extends Error {
  constructor(calculation: string, index: number) {
    super(
      `Invalid calculation "${calculation.slice(
        0,
        index,
      )}[HERE -->]${calculation.slice(index)}"`,
    );

    this.name = 'InvalidCalculationError';
  }
}

function tokenize(calculation: string) {
  const tokens = [] as {token: Token; start: number}[];

  let i = 0;
  const {length} = calculation;

  let currentNumber: string[] = [];
  let startOfCurrentNumber = 0;

  while (i < length) {
    const current = calculation[i]!;

    if (/[0-9.]/.test(current)) {
      if (currentNumber.length === 0) {
        startOfCurrentNumber = i;
      }
      currentNumber.push(current);

      i++;
      continue;
    }

    if (currentNumber.length) {
      tokens.push({
        token: parseFloat(currentNumber.join('')),
        start: startOfCurrentNumber,
      });
      currentNumber = [];
    }

    if (/\s/.test(current)) {
      // ignore
    } else if ('()+-*/'.includes(current)) {
      tokens.push({token: current as Group | Operator, start: i});
    } else {
      let found = false;
      for (const constant of constantNames) {
        if (constant === calculation.substr(i, constant.length)) {
          tokens.push({token: constant, start: i});

          found = true;
          i += constant.length;
          break;
        }
      }

      if (!found) {
        throw new InvalidCalculationError(calculation, i);
      }

      continue;
    }

    i++;
  }

  if (currentNumber.length) {
    tokens.push({
      token: parseFloat(currentNumber.join('')),
      start: startOfCurrentNumber,
    });
  }

  return tokens;
}

const performOperator = {
  [Operator.Plus]: (left: number, right: number) => left + right,
  [Operator.Minus]: (left: number, right: number) => left - right,
  [Operator.Times]: (left: number, right: number) => left * right,
  [Operator.Divide]: (left: number, right: number) => left / right,
} as const;

function parse(
  calculation: string,
  tokens: {token: Token; start: number}[],
): number {
  let position = 0;
  const {length} = tokens;

  const result = parseExpression();

  if (position !== length) {
    throw new InvalidCalculationError(calculation, peek()!.start);
  }

  return result;

  function parseExpression(): number {
    let result = parseMultiplicativeExpression();
    let token = peek();

    while (token?.token === Operator.Plus || token?.token === Operator.Minus) {
      pop();
      result = performOperator[token.token](
        result,
        parseMultiplicativeExpression(),
      );
      token = peek();
    }

    return result;
  }

  function parseMultiplicativeExpression(): number {
    let result = parsePrimaryExpression();
    let token = peek();

    while (
      token?.token === Operator.Times ||
      token?.token === Operator.Divide
    ) {
      pop();
      result = performOperator[token.token](result, parsePrimaryExpression());
      token = peek();
    }

    return result;
  }

  function parsePrimaryExpression(): number {
    const {token, start} = pop();

    if (typeof token === 'number') {
      return token;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } else if (constantNames.includes(token as any)) {
      return constants[token as Constant]();
    } else if (token === Group.Start) {
      try {
        return parseExpression();
      } finally {
        pop(Group.End);
      }
    } else {
      throw new InvalidCalculationError(calculation, start);
    }
  }

  function pop(token?: Token) {
    if (token != null) {
      if (tokens[position]!.token !== token) {
        throw new InvalidCalculationError(calculation, tokens[position]!.start);
      }
    }

    if (position >= length) {
      throw new InvalidCalculationError(calculation, calculation.length);
    }

    return tokens[position++]!;
  }

  function peek() {
    return tokens[position];
  }
}

export function calculate(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }

  return parse(value, tokenize(value));
}
