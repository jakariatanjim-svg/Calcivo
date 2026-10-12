/**
 * Calculator engine.
 *
 * Contains the whole math pipeline (tokenizer -> recursive descent parser ->
 * evaluator) plus the calculator state machine. There is no DOM access in this
 * file on purpose, so every behaviour can be unit tested in Node.
 */

export const ERROR_CODE = {
  SYNTAX: 'syntax',
  DIVIDE_BY_ZERO: 'divideByZero',
  DOMAIN: 'domain',
  OVERFLOW: 'overflow',
};

export const ERROR_MESSAGE = {
  [ERROR_CODE.SYNTAX]: 'Incomplete expression',
  [ERROR_CODE.DIVIDE_BY_ZERO]: 'Cannot divide by zero',
  [ERROR_CODE.DOMAIN]: 'Result is not a real number',
  [ERROR_CODE.OVERFLOW]: 'Number is too large',
};

export class CalcError extends Error {
  constructor(code) {
    super(ERROR_MESSAGE[code] || 'Invalid expression');
    this.name = 'CalcError';
    this.code = code;
  }
}

const MAX_ENTRY_DIGITS = 15;
const RESULT_PRECISION = 12;

/* --------------------------------------------------------------------------
 * Tokens
 *
 * num      { type: 'num',      value: '12.5' }
 * op       { type: 'op',       value: '+' | '-' | '*' | '/' | '^' }
 * lparen   { type: 'lparen' }
 * rparen   { type: 'rparen' }
 * const    { type: 'const',    value: 'pi' }
 * func     { type: 'func',     value: 'sqrt' }
 * postfix  { type: 'postfix',  value: 'square' | 'reciprocal' | 'percent' }
 * ------------------------------------------------------------------------ */

export const num = (value) => ({ type: 'num', value: String(value) });
export const op = (value) => ({ type: 'op', value });
export const lparen = () => ({ type: 'lparen' });
export const rparen = () => ({ type: 'rparen' });
export const constant = (value) => ({ type: 'const', value });
export const func = (value) => ({ type: 'func', value });
export const postfix = (value) => ({ type: 'postfix', value });

const OPERATOR_SYMBOL = {
  '+': '+',
  '-': '\u2212',
  '*': '\u00d7',
  '/': '\u00f7',
  '^': '^',
};

const FUNCTION_SYMBOL = { sqrt: '\u221a' };
const POSTFIX_SYMBOL = { square: '\u00b2', reciprocal: '\u207b\u00b9', percent: '%' };
const CONSTANT_SYMBOL = { pi: '\u03c0' };

export function operatorSymbol(value) {
  return OPERATOR_SYMBOL[value] || value;
}

/** Groups the integer part of a display string with thousands separators. */
export function groupDigits(text) {
  if (typeof text !== 'string' || text === '') return text;
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [mantissa, exponent] = body.split(/e/i);
  const parts = mantissa.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let out = (negative ? '-' : '') + intPart;
  if (parts.length > 1) out += '.' + parts[1];
  if (exponent !== undefined) out += 'e' + exponent;
  return out;
}

function trimExponential(value) {
  const [mantissaRaw, exponentRaw] = value.toExponential(6).split('e');
  let mantissa = mantissaRaw;
  if (mantissa.includes('.')) mantissa = mantissa.replace(/0+$/, '').replace(/\.$/, '');
  const exponentSign = exponentRaw.startsWith('-') ? '-' : '';
  const exponentDigits = exponentRaw.replace(/^[+-]/, '').replace(/^0+(?=\d)/, '');
  return `${mantissa}e${exponentSign}${exponentDigits}`;
}

/** Formats a computed number the way the display should show it (no grouping). */
export function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Error';
  if (!Number.isFinite(value)) return 'Error';
  let n = value;
  if (Object.is(n, -0)) n = 0;
  const abs = Math.abs(n);
  if (abs === 0) return '0';
  if (abs >= 1e15 || abs < 1e-9) return trimExponential(n);
  const rounded = parseFloat(n.toPrecision(RESULT_PRECISION));
  const text = String(rounded);
  if (text.includes('e') || text.includes('E')) return trimExponential(rounded);
  return text;
}

/** Formats a computed number for display, with thousands separators. */
export function formatNumberForDisplay(value) {
  const formatted = formatNumber(value);
  return formatted === 'Error' ? formatted : groupDigits(formatted);
}

/** Full precision literal used when a result is reused inside an expression. */
export function numberToTokenValue(value) {
  if (Object.is(value, -0)) return '0';
  return String(value);
}

export function tokenText(token) {
  switch (token.type) {
    case 'num':
      return groupDigits(token.value);
    case 'op':
      return operatorSymbol(token.value);
    case 'lparen':
      return '(';
    case 'rparen':
      return ')';
    case 'const':
      return CONSTANT_SYMBOL[token.value] || token.value;
    case 'func':
      return FUNCTION_SYMBOL[token.value] || token.value;
    case 'postfix':
      return POSTFIX_SYMBOL[token.value] || token.value;
    default:
      return '';
  }
}

export function tokensToText(tokens) {
  let out = '';
  let previous = null;
  for (const token of tokens) {
    const text = tokenText(token);
    if (out !== '') {
      const previousIsOpen = previous.type === 'lparen' || previous.type === 'func';
      const isClosed = token.type === 'rparen';
      const isPostfix = token.type === 'postfix';
      if (!previousIsOpen && !isClosed && !isPostfix) out += ' ';
    }
    out += text;
    previous = token;
  }
  return out;
}

/* --------------------------------------------------------------------------
 * Tokenizing plain text (used by tests and by the history re-run feature)
 * ------------------------------------------------------------------------ */

export function tokenizeText(text) {
  const tokens = [];
  let index = 0;
  const input = String(text);

  while (index < input.length) {
    const char = input[index];

    if (char === ' ') {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let literal = '';
      let seenDot = false;
      while (index < input.length && /[0-9.]/.test(input[index])) {
        if (input[index] === '.') {
          if (seenDot) throw new CalcError(ERROR_CODE.SYNTAX);
          seenDot = true;
        }
        literal += input[index];
        index += 1;
      }
      tokens.push(num(literal));
      continue;
    }

    if (char === '+' || char === '\u2212' || char === '-') {
      tokens.push(op(char === '\u2212' ? '-' : char));
      index += 1;
      continue;
    }

    if (char === '*' || char === '\u00d7' || char === 'x' || char === 'X') {
      tokens.push(op('*'));
      index += 1;
      continue;
    }

    if (char === '/' || char === '\u00f7') {
      tokens.push(op('/'));
      index += 1;
      continue;
    }

    if (char === '^') {
      tokens.push(op('^'));
      index += 1;
      continue;
    }

    if (char === '(') {
      tokens.push(lparen());
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push(rparen());
      index += 1;
      continue;
    }

    if (char === '%') {
      tokens.push(postfix('percent'));
      index += 1;
      continue;
    }

    if (char === '\u00b2') {
      tokens.push(postfix('square'));
      index += 1;
      continue;
    }

    if (char === '\u207b' && input[index + 1] === '\u00b9') {
      tokens.push(postfix('reciprocal'));
      index += 2;
      continue;
    }

    if (char === '\u221a') {
      tokens.push(func('sqrt'));
      index += 1;
      continue;
    }

    if (char === '\u03c0') {
      tokens.push(constant('pi'));
      index += 1;
      continue;
    }

    throw new CalcError(ERROR_CODE.SYNTAX);
  }

  return tokens;
}

/* --------------------------------------------------------------------------
 * Token list helpers
 * ------------------------------------------------------------------------ */

/** True when the token ends a value, i.e. a number/`)`/`π`/postfix. */
export function isValueEnd(token) {
  if (!token) return false;
  return token.type === 'num' || token.type === 'rparen' || token.type === 'const' || token.type === 'postfix';
}

export function countUnclosedParens(tokens) {
  let depth = 0;
  for (const token of tokens) {
    if (token.type === 'lparen') depth += 1;
    else if (token.type === 'rparen') depth = Math.max(0, depth - 1);
  }
  return depth;
}

/** Appends the missing closing parens so a preview can be computed mid typing. */
export function autoCloseParens(tokens) {
  const out = tokens.slice();
  const missing = countUnclosedParens(out);
  for (let i = 0; i < missing; i += 1) out.push(rparen());
  return out;
}

/**
 * Removes the incomplete tail (dangling operator / function / open paren) and
 * auto closes whatever is left, so `12 +` evaluates to `12` exactly like most
 * phone calculators do.
 */
export function prepareTokens(tokens) {
  const out = tokens.slice();
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last.type === 'op' || last.type === 'func' || last.type === 'lparen') out.pop();
    else break;
  }
  return autoCloseParens(out);
}

/** Detects a binary operator (a leading unary sign does not count). */
export function hasBinaryOperator(tokens) {
  let seenValue = false;
  for (const token of tokens) {
    if (token.type === 'op') {
      if (!seenValue && (token.value === '+' || token.value === '-')) continue; // unary sign
      if (seenValue) return true;
      continue;
    }
    if (token.type === 'lparen' || token.type === 'func') {
      seenValue = false;
      continue;
    }
    seenValue = true; // num / const / rparen / postfix
  }
  return false;
}

/* --------------------------------------------------------------------------
 * Parser + evaluator
 * ------------------------------------------------------------------------ */

const PERCENT = (value, percent) => ({ value, percent });

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset] || null;
  }

  next() {
    const token = this.tokens[this.index];
    this.index += 1;
    return token || null;
  }

  atEnd() {
    return this.index >= this.tokens.length;
  }

  parse() {
    if (this.tokens.length === 0) throw new CalcError(ERROR_CODE.SYNTAX);
    const node = this.parseExpression();
    if (!this.atEnd()) throw new CalcError(ERROR_CODE.SYNTAX);
    const value = node.value;
    if (Number.isNaN(value)) throw new CalcError(ERROR_CODE.DOMAIN);
    if (!Number.isFinite(value)) throw new CalcError(ERROR_CODE.OVERFLOW);
    return value;
  }

  parseExpression() {
    let left = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (!token || token.type !== 'op' || (token.value !== '+' && token.value !== '-')) break;
      this.next();
      const right = this.parseTerm();
      const base = left.value;
      const amount = right.percent !== null ? (base * right.percent) / 100 : right.value;
      const value = token.value === '+' ? base + amount : base - amount;
      left = PERCENT(value, null);
    }
    return left;
  }

  parseTerm() {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (!token) break;
      let operator = null;
      if (token.type === 'op' && (token.value === '*' || token.value === '/')) {
        operator = this.next().value;
      } else if (this.startsValue(token)) {
        operator = '*'; // implicit multiplication: 2π, 3(4), (1+2)(3+4)
      } else {
        break;
      }
      const right = this.parseUnary();
      if (operator === '*') {
        left = PERCENT(left.value * right.value, null);
      } else {
        if (right.value === 0) throw new CalcError(ERROR_CODE.DIVIDE_BY_ZERO);
        left = PERCENT(left.value / right.value, null);
      }
    }
    return left;
  }

  parseUnary() {
    const token = this.peek();
    if (token && token.type === 'op' && (token.value === '-' || token.value === '+')) {
      this.next();
      const operand = this.parseUnary();
      return PERCENT(token.value === '-' ? -operand.value : operand.value, null);
    }
    if (token && token.type === 'func' && token.value === 'sqrt') {
      this.next();
      const operand = this.parseUnary();
      if (operand.value < 0) throw new CalcError(ERROR_CODE.DOMAIN);
      return PERCENT(Math.sqrt(operand.value), null);
    }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePostfix();
    const token = this.peek();
    if (token && token.type === 'op' && token.value === '^') {
      this.next();
      const exponent = this.parseUnary();
      const value = Math.pow(base.value, exponent.value);
      if (Number.isNaN(value)) throw new CalcError(ERROR_CODE.DOMAIN);
      if (!Number.isFinite(value)) throw new CalcError(ERROR_CODE.OVERFLOW);
      return PERCENT(value, null);
    }
    return base;
  }

  parsePostfix() {
    let node = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (!token || token.type !== 'postfix') break;
      this.next();
      if (token.value === 'percent') {
        node = PERCENT(node.value / 100, node.value);
      } else if (token.value === 'square') {
        const value = node.value * node.value;
        if (!Number.isFinite(value)) throw new CalcError(ERROR_CODE.OVERFLOW);
        node = PERCENT(value, null);
      } else if (token.value === 'reciprocal') {
        if (node.value === 0) throw new CalcError(ERROR_CODE.DIVIDE_BY_ZERO);
        node = PERCENT(1 / node.value, null);
      }
    }
    return node;
  }

  parsePrimary() {
    const token = this.next();
    if (!token) throw new CalcError(ERROR_CODE.SYNTAX);
    if (token.type === 'num') {
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new CalcError(ERROR_CODE.SYNTAX);
      return PERCENT(value, null);
    }
    if (token.type === 'const' && token.value === 'pi') {
      return PERCENT(Math.PI, null);
    }
    if (token.type === 'lparen') {
      const inner = this.parseExpression();
      const close = this.next();
      if (!close || close.type !== 'rparen') throw new CalcError(ERROR_CODE.SYNTAX);
      return PERCENT(inner.value, null);
    }
    throw new CalcError(ERROR_CODE.SYNTAX);
  }

  startsValue(token) {
    if (!token) return false;
    return token.type === 'num' || token.type === 'lparen' || token.type === 'const' || token.type === 'func';
  }
}

/**
 * Evaluates a token list.
 * @returns {{ok: true, value: number} | {ok: false, code: string, message: string}}
 */
export function evaluateTokens(tokens) {
  try {
    const value = new Parser(tokens).parse();
    return { ok: true, value };
  } catch (error) {
    if (error instanceof CalcError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: ERROR_CODE.SYNTAX, message: ERROR_MESSAGE[ERROR_CODE.SYNTAX] };
  }
}

/** Tokenizes + evaluates a plain expression string (nice for tests/snippets). */
export function evaluateText(text) {
  try {
    return evaluateTokens(prepareTokens(tokenizeText(text)));
  } catch (error) {
    if (error instanceof CalcError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: ERROR_CODE.SYNTAX, message: ERROR_MESSAGE[ERROR_CODE.SYNTAX] };
  }
}

/* --------------------------------------------------------------------------
 * Calculator state machine
 * ------------------------------------------------------------------------ */

/**
 * Drives the keypad. The caller only has to read `snapshot()` and render it.
 *
 * tokens    : committed part of the expression
 * entry     : digits of the number currently being typed
 * entryLive : true when the user typed `entry` and it is not committed yet
 * mode      : 'idle' | 'result' | 'error'
 */
export class Calculator {
  constructor(options = {}) {
    this.maxEntryDigits = options.maxEntryDigits || MAX_ENTRY_DIGITS;
    this.onCommit = typeof options.onCommit === 'function' ? options.onCommit : null;
    this.clear();
  }

  /* ---------------------------------------------------------------- state */

  clear() {
    this.tokens = [];
    this.entry = '0';
    this.entryLive = false;
    this.mode = 'idle';
    this.result = null;
    this.lastExpression = '';
    this.errorCode = null;
    this.errorMessage = '';
  }

  isError() {
    return this.mode === 'error';
  }

  /** Tokens that make the current expression (committed + live entry). */
  expressionTokens() {
    const tokens = this.tokens.slice();
    if (this.entryLive) tokens.push(num(this.entry));
    return tokens;
  }

  /** Tokens that should be used to compute the preview / the result. */
  evaluationTokens() {
    return prepareTokens(this.expressionTokens());
  }

  /**
   * Snapshot used by the renderer.
   */
  snapshot() {
    const tokens = this.expressionTokens();
    const expressionText = tokensToText(tokens);

    let entryText;
    if (this.mode === 'error') entryText = 'Error';
    else if (this.mode === 'result') entryText = formatNumberForDisplay(this.result ?? 0);
    else if (this.entryLive) entryText = groupDigits(this.entry);
    else {
      const trailing = this.trailingNumberText();
      entryText = trailing === null ? '0' : trailing;
    }

    let preview = null;
    if (this.mode !== 'error') {
      const prepared = this.evaluationTokens();
      const hasPending = hasBinaryOperator(this.expressionTokens());
      if (hasPending && prepared.length > 0) {
        const outcome = evaluateTokens(prepared);
        if (outcome.ok) {
          preview = {
            ok: true,
            expression: tokensToText(prepared),
            value: formatNumberForDisplay(outcome.value),
          };
        } else if (outcome.code === ERROR_CODE.DIVIDE_BY_ZERO || outcome.code === ERROR_CODE.DOMAIN) {
          preview = { ok: false, message: outcome.message };
        }
      }
    }

    return {
      mode: this.mode,
      expressionText,
      entryText,
      entryIsResult: this.mode === 'result',
      entryIsError: this.mode === 'error',
      errorMessage: this.errorMessage,
      preview,
      activeOperator: this.activeOperator(),
      lastExpression: this.lastExpression,
      canBackspace: tokens.length > 0,
    };
  }

  trailingNumberText() {
    for (let i = this.tokens.length - 1; i >= 0; i -= 1) {
      const token = this.tokens[i];
      if (token.type === 'num') return groupDigits(token.value);
      if (token.type === 'rparen' || token.type === 'postfix') continue;
      break;
    }
    if (this.mode === 'result' && this.result !== null) return formatNumberForDisplay(this.result);
    return null;
  }

  activeOperator() {
    const last = this.tokens[this.tokens.length - 1];
    if (!last || last.type !== 'op') return null;
    if (!this.entryLive && this.mode !== 'result') return last.value;
    return null;
  }

  /* --------------------------------------------------------------- inputs */

  pressDigit(digit) {
    if (!/^[0-9]$/.test(digit)) return;
    if (this.mode === 'error') this.clear();
    if (this.mode === 'result') this.startFreshExpression();

    if (!this.entryLive) {
      this.entry = digit;
      this.entryLive = true;
      return;
    }

    const digitCount = this.entry.replace(/\D/g, '').length;
    if (digitCount >= this.maxEntryDigits) return;

    if (this.entry === '0') this.entry = digit;
    else if (this.entry === '-') this.entry = '-' + digit;
    else this.entry += digit;
  }

  pressDecimal() {
    if (this.mode === 'error') this.clear();
    if (this.mode === 'result') this.startFreshExpression();

    if (!this.entryLive) {
      this.entry = '0.';
      this.entryLive = true;
      return;
    }
    if (this.entry.includes('.')) return;
    this.entry += '.';
  }

  pressOperator(operator) {
    if (!['+', '-', '*', '/'].includes(operator)) return;
    if (this.mode === 'error') this.clear();

    if (this.entryLive) {
      this.commitEntry();
    } else if (this.mode === 'result') {
      this.tokens = [num(numberToTokenValue(this.result ?? 0))];
      this.mode = 'idle';
    }

    const last = this.tokens[this.tokens.length - 1];
    if (last && last.type === 'op') {
      // Pressing two operators in a row swaps the pending one.
      this.tokens[this.tokens.length - 1] = op(operator);
      return;
    }
    if (last && last.type === 'lparen' && operator !== '-') {
      return; // nothing meaningful to do right after "("
    }
    this.tokens.push(op(operator));
  }

  pressEquals() {
    if (this.mode === 'error') {
      this.clear();
      return;
    }

    const tokens = this.evaluationTokens();
    if (tokens.length === 0 || !hasBinaryOperator(tokens)) {
      // A single number has nothing to compute; just surface it as the result.
      if (tokens.length === 1 && tokens[0].type === 'num') {
        this.finishWithValue(Number(tokens[0].value), '');
      }
      return;
    }

    const outcome = evaluateTokens(tokens);
    const expressionText = tokensToText(tokens);

    if (!outcome.ok) {
      this.mode = 'error';
      this.errorCode = outcome.code;
      this.errorMessage = outcome.message;
      this.lastExpression = expressionText + ' =';
      return;
    }

    this.finishWithValue(outcome.value, expressionText);
  }

  finishWithValue(value, expressionText) {
    this.result = value;
    this.tokens = [];
    this.entryLive = false;
    this.entry = numberToTokenValue(value);
    this.mode = 'result';
    this.errorCode = null;
    this.errorMessage = '';
    this.lastExpression = expressionText ? expressionText + ' =' : '';
    if (this.onCommit && expressionText) {
      this.onCommit({ expression: expressionText, result: value });
    }
  }

  pressPercent() {
    if (this.mode === 'error') return;
    if (this.mode === 'result') {
      this.tokens = [num(numberToTokenValue(this.result ?? 0))];
      this.mode = 'idle';
    } else if (this.entryLive) {
      this.commitEntry();
    } else if (!isValueEnd(this.tokens[this.tokens.length - 1])) {
      return;
    }
    this.tokens.push(postfix('percent'));
  }

  pressSquare() {
    if (this.mode === 'error') return;
    if (this.mode === 'result') {
      this.tokens = [num(numberToTokenValue(this.result ?? 0))];
      this.mode = 'idle';
    } else if (this.entryLive) {
      this.commitEntry();
    } else if (!isValueEnd(this.tokens[this.tokens.length - 1])) {
      return;
    }
    this.tokens.push(postfix('square'));
  }

  pressReciprocal() {
    if (this.mode === 'error') return;
    if (this.mode === 'result') {
      this.tokens = [num(numberToTokenValue(this.result ?? 0))];
      this.mode = 'idle';
    } else if (this.entryLive) {
      this.commitEntry();
    } else if (!isValueEnd(this.tokens[this.tokens.length - 1])) {
      return;
    }
    this.tokens.push(postfix('reciprocal'));
  }

  /** Square root applied to the number currently on screen. */
  pressSqrt() {
    if (this.mode === 'error') return;

    if (this.entryLive) {
      const value = Number(this.entry);
      if (value < 0) {
        this.mode = 'error';
        this.errorCode = ERROR_CODE.DOMAIN;
        this.errorMessage = ERROR_MESSAGE[ERROR_CODE.DOMAIN];
        return;
      }
      this.entry = numberToTokenValue(Math.sqrt(value));
      this.entryLive = true;
      return;
    }

    if (this.mode === 'result' && this.result !== null) {
      if (this.result < 0) {
        this.mode = 'error';
        this.errorCode = ERROR_CODE.DOMAIN;
        this.errorMessage = ERROR_MESSAGE[ERROR_CODE.DOMAIN];
        return;
      }
      this.entry = numberToTokenValue(Math.sqrt(this.result));
      this.entryLive = true;
      this.mode = 'idle';
      this.tokens = [];
      return;
    }

    const last = this.tokens[this.tokens.length - 1];
    if (last && last.type === 'num') {
      const value = Number(last.value);
      if (value < 0) {
        this.mode = 'error';
        this.errorCode = ERROR_CODE.DOMAIN;
        this.errorMessage = ERROR_MESSAGE[ERROR_CODE.DOMAIN];
        return;
      }
      this.tokens.pop();
      this.entry = numberToTokenValue(Math.sqrt(value));
      this.entryLive = true;
    }
  }

  pressConstant(name) {
    if (this.mode === 'error') this.clear();
    if (this.mode === 'result') this.startFreshExpression();
    if (this.entryLive) this.commitEntry();
    const last = this.tokens[this.tokens.length - 1];
    if (last && last.type === 'postfix' && last.value === 'percent') return;
    this.tokens.push(constant(name));
  }

  /**
   * Smart parenthesis key: opens a group when a value can not follow, closes it
   * otherwise.
   */
  pressParen() {
    if (this.mode === 'error') this.clear();
    if (this.mode === 'result') this.startFreshExpression();
    if (this.entryLive) this.commitEntry();

    const last = this.tokens[this.tokens.length - 1];
    if (isValueEnd(last)) {
      if (countUnclosedParens(this.tokens) > 0) this.tokens.push(rparen());
      else this.tokens.push(lparen());
      return;
    }
    if (last && last.type === 'lparen') return; // avoid "(("
    this.tokens.push(lparen());
  }

  pressSign() {
    if (this.mode === 'error') return;
    if (this.mode === 'result') {
      this.entry = this.entry.startsWith('-') ? this.entry.slice(1) : '-' + this.entry;
      this.entryLive = true;
      this.mode = 'idle';
      this.tokens = [];
      return;
    }
    if (this.entryLive) {
      this.entry = toggleSignText(this.entry);
      return;
    }
    const last = this.tokens[this.tokens.length - 1];
    if (last && last.type === 'num') {
      this.tokens.pop();
      this.entry = toggleSignText(last.value);
      this.entryLive = true;
    }
  }

  pressBackspace() {
    if (this.mode === 'error') {
      // Step back out of the error instead of nuking the whole expression.
      this.mode = 'idle';
      this.errorCode = null;
      this.errorMessage = '';
      return;
    }
    if (this.mode === 'result') {
      this.startFreshExpression();
      return;
    }
    if (this.entryLive) {
      if (this.entry.length <= 1) {
        this.entry = '0';
        this.entryLive = false;
      } else {
        this.entry = this.entry.slice(0, -1);
        if (this.entry === '-' || this.entry === '') {
          this.entry = '0';
          this.entryLive = false;
        }
      }
      return;
    }
    const last = this.tokens.pop();
    if (last && last.type === 'num') {
      this.entry = last.value;
      this.entryLive = true;
      return;
    }
    const trailing = this.tokens[this.tokens.length - 1];
    if (trailing && trailing.type === 'num') {
      this.tokens.pop();
      this.entry = trailing.value;
      this.entryLive = true;
    }
  }

  /* -------------------------------------------------------------- helpers */

  commitEntry() {
    if (!this.entryLive) return;
    const text = this.entry.endsWith('.') ? this.entry.slice(0, -1) : this.entry;
    this.tokens.push(num(text === '' || text === '-' ? '0' : text));
    this.entry = '0';
    this.entryLive = false;
  }

  startFreshExpression() {
    this.tokens = [];
    this.entry = '0';
    this.entryLive = false;
    this.mode = 'idle';
    this.result = null;
    this.lastExpression = '';
    this.errorCode = null;
    this.errorMessage = '';
  }

  /** Loads a value from the history as the current entry. */
  loadValue(value) {
    this.clear();
    this.entry = numberToTokenValue(value);
    this.entryLive = true;
  }

  /** Restores an expression (used when tapping a history row). */
  loadTokens(tokens) {
    this.clear();
    this.tokens = tokens.slice();
  }
}

export function toggleSignText(text) {
  if (text.startsWith('-')) return text.slice(1) === '' ? '0' : text.slice(1);
  if (text === '0' || text === '') return '0';
  return '-' + text;
}
