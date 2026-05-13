import { describe, it, expect } from 'vitest';
import { isUserDto, isAccountDto } from '../src/validators';

describe('DTO validators', () => {
  it('valid UserDto shape should return true', () => {
    const user: any = { id: 'u1', email: 'a@example.com', firstName: 'Alice', lastName: 'Example' };
    expect(isUserDto(user)).toBe(true);
  });

  it('invalid UserDto shape should return false', () => {
    const bad: any = { id: 123, email: 1 };
    expect(isUserDto(bad)).toBe(false);
  });

  it('valid AccountDto shape should return true', () => {
    const acct: any = { id: 'acc1', name: 'Checking', type: 'checking', balance: 100, currency: 'USD' };
    expect(isAccountDto(acct)).toBe(true);
  });
  it('invalid AccountDto shape should return false', () => {
    const bad: any = { id: 1, name: 2 };
    expect(isAccountDto(bad)).toBe(false);
  });
});
