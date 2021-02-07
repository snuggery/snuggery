import {cpus} from 'os';

import {calculate} from '../calculator';

describe('combine: parallel calculation', () => {
  const numberOfCpus = cpus().length;

  it('should return numbers', () => {
    expect(calculate(10)).toBe(10);
    expect(calculate(20)).toBe(20);

    expect(calculate('117')).toBe(117);
    expect(calculate('23')).toBe(23);
  });

  it('should perform calculations', () => {
    expect(calculate('10 + 20')).toBe(30);
    expect(calculate('10 - 20')).toBe(-10);
    expect(calculate('10 * 20')).toBe(200);
    expect(calculate('10 / 20')).toBe(0.5);

    expect(calculate('10 + (20 / 2)')).toBe(20);
    expect(calculate('(10 + 20) / 2')).toBe(15);
  });

  it('should have a cpuCount constant', () => {
    expect(calculate('cpuCount')).toBe(numberOfCpus);

    expect(calculate('cpuCount - 2')).toBe(numberOfCpus - 2);
    expect(calculate('cpuCount / 2 - 1')).toBe(numberOfCpus / 2 - 1);
  });
});
