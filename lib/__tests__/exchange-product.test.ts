import { describe, it, expect } from 'vitest';
import { formatExchangeProduct, parseExchangeList } from '../exchange-product';

describe('parseExchangeList', () => {
  it('parses a JSON string array', () => {
    expect(parseExchangeList('["ยา A","ยา B"]')).toEqual(['ยา A', 'ยา B']);
  });
  it('drops empty entries', () => {
    expect(parseExchangeList('["ยา A",""," "]')).toEqual(['ยา A']);
  });
  it('falls back to raw value when not JSON', () => {
    expect(parseExchangeList('ยา C')).toEqual(['ยา C']);
  });
  it('returns [] for null / empty', () => {
    expect(parseExchangeList(null)).toEqual([]);
    expect(parseExchangeList('')).toEqual([]);
  });
});

describe('formatExchangeProduct', () => {
  it('joins the picked original items for type "รายการเดิม"', () => {
    expect(
      formatExchangeProduct({
        exchange_product_type: 'รายการเดิม',
        exchange_product_list: '["ยา A","ยา B"]',
        exchange_product_other: null,
      }),
    ).toBe('ยา A, ยา B');
  });

  it('uses the free-text "other" value for non-"รายการเดิม" types', () => {
    expect(
      formatExchangeProduct({
        exchange_product_type: 'อื่นๆ',
        exchange_product_list: null,
        exchange_product_other: 'ยาชนิดใหม่ 500mg',
      }),
    ).toBe('ยาชนิดใหม่ 500mg');
  });

  it('returns "" when it is not an exchange request', () => {
    expect(
      formatExchangeProduct({ exchange_product_type: null, exchange_product_list: null, exchange_product_other: null }),
    ).toBe('');
  });

  it('falls back to the type label when list is empty', () => {
    expect(
      formatExchangeProduct({ exchange_product_type: 'รายการเดิม', exchange_product_list: '[]', exchange_product_other: null }),
    ).toBe('รายการเดิม');
  });
});
