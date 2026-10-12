import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Calculator,
  ERROR_CODE,
  evaluateText,
  formatNumber,
  groupDigits,
  prepareTokens,
  tokenizeText,
  tokensToText,
} from '../src/js/engine.js';

const value = (text) => {
  const result = evaluateText(text);
  assert.equal(result.ok, true, `expected "${text}" to evaluate`);
  return result.value;
};

const code = (text) => {
  const result = evaluateText(text);
  assert.equal(result.ok, false, `expected "${text}" to fail`);
  return result.code;
};

test('formatNumber trims binary float noise', () => {
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
  assert.equal(formatNumber(1 / 3), '0.333333333333');
  assert.equal(formatNumber(2 / 3), '0.666666666667');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(42), '42');
});

test('formatNumber switches to exponential notation for extreme values', () => {
  assert.equal(formatNumber(1e16), '1e16');
  assert.equal(formatNumber(1.5e16), '1.5e16');
  assert.equal(formatNumber(1e-10), '1e-10');
  assert.equal(formatNumber(Infinity), 'Error');
});

test('groupDigits adds thousands separators', () => {
  assert.equal(groupDigits('1234567'), '1,234,567');
  assert.equal(groupDigits('-1234.5'), '-1,234.5');
  assert.equal(groupDigits('12.'), '12.');
  assert.equal(groupDigits('1.5e16'), '1.5e16');
});

test('evaluateText respects operator precedence', () => {
  assert.equal(value('2+3*4'), 14);
  assert.equal(value('2+3\u00d74'), 14);
  assert.equal(value('12+5'), 17);
  assert.equal(value('100-40-10'), 50);
  assert.equal(value('2^3^2'), 512);
  assert.equal(value('-2^2'), -4);
  assert.equal(value('2^-1'), 0.5);
});

test('evaluateText supports parentheses and implicit multiplication', () => {
  assert.equal(value('(2+3)*4'), 20);
  assert.equal(value('2(3+4)'), 14);
  assert.equal(value('(1+2)(3+4)'), 21);
  assert.equal(value('2\u03c0'), Math.PI * 2);
});

test('evaluateText resolves percent the way phone calculators do', () => {
  assert.equal(value('50%'), 0.5);
  assert.equal(value('50+10%'), 55);
  assert.equal(value('50-10%'), 45);
  assert.equal(value('200*10%'), 20);
  assert.equal(value('200/10%'), 2000);
});

test('evaluateText supports sqrt, square and reciprocal', () => {
  assert.equal(value('\u221a9'), 3);
  assert.equal(value('\u221a(9+7)'), 4);
  assert.equal(value('5\u00b2'), 25);
  assert.equal(value('4\u207b\u00b9'), 0.25);
});

test('evaluateText reports math errors', () => {
  assert.equal(code('1/0'), ERROR_CODE.DIVIDE_BY_ZERO);
  assert.equal(code('0\u207b\u00b9'), ERROR_CODE.DIVIDE_BY_ZERO);
  assert.equal(code('\u221a(-4)'), ERROR_CODE.DOMAIN);
  assert.equal(code('('), ERROR_CODE.SYNTAX);
});

test('prepareTokens drops the incomplete tail and closes open parens', () => {
  const tokens = tokenizeText('12+');
  assert.equal(tokensToText(prepareTokens(tokens)), '12');
  assert.equal(tokensToText(prepareTokens(tokenizeText('2*(3+4'))), '2 \u00d7 (3 + 4)');
  assert.equal(tokensToText(prepareTokens(tokenizeText('5+('))), '5');
});

const NORMALIZED_OPS = { '\u00d7': '*', '\u00f7': '/', '\u2212': '-' };

const press = (calculator, keys) => {
  for (const rawKey of keys) {
    const key = NORMALIZED_OPS[rawKey] || rawKey;
    if (/^[0-9]$/.test(key)) calculator.pressDigit(key);
    else if (key === '.') calculator.pressDecimal();
    else if (['+', '-', '*', '/'].includes(key)) calculator.pressOperator(key);
    else if (key === '=') calculator.pressEquals();
    else if (key === 'C') calculator.clear();
    else if (key === '<') calculator.pressBackspace();
    else if (key === '%') calculator.pressPercent();
    else if (key === 's') calculator.pressSign();
    else if (key === '(' || key === ')') calculator.pressParen();
    else if (key === '\u00b2') calculator.pressSquare();
    else if (key === '\u221a') calculator.pressSqrt();
    else if (key === '\u03c0') calculator.pressConstant('pi');
    else throw new Error(`unknown key ${key}`);
  }
};

test('calculator shows a live preview while the expression is typed', () => {
  const calculator = new Calculator();
  press(calculator, ['1', '2']);
  assert.equal(calculator.snapshot().preview, null, 'a single number has no preview');

  press(calculator, ['+', '5']);
  let snapshot = calculator.snapshot();
  assert.equal(snapshot.expressionText, '12 + 5');
  assert.equal(snapshot.preview.ok, true);
  assert.equal(snapshot.preview.value, '17');
  assert.equal(snapshot.preview.expression, '12 + 5');
  assert.equal(snapshot.entryText, '5');

  press(calculator, ['\u00d7', '2']);
  snapshot = calculator.snapshot();
  assert.equal(snapshot.preview.value, '22', 'precedence is respected in the preview');

  press(calculator, ['<']);
  assert.equal(calculator.snapshot().preview.value, '17');
});

test('calculator preview keeps working with a dangling operator', () => {
  const calculator = new Calculator();
  press(calculator, ['9', '+']);
  const snapshot = calculator.snapshot();
  assert.equal(snapshot.preview.value, '9');
  assert.equal(snapshot.expressionText, '9 +');
});

test('calculator equals commits the result and reports it once', () => {
  const committed = [];
  const calculator = new Calculator({ onCommit: (entry) => committed.push(entry) });
  press(calculator, ['1', '2', '+', '5', '=']);

  const snapshot = calculator.snapshot();
  assert.equal(snapshot.entryText, '17');
  assert.equal(snapshot.mode, 'result');
  assert.equal(snapshot.entryIsResult, true);
  assert.equal(snapshot.preview, null);
  assert.equal(snapshot.lastExpression, '12 + 5 =');
  assert.equal(committed.length, 1);
  assert.equal(committed[0].expression, '12 + 5');
  assert.equal(committed[0].result, 17);
});

test('digits after equals start a new expression, operators continue it', () => {
  const calculator = new Calculator();
  press(calculator, ['2', '+', '3', '=']);
  press(calculator, ['\u00d7', '2']);
  assert.equal(calculator.snapshot().preview.value, '10');

  press(calculator, ['=']);
  press(calculator, ['7']);
  assert.equal(calculator.snapshot().entryText, '7');
  assert.equal(calculator.snapshot().expressionText, '7');
  assert.equal(calculator.snapshot().lastExpression, '');
});

test('backspace edits the entry, then unwinds the expression', () => {
  const calculator = new Calculator();
  press(calculator, ['1', '2', '3']);
  press(calculator, ['<', '<']);
  assert.equal(calculator.snapshot().entryText, '1');

  press(calculator, ['+', '4']);
  press(calculator, ['<', '<']);
  // the operator is gone and the value is editable again
  assert.equal(calculator.snapshot().expressionText, '1');
  assert.equal(calculator.snapshot().entryText, '1');
  assert.equal(calculator.tokens.length, 0);
});

test('percent key uses the accumulated value for + and -', () => {
  const calculator = new Calculator();
  press(calculator, ['2', '0', '0', '+', '1', '0', '%', '=']);
  assert.equal(calculator.snapshot().entryText, '220');
});

test('smart parenthesis key opens and closes groups', () => {
  const calculator = new Calculator();
  press(calculator, ['2', '\u00d7', '(', '3', '+', '4', ')']);
  assert.equal(calculator.snapshot().preview.value, '14');
  press(calculator, ['=']);
  assert.equal(calculator.snapshot().entryText, '14');
});

test('square root applies to the number on screen', () => {
  const calculator = new Calculator();
  press(calculator, ['9', '\u221a']);
  assert.equal(calculator.snapshot().entryText, '3');
});

test('division by zero surfaces an error and backspace recovers', () => {
  const calculator = new Calculator();
  press(calculator, ['8', '/', '0', '=']);
  assert.equal(calculator.snapshot().entryIsError, true);
  assert.equal(calculator.snapshot().errorMessage, 'Cannot divide by zero');
  press(calculator, ['=']);
  assert.equal(calculator.snapshot().entryText, '0');

  const other = new Calculator();
  press(other, ['8', '/', '0', '=']);
  press(other, ['<']);
  assert.equal(other.snapshot().entryIsError, false);
  assert.equal(other.snapshot().expressionText, '8 \u00f7 0');
});

test('preview flags a division by zero before equals is pressed', () => {
  const calculator = new Calculator();
  press(calculator, ['8', '/', '0']);
  const preview = calculator.snapshot().preview;
  assert.equal(preview.ok, false);
  assert.equal(preview.message, 'Cannot divide by zero');
});

test('pressing an operator twice swaps it', () => {
  const calculator = new Calculator();
  press(calculator, ['5', '+', '\u00d7', '3', '=']);
  assert.equal(calculator.snapshot().entryText, '15');
});

test('sign toggle flips the live entry', () => {
  const calculator = new Calculator();
  press(calculator, ['4', '2', 's']);
  assert.equal(calculator.snapshot().entryText, '-42');
  press(calculator, ['s']);
  assert.equal(calculator.snapshot().entryText, '42');
});

test('clear resets everything', () => {
  const calculator = new Calculator();
  press(calculator, ['1', '2', '+', '8']);
  press(calculator, ['C']);
  const snapshot = calculator.snapshot();
  assert.equal(snapshot.entryText, '0');
  assert.equal(snapshot.expressionText, '');
  assert.equal(snapshot.preview, null);
});
